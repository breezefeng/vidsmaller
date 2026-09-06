import {
  effectiveMaxFileSize,
  estimateCredits,
  estimateProviderMinutes,
  isProviderCapped,
  VIDEO_INPUT_FORMATS,
  type VideoInputFormat,
} from '@/config/compress';
import { apiResponse } from '@/lib/api-response';
import {
  budgetResetsAt,
  releaseFreeBudget,
  reserveFreeBudget,
} from '@/lib/compress/budget';
import {
  chargeCredits,
  InsufficientCreditsError,
} from '@/lib/compress/credits';
import {
  checkAnonymousDailyQuota,
  checkUserBurstQuota,
  formatBytes,
  resolveRequester,
} from '@/lib/compress/quota';
import { toJobView } from '@/lib/compress/service';
import {
  createStagingDownloadUrl,
  isStagingEnabled,
} from '@/lib/compress/staging';
import { db } from '@/lib/db';
import { compressionJobs as jobsSchema } from '@/lib/db/schema';
import {
  createJob,
  FreeConvertError,
  getUploadForm,
} from '@/lib/freeconvert/client';
import {
  buildCompressJob,
  buildOutputFilename,
  compressSettingsSchema,
  getExtension,
  TASK_IMPORT,
} from '@/lib/freeconvert/presets';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  durationSeconds: z.number().nonnegative().max(60 * 60 * 24).nullish(),
  settings: compressSettingsSchema,
  /**
   * Set only by the fallback flow: the object the browser already staged in
   * our bucket. When present the provider pulls the file itself and no
   * browser upload target is returned.
   */
  stagingKey: z.string().min(1).max(300).optional(),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiResponse.badRequest('Invalid JSON body');
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiResponse.badRequest(
      parsed.error.issues[0]?.message ?? 'Invalid request'
    );
  }

  const { filename, fileSize, durationSeconds, settings, stagingKey } =
    parsed.data;

  const requester = await resolveRequester(req);
  const { limits, tier } = requester;

  /* ---------------- validation ---------------- */

  const inputFormat = getExtension(filename) as VideoInputFormat;
  if (!inputFormat || !VIDEO_INPUT_FORMATS.includes(inputFormat)) {
    return apiResponse.badRequest(
      `Unsupported file type${inputFormat ? `: .${inputFormat}` : ''}`
    );
  }

  const maxFileSize = effectiveMaxFileSize(tier);
  if (fileSize > maxFileSize) {
    return apiResponse.error(
      isProviderCapped(tier)
        ? `Files are currently capped at ${formatBytes(maxFileSize)}. We are raising this soon — email us if you need more.`
        : `File is larger than the ${formatBytes(maxFileSize)} limit for your plan`,
      413
    );
  }

  if (!limits.allowAdvancedCodecs && settings.codec !== 'libx264') {
    return apiResponse.forbidden(
      'H.265 / AV1 encoding is available on paid plans'
    );
  }

  /* ---------------- quota ---------------- */

  if (!requester.userId) {
    const { allowed } = await checkAnonymousDailyQuota(req);
    if (!allowed) {
      return apiResponse.error(
        'Free daily limit reached. Sign in to keep compressing.',
        429
      );
    }
  } else {
    const ok = await checkUserBurstQuota(requester.userId);
    if (!ok) {
      return apiResponse.error('Too many jobs, please slow down.', 429);
    }
  }

  /* ---------------- provider pool budget ---------------- */

  /**
   * Conversion minutes are one pool shared by the whole account, so anonymous
   * work draws from a ring-fenced slice of it and can never break a paying
   * customer mid-month.
   *
   * Signed-in users are *not* gated here, whatever their tier. Their credit
   * balance is already the bound — a free-tier account gets a fixed monthly
   * grant and cannot exceed it. Including them here meant a user could hold
   * 30 credits, watch the UI say so, and still be told "try again tomorrow"
   * by an invisible account-wide pool. Granted credits have to be spendable.
   *
   * This also makes the two counters agree: reservations and
   * `recordProviderMinutes(..., { free: !userId })` now mean the same thing
   * by "free", which they did not before.
   */
  const isFreeTraffic = !requester.userId;
  const providerMinutes = estimateProviderMinutes({
    durationSeconds: durationSeconds ?? null,
    fileSizeBytes: fileSize,
    codec: settings.codec,
    // Direct uploads are metered at the visitor's uplink and cost far more.
    staged: Boolean(stagingKey),
  });

  let budgetReserved = 0;
  let budgetDayKey: string | null = null;
  if (isFreeTraffic) {
    const budget = await reserveFreeBudget(providerMinutes);
    if (!budget.allowed) {
      const resetsAt = budgetResetsAt();
      const hours = Math.max(
        1,
        Math.round((resetsAt.getTime() - Date.now()) / 3_600_000)
      );
      return apiResponse.error(
        `Free compressions without an account are used up for today — capacity resets in about ${hours}h. Sign in to use your own credits instead.`,
        429
      );
    }
    budgetReserved = providerMinutes;
    budgetDayKey = budget.day;
  }

  /** Hand the reservation back on any path that never reaches the provider. */
  const refundBudget = async () => {
    if (budgetReserved > 0) {
      await releaseFreeBudget(budgetReserved, budgetDayKey ?? undefined);
      budgetReserved = 0;
    }
  };

  /* ---------------- credits ---------------- */

  /**
   * Deliberately not `providerMinutes` from above: that one carries the real
   * `staged` flag because it guards our upstream bill, while the price the
   * user pays must not swing on whether staging happened to be configured.
   * `estimateCredits` always prices the staged path.
   */
  const credits = requester.userId
    ? estimateCredits({
        durationSeconds: durationSeconds ?? null,
        fileSizeBytes: fileSize,
        codec: settings.codec,
      })
    : 0;

  if (requester.userId && credits > requester.credits) {
    await refundBudget();
    return apiResponse.error(
      `Not enough credits: this video needs ${credits}, you have ${requester.credits}.`,
      402
    );
  }

  /* ---------------- provider job ---------------- */

  const outputFilename = buildOutputFilename(filename, settings.outputFormat);

  let importUrl: string | undefined;
  if (stagingKey) {
    if (!isStagingEnabled()) {
      await refundBudget();
      return apiResponse.error('Staging storage is not configured', 501);
    }
    if (!stagingKey.startsWith('compress-input/')) {
      await refundBudget();
      return apiResponse.badRequest('Invalid staging key');
    }
    importUrl = await createStagingDownloadUrl({ key: stagingKey });
  }

  let providerJob;
  try {
    providerJob = await createJob(
      buildCompressJob({
        inputFormat,
        outputFilename,
        settings,
        tag: `vidsmaller:${tier}`,
        importUrl,
      })
    );
  } catch (err) {
    console.error('[compress] createJob failed', err);
    await refundBudget();

    // 402 means *our* upstream plan is out of capacity, not that the user did
    // anything wrong. Telling them to "try a different preset" would send them
    // round a loop that can never succeed.
    const isQuota =
      err instanceof FreeConvertError &&
      (err.status === 402 ||
        String(err.code ?? '').includes('limit_exceeds') ||
        /limit exceeded/i.test(err.message));

    if (isQuota) {
      console.error('[compress] PROVIDER CAPACITY EXHAUSTED — upgrade the plan');
      return apiResponse.error(
        'We are at capacity right now. Please try again shortly — we have been notified.',
        503
      );
    }

    // Never leak provider/config internals to the browser.
    const isClientFixable =
      err instanceof FreeConvertError && err.status >= 400 && err.status < 500;
    return apiResponse.error(
      isClientFixable
        ? 'The compression service rejected these settings. Try a different preset.'
        : 'The compression service is unavailable right now. Please try again in a moment.',
      502
    );
  }

  let uploadForm: { url: string; parameters: Record<string, string> } | null =
    null;
  if (!importUrl) {
    try {
      uploadForm = getUploadForm(providerJob, TASK_IMPORT);
    } catch (err) {
      console.error('[compress] missing upload form', err);
      await refundBudget();
      return apiResponse.error(
        'Compression service returned no upload target',
        502
      );
    }
  }

  /* ---------------- charge + persist ---------------- */

  if (requester.userId && credits > 0) {
    try {
      await chargeCredits(
        requester.userId,
        credits,
        `Video compression: ${filename}`
      );
    } catch (err) {
      // The browser never uploads after an error here, so the provider job
      // dies unprocessed and burns no conversion minutes — hand the
      // reservation back.
      await refundBudget();
      if (err instanceof InsufficientCreditsError) {
        return apiResponse.error('Not enough credits', 402);
      }
      console.error('[compress] charge failed', err);
      return apiResponse.serverError('Could not reserve credits');
    }
  }

  const [row] = await db
    .insert(jobsSchema)
    .values({
      userId: requester.userId,
      anonKey: requester.userId ? null : requester.anonKey,
      providerJobId: providerJob.id,
      status: importUrl ? 'queued' : 'awaiting_upload',
      originalFilename: filename,
      outputFilename,
      inputFormat,
      outputFormat: settings.outputFormat,
      inputSize: String(fileSize),
      durationSeconds:
        durationSeconds && durationSeconds > 0
          ? String(Math.round(durationSeconds * 1000) / 1000)
          : null,
      settings: {
        ...settings,
        stagingKey: stagingKey ?? null,
        estimatedProviderMinutes: Math.round(providerMinutes * 1000) / 1000,
        // Only set when the pool was actually charged, and which bucket it
        // hit — a job created at 23:59 must settle against yesterday.
        budgetReservedMinutes: budgetReserved || null,
        budgetDay: budgetDayKey,
      },
      creditsCharged: credits,
    })
    .returning();

  return apiResponse.success({
    job: toJobView(row),
    upload: uploadForm
      ? { url: uploadForm.url, parameters: uploadForm.parameters ?? {} }
      : null,
    creditsCharged: credits,
  });
}
