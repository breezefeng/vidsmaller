import ChartFigure from '@/components/charts/ChartFigure';
import {
  BENCHMARK_DATE,
  BENCHMARK_RUNS,
  breakdown,
  totalBilled,
  totalSeconds,
} from '@/lib/seo/benchmark';

/**
 * Why a five-second clip costs the same as a one-minute one.
 *
 * The provider bills each of the three tasks separately, rounded up, with a
 * one-minute floor. On the 10-minute run the export task takes 0.36 seconds and
 * is charged a full minute — a 166x gap between work done and work billed.
 *
 * Nobody else in this category publishes this, because publishing it requires
 * having run the jobs and read the invoice. Every number below is from three
 * real jobs whose ids are in lib/seo/benchmark.ts.
 */

const ROW_H = 62;
const PAD_L = 132;
/** Room for the "billed N min" label that sits after the longest bar. */
const PAD_R = 84;
const PAD_T = 26;
const W = 640;

/** Longest bar on the chart, in seconds, so both series share one scale. */
const MAX_SECONDS = Math.max(
  ...BENCHMARK_RUNS.map((r) => Math.max(totalSeconds(r), totalBilled(r) * 60))
);

const TASK_FILL: Record<string, string> = {
  import: 'fill-indigo-400/70',
  compress: 'fill-violet-500/70',
  export: 'fill-orange-400/80',
};

export default function BilledMinutesChart() {
  const plotW = W - PAD_L - PAD_R;
  const x = (seconds: number) => (seconds / MAX_SECONDS) * plotW;
  const height = PAD_T + BENCHMARK_RUNS.length * ROW_H + 34;

  return (
    <ChartFigure
      title="Measured encoder time vs. what it bills"
      caption="Each job runs three tasks, and every task is rounded up to a whole minute on its own. On the 10-minute file the export step does 0.36 seconds of work and is charged 60 — which is why the floor for any job, however short, is three minutes."
      source={`3 measured jobs, ${BENCHMARK_DATE}, provider percentage-50 mode (lib/seo/benchmark.ts)`}
      method="Billed = Σ per task max(1, ceil(seconds / 60)); verified against the provider's own invoice"
    >
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        className="overflow-visible"
        role="img"
        aria-label="Bar chart comparing measured encoder seconds against billed minutes for three benchmark jobs"
      >
        {/* legend */}
        <g className="text-[11px]">
          {(['import', 'compress', 'export'] as const).map((task, i) => (
            <g key={task} transform={`translate(${PAD_L + i * 92}, 0)`}>
              <rect width="10" height="10" rx="2" className={TASK_FILL[task]} />
              <text x="15" y="9" className="fill-muted-foreground">
                {task}
              </text>
            </g>
          ))}
        </g>

        {BENCHMARK_RUNS.map((run, i) => {
          const y = PAD_T + i * ROW_H;
          const measured = totalSeconds(run);
          const billed = totalBilled(run);

          // Billed bar: one segment per task, each a whole number of minutes.
          let cursor = 0;
          const segments = breakdown(run).map((t) => {
            const seg = { ...t, offset: cursor };
            cursor += t.billed * 60;
            return seg;
          });

          return (
            <g key={run.jobId}>
              <text
                x="0"
                y={y + 14}
                className="fill-foreground text-[12px] font-medium"
              >
                {run.label}
              </text>

              {/* measured */}
              <rect
                x={PAD_L}
                y={y + 4}
                width={Math.max(1, x(measured))}
                height="12"
                rx="3"
                className="fill-muted-foreground/35"
              />
              <text
                x={PAD_L + x(measured) + 6}
                y={y + 14}
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {measured.toFixed(1)}s of work
              </text>

              {/* billed */}
              {segments.map((seg) => (
                <rect
                  key={seg.task}
                  x={PAD_L + x(seg.offset)}
                  y={y + 22}
                  width={Math.max(1, x(seg.billed * 60) - 1.5)}
                  height="16"
                  rx="3"
                  className={TASK_FILL[seg.task]}
                >
                  <title>{`${seg.task}: ${seg.seconds}s measured, billed ${seg.billed} min`}</title>
                </rect>
              ))}
              <text
                x={PAD_L + x(billed * 60) + 6}
                y={y + 34}
                className="fill-foreground text-[11px] font-semibold tabular-nums"
              >
                billed {billed} min
              </text>
            </g>
          );
        })}

        {/* x axis in minutes */}
        <g transform={`translate(0, ${PAD_T + BENCHMARK_RUNS.length * ROW_H})`}>
          <line
            x1={PAD_L}
            x2={PAD_L + plotW}
            y1="0"
            y2="0"
            className="stroke-border"
            strokeWidth="1"
          />
          {/* Ticks derived from the data, not hardcoded: the longest bar is the
              6-minute job and a 0..3 axis silently cropped half the chart. */}
          {Array.from(
            { length: Math.ceil(MAX_SECONDS / 60) + 1 },
            (_, i) => i
          ).map((min) => (
            <g key={min} transform={`translate(${PAD_L + x(min * 60)}, 0)`}>
              <line y1="0" y2="4" className="stroke-border" strokeWidth="1" />
              <text
                y="16"
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {min} min
              </text>
            </g>
          ))}
        </g>
      </svg>
    </ChartFigure>
  );
}
