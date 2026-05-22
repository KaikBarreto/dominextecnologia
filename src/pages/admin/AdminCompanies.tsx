import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus,
  Filter,
  LayoutList,
  Kanban,
  Trash2,
  Search,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarX,
  Pencil,
  Eye,
  Lock,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import CompanyFormModal from '@/components/admin/CompanyFormModal';
import { CompanyTable } from '@/components/admin/CompanyTable';
import { CompanyKanbanBoard } from '@/components/admin/CompanyKanbanBoard';
import { differenceInDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

// Tipo mínimo da company conforme usado nesta tela. Schema completo é definido
// pelo dev-database em types/database; aqui só refinamos o suficiente pra evitar
// any nos pontos onde introduzimos código novo.
type CompanyLite = {
  id: string;
  name: string;
  email?: string | null;
  cnpj?: string | null;
  logo_url?: string | null;
  origin?: string | null;
  subscription_status: 'active' | 'testing' | 'inactive' | string;
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
};

const PLAN_LABELS: Record<string, string> = {
  start: 'Start',
  starter: 'Start',
  avancado: 'Avançado',
  pro: 'Avançado',
  master: 'Master',
  enterprise: 'Master',
};

// Gera iniciais (máx 2 caracteres) para avatar fallback.
function getCompanyInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// Badge de status — mesma paleta da CompanyTable para manter consistência visual.
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-green-500 hover:bg-green-600 text-white' },
  testing: { label: 'Testando', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
  inactive: { label: 'Desativado', className: 'bg-red-500 hover:bg-red-600 text-white' },
};

export default function AdminCompanies() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [expirationFilter, setExpirationFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    const saved = localStorage.getItem('admin-companies-view-mode');
    return (saved === 'kanban' || saved === 'list') ? saved : 'list';
  });

  const handleViewModeChange = (value: string) => {
    if (value === 'list' || value === 'kanban') {
      setViewMode(value);
      localStorage.setItem('admin-companies-view-mode', value);
    }
  };

  const { data: companies = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: masterUsers = [] } = useQuery({
    queryKey: ['admin-master-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name, company_id').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const masterUserMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of masterUsers) {
      if (u.company_id && !map.has(u.company_id)) map.set(u.company_id, u.full_name);
    }
    return map;
  }, [masterUsers]);

  const { data: origins } = useQuery({
    queryKey: ['company-origins'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_origins').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('salespeople_basic').select('id, name, photo_url').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const salespersonMap = useMemo(() => {
    const m = new Map<string, { name: string; photo_url: string | null }>();
    for (const s of salespeople) {
      if (s.id && s.name) m.set(s.id, { name: s.name, photo_url: s.photo_url ?? null });
    }
    return m;
  }, [salespeople]);

  // Auto-deactivate expired
  useEffect(() => {
    const deactivate = async () => {
      if (!companies?.length) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const toDeactivate = companies.filter((c: any) => {
        if (!c.subscription_expires_at || c.subscription_status === 'inactive') return false;
        const exp = new Date(c.subscription_expires_at);
        exp.setHours(0, 0, 0, 0);
        const diff = differenceInDays(exp, today);
        if (c.subscription_status === 'testing') return diff < 0;
        return diff < -5;
      });
      if (!toDeactivate.length) return;
      for (const c of toDeactivate) {
        await supabase.from('companies').update({ subscription_status: 'inactive' }).eq('id', c.id);
      }
      refetch();
    };
    deactivate();
  }, [companies, refetch]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Empresa excluída' });
      setCompanyToDelete(null);
      setDeleteConfirmText('');
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Erro ao excluir' }),
  });

  // Toggle bloquear/desbloquear (mobile) — alterna entre 'active' e 'inactive'.
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: 'active' | 'inactive' }) => {
      const { error } = await supabase.from('companies').update({ subscription_status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast({
        title: vars.newStatus === 'active' ? 'Empresa desbloqueada' : 'Empresa bloqueada',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Erro ao atualizar status' }),
  });

  // Contadores brutos (sobre TODAS as empresas, não as filtradas)
  // Vencidas = ativas/testando com vencimento < hoje (subset que merece atenção).
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let active = 0;
    let testing = 0;
    let inactive = 0;
    let overdue = 0;
    for (const c of companies as CompanyLite[]) {
      if (c.subscription_status === 'active') active++;
      else if (c.subscription_status === 'testing') testing++;
      else if (c.subscription_status === 'inactive') inactive++;
      if (c.subscription_expires_at && c.subscription_status !== 'inactive') {
        const exp = new Date(c.subscription_expires_at);
        exp.setHours(0, 0, 0, 0);
        if (differenceInDays(exp, today) < 0) overdue++;
      }
    }
    return { active, testing, inactive, overdue };
  }, [companies]);

  const filtered = useMemo(() => {
    return (companies as CompanyLite[]).filter((c) => {
      const matchSearch = !search || fuzzyIncludes(c.name, search) || fuzzyIncludes(c.email, search) || fuzzyIncludes(c.cnpj, search);
      const matchStatus = statusFilter === 'all' || c.subscription_status === statusFilter;
      const matchOrigin = originFilter === 'all' || c.origin === originFilter;
      const matchPlan = planFilter === 'all' || c.subscription_plan === planFilter;
      let matchExp = true;
      if (expirationFilter !== 'all' && c.subscription_expires_at) {
        const exp = new Date(c.subscription_expires_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        switch (expirationFilter) {
          case 'today': matchExp = diff === 0; break;
          case '7days': matchExp = diff >= 0 && diff <= 7; break;
          case '15days': matchExp = diff >= 0 && diff <= 15; break;
          case '30days': matchExp = diff >= 0 && diff <= 30; break;
          case 'overdue': matchExp = diff < 0; break;
        }
      } else if (expirationFilter !== 'all' && !c.subscription_expires_at) {
        matchExp = false;
      }
      return matchSearch && matchStatus && matchOrigin && matchPlan && matchExp;
    });
  }, [companies, search, statusFilter, originFilter, planFilter, expirationFilter]);

  const handleEdit = (company: any) => {
    setEditingCompany(company);
    setShowForm(true);
  };

  const handleDeleteFromKanban = (company: any) => {
    setCompanyToDelete(company);
    setDeleteConfirmText('');
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setOriginFilter('all');
    setExpirationFilter('all');
    setPlanFilter('all');
  };

  // Contagem de filtros ativos (badge do FilterSheet).
  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (originFilter !== 'all' ? 1 : 0) +
    (expirationFilter !== 'all' ? 1 : 0) +
    (planFilter !== 'all' ? 1 : 0);

  // -----------------------------------------------------------------
  // Stat carousel items (mobile-first) — clicáveis para filtrar.
  // -----------------------------------------------------------------
  const statItems = [
    {
      key: 'active',
      label: 'Ativas',
      count: stats.active,
      icon: <CheckCircle2 className="h-4 w-4" />,
      accentColor: 'hsl(var(--success))',
      active: statusFilter === 'active',
      onClick: () => setStatusFilter(statusFilter === 'active' ? 'all' : 'active'),
    },
    {
      key: 'testing',
      label: 'Trial',
      count: stats.testing,
      icon: <Clock className="h-4 w-4" />,
      accentColor: 'hsl(var(--warning))',
      active: statusFilter === 'testing',
      onClick: () => setStatusFilter(statusFilter === 'testing' ? 'all' : 'testing'),
    },
    {
      key: 'inactive',
      label: 'Bloqueadas',
      count: stats.inactive,
      icon: <XCircle className="h-4 w-4" />,
      accentColor: 'hsl(var(--destructive))',
      active: statusFilter === 'inactive',
      onClick: () => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive'),
    },
    {
      key: 'overdue',
      label: 'Vencidas',
      count: stats.overdue,
      icon: <CalendarX className="h-4 w-4" />,
      accentColor: '#a855f7', // purple — distinto de bloqueadas e mais alarmista que warning
      active: expirationFilter === 'overdue',
      onClick: () => setExpirationFilter(expirationFilter === 'overdue' ? 'all' : 'overdue'),
    },
  ];

  // -----------------------------------------------------------------
  // Conteúdo dos filtros — usado por FilterSheet (mobile) e Sheet (desktop).
  // -----------------------------------------------------------------
  const FilterContent = ({ withViewToggle = false }: { withViewToggle?: boolean }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="testing">Testando</SelectItem>
            <SelectItem value="inactive">Desativado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Origem</Label>
        <Select value={originFilter} onValueChange={setOriginFilter}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {origins?.map((o: any) => (
              <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Vencimento</Label>
        <Select value={expirationFilter} onValueChange={setExpirationFilter}>
          <SelectTrigger><SelectValue placeholder="Vencimento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="today">Vence Hoje</SelectItem>
            <SelectItem value="7days">Próximos 7 Dias</SelectItem>
            <SelectItem value="15days">Próximos 15 Dias</SelectItem>
            <SelectItem value="30days">Próximos 30 Dias</SelectItem>
            <SelectItem value="overdue">Vencidas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Plano</Label>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger><SelectValue placeholder="Plano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="starter">Start</SelectItem>
            <SelectItem value="pro">Avançado</SelectItem>
            <SelectItem value="enterprise">Master</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {withViewToggle && (
        <div className="space-y-2 pt-2 border-t">
          <Label>Visualização</Label>
          <div className="flex rounded-lg border overflow-hidden w-full">
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors',
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
              onClick={() => handleViewModeChange('list')}
            >
              <LayoutList className="h-4 w-4" /> Lista
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors',
                viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
              onClick={() => handleViewModeChange('kanban')}
            >
              <Kanban className="h-4 w-4" /> Kanban
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  return (
    <div className={cn('space-y-4 lg:space-y-6 p-4 sm:p-6', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Empresas"
        subtitle={`${filtered.length} empresa${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
        icon={Building2}
      />

      {isMobile ? (
        // -----------------------------------------------------------------
        // MOBILE: busca + FilterSheet (com toggle de view dentro) + Stats.
        // -----------------------------------------------------------------
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar empresas..."
                className="pl-10 h-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterSheet
              triggerLabel="Filtros"
              activeCount={activeFilterCount}
              onClear={clearFilters}
            >
              <FilterContent withViewToggle />
            </FilterSheet>
          </div>

          <StatCarousel items={statItems} loading={isLoading} />
        </>
      ) : (
        // -----------------------------------------------------------------
        // DESKTOP: layout original 100% preservado.
        // -----------------------------------------------------------------
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Buscar por nome, CNPJ ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-2 sm:items-center">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" /> Filtros
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto p-4">
                <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
                <div className="mt-4"><FilterContent /></div>
              </SheetContent>
            </Sheet>

            {/* View Toggle (desktop) */}
            <ToggleGroup type="single" value={viewMode} onValueChange={handleViewModeChange} className="hidden sm:flex">
              <ToggleGroupItem value="list" aria-label="Lista"><LayoutList className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="kanban" aria-label="Kanban"><Kanban className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>

            <Button
              onClick={() => { setEditingCompany(null); setShowForm(true); }}
              className="gap-2 w-full sm:w-auto sm:ml-auto"
            >
              <Plus className="h-4 w-4" /> Nova Empresa
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isMobile ? (
        // -----------------------------------------------------------------
        // MOBILE CONTENT: Lista nativa OU Kanban (escolha do usuário).
        // -----------------------------------------------------------------
        isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-12 w-12" />}
            title={search || activeFilterCount > 0 ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}
            description={
              search || activeFilterCount > 0
                ? 'Tente uma busca ou filtros diferentes'
                : 'Toque em "Nova Empresa" para começar'
            }
          />
        ) : viewMode === 'kanban' ? (
          <CompanyKanbanBoard
            companies={filtered}
            origins={origins || undefined}
            masterUserMap={masterUserMap}
            onEdit={handleEdit}
            onDelete={handleDeleteFromKanban}
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {(filtered as CompanyLite[]).map((company) => {
              const isInactive = company.subscription_status === 'inactive';
              const statusInfo = STATUS_BADGE[company.subscription_status] || {
                label: company.subscription_status,
                className: 'bg-gray-500 text-white',
              };
              const planLabel = company.subscription_plan
                ? (PLAN_LABELS[company.subscription_plan] || company.subscription_plan)
                : null;
              const expFormatted = company.subscription_expires_at
                ? format(parseISO(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR })
                : null;

              const subtitleParts = [
                planLabel,
                expFormatted ? `Vence ${expFormatted}` : null,
              ].filter(Boolean);

              const itemActions: ItemAction[] = [
                {
                  key: 'view',
                  label: 'Visualizar detalhes',
                  icon: <Eye className="h-4 w-4" />,
                  onClick: () => navigate(`/admin/empresas/${company.id}`),
                },
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit',
                  onClick: () => handleEdit(company),
                },
                {
                  key: 'toggle-status',
                  label: isInactive ? 'Desbloquear' : 'Bloquear',
                  icon: isInactive ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
                  onClick: () =>
                    toggleStatusMutation.mutate({
                      id: company.id,
                      newStatus: isInactive ? 'active' : 'inactive',
                    }),
                },
                {
                  key: 'delete',
                  label: 'Excluir',
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive',
                  onClick: () => handleDeleteFromKanban(company),
                },
              ];

              return (
                <MobileListItem
                  key={company.id}
                  onClick={() => navigate(`/admin/empresas/${company.id}`)}
                  actions={itemActions}
                  leading={
                    company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {getCompanyInitials(company.name)}
                      </div>
                    )
                  }
                  title={company.name}
                  subtitle={
                    subtitleParts.length > 0
                      ? subtitleParts.join(' • ')
                      : (company.email || company.cnpj || '—')
                  }
                  trailing={
                    <Badge className={cn('text-[10px] px-2 py-0.5 whitespace-nowrap border-0', statusInfo.className)}>
                      {statusInfo.label}
                    </Badge>
                  }
                />
              );
            })}
          </div>
        )
      ) : (
        // -----------------------------------------------------------------
        // DESKTOP CONTENT: 100% inalterado.
        // -----------------------------------------------------------------
        isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhuma empresa encontrada</div>
        ) : viewMode === 'kanban' ? (
          <CompanyKanbanBoard
            companies={filtered}
            origins={origins || undefined}
            masterUserMap={masterUserMap}
            onEdit={handleEdit}
            onDelete={handleDeleteFromKanban}
          />
        ) : (
          <CompanyTable
            companies={filtered}
            masterUserMap={masterUserMap}
            origins={origins || undefined}
            salespersonMap={salespersonMap}
            onEdit={handleEdit}
            onRefetch={() => refetch()}
          />
        )
      )}

      {/* FAB mobile-only */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Empresa"
          onClick={() => { setEditingCompany(null); setShowForm(true); }}
        />
      )}

      {/* Delete from Kanban / Mobile list */}
      <AlertDialog
        open={!!companyToDelete}
        onOpenChange={(open) => {
          if (!open) { setCompanyToDelete(null); setDeleteConfirmText(''); }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Excluir Empresa
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta ação é <strong>irreversível</strong>.</p>
              <p>Para confirmar, digite: <strong>{companyToDelete?.name}</strong></p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Digite o nome da empresa"
                className="font-mono"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(companyToDelete.id)}
              disabled={
                deleteConfirmText.trim() !== companyToDelete?.name?.trim() ||
                deleteMutation.isPending
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompanyFormModal
        open={showForm}
        onOpenChange={setShowForm}
        company={editingCompany}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
          setShowForm(false);
        }}
      />
    </div>
  );
}
