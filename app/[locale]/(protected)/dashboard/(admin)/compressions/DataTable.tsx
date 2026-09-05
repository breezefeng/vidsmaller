"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  PaginationState,
  useReactTable,
} from "@tanstack/react-table";

import {
  getCompressionJobs,
  type GetCompressionJobsResult,
} from "@/actions/compressions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";

const STATUSES = [
  "awaiting_upload",
  "queued",
  "processing",
  "completed",
  "failed",
  "expired",
];

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  initialData: TData[];
  initialPageCount: number;
  pageSize: number;
  totalCount: number;
}

export function CompressionsDataTable<TData, TValue>({
  columns,
  initialData,
  initialPageCount,
  pageSize,
  totalCount,
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [debouncedFilter] = useDebounce(globalFilter, 500);
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [data, setData] = useState<TData[]>(initialData);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [rowCount, setRowCount] = useState(totalCount);
  const [isLoading, setIsLoading] = useState(false);

  const initialLoad = useMemo(
    () =>
      !debouncedFilter && !status && !owner && pagination.pageIndex === 0,
    [debouncedFilter, status, owner, pagination.pageIndex]
  );

  useEffect(() => {
    setPagination((prev) =>
      prev.pageIndex !== 0 ? { ...prev, pageIndex: 0 } : prev
    );
  }, [debouncedFilter, status, owner]);

  useEffect(() => {
    if (initialLoad) {
      if (data !== initialData) {
        setData(initialData);
        setPageCount(initialPageCount);
        setRowCount(totalCount);
      }
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result: GetCompressionJobsResult = await getCompressionJobs({
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
          filter: debouncedFilter || undefined,
          status: status || undefined,
          owner: owner || undefined,
        });
        if (result.success) {
          setData((result.data?.jobs ?? []) as TData[]);
          setRowCount(result.data?.totalCount ?? 0);
          setPageCount(
            Math.ceil((result.data?.totalCount || 0) / pagination.pageSize)
          );
        } else {
          toast.error("Failed to load jobs", { description: result.error });
          setData([]);
          setPageCount(0);
          setRowCount(0);
        }
      } catch (error: any) {
        toast.error("Failed to load jobs", { description: error.message });
        setData([]);
        setPageCount(0);
        setRowCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [
    debouncedFilter,
    status,
    owner,
    pagination.pageIndex,
    pagination.pageSize,
    initialData,
    initialLoad,
    initialPageCount,
    totalCount,
  ]);

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 py-4">
        <Input
          placeholder="Search by filename, email, job id..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Select
            value={status || "all"}
            onValueChange={(v) => setStatus(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={owner || "all"}
            onValueChange={(v) => setOwner(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="signed_in">Signed in</SelectItem>
              <SelectItem value="anonymous">Anonymous</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative max-h-[calc(100vh-320px)] min-h-[200px] overflow-auto rounded-md border">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-xs">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ backgroundColor: "var(--background)" }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No compression jobs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between py-4">
        <span className="text-sm text-muted-foreground">
          {rowCount} job{rowCount === 1 ? "" : "s"}
          {pageCount > 0 &&
            ` · page ${pagination.pageIndex + 1} of ${pageCount}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage() || isLoading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage() || isLoading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
