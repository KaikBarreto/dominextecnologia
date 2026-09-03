import { useMemo } from 'react';
import { Package } from 'lucide-react';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/SearchableSelect';
import { useInventory } from '@/hooks/useInventory';
import { useAccessibleInventoryIds } from '@/hooks/useAccessibleInventoryIds';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface InventoryMaterialSelectProps {
  /** Local de estoque ativo. O saldo mostrado é SEMPRE o deste local. */
  stockId: string | null;
  value?: string;
  onValueChange: (inventoryId: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Seletor de material CIENTE DO LOCAL.
 *
 * Diferente dos selects de material que já existiam (que listavam o catálogo
 * inteiro, sem saldo, sem presença e sem ACL), este:
 *   • mostra o saldo DAQUELE local no sublabel ("SKU 4410 · 12 kg disponíveis");
 *   • respeita a ACL de material por local (get_accessible_inventory_ids);
 *   • separa em dois grupos: "Neste local" (presente) e "Outros materiais".
 *
 * POR QUE GRUPOS (e não esconder o que não está no local):
 *   A régua do projeto é busca universal — material não some da busca só porque
 *   não está marcado como presente naquele local (mesma decisão da lista de
 *   Estoque). Como o SearchableSelect é dono do texto digitado, a forma de
 *   honrar isso sem esconder nada é AGRUPAR: o que está no local vem primeiro,
 *   o resto continua alcançável (inclusive digitando). Material sem saldo
 *   aparece, com o saldo mostrado como está ("sem saldo aqui").
 */
export function InventoryMaterialSelect({
  stockId,
  value,
  onValueChange,
  disabled,
  className,
}: InventoryMaterialSelectProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.stockConsumption;
  const { items, getQuantityForStock, getPresenceForStock } = useInventory();
  const { accessibleIds, isLoading: isLoadingAccessible } = useAccessibleInventoryIds();

  const groups = useMemo<SearchableSelectGroup[]>(() => {
    // Enquanto a ACL carrega não escondemos nada (evita a lista piscar).
    const visible = items.filter((i) => (isLoadingAccessible ? true : accessibleIds.has(i.id)));

    const toOption = (item: (typeof items)[number]) => {
      const qty = getQuantityForStock(item.id, stockId);
      const unit = item.unit || t.sectionUnit;
      const balance =
        qty > 0
          ? t.selectAvailable.replace('{qty}', formatQty(qty)).replace('{unit}', unit)
          : t.selectNoBalance;
      return {
        value: item.id,
        label: item.name,
        sublabel: item.sku ? `SKU ${item.sku} · ${balance}` : balance,
        // Busca também pelo código do material (o técnico costuma saber o SKU).
        keywords: [item.sku, item.category].filter((v): v is string => !!v),
      };
    };

    const here = visible.filter((i) => getPresenceForStock(i.id, stockId)).map(toOption);
    const others = visible.filter((i) => !getPresenceForStock(i.id, stockId)).map(toOption);

    return [
      { heading: t.selectGroupHere, options: here },
      { heading: t.selectGroupOthers, options: others },
    ].filter((g) => g.options.length > 0);
  }, [
    items,
    stockId,
    accessibleIds,
    isLoadingAccessible,
    getQuantityForStock,
    getPresenceForStock,
    t,
  ]);

  // Catálogo vazio (ou tudo bloqueado pela ACL): estado vazio COM saída, dizendo
  // o que fazer. Não navegamos pra o Estoque de propósito: o técnico está no meio
  // do preenchimento da OS e pode nem ter acesso àquela tela.
  const emptyContent = (
    <div className="px-2 py-4 text-center">
      <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{t.selectNoCatalogTitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t.selectNoCatalogHint}</p>
    </div>
  );

  return (
    <SearchableSelect
      groups={groups}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className={className}
      placeholder={t.selectPlaceholder}
      searchPlaceholder={t.selectSearch}
      emptyMessage={t.selectEmpty}
      emptyContent={emptyContent}
    />
  );
}

/** Quantidade legível: sem casas quando é inteiro, até 2 quando tem fração. */
export function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
}
