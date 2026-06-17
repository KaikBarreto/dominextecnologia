import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';

/**
 * Autocomplete (busca-enquanto-digita) de códigos fiscais oficiais via edge
 * `fisqal-tax-codes`. Suporta dois tipos:
 *  - `servico` (cTribNac, ~337 itens): busca tudo 1x e filtra no client (cache).
 *  - `nbs` (lista grande): busca server-side por termo, exige ≥2 caracteres.
 *
 * Edge: supabase.functions.invoke('fisqal-tax-codes', { body: { type, q } })
 *   → { items: [{ codigo, descricao, itemLc116? }], total }
 *
 * Resiliente a 503/erro: a busca falha em silêncio (mensagem PT-BR no rodapé) e
 * o campo continua aceitando digitação manual (o valor digitado é gravado).
 */

export interface TaxCodeItem {
  codigo: string;
  descricao: string;
  itemLc116?: string | null;
}

interface TaxCodeComboboxProps {
  type: 'servico' | 'nbs';
  /** Código atualmente selecionado (gravado no form). */
  value: string;
  /** Recebe o código escolhido + o item completo (pra preencher campos extras). */
  onSelect: (codigo: string, item: TaxCodeItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MIN_CHARS: Record<TaxCodeComboboxProps['type'], number> = {
  servico: 1,
  nbs: 2,
};

const DEBOUNCE_MS = 300;

async function fetchTaxCodes(
  type: 'servico' | 'nbs',
  q: string,
): Promise<{ items: TaxCodeItem[]; ok: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('fisqal-tax-codes', {
      body: { type, q },
    });
    if (error) return { items: [], ok: false };
    const items = Array.isArray((data as { items?: unknown })?.items)
      ? ((data as { items: TaxCodeItem[] }).items)
      : [];
    return { items, ok: true };
  } catch {
    return { items: [], ok: false };
  }
}

export function TaxCodeCombobox({
  type,
  value,
  onSelect,
  placeholder = 'Buscar por código ou descrição...',
  disabled,
}: TaxCodeComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<TaxCodeItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Cache do dataset completo de `servico` (busca-tudo-1x). */
  const servicoCacheRef = React.useRef<TaxCodeItem[] | null>(null);
  const minChars = MIN_CHARS[type];

  // Carrega o catálogo de `servico` inteiro 1x ao abrir, e filtra no client.
  const loadServico = React.useCallback(async () => {
    if (servicoCacheRef.current) {
      setItems(servicoCacheRef.current);
      return;
    }
    setLoading(true);
    setFailed(false);
    const res = await fetchTaxCodes('servico', '');
    setLoading(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    servicoCacheRef.current = res.items;
    setItems(res.items);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    if (type === 'servico') {
      void loadServico();
    }
  }, [open, type, loadServico]);

  // Busca server-side por termo (usada pelo NBS). Debounced.
  React.useEffect(() => {
    if (type !== 'nbs') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < minChars) {
      setItems([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const res = await fetchTaxCodes('nbs', q);
      setLoading(false);
      setFailed(!res.ok);
      setItems(res.ok ? res.items : []);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, type, minChars]);

  // Filtro client-side do catálogo de `servico`.
  const filtered = React.useMemo(() => {
    if (type !== 'servico') return items;
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 100);
    return items
      .filter(
        (it) =>
          it.codigo.toLowerCase().includes(q) ||
          it.descricao.toLowerCase().includes(q) ||
          (it.itemLc116 ?? '').toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [items, query, type]);

  const handlePick = (it: TaxCodeItem) => {
    onSelect(it.codigo, it);
    setOpen(false);
    setQuery('');
  };

  // Permite gravar exatamente o que foi digitado (fallback manual).
  const handleManual = () => {
    const q = query.trim();
    if (!q) return;
    onSelect(q, null);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value || 'Selecione o código...'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
              autoComplete="off"
            />
          </div>
          <CommandList className="max-h-[40vh] overflow-y-auto overscroll-contain touch-pan-y">
            <CommandGroup>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              )}

              {!loading && type === 'nbs' && query.trim().length < minChars && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Digite ao menos {minChars} caracteres para buscar.
                </p>
              )}

              {!loading && failed && (
                <button
                  type="button"
                  onClick={handleManual}
                  className="block w-full px-3 py-6 text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  Não foi possível buscar agora.
                  {query.trim()
                    ? ` Toque para usar o código "${query.trim()}" digitado.`
                    : ' Tente novamente em instantes.'}
                </button>
              )}

              {!loading &&
                !failed &&
                filtered.map((it) => (
                  <CommandItem
                    key={it.codigo}
                    value={it.codigo}
                    onSelect={() => handlePick(it)}
                    className="items-start"
                  >
                    <Check
                      className={cn(
                        'mr-2 mt-0.5 h-4 w-4 shrink-0',
                        value === it.codigo ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className="min-w-0">
                      <span className="block truncate font-medium">{it.codigo}</span>
                      <span className="block text-xs text-muted-foreground line-clamp-2">
                        {it.descricao}
                        {it.itemLc116 ? ` (${it.itemLc116})` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}

              {!loading &&
                !failed &&
                filtered.length === 0 &&
                (type === 'servico' || query.trim().length >= minChars) && (
                  <button
                    type="button"
                    onClick={handleManual}
                    className="block w-full px-3 py-6 text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                    disabled={!query.trim()}
                  >
                    Nenhum código encontrado.
                    {query.trim() ? ` Toque para usar "${query.trim()}".` : ''}
                  </button>
                )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
