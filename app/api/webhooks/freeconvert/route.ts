import { apiResponse } from '@/lib/api-response';
import { syncJob } from '@/lib/compress/service';
import { db } from '@/lib/db';
import { compressionJobs as jobsSchema } from '@/lib/db/schema';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.FREECONVERT_WEBHOOK_SECRET;

  // No secret configured -> refuse, so a misconfigured deploy can't be spoofed.
  if (!secret) {
    console.error('[freeconvert-webhook] FREECONVERT_WEBHOOK_SECRET is not set');
    return false;
  }
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('freeconvert-signature');

  if (!verifySignature(raw, signature)) {
    return apiResponse.unauthorized('Invalid signature');
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return apiResponse.badRequest('Invalid JSON');
  }

  // Payload is the Job object (possibly wrapped).
  const providerJobId: string | undefined =
    payload?.id ?? payload?.job?.id ?? payload?.data?.id;

  if (!providerJobId) {
    return apiResponse.success({ ignored: true });
  }

  const rows = await db
    .select()
    .from(jobsSchema)
    .where(eq(jobsSchema.providerJobId, providerJobId))
    .limit(1);

  const job = rows[0];
  if (!job) {
    return apiResponse.success({ ignored: true });
  }

  try {
    await syncJob(job);
  } catch (err) {
    console.error('[freeconvert-webhook] sync failed', providerJobId, err);
    return apiResponse.serverError('Sync failed');
  }

  return apiResponse.success({ ok: true });
}
