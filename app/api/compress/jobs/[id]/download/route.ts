import { apiResponse } from '@/lib/api-response';
import { resolveRequester } from '@/lib/compress/quota';
import { findJobForRequester, syncJob } from '@/lib/compress/service';
import { createOutputDownloadUrl } from '@/lib/compress/staging';

export const runtime = 'nodejs';

/**
 * Streaming the file through this function costs double bandwidth (in + out)
 * and blows past the serverless execution limit on large videos, so the default
 * is a redirect to the provider's short-lived URL.
 *
 * Set COMPRESS_PROXY_DOWNLOADS=true when running somewhere without those
 * constraints and you would rather never expose the upstream host — and raise
 * maxDuration below, since proxying a large file takes far longer than a 302.
 */
const PROXY_DOWNLOADS = process.env.COMPRESS_PROXY_DOWNLOADS === 'true';

// Route segment config must be a static literal; Next cannot analyse an
// expression here. 60s is the Vercel Hobby ceiling and is ample for a redirect.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

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

  // Ownership has been verified above; hand the transfer to whoever holds the
  // bytes. `r2:<key>` means the provider wrote straight into our bucket and we
  // sign a short-lived URL; anything else is a legacy provider URL.
  if (synced.downloadUrl.startsWith('r2:')) {
    const key = synced.downloadUrl.slice(3);
    const signed = await createOutputDownloadUrl({
      key,
      filename: synced.outputFilename,
    });
    return Response.redirect(signed, 302);
  }

  if (!PROXY_DOWNLOADS) {
    return Response.redirect(synced.downloadUrl, 302);
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
