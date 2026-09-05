"use client";

import type { CompressionJobRow } from "@/actions/compressions/admin";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDuration } from "@/lib/compress/client";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { toast } from "sonner";

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-600 hover:bg-emerald-600",
  failed: "bg-destructive hover:bg-destructive",
  processing: "bg-primary hover:bg-primary",
  queued: "bg-muted-foreground hover:bg-muted-foreground",
  awaiting_upload: "bg-muted-foreground hover:bg-muted-foreground",
  expired: "bg-muted-foreground hover:bg-muted-foreground",
};

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value);
  toast.success(`Copied ${label}`);
}

export const columns: ColumnDef<CompressionJobRow>[] = [
  {
    accessorKey: "originalFilename",
    header: "File",
    cell: ({ row }) => {
      const job = row.original;
      return (
        <div className="flex max-w-[240px] flex-col">
          <span
            className="cursor-pointer truncate font-medium"
            title={job.originalFilename}
            onClick={() => copy(job.id, "job id")}
          >
            {job.originalFilename}
          </span>
          <span className="text-xs text-muted-foreground">
            {job.inputFormat} → {job.outputFormat}
            {job.durationSeconds
              ? ` · ${formatDuration(job.durationSeconds)}`
              : ""}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const job = row.original;
      return (
        <div className="flex flex-col gap-1">
          <Badge
            className={cn("w-fit text-[10px]", STATUS_STYLE[job.status] ?? "")}
          >
            {job.status}
          </Badge>
          {job.status === "processing" && (
            <span className="text-xs text-muted-foreground">
              {job.progress}%
            </span>
          )}
          {job.errorMessage && (
            <span
              className="max-w-[220px] cursor-pointer truncate text-xs text-destructive"
              title={job.errorMessage}
              onClick={() => copy(job.errorMessage!, "error")}
            >
              {job.errorMessage}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: "size",
    header: "Size",
    cell: ({ row }) => {
      const job = row.original;
      if (job.outputSize === null) {
        return (
          <span className="text-muted-foreground">
            {formatBytes(job.inputSize)}
          </span>
        );
      }
      return (
        <div className="flex flex-col">
          <span className="text-sm">
            <span className="text-muted-foreground line-through">
              {formatBytes(job.inputSize)}
            </span>
            <span className="mx-1">→</span>
            <span className="font-medium">{formatBytes(job.outputSize)}</span>
          </span>
          {job.savedPercent !== null && (
            <span
              className={cn(
                "text-xs",
                job.savedPercent > 0
                  ? "text-emerald-600"
                  : "text-muted-foreground"
              )}
            >
              {job.savedPercent > 0 ? `−${job.savedPercent}%` : "no gain"}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: "settings",
    header: "Settings",
    cell: ({ row }) => {
      const s = row.original.settings as {
        mode?: string;
        preset?: string;
        codec?: string;
        targetSizeMb?: number;
        crf?: number;
        resolution?: string;
        bitrateKbps?: number;
      };
      const detail =
        s.mode === "preset"
          ? s.preset
          : s.mode === "target_size"
            ? `${s.targetSizeMb} MB`
            : s.mode === "quality"
              ? `CRF ${s.crf}`
              : s.mode === "resolution"
                ? s.resolution
                : s.mode === "bitrate"
                  ? `${s.bitrateKbps} kbps`
                  : "";
      return (
        <div className="flex flex-col text-xs">
          <span>{s.mode ?? "-"}</span>
          <span className="text-muted-foreground">
            {detail}
            {s.codec ? ` · ${s.codec}` : ""}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "creditsCharged",
    header: "Credits",
    cell: ({ row }) => {
      const job = row.original;
      if (job.creditsCharged === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex items-center gap-1.5">
          <span>{job.creditsCharged}</span>
          {job.creditsRefunded && (
            <Badge variant="outline" className="text-[10px]">
              refunded
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "userEmail",
    header: "User",
    cell: ({ row }) => {
      const email = row.original.userEmail;
      if (!email) {
        return (
          <Badge variant="secondary" className="text-[10px]">
            anonymous
          </Badge>
        );
      }
      return (
        <span
          className="cursor-pointer text-sm text-muted-foreground"
          onClick={() => copy(email, "email")}
        >
          {email}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => {
      const job = row.original;
      const created = dayjs(job.createdAt);
      const took = job.completedAt
        ? dayjs(job.completedAt).diff(created, "second")
        : null;
      return (
        <div className="flex flex-col text-xs">
          <span>{created.format("YYYY-MM-DD HH:mm")}</span>
          {took !== null && (
            <span className="text-muted-foreground">took {took}s</span>
          )}
        </div>
      );
    },
  },
];
