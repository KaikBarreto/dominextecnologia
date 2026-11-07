import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/SearchableSelect';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, fuzzyIncludes } from '@/lib/utils';

/** No celular, a lista já aparece aberta: evita um seletor dentro do modal. */
export function QuoteServicePickerField({ groups, value, onValueChange, onSearchChange, placeholder, searchPlaceholder }: {
  groups: SearchableSelectGroup[];
  value: string;
  onValueChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
}) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  if (!isMobile) return <SearchableSelect groups={groups} value={value} onValueChange={onValueChange} onSearchChange={onSearchChange} placeholder={placeholder} searchPlaceholder={searchPlaceholder} className="h-12 w-full justify-between px-4 text-base font-normal" />;

  const filtered = groups.map(group => ({ ...group, options: group.options.filter(option => fuzzyIncludes(option.label, search)) })).filter(group => group.options.length > 0);
  return <div className="space-y-3">
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
      <Input type="search" aria-label="Buscar serviço" placeholder={searchPlaceholder} value={search} onChange={event => { setSearch(event.target.value); onSearchChange(event.target.value); }} className="h-12 pl-10 text-base" />
    </div>
    <div className="max-h-[35dvh] overflow-y-auto overscroll-contain" aria-label="Serviços disponíveis">
      {filtered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{search ? 'Nenhum serviço encontrado. Você pode criar um abaixo.' : 'Nenhum serviço cadastrado. Crie o primeiro abaixo.'}</p> : filtered.map((group, index) => <div key={group.heading ?? index}>
        {group.heading && <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.heading}</p>}
        {group.options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onValueChange(option.value)} className={cn('flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === option.value ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>
          {option.icon && <span aria-hidden="true" className="shrink-0">{option.icon}</span>}
          <span className="min-w-0 flex-1 break-words">{option.label}</span>
          {value === option.value && <Check aria-hidden="true" className="h-5 w-5 shrink-0" />}
        </button>)}
      </div>)}
    </div>
  </div>;
}
