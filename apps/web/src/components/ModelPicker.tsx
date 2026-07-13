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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import { formatPricePerMillion } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SelectableModel } from '@/providers/models';

interface ModelPickerProps {
  models: SelectableModel[];
  value: string | null;
  onSelect: (model: SelectableModel) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function ModelRow({ model, selected }: { model: SelectableModel; selected: boolean }) {
  return (
    <>
      <Check
        className={cn('size-4 shrink-0 text-p1', selected ? 'opacity-100' : 'opacity-0')}
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{model.name}</span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {model.id}
        </span>
      </div>
      <div className="ml-auto shrink-0">
        {model.isFree ? (
          <Badge className="bg-p1/15 text-p1">free</Badge>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatPricePerMillion(model.price?.prompt ?? 0)}
          </span>
        )}
      </div>
    </>
  );
}

export function ModelPicker({
  models,
  value,
  onSelect,
  loading = false,
  disabled = false,
  placeholder,
}: ModelPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);

  const selected = models.find((m) => m.id === value) ?? null;
  const openRouter = models.filter(
    (m) => m.provider === 'openrouter' && (!onlyFree || m.isFree),
  );
  const webllm = models.filter((m) => m.provider === 'webllm');
  const ollama = models.filter((m) => m.provider === 'ollama');

  const renderItem = (model: SelectableModel) => (
    <CommandItem
      key={model.id}
      value={`${model.name} ${model.id}`}
      onSelect={() => {
        onSelect(model);
        setOpen(false);
      }}
      className="flex items-center gap-2"
    >
      <ModelRow model={model} selected={value === model.id} />
    </CommandItem>
  );

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
            {selected ? selected.name : (placeholder ?? t.setup.chooseModel)}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder={t.setup.searchModel} />
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Switch id="only-free" checked={onlyFree} onCheckedChange={setOnlyFree} />
            <Label htmlFor="only-free" className="text-xs text-muted-foreground">
              {t.setup.onlyFree}
            </Label>
          </div>
          <CommandList>
            <CommandEmpty>
              {loading ? t.setup.loadingModels : t.setup.noModels}
            </CommandEmpty>
            {webllm.length > 0 && (
              <CommandGroup heading={t.setup.providerWebllm}>
                {webllm.map(renderItem)}
              </CommandGroup>
            )}
            {ollama.length > 0 && (
              <CommandGroup heading={t.setup.providerOllama}>
                {ollama.map(renderItem)}
              </CommandGroup>
            )}
            {openRouter.length > 0 && (
              <CommandGroup heading={t.setup.providerOpenRouter}>
                {openRouter.map(renderItem)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
