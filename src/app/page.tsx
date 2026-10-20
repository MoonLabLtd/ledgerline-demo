import { Suspense } from "react";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { Overview } from "@/components/dashboard/overview";

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}
