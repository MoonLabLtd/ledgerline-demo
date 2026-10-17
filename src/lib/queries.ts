"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Settings } from "@/db/schema";
import { api, qs } from "@/lib/api-client";
import { resolveRange, type Bucket, type DateRange, type RangePreset, type RangeSelection } from "@/lib/date-range";
import { toMajorString } from "@/lib/money";
import { useUiStore } from "@/lib/ui-store";
import type { Dashboard } from "@/server/services/analytics";
import type { CategoryRow, ProductRow } from "@/server/services/catalog";
import type { CustomerRow } from "@/server/services/customers";
import type { SaleRow, SaleWithItems } from "@/server/services/sales";

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  currency: "USD",
  locale: "en-US",
  dateFormat: "MMM d, yyyy",
  defaultRange: "30d",
  updatedAt: 0,
};

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/api/settings"),
    staleTime: Infinity,
  });
}

export function useFormat() {
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;
  const locale = settings?.locale ?? DEFAULT_SETTINGS.locale;
  const dateFormat = settings?.dateFormat ?? DEFAULT_SETTINGS.dateFormat;
  return useMemo(() => {
    const moneyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    const compactFormatter = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    const numberFormatter = new Intl.NumberFormat(locale);
    return {
      currency,
      locale,
      money: (minor: number) => moneyFormatter.format(Number(toMajorString(minor))),
      compactMoney: (minor: number) => compactFormatter.format(Number(toMajorString(minor))),
      number: (n: number) => numberFormatter.format(n),
      date: (value: number | Date) => format(value, dateFormat),
      dateTime: (value: number | Date) => format(value, `${dateFormat}, HH:mm`),
    };
  }, [currency, locale, dateFormat]);
}

let minuteClock = 0;
let minuteTimer: ReturnType<typeof setInterval> | null = null;
const minuteListeners = new Set<() => void>();

function subscribeMinute(listener: () => void): () => void {
  minuteListeners.add(listener);
  if (minuteTimer === null) {
    minuteTimer = setInterval(() => {
      minuteClock = Math.floor(Date.now() / 60_000);
      for (const l of minuteListeners) l();
    }, 60_000);
  }
  return () => {
    minuteListeners.delete(listener);
    if (minuteListeners.size === 0 && minuteTimer !== null) {
      clearInterval(minuteTimer);
      minuteTimer = null;
    }
  };
}

function getMinuteClock(): number {
  const now = Math.floor(Date.now() / 60_000);
  if (now !== minuteClock) minuteClock = now;
  return minuteClock;
}

function getServerMinuteClock(): number {
  return 0;
}

export function useDateRange() {
  const { data: settings, isPending } = useSettings();
  const storedRange = useUiStore((state) => state.range);
  const setRange = useUiStore((state) => state.setRange);
  const minute = useSyncExternalStore(subscribeMinute, getMinuteClock, getServerMinuteClock);

  const settingsPending = storedRange === null && isPending;
  const range = useMemo(() => {
    if (minute === 0 || settingsPending) return null;
    const selection: RangeSelection = storedRange ?? { preset: (settings?.defaultRange ?? DEFAULT_SETTINGS.defaultRange) as RangePreset };
    return resolveRange(selection, new Date(minute * 60_000));
  }, [minute, settingsPending, storedRange, settings?.defaultRange]);

  const selection: RangeSelection = storedRange ?? {
    preset: (settings?.defaultRange ?? DEFAULT_SETTINGS.defaultRange) as RangePreset,
  };
  return { selection, range, setRange };
}

export function useDashboard(range: DateRange | null, bucket?: Bucket) {
  return useQuery({
    queryKey: ["dashboard", range?.from, range?.to, bucket ?? "auto"],
    queryFn: () => api<Dashboard>("/api/dashboard" + qs({ from: range?.from, to: range?.to, bucket })),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  });
}

export type SalesParams = {
  q?: string;
  status?: string[];
  paymentMethod?: string[];
  productId?: string;
  categoryId?: string;
  from?: number;
  to?: number;
  sort?: "date" | "amount" | "quantity" | "status";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export function useSales(params: SalesParams = {}, enabled = true) {
  return useQuery({
    queryKey: ["sales", params],
    queryFn: () => api<{ rows: SaleRow[]; total: number }>("/api/sales" + qs(params)),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useSale(id: string | null | undefined) {
  return useQuery({
    queryKey: ["sale", id],
    queryFn: () => api<SaleWithItems>(`/api/sales/${id}`),
    enabled: Boolean(id),
  });
}

export function useProducts(opts: { q?: string; archived?: boolean } = {}) {
  return useQuery({
    queryKey: ["products", opts],
    queryFn: () => api<ProductRow[]>("/api/products" + qs({ q: opts.q, archived: opts.archived ? 1 : undefined })),
    placeholderData: keepPreviousData,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api<CategoryRow[]>("/api/categories"),
  });
}

export function useCustomers(q?: string) {
  return useQuery({
    queryKey: ["customers", q ?? ""],
    queryFn: () => api<CustomerRow[]>("/api/customers" + qs({ q })),
    placeholderData: keepPreviousData,
  });
}

export function useInvalidateData() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "settings" }), [queryClient]);
}

export function useApiMutation<TData, TVariables = void>(fn: (variables: TVariables) => Promise<TData>) {
  const invalidate = useInvalidateData();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}
