import { useState } from 'react';
import { Network, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useOrgCharts, type OrgChart } from '@/hooks/useOrgCharts';
import { OrgChartCanvas } from './OrgChartCanvas';

export function OrgChartTab() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.orgchart;
  const { charts, isLoading, createChart, renameChart, deleteChart } = useOrgCharts();

  const [openChartId, setOpenChartId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<OrgChart | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<OrgChart | null>(null);

  const openChart = charts.find((c) => c.id === openChartId) ?? null;

  const fmtCount = (n: number) => (n === 1 ? t.count.one : t.count.other).replace('{count}', String(n));

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createChart.mutate(name, {
      onSuccess: (row: any) => {
        setCreateOpen(false);
        setNewName('');
        if (row?.id) setOpenChartId(row.id);
      },
    });
  };

  const handleRename = () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    renameChart.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) });
  };

  // ── Canvas de um organograma aberto ───────────────────────────────────────
  if (openChart) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setOpenChartId(null)}>
            <ChevronLeft className="h-4 w-4" /> {t.back}
          </Button>
          <h2 className="truncate text-base font-semibold">{openChart.name}</h2>
        </div>
        <OrgChartCanvas chart={openChart} />
      </div>
    );
  }

  // ── Lista de organogramas ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t.newChart}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : charts.length === 0 ? (
        <EmptyState
          icon={<Network className="h-12 w-12" />}
          title={t.empty.title}
          description={t.empty.description}
          action={{ label: t.newChart, onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {charts.map((chart) => (
            <div
              key={chart.id}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Network className="h-4 w-4" />
              </div>
              <button
                type="button"
                onClick={() => setOpenChartId(chart.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium">{chart.name}</p>
                <p className="text-xs text-muted-foreground">{fmtCount(chart.data.nodes.length)}</p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-warning hover:text-warning"
                onClick={() => {
                  setRenaming(chart);
                  setRenameValue(chart.name);
                }}
                aria-label={t.rename}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(chart)}
                aria-label={t.delete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpenChartId(chart.id)}
                aria-label={t.open}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Criar */}
      <ResponsiveModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setNewName('');
        }}
        title={t.newChart}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t.cancel}
            </Button>
            <Button disabled={!newName.trim() || createChart.isPending} onClick={handleCreate}>
              {t.create}
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">{t.newChartName}</Label>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.newChartPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
        </div>
      </ResponsiveModal>

      {/* Renomear */}
      <ResponsiveModal
        open={!!renaming}
        onOpenChange={(o) => {
          if (!o) setRenaming(null);
        }}
        title={t.renameTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              {t.cancel}
            </Button>
            <Button disabled={!renameValue.trim() || renameChart.isPending} onClick={handleRename}>
              {t.save}
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">{t.newChartName}</Label>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
          />
        </div>
      </ResponsiveModal>

      {/* Excluir */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) {
                  deleteChart.mutate(deleting.id);
                  setDeleting(null);
                }
              }}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
