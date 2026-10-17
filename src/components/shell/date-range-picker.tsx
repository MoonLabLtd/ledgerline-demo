"use client";

import { addDays } from "date-fns";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange as DayRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { dayKey, parseDay, PRESET_LABELS, RANGE_PRESETS } from "@/lib/date-range";
import { useDateRange, useFormat } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function DateRangePicker({ className }: { className?: string }) {
  const { selection, range, setRange } = useDateRange();
  const { date } = useFormat();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange>();
  const [today, setToday] = useState<Date>();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      if (!today) setToday(new Date());
      setDraft(
        selection.preset === "custom" && selection.customFrom
          ? { from: parseDay(selection.customFrom), to: selection.customTo ? parseDay(selection.customTo) : undefined }
          : undefined,
      );
    }
  };

  const label =
    selection.preset === "custom" && range
      ? `${date(range.from)} – ${date(addDays(new Date(range.to), -1))}`
      : PRESET_LABELS[selection.preset];

  const defaultMonth = useMemo(() => {
    if (draft?.from) return draft.from;
    if (range) return addDays(new Date(range.to), -1);
    return undefined;
  }, [draft, range]);

  const apply = () => {
    if (!draft?.from) return;
    setRange({
      preset: "custom",
      customFrom: dayKey(draft.from),
      customTo: dayKey(draft.to ?? draft.from),
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="default" aria-label={`Date range: ${label}`} className={className}>
          <CalendarDays />
          <span className="truncate">{label}</span>
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto flex-col gap-0 p-0 sm:flex-row">
        <div className="flex min-w-0 flex-row items-center gap-1 overflow-x-auto p-2 sm:w-40 sm:flex-col sm:items-stretch sm:overflow-visible">
          <p className="hidden px-2 py-1 text-xs font-medium text-muted-foreground sm:block">Presets</p>
          <div className="flex shrink-0 flex-row gap-1 sm:flex-col" aria-label="Presets">
            {RANGE_PRESETS.filter((preset) => preset !== "custom").map((preset) => (
              <Button
                key={preset}
                variant={selection.preset === preset ? "secondary" : "ghost"}
                size="sm"
                className="justify-start sm:w-full"
                onClick={() => {
                  setRange({ preset });
                  setOpen(false);
                }}
              >
                {PRESET_LABELS[preset]}
              </Button>
            ))}
          </div>
        </div>
        <Separator orientation="vertical" className="hidden h-auto sm:block" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draft}
            onSelect={(value) => setDraft(value ?? undefined)}
            disabled={today ? { after: today } : undefined}
            defaultMonth={defaultMonth}
          />
          <div className={cn("flex items-center justify-end gap-2 border-t pt-3")}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!draft?.from} onClick={apply}>
              Apply range
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
