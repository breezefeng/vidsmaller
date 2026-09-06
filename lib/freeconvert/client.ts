import 'server-only';

import type {
  FCJob,
  FCJobDefinition,
  FCTask,
  FCUploadForm,
} from './types';

const API_BASE =
  process.env.FREECONVERT_API_BASE_URL || 'https://api.freeconvert.com/v1';

export class FreeConvertError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    payload?: unknown
  ) {
    super(message);
    this.name = 'FreeConvertError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function apiKey(): string {
  const key = process.env.FREECONVERT_API_KEY;
  if (!key) {
    throw new FreeConvertError('FREECONVERT_API_KEY is not configured', 500);
  }
  return key;
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
        ...(rest.headers || {}),
      },
    });

    const text = await res.text();
    let body: any = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const msg =
        (body && (body.message || body.msg || body.error)) ||
        `FreeConvert request failed (${res.status})`;
      throw new FreeConvertError(
        String(msg),
        res.status,
        body?.errorCode,
        body
      );
    }

    return body as T;
  } catch (err) {
    if (err instanceof FreeConvertError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new FreeConvertError('FreeConvert request timed out', 504);
    }
    throw new FreeConvertError(
      (err as Error)?.message || 'FreeConvert request failed',
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Create a full job (upload -> compress -> export) in one call. */
export function createJob(definition: FCJobDefinition): Promise<FCJob> {
  return request<FCJob>('/process/jobs', {
    method: 'POST',
    body: JSON.stringify(definition),
  });
}

export function getJob(jobId: string): Promise<FCJob> {
  return request<FCJob>(`/process/jobs/${jobId}`, { method: 'GET' });
}

export function getTask(taskId: string): Promise<FCTask> {
  return request<FCTask>(`/process/tasks/${taskId}`, { method: 'GET' });
}

/** Standalone import/upload task (used by the R2-less direct upload flow). */
export function createUploadTask(): Promise<FCTask> {
  return request<FCTask>('/process/import/upload', { method: 'POST' });
}

export function createImportUrlTask(
  url: string,
  filename?: string
): Promise<FCTask> {
  return request<FCTask>('/process/import/url', {
    method: 'POST',
    body: JSON.stringify({ url, filename }),
  });
}

/* --------------------------- helpers --------------------------- */

export function findTask(job: FCJob, name: string): FCTask | undefined {
  return job.tasks?.find((t) => t.name === name);
}

export function getUploadForm(job: FCJob, taskName: string): FCUploadForm {
  const task = findTask(job, taskName);
  const form = task?.result?.form;
  if (!form?.url) {
    throw new FreeConvertError(
      'FreeConvert did not return an upload form for the import task',
      502
    );
  }
  return form;
}

export function collectJobError(job: FCJob): string | undefined {
  if (job.result?.msg) return String(job.result.msg).trim();
  const failed = job.tasks?.find((t) => t.status === 'failed');
  if (failed?.result?.msg) return String(failed.result.msg).trim();
  if (job.status === 'failed') return 'Compression failed';
  return undefined;
}
