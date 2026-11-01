import { useMemo, useState } from 'react';
import { Megaphone, Pencil, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
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
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { AdminNoticeFormDialog } from '@/components/admin/AdminNoticeFormDialog';
import { useAdminNotices, type AdminNotice, type AdminNoticeInput } from '@/hooks/useAdminNotices';
import { useAdminAudienceCompanies } from '@/hooks/useAdminAudienceCompanies';
import { isNoticeLive, type NoticeVariant } from '@/lib/systemNotices';
import { fuzzyIncludes } from '@/lib/utils';
import { cn } from '@/lib/utils';

const VARIANT_BADGE: Record<NoticeVariant, { label: string; className: string }> = {
  info: { label: 'Informação', className: 'bg-info text-info-foreground hover:bg-info' },
  warning: { label: 'Atenção', className: 'bg-warning text-warning-foreground hover:bg-warning' },
  destructive: { label: 'Crítico', className: 'bg-destructive text-destructive-foreground hover:bg-destructive' },
  success: { label: 'Boa notícia', className: 'bg-success text-success-foreground hover:bg-success' },
  neutral: { label: 'Neutro', className: 'bg-muted text-foreground hover:bg-muted' },
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}
export function AdminNoticesTab() {
  const {
    notices, isLoading, isError, refetch, dismissCount, createNotice, updateNotice,
    toggleActive, deleteNotice, isSaving, isMutating,
  } = useAdminNotices();
  const { data: companies = [] } = useAdminAudienceCompanies();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNotice | null>(null);
  const [toDelete, setToDelete] = useState<AdminNotice | null>(null);

  const companyName = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const filtered = useMemo(() => notices.filter((notice) => (
    !search.trim() || fuzzyIncludes(`${notice.title} ${notice.message}`, search)
  )), [notices, search]);

  const targetLabel = (notice: AdminNotice): string => {
    if (notice.target_audience === 'all') return 'Base toda';
    const ids = notice.target_ids ?? [];
    if (ids.length === 0) return 'Sem destino';
    if (ids.length === 1) return companyName.get(ids[0]) || '1 empresa';
    return `${ids.length} empresas`;
  };

  const submit = async (input: AdminNoticeInput & { id?: string }) => {
    try {
      if (input.id) await updateNotice(input as AdminNoticeInput & { id: string });
      else await createNotice(input);
      setFormOpen(false);
    } catch {
      // O hook exibe a orientação; o modal fica aberto com o rascunho intacto.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Avisos no sistema</h2>
          <p className="text-sm text-muted-foreground">Faixas saturadas fixadas abaixo do header, por empresa ou para a base toda.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo aviso
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título ou mensagem..." className="pl-9" />
      </div>

      {isError ? (
        <NoticeBanner variant="neutral" title="Não foi possível carregar os avisos" action={(
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </Button>
        )}>
          Confira sua conexão e tente outra vez.
        </NoticeBanner>
      ) : (
        <Card>
          <CardContent className="p-0">
            {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando avisos...</p>}
            {!isLoading && notices.length === 0 && (
              <EmptyState icon={<Megaphone className="h-12 w-12" />} title="Nenhum aviso publicado" description="Crie um aviso para falar com uma empresa específica ou com a base toda." action={{ label: 'Novo aviso', onClick: () => { setEditing(null); setFormOpen(true); } }} />
            )}
            {!isLoading && notices.length > 0 && filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhum aviso corresponde à busca.</p>
            )}
            {!isLoading && filtered.length > 0 && (
              <div className="divide-y">
                {filtered.map((notice) => {
                  const live = isNoticeLive(notice, new Date());
                  const badge = VARIANT_BADGE[notice.variant] ?? VARIANT_BADGE.neutral;
                  return (
                    <div key={notice.id} className="flex items-start gap-3 p-3 sm:p-4">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn('shrink-0', badge.className)}>{badge.label}</Badge>
                          {!live && <Badge className="bg-muted text-foreground hover:bg-muted">{notice.is_active ? 'Fora da data' : 'Pausado'}</Badge>}
                          {notice.scope === 'global' && <Badge className="bg-primary text-primary-foreground hover:bg-primary">Todas as telas</Badge>}
                          <span className="min-w-0 break-words font-medium">{notice.title}</span>
                        </div>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{notice.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {targetLabel(notice)}
                          {(notice.starts_at || notice.ends_at) && ` · ${formatDate(notice.starts_at) || 'agora'} a ${formatDate(notice.ends_at) || 'sem prazo'}`}
                          {Boolean(dismissCount[notice.id]) && ` · ${dismissCount[notice.id]} dispensaram`}
                        </p>
                      </div>
                      <RowActionsMenu actions={[
                        { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => { setEditing(notice); setFormOpen(true); } },
                        { label: notice.is_active ? 'Pausar' : 'Publicar', icon: Power, onClick: () => void toggleActive({ id: notice.id, isActive: !notice.is_active }) },
                        { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setToDelete(notice) },
                      ]} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {notices.length} avisos</p>

      <AdminNoticeFormDialog open={formOpen} onOpenChange={setFormOpen} notice={editing} onSubmit={submit} isSaving={isSaving} />

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso</AlertDialogTitle>
            <AlertDialogDescription>O aviso “{toDelete?.title}” sai do sistema imediatamente. Esta ação é permanente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                if (!toDelete) return;
                try { await deleteNotice(toDelete.id); setToDelete(null); } catch { /* toast do hook */ }
              }}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

