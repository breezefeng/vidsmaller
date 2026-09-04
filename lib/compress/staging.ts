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
 * The default flow uploads the browser's file *straight* to the compression
 * provider, so VidSmaller needs no object storage at all. This module is the
 * fallback for the one case where that cannot work — a browser/CORS or
 * corporate-proxy failure — and for "recompress with different settings"
 * without asking the user to upload again.
 */

export const STAGING_PREFIX = 'compress-input';

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
 * Presigned GET handed to the provider's `import/url` task.
 * Short-lived and unguessable, so the bucket can stay private.
 */
export async function createStagingDownloadUrl(input: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
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
