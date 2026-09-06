import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * The frame every chart on this site sits in.
 *
 * Charts are rendered as inline SVG on the server, never as an <img>. Two
 * reasons, and only one of them is about looks:
 *
 *   · An <img src="chart.svg"> is opaque to a crawler and to an answer engine.
 *     Inline <text> nodes are part of the document, so the numbers we measured
 *     are readable by the things we want quoting us. That is the entire point
 *     of having measured them.
 *   · No client JS, no layout shift, no chart library in the bundle.
 *
 * `source` is required rather than optional on purpose. A figure without a
 * stated provenance is the thing this whole exercise is supposed to replace.
 */
export default function ChartFigure({
  title,
  caption,
  source,
  method,
  children,
  className,
}: {
  title: string;
  /** One sentence stating what the reader should take away. */
  caption: string;
  /** Where the numbers came from — dataset, date, sample size. */
  source: string;
  /** How they were derived, when that is not obvious. Optional. */
  method?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'bg-card ring-muted rounded-2xl border p-5 shadow-xs ring-4 sm:p-6 dark:ring-0',
        className
      )}
    >
      <figcaption className="mb-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          {caption}
        </p>
      </figcaption>

      {children}

      <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
        <span className="font-medium">Source:</span> {source}
        {method && (
          <>
            {' · '}
            <span className="font-medium">Method:</span> {method}
          </>
        )}
      </p>
    </figure>
  );
}
