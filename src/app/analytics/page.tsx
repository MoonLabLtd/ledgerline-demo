import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { AnalyticsView } from "@/components/dashboard/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalyticsView />
    </Suspense>
  );
}
