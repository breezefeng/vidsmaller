import ChartFigure from '@/components/charts/ChartFigure';
import {
  DEFAULT_AUDIO_KBPS,
  DEFAULT_DURATIONS,
  formatDuration,
  formatSize,
  RESOLUTION_TIERS,
  videoBitrateKbps,
} from '@/lib/seo/bitrate-budget';

/**
 * Which resolutions survive a given file-size ceiling, at each duration.
 *
 * The table on these pages answers "what is the best resolution for my length".
 * This answers the question underneath it — how much room is left before each
 * rung of the ladder stops working — which is what someone deciding between
 * 1080p and 720p actually needs.
 *
 * Nothing here is measured, and the figure says so. The bitrate is exact
 * arithmetic; the pass/fail shading is a judgement against published H.264
 * ladders. Keeping those two apart is the same discipline as the table.
 */

const TIERS = RESOLUTION_TIERS.filter((t) => t.height <= 1080);

const CELL_W = 74;
const CELL_H = 34;
const PAD_L = 62;
/** The "you have this much" column, printed once per row rather than per cell. */
const AVAIL_W = 86;
const PAD_T = 44;

type Verdict = 'good' | 'ok' | 'no';

function verdictFor(videoKbps: number, good: number, ok: number): Verdict {
  if (videoKbps >= good) return 'good';
  if (videoKbps >= ok) return 'ok';
  return 'no';
}

const FILL: Record<Verdict, string> = {
  good: 'fill-emerald-500/25',
  ok: 'fill-amber-500/25',
  no: 'fill-muted',
};
const TEXT: Record<Verdict, string> = {
  good: 'fill-emerald-700 dark:fill-emerald-400',
  ok: 'fill-amber-700 dark:fill-amber-500',
  no: 'fill-muted-foreground/50',
};

export default function BudgetMatrix({
  targetMb,
  durations = DEFAULT_DURATIONS,
  platform,
}: {
  targetMb: number;
  durations?: number[];
  platform: string;
}) {
  const w = PAD_L + AVAIL_W + TIERS.length * CELL_W + 4;
  const h = PAD_T + durations.length * CELL_H + 8;

  return (
    <ChartFigure
      title={`${formatSize(targetMb)} across lengths and resolutions`}
      caption={`The left column is what you have to spend at each length; the cells are what each resolution needs. Green means you clear it comfortably, amber means it is watchable but soft, grey means pick a smaller frame. Reading down a column tells you how long a clip can get before that resolution stops being worth it on ${platform}.`}
      source="Computed, not measured — no encoder was run to produce this figure"
      method={`${formatSize(targetMb)} spread over the duration, minus ${DEFAULT_AUDIO_KBPS} kbps audio and 2% container overhead. Thresholds from published H.264 bitrate ladders, reduced by about a third for re-encoded source.`}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          style={{ minWidth: `${w * 0.72}px` }}
          role="img"
          aria-label={`Matrix of video length against resolution for a ${formatSize(
            targetMb
          )} target`}
        >
          {/* column headers */}
          <text
            x={PAD_L + AVAIL_W - 12}
            y={PAD_T - 26}
            textAnchor="end"
            className="fill-foreground text-[11px] font-semibold"
          >
            you have
          </text>
          <text
            x={PAD_L + AVAIL_W + (TIERS.length * CELL_W) / 2}
            y={PAD_T - 26}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            needs, to look comfortable
          </text>
          {TIERS.map((tier, c) => (
            <text
              key={tier.height}
              x={PAD_L + AVAIL_W + c * CELL_W + CELL_W / 2}
              y={PAD_T - 10}
              textAnchor="middle"
              className="fill-foreground text-[12px] font-semibold"
            >
              {tier.label}
            </text>
          ))}

          {durations.map((seconds, r) => {
            const { videoKbps } = videoBitrateKbps(targetMb, seconds);
            return (
              <g key={seconds} transform={`translate(0, ${PAD_T + r * CELL_H})`}>
                <text
                  x={PAD_L - 10}
                  y={CELL_H / 2 + 4}
                  textAnchor="end"
                  className="fill-foreground text-[12px] tabular-nums"
                >
                  {formatDuration(seconds)}
                </text>

                {/* Available bitrate depends only on the duration, so it is
                    printed once. Repeating it in every cell made it look like
                    it varied by resolution, which is the opposite of the point. */}
                <text
                  x={PAD_L + AVAIL_W - 12}
                  y={CELL_H / 2 + 4}
                  textAnchor="end"
                  className="fill-foreground text-[12px] font-semibold tabular-nums"
                >
                  {videoKbps > 0 ? `${videoKbps.toLocaleString()}` : '—'}
                </text>

                {TIERS.map((tier, c) => {
                  const v =
                    videoKbps <= 0
                      ? 'no'
                      : verdictFor(videoKbps, tier.good, tier.ok);
                  return (
                    <g
                      key={tier.height}
                      transform={`translate(${PAD_L + AVAIL_W + c * CELL_W}, 0)`}
                    >
                      <rect
                        width={CELL_W - 4}
                        height={CELL_H - 4}
                        rx="5"
                        className={FILL[v]}
                      >
                        <title>
                          {`${formatDuration(seconds)} at ${tier.label}: ${
                            videoKbps > 0
                              ? `${videoKbps} kbps available`
                              : 'no bitrate left'
                          }, ${tier.good} kbps for a comfortable result, ${tier.ok} to stay watchable`}
                        </title>
                      </rect>
                      <text
                        x={(CELL_W - 4) / 2}
                        y={CELL_H / 2 + 3}
                        textAnchor="middle"
                        className={`text-[11px] font-medium tabular-nums ${TEXT[v]}`}
                      >
                        {tier.good.toLocaleString()}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFigure>
  );
}
