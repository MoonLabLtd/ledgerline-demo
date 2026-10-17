import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
