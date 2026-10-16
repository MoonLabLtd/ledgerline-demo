import { z } from "zod";

import { DATE_FORMATS, LOCALES, PAYMENT_METHODS, SALE_STATUSES } from "@/lib/constants";
import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";
import { CURRENCIES, MAX_QUANTITY, MAX_TAX_RATE_BP, MAX_UNIT_PRICE_MINOR, parseMoney, parsePercentToBp } from "@/lib/money";

export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined || value === null || value === "" ? null : value));
}

export const minor = z.int().min(0).max(MAX_UNIT_PRICE_MINOR);

export function moneyString(label: string, required = true) {
  const message = required ? `Enter a valid ${label}` : `Enter a valid ${label} or leave blank`;
  return z
    .string()
    .trim()
    .refine((value) => (required ? value !== "" && parseMoney(value) !== null : value === "" || parseMoney(value) !== null), {
      message,
    });
}

export const saleItemInputSchema = z
  .object({
    productId: z.string().min(1).nullable().optional(),
    newProduct: z
      .object({
        name: z.string().trim().min(1, "Product name is required").max(120, "Product name is required"),
        categoryName: optionalText(60),
        sku: optionalText(64),
      })
      .nullable()
      .optional(),
    quantity: z.int().min(1).max(MAX_QUANTITY),
    unitPriceMinor: minor,
    unitCostMinor: minor.nullable(),
  })
  .superRefine((value, ctx) => {
    const hasProductId = Boolean(value.productId);
    const hasNewProduct = Boolean(value.newProduct);
    if (hasProductId === hasNewProduct) {
      ctx.addIssue({ code: "custom", message: "Choose an existing product or create a new one", path: ["productId"] });
    }
  });

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const customerInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("walkin"), name: optionalText(120) }),
  z.object({ mode: z.literal("existing"), customerId: z.string().min(1) }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1, "Customer name is required").max(120),
    email: z
      .union([z.literal(""), z.email()])
      .optional()
      .nullable()
      .transform((value) => (value === "" || value === undefined ? null : value)),
    phone: optionalText(40),
  }),
]);

export type CustomerInput = z.infer<typeof customerInputSchema>;

export const saleInputSchema = z
  .object({
    occurredAt: z.int().positive(),
    orderRef: optionalText(64),
    customer: customerInputSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    status: z.enum(SALE_STATUSES),
    items: z.array(saleItemInputSchema).min(1, "Add at least one item").max(50),
    discountMinor: minor,
    taxRateBp: z.int().min(0).max(MAX_TAX_RATE_BP),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    const subtotalMinor = value.items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
    if (value.discountMinor > subtotalMinor) {
      ctx.addIssue({ code: "custom", message: "Discount cannot exceed the subtotal", path: ["discountMinor"] });
    }
  });

export type SaleInput = z.infer<typeof saleInputSchema>;

