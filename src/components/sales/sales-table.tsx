"use client";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type RowSelectionState,
  type SortDirection,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Receipt, Search, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Confirm } from "@/components/common/confirm";
import { MultiSelect } from "@/components/common/multi-select";
import { EmptyState, ErrorState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { SaleActions } from "@/components/sales/sale-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, qs } from "@/lib/api-client";
import {
  PAGE_SIZES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  SALE_STATUSES,
  STATUS_LABELS,
  type PaymentMethod,
  type SaleStatus,
} from "@/lib/constants";
import { PRESET_LABELS, RANGE_PRESETS, resolveRange, type DateRange, type RangePreset } from "@/lib/date-range";
import { useApiMutation, useCategories, useFormat, useProducts, useSales, type SalesParams } from "@/lib/queries";
import { useSaleDialog, useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import type { SaleRow } from "@/server/services/sales";

const features = tableFeatures({ rowPaginationFeature, rowSortingFeature, rowSelectionFeature });
const helper = createColumnHelper<typeof features, SaleRow>();
const EMPTY: SaleRow[] = [];

const ALL = "all";

const DATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL, label: "All time" },
  ...RANGE_PRESETS.filter((preset) => preset !== "custom").map((preset) => ({ value: preset, label: PRESET_LABELS[preset] })),
];

type SortableColumn = {
  getIsSorted: () => false | SortDirection;
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
};

function SortButton({ column, label }: { column: SortableColumn; label: string }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" onClick={column.getToggleSortingHandler()}>
      {label}
      <Icon aria-hidden="true" className={sorted === false ? "text-muted-foreground/60" : undefined} />
    </Button>
  );
}

