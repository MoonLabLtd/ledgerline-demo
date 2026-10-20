import { Suspense } from "react";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { SalesTable } from "@/components/sales/sales-table";

export const metadata = { title: "Sales" };

export default function SalesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SalesTable />
    </Suspense>
  );
}
