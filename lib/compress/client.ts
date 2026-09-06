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
  /** small JPEG data URL of a frame, for the queue card */
  poster: string | null;
}

/**
 * Grab a frame as a small data URL. Best-effort: never rejects, never blocks.
 *
 * Two things make this harder than `drawImage(video)` suggests, and both only
 * show up on phones:
 *
 * 1. `seeked` fires when the seek completes, not when the frame is decoded and
 *    presentable. Desktop Chrome is forgiving enough that drawing immediately
 *    works; Chrome on Android and Safari on iOS hand you a black canvas.
 *    `requestVideoFrameCallback` is the actual "a frame is on screen now"
 *    signal, so we wait for it when it exists.
 *
 * 2. Plenty of real videos genuinely open on black — fades, slates, phone
 *    cameras settling. We used to seek to a fixed 1 s and trust it. A 5 s clip
 *    with a 1.5 s black lead-in produced a black thumbnail every time.
 *
 * So: seek, wait for a real frame, and if what we got is essentially a flat
 * black rectangle, try further in. Give up quietly rather than stall the queue.
 */
function grabPoster(el: HTMLVideoElement): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      el.onseeked = null;
      clearTimeout(timer);
      resolve(value);
    };

    // A poster is a nicety. Budget for a couple of seeks on a slow phone, but
    // never let it hold up the upload.
    const timer = setTimeout(() => finish(null), 6000);

    const duration = Number.isFinite(el.duration) ? el.duration : 0;

    // Ordered by how likely they are to be interesting, not by position: a tenth
    // of the way in beats the very start, and the middle beats a trailing fade.
    const candidates = (
      duration > 0
        ? [duration * 0.1, duration * 0.35, duration * 0.6, 0]
        : [1, 0]
    )
      .map((t) => Math.max(0, Math.min(t, Math.max(0, duration - 0.05))))
      .filter((t, i, a) => a.indexOf(t) === i);

    let attempt = 0;
    let fallback: string | null = null;

    /**
     * Wait until a frame is actually presentable, not merely seeked-to.
     *
     * `requestVideoFrameCallback` is the precise signal, but it only fires when
     * a frame is genuinely presented — and this element is a hidden 1px box, so
     * on some engines the compositor never presents anything and the callback
     * never arrives. Racing it against a short timer keeps the accuracy where
     * it works without hanging where it does not; if we draw too early the
     * blank check below catches it and we try again anyway.
     */
    const onFramePresented = (run: () => void) => {
      let ran = false;
      const once = () => {
        if (ran) return;
        ran = true;
        run();
      };

      type WithRvfc = HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      const rvfc = (el as WithRvfc).requestVideoFrameCallback;
      if (typeof rvfc === 'function') rvfc.call(el, once);

      requestAnimationFrame(() => requestAnimationFrame(once));
      setTimeout(once, 250);
    };

    const capture = (): { dataUrl: string; blank: boolean } | null => {
      const w = 320;
      const h = Math.max(
        1,
        Math.round((el.videoHeight / (el.videoWidth || 1)) * w)
      );
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0, w, h);

      // The source is a blob: URL, so it is same-origin and getImageData is
      // allowed. If a browser disagrees we simply skip the blank check.
      let blank = false;
      try {
        const { data } = ctx.getImageData(0, 0, w, h);
        let sum = 0;
        let max = 0;
        let n = 0;
        // Every 40th pixel is plenty to tell "flat black" from "a picture".
        for (let i = 0; i < data.length; i += 4 * 40) {
          const luma =
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += luma;
          if (luma > max) max = luma;
          n++;
        }
        const mean = n ? sum / n : 0;
        blank = mean < 6 && max < 24;
      } catch {
        // Tainted canvas — take the frame on faith.
      }

      return { dataUrl: canvas.toDataURL('image/jpeg', 0.7), blank };
    };

    const tryNext = () => {
      if (settled) return;
      if (attempt >= candidates.length) return finish(fallback);
      const t = candidates[attempt++];

      el.onseeked = () => {
        el.onseeked = null;
        onFramePresented(() => {
          if (settled) return;
          let shot: ReturnType<typeof capture> = null;
          try {
            shot = capture();
          } catch {
            return finish(fallback);
          }
          if (!shot) return finish(fallback);
          if (!shot.blank) return finish(shot.dataUrl);
          // Keep the black frame only as a last resort, and look further in.
          fallback = fallback ?? shot.dataUrl;
          tryNext();
        });
      };

      try {
        // Nudge off an exact match so the browser actually performs a seek and
        // fires `seeked`; re-assigning the current time is a no-op in Safari.
        el.currentTime = el.currentTime === t ? t + 0.001 : t;
      } catch {
        finish(fallback);
      }
    };

    tryNext();
  });
}

export function probeVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const empty: VideoMeta = {
      durationSeconds: null,
      width: null,
      height: null,
      poster: null,
    };

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
      el.remove();
      resolve(meta);
    };

    const timer = setTimeout(() => done(empty), 10000);

    // `metadata` is enough for duration/dimensions but not for drawImage, so
    // we ask for actual data — the object URL is local, nothing is downloaded.
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
    // Safari on iOS will not decode frames for a video that is not in the
    // document, which is exactly the case that produces a black thumbnail.
    // One invisible pixel is enough to make it behave.
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);

    let metaSeen = false;
    const onReady = () => {
      if (metaSeen) return;
      metaSeen = true;
      clearTimeout(timer);
      const base = {
        durationSeconds: Number.isFinite(el.duration) ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      };
      grabPoster(el).then((poster) => done({ ...base, poster }));
    };

    // Wait for real frame data, not just the header. At `loadedmetadata`
    // readyState is HAVE_METADATA and there is nothing to draw yet — seeking
    // from there is what hands mobile browsers an empty canvas.
    el.onloadeddata = onReady;
    el.oncanplay = onReady;
    // Belt and braces: if neither event lands but the data is there anyway,
    // `loadedmetadata` plus a short grace period still beats no poster at all.
    el.onloadedmetadata = () => {
      setTimeout(() => {
        if (el.readyState >= 2) onReady();
      }, 400);
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

export interface FreeCapacity {
  usedMinutes: number;
  budgetMinutes: number;
  remainingMinutes: number;
  exhausted: boolean;
  resetsAt: string;
}

export interface CompressorContext {
  tier: 'anonymous' | 'free' | 'pro' | 'max';
  signedIn: boolean;
  credits: number;
  stagingAvailable: boolean;
  /** shared anonymous pool; null for signed-in users, who are not gated by it */
  freeCapacity: FreeCapacity | null;
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
