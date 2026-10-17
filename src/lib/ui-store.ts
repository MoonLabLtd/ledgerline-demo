import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RangeSelection } from "@/lib/date-range";

export type ChartType = "area" | "bar" | "line";

type UiState = {
  sidebarOpen: boolean;
  range: RangeSelection | null;
  chartType: ChartType;
  salesPageSize: number;
  setSidebarOpen: (open: boolean) => void;
  setRange: (range: RangeSelection | null) => void;
  setChartType: (chartType: ChartType) => void;
  setSalesPageSize: (pageSize: number) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      range: null,
      chartType: "area",
      salesPageSize: 25,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setRange: (range) => set({ range }),
      setChartType: (chartType) => set({ chartType }),
      setSalesPageSize: (salesPageSize) => set({ salesPageSize }),
    }),
    { name: "sales-dashboard-ui", version: 1, skipHydration: true },
  ),
);

type SaleDialogState = {
  open: boolean;
  saleId: string | null;
  duplicateId: string | null;
  openNew: () => void;
  openEdit: (id: string) => void;
  openDuplicate: (id: string) => void;
  close: () => void;
};

export const useSaleDialog = create<SaleDialogState>()((set) => ({
  open: false,
  saleId: null,
  duplicateId: null,
  openNew: () => set({ open: true, saleId: null, duplicateId: null }),
  openEdit: (id) => set({ open: true, saleId: id, duplicateId: null }),
  openDuplicate: (id) => set({ open: true, saleId: null, duplicateId: id }),
  close: () => set({ open: false }),
}));
