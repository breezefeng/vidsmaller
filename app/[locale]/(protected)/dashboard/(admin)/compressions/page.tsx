import { getCompressionJobs } from "@/actions/compressions/admin";
import { constructMetadata } from "@/lib/metadata";
import { Loader2 } from "lucide-react";
import { Metadata } from "next";
import { Locale } from "next-intl";
import { Suspense } from "react";
import { columns } from "./Columns";
import { CompressionsDataTable } from "./DataTable";
import StatsCards from "./StatsCards";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  return constructMetadata({
    title: "Compressions",
    description: "Every compression job, with credits and failure rate.",
    locale: locale as Locale,
    path: `/dashboard/compressions`,
    noIndex: true,
  });
}

const PAGE_SIZE = 20;

async function JobsTable() {
  const initial = await getCompressionJobs({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  if (!initial.success) {
    return <p className="text-destructive">{initial.error}</p>;
  }

  const { jobs, totalCount } = initial.data || { jobs: [], totalCount: 0 };

  return (
    <CompressionsDataTable
      columns={columns}
      initialData={jobs}
      initialPageCount={Math.ceil((totalCount || 0) / PAGE_SIZE)}
      pageSize={PAGE_SIZE}
      totalCount={totalCount}
    />
  );
}

function Spinner() {
  return (
    <div className="flex h-24 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export default function AdminCompressionsPage() {
  return (
    <div className="space-y-4">
      <Suspense fallback={<Spinner />}>
        <StatsCards />
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <JobsTable />
      </Suspense>
    </div>
  );
}
