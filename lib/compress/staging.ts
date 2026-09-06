import 'server-only';

import { createR2Client } from '@/lib/cloudflare/r2-client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * Optional staging bucket.
 *
 * This is now the *default* upload path, not a fallback.
 *
 * The provider meters its `import` task by wall clock, so uploading the
 * browser's file straight to it bills us for the visitor's uplink — the same
 * 600 MB file costs 1 conversion minute at 10 MB/s and 10 at 1 MB/s. Staging
 * in our own bucket and letting the provider pull server-to-server moves that
 * time off their meter entirely, and cuts a typical job from 6 billed minutes
 * to 4. See docs/freeconvert-benchmark.md §7.
 *
 * It also enables "recompress with different settings" without a re-upload.
 */

export const STAGING_PREFIX = 'compress-input';
export const OUTPUT_PREFIX = 'compress-output';

export function isStagingEnabled(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );
}

function bucket(): string {
  const name = process.env.R2_BUCKET_NAME;
  if (!name) throw new Error('R2_BUCKET_NAME is not configured');
  return name;
}

export function buildStagingKey(filename: string): string {
  const ext = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
    : 'bin';
  const day = new Date().toISOString().slice(0, 10);
  return `${STAGING_PREFIX}/${day}/${randomUUID()}.${ext.replace(/[^a-z0-9]/g, '')}`;
}

/** Presigned PUT so the browser can upload without the file touching us. */
export async function createStagingUploadUrl(input: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const client = createR2Client();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket(),
      Key: input.key,
      ContentType: input.contentType,
    }),
    { expiresIn: input.expiresIn ?? 60 * 60 }
  );
}

/**
 * URL handed to the provider's `import/url` task.
 *
 * Prefers the R2 custom domain over a presigned URL. Presigned URLs do not
 * survive third-party HTTP clients: the AWS SDK signs non-standard query
 * params (`x-id`, `x-amz-checksum-mode`) and dropping *any* of them yields
 * `SignatureDoesNotMatch`. FreeConvert normalises the URL and strips them, so
 * every staged import failed with 403 (verified 2026-09-06).
 *
 * The custom domain has nothing to break, is served from Cloudflare's edge
 * (so the provider's metered `import` task finishes faster), and costs no
 * egress.
 *
 * Confidentiality rests on the key being unguessable — `buildStagingKey` uses
 * a v4 UUID (122 bits) — plus deletion as soon as the job reaches a terminal
 * state. Add an R2 lifecycle rule expiring `compress-input/` after one day as
 * a backstop for jobs that never finish.
 */
export async function createStagingDownloadUrl(input: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');
  if (publicBase) {
    return `${publicBase}/${input.key}`;
  }

  // No custom domain configured: fall back to a presigned URL and hope the
  // consumer leaves the query string alone.
  const client = createR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket(), Key: input.key }),
    { expiresIn: input.expiresIn ?? 60 * 60 * 6 }
  );
}

export async function deleteStagedObject(key: string): Promise<void> {
  if (!isStagingEnabled()) return;
  try {
    const client = createR2Client();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket(), Key: key })
    );
  } catch (err) {
    console.error('[compress] failed to delete staged object', key, err);
  }
}


/* ------------------------------------------------------------------ */
/* Output side                                                         */
/* ------------------------------------------------------------------ */

/**
 * Where the provider writes the finished file.
 *
 * The provider's own `export/url` hands back a URL on the single box that ran
 * the job — `serverNN-*.freeconvert.com`, plain nginx, no CDN anywhere in
 * front of it. Measured throughput fell off a cliff with distance: ~28 MB/s
 * from a runner in the same city as that box, ~2.5 MB/s from Wyoming, and
 * ~0.5 MB/s from China. A user reported 170 KB/s on a 178 MB file, which is a
 * seventeen-minute download of a file we had already finished making.
 *
 * `export/s3` accepts a custom endpoint, and R2 is S3-compatible, so the
 * provider can write straight into our bucket server-to-server. Nothing
 * transits our own functions, so there is no execution limit and no bandwidth
 * bill for the relay we would otherwise have had to build.
 */
export function buildOutputKey(filename: string): string {
  const ext = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
    : 'bin';
  const day = new Date().toISOString().slice(0, 10);
  return `${OUTPUT_PREFIX}/${day}/${randomUUID()}.${ext.replace(/[^a-z0-9]/g, '')}`;
}

/**
 * A short-lived signed URL for the finished file.
 *
 * Deliberately NOT the public `cdn.vidsmaller.com` domain. That domain is
 * cached at the edge with `max-age=14400`, so an object deleted from R2 stays
 * retrievable for another four hours — and we tell users that anonymous
 * results expire after two. The promise would have been false at the edge
 * while looking true in the bucket.
 *
 * The signed endpoint is still Cloudflare's network, so the reason we moved
 * off the provider's origin survives: measured against a cold (uncached)
 * request on the public domain, signed URLs came out the same within noise.
 * We only give up a cache hit that real users never get anyway, because each
 * output is downloaded once.
 */
export async function createOutputDownloadUrl(input: {
  key: string;
  filename: string;
  expiresIn?: number;
}): Promise<string> {
  const client = createR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket(),
      Key: input.key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.filename)}`,
    }),
    { expiresIn: input.expiresIn ?? 60 * 60 }
  );
}

export async function deleteOutputObject(key: string): Promise<void> {
  return deleteStagedObject(key);
}
