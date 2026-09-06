import {
  effectiveMaxFileSize,
  isProviderCapped,
  VIDEO_INPUT_FORMATS,
  type VideoInputFormat,
} from '@/config/compress';
import { apiResponse } from '@/lib/api-response';
import { formatBytes, resolveRequester } from '@/lib/compress/quota';
import {
  buildStagingKey,
  createStagingUploadUrl,
  isStagingEnabled,
} from '@/lib/compress/staging';
import { getExtension } from '@/lib/freeconvert/presets';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  contentType: z.string().min(1).max(120).default('application/octet-stream'),
});

/**
 * Fallback path: hand the browser a presigned PUT so it can stage the file in
 * our own bucket, then pass the object back to `POST /api/compress/jobs` as
 * `stagingKey`. Only used when the direct provider upload is blocked.
 */
export async function POST(req: Request) {
  if (!isStagingEnabled()) {
    return apiResponse.error('Staging storage is not configured', 501);
  }

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

  const { filename, fileSize, contentType } = parsed.data;

  const inputFormat = getExtension(filename) as VideoInputFormat;
  if (!inputFormat || !VIDEO_INPUT_FORMATS.includes(inputFormat)) {
    return apiResponse.badRequest('Unsupported file type');
  }

  const requester = await resolveRequester(req);
  const maxFileSize = effectiveMaxFileSize(requester.tier);
  if (fileSize > maxFileSize) {
    return apiResponse.error(
      isProviderCapped(requester.tier)
        ? `Files are currently capped at ${formatBytes(maxFileSize)}. We are raising this soon — email us if you need more.`
        : `File is larger than the ${formatBytes(maxFileSize)} limit for your plan`,
      413
    );
  }

  const key = buildStagingKey(filename);
  const url = await createStagingUploadUrl({ key, contentType });

  return apiResponse.success({ key, url, contentType });
}
