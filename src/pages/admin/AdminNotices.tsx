import { useMemo, useState } from 'react';
import { Megaphone, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { isNoticeLive, type NoticeVariant } from '@/lib/systemNotices';
import { cn } from '@/lib/utils';

/**
 * Avisos & NPS do painel master — aba AVISOS.
 *
 * Avisos que a Dominex publica DENTRO do sistema do cliente, podendo
 * direcionar a uma empresa só. A segurança do direcionamento é a RLS
 * (`admin_notices_select_tenant`); esta tela é o lado de quem escreve.
 *
 * O NPS da base (pesquisa que a Dominex manda pro cliente) é a segunda metade
 * da estrutura e entra aqui como aba quando for implementado. Não confundir com
 * `nps_settings`/`nps_criteria`, que são do TENANT (pesquisa que a empresa manda
 * para os clientes DELA, na Área do Cliente).
 */

// Selos SATURADOS: fundo na cor + texto na cor de foreground. Sem outline pastel.
const VARIANT_BADGE: Record<NoticeVariant, { label: string; className: string }> = {
  info: { label: 'Informação', className: 'bg-info text-info-foreground hover:bg-info' },
  warning: { label: 'Atenção', className: 'bg-warning text-warning-foreground hover:bg-warning' },
  destructive: {
    label: 'Crítico',
    className: 'bg-destructive text-destructive-foreground hover:bg-destructive',
  },
  success: { label: 'Boa notícia', className: 'bg-success text-success-foreground hover:bg-success' },
  neutral: { label: 'Neutro', className: 'bg-muted text-foreground hover:bg-muted' },
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

export default function AdminNotices() {
  const { notices, isLoading, dismissCount, createNotice, updateNotice, toggleActive, deleteNotice, isSaving } =
    useAdminNotices();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNotice | null>(null);
  const [toDelete, setToDelete] = useState<AdminNotice | null>(null);

  // Nome das empresas-alvo, só pra mostrar na lista.
  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies-basic'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 1000 * 60 * 5,
  });
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const targetLabel = (notice: AdminNotice): string => {
    if (notice.target_audience === 'all') return 'Base toda';
    const ids = notice.target_ids ?? [];
    if (ids.length === 0) return 'Sem destino (ninguém vê)';
    if (ids.length === 1) return companyName.get(ids[0]) || ids[0];
    return `${ids.length} empresas`;
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (notice: AdminNotice) => {
    setEditing(notice);
    setFormOpen(true);
  };

  const submit = (input: AdminNoticeInput & { id?: string }) => {
    if (input.id) updateNotice(input as AdminNoticeInput & { id: string });
    else createNotice(input);
    setFormOpen(false);
  };

  return (
    <div className="container mx-auto space-y-4 px-3 py-4 sm:px-4 lg:space-y-6 lg:px-6 lg:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground lg:text-2xl">Avisos</h1>
          <p className="text-sm text-muted-foreground">
            Faixa de aviso exibida dentro do sistema do cliente, para uma empresa ou para a base toda.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo aviso
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando avisos...</p>}

          {!isLoading && notices.length === 0 && (
            <EmptyState
              icon={<Megaphone className="h-12 w-12" />}
              title="Nenhum aviso publicado"
              description="Crie um aviso para falar com uma empresa específica ou com a base toda."
              action={{ label: 'Novo aviso', onClick: openNew }}
            />
          )}

          {!isLoading && notices.length > 0 && (
            <div className="divide-y">
              {notices.map((notice) => {
                const live = isNoticeLive(notice, new Date());
                const badge = VARIANT_BADGE[notice.variant] ?? VARIANT_BADGE.neutral;
                return (
                  <div key={notice.id} className="flex items-start gap-3 p-3 sm:p-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn('shrink-0', badge.className)}>{badge.label}</Badge>
                        {!live && (
                          <Badge className="bg-muted text-foreground hover:bg-muted">
                            {notice.is_active ? 'Fora da data' : 'Pausado'}
                          </Badge>
                        )}
                        {notice.scope === 'global' && (
                          <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                            Todas as telas
                          </Badge>
                        )}
                        <span className="truncate font-medium">{notice.title}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{notice.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {targetLabel(notice)}
                        {notice.starts_at || notice.ends_at
                          ? ` · ${formatDate(notice.starts_at) || 'início imediato'} a ${formatDate(notice.ends_at) || 'sem prazo'}`
                          : ''}
                        {dismissCount[notice.id]
                          ? ` · ${dismissCount[notice.id]} ${dismissCount[notice.id] === 1 ? 'pessoa dispensou' : 'pessoas dispensaram'}`
                          : ''}
                      </p>
                    </div>
                    <RowActionsMenu
                      actions={[
                        { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => openEdit(notice) },
                        {
                          label: notice.is_active ? 'Pausar' : 'Publicar',
                          icon: Power,
                          onClick: () => toggleActive({ id: notice.id, isActive: !notice.is_active }),
                        },
                        {
                          label: 'Excluir',
                          icon: Trash2,
                          variant: 'delete',
                          onClick: () => setToDelete(notice),
                        },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminNoticeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        notice={editing}
        onSubmit={submit}
        isSaving={isSaving}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso</AlertDialogTitle>
            <AlertDialogDescription>
              O aviso "{toDelete?.title}" sai do sistema do cliente na hora. Esta ação é permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteNotice(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
