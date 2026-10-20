"use client";

import { Copy, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Confirm } from "@/components/common/confirm";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api-client";
import { PAYMENT_LABELS } from "@/lib/constants";
import { bpToPercentString } from "@/lib/money";
import { useApiMutation, useFormat, useSale } from "@/lib/queries";
import { useSaleDialog } from "@/lib/ui-store";

export function SaleActions({ id, orderRef }: { id: string; orderRef: string }) {
  const [viewOpen, setViewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { openEdit, openDuplicate } = useSaleDialog();
  const { data: sale } = useSale(viewOpen ? id : null);
  const { money, dateTime } = useFormat();

  const deleteMutation = useApiMutation((targetId: string) => api<{ deleted: number }>(`/api/sales/${targetId}`, { method: "DELETE" }));

  function confirmDelete() {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`Sale ${orderRef} deleted`);
        setConfirmOpen(false);
      },
      onError: (error) => toast.error("Could not delete sale", { description: errorMessage(error) }),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${orderRef}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setViewOpen(true)}>
            <Eye aria-hidden="true" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openEdit(id)}>
            <Pencil aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDuplicate(id)}>
            <Copy aria-hidden="true" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={sale ? "font-mono" : undefined}>{sale ? sale.orderRef : "Sale"}</DialogTitle>
            <DialogDescription>
              {sale ? `${dateTime(sale.occurredAt)} · ${sale.customerName ?? "Walk-in customer"}` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          {sale ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={sale.status} />
                <span className="text-xs text-muted-foreground">{PAYMENT_LABELS[sale.paymentMethod]}</span>
                {sale.isDemo && <Badge variant="secondary">Demo</Badge>}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Line</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        {item.categoryName && <div className="text-xs text-muted-foreground">{item.categoryName}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(item.unitPriceMinor)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(item.lineSubtotalMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-baseline justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-mono tabular-nums">{money(sale.subtotalMinor)}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="font-mono tabular-nums text-destructive">{`−${money(sale.discountMinor)}`}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-muted-foreground">Tax ({bpToPercentString(sale.taxRateBp)}%)</dt>
                  <dd className="font-mono tabular-nums">{money(sale.taxMinor)}</dd>
                </div>
                <div className="flex items-baseline justify-between font-semibold">
                  <dt>Total</dt>
                  <dd className="font-mono tabular-nums">{money(sale.totalMinor)}</dd>
                </div>
              </dl>
              {sale.notes ? (
                <p className="rounded-md border bg-muted/40 p-2.5 text-xs whitespace-pre-line text-muted-foreground">{sale.notes}</p>
              ) : null}
            </div>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </DialogContent>
      </Dialog>

      <Confirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete sale ${orderRef}?`}
        description="This permanently removes the sale and its line items from every report. To keep history, mark it Cancelled or Refunded instead."
        cancel="Keep sale"
        action="Delete sale"
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
    </>
  );
}
