import ChartFigure from '@/components/charts/ChartFigure';
import {
  CRF_LABEL_NAMES,
  CRF_LABELS,
  CRF_MEASURED_AT,
  CRF_VALUES,
  runsFor,
  VMAF_TRANSPARENCY_REFERENCE,
} from '@/lib/seo/crf';

/**
 * What a CRF number actually buys, per kind of footage.
 *
 * The headline finding is the spread, not the slope: at CRF 32 a screen
 * recording is still at VMAF 90 and 0.79 MB, while camera footage has fallen to
 * 74 and is three times the size. "How much smaller will my video get" has no
 * single answer, and this is the figure that says why.
 */

const W = 660;
const H = 300;
const PAD = { t: 16, r: 18, b: 42, l: 46 };

const Y_MIN = 70;
const Y_MAX = 100;

const SERIES: Record<string, { stroke: string; fill: string }> = {
  screen: { stroke: 'stroke-emerald-500', fill: 'fill-emerald-500' },
  animation: { stroke: 'stroke-violet-500', fill: 'fill-violet-500' },
  camera: { stroke: 'stroke-orange-500', fill: 'fill-orange-500' },
};

export default function CrfCurveChart() {
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const minCrf = CRF_VALUES[0];
  const maxCrf = CRF_VALUES[CRF_VALUES.length - 1];

  const x = (crf: number) => PAD.l + ((crf - minCrf) / (maxCrf - minCrf)) * plotW;
  const y = (vmaf: number) =>
    PAD.t + plotH - ((vmaf - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

  return (
    <ChartFigure
      title="What each CRF value costs you, by kind of footage"
      caption="Same encoder, same settings, three kinds of source. A screen recording at CRF 32 is still near the transparency line and under a megabyte; camera footage at the same setting has visibly fallen apart and is three times the size. This is why nobody can honestly tell you a single number for how much your video will shrink."
      source={`18 local encodes, ${CRF_MEASURED_AT} — 3 clips (1080p, 10s) x 6 CRF values, VMAF against the original`}
      method="libx264, preset medium, video only. Local ffmpeg rather than our production encoder: the CRF curve belongs to the codec, but this is a proxy for our output, not a recording of it."
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Line chart of VMAF quality against CRF value for camera, animation and screen recording sources"
      >
        {/* y grid */}
        {[70, 75, 80, 85, 90, 95, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={PAD.l + plotW}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth="1"
              strokeDasharray={v === 100 ? undefined : '2 4'}
            />
            <text
              x={PAD.l - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {v}
            </text>
          </g>
        ))}

        {/* transparency reference */}
        <line
          x1={PAD.l}
          x2={PAD.l + plotW}
          y1={y(VMAF_TRANSPARENCY_REFERENCE)}
          y2={y(VMAF_TRANSPARENCY_REFERENCE)}
          className="stroke-foreground/40"
          strokeWidth="1.5"
          strokeDasharray="6 3"
        />
        <text
          x={PAD.l + 6}
          // Below the line, not above: at the left edge every series is still
          // north of VMAF 95, so this strip is the one place the dashes do not
          // run straight through the words.
          y={y(VMAF_TRANSPARENCY_REFERENCE) + 14}
          textAnchor="start"
          className="fill-muted-foreground text-[10px]"
        >
          VMAF {VMAF_TRANSPARENCY_REFERENCE} · where most viewers stop noticing
        </text>

        {/* x axis */}
        <line
          x1={PAD.l}
          x2={PAD.l + plotW}
          y1={PAD.t + plotH}
          y2={PAD.t + plotH}
          className="stroke-border"
        />
        {CRF_VALUES.map((crf) => (
          <text
            key={crf}
            x={x(crf)}
            y={PAD.t + plotH + 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {crf}
          </text>
        ))}
        <text
          x={PAD.l + plotW / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          CRF — lower is higher quality and a bigger file
        </text>
        <text
          x={12}
          y={PAD.t + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${PAD.t + plotH / 2})`}
          className="fill-muted-foreground text-[11px]"
        >
          VMAF
        </text>

        {/* series */}
        {CRF_LABELS.map((label) => {
          const runs = runsFor(label);
          const s = SERIES[label];
          const d = runs
            .map((r, i) => `${i ? 'L' : 'M'}${x(r.crf)},${y(r.vmafMean)}`)
            .join(' ');
          return (
            <g key={label}>
              <path d={d} fill="none" className={s.stroke} strokeWidth="2" />
              {runs.map((r) => (
                <g key={r.crf}>
                  <circle cx={x(r.crf)} cy={y(r.vmafMean)} r="3.5" className={s.fill}>
                    <title>
                      {`${CRF_LABEL_NAMES[label]} at CRF ${r.crf}: VMAF ${r.vmafMean}, ${(
                        r.videoBytes / 1048576
                      ).toFixed(2)} MB, ${r.videoKbps} kbps`}
                    </title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}

        {/* legend */}
        {/* Bottom-left: the only region of the plot no series ever enters.
            Top-left put it straight on top of the CRF 18 data points. */}
        <g
          transform={`translate(${PAD.l + 10}, ${PAD.t + plotH - 46})`}
          className="text-[11px]"
        >
          {CRF_LABELS.map((label, i) => (
            <g key={label} transform={`translate(0, ${i * 15})`}>
              <circle cx="4" cy="-3" r="4" className={SERIES[label].fill} />
              <text x="14" y="0" className="fill-foreground">
                {CRF_LABEL_NAMES[label]}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* A polyline is unreadable to a screen reader, and the sizes had to come
          off the plot to stop them colliding. Both problems have the same
          answer: put every measurement in a real table. This is also the
          version an answer engine can actually quote. */}
      {/* 6 CRF columns do not fit 412px; without this the last one is simply
          cut off, which on a data table is worse than a scrollbar. */}
      <div className="mt-6 -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[440px] text-left text-sm">
        <caption className="sr-only">
          Output size and VMAF for each CRF value, by content class
        </caption>
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-medium">
              Source
            </th>
            {CRF_VALUES.map((crf) => (
              <th
                key={crf}
                scope="col"
                className="py-2 pr-3 text-right font-medium tabular-nums"
              >
                CRF {crf}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CRF_LABELS.map((label) => (
            <tr key={label} className="border-b last:border-0">
              <th scope="row" className="py-2.5 pr-3 font-medium">
                {CRF_LABEL_NAMES[label]}
              </th>
              {runsFor(label).map((r) => (
                <td key={r.crf} className="py-2.5 pr-3 text-right tabular-nums">
                  <span className="block">
                    {(r.videoBytes / 1048576).toFixed(2)} MB
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    VMAF {r.vmafMean}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ChartFigure>
  );
}
