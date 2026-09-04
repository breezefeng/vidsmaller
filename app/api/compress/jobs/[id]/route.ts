import { apiResponse } from '@/lib/api-response';
import { resolveRequester } from '@/lib/compress/quota';
import { findJobForRequester, syncJob, toJobView } from '@/lib/compress/service';
import { db } from '@/lib/db';
import { compressionJobs as jobsSchema } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;

  const requester = await resolveRequester(req);
  const job = await findJobForRequester(id, requester);
  if (!job) return apiResponse.notFound('Job not found');

  const synced = await syncJob(job);
  return apiResponse.success({ job: toJobView(synced) });
}

/**
 * The browser calls this right after the file finishes uploading so we can
 * flip the row out of `awaiting_upload` without waiting for the next poll.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  const requester = await resolveRequester(req);
  const job = await findJobForRequester(id, requester);
  if (!job) return apiResponse.notFound('Job not found');

  if (job.status === 'awaiting_upload') {
    await db
      .update(jobsSchema)
      .set({ status: 'queued', progress: 10 })
      .where(eq(jobsSchema.id, job.id));
  }

  const fresh = await db
    .select()
    .from(jobsSchema)
    .where(eq(jobsSchema.id, job.id))
    .limit(1);

  const synced = await syncJob(fresh[0]);
  return apiResponse.success({ job: toJobView(synced) });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;

  const requester = await resolveRequester(req);
  const job = await findJobForRequester(id, requester);
  if (!job) return apiResponse.notFound('Job not found');

  await db.delete(jobsSchema).where(eq(jobsSchema.id, job.id));
  return apiResponse.success({ deleted: true });
}
