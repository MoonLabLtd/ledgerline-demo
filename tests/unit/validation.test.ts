import { describe, it, expect } from "vitest";
import { saleFormSchema, saleFormToInput, saleInputSchema, type SaleFormValues } from "@/lib/validation";

const base: SaleFormValues = {
  occurredAt: "2026-03-10T09:30",
  orderRef: "",
  customerId: "",
  customerName: "",
  customerEmail: "",
  discount: "",
  notes: "",
  customerMode: "walkin",
  paymentMethod: "card",
  status: "completed",
  items: [
    {
      productMode: "new",
      productId: "",
      productName: "Mug",
      categoryName: "Merch",
      quantity: "2",
      unitPrice: "12.50",
      unitCost: "",
    },
  ],
  taxRate: "10",
};

function form(patch: Partial<SaleFormValues> = {}): SaleFormValues {
  return { ...base, ...patch };
}

const baseItem: SaleFormValues["items"][number] = base.items[0];

describe("validation", () => {
  it("accepts a valid sale form and converts it to a canonical sale input", () => {
    expect(saleFormSchema.safeParse(form()).success).toBe(true);

    const input = saleFormToInput(form());
    expect(input.items[0].quantity).toBe(2);
    expect(input.items[0].unitPriceMinor).toBe(1250);
    expect(input.items[0].unitCostMinor).toBeNull();
    expect(input.items[0].newProduct).toMatchObject({ name: "Mug", categoryName: "Merch" });
    expect(input.taxRateBp).toBe(1000);
    expect(input.occurredAt).toBe(new Date(2026, 2, 10, 9, 30).getTime());
    expect(saleInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ["zero quantity", { items: [{ ...baseItem, quantity: "0" }] }, "items.0.quantity"],
    ["fractional quantity", { items: [{ ...baseItem, quantity: "1.5" }] }, "items.0.quantity"],
    ["bad price", { items: [{ ...baseItem, unitPrice: "12.345" }] }, "items.0.unitPrice"],
    ["missing product", { items: [{ ...baseItem, productMode: "existing", productId: "" }] }, "items.0.productId"],
    ["tax over 100%", { taxRate: "101" }, "taxRate"],
    ["discount over subtotal", { discount: "30" }, "discount"],
    ["new customer without name", { customerMode: "new", customerName: "" }, "customerName"],
    ["bad email", { customerMode: "new", customerName: "Ann", customerEmail: "nope" }, "customerEmail"],
    ["no items", { items: [] as SaleFormValues["items"] }, "items"],
  ] as [string, Partial<SaleFormValues>, string][])("rejects %s", (_name, patch, path) => {
    const result = saleFormSchema.safeParse(form(patch));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(path);
  });

  it("rejects a wire item with both or neither product source", () => {
    const wire = {
      occurredAt: new Date(2026, 2, 10, 9, 30).getTime(),
      orderRef: null,
      customer: { mode: "walkin", name: null },
      paymentMethod: "card",
      status: "completed",
      items: [
        {
          productId: "p1",
          newProduct: { name: "X", categoryName: null, sku: null },
          quantity: 1,
          unitPriceMinor: 100,
          unitCostMinor: null,
        },
      ],
      discountMinor: 0,
      taxRateBp: 0,
      notes: null,
    };
    const both = { ...wire, items: [{ ...wire.items[0], newProduct: { name: "X", categoryName: null, sku: null } }] };
    const neither = { ...wire, items: [{ ...wire.items[0], productId: null, newProduct: null }] };
    expect(saleInputSchema.safeParse(both).success).toBe(false);
    expect(saleInputSchema.safeParse(neither).success).toBe(false);
  });

  it("rejects a fractional discount on the wire schema", () => {
    const input = {
      occurredAt: new Date(2026, 2, 10, 9, 30).getTime(),
      orderRef: null,
      customer: { mode: "walkin", name: null },
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: "p1", newProduct: null, quantity: 1, unitPriceMinor: 100, unitCostMinor: null }],
      discountMinor: 1.5,
      taxRateBp: 0,
      notes: null,
    };
    expect(saleInputSchema.safeParse(input).success).toBe(false);
  });
});
