import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type Option = {
  label: string;
  value: string;
};

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  const selectedLabels = selected.map(
    (v) => options.find((o) => o.value === v)?.label || v
  );

  return (
    // `modal` matters when the MultiSelect sits inside a Dialog: the dialog's
    // scroll-lock swallows wheel events aimed at portaled popover content, so
    // the list can't be wheel-scrolled. A modal popover installs its own lock
    // that permits scrolling within the list itself.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            // See the note in combobox.tsx: a form control takes the card's
            // fill (`bg-transparent`), not the `outline` variant's page fill.
            "w-full justify-between min-h-[40px] h-auto flex-wrap gap-1 bg-transparent",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((label, idx) => (
                <Badge
                  key={`${label}-${idx}`}
                  variant="secondary"
                  className="text-xs px-1.5 py-0.5 gap-1"
                >
                  {label}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const opt = options.find((o) => o.label === label);
                      if (opt) handleRemove(opt.value);
                    }}
                  />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">
                {placeholder}
              </span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Match the trigger's width (Radix sets this var on the content),
          with a floor so the list stays readable if the trigger is narrow. */}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0 z-50">
        <Command>
          <CommandInput placeholder="Search..." className="h-9" />
          <CommandEmpty>No option found.</CommandEmpty>
          <CommandGroup className="max-h-[200px] overflow-y-auto">
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => handleSelect(option.value)}
                className="cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selected.includes(option.value)
                      ? "opacity-100"
                      : "opacity-0"
                  )}
                />
                {option.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