export const salesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.array(z.enum(SALE_STATUSES)).optional(),
  paymentMethod: z.array(z.enum(PAYMENT_METHODS)).optional(),
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  sort: z.enum(["date", "amount", "quantity", "status"]).default("date"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type SalesQuery = z.infer<typeof salesQuerySchema>;

function scalarParam(sp: URLSearchParams, key: string): string | undefined {
  const value = sp.get(key);
  return value === null || value === "" ? undefined : value;
}

function listParam(sp: URLSearchParams, key: string): string[] | undefined {
  const value = sp.get(key);
  if (value === null || value === "") return undefined;
  const items = value.split(",").filter((item) => item !== "");
  return items.length === 0 ? undefined : items;
}

export function parseSalesQuery(sp: URLSearchParams): SalesQuery {
  return salesQuerySchema.parse({
    q: scalarParam(sp, "q"),
    status: listParam(sp, "status"),
    paymentMethod: listParam(sp, "paymentMethod"),
    productId: scalarParam(sp, "productId"),
    categoryId: scalarParam(sp, "categoryId"),
    from: scalarParam(sp, "from"),
    to: scalarParam(sp, "to"),
    sort: scalarParam(sp, "sort"),
    dir: scalarParam(sp, "dir"),
    page: scalarParam(sp, "page"),
    pageSize: scalarParam(sp, "pageSize"),
  });
}

export const rangeQuerySchema = z
  .object({
    from: z.coerce.number().int(),
    to: z.coerce.number().int(),
  })
  .superRefine((value, ctx) => {
    if (value.to <= value.from) {
      ctx.addIssue({ code: "custom", message: "Invalid date range", path: ["to"] });
      return;
    }
    if (value.to - value.from > 1000 * 86_400_000 * 11) {
      ctx.addIssue({ code: "custom", message: "Date range too large", path: ["to"] });
    }
  });

export type RangeQuery = z.infer<typeof rangeQuerySchema>;

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export const saleFormItemSchema = z
  .object({
    productMode: z.enum(["existing", "new"]),
    productId: z.string(),
    productName: z.string(),
    categoryName: z.string(),
    quantity: z
      .string()
      .trim()
      .refine(
        (value) => {
          if (!/^\d+$/.test(value)) return false;
          const parsed = Number(value);
          return parsed >= 1 && parsed <= MAX_QUANTITY;
        },
        { message: "Quantity must be a whole number from 1 to 100,000" },
      ),
    unitPrice: moneyString("price").refine((value) => (parseMoney(value) ?? 0) <= MAX_UNIT_PRICE_MINOR, {
      message: "Price is too large",
    }),
    unitCost: moneyString("cost", false),
  })
  .superRefine((value, ctx) => {
    if (value.productMode === "existing" && value.productId.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Select a product", path: ["productId"] });
    }
    if (value.productMode === "new" && value.productName.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Product name is required", path: ["productName"] });
    }
  });

export type SaleFormItemValues = z.infer<typeof saleFormItemSchema>;

export const saleFormSchema = z
  .object({
    occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time"),
    orderRef: z.string().max(64),
    customerMode: z.enum(["walkin", "existing", "new"]),
    customerId: z.string(),
    customerName: z.string().max(120),
    customerEmail: z.union([z.literal(""), z.email("Enter a valid email")]),
    paymentMethod: z.enum(PAYMENT_METHODS),
    status: z.enum(SALE_STATUSES),
    items: z.array(saleFormItemSchema).min(1, "Add at least one item"),
    discount: moneyString("discount", false),
    taxRate: z
      .string()
      .trim()
      .refine(
        (value) => {
          const bp = parsePercentToBp(value);
          return bp !== null && bp <= MAX_TAX_RATE_BP;
        },
        { message: "Tax rate must be between 0 and 100%" },
      ),
    notes: z.string().max(2000),
  })
  .superRefine((value, ctx) => {
    if (value.customerMode === "existing" && value.customerId.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Select a customer", path: ["customerId"] });
    }
    if (value.customerMode === "new" && value.customerName.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Customer name is required", path: ["customerName"] });
    }
    const subtotalMinor = value.items.reduce((sum, item) => {
      const price = parseMoney(item.unitPrice) ?? 0;
      const parsedQuantity = Number.parseInt(item.quantity, 10);
      const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
      return sum + quantity * price;
    }, 0);
    if ((parseMoney(value.discount || "0") ?? 0) > subtotalMinor) {
      ctx.addIssue({ code: "custom", message: "Discount cannot exceed the subtotal", path: ["discount"] });
    }
  });

export type SaleFormValues = z.infer<typeof saleFormSchema>;

export function saleFormToInput(form: SaleFormValues): SaleInput {
  const [datePart, timePart] = form.occurredAt.split("T");
  const [year, month, day] = datePart.split("-").map((part) => Number.parseInt(part, 10));
  const [hours, minutes] = timePart.split(":").map((part) => Number.parseInt(part, 10));

  const customer: CustomerInput =
    form.customerMode === "walkin"
      ? { mode: "walkin", name: trimOrNull(form.customerName) }
      : form.customerMode === "existing"
        ? { mode: "existing", customerId: form.customerId.trim() }
        : { mode: "new", name: form.customerName.trim(), email: trimOrNull(form.customerEmail), phone: null };

  const items: SaleItemInput[] = form.items.map((item) => ({
    productId: item.productMode === "existing" ? item.productId.trim() : null,
    newProduct:
      item.productMode === "new" ? { name: item.productName.trim(), categoryName: trimOrNull(item.categoryName), sku: null } : null,
    quantity: Number.parseInt(item.quantity, 10),
    unitPriceMinor: parseMoney(item.unitPrice) ?? 0,
    unitCostMinor: item.unitCost.trim() === "" ? null : parseMoney(item.unitCost),
  }));

  return {
    occurredAt: new Date(year, month - 1, day, hours, minutes).getTime(),
    orderRef: trimOrNull(form.orderRef),
    customer,
    paymentMethod: form.paymentMethod,
    status: form.status,
    items,
    discountMinor: parseMoney(form.discount || "0") ?? 0,
    taxRateBp: parsePercentToBp(form.taxRate) ?? 0,
    notes: trimOrNull(form.notes),
  };
}

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is required"),
  sku: optionalText(64),
  categoryId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  description: optionalText(1000),
  defaultPriceMinor: minor,
  defaultCostMinor: minor
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  archived: z.boolean().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name is required"),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const customerRecordSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is required"),
  email: z
    .union([z.literal(""), z.email("Enter a valid email")])
    .optional()
    .nullable()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  phone: optionalText(40),
  notes: optionalText(2000),
});

export type CustomerRecord = z.infer<typeof customerRecordSchema>;

export const settingsInputSchema = z.object({
  currency: z.enum(CURRENCIES),
  locale: z.enum(LOCALES),
  dateFormat: z.enum(DATE_FORMATS),
  defaultRange: z.enum(RANGE_PRESETS.filter((preset) => preset !== "custom") as [RangePreset, ...RangePreset[]]),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is required"),
  sku: z.string().max(64),
  categoryId: z.string(),
  description: z.string().max(1000),
  price: moneyString("price").refine((value) => (parseMoney(value) ?? 0) <= MAX_UNIT_PRICE_MINOR, {
    message: "Price is too large",
  }),
  cost: moneyString("cost", false),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is required"),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: z.string().max(40),
  notes: z.string().max(2000),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export function productFormToInput(form: ProductFormValues): ProductInput {
  return {
    name: form.name.trim(),
    sku: trimOrNull(form.sku),
    categoryId: trimOrNull(form.categoryId),
    description: trimOrNull(form.description),
    defaultPriceMinor: parseMoney(form.price) ?? 0,
    defaultCostMinor: form.cost.trim() === "" ? null : parseMoney(form.cost),
  };
}
