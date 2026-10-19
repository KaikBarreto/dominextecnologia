import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fuzzyIncludes } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AdminCompanyMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
}

/**
 * Seleção de empresas-alvo de um aviso (painel master).
 *
 * Busca pela régua única do projeto (`fuzzyIncludes`): ignora acento e ordem
 * das palavras. O selo da empresa escolhida é SATURADO (`bg-primary` +
 * `text-primary-foreground`), nunca outline dessaturado.
 */
export function AdminCompanyMultiSelect({ value, onChange }: AdminCompanyMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-companies-basic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, subscription_status')
        .order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; subscription_status: string | null }[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const selected = useMemo(() => Array.from(new Set(value.filter(Boolean))), [value]);
  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    return companies.filter((c) => fuzzyIncludes(c.name, search));
  }, [companies, search]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Selecionar empresas"
            className="w-full justify-between font-normal"
          >
            <span className={selected.length === 0 ? 'text-muted-foreground' : ''}>
              {selected.length === 0
                ? 'Selecione as empresas'
                : selected.length === 1
                  ? byId.get(selected[0])?.name || selected[0]
                  : `${selected.length} empresas selecionadas`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="pl-8"
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {isLoading && <p className="px-2 py-3 text-sm text-muted-foreground">Carregando empresas...</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
            )}
            {filtered.map((company) => {
              const isSelected = selected.includes(company.id);
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => toggle(company.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent',
                    isSelected && 'bg-accent/60',
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{company.name}</span>
                  {company.subscription_status === 'inactive' && (
                    <span className="shrink-0 text-xs text-muted-foreground">desativada</span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <Badge key={id} className="bg-primary text-primary-foreground hover:bg-primary gap-1">
              <span className="max-w-[12rem] truncate">{byId.get(id)?.name || id}</span>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Remover ${byId.get(id)?.name || 'empresa'}`}
                className="text-inherit opacity-80 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
