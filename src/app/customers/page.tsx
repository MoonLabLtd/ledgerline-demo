import { Suspense } from "react";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { CustomersView } from "@/components/customers/customers-view";

export const metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomersView />
    </Suspense>
  );
}
