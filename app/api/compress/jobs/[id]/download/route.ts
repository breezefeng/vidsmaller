import { apiResponse } from '@/lib/api-response';
import { resolveRequester } from '@/lib/compress/quota';
import { findJobForRequester, syncJob } from '@/lib/compress/service';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Streams the finished file through our own domain so the user never sees the
 * upstream provider, and so the filename / headers are under our control.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;

  const requester = await resolveRequester(req);
  const job = await findJobForRequester(id, requester);
  if (!job) return apiResponse.notFound('Job not found');

  const synced = await syncJob(job);

  if (synced.status !== 'completed' || !synced.downloadUrl) {
    return apiResponse.error('File is not ready yet', 409);
  }

  if (
    synced.downloadExpiresAt &&
    synced.downloadExpiresAt.getTime() < Date.now()
  ) {
    return apiResponse.error('Download link has expired', 410);
  }

  const range = req.headers.get('range');

  const upstream = await fetch(synced.downloadUrl, {
    cache: 'no-store',
    headers: range ? { Range: range } : undefined,
  });

  if (!upstream.ok || !upstream.body) {
    return apiResponse.error('Upstream file is no longer available', 502);
  }

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') || 'application/octet-stream'
  );
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers.set('Content-Range', contentRange);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, no-store');
  headers.set(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(synced.outputFilename)}"; filename*=UTF-8''${encodeURIComponent(synced.outputFilename)}`
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
