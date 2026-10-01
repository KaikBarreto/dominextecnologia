import { useState } from 'react';
import { Workflow, Plus, Pencil, Trash2, ChevronRight } from 'lucide-react';
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
import { useProcesses, type Process } from '@/hooks/useProcesses';
import { validateProcessGraph } from '@/lib/flowchart/validate';
import { ProcessFullscreen } from './ProcessFullscreen';

/**
 * Props de CONTROLE do processo aberto. Quando fornecidas (via deep-link em
 * Employees), a seleção é 100% controlada pela URL (compartilhável + histórico
 * do browser). Sem elas, cai no estado interno (retrocompat).
 */
interface ProcessesTabProps {
  /** Id do processo aberto (controlado pela URL). undefined = descontrolado. */
  openProcessId?: string | null;
  /** Navega ao abrir (id) / fechar (null) um processo. */
  onSelectProcess?: (id: string | null) => void;
}

export function ProcessesTab({ openProcessId: openProcessIdProp, onSelectProcess }: ProcessesTabProps = {}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.processes;
  const { processes, isLoading, createProcess, renameProcess, deleteProcess } = useProcesses();

  // Controlado pela URL quando onSelectProcess vier; senão estado interno (fallback).
  const controlled = typeof onSelectProcess === 'function';
  const [openProcessIdInternal, setOpenProcessIdInternal] = useState<string | null>(null);
  const openProcessId = controlled ? (openProcessIdProp ?? null) : openProcessIdInternal;
  const selectProcess = (id: string | null) => {
    if (controlled) onSelectProcess!(id);
    else setOpenProcessIdInternal(id);
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<Process | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<Process | null>(null);

  const openProcess = processes.find((p) => p.id === openProcessId) ?? null;

  const fmtStepCount = (n: number) =>
    (n === 1 ? t.stepCount.one : t.stepCount.other).replace('{count}', String(n));

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createProcess.mutate(name, {
      onSuccess: (row: any) => {
        setCreateOpen(false);
        setNewName('');
        // selectProcess navega pelo link amigável quando controlado (Employees
        // resolve o short_code por id); com fallback pro UUID se o cache ainda
        // não tiver o código do processo recém-criado.
        if (row?.id) selectProcess(row.id);
      },
    });
  };

  const handleRename = () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    renameProcess.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) });
  };

  // ── Lista de processos (+ editor fullscreen sobreposto quando aberto) ──────
  return (
    <div className="space-y-4">
      {openProcess && (
        <ProcessFullscreen
          key={openProcess.id}
          process={openProcess}
          onBack={() => selectProcess(null)}
          backLabel={t.back}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t.newProcess}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : processes.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-12 w-12" />}
          title={t.empty.title}
          description={t.empty.description}
          action={{ label: t.newProcess, onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {processes.map((process) => {
            const stepCount = process.data.nodes.filter((n) => n.type !== 'lane').length;
            const { errorCount } = validateProcessGraph(process.data);
            return (
              <div
                key={process.id}
                className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Workflow className="h-4 w-4" />
                </div>
                <button
                  type="button"
                  onClick={() => selectProcess(process.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{process.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtStepCount(stepCount)}</p>
                  </div>
                  {errorCount > 0 && (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                      {errorCount}
                    </span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-warning hover:text-warning"
                  onClick={() => {
                    setRenaming(process);
                    setRenameValue(process.name);
                  }}
                  aria-label={t.rename.title}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive-ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDeleting(process)}
                  aria-label={t.delete.confirm}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => selectProcess(process.id)}
                  aria-label={t.back}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Criar */}
      <ResponsiveModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setNewName('');
        }}
        title={t.create.title}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t.create.cancel}
            </Button>
            <Button disabled={!newName.trim() || createProcess.isPending} onClick={handleCreate}>
              {t.create.submit}
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">{t.create.nameLabel}</Label>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.create.namePlaceholder}
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
        title={t.rename.title}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              {t.create.cancel}
            </Button>
            <Button disabled={!renameValue.trim() || renameProcess.isPending} onClick={handleRename}>
              {t.rename.submit}
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">{t.create.nameLabel}</Label>
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
            <AlertDialogTitle>{t.delete.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.delete.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.delete.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) {
                  deleteProcess.mutate(deleting.id);
                  setDeleting(null);
                }
              }}
            >
              {t.delete.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
