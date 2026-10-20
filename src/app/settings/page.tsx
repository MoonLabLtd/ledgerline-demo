import { Suspense } from "react";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsView />
    </Suspense>
  );
}
