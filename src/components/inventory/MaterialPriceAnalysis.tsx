import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Minus, PackageSearch, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/mobile/EmptyState';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import { ListDetailLayout, type ListDetailItem } from '@/components/ui/ListDetailLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useIsMobile } from '@/hooks/use-mobile';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  buildMaterialPriceTrend,
  rankMaterialPriceChanges,
  summarizeMaterialPrice,
  type MaterialPriceChange,
  type MaterialPriceGranularity,
  type MaterialPriceTrendPoint,
} from '@/lib/material-purchase-report';
import { cn } from '@/lib/utils';

const OVERVIEW_ID = '__price_overview__';

interface MaterialPriceAnalysisProps {
  rows: MaterialPurchaseReportRow[];
  imageUrlsByInventoryId?: ReadonlyMap<string, string | null>;
  startDate?: string;
  endDate?: string;
  isLoading?: boolean;
}

function Variation({ value, locale, compact = false }: { value: number | null; locale: string; compact?: boolean }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const increased = value > 0;
  const decreased = value < 0;
  const Icon = increased ? TrendingUp : decreased ? TrendingDown : Minus;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 font-semibold tabular-nums',
      compact ? 'text-xs' : 'text-sm',
      increased ? 'text-destructive' : decreased ? 'text-success' : 'text-muted-foreground',
    )}>
      <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
      {value > 0 ? '+' : ''}{value.toLocaleString(locale, { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function MaterialPriceAnalysis({
  rows,
  imageUrlsByInventoryId,
  startDate,
  endDate,
  isLoading,
}: MaterialPriceAnalysisProps) {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const { money, date, number } = useLocaleFormatters();
  const t = MESSAGES[locale].app.inventory.purchaseReport.priceAnalysis;
  const [selectedId, setSelectedId] = useState(OVERVIEW_ID);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const analyzableRows = useMemo(
    () => rows.filter((row) => row.history.some((item) => (
      item.unit_price != null && item.quantity > 0 && item.unit === row.unit
    ))),
    [rows],
  );
  const changes = useMemo(() => rankMaterialPriceChanges(analyzableRows), [analyzableRows]);
  const changesByMaterial = useMemo(
    () => new Map(changes.map((change) => [change.inventoryId, change])),
    [changes],
  );
  const selectedMaterial = analyzableRows.find((row) => row.inventory_id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId !== OVERVIEW_ID && !analyzableRows.some((row) => row.inventory_id === selectedId)) {
      setSelectedId(OVERVIEW_ID);
      setMobileDetailOpen(false);
    }
  }, [analyzableRows, selectedId]);

  const items = useMemo<ListDetailItem[]>(() => analyzableRows.map((row) => {
    const change = changesByMaterial.get(row.inventory_id);
    return {
      id: row.inventory_id,
      title: row.material_name,
      subtitle: [row.sku || null, row.unit, t.purchaseCount.replace('{count}', number(row.purchase_count))]
        .filter(Boolean)
        .join(' · '),
      searchText: `${row.sku} ${row.group_name ?? ''}`,
      leading: (
        <InventoryItemThumbnail
          name={row.material_name}
          imageUrl={imageUrlsByInventoryId?.get(row.inventory_id)}
          accentColor={row.group_color}
          fallbackVariant="plain"
          className="h-9 w-9"
        />
      ),
      trailing: <Variation value={change?.variationPercentage ?? null} locale={locale} compact />,
    };
  }), [analyzableRows, changesByMaterial, imageUrlsByInventoryId, locale, number, t.purchaseCount]);

  const select = (id: string) => {
    setSelectedId(id);
    setMobileDetailOpen(true);
  };

  if (isLoading) return <Skeleton className="h-[34rem] w-full" />;

  return (
    <section className="min-w-0 border-y py-4" aria-labelledby="material-price-analysis-title">
      <div className="mb-4">
        <h2 id="material-price-analysis-title" className="text-base font-semibold sm:text-lg">{t.title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.subtitle}</p>
      </div>

      <ListDetailLayout
        items={items}
        pinnedItems={[{
          id: OVERVIEW_ID,
          title: t.overviewTitle,
          subtitle: t.overviewSubtitle,
          emphasized: true,
          leading: <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />,
        }]}
        selectedId={selectedId}
        listTitle={t.materialsTitle}
        listDescription={t.materialsDescription}
        searchPlaceholder={t.searchPlaceholder}
        emptyLabel={t.noMaterials}
        storageKey="inventory-material-price-analysis"
        pageSize={10}
        mobileDetailOpen={mobileDetailOpen}
        onSelect={select}
        className="lg:min-h-[34rem]"
        detailClassName="min-h-[32rem]"
      >
        {selectedMaterial ? (
          <MaterialPriceDetail
            material={selectedMaterial}
            change={changesByMaterial.get(selectedMaterial.inventory_id) ?? null}
            startDate={startDate}
            endDate={endDate}
            onBack={() => setMobileDetailOpen(false)}
          />
        ) : (
          <MaterialPriceOverview
            changes={changes}
            onSelect={select}
            onBack={() => setMobileDetailOpen(false)}
          />
        )}
      </ListDetailLayout>
    </section>
  );

  function MaterialPriceOverview({
    changes: priceChanges,
    onSelect,
    onBack,
  }: {
    changes: MaterialPriceChange[];
    onSelect: (id: string) => void;
    onBack: () => void;
  }) {
    const increases = priceChanges.filter((item) => item.variationPercentage > 0).slice(0, 5);
    const decreases = priceChanges
      .filter((item) => item.variationPercentage < 0)
      .sort((a, b) => a.variationPercentage - b.variationPercentage)
      .slice(0, 5);

    const ranking = (title: string, description: string, rankingItems: MaterialPriceChange[], direction: 'up' | 'down') => (
      <div className="min-w-0">
        <div className="mb-3 flex items-start gap-2">
          <span className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white',
            direction === 'up' ? 'bg-destructive' : 'bg-success',
          )}>
            {direction === 'up' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          </span>
          <div>
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {rankingItems.length === 0 ? (
          <p className="border-t py-5 text-sm text-muted-foreground">{t.noVariation}</p>
        ) : (
          <div className="divide-y border-y">
            {rankingItems.map((item) => (
              <button
                key={item.inventoryId}
                type="button"
                onClick={() => onSelect(item.inventoryId)}
                className="flex w-full items-center gap-3 px-1 py-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.materialName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {money(item.previousPrice)} → {money(item.latestPrice)} / {item.unit}
                  </span>
                </span>
                <Variation value={item.variationPercentage} locale={locale} />
              </button>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="min-w-0">
        <MobileBack onClick={onBack} />
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{t.overviewHeading}</h3>
            <Badge variant="outline">{t.sameMaterialBadge}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.overviewExplanation}</p>
        </div>
        {priceChanges.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<BarChart3 className="h-10 w-10" />}
            title={t.insufficientDataTitle}
            description={t.insufficientDataDescription}
          />
        ) : (
          <div className="grid gap-8 xl:grid-cols-2">
            {ranking(t.increasesTitle, t.increasesDescription, increases, 'up')}
            {ranking(t.decreasesTitle, t.decreasesDescription, decreases, 'down')}
          </div>
        )}
      </div>
    );
  }

  function MaterialPriceDetail({
    material,
    change,
    startDate: rangeStart,
    endDate: rangeEnd,
    onBack,
  }: {
    material: MaterialPurchaseReportRow;
    change: MaterialPriceChange | null;
    startDate?: string;
    endDate?: string;
    onBack: () => void;
  }) {
    const trend = buildMaterialPriceTrend(material.history, {
      startDate: rangeStart,
      endDate: rangeEnd,
      unit: material.unit,
    });
    const summary = summarizeMaterialPrice(material.history, material.unit);
    const chartData = trend.points.map((point) => ({ ...point, label: formatBucketLabel(point, trend.granularity) }));
    const hasPrices = chartData.some((point) => point.averagePrice != null);

    return (
      <div className="min-w-0">
        <MobileBack onClick={onBack} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{material.material_name}</h3>
            <p className="text-sm text-muted-foreground">
              {[material.sku || null, material.group_name || null, material.unit].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Badge variant="outline" className="w-fit">{t.granularity[trend.granularity]}</Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 border-y sm:grid-cols-5">
          <Metric label={t.latestPrice} value={summary.latestPrice == null ? '—' : `${money(summary.latestPrice)} / ${material.unit}`} />
          <Metric label={t.periodAverage} value={summary.averagePrice == null ? '—' : `${money(summary.averagePrice)} / ${material.unit}`} />
          <Metric label={t.minimum} value={summary.minPrice == null ? '—' : money(summary.minPrice)} />
          <Metric label={t.maximum} value={summary.maxPrice == null ? '—' : money(summary.maxPrice)} />
          <div className="col-span-2 px-3 py-3 sm:col-span-1">
            <dt className="text-xs text-muted-foreground">{t.variation}</dt>
            <dd className="mt-1"><Variation value={change?.variationPercentage ?? summary.variationPercentage} locale={locale} /></dd>
          </div>
        </dl>

        {!hasPrices ? (
          <EmptyState
            size="compact"
            icon={<PackageSearch className="h-10 w-10" />}
            title={t.noPriceTitle}
            description={t.noPriceDescription}
          />
        ) : (
          <>
            <div
              className="mt-5 h-[270px] min-w-0 w-full sm:h-[320px]"
              role="img"
              aria-label={t.chartAria.replace('{material}', material.material_name)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 12, left: isMobile ? -12 : 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={isMobile ? 28 : 18}
                    interval="preserveStartEnd"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={isMobile ? 58 : 72}
                    tickFormatter={formatMoneyShort}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    domain={['auto', 'auto']}
                  />
                  {summary.averagePrice != null && (
                    <ReferenceLine
                      y={summary.averagePrice}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="5 4"
                      strokeOpacity={0.6}
                    />
                  )}
                  <Tooltip
                    cursor={{ stroke: 'hsl(var(--border))' }}
                    allowEscapeViewBox={{ x: false, y: true }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]?.payload) return null;
                      const point = payload[0].payload as MaterialPriceTrendPoint & { label: string };
                      if (point.averagePrice == null) return null;
                      return (
                        <div className="min-w-52 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
                          <p className="font-semibold">{formatBucketPeriod(point, trend.granularity)}</p>
                          <p className="mt-2 flex justify-between gap-4">
                            <span className="text-muted-foreground">{t.weightedPrice}</span>
                            <strong className="tabular-nums">{money(point.averagePrice)} / {material.unit}</strong>
                          </p>
                          <p className="mt-1 flex justify-between gap-4">
                            <span className="text-muted-foreground">{t.priceRange}</span>
                            <span className="tabular-nums">{money(point.minPrice ?? point.averagePrice)} – {money(point.maxPrice ?? point.averagePrice)}</span>
                          </p>
                          <p className="mt-1 flex justify-between gap-4">
                            <span className="text-muted-foreground">{t.purchasedQuantity}</span>
                            <span className="tabular-nums">{number(point.purchasedQuantity)} {material.unit}</span>
                          </p>
                          <p className="mt-1 flex justify-between gap-4">
                            <span className="text-muted-foreground">{t.purchases}</span>
                            <span className="tabular-nums">{number(point.purchaseCount)}</span>
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="linear"
                    dataKey="averagePrice"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    connectNulls={false}
                    dot={{ r: 4, fill: 'hsl(var(--background))', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="sr-only">
              {chartData.filter((point) => point.averagePrice != null).map((point) => (
                <li key={point.key}>{formatBucketPeriod(point, trend.granularity)}: {money(point.averagePrice as number)}</li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>{t.weightedNote}</span>
          <span>{t.coverage.replace('{purchases}', number(summary.purchaseCount)).replace('{quantity}', number(summary.purchasedQuantity)).replace('{unit}', material.unit)}</span>
        </div>
      </div>
    );
  }

  function Metric({ label, value }: { label: string; value: string }) {
    return (
      <div className="min-w-0 px-3 py-3">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</dd>
      </div>
    );
  }

  function MobileBack({ onClick }: { onClick: () => void }) {
    return (
      <Button type="button" variant="ghost" size="sm" className="mb-3 -ml-2 gap-2 lg:hidden" onClick={onClick}>
        <ArrowLeft className="h-4 w-4" />{t.backToMaterials}
      </Button>
    );
  }

  function formatMoneyShort(value: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  function formatBucketLabel(point: MaterialPriceTrendPoint, granularity: MaterialPriceGranularity) {
    const value = new Date(`${point.startDate}T12:00:00Z`);
    if (granularity === 'quarter') {
      return `Q${Math.floor(value.getUTCMonth() / 3) + 1}/${String(value.getUTCFullYear()).slice(-2)}`;
    }
    if (granularity === 'month') {
      return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(value);
    }
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(value);
  }

  function formatBucketPeriod(point: MaterialPriceTrendPoint, granularity: MaterialPriceGranularity) {
    if (granularity === 'day') return date(point.startDate);
    return `${date(point.startDate)} – ${date(point.endDate)}`;
  }
}
