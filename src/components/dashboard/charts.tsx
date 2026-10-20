"use client";

import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatBucketLabel, type Bucket } from "@/lib/date-range";
import { useFormat } from "@/lib/queries";
import type { SeriesPoint } from "@/server/services/analytics";

export type SeriesMetric = "revenueMinor" | "orders" | "units" | "aovMinor";
export type ChartKind = "area" | "bar" | "line";

const METRIC_LABELS: Record<SeriesMetric, string> = {
  revenueMinor: "Revenue",
  orders: "Sales",
  units: "Units",
  aovMinor: "Avg. order value",
};

const MONEY_METRICS: SeriesMetric[] = ["revenueMinor", "aovMinor"];

type TimeSeriesChartProps = {
  series: SeriesPoint[];
  previous?: SeriesPoint[];
  bucket: Bucket;
  metric?: SeriesMetric;
  kind?: ChartKind;
  className?: string;
};

export function TimeSeriesChart({
  series,
  previous,
  bucket,
  metric = "revenueMinor",
  kind = "area",
  className = "h-64 w-full",
}: TimeSeriesChartProps) {
  const { money, number, compactMoney } = useFormat();
  const gradientId = useId().replace(/:/g, "");
  const isMoney = MONEY_METRICS.includes(metric);
  const hasPrevious = (previous?.length ?? 0) > 0;

  const data = series.map((point, index) => ({
    key: point.key,
    current: point[metric],
    previous: previous?.[index]?.[metric] ?? null,
  }));

  const config: ChartConfig = {
    current: { label: METRIC_LABELS[metric], color: "var(--chart-1)" },
    previous: { label: "Previous period", color: "var(--chart-muted)" },
  };

  const formatValue = (value: number) => (isMoney ? money(value) : number(value));
  const formatTick = (value: number) => (isMoney ? compactMoney(value) : number(value));

  const grid = <CartesianGrid horizontal vertical={false} />;
  const xAxis = (
    <XAxis
      dataKey="key"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={24}
      tickFormatter={(value) => formatBucketLabel(String(value), bucket)}
    />
  );
  const yAxis = (
    <YAxis tickLine={false} axisLine={false} width={64} allowDecimals={false} tickFormatter={(value) => formatTick(Number(value))} />
  );
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(value) => formatBucketLabel(String(value), bucket)}
          formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
              <span className="font-medium tabular-nums">{formatValue(Number(value))}</span>
            </div>
          )}
        />
      }
    />
  );

  return (
    <ChartContainer config={config} className={className}>
      {kind === "bar" ? (
        <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          <Bar dataKey="previous" hide={!hasPrevious} fill="var(--chart-muted)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="current" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
        </BarChart>
      ) : kind === "line" ? (
        <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          <Line
            type="monotone"
            dataKey="previous"
            hide={!hasPrevious}
            stroke="var(--chart-muted)"
            strokeDasharray="4 4"
            dot={false}
            strokeWidth={1.5}
          />
          <Line type="monotone" dataKey="current" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
        </LineChart>
      ) : (
        <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          <Area
            type="monotone"
            dataKey="previous"
            hide={!hasPrevious}
            stroke="var(--chart-muted)"
            strokeDasharray="4 4"
            fill="none"
            strokeWidth={1.5}
          />
          <Area type="monotone" dataKey="current" stroke="var(--chart-1)" strokeWidth={2} fill={`url(#${gradientId})`} />
        </AreaChart>
      )}
    </ChartContainer>
  );
}

export type RankingRow = { name: string; value: number };

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-muted)"];

const RANK_NAME_LIMIT = 18;

function truncateName(name: string) {
  return name.length > RANK_NAME_LIMIT ? `${name.slice(0, RANK_NAME_LIMIT - 1)}…` : name;
}

type RankingChartProps = {
  rows: RankingRow[];
  money?: boolean;
  className?: string;
};

export function RankingChart({ rows, money = true, className = "h-64 w-full" }: RankingChartProps) {
  const { money: formatMoney, number } = useFormat();
  const config: ChartConfig = { value: { label: money ? "Revenue" : "Value", color: "var(--chart-1)" } };
  const formatValue = (value: number) => (money ? formatMoney(value) : number(value));

  return (
    <ChartContainer config={config} className={className}>
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 4 }}>
        <CartesianGrid vertical horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => truncateName(String(value))}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => <span className="font-medium tabular-nums">{formatValue(Number(value))}</span>}
            />
          }
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

type DonutChartProps = {
  rows: RankingRow[];
  centerLabel?: string;
  className?: string;
};

export function DonutChart({ rows, centerLabel = "Total", className = "h-56 w-full" }: DonutChartProps) {
  const { money, compactMoney } = useFormat();
  const data =
    rows.length > 6 ? [...rows.slice(0, 5), { name: "Other", value: rows.slice(5).reduce((sum, row) => sum + row.value, 0) }] : rows;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const share = (value: number) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0.0%");
  const config: ChartConfig = { value: { label: centerLabel, color: "var(--chart-1)" } };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className={`relative aspect-square w-full max-w-56 shrink-0 ${className}`}>
        <ChartContainer config={config} className="h-full w-full">
          <PieChart accessibilityLayer>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{String(name)}</span>
                      <span className="font-medium tabular-nums">{money(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" stroke="var(--card)" strokeWidth={2}>
              {data.map((row, index) => (
                <Cell key={row.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold tabular-nums text-foreground">{compactMoney(total)}</span>
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul aria-hidden="true" className="flex w-full flex-1 flex-col gap-2.5">
        {data.map((row, index) => (
          <li key={row.name} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />
            <span className="truncate">{row.name}</span>
            <span className="tabular-nums text-muted-foreground">{share(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
