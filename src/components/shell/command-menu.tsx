"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Receipt } from "lucide-react";

import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NAV } from "@/lib/nav";
import { useFormat, useSales } from "@/lib/queries";
import { useSaleDialog } from "@/lib/ui-store";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const openNew = useSaleDialog((state) => state.openNew);
  const openEdit = useSaleDialog((state) => state.openEdit);
  const { money } = useFormat();
  const [term, setTerm] = useState("");
  const trimmed = term.trim();
  const sales = useSales({ q: trimmed, pageSize: 6 }, open && trimmed.length >= 2);

  const run = (action: () => void) => {
    onOpenChange(false);
    setTerm("");
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page, find a sale or run an action">
      <Command>
        <CommandInput placeholder="Search pages, order IDs, products, customers…" value={term} onValueChange={setTerm} />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {trimmed.length >= 2 && (
            <CommandGroup heading="Sales">
              <CommandItem
                value={`search-all ${trimmed}`}
                onSelect={() => run(() => router.push(`/sales?q=${encodeURIComponent(trimmed)}`))}
              >
                <Receipt />
                <span>Search all sales for “{trimmed}”</span>
              </CommandItem>
              {sales.data?.rows.map((row) => (
                <CommandItem key={row.id} value={`sale ${row.id} ${trimmed}`} onSelect={() => run(() => openEdit(row.id))}>
                  <Receipt />
                  <span className="font-mono text-xs">{row.orderRef}</span>
                  <span className="truncate text-muted-foreground">{[row.firstProduct, row.customerName].filter(Boolean).join(" · ")}</span>
                  <span className="ml-auto tabular-nums">{money(row.totalMinor)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Actions">
            <CommandItem value="add sale" onSelect={() => run(openNew)}>
              <Plus />
              <span>Add sale</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Pages">
            {NAV.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => run(() => router.push(item.href))}>
                <item.icon />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
