"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Download, MoreHorizontal, Package, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Confirm } from "@/components/common/confirm";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";
import { toMajorString } from "@/lib/money";
import { useApiMutation, useCategories, useFormat, useProducts } from "@/lib/queries";
import { productFormSchema, productFormToInput, type ProductFormValues } from "@/lib/validation";
import type { CategoryRow, ProductRow } from "@/server/services/catalog";

const SEARCH_DEBOUNCE_MS = 250;
const LOADING_ROWS = 6;
const UNCATEGORIZED_VALUE = "__uncategorized__";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function ProductDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ProductForm key={product?.id ?? "new"} product={product} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const editing = product !== null;
  const categories = useCategories();

  const saveMutation = useApiMutation((values: ProductFormValues) => {
    const json = productFormToInput(values);
    return editing
      ? api<ProductRow>(`/api/products/${product.id}`, { method: "PUT", json })
      : api<ProductRow>("/api/products", { method: "POST", json });
  });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    mode: "onTouched",
    defaultValues: editing
      ? {
          name: product.name,
          sku: product.sku ?? "",
          categoryId: product.categoryId ?? "",
          description: product.description ?? "",
          price: toMajorString(product.defaultPriceMinor),
          cost: product.defaultCostMinor === null ? "" : toMajorString(product.defaultCostMinor),
        }
      : { name: "", sku: "", categoryId: "", description: "", price: "", cost: "" },
  });

  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    if (saveMutation.isPending) return;
    saveMutation.mutate(values, {
      onSuccess: () => {
        toast.success(editing ? "Product updated" : "Product added");
        onClose();
      },
      onError: (error) => toast.error("Could not save product", { description: errorMessage(error) }),
    });
  });

  return (
    <form noValidate aria-label={editing ? "Edit product" : "Add product"} className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
        <DialogDescription>Default price and cost prefill new sales; past sales are unchanged.</DialogDescription>
      </DialogHeader>

      <Field data-invalid={errors.name ? true : undefined}>
        <FieldLabel htmlFor="product-name">Name</FieldLabel>
        <Input id="product-name" autoFocus aria-invalid={errors.name ? true : undefined} {...form.register("name")} />
        <FieldError errors={[errors.name]} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={errors.sku ? true : undefined}>
          <FieldLabel htmlFor="product-sku">SKU</FieldLabel>
          <Input id="product-sku" placeholder="Optional" aria-invalid={errors.sku ? true : undefined} {...form.register("sku")} />
          <FieldError errors={[errors.sku]} />
        </Field>

        <Field data-invalid={errors.categoryId ? true : undefined}>
          <FieldLabel htmlFor="product-category">Category</FieldLabel>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value === "" ? UNCATEGORIZED_VALUE : field.value}
                onValueChange={(value) => field.onChange(value === UNCATEGORIZED_VALUE ? "" : value)}
              >
                <SelectTrigger id="product-category" className="w-full" aria-invalid={errors.categoryId ? true : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={UNCATEGORIZED_VALUE}>Uncategorized</SelectItem>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.categoryId]} />
        </Field>

        <Field data-invalid={errors.price ? true : undefined}>
          <FieldLabel htmlFor="product-price">Default price</FieldLabel>
          <Input
            id="product-price"
            inputMode="decimal"
            placeholder="0.00"
            aria-invalid={errors.price ? true : undefined}
            {...form.register("price")}
          />
          <FieldError errors={[errors.price]} />
        </Field>

        <Field data-invalid={errors.cost ? true : undefined}>
          <FieldLabel htmlFor="product-cost">Unit cost</FieldLabel>
          <Input
            id="product-cost"
            inputMode="decimal"
            placeholder="Optional"
            aria-invalid={errors.cost ? true : undefined}
            {...form.register("cost")}
          />
          <FieldError errors={[errors.cost]} />
        </Field>
      </div>

      <Field data-invalid={errors.description ? true : undefined}>
        <FieldLabel htmlFor="product-description">Description</FieldLabel>
        <Textarea
          id="product-description"
          rows={2}
          aria-invalid={errors.description ? true : undefined}
          {...form.register("description")}
        />
        <FieldError errors={[errors.description]} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {editing ? "Save changes" : "Add product"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ProductsTab() {
  const { money, number } = useFormat();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const products = useProducts({ q: query, archived: showArchived });
  const searching = query.length > 0;
  const rows = products.data ?? [];

  const archiveMutation = useApiMutation(({ product, archived }: { product: ProductRow; archived: boolean }) =>
    api<ProductRow>(`/api/products/${product.id}`, { method: "PATCH", json: { archived } }),
  );
  const deleteMutation = useApiMutation((product: ProductRow) =>
    api<{ deleted: number }>(`/api/products/${product.id}`, { method: "DELETE" }),
  );

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(product: ProductRow) {
    setEditing(product);
    setDialogOpen(true);
  }

  function toggleArchived(product: ProductRow) {
    const archived = !product.archived;
    archiveMutation.mutate(
      { product, archived },
      {
        onSuccess: () => toast.success(`${product.name} ${archived ? "archived" : "restored"}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  function confirmDelete() {
    if (deleting === null) return;
    deleteMutation.mutate(deleting, {
      onSuccess: () => {
        toast.success("Product deleted");
        setDeleting(null);
      },
      onError: (error) => toast.error("Could not delete product", { description: errorMessage(error) }),
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
            aria-label="Search products"
            placeholder="Name or SKU"
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
          Show archived
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a download href="/api/products/export">
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button onClick={openAdd}>
            <Plus aria-hidden="true" />
            Add product
          </Button>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.isPending ? (
          <div aria-busy="true" aria-label="Loading products" className="flex flex-col gap-2 p-4">
            {Array.from({ length: LOADING_ROWS }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          searching ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">No products match your search</p>
          ) : (
            <EmptyState
              className="min-h-[260px]"
              icon={Package}
              title="No products yet"
              description="Add products to your catalog, or create them on the fly while recording a sale."
              action={
                <Button onClick={openAdd}>
                  <Plus aria-hidden="true" />
                  Add product
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Cost</TableHead>
                  <TableHead className="text-right">Units sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((product) => (
                  <TableRow key={product.id} className={product.archived ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="max-w-56 min-w-0 truncate font-medium">{product.name}</span>
                        {product.archived && <Badge variant="outline">Archived</Badge>}
                        {product.isDemo && <span className="text-[10px] font-bold text-primary">Demo</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono text-xs">{product.sku || "—"}</span>
                    </TableCell>
                    <TableCell>{product.categoryName ?? <span className="text-muted-foreground">Uncategorized</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(product.defaultPriceMinor)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {product.defaultCostMinor === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        money(product.defaultCostMinor)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{number(product.unitsSold)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(product.revenueMinor)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${product.name}`}>
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEdit(product)}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </DropdownMenuItem>
                          {product.archived ? (
                            <DropdownMenuItem onSelect={() => toggleArchived(product)}>
                              <ArchiveRestore aria-hidden="true" />
                              Restore
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => toggleArchived(product)}>
                              <Archive aria-hidden="true" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(product)}>
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
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Units and revenue count completed sales only. Sales keep a snapshot of the product name, price and cost, so editing a product
              never rewrites history.
            </p>
          </>
        )}
      </Card>

      <ProductDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editing} />
      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="Products that appear in sales cannot be deleted; archive them instead to hide them from new sales."
        action="Delete product"
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
    </div>
  );
}

