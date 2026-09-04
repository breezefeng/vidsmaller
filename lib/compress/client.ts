'use client';

import type { CompressSettings } from '@/lib/freeconvert/presets';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/* ------------------------------------------------------------------ */
/* Local metadata probing (no server round-trip, no storage)           */
/* ------------------------------------------------------------------ */

export interface VideoMeta {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export function probeVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const empty: VideoMeta = { durationSeconds: null, width: null, height: null };

    if (typeof window === 'undefined' || !file.type.startsWith('video')) {
      resolve(empty);
      return;
    }

    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    let settled = false;

    const done = (meta: VideoMeta) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
      resolve(meta);
    };

    const timer = setTimeout(() => done(empty), 8000);

    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done({
        durationSeconds: Number.isFinite(el.duration) ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      });
    };
    el.onerror = () => {
      clearTimeout(timer);
      done(empty);
    };
    el.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* Direct upload to the provider (browser -> FreeConvert)              */
/* ------------------------------------------------------------------ */

export interface UploadTarget {
  url: string;
  parameters: Record<string, string>;
}

/**
 * Uploads the file straight to the compression provider.
 * Nothing ever touches our own storage, which is why VidSmaller needs
 * no S3 / R2 / OSS bucket for the input file.
 */
export class UploadTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadTransportError';
  }
}

export function uploadFileDirect(
  file: File,
  target: UploadTarget,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(target.parameters || {})) {
      form.append(key, value);
    }
    form.append('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', target.url, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    // A zero-status error is what a blocked cross-origin POST looks like from
    // JS, so surface it distinctly and let the caller fall back.
    xhr.onerror = () =>
      reject(
        new UploadTransportError(
          'Direct upload was blocked by the browser or network.'
        )
      );
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(form);
  });
}

/** Fallback: PUT the file into our own bucket with a presigned URL. */
export function uploadFileToStaging(
  file: File,
  url: string,
  contentType: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Staged upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () =>
      reject(new Error('Staged upload failed. Check your network and retry.'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

/* ------------------------------------------------------------------ */
/* API helpers                                                         */
/* ------------------------------------------------------------------ */

export interface JobView {
  id: string;
  status:
    | 'awaiting_upload'
    | 'queued'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'expired';
  progress: number;
  originalFilename: string;
  outputFilename: string;
  inputSize: number;
  outputSize: number | null;
  savedBytes: number | null;
  savedPercent: number | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  creditsCharged: number;
  createdAt: string;
  completedAt: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function callApi<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body.data as T;
}

export function createJobRequest(payload: {
  filename: string;
  fileSize: number;
  durationSeconds: number | null;
  settings: CompressSettings;
  stagingKey?: string;
}) {
  return callApi<{
    job: JobView;
    upload: UploadTarget | null;
    creditsCharged: number;
  }>('/api/compress/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestStagingUrl(payload: {
  filename: string;
  fileSize: number;
  contentType: string;
}) {
  return callApi<{ key: string; url: string; contentType: string }>(
    '/api/compress/staging-url',
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

export function markUploaded(jobId: string) {
  return callApi<{ job: JobView }>(`/api/compress/jobs/${jobId}`, {
    method: 'PATCH',
  });
}

export function fetchJob(jobId: string) {
  return callApi<{ job: JobView }>(`/api/compress/jobs/${jobId}`);
}

export interface CompressorContext {
  tier: 'anonymous' | 'free' | 'pro' | 'max';
  signedIn: boolean;
  credits: number;
  stagingAvailable: boolean;
  limits: {
    maxFileSize: number;
    maxBatchFiles: number;
    retentionHours: number;
    allowAdvancedCodecs: boolean;
  };
  jobs: JobView[];
}

export function fetchContext() {
  return callApi<CompressorContext>('/api/compress/me');
}