export function SalesTable() {
  const searchParams = useSearchParams();
  const externalQ = searchParams.get("q") ?? "";

  const storePageSize = useUiStore((state) => state.salesPageSize);
  const setSalesPageSize = useUiStore((state) => state.setSalesPageSize);
  const openNew = useSaleDialog((state) => state.openNew);
  const { money, dateTime } = useFormat();

  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: storePageSize });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [searchInput, setSearchInput] = useState(externalQ);
  const [debouncedQ, setDebouncedQ] = useState(externalQ.trim());
  const [prevSeed, setPrevSeed] = useState(externalQ);
  const [dateValue, setDateValue] = useState(ALL);
  const [range, setRange] = useState<DateRange | null>(null);
  const [statusFilter, setStatusFilter] = useState<SaleStatus[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod[]>([]);
  const [categoryValue, setCategoryValue] = useState(ALL);
  const [productValue, setProductValue] = useState(ALL);
  const [bulkOpen, setBulkOpen] = useState(false);

  const filters: SalesParams = {
    q: debouncedQ,
    status: statusFilter,
    paymentMethod: paymentFilter,
    productId: productValue === ALL ? undefined : productValue,
    categoryId: categoryValue === ALL ? undefined : categoryValue,
    from: range?.from,
    to: range?.to,
  };
  const key = JSON.stringify(filters);

  const primarySort = sorting[0];
  const sort: "date" | "amount" | "quantity" | "status" =
    primarySort?.id === "date" || primarySort?.id === "amount" || primarySort?.id === "quantity" || primarySort?.id === "status"
      ? primarySort.id
      : "date";
  const dir: "asc" | "desc" = primarySort?.desc === true ? "desc" : "asc";

  const sales = useSales({
    ...filters,
    sort,
    dir,
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });
  const categoriesQuery = useCategories();
  const productsQuery = useProducts({ archived: true });
  const bulkDeleteMutation = useApiMutation((ids: string[]) => api<{ deleted: number }>("/api/sales", { method: "DELETE", json: { ids } }));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setRowSelection({});
  }

  if (externalQ !== prevSeed) {
    setPrevSeed(externalQ);
    setSearchInput(externalQ);
    setDebouncedQ(externalQ.trim());
  }

  if (storePageSize !== pagination.pageSize) {
    setPagination((p) => ({ ...p, pageIndex: 0, pageSize: storePageSize }));
  }

  const lastPageIndex = Math.max(0, Math.ceil((sales.data?.total ?? 0) / pagination.pageSize) - 1);
  if (sales.data && !sales.isPlaceholderData && pagination.pageIndex > lastPageIndex) {
    setPagination((p) => ({ ...p, pageIndex: lastPageIndex }));
  }

  function handleSortingChange(updater: Updater<SortingState>) {
    setSorting(updater);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function handleDateChange(value: string) {
    setDateValue(value);
    setRange(value === ALL ? null : resolveRange({ preset: value as Exclude<RangePreset, "custom"> }, new Date()));
  }

  function handleRowsPerPageChange(value: string) {
    const nextSize = Number(value);
    setSalesPageSize(nextSize);
    setPagination((p) => ({ ...p, pageSize: nextSize, pageIndex: 0 }));
  }

  const anyFilter =
    debouncedQ !== "" ||
    range !== null ||
    statusFilter.length > 0 ||
    paymentFilter.length > 0 ||
    categoryValue !== ALL ||
    productValue !== ALL;

  function clearFilters() {
    setSearchInput("");
    setDebouncedQ("");
    setDateValue(ALL);
    setRange(null);
    setStatusFilter([]);
    setPaymentFilter([]);
    setCategoryValue(ALL);
    setProductValue(ALL);
  }

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: ({ table }) => (
            <Checkbox
              aria-label="Select all on this page"
              checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Select ${row.original.orderRef}`}
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
            />
          ),
        }),
        helper.accessor("occurredAt", {
          id: "date",
          header: ({ column }) => <SortButton column={column} label="Date" />,
          cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{dateTime(getValue())}</span>,
        }),
        helper.accessor("orderRef", {
          id: "orderRef",
          header: "Order",
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        }),
        helper.accessor("firstProduct", {
          id: "firstProduct",
          header: "Product",
          cell: ({ row, getValue }) => {
            const name = getValue<string | null>();
            return (
              <span className="block max-w-[224px] truncate">
                <span className={name === null ? "text-muted-foreground" : undefined}>{name ?? "—"}</span>
                {row.original.itemCount > 1 && <span className="text-muted-foreground"> +{row.original.itemCount - 1} more</span>}
              </span>
            );
          },
        }),
        helper.accessor("customerName", {
          id: "customerName",
          header: "Customer",
          cell: ({ getValue }) => {
            const name = getValue<string | null>();
            return (
              <span className={cn("block max-w-[160px] truncate", name === null && "text-muted-foreground")}>{name ?? "Walk-in"}</span>
            );
          },
        }),
        helper.accessor("units", {
          id: "quantity",
          header: ({ column }) => <SortButton column={column} label="Qty" />,
          cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
        }),
        helper.accessor("totalMinor", {
          id: "amount",
          header: ({ column }) => <SortButton column={column} label="Total" />,
          cell: ({ getValue }) => <span className="font-medium tabular-nums">{money(getValue())}</span>,
        }),
        helper.accessor("paymentMethod", {
          id: "paymentMethod",
          header: "Payment",
          cell: ({ getValue }) => {
            const method = getValue<string>();
            return <span>{PAYMENT_LABELS[method as PaymentMethod] ?? method}</span>;
          },
        }),
        helper.accessor("status", {
          id: "status",
          header: ({ column }) => <SortButton column={column} label="Status" />,
          cell: ({ row }) => (
            <span className="inline-flex items-center gap-2">
              <StatusBadge status={row.original.status} />
              {row.original.isDemo && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Demo</span>}
            </span>
          ),
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => <SaleActions id={row.original.id} orderRef={row.original.orderRef} />,
        }),
      ]),
    [money, dateTime],
  );

  const state = useMemo(() => ({ sorting, pagination, rowSelection }), [sorting, pagination, rowSelection]);

  const table = useTable({
    features,
    columns,
    data: sales.data?.rows ?? EMPTY,
    rowCount: sales.data?.total ?? 0,
    state,
    onSortingChange: handleSortingChange,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    sortDescFirst: true,
  });

  const total = sales.data?.total ?? 0;
  const count = Object.keys(rowSelection).length;
  const pageSize = pagination.pageSize;
  const pageIndex = pagination.pageIndex;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);
  const exportHref = "/api/sales/export" + qs({ ...filters, sort, dir });

  function confirmBulkDelete() {
    const ids = Object.keys(rowSelection);
    bulkDeleteMutation.mutate(ids, {
      onSuccess: (result) => {
        toast.success(`${result.deleted} sales deleted`);
        setBulkOpen(false);
        table.resetRowSelection();
      },
      onError: (e) => {
        setBulkOpen(false);
        toast.error("Could not delete sales", { description: errorMessage(e) });
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon align="inline-start">
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            aria-label="Search sales"
            placeholder="Order ID, product or customer"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </InputGroup>
        <Select value={dateValue} onValueChange={handleDateChange}>
          <SelectTrigger className="w-36" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelect label="Status" options={SALE_STATUSES} labels={STATUS_LABELS} value={statusFilter} onChange={setStatusFilter} />
        <MultiSelect label="Payment" options={PAYMENT_METHODS} labels={PAYMENT_LABELS} value={paymentFilter} onChange={setPaymentFilter} />
        <Select value={categoryValue} onValueChange={setCategoryValue}>
          <SelectTrigger className="w-40" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {(categoriesQuery.data ?? []).map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={productValue} onValueChange={setProductValue}>
          <SelectTrigger className="w-44" aria-label="Product">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All products</SelectItem>
            {(productsQuery.data ?? []).map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X aria-hidden="true" />
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a download href={exportHref}>
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button size="sm" className="sm:hidden" onClick={openNew}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      {count > 0 && (
        <div role="status" className="flex min-h-10 flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
          <span className="font-medium text-foreground">{count} selected</span>
          <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()}>
            Clear selection
          </Button>
          <div className="flex-1" />
          <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
            <Trash2 aria-hidden="true" />
            Delete selected
          </Button>
        </div>
      )}

      <Card className="gap-0 p-0">
        {sales.isError ? (
          <ErrorState error={sales.error} onRetry={() => sales.refetch()} />
        ) : sales.isPending ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex h-9 items-center gap-3 border-b px-4 last:border-b-0">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : total === 0 && anyFilter ? (
          <EmptyState
            icon={Receipt}
            title="No sales match these filters"
            description="Try removing a filter or widening the date range."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : total === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales yet"
            description="Record your first sale, or load demo data from Settings."
            action={
              <Button size="sm" onClick={openNew}>
                <Plus aria-hidden="true" />
                Add sale
              </Button>
            }
          />
        ) : (
          <div className={cn("overflow-x-auto", sales.isPlaceholderData && "opacity-60 transition-opacity")}>
            <Table aria-busy={sales.isFetching && !sales.isPending}>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => {
                      const id = header.column.id;
                      const sorted = header.column.getIsSorted();
                      const isNumeric = id === "quantity" || id === "amount";
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                          className={cn(
                            isNumeric && "text-right",
                            id === "select" && "w-10 pl-4! pr-0!",
                            id === "actions" && "w-10 pr-4! pl-0! text-right",
                          )}
                        >
                          {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          (cell.column.id === "quantity" || cell.column.id === "amount") && "text-right",
                          cell.column.id === "select" && "w-10 pl-4! pr-0!",
                          cell.column.id === "actions" && "w-10 pr-4! pl-0! text-right",
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {total > 0 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">
              {first}–{last}
            </span>{" "}
            of {total.toLocaleString()}
          </span>
          <label className="flex items-center gap-2">
            Rows
            <Select value={String(pageSize)} onValueChange={handleRowsPerPageChange}>
              <SelectTrigger size="sm" className="w-20" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <span className="tabular-nums text-muted-foreground">
            Page {pageIndex + 1} of {pages}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={pageIndex === 0}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={pageIndex >= pages - 1}
              onClick={() => table.nextPage()}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

      <Confirm
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Delete ${count} sales?`}
        description="These sales and their line items are removed from every report. This cannot be undone."
        cancel="Cancel"
        action="Delete sales"
        onConfirm={confirmBulkDelete}
        pending={bulkDeleteMutation.isPending}
      />
    </div>
  );
}
