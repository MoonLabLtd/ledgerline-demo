"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type MultiSelectProps<T extends string> = {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
};

export function MultiSelect<T extends string>({ label, options, labels, value, onChange }: MultiSelectProps<T>) {
  const toggle = (option: T) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          {label}
          {value.length > 0 && <span className="rounded-full bg-primary/12 px-1.5 text-xs tabular-nums text-primary">{value.length}</span>}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={value.includes(option)}
            onCheckedChange={() => toggle(option)}
            onSelect={(event) => event.preventDefault()}
          >
            {labels[option]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