function CategoryRename({ category, onCancel }: { category: CategoryRow; onCancel: () => void }) {
  const [value, setValue] = useState(category.name);
  const trimmed = value.trim();
  const renameMutation = useApiMutation((name: string) =>
    api<CategoryRow>(`/api/categories/${category.id}`, { method: "PUT", json: { name } }),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === "" || renameMutation.isPending) return;
    renameMutation.mutate(trimmed, {
      onSuccess: () => {
        toast.success("Category renamed");
        onCancel();
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <form className="flex w-full items-center gap-2" onSubmit={submit}>
      <Input
        autoFocus
        aria-label="Category name"
        maxLength={60}
        className="max-w-[300px] flex-1"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <Button type="submit" disabled={trimmed === "" || renameMutation.isPending}>
        Save
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function CategoriesTab() {
  const categories = useCategories();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const trimmed = name.trim();
  const rows = categories.data ?? [];

  const createMutation = useApiMutation((value: string) => api<CategoryRow>("/api/categories", { method: "POST", json: { name: value } }));
  const deleteMutation = useApiMutation((category: CategoryRow) =>
    api<{ deleted: number }>(`/api/categories/${category.id}`, { method: "DELETE" }),
  );

  function submitNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === "" || createMutation.isPending) return;
    createMutation.mutate(trimmed, {
      onSuccess: () => {
        toast.success("Category added");
        setName("");
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  function confirmDelete() {
    if (deleting === null) return;
    deleteMutation.mutate(deleting, {
      onSuccess: () => {
        toast.success("Category deleted");
        setDeleting(null);
      },
      onError: (error) => toast.error("Could not delete category", { description: errorMessage(error) }),
    });
  }

  return (
    <div className="flex flex-col">
      <Card className="gap-0 overflow-hidden py-0">
        <form className="flex items-center gap-2.5 border-b p-4" onSubmit={submitNew}>
          <Input
            aria-label="New category name"
            placeholder="New category name"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={trimmed === "" || createMutation.isPending}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </form>

        {categories.isError ? (
          <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
        ) : categories.isPending ? (
          <div aria-busy="true" aria-label="Loading categories" className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState className="min-h-48" icon={Tags} title="No categories yet" description="Categories group products in reports." />
        ) : (
          rows.map((category) => (
            <div key={category.id} className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
              {renaming === category.id ? (
                <CategoryRename category={category} onCancel={() => setRenaming(null)} />
              ) : (
                <>
                  <span className="min-w-0 font-medium">{category.name}</span>
                  <span className="ml-auto text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {category.productCount} {category.productCount === 1 ? "product" : "products"}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Rename ${category.name}`} onClick={() => setRenaming(category.id)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${category.name}`} onClick={() => setDeleting(category)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">Renaming a category does not change the category recorded on past sales.</p>

      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete category ${deleting?.name ?? ""}?`}
        description="Only categories with no products can be deleted. Move or delete its products first."
        action="Delete category"
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
    </div>
  );
}

export function ProductsView() {
  return (
    <Tabs defaultValue="products" className="gap-4">
      <TabsList variant="line" className="w-full justify-start gap-4 border-b">
        <TabsTrigger value="products">
          <Package aria-hidden="true" />
          Products
        </TabsTrigger>
        <TabsTrigger value="categories">
          <Tags aria-hidden="true" />
          Categories
        </TabsTrigger>
      </TabsList>
      <TabsContent value="products" className="mx-auto w-full max-w-[1160px]">
        <ProductsTab />
      </TabsContent>
      <TabsContent value="categories" className="mx-auto w-full max-w-2xl">
        <CategoriesTab />
      </TabsContent>
    </Tabs>
  );
}
