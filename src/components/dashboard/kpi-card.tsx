"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Area, AreaChart } from "recharts";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { percentChange } from "@/lib/money";

export type KpiCardProps = {
  label: string;
  value: string;
  current: number;
  previous: number;
  spark?: number[];
  hint?: string;
};

function Sparkline({ id, values }: { id: string; values: number[] }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <AreaChart width={72} height={28} data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="value"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        fill={`url(#${id})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  );
}

export function KpiCard({ label, value, current, previous, spark, hint }: KpiCardProps) {
  const change = percentChange(current, previous);
  const showSpark = spark !== undefined && spark.length > 1;
  const gradientId = `spark-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const up = change !== null && change > 0.05;
  const down = change !== null && change < -0.05;
  const tone = up ? "bg-success/12 text-success" : down ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";

  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
        <div className="truncate text-2xl font-semibold tracking-tight tabular-nums" title={value}>
          {value}
        </div>
        <div className="flex min-h-7 items-center justify-between gap-2">
          {change === null ? (
            <span className="text-xs text-muted-foreground" title="Compared with the previous period of equal length">
              {hint ?? "No prior-period data"}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-1 font-mono text-[10px] font-bold ${tone}`}
              title="Compared with the previous period of equal length"
            >
              {up ? (
                <ArrowUpRight className="size-3" aria-hidden="true" />
              ) : down ? (
                <ArrowDownRight className="size-3" aria-hidden="true" />
              ) : (
                <Minus className="size-3" aria-hidden="true" />
              )}
              {(change > 0 ? "+" : "") + change.toFixed(1) + "%"}
              <span className="sr-only">vs previous period</span>
            </span>
          )}
          {showSpark ? <Sparkline id={gradientId} values={spark} /> : null}
        </div>
      </div>
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-28" />
      </div>
    </Card>
  );
}
