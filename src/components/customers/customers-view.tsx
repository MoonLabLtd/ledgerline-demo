"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Confirm } from "@/components/common/confirm";
import { EmptyState, ErrorState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/constants";
import { useApiMutation, useCustomers, useFormat } from "@/lib/queries";
import { useSaleDialog } from "@/lib/ui-store";
import { customerFormSchema, type CustomerFormValues } from "@/lib/validation";
import type { CustomerRow, HistoryRow } from "@/server/services/customers";

const SEARCH_DEBOUNCE_MS = 250;
const LOADING_ROWS = 6;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CustomerForm key={customer?.id ?? "new"} customer={customer} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ customer, onClose }: { customer: CustomerRow | null; onClose: () => void }) {
  const editing = customer !== null;

  const saveMutation = useApiMutation((values: CustomerFormValues) =>
    editing
      ? api<CustomerRow>(`/api/customers/${customer.id}`, { method: "PUT", json: values })
      : api<CustomerRow>("/api/customers", { method: "POST", json: values }),
  );

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    mode: "onTouched",
    defaultValues: editing
      ? { name: customer.name, email: customer.email ?? "", phone: customer.phone ?? "", notes: customer.notes ?? "" }
      : { name: "", email: "", phone: "", notes: "" },
  });

  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    if (saveMutation.isPending) return;
    saveMutation.mutate(values, {
      onSuccess: () => {
        toast.success(editing ? "Customer updated" : "Customer added");
        onClose();
      },
      onError: (error) => toast.error("Could not save customer", { description: errorMessage(error) }),
    });
  });

  return (
    <form noValidate aria-label={editing ? "Edit customer" : "Add customer"} className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
        <DialogDescription>Contact details are optional and stay on this machine.</DialogDescription>
      </DialogHeader>

      <Field data-invalid={errors.name ? true : undefined}>
        <FieldLabel htmlFor="customer-name">Name</FieldLabel>
        <Input id="customer-name" autoFocus aria-invalid={errors.name ? true : undefined} {...form.register("name")} />
        <FieldError errors={[errors.name]} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="customer-email">Email</FieldLabel>
          <Input
            id="customer-email"
            type="email"
            placeholder="Optional"
            aria-invalid={errors.email ? true : undefined}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={errors.phone ? true : undefined}>
          <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
          <Input
            id="customer-phone"
            type="tel"
            placeholder="Optional"
            aria-invalid={errors.phone ? true : undefined}
            {...form.register("phone")}
          />
          <FieldError errors={[errors.phone]} />
        </Field>
      </div>

      <Field data-invalid={errors.notes ? true : undefined}>
        <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
        <Textarea id="customer-notes" rows={3} aria-invalid={errors.notes ? true : undefined} {...form.register("notes")} />
        <FieldError errors={[errors.notes]} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {editing ? "Save changes" : "Add customer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <b className="block font-mono text-[15px] font-semibold text-foreground">{value}</b>
      <span className="mt-1 block text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function CustomerHistorySheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const { money, number, date } = useFormat();
  const openEdit = useSaleDialog((state) => state.openEdit);
  const detail = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api<{ customer: CustomerRow; history: HistoryRow[] }>(`/api/customers/${id}`),
    enabled: id !== null,
  });

  const customer = detail.data?.customer;
  const history = detail.data?.history ?? [];
  const completed = history.filter((row) => row.status === "completed");
  const orders = completed.length;
  const revenue = completed.reduce((sum, row) => sum + row.netMinor, 0);
  const average = orders === 0 ? null : Math.round(revenue / orders);

  return (
    <Sheet
      open={id !== null}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b px-6 pt-5 pb-4">
          <SheetTitle>{customer?.name ?? "Customer"}</SheetTitle>
          <SheetDescription>{[customer?.email, customer?.phone].filter(Boolean).join(" · ") || "Purchase history"}</SheetDescription>
        </SheetHeader>

        {detail.isError ? (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : detail.isPending ? (
          <div aria-busy="true" aria-label="Loading customer history" className="min-h-40 p-6">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-6 py-5">
            <div className="grid grid-cols-3 gap-2">
              <StatTile value={money(revenue)} label="Revenue" />
              <StatTile value={number(orders)} label="Orders" />
              <StatTile value={average === null ? "—" : money(average)} label="Avg. order" />
            </div>

            {customer?.notes ? (
              <p className="mt-4 rounded-md border bg-muted/40 p-3.5 text-sm whitespace-pre-line text-foreground">{customer.notes}</p>
            ) : null}

            {history.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No sales recorded for this customer yet.</p>
            ) : (
              <div className="mt-4 border-t">
                {history.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="grid w-full grid-cols-[1fr_96px] items-center gap-3 border-b py-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => openEdit(row.id)}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate font-mono text-xs font-semibold text-foreground">{row.orderRef}</strong>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {date(row.occurredAt)} · {PAYMENT_LABELS[row.paymentMethod as PaymentMethod] ?? row.paymentMethod}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5">
                      <StatusBadge status={row.status} />
                      <b className="font-mono text-xs font-semibold text-foreground">{money(row.totalMinor)}</b>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Revenue excludes tax and counts completed sales only. Showing up to 200 most recent sales.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CustomersView() {
  const { money, number, date } = useFormat();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const customers = useCustomers(query);
  const searching = query.length > 0;
  const rows = customers.data ?? [];

  const deleteMutation = useApiMutation((customer: CustomerRow) =>
    api<{ deleted: number }>(`/api/customers/${customer.id}`, { method: "DELETE" }),
  );

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(customer: CustomerRow) {
    setEditing(customer);
    setDialogOpen(true);
  }

  function confirmDelete() {
    if (deleting === null) return;
    deleteMutation.mutate(deleting, {
      onSuccess: () => {
        toast.success("Customer deleted");
        setDeleting(null);
      },
      onError: (error) => toast.error("Could not delete customer", { description: errorMessage(error) }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search customers"
            placeholder="Name, email or phone"
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a download href="/api/customers/export">
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button onClick={openAdd}>
            <Plus aria-hidden="true" />
            Add customer
          </Button>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {customers.isError ? (
          <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
        ) : customers.isPending ? (
          <div aria-busy="true" aria-label="Loading customers" className="flex flex-col gap-2 p-4">
            {Array.from({ length: LOADING_ROWS }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          searching ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">No customers match your search</p>
          ) : (
            <EmptyState
              className="min-h-[260px]"
              icon={Users}
              title="No customers yet"
              description="Customers are optional. Walk-in sales are recorded without a customer record."
              action={
                <Button onClick={openAdd}>
                  <Plus aria-hidden="true" />
                  Add customer
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Last sale</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="max-w-56 min-w-0 truncate rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                          onClick={() => setHistoryId(customer.id)}
                        >
                          {customer.name}
                        </button>
                        {customer.isDemo && <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Demo</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{customer.email || "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{customer.phone || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(customer.orders)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(customer.revenueMinor)}</TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      {customer.lastSaleAt === null ? <span className="text-muted-foreground">—</span> : date(customer.lastSaleAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${customer.name}`}>
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setHistoryId(customer.id)}>
                            <Users aria-hidden="true" />
                            View history
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openEdit(customer)}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(customer)}>
                            <Trash2 aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">Orders and revenue count completed sales only.</p>
          </>
        )}
      </Card>

      <CustomerDialog open={dialogOpen} onOpenChange={setDialogOpen} customer={editing} />
      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="Customers with recorded sales cannot be deleted, so their history stays intact."
        action="Delete customer"
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
      <CustomerHistorySheet
        id={historyId}
        onOpenChange={(open) => {
          if (!open) setHistoryId(null);
        }}
      />
    </div>
  );
}
