"use client";

import { ArrowRight, Lightbulb, Plus, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { DonutChart, RankingChart, TimeSeriesChart } from "@/components/dashboard/charts";
import { KpiCard, KpiSkeleton } from "@/components/dashboard/kpi-card";
import { SaleActions } from "@/components/sales/sale-actions";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/constants";
import { parseDay } from "@/lib/date-range";
import { useDashboard, useDateRange, useFormat, useSales } from "@/lib/queries";
import { useSaleDialog } from "@/lib/ui-store";

const SKELETON_KEYS = [0, 1, 2, 3, 4];

export function Overview() {
  const { range } = useDateRange();
  const { data, error, refetch } = useDashboard(range);
  const sales = useSales({ from: range?.from, to: range?.to, sort: "date", dir: "desc", pageSize: 8 }, range !== null);
  const { money, number, date } = useFormat();
  const openNewSale = useSaleDialog((state) => state.openNew);

  if (error) {
    return (
      <div className="flex flex-col gap-4 pt-12 sm:pt-0 md:gap-6">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const missingCost = data === undefined ? 0 : data.kpis.current.salesCount - data.kpis.current.costedCount;
  const profitHint =
    data === undefined
      ? undefined
      : data.kpis.current.profitMinor !== null
        ? "Revenue minus product cost"
        : missingCost > 0
          ? `${missingCost} sales missing cost`
          : "No completed sales";

  const noSales =
    data !== undefined &&
    data.kpis.current.salesCount === 0 &&
    data.kpis.current.pendingCount === 0 &&
    data.kpis.current.refundedCount === 0 &&
    data.kpis.current.cancelledCount === 0;

  const pendingCount = data === undefined ? 0 : data.kpis.current.pendingCount;
  const refundedCount = data === undefined ? 0 : data.kpis.current.refundedCount;
  const showRevenueNote = data !== undefined && (pendingCount > 0 || refundedCount > 0);
  let revenueNote = "Revenue counts completed sales only (net of discounts, excluding tax). ";
  if (data !== undefined && pendingCount > 0) {
    revenueNote += `${money(data.kpis.current.pendingMinor)} pending in ${pendingCount} sales. `;
  }
  if (data !== undefined && refundedCount > 0) {
    revenueNote += `${money(data.kpis.current.refundedMinor)} refunded across ${refundedCount} sales.`;
  }

  return (
    <div className="flex flex-col gap-4 pt-12 sm:pt-0 md:gap-6">
      {noSales ? (
        <Card>
          <EmptyState
            title="No sales in this period"
            description="Record a sale or pick a wider date range. You can also load demo data from Settings."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={openNewSale}>
                  <Plus aria-hidden="true" />
                  Add sale
                </Button>
                <Button asChild variant="outline">
                  <Link href="/settings">Open settings</Link>
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {data === undefined ? (
              SKELETON_KEYS.map((key) => <KpiSkeleton key={key} />)
            ) : (
              <>
                <KpiCard
                  label="Total revenue"
                  value={money(data.kpis.current.revenueMinor)}
                  current={data.kpis.current.revenueMinor}
                  previous={data.kpis.previous.revenueMinor}
                  spark={data.series.map((point) => point.revenueMinor)}
                />
                <KpiCard
                  label="Sales"
                  value={number(data.kpis.current.salesCount)}
                  current={data.kpis.current.salesCount}
                  previous={data.kpis.previous.salesCount}
                  spark={data.series.map((point) => point.orders)}
                />
                <KpiCard
                  label="Avg. order value"
                  value={money(data.kpis.current.aovMinor)}
                  current={data.kpis.current.aovMinor}
                  previous={data.kpis.previous.aovMinor}
                  spark={data.series.map((point) => point.aovMinor)}
                />
                <KpiCard
                  label="Units sold"
                  value={number(data.kpis.current.units)}
                  current={data.kpis.current.units}
                  previous={data.kpis.previous.units}
                  spark={data.series.map((point) => point.units)}
                />
                <KpiCard
                  label="Net profit"
                  value={data.kpis.current.profitMinor !== null ? money(data.kpis.current.profitMinor) : "—"}
                  current={data.kpis.current.profitMinor ?? 0}
                  previous={data.kpis.previous.profitMinor ?? 0}
                  hint={profitHint}
                />
              </>
            )}
          </section>
          {showRevenueNote && <p className="text-xs text-muted-foreground">{revenueNote}</p>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue over time</CardTitle>
                <CardDescription>
                  {data === undefined
                    ? "By\u00a0, dashed line is the previous period"
                    : `By ${data.bucket}, dashed line is the previous period`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data === undefined ? (
                  <Skeleton className="h-72 w-full" />
                ) : (
                  <TimeSeriesChart
                    series={data.series}
                    previous={data.previousSeries}
                    bucket={data.bucket}
                    metric="revenueMinor"
                    kind="area"
                    className="h-72 w-full"
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Insights</CardTitle>
                <CardDescription>What stands out this period</CardDescription>
              </CardHeader>
              <CardContent>
                {data === undefined ? (
                  <Skeleton className="h-60 w-full" />
                ) : data.insights.length === 0 ? (
                  <EmptyState
                    icon={Lightbulb}
                    title="Not enough data yet"
                    description="Insights appear once there are at least 3 completed sales in the period."
                  />
                ) : (
                  <dl className="divide-y">
                    {data.insights.map((insight) => {
                      const positive = insight.tone === "positive";
                      const negative = insight.tone === "negative";
                      const value = insight.id === "best-day" ? date(parseDay(String(insight.value))) : insight.value;
                      return (
                        <div key={insight.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-sm text-muted-foreground">{insight.title}</dt>
                            <dd
                              className={
                                "flex items-center gap-1 text-right text-sm font-medium" +
                                (positive ? " text-success" : negative ? " text-destructive" : "")
                              }
                            >
                              {value}
                              {positive && <TrendingUp className="size-3.5 shrink-0" aria-hidden="true" />}
                              {negative && <TrendingDown className="size-3.5 shrink-0" aria-hidden="true" />}
                            </dd>
                          </div>
                          {insight.detail && (
                            <p className="text-xs text-muted-foreground">
                              {insight.money ? money(Number(insight.detail)) : insight.detail}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Sales volume</CardTitle>
                <CardDescription>{`Completed sales per ${data === undefined ? "day" : data.bucket}`}</CardDescription>
              </CardHeader>
              <CardContent>
                {data === undefined ? (
                  <Skeleton className="h-56 w-full" />
                ) : (
                  <TimeSeriesChart series={data.series} bucket={data.bucket} metric="orders" kind="bar" className="h-56 w-full" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Revenue by product</CardTitle>
                <CardDescription>Top 6 products</CardDescription>
              </CardHeader>
              <CardContent>
                {data === undefined ? (
                  <Skeleton className="h-56 w-full" />
                ) : data.products.length === 0 ? (
                  <EmptyState title="No completed sales" />
                ) : (
                  <RankingChart
                    rows={data.products.slice(0, 6).map((p) => ({ name: p.name, value: p.revenueMinor }))}
                    money
                    className="h-56 w-full"
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sales by category</CardTitle>
                <CardDescription>Share of revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {data === undefined ? (
                  <Skeleton className="h-44 w-full" />
                ) : data.categories.length === 0 ? (
                  <EmptyState title="No completed sales" />
                ) : (
                  <DonutChart
                    rows={data.categories.map((c) => ({ name: c.name, value: c.revenueMinor }))}
                    centerLabel="Revenue"
                    className="h-44 w-full"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <Card className="gap-0 p-0">
        <CardHeader className="px-6 py-4">
          <CardTitle>Recent sales</CardTitle>
          <CardDescription>Latest transactions in this period, any status</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sales">
                View all
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          {sales.isError ? (
            <ErrorState error={sales.error} onRetry={() => sales.refetch()} />
          ) : sales.isPending ? (
            <div className="flex flex-col">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex h-9 items-center gap-3 border-b px-6 last:border-b-0">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : (sales.data?.total ?? 0) === 0 ? (
            <EmptyState title="No sales in this period" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">Customer</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden lg:table-cell">Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sales.data?.rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 whitespace-nowrap text-muted-foreground">{date(row.occurredAt)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{row.orderRef}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-56 truncate">
                        <span>{row.firstProduct ?? "—"}</span>
                        {row.itemCount > 1 && <span className="text-muted-foreground"> +{row.itemCount - 1}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={row.customerName === null ? "text-muted-foreground" : undefined}>
                        {row.customerName ?? "Walk-in"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{number(row.units)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(row.totalMinor)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {PAYMENT_LABELS[row.paymentMethod as PaymentMethod] ?? row.paymentMethod}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <SaleActions id={row.id} orderRef={row.orderRef} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
