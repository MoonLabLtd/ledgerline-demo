import { PAYMENT_LABELS, SALE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { autoBucket, bucketKeys, formatBucketLabel, resolveRange } from "@/lib/date-range";
import { MINOR_PER_MAJOR } from "@/lib/money";
import { parseSalesQuery } from "@/lib/validation";

export const instant = false;

export default async function Home({ searchParams }: PageProps<"/">) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
  }

  const query = parseSalesQuery(params);
  const range = resolveRange({ preset: "30d" });
  const bucket = autoBucket(range);
  const buckets = bucketKeys(range, bucket);
  const statusCsv = toCsv(
    ["status", "label"],
    SALE_STATUSES.map((status) => [status, STATUS_LABELS[status]]),
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ledgerline</h1>
        <p className="text-sm text-muted-foreground">
          Every monetary value is stored as integer minor units ({MINOR_PER_MAJOR} per major unit).
        </p>
      </header>

      <section className="space-y-1 text-sm">
        <h2 className="font-medium">Sales query</h2>
        <p className="text-muted-foreground">
          Showing {query.pageSize} per page, sorted by {query.sort} ({query.dir}), page {query.page + 1}.
        </p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-medium">Last 30 days</h2>
        <p className="text-muted-foreground">
          {bucket} buckets ({buckets.length}): {buckets.map((key) => formatBucketLabel(key, bucket)).join(", ")}
        </p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-medium">Payment methods</h2>
        <p className="text-muted-foreground">{Object.values(PAYMENT_LABELS).join(", ")}</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-medium">Status export preview</h2>
        <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs">{statusCsv}</pre>
      </section>
    </main>
  );
}
