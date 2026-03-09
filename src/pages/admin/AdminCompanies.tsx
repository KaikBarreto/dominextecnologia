import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Filter, Eye, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import CompanyFormModal from '@/components/admin/CompanyFormModal';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  testing: { label: 'Teste', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  active: { label: 'Ativa', className: 'bg-emerald-500 text-white hover:bg-emerald-500' },
  inactive: { label: 'Inativa', className: 'bg-rose-500 text-white hover:bg-rose-500' },
};

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

function getExpirationStyle(expirationDate: string | null): string {
  if (!expirationDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);
  const diff = differenceInDays(exp, today);

  if (diff > 7) return 'bg-emerald-600 text-white';
  if (diff > 0) return 'bg-amber-500 text-white';
  if (diff === 0) return 'bg-amber-500 text-white';
  if (diff >= -7) return 'bg-purple-600 text-white';
  return 'bg-rose-600 text-white';
}

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { data: companies = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch master users for all companies
  const { data: masterUsers = [] } = useQuery({
    queryKey: ['admin-master-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, company_id')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Build a map of company_id -> first user (master)
  const masterUserMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of masterUsers) {
      if (u.company_id && !map.has(u.company_id)) {
        map.set(u.company_id, u.full_name);
      }
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

  // Auto-deactivate expired companies
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
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()) || c.cnpj?.includes(search);
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (sortColumn === 'subscription_expires_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), 'pt-BR');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginated = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
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
        <Input
          placeholder="Buscar por nome, CNPJ ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          {isMobile ? (
            <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" className="gap-2 w-full sm:w-auto justify-center">
                  <Filter className="h-4 w-4" /> Filtros
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader><DrawerTitle>Filtros</DrawerTitle></DrawerHeader>
                <div className="p-4 pb-8"><FilterContent /></div>
              </DrawerContent>
            </Drawer>
          ) : (
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
          )}
          <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Nova Empresa
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold text-xs" onClick={() => handleSort('subscription_status')}>
                      Status <SortIcon column="subscription_status" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <span className="font-semibold text-xs">Responsável</span>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold text-xs" onClick={() => handleSort('name')}>
                      Empresa <SortIcon column="name" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <span className="font-semibold text-xs">Origem</span>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold text-xs" onClick={() => handleSort('subscription_plan')}>
                      Plano <SortIcon column="subscription_plan" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold text-xs" onClick={() => handleSort('subscription_expires_at')}>
                      Vencimento <SortIcon column="subscription_expires_at" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold text-xs" onClick={() => handleSort('subscription_value')}>
                      Valor <SortIcon column="subscription_value" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma empresa encontrada</TableCell>
                  </TableRow>
                ) : (
                  paginated.map((c: any) => {
                    const st = STATUS_BADGES[c.subscription_status] || STATUS_BADGES.inactive;
                    const expStyle = getExpirationStyle(c.subscription_expires_at);
                    const masterName = c.contact_name || masterUserMap.get(c.id) || '-';
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/empresas/${c.id}`)}>
                        <TableCell>
                          <Badge className={st.className}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{masterName}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.email || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{c.origin || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{PLAN_LABELS[c.subscription_plan] || c.subscription_plan || '-'}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {c.subscription_expires_at ? (
                            <Badge className={cn('text-xs border-0', expStyle)}>
                              {format(new Date(c.subscription_expires_at), 'dd/MM/yyyy')}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.subscription_value || 0)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/admin/empresas/${c.id}`); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, sorted.length)} de {sorted.length}</span>
                <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-2">{currentPage}/{totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
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
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(companyToDelete.id)}
              disabled={deleteConfirmText.trim() !== companyToDelete?.name?.trim() || deleteMutation.isPending}
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
