"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSaleDialog } from "@/lib/ui-store";

export function SaleDialog() {
  const { open, close } = useSaleDialog();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add sale</SheetTitle>
          <SheetDescription>The sale form arrives in the next release.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
