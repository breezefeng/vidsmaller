/**
 * Measured encoder runs. The only numbers on this site that came from a stopwatch.
 *
 * Transcribed from `scripts/fc-benchmark-results.jsonl` (run 2026-09-06). The
 * job ids are kept so any figure rendered from this file can be traced back to
 * a real job in the provider's dashboard. Raw jsonl stays in `scripts/` as the
 * lab output; this module is what the app is allowed to read, because a chart
 * that silently loses its provenance is indistinguishable from a made-up one.
 *
 * WHAT THIS DATA DOES NOT CONTAIN — read before adding a chart:
 *
 *   · No CRF sweep. All three runs used the provider's `percentage: 50` mode,
 *     so nothing here says anything about CRF 18 vs 23 vs 28.
 *   · No quality metric. No SSIM, PSNR or VMAF was captured, so no chart may
 *     claim anything about perceived quality.
 *   · No competitor runs. We have never put the same file through VEED,
 *     Clideo or anyone else.
 *
 * Those three gaps rule out most of the charts that would be nice to have. Fill
 * the gap with a measurement, not with an assumption.
 */

export interface BenchmarkRun {
  /** Provider job id — auditable against the dashboard. */
  jobId: string;
  label: string;
  width: number;
  height: number;
  codec: 'libx264' | 'libx265';
  /** Provider compression mode used for every run in this set. */
  mode: 'percentage-50';
  sourceSeconds: number;
  sourceBytes: number;
  outputBytes: number;
  /** Wall clock per provider task, in seconds. */
  uploadSec: number;
  importSec: number;
  compressSec: number;
  exportSec: number;
}

export const BENCHMARK_DATE = '2026-09-06';

export const BENCHMARK_RUNS: BenchmarkRun[] = [
  {
    jobId: '6a9cb00437927e3fcafc3e12',
    label: '1080p · 1 min · H.264',
    width: 1920,
    height: 1080,
    codec: 'libx264',
    mode: 'percentage-50',
    sourceSeconds: 60,
    sourceBytes: 62190918,
    outputBytes: 28941219,
    uploadSec: 14.612,
    importSec: 15.597,
    compressSec: 13.151,
    exportSec: 0.688,
  },
  {
    jobId: '6a9cb034a40502e067b92426',
    label: '1080p · 1 min · H.265',
    width: 1920,
    height: 1080,
    codec: 'libx265',
    mode: 'percentage-50',
    sourceSeconds: 60,
    sourceBytes: 62190918,
    outputBytes: 29064738,
    uploadSec: 13.416,
    importSec: 14.346,
    compressSec: 33.038,
    exportSec: 0.306,
  },
  {
    jobId: '6a9cb15f53da4a2d35558a3c',
    label: '1080p · 10 min · H.264',
    width: 1920,
    height: 1080,
    codec: 'libx264',
    mode: 'percentage-50',
    sourceSeconds: 600,
    sourceBytes: 621892179,
    outputBytes: 296590958,
    uploadSec: 127.012,
    importSec: 127.796,
    compressSec: 77.48,
    exportSec: 0.363,
  },
];

/**
 * The provider bills each task separately, rounded up, with a one-minute floor:
 *
 *     job_minutes = Σ over tasks: max(1, ceil(task_seconds / 60))
 *
 * Verified against the account dashboard: these three jobs model to 12 minutes,
 * the dashboard charged 11.
 */
export const billedMinutes = (seconds: number): number =>
  Math.max(1, Math.ceil(seconds / 60));

export interface TaskBreakdown {
  task: 'import' | 'compress' | 'export';
  seconds: number;
  billed: number;
}

export function breakdown(run: BenchmarkRun): TaskBreakdown[] {
  return [
    { task: 'import', seconds: run.importSec, billed: billedMinutes(run.importSec) },
    { task: 'compress', seconds: run.compressSec, billed: billedMinutes(run.compressSec) },
    { task: 'export', seconds: run.exportSec, billed: billedMinutes(run.exportSec) },
  ];
}

export const totalBilled = (run: BenchmarkRun): number =>
  breakdown(run).reduce((sum, t) => sum + t.billed, 0);

/** Seconds of encoder work actually performed, across all three tasks. */
export const totalSeconds = (run: BenchmarkRun): number =>
  run.importSec + run.compressSec + run.exportSec;

/**
 * Staging the upload in our own bucket first, measured on the 593 MB run.
 *
 * The provider meters `import` by wall clock, so a browser uploading straight
 * to them bills us for the visitor's uplink. Pulling server-to-server from the
 * Cloudflare edge instead moved that time off their meter.
 */
export const STAGING_COMPARISON = {
  fileBytes: 621892179,
  before: { label: 'browser → provider', import: 127.8, compress: 81.3, export: 1.6 },
  after: { label: 'browser → R2 → provider', import: 18.3, compress: 81.3, export: 1.6 },
} as const;
