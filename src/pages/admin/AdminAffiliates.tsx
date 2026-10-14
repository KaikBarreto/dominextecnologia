import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users, DollarSign, Building2, Eye, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { fuzzyIncludesAny } from '@/lib/utils';
import {
  useAffiliates, useUpdateAffiliate, useDeleteAffiliate, type AffiliateWithMetrics,
} from '@/hooks/useAffiliateData';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { AffiliateFormDialog } from '@/components/admin/affiliate/AffiliateFormDialog';
import { AffiliateDashboardStats } from '@/components/admin/affiliate/AffiliateDashboardStats';
import { AffiliateCharts } from '@/components/admin/affiliate/AffiliateCharts';
import { AffiliatePerformanceTable } from '@/components/admin/affiliate/AffiliatePerformanceTable';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function AdminAffiliates() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAffiliateOnly, linkedAffiliateId, isLoading: permsLoading } = useAdminPermissions();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<AffiliateWithMetrics | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AffiliateWithMetrics | null>(null);
  const [search, setSearch] = useState('');

  // Afiliado-only é redirecionado pra própria ficha — só DEPOIS que as
  // permissões terminam de carregar (redirecionar antes causa loop: incidente
  // já documentado no projeto para o vendedor-only).
  useEffect(() => {
    if (!permsLoading && isAffiliateOnly && linkedAffiliateId) {
      navigate(`/admin/afiliados/${linkedAffiliateId}`, { replace: true });
    }
  }, [permsLoading, isAffiliateOnly, linkedAffiliateId, navigate]);

  const { data: affiliates = [], isLoading } = useAffiliates();
  const updateMutation = useUpdateAffiliate();
  const deleteMutation = useDeleteAffiliate();

  const filtered = useMemo(
    () => affiliates.filter((a) => fuzzyIncludesAny([a.name, a.email, a.phone], search)),
    [affiliates, search],
  );

  const activeCount = affiliates.filter((a) => a.is_active).length;
  const totalPending = affiliates.reduce((sum, a) => sum + (a.pending_balance || 0), 0);
  const totalClients = affiliates.reduce((sum, a) => sum + (a.client_count || 0), 0);

  const mobileStats: StatCarouselItem[] = [
    {
      key: 'ativos',
      label: 'Ativos',
      count: activeCount,
      icon: <Users className="h-4 w-4" />,
      accentColor: '#8B5CF6',
    },
    {
      key: 'pendente',
      label: 'Comissão Pendente',
      count: 0,
      displayValue: fmtBRL(totalPending),
      icon: <DollarSign className="h-4 w-4" />,
      accentColor: '#10B981',
    },
    {
      key: 'clientes',
      label: 'Clientes Indicados',
      count: totalClients,
      icon: <Building2 className="h-4 w-4" />,
      accentColor: '#3B82F6',
    },
  ];

  const handleEdit = (a: AffiliateWithMetrics) => {
    setEditing(a);
    setIsFormOpen(true);
  };
  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) setEditing(null);
  };
  const openNew = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const handleDeactivateInstead = () => {
    if (!deleteTarget) return;
    updateMutation.mutate({ id: deleteTarget.id, name: deleteTarget.name, is_active: false });
    setDeleteTarget(null);
  };
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Afiliado-only ainda não foi redirecionado (ou está carregando) — nunca
  // renderiza a listagem completa pra ele.
  if (permsLoading || (isAffiliateOnly && linkedAffiliateId)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className={
        'container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6 min-w-0 w-full max-w-full overflow-x-hidden' +
        (isMobile ? ' pb-24' : '')
      }
    >
      <MobilePageHeader
        title="Afiliados"
        subtitle={
          isMobile ? 'Programa de afiliados' : 'Dashboard de controle do programa de afiliados'
        }
        icon={Users}
        actions={
          isMobile ? undefined : (
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Afiliado
            </Button>
          )
        }
      />

      {isMobile ? (
        <>
          {isLoading ? <StatCarousel items={[]} loading /> : <StatCarousel items={mobileStats} />}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar afiliado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={search ? 'Nenhum afiliado encontrado' : 'Nenhum afiliado cadastrado'}
              description={search ? 'Tente uma busca diferente' : 'Toque em "Afiliado" para começar'}
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {filtered.map((a) => {
                const actions: ItemAction[] = [
                  {
                    key: 'view',
                    label: 'Visualizar',
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => navigate(`/admin/afiliados/${a.slug || a.id}`),
                  },
                  {
                    key: 'edit',
                    label: 'Editar',
                    icon: <Pencil className="h-4 w-4" />,
                    variant: 'edit',
                    onClick: () => handleEdit(a),
                  },
                  {
                    key: 'delete',
                    label: 'Excluir',
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive',
                    onClick: () => setDeleteTarget(a),
                  },
                ];

                const subtitleParts = [
                  a.email || '—',
                  `${a.client_count} ${a.client_count === 1 ? 'cliente' : 'clientes'}`,
                ];

                return (
                  <MobileListItem
                    key={a.id}
                    onClick={() => navigate(`/admin/afiliados/${a.slug || a.id}`)}
                    actions={actions}
                    title={
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{a.name}</span>
                        {/* Mesmo selo da tabela do desktop: `user_id` preenchido
                            = já tem login próprio. Saturado, ícone branco. */}
                        {a.user_id && (
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success"
                            aria-label="Tem acesso ao sistema"
                          >
                            <KeyRound className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                      </span>
                    }
                    subtitle={subtitleParts.join(' • ')}
                    trailing={
                      <div className="flex flex-col items-end gap-1 min-w-0">
                        <Badge variant={a.is_active ? 'success' : 'muted'} className="text-[10px] px-2 py-0.5">
                          {a.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {a.pending_balance > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums text-emerald-600 truncate">
                            {fmtBRL(a.pending_balance)}
                          </span>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {isLoading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <AffiliateDashboardStats affiliates={affiliates} />
              <AffiliateCharts affiliates={affiliates} />

              <div className="space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {filtered.length > 0 ? (
                  <AffiliatePerformanceTable
                    affiliates={filtered}
                    onEdit={handleEdit}
                    onDelete={(id) => {
                      const target = affiliates.find((a) => a.id === id) ?? null;
                      setDeleteTarget(target);
                    }}
                  />
                ) : (
                  <div className="rounded-lg border bg-card">
                    <EmptyState
                      icon={<Users className="h-12 w-12" />}
                      title={search ? 'Nenhum afiliado encontrado' : 'Nenhum afiliado cadastrado'}
                      description={search ? 'Tente uma busca diferente' : 'Clique em "Novo Afiliado" para começar'}
                      action={!search ? { label: 'Novo Afiliado', onClick: openNew } : undefined}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {isMobile && (
        <FABButton icon={<Plus className="h-5 w-5" />} label="Afiliado" onClick={openNew} />
      )}

      <AffiliateFormDialog open={isFormOpen} onOpenChange={handleFormClose} editingAffiliate={editing} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteTarget?.name}? O histórico de comissões e
              repasses dele será apagado junto. As empresas da carteira dele NÃO são apagadas, só
              perdem o vínculo com o afiliado. Se ele só saiu, considere desativar em vez de
              excluir — os dados ficam preservados e ele para de contar em novas vendas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={handleDeactivateInstead}>
              Desativar em vez de excluir
            </Button>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
