"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, errorMessage } from "@/lib/api-client";
import { PAYMENT_LABELS, PAYMENT_METHODS, SALE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  bpToPercentString,
  computeSaleTotals,
  MAX_TAX_RATE_BP,
  parseMoney,
  parsePercentToBp,
  toMajorString,
  type SaleTotals,
} from "@/lib/money";
import { useApiMutation, useCustomers, useFormat, useProducts, useSale } from "@/lib/queries";
import type { ProductRow } from "@/server/services/catalog";
import type { SaleWithItems } from "@/server/services/sales";
import { useSaleDialog } from "@/lib/ui-store";
import { saleFormSchema, saleFormToInput, type SaleFormItemValues, type SaleFormValues } from "@/lib/validation";

type SaleDialogMode = "new" | "edit" | "duplicate";

const MAX_ITEMS = 50;

const HEADER_COPY: Record<SaleDialogMode, { title: string; description: string }> = {
  new: { title: "Add sale", description: "Record a transaction. Amounts are in your reporting currency." },
  edit: { title: "Edit sale", description: "Changes update every report that includes this sale." },
  duplicate: { title: "Duplicate sale", description: "Record a transaction. Amounts are in your reporting currency." },
};

function nowStamp(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

function emptyItem(): SaleFormItemValues {
  return {
    productMode: "existing",
    productId: "",
    productName: "",
    categoryName: "",
    quantity: "1",
    unitPrice: "",
    unitCost: "",
  };
}

function newSaleDefaults(): SaleFormValues {
  return {
    occurredAt: nowStamp(),
    orderRef: "",
    customerMode: "walkin",
    customerId: "",
    customerName: "",
    customerEmail: "",
    paymentMethod: "card",
    status: "completed",
    items: [emptyItem()],
    discount: "",
    taxRate: "0",
    notes: "",
  };
}

function saleDefaults(mode: SaleDialogMode, sale: SaleWithItems): SaleFormValues {
  const linked = sale.customerId !== null;
  return {
    occurredAt: mode === "duplicate" ? nowStamp() : format(sale.occurredAt, "yyyy-MM-dd'T'HH:mm"),
    orderRef: mode === "duplicate" ? "" : sale.orderRef,
    customerMode: linked ? "existing" : "walkin",
    customerId: sale.customerId ?? "",
    customerName: linked ? "" : (sale.customerName ?? ""),
    customerEmail: "",
    paymentMethod: sale.paymentMethod,
    status: mode === "duplicate" ? "completed" : sale.status,
    items: sale.items.map((item) => ({
      productMode: item.productId !== null ? "existing" : "new",
      productId: item.productId ?? "",
      productName: item.productId !== null ? "" : item.productName,
      categoryName: item.productId !== null ? "" : (item.categoryName ?? ""),
      quantity: String(item.quantity),
      unitPrice: toMajorString(item.unitPriceMinor),
      unitCost: item.unitCostMinor === null ? "" : toMajorString(item.unitCostMinor),
    })),
    discount: sale.discountMinor === 0 ? "" : toMajorString(sale.discountMinor),
    taxRate: bpToPercentString(sale.taxRateBp),
    notes: sale.notes ?? "",
  };
}

function computeTotals(values: SaleFormValues): SaleTotals | null {
  try {
    const lines = values.items.map((item) => ({
      quantity: Math.max(0, Number.parseInt(item.quantity, 10) || 0),
      unitPriceMinor: parseMoney(item.unitPrice) ?? 0,
      unitCostMinor: item.unitCost.trim() === "" ? null : parseMoney(item.unitCost),
    }));
    const subtotalMinor = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
    const discountMinor = Math.min(subtotalMinor, Math.max(0, parseMoney(values.discount || "0") ?? 0));
    const taxRateBp = Math.min(MAX_TAX_RATE_BP, Math.max(0, parsePercentToBp(values.taxRate || "0") ?? 0));
    return computeSaleTotals(lines, discountMinor, taxRateBp);
  } catch {
    return null;
  }
}

function TotalsPanel({ control, money }: { control: Control<SaleFormValues>; money: (minor: number) => string }) {
  const totals = useWatch<SaleFormValues, SaleFormValues, SaleTotals | null>({ control, compute: computeTotals });
  if (totals === null) {
    return null;
  }

  return (
    <div aria-live="polite" className="border-t bg-muted/40 px-6 py-3 text-sm tabular-nums">
      <dl className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <dt>Subtotal</dt>
          <dd>{money(totals.subtotalMinor)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Discount</dt>
          <dd>−{money(totals.discountMinor)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Tax</dt>
          <dd>{money(totals.taxMinor)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium">Total</dt>
          <dd className="font-semibold">{money(totals.totalMinor)}</dd>
        </div>
      </dl>
    </div>
  );
}

type SaleItemCardProps = {
  form: UseFormReturn<SaleFormValues>;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  products: ProductRow[] | undefined;
  productsPending: boolean;
};

function SaleItemCard({ form, index, canRemove, onRemove, products, productsPending }: SaleItemCardProps) {
  const itemErrors = form.formState.errors.items?.[index];
  const productMode = form.watch(`items.${index}.productMode`);
  const label = `Item ${index + 1}`;

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <Controller
            control={form.control}
            name={`items.${index}.productMode`}
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Product source"
                value={field.value}
                onValueChange={(value) => {
                  if (value === "existing" || value === "new") field.onChange(value);
                }}
              >
                <ToggleGroupItem value="existing">Catalog product</ToggleGroupItem>
                <ToggleGroupItem value="new">New product</ToggleGroupItem>
              </ToggleGroup>
            )}
          />
          {canRemove && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove item ${index + 1}`} onClick={onRemove}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {productMode === "existing" ? (
        <Controller
          control={form.control}
          name={`items.${index}.productId`}
          render={({ field, fieldState }) => {
            const options = (products ?? []).filter((product) => !product.archived || product.id === field.value);
            return (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={`item-${index}-product`}>Product</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const product = products?.find((item) => item.id === value);
                    if (product) {
                      form.setValue(`items.${index}.unitPrice`, toMajorString(product.defaultPriceMinor), { shouldValidate: true });
                      form.setValue(
                        `items.${index}.unitCost`,
                        product.defaultCostMinor === null ? "" : toMajorString(product.defaultCostMinor),
                        { shouldValidate: true },
                      );
                    }
                  }}
                >
                  <SelectTrigger id={`item-${index}-product`} className="w-full" aria-invalid={fieldState.error ? true : undefined}>
                    <SelectValue placeholder={productsPending ? "Loading products…" : "Select a product"} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {options.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.archived ? `${product.name} (archived)` : product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!productsPending && options.length === 0 && (
                  <p className="text-sm text-muted-foreground">No products yet — choose “New product”.</p>
                )}
                <FieldError errors={[fieldState.error]} />
              </Field>
            );
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={itemErrors?.productName ? true : undefined}>
            <FieldLabel htmlFor={`item-${index}-name`}>Product name</FieldLabel>
            <Input
              id={`item-${index}-name`}
              {...form.register(`items.${index}.productName`)}
              aria-invalid={itemErrors?.productName ? true : undefined}
            />
            <FieldError errors={[itemErrors?.productName]} />
          </Field>
          <Field data-invalid={itemErrors?.categoryName ? true : undefined}>
            <FieldLabel htmlFor={`item-${index}-category`}>Category</FieldLabel>
            <Input
              id={`item-${index}-category`}
              placeholder="e.g. Coffee"
              {...form.register(`items.${index}.categoryName`)}
              aria-invalid={itemErrors?.categoryName ? true : undefined}
            />
            <FieldError errors={[itemErrors?.categoryName]} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field data-invalid={itemErrors?.quantity ? true : undefined}>
          <FieldLabel htmlFor={`item-${index}-qty`}>Qty</FieldLabel>
          <Input
            id={`item-${index}-qty`}
            inputMode="numeric"
            {...form.register(`items.${index}.quantity`)}
            aria-invalid={itemErrors?.quantity ? true : undefined}
          />
          <FieldError errors={[itemErrors?.quantity]} />
        </Field>
        <Field data-invalid={itemErrors?.unitPrice ? true : undefined}>
          <FieldLabel htmlFor={`item-${index}-price`}>Unit price</FieldLabel>
          <Input
            id={`item-${index}-price`}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register(`items.${index}.unitPrice`)}
            aria-invalid={itemErrors?.unitPrice ? true : undefined}
          />
          <FieldError errors={[itemErrors?.unitPrice]} />
        </Field>
        <Field data-invalid={itemErrors?.unitCost ? true : undefined}>
          <FieldLabel htmlFor={`item-${index}-cost`}>Unit cost</FieldLabel>
          <Input
            id={`item-${index}-cost`}
            inputMode="decimal"
            placeholder="Optional"
            {...form.register(`items.${index}.unitCost`)}
            aria-invalid={itemErrors?.unitCost ? true : undefined}
          />
          <FieldError errors={[itemErrors?.unitCost]} />
        </Field>
      </div>
    </div>
  );
}

type SaleFormProps = {
  mode: SaleDialogMode;
  sale: SaleWithItems | null;
  saleId: string | null;
};

function SaleForm({ mode, sale, saleId }: SaleFormProps) {
  const close = useSaleDialog((state) => state.close);
  const { money, currency } = useFormat();
  const productsQuery = useProducts({ archived: true });
  const customersQuery = useCustomers();

  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleFormSchema),
    mode: "onTouched",
    defaultValues: mode === "new" || sale === null ? newSaleDefaults() : saleDefaults(mode, sale),
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const errors = form.formState.errors;
  const customerMode = useWatch({ control: form.control, name: "customerMode" });
  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  const saveMutation = useApiMutation((values: SaleFormValues) => {
    const json = saleFormToInput(values);
    return saleId !== null && mode === "edit"
      ? api<SaleWithItems>("/api/sales/" + saleId, { method: "PUT", json })
      : api<SaleWithItems>("/api/sales", { method: "POST", json });
  });

  const onSubmit = form.handleSubmit((values) => {
    if (saveMutation.isPending) return;
    saveMutation.mutate(values, {
      onSuccess: (saved) => {
        toast.success(mode === "edit" ? "Sale updated" : "Sale recorded", {
          description: `${saved.orderRef} · ${money(saved.totalMinor)}`,
        });
        close();
      },
      onError: (e) => {
        toast.error("Could not save sale", { description: errorMessage(e) });
      },
    });
  });

  return (
    <form noValidate aria-label={mode === "edit" ? "Edit sale" : "Add sale"} className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={errors.occurredAt ? true : undefined}>
              <FieldLabel htmlFor="occurredAt">Date &amp; time</FieldLabel>
              <Input
                id="occurredAt"
                type="datetime-local"
                {...form.register("occurredAt")}
                aria-invalid={errors.occurredAt ? true : undefined}
              />
              <FieldError errors={[errors.occurredAt]} />
            </Field>
            <Field data-invalid={errors.orderRef ? true : undefined}>
              <FieldLabel htmlFor="orderRef">Order reference</FieldLabel>
              <Input
                id="orderRef"
                placeholder="Auto-generated if blank"
                {...form.register("orderRef")}
                aria-invalid={errors.orderRef ? true : undefined}
              />
              <FieldError errors={[errors.orderRef]} />
            </Field>
          </div>

          <FieldSet>
            <FieldLegend>Items</FieldLegend>
            {fields.map((field, index) => (
              <SaleItemCard
                key={field.id}
                form={form}
                index={index}
                canRemove={fields.length > 1}
                onRemove={() => remove(index)}
                products={productsQuery.data}
                productsPending={productsQuery.isPending}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => append(emptyItem())}
              disabled={fields.length >= MAX_ITEMS}
            >
              <Plus />
              Add item
            </Button>
            {itemsError !== undefined && <FieldError>{itemsError}</FieldError>}
          </FieldSet>

          <FieldSet>
            <FieldLegend>Customer</FieldLegend>
            <Controller
              control={form.control}
              name="customerMode"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-label="Customer type"
                  value={field.value}
                  onValueChange={(value) => {
                    if (value === "walkin" || value === "existing" || value === "new") field.onChange(value);
                  }}
                >
                  <ToggleGroupItem value="walkin">Walk-in</ToggleGroupItem>
                  <ToggleGroupItem value="existing">Existing</ToggleGroupItem>
                  <ToggleGroupItem value="new">New</ToggleGroupItem>
                </ToggleGroup>
              )}
            />
            {customerMode === "walkin" ? (
              <Field data-invalid={errors.customerName ? true : undefined}>
                <FieldLabel htmlFor="customerName">Name on receipt (optional)</FieldLabel>
                <Input
                  id="customerName"
                  placeholder="Walk-in customer"
                  {...form.register("customerName")}
                  aria-invalid={errors.customerName ? true : undefined}
                />
                <FieldError errors={[errors.customerName]} />
              </Field>
            ) : customerMode === "existing" ? (
              <Controller
                control={form.control}
                name="customerId"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.error ? true : undefined}>
                    <FieldLabel className="sr-only" htmlFor="customerId">
                      Customer
                    </FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="customerId" className="w-full" aria-invalid={fieldState.error ? true : undefined}>
                        <SelectValue placeholder={customersQuery.isPending ? "Loading customers…" : "Select a customer"} />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {(customersQuery.data ?? []).map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={errors.customerName ? true : undefined}>
                  <FieldLabel htmlFor="customerName">Name</FieldLabel>
                  <Input id="customerName" {...form.register("customerName")} aria-invalid={errors.customerName ? true : undefined} />
                  <FieldError errors={[errors.customerName]} />
                </Field>
                <Field data-invalid={errors.customerEmail ? true : undefined}>
                  <FieldLabel htmlFor="customerEmail">Email (optional)</FieldLabel>
                  <Input
                    id="customerEmail"
                    type="email"
                    {...form.register("customerEmail")}
                    aria-invalid={errors.customerEmail ? true : undefined}
                  />
                  <FieldError errors={[errors.customerEmail]} />
                </Field>
              </div>
            )}
          </FieldSet>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.error ? true : undefined}>
                  <FieldLabel htmlFor="paymentMethod">Payment method</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="paymentMethod" className="w-full" aria-invalid={fieldState.error ? true : undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {PAYMENT_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="status"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.error ? true : undefined}>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full" aria-invalid={fieldState.error ? true : undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {SALE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Field data-invalid={errors.discount ? true : undefined}>
              <FieldLabel htmlFor="discount">Discount</FieldLabel>
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <InputGroupText>{currency}</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="discount"
                  inputMode="decimal"
                  placeholder="0.00"
                  {...form.register("discount")}
                  aria-invalid={errors.discount ? true : undefined}
                />
              </InputGroup>
              <FieldError errors={[errors.discount]} />
            </Field>
            <Field data-invalid={errors.taxRate ? true : undefined}>
              <FieldLabel htmlFor="taxRate">Tax rate</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="taxRate"
                  inputMode="decimal"
                  {...form.register("taxRate")}
                  aria-invalid={errors.taxRate ? true : undefined}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={[errors.taxRate]} />
            </Field>
          </div>

          <Field data-invalid={errors.notes ? true : undefined}>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" rows={2} {...form.register("notes")} aria-invalid={errors.notes ? true : undefined} />
            <FieldError errors={[errors.notes]} />
          </Field>
        </div>
      </div>

      <TotalsPanel control={form.control} money={money} />
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting || saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {mode === "edit" ? "Save changes" : "Record sale"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function SaleDialog() {
  const { open, saleId, duplicateId, close } = useSaleDialog();
  const mode: SaleDialogMode = saleId !== null ? "edit" : duplicateId !== null ? "duplicate" : "new";
  const loadId = saleId ?? duplicateId;
  const saleQuery = useSale(open ? loadId : null);
  const loading = loadId !== null && saleQuery.isPending;
  const failed = loadId !== null && saleQuery.isError;
  const needsSale = loadId !== null;
  const sale = needsSale ? (saleQuery.data ?? null) : null;
  const header = HEADER_COPY[mode];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent side="right" className="w-full data-[side=right]:w-full data-[side=right]:sm:max-w-xl p-0 gap-0">
        <SheetHeader className="border-b px-6 pb-4 pt-5">
          <SheetTitle>{header.title}</SheetTitle>
          <SheetDescription>{header.description}</SheetDescription>
        </SheetHeader>
        {loading ? (
          <div aria-busy="true" className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-32" />
          </div>
        ) : failed ? (
          <p className="min-h-0 flex-1 px-6 py-5 text-destructive">{errorMessage(saleQuery.error)}</p>
        ) : needsSale && sale === null ? null : (
          <SaleForm key={`${saleId ?? ""}|${duplicateId ?? ""}`} mode={mode} sale={sale} saleId={saleId} />
        )}
      </SheetContent>
    </Sheet>
  );
}
