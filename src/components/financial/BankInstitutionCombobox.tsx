import { useState } from 'react';
import { Check, ChevronsUpDown, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useBrazilBanks, getBankLogo, type BrazilBank } from '@/hooks/useBrazilBanks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface BankLogoProps {
  code?: number | string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /**
   * Selo branco arredondado atrás do logo — usar quando o `BankLogo` for
   * renderizado sobre um fundo colorido saturado (ex: card-herói do cartão).
   * A arte oficial de alguns bancos vem com o fundo da marca já embutido no
   * PNG (o roxo do Nubank, por exemplo); sem a pastilha, ela vira um
   * retângulo de cor destoante em cima do fundo colorido do card.
   * Default `false` preserva EXATAMENTE a aparência atual — opt-in.
   */
  plated?: boolean;
}

export function BankLogo({ code, name, size = 24, className, plated = false }: BankLogoProps) {
  const [error, setError] = useState(false);
  const url = !error ? getBankLogo(code, name) : null;
  const content = url ? (
    <img
      src={url}
      alt={name || ''}
      width={size}
      height={size}
      onError={() => setError(true)}
      className={cn('rounded object-contain bg-white', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className={cn('rounded bg-muted flex items-center justify-center text-muted-foreground', className)}
      style={{ width: size, height: size }}
    >
      <Landmark className="h-3.5 w-3.5" />
    </div>
  );

  if (!plated) return content;

  return (
    <div className="rounded-lg p-1 shrink-0 bg-white border border-white/20">
      {content}
    </div>
  );
}

interface BankInstitutionComboboxProps {
  value?: { code?: number | null; name?: string | null; ispb?: string | null } | null;
  onChange: (bank: { code: number | null; name: string; ispb?: string | null } | null) => void;
  placeholder?: string;
}

export function BankInstitutionCombobox({ value, onChange, placeholder }: BankInstitutionComboboxProps) {
  const [open, setOpen] = useState(false);
  const { banks, popular, loading } = useBrazilBanks();
  const { locale } = useAppLocaleContext();
  const bc = MESSAGES[locale].app.finance.bankCombobox;
  const resolvedPlaceholder = placeholder ?? bc.placeholder;

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
            <span className="text-muted-foreground">{loading ? bc.loading : resolvedPlaceholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={bc.searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{loading ? bc.searching : bc.empty}</CommandEmpty>
            {popular.length > 0 && (
              <CommandGroup heading={bc.headingPopular}>
                {popular.map(b => (
                  <CommandItem key={`pop-${b.code}`} value={`${b.code} ${b.name}`} onSelect={() => handleSelect(b)}>
                    <BankLogo code={b.code} name={b.name} size={20} className="mr-2" />
                    <span className="truncate">{b.name}</span>
                    <Check className={cn('ml-auto h-4 w-4', value?.code === b.code ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={bc.headingAll}>
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
