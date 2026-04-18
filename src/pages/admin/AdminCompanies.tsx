import { useState, useEffect, useMemo } from 'react';
import { fuzzyIncludes } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Filter, LayoutList, Kanban, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import CompanyFormModal from '@/components/admin/CompanyFormModal';
import { CompanyTable } from '@/components/admin/CompanyTable';
import { CompanyKanbanBoard } from '@/components/admin/CompanyKanbanBoard';
import { differenceInDays } from 'date-fns';

export default function AdminCompanies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [expirationFilter, setExpirationFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    queryKey: ['salespeople-map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('salespeople').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const salespersonMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespeople) m.set(s.id, s.name);
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

  const filtered = companies.filter((c: any) => {
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
    }
    return matchSearch && matchStatus && matchOrigin && matchPlan && matchExp;
  });

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

  const FilterContent = () => (
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
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" className="w-full" onClick={clearFilters}>Limpar Filtros</Button>
    </div>
  );

  return (
    <div className="space-y-4 lg:space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {filtered.length} empresa{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Input placeholder="Buscar por nome, CNPJ ou email..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full" />
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2 sm:items-center">
          {isMobile ? (
            <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" className="gap-2 w-full sm:w-auto justify-center"><Filter className="h-4 w-4" /> Filtros</Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader><DrawerTitle>Filtros</DrawerTitle></DrawerHeader>
                <div className="p-4 pb-8"><FilterContent /></div>
              </DrawerContent>
            </Drawer>
          ) : (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2"><Filter className="h-4 w-4" /> Filtros</Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto p-4">
                <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
                <div className="mt-4"><FilterContent /></div>
              </SheetContent>
            </Sheet>
          )}

          {/* View Toggle */}
          <ToggleGroup type="single" value={viewMode} onValueChange={handleViewModeChange} className="hidden sm:flex">
            <ToggleGroupItem value="list" aria-label="Lista"><LayoutList className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="kanban" aria-label="Kanban"><Kanban className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>

          <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="gap-2 w-full sm:w-auto sm:ml-auto">
            <Plus className="h-4 w-4" /> Nova Empresa
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhuma empresa encontrada</div>
      ) : (isMobile || viewMode === 'kanban') ? (
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
      )}

      {/* Delete from Kanban */}
      <AlertDialog open={!!companyToDelete} onOpenChange={(open) => { if (!open) { setCompanyToDelete(null); setDeleteConfirmText(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Excluir Empresa
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta ação é <strong>irreversível</strong>.</p>
              <p>Para confirmar, digite: <strong>{companyToDelete?.name}</strong></p>
              <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Digite o nome da empresa" className="font-mono" />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(companyToDelete.id)} disabled={deleteConfirmText.trim() !== companyToDelete?.name?.trim() || deleteMutation.isPending} className="bg-destructive hover:bg-destructive/90">
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
