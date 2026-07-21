import { useState, useCallback } from 'react';
import {
  ClipboardList,
  Plus,
  Eye,
  XCircle,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  FileDown,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useInventoryCounts,
  type InventoryCount,
  type CountItemWithDetails,
  type InventoryCountDivergence,
} from '@/hooks/useInventoryCounts';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useToast } from '@/hooks/use-toast';
import { generateInventoryCountPdf } from '@/utils/inventoryCountPdfGenerator';
import { generateInventoryCountExcel } from '@/utils/inventoryCountExcelGenerator';
import { InventoryCountWizard } from '@/components/inventory/InventoryCountWizard';
import { InventoryCountDetailModal } from '@/components/inventory/InventoryCountDetailModal';

function StatusBadge({ status }: { status: string }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.inventoryCount;

  if (status === 'finalizado') {
    return (
      <Badge className="bg-success text-white gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {t.statusLabel.finalizado}
      </Badge>
    );
  }
  if (status === 'cancelado') {
    return (
      <Badge className="bg-muted-foreground text-white gap-1">
        <Ban className="h-3 w-3" />
        {t.statusLabel.cancelado}
      </Badge>
    );
  }
  return (
    <Badge className="bg-warning text-white gap-1">
      <AlertTriangle className="h-3 w-3" />
      {t.statusLabel.aberto}
    </Badge>
  );
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'pt-br' ? 'pt-BR' : locale, {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function InventoryCountsTab() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.inventoryCount;
  const { counts, isLoading, loadCountDetail, getDivergences, cancelCount } = useInventoryCounts();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { toast } = useToast();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailCount, setDetailCount] = useState<InventoryCount | null>(null);
  const [detailItems, setDetailItems] = useState<CountItemWithDetails[]>([]);
  const [detailDivergences, setDetailDivergences] = useState<InventoryCountDivergence[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = useCallback(
    async (count: InventoryCount) => {
      setDetailLoading(true);
      setDetailCount(count);
      setDetailOpen(true);
      try {
        const [items, divs] = await Promise.all([
          loadCountDetail(count.id),
          getDivergences(count.id),
        ]);
        setDetailItems(items);
        setDetailDivergences(divs);
      } catch (err) {
        toast({ variant: 'destructive', title: t.errorLoadDetail });
      } finally {
        setDetailLoading(false);
      }
    },
    [loadCountDetail, getDivergences, toast, t.errorLoadDetail],
  );

  const handleExport = async (count: InventoryCount, format: 'pdf' | 'excel') => {
    try {
      const [items, divs] = await Promise.all([
        loadCountDetail(count.id),
        getDivergences(count.id),
      ]);

      const rows = items.map((item) => {
        const div = divs.find((d) => d.item_id === item.id);
        return {
          material_name: item.material_name,
          material_sku: item.material_sku,
          stock_name: item.stock_name,
          expected_qty: item.expected_qty,
          counted_qty: item.counted_qty,
          diff: item.diff,
          unit_cost: item.unit_cost,
          diff_value: div?.diff_value ?? null,
        };
      });

      const commonParams = {
        countNumber: count.numero,
        status: t.statusLabel[count.status as keyof typeof t.statusLabel] ?? count.status,
        notes: count.notes,
        rows,
        locale,
        currency,
      };

      if (format === 'pdf') {
        await generateInventoryCountPdf({
          company: companySettings,
          whiteLabel: whiteLabelEnabled,
          ...commonParams,
        });
      } else {
        await generateInventoryCountExcel(commonParams);
      }
    } catch (err) {
      toast({ variant: 'destructive', title: t.errorExport });
    }
  };

  const exportDropdown = (count: InventoryCount) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label={t.exportLabel}>
          <FileDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => handleExport(count, 'pdf')}
          className="gap-2 cursor-pointer focus:bg-info focus:text-white hover:bg-info hover:text-white"
        >
          <FileText className="h-4 w-4" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport(count, 'excel')}
          className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white"
        >
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          onClick={() => setWizardOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t.newCount}
        </Button>
      </div>

      {/* Lista */}
      {isMobile ? (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : counts.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<ClipboardList className="h-10 w-10" />}
              title={t.empty.noneTitle}
              description={t.empty.noneDescription}
              action={{ label: t.newCount, onClick: () => setWizardOpen(true) }}
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {counts.map((count) => {
                const actions: ItemAction[] = [
                  {
                    key: 'view',
                    label: t.actions.view,
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => openDetail(count),
                  },
                  ...(count.status === 'aberto'
                    ? [
                        {
                          key: 'cancel',
                          label: t.actions.cancel,
                          icon: <XCircle className="h-4 w-4" />,
                          variant: 'destructive' as const,
                          onClick: () => cancelCount.mutate(count.id),
                        },
                      ]
                    : []),
                ];
                return (
                  <MobileListItem
                    key={count.id}
                    onClick={() => openDetail(count)}
                    actions={actions}
                    leading={
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ClipboardList className="h-5 w-5 text-primary" />
                      </div>
                    }
                    title={`${t.countNumberLabel} #${count.numero ?? '—'}`}
                    subtitle={formatDate(count.created_at, locale)}
                    trailing={<StatusBadge status={count.status} />}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {t.cardTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : counts.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<ClipboardList className="h-10 w-10" />}
                title={t.empty.noneTitle}
                description={t.empty.noneDescription}
                action={{ label: t.newCount, onClick: () => setWizardOpen(true) }}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.table.numero}</TableHead>
                      <TableHead>{t.table.status}</TableHead>
                      <TableHead>{t.table.date}</TableHead>
                      <TableHead>{t.table.notes}</TableHead>
                      <TableHead className="w-[120px]">{t.table.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {counts.map((count) => (
                      <TableRow key={count.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(count)}>
                        <TableCell className="font-medium">
                          #{count.numero ?? '—'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={count.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(count.created_at, locale)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {count.notes ?? '—'}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {exportDropdown(count)}
                            <RowActionsMenu
                              actions={[
                                {
                                  label: t.actions.view,
                                  icon: Eye,
                                  onClick: () => openDetail(count),
                                },
                                ...(count.status === 'aberto'
                                  ? [
                                      {
                                        label: t.actions.cancel,
                                        icon: XCircle,
                                        variant: 'delete' as const,
                                        onClick: () => cancelCount.mutate(count.id),
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wizard de novo inventário */}
      <InventoryCountWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      {/* Detalhe / Contagem */}
      <InventoryCountDetailModal
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) {
            setDetailCount(null);
            setDetailItems([]);
            setDetailDivergences([]);
          }
        }}
        count={detailCount}
        items={detailItems}
        divergences={detailDivergences}
        loading={detailLoading}
        onItemsChange={async () => {
          if (detailCount) {
            const [items, divs] = await Promise.all([
              loadCountDetail(detailCount.id),
              getDivergences(detailCount.id),
            ]);
            setDetailItems(items);
            setDetailDivergences(divs);
          }
        }}
      />
    </div>
  );
}
