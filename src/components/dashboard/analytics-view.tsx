"use client";

import { AreaChart, BarChart3, Download, LineChart, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { DonutChart, RankingChart, TimeSeriesChart, type ChartKind, type SeriesMetric } from "@/components/dashboard/charts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { qs } from "@/lib/api-client";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/constants";
import type { Bucket } from "@/lib/date-range";
import { useDashboard, useDateRange, useFormat } from "@/lib/queries";
import { useUiStore } from "@/lib/ui-store";

type Grouping = "auto" | Bucket;

const METRICS: Array<{ value: SeriesMetric; label: string }> = [
  { value: "revenueMinor", label: "Revenue" },
  { value: "orders", label: "Sales" },
  { value: "aovMinor", label: "Avg. order" },
  { value: "units", label: "Units" },
];

const GROUPINGS: Array<{ value: Grouping; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const CHART_TYPES: Array<{ value: ChartKind; label: string; icon: LucideIcon }> = [
  { value: "area", label: "Area chart", icon: AreaChart },
  { value: "bar", label: "Bar chart", icon: BarChart3 },
  { value: "line", label: "Line chart", icon: LineChart },
];

const REPORT_ITEMS: Array<{ id: string; label: string }> = [
  { id: "timeseries", label: "Revenue over time" },
  { id: "products", label: "Product ranking" },
  { id: "categories", label: "Categories" },
  { id: "customers", label: "Customers" },
  { id: "payments", label: "Payment methods" },
];

const TABLE_SKELETON_KEYS = [0, 1, 2, 3];

const WEEKDAY_ORDER: Array<{ dow: number; label: string }> = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

function EmptyBreakdown() {
  return <p className="py-8 text-center text-sm text-muted-foreground">No completed sales in this period.</p>;
}

export function AnalyticsView() {
  const { range } = useDateRange();
  const { currency, money, number } = useFormat();
  const chartType = useUiStore((state) => state.chartType);
  const setChartType = useUiStore((state) => state.setChartType);
  const [bucket, setBucket] = useState<Grouping>("auto");
  const [metric, setMetric] = useState<SeriesMetric>("revenueMinor");
  const [rankBy, setRankBy] = useState<"revenue" | "units">("revenue");
  const { data, error, refetch } = useDashboard(range, bucket === "auto" ? undefined : bucket);

  if (error) {
    return (
      <div className="flex flex-col gap-4 pt-12 sm:pt-0">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const ranked = (data?.products ?? [])
    .map((product) => ({ name: product.name, value: rankBy === "revenue" ? product.revenueMinor : product.units }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const categoryRows = (data?.categories ?? []).map((category) => ({ name: category.name, value: category.revenueMinor }));
  const paymentRows = (data?.payments ?? []).map((payment) => ({
    name: PAYMENT_LABELS[payment.method as PaymentMethod] ?? payment.method,
    value: payment.revenueMinor,
  }));
  const weekdayRows = WEEKDAY_ORDER.map(({ dow, label }) => ({
    name: label,
    value: data?.weekdays.find((weekday) => weekday.dow === dow)?.revenueMinor ?? 0,
  }));
  const customerRows = (data?.customers ?? []).slice(0, 10);

  return (
    <div className="flex flex-col gap-4 pt-12 sm:pt-0 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {`Revenue = completed sales, net of discounts, excluding tax. All figures in ${currency}.`}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={range === null}>
              <Download aria-hidden="true" />
              Export report
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>CSV for the selected range</DropdownMenuLabel>
            {REPORT_ITEMS.map((report) => (
              <DropdownMenuItem key={report.id} asChild>
                <a href={"/api/reports/" + report.id + qs({ from: range?.from, to: range?.to })} download>
                  {report.label}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trends</CardTitle>
          <CardDescription>Dashed line shows the previous period of equal length.</CardDescription>
          <CardAction>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Tabs value={metric} onValueChange={(value) => setMetric(value as SeriesMetric)}>
                <TabsList aria-label="Metric">
                  {METRICS.map((item) => (
                    <TabsTrigger key={item.value} value={item.value}>
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Select value={bucket} onValueChange={(value) => setBucket(value as Grouping)}>
                <SelectTrigger size="sm" className="w-28" aria-label="Grouping">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPINGS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={chartType}
                onValueChange={(value) => value && setChartType(value as ChartKind)}
                aria-label="Chart type"
              >
                {CHART_TYPES.map((item) => {
                  const Icon = item.icon;
                  return (
                    <ToggleGroupItem key={item.value} value={item.value} aria-label={item.label}>
                      <Icon aria-hidden="true" />
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {data === undefined ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <TimeSeriesChart
              series={data.series}
              previous={data.previousSeries}
              bucket={data.bucket}
              metric={metric}
              kind={chartType}
              className="h-72 w-full"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Product ranking</CardTitle>
            <CardDescription>{rankBy === "revenue" ? "Top products by revenue" : "Top products by units sold"}</CardDescription>
            <CardAction>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={rankBy}
                onValueChange={(value) => value && setRankBy(value as "revenue" | "units")}
                aria-label="Product ranking measure"
              >
                <ToggleGroupItem value="revenue">Revenue</ToggleGroupItem>
                <ToggleGroupItem value="units">Units</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <Skeleton className="h-80 w-full" />
            ) : ranked.length === 0 ? (
              <EmptyBreakdown />
            ) : (
              <RankingChart rows={ranked} money={rankBy === "revenue"} className="h-80 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by category</CardTitle>
            <CardDescription>Share of completed revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <Skeleton className="h-80 w-full" />
            ) : categoryRows.length === 0 ? (
              <EmptyBreakdown />
            ) : (
              <DonutChart rows={categoryRows} className="h-80 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>Revenue by how customers paid</CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <Skeleton className="h-80 w-full" />
            ) : paymentRows.length === 0 ? (
              <EmptyBreakdown />
            ) : (
              <DonutChart rows={paymentRows} className="h-80 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Day of week</CardTitle>
            <CardDescription>Revenue by weekday (local time)</CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? <Skeleton className="h-56 w-full" /> : <RankingChart rows={weekdayRows} className="h-56 w-full" />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
            <CardDescription>Walk-in sales are grouped together</CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <div className="flex flex-col gap-2">
                {TABLE_SKELETON_KEYS.map((key) => (
                  <Skeleton key={key} className="h-9 w-full" />
                ))}
              </div>
            ) : customerRows.length === 0 ? (
              <EmptyBreakdown />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Avg. order</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerRows.map((customer) => (
                    <TableRow key={customer.customerId}>
                      <TableCell className={customer.customerId === "__walkin__" ? "font-medium text-muted-foreground" : "font-medium"}>
                        {customer.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{number(customer.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(customer.orders > 0 ? Math.round(customer.revenueMinor / customer.orders) : 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(customer.revenueMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales by status</CardTitle>
            <CardDescription>
              Only completed sales count toward revenue. Refunds are full refunds and remove the sale from revenue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <div className="flex flex-col gap-2">
                {TABLE_SKELETON_KEYS.map((key) => (
                  <Skeleton key={key} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Net amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.statuses.map((row) => (
                    <TableRow key={row.status}>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{number(row.orders)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(row.netMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
