import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

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

/**
 * Máscara display-only do código de serviço (cTribNac): agrupa os 6 dígitos em
 * pares — `071002` → `07.10.02`. Só formata quando são exatamente 6 dígitos;
 * caso contrário (digitação manual, NBS) devolve o valor cru. NUNCA usar o
 * resultado pra gravar/enviar: a Fisqal espera os 6 dígitos sem pontos.
 */
function maskServiceCode(codigo: string): string {
  if (/^\d{6}$/.test(codigo)) {
    return `${codigo.slice(0, 2)}.${codigo.slice(2, 4)}.${codigo.slice(4, 6)}`;
  }
  return codigo;
}

/** Backoff curto entre tentativas — cold-start/propagação do secret resolve em segundos. */
const RETRY_BACKOFF_MS = [700, 1800];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTaxCodesOnce(
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

/**
 * Busca com auto-retry (1–2x com backoff curto) antes de desistir. Cold-start ou
 * propagação do secret tipicamente resolve na 2ª/3ª tentativa em poucos segundos.
 */
async function fetchTaxCodes(
  type: 'servico' | 'nbs',
  q: string,
): Promise<{ items: TaxCodeItem[]; ok: boolean }> {
  let res = await fetchTaxCodesOnce(type, q);
  for (let i = 0; !res.ok && i < RETRY_BACKOFF_MS.length; i++) {
    await sleep(RETRY_BACKOFF_MS[i]);
    res = await fetchTaxCodesOnce(type, q);
  }
  return res;
}

export function TaxCodeCombobox({
  type,
  value,
  onSelect,
  placeholder,
  disabled,
}: TaxCodeComboboxProps) {
  const { locale } = useAppLocaleContext();
  const tc = MESSAGES[locale].app.nfse.taxCode;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<TaxCodeItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  /** Token que força o efeito do NBS a refazer a busca atual ao tocar "Tentar novamente". */
  const [retryToken, setRetryToken] = React.useState(0);
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
    setFailed(false);
    debounceRef.current = setTimeout(async () => {
      const res = await fetchTaxCodes('nbs', q);
      setLoading(false);
      setFailed(!res.ok);
      setItems(res.ok ? res.items : []);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, type, minChars, retryToken]);

  /**
   * Reexecuta a busca atual a pedido do usuário ("Tentar novamente").
   *  - servico: recarrega o catálogo (limpa o cache pra forçar nova chamada);
   *  - nbs: bumpa o token, fazendo o efeito refazer a query atual.
   */
  const handleRetry = React.useCallback(() => {
    setFailed(false);
    if (type === 'servico') {
      servicoCacheRef.current = null;
      void loadServico();
    } else {
      setRetryToken((t) => t + 1);
    }
  }, [type, loadServico]);

  // Filtro client-side do catálogo de `servico`.
  const filtered = React.useMemo(() => {
    if (type !== 'servico') return items;
    const q = query.trim().toLowerCase();
    // Sem teto de 100: a lista (~337) é capada só por segurança em 400 e a
    // rolagem interna (max-h + overflow-y) dá conta de navegar tudo.
    if (!q) return items.slice(0, 400);
    return items
      .filter(
        (it) =>
          it.codigo.toLowerCase().includes(q) ||
          it.descricao.toLowerCase().includes(q) ||
          (it.itemLc116 ?? '').toLowerCase().includes(q),
      )
      .slice(0, 400);
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
          <span className="truncate">
            {value
              ? type === 'servico'
                ? maskServiceCode(value)
                : value
              : tc.selectPlaceholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] overflow-hidden p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              className="h-11 w-full bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            />
          </div>
          <CommandList className="max-h-[40vh] overflow-y-auto overscroll-contain touch-pan-y">
            <CommandGroup>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {tc.searching}
                </div>
              )}

              {!loading && type === 'nbs' && query.trim().length < minChars && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {tc.minCharsHint.replace('{min}', String(minChars))}
                </p>
              )}

              {!loading && failed && (
                <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {tc.fetchError}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {tc.retryBtn}
                  </Button>
                  {query.trim() && (
                    <button
                      type="button"
                      onClick={handleManual}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {tc.useTypedCode.replace('{code}', query.trim())}
                    </button>
                  )}
                </div>
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
                      <span className="block truncate font-medium">
                        {type === 'servico' ? maskServiceCode(it.codigo) : it.codigo}
                      </span>
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
                    {tc.emptyResult}
                    {query.trim() ? ` ${tc.useTypedEmpty.replace('{code}', query.trim())}` : ''}
                  </button>
                )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
