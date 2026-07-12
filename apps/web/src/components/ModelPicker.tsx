import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { pl } from '@/i18n/pl';
import { formatPricePerMillion } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CatalogModel } from '@/providers/openrouter-catalog';

interface ModelPickerProps {
  models: CatalogModel[];
  value: string | null;
  onSelect: (model: CatalogModel) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ModelPicker({
  models,
  value,
  onSelect,
  loading = false,
  disabled = false,
  placeholder,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);

  const selected = models.find((m) => m.id === value) ?? null;
  const list = onlyFree ? models.filter((m) => m.isFree) : models;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? selected.name : (placeholder ?? pl.setup.chooseModel)}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder={pl.setup.searchModel} />
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Switch id="only-free" checked={onlyFree} onCheckedChange={setOnlyFree} />
            <Label htmlFor="only-free" className="text-xs text-muted-foreground">
              {pl.setup.onlyFree}
            </Label>
          </div>
          <CommandList>
            <CommandEmpty>
              {loading ? pl.setup.loadingModels : pl.setup.noModels}
            </CommandEmpty>
            <CommandGroup heading="OpenRouter">
              {list.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name} ${m.id}`}
                  onSelect={() => {
                    onSelect(m);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0 text-p1',
                      value === m.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{m.name}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {m.id}
                    </span>
                  </div>
                  <div className="ml-auto shrink-0">
                    {m.isFree ? (
                      <Badge className="bg-p1/15 text-p1">free</Badge>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatPricePerMillion(m.pricePromptPerToken)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
