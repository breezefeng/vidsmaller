import { getCompressionStats } from "@/actions/compressions/admin";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function bytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1
  );
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "good" && "text-emerald-600",
            tone === "bad" && "text-destructive"
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function StatsCards() {
  const result = await getCompressionStats();
  if (!result.success || !result.data) return null;

  const s = result.data;
  const netCredits = s.creditsCharged - s.creditsRefunded;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Stat
        label="Total jobs"
        value={String(s.total)}
        hint={`${s.anonymous} anonymous`}
      />
      <Stat
        label="Success rate"
        value={s.successRate === null ? "—" : `${s.successRate}%`}
        hint={`${s.completed} ok · ${s.failed} failed`}
        tone={
          s.successRate !== null && s.successRate < 90 ? "bad" : undefined
        }
      />
      <Stat
        label="In flight"
        value={String(s.inFlight)}
        hint="queued or running"
      />
      <Stat
        label="Bytes saved"
        value={bytes(s.bytesIn - s.bytesOut)}
        hint={s.savedPercent === null ? undefined : `−${s.savedPercent}% overall`}
        tone="good"
      />
      <Stat
        label="Processed in"
        value={bytes(s.bytesIn)}
        hint={`out ${bytes(s.bytesOut)}`}
      />
      <Stat
        label="Credits used"
        value={String(netCredits)}
        hint={
          s.creditsRefunded > 0
            ? `${s.creditsCharged} charged · ${s.creditsRefunded} refunded`
            : "none refunded"
        }
      />
    </div>
  );
}
