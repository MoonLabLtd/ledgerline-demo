import { Suspense } from "react";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { ProductsView } from "@/components/catalog/products-view";

export const metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductsView />
    </Suspense>
  );
}
