import { useMemo, useState } from 'react';
import { TicketPercent, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field-actions';
import {
  PdvCouponCard,
  type PdvCouponKind,
  type PdvCouponStatus,
} from './PdvCouponCard';

export interface PdvCouponOption {
  id: string;
  code: string;
  name: string;
  kind: PdvCouponKind;
  status?: PdvCouponStatus;
  value?: number;
  ruleSummary: string;
  expiresOn?: string | null;
}

export interface PdvCouponPickerProps {
  coupons: PdvCouponOption[];
  selectedId?: string | null;
  onSelect: (coupon: PdvCouponOption) => void;
  formatCurrency?: (value: number) => string;
}

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/**
 * Seletor visual de cupons promocionais. Recebe dados prontos por props e não
 * consulta, valida nem aplica desconto no servidor.
 */
export function PdvCouponPicker({
  coupons,
  selectedId = null,
  onSelect,
  formatCurrency,
}: PdvCouponPickerProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = normalized(query);
  const filtered = useMemo(() => {
    if (!normalizedQuery) return coupons;
    return coupons.filter((coupon) => normalized(`${coupon.code} ${coupon.name}`).includes(normalizedQuery));
  }, [coupons, normalizedQuery]);

  if (coupons.length === 0) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center" role="status">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
          <TicketPercent className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-semibold">Nenhum cupom disponível</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Os cupons válidos para esta venda aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField containerClassName="min-w-0 flex-1" aria-label="Buscar cupom" name="pdv-coupon-search" autoComplete="off" enterKeyHint="search" spellCheck={false} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código ou nome" className="h-11" actions={query ? <button type="button" aria-label="Limpar busca de cupons" onClick={() => setQuery('')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button> : undefined} />
        <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'cupom' : 'cupons'}
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Cupons disponíveis">
          {filtered.map((coupon) => (
            <PdvCouponCard
              key={coupon.id}
              {...coupon}
              density="compact"
              selectionRole="radio"
              selected={selectedId === coupon.id}
              formatCurrency={formatCurrency}
              onSelect={() => onSelect(coupon)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-32 flex-col items-center justify-center px-4 text-center" role="status">
          <p className="text-sm font-semibold">Nenhum cupom encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Tente outro código ou nome.</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setQuery('')}>
            Limpar busca
          </Button>
        </div>
      )}
    </div>
  );
}
