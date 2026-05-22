import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Users, TrendingUp, DollarSign, Target,
  Pencil, Trash2, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  useSalespeople, useAllSalespersonSales, useAllSalespersonAdvances,
  useDeleteSalesperson, type Salesperson,
} from '@/hooks/useSalespersonData';
import { SalespersonFormDialog } from '@/components/admin/salesperson/SalespersonFormDialog';
import { SalespersonDashboardStats } from '@/components/admin/salesperson/SalespersonDashboardStats';
import { SalespersonPerformanceTable } from '@/components/admin/salesperson/SalespersonPerformanceTable';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function AdminSalespeople() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasFunctionAccess, linkedSalespersonId, isLoading: permsLoading } = useAdminPermissions();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Salesperson | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canSeeAll = hasFunctionAccess('admin_vendedores_ver_todos');

  // Vendedor restrito → redireciona para a própria página de detalhes
  useEffect(() => {
    if (!permsLoading && !canSeeAll && linkedSalespersonId) {
      navigate(`/admin/vendedores/${linkedSalespersonId}`, { replace: true });
    }
  }, [permsLoading, canSeeAll, linkedSalespersonId, navigate]);

  const { data: salespeople = [], isLoading: loadingS } = useSalespeople();
  const { data: sales = [], isLoading: loadingSa } = useAllSalespersonSales();
  const { data: advances = [], isLoading: loadingA } = useAllSalespersonAdvances();
  const deleteMutation = useDeleteSalesperson();

  const isLoading = loadingS || loadingSa || loadingA || permsLoading;

  const filtered = useMemo(
    () =>
      salespeople.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.email || '').toLowerCase().includes(search.toLowerCase()),
      ),
    [salespeople, search],
  );

  // ---------------------------------------------------------------------------
  // Agregações para stats (compartilhadas com desktop via componente original)
  // ---------------------------------------------------------------------------
  const activeCount = salespeople.filter((s) => s.is_active !== false).length;
  const totalCount = salespeople.length;
  const totalSales = sales.length;
  const totalCommission = sales.reduce((sum, s) => sum + (s.commission_amount || 0), 0);
  const avgPerSeller = activeCount > 0 ? totalSales / activeCount : 0;

  // Stats para o carrossel mobile (numéricos puros, compatíveis com o primitivo).
  const mobileStats: StatCarouselItem[] = [
    {
      key: 'ativos',
      label: 'Ativos',
      count: activeCount,
      icon: <Users className="h-4 w-4" />,
      accentColor: '#10B981',
    },
    {
      key: 'total',
      label: 'Cadastrados',
      count: totalCount,
      icon: <Users className="h-4 w-4" />,
      accentColor: '#3B82F6',
    },
    {
      key: 'vendas',
      label: 'Vendas',
      count: totalSales,
      icon: <TrendingUp className="h-4 w-4" />,
      accentColor: '#8B5CF6',
    },
    {
      key: 'media',
      label: 'Média/Vendedor',
      count: Math.round(avgPerSeller * 10) / 10,
      icon: <Target className="h-4 w-4" />,
      accentColor: '#F97316',
    },
  ];

  // Helper para stats por vendedor (igual à tabela desktop).
  const perSellerStats = (id: string, salary: number) => {
    const s = sales.filter((x) => x.salesperson_id === id);
    const a = advances.filter((x) => x.salesperson_id === id);
    const totalCommissionSeller = s.reduce((sum, x) => sum + (x.commission_amount || 0), 0);
    const totalAdvances = a.reduce((sum, x) => sum + (x.amount || 0), 0);
    return {
      totalSalesSeller: s.length,
      totalCommissionSeller,
      totalAdvances,
      balance: (salary || 0) + totalCommissionSeller - totalAdvances,
      goal: 0, // setado abaixo
    };
  };

  const handleEdit = (s: Salesperson) => { setEditing(s); setIsFormOpen(true); };
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };
  const openNew = () => { setEditing(null); setIsFormOpen(true); };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className={cn(
        'container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6 min-w-0 w-full max-w-full overflow-x-hidden',
        isMobile && 'pb-24',
      )}
    >
      <MobilePageHeader
        title="Vendedores"
        subtitle={
          isMobile
            ? 'Equipe comercial Auctus'
            : 'Dashboard de controle gerencial da equipe comercial'
        }
        icon={Users}
        actions={
          isMobile
            ? undefined
            : canSeeAll ? (
                <Button onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" /> Novo Vendedor
                </Button>
              ) : undefined
        }
      />

      {isMobile ? (
        // ---------------------------------------------------------------------
        // MOBILE: header compacto + carrossel de stats + busca + lista nativa
        // ---------------------------------------------------------------------
        <>
          {isLoading ? (
            <StatCarousel items={[]} loading />
          ) : (
            <StatCarousel items={mobileStats} />
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={search ? 'Nenhum vendedor encontrado' : 'Nenhum vendedor cadastrado'}
              description={
                search
                  ? 'Tente uma busca diferente'
                  : canSeeAll
                      ? 'Toque em "Novo Vendedor" para começar'
                    : 'Aguardando cadastro pela coordenação'
              }
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {filtered.map((p) => {
                const st = perSellerStats(p.id, Number(p.salary) || 0);
                const goal = p.monthly_goal || 30;
                const pct = goal > 0 ? Math.min((st.totalSalesSeller / goal) * 100, 100) : 0;
                const isInactive = p.is_active === false;

                const actions: ItemAction[] = [
                  {
                    key: 'view',
                    label: 'Visualizar',
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => navigate(`/admin/vendedores/${p.id}`),
                  },
                  ...(canSeeAll
                    ? [
                        {
                          key: 'edit',
                          label: 'Editar',
                          icon: <Pencil className="h-4 w-4" />,
                          variant: 'edit' as const,
                          onClick: () => handleEdit(p),
                        },
                        {
                          key: 'delete',
                          label: 'Excluir',
                          icon: <Trash2 className="h-4 w-4" />,
                          variant: 'destructive' as const,
                          onClick: () => setDeleteId(p.id),
                        },
                      ]
                    : []),
                ];

                const subtitleParts = [
                  p.email || '—',
                  `${st.totalSalesSeller} vendas`,
                  fmtBRL(st.totalCommissionSeller),
                ];

                return (
                  <MobileListItem
                    key={p.id}
                    onClick={() => navigate(`/admin/vendedores/${p.id}`)}
                    actions={actions}
                    leading={
                      <SalespersonAvatar name={p.name} photoUrl={p.photo_url} size="md" />
                    }
                    title={p.name}
                    subtitle={subtitleParts.join(' • ')}
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={isInactive ? 'secondary' : 'default'}
                          className="text-[10px] px-2 py-0.5"
                        >
                          {isInactive ? 'Inativo' : 'Ativo'}
                        </Badge>
                        <span
                          className={cn(
                            'text-[10px] font-semibold tabular-nums',
                            pct >= 100 ? 'text-emerald-600' : 'text-muted-foreground',
                          )}
                        >
                          {pct.toFixed(0)}% meta
                        </span>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        // ---------------------------------------------------------------------
        // DESKTOP: layout original 100% preservado
        // ---------------------------------------------------------------------
        <>
          {isLoading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <SalespersonDashboardStats
                salespeople={salespeople}
                sales={sales}
                advances={advances}
              />

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
                  <SalespersonPerformanceTable
                    salespeople={filtered}
                    sales={sales}
                    advances={advances}
                    onEdit={handleEdit}
                    onDelete={setDeleteId}
                  />
                ) : (
                  <div className="text-center py-12 border rounded-lg">
                    <p className="text-muted-foreground">Nenhum vendedor encontrado.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* FAB mobile-only — desktop usa botão inline no header. */}
      {isMobile && canSeeAll && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Novo Vendedor"
          onClick={openNew}
        />
      )}

      <SalespersonFormDialog
        open={isFormOpen}
        onOpenChange={(o) => { setIsFormOpen(o); if (!o) setEditing(null); }}
        editingSalesperson={editing}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este vendedor? Todas as vendas e vales associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
