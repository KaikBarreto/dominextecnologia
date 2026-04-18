import { useState } from 'react';
import { Check, ChevronsUpDown, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useBrazilBanks, getBankLogo, type BrazilBank } from '@/hooks/useBrazilBanks';

interface BankLogoProps {
  code?: number | string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function BankLogo({ code, name, size = 24, className }: BankLogoProps) {
  const [error, setError] = useState(false);
  const url = !error ? getBankLogo(code, name) : null;
  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        width={size}
        height={size}
        onError={() => setError(true)}
        className={cn('rounded object-contain bg-white', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn('rounded bg-muted flex items-center justify-center text-muted-foreground', className)}
      style={{ width: size, height: size }}
    >
      <Landmark className="h-3.5 w-3.5" />
    </div>
  );
}

interface BankInstitutionComboboxProps {
  value?: { code?: number | null; name?: string | null; ispb?: string | null } | null;
  onChange: (bank: { code: number | null; name: string; ispb?: string | null } | null) => void;
  placeholder?: string;
}

export function BankInstitutionCombobox({ value, onChange, placeholder = 'Selecione a instituição' }: BankInstitutionComboboxProps) {
  const [open, setOpen] = useState(false);
  const { banks, popular, loading } = useBrazilBanks();

  const handleSelect = (bank: BrazilBank) => {
    onChange({ code: bank.code, name: bank.name, ispb: bank.ispb });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value?.name ? (
            <span className="flex items-center gap-2 min-w-0">
              <BankLogo code={value.code} name={value.name} size={20} />
              <span className="truncate">{value.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{loading ? 'Carregando bancos...' : placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar banco..." />
          <CommandList>
            <CommandEmpty>{loading ? 'Carregando...' : 'Nenhum banco encontrado.'}</CommandEmpty>
            {popular.length > 0 && (
              <CommandGroup heading="Mais populares">
                {popular.map(b => (
                  <CommandItem key={`pop-${b.code}`} value={`${b.code} ${b.name}`} onSelect={() => handleSelect(b)}>
                    <BankLogo code={b.code} name={b.name} size={20} className="mr-2" />
                    <span className="truncate">{b.name}</span>
                    <Check className={cn('ml-auto h-4 w-4', value?.code === b.code ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Todos os bancos">
              {banks.map(b => (
                <CommandItem key={`all-${b.code}-${b.ispb}`} value={`${b.code} ${b.name}`} onSelect={() => handleSelect(b)}>
                  <BankLogo code={b.code} name={b.name} size={20} className="mr-2" />
                  <span className="truncate">{b.code ? `${String(b.code).padStart(3, '0')} - ` : ''}{b.name}</span>
                  <Check className={cn('ml-auto h-4 w-4', value?.code === b.code ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
