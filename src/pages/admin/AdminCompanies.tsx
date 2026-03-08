import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Filter, Search, Eye, Trash2 } from 'lucide-react';
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

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  testing: { label: 'Teste', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  active: { label: 'Ativa', className: 'bg-emerald-500 text-white hover:bg-emerald-500' },
  inactive: { label: 'Inativa', className: 'bg-rose-500 text-white hover:bg-rose-500' },
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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
      <Button variant="outline" className="w-full" onClick={clearFilters}>
        Limpar Filtros
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 lg:space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Gerenciar empresas cadastradas</p>
        </div>
      </div>

      {/* Search + Filters + Actions */}
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="hidden sm:table-cell">CNPJ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Plano</TableHead>
                  <TableHead className="hidden md:table-cell">Vencimento</TableHead>
                  <TableHead className="hidden lg:table-cell">Origem</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma empresa encontrada</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c: any) => {
                    const st = STATUS_BADGES[c.subscription_status] || STATUS_BADGES.inactive;
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/empresas/${c.id}`)}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{c.cnpj || '-'}</TableCell>
                        <TableCell>
                          <Badge className={st.className}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm capitalize">{c.subscription_plan || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {c.subscription_expires_at ? format(new Date(c.subscription_expires_at), 'dd/MM/yyyy') : '-'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{c.origin || '-'}</TableCell>
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
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!companyToDelete} onOpenChange={(open) => { if (!open) { setCompanyToDelete(null); setDeleteConfirmText(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Excluir Empresa
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta ação é <strong>irreversível</strong>. Todos os dados da empresa serão permanentemente excluídos.</p>
              <ul className="text-sm space-y-1 list-disc list-inside ml-2">
                <li>Todos os usuários da empresa</li>
                <li>Todos os dados cadastrais</li>
                <li>Todo o histórico financeiro</li>
              </ul>
              <p>Para confirmar, digite o nome da empresa: <strong>{companyToDelete?.name}</strong></p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Digite o nome da empresa"
                className="font-mono"
              />
              {deleteConfirmText && deleteConfirmText.trim() !== companyToDelete?.name?.trim() && (
                <p className="text-sm text-destructive">O nome digitado não corresponde</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCompanyToDelete(null); setDeleteConfirmText(''); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(companyToDelete.id)}
              disabled={deleteConfirmText.trim() !== companyToDelete?.name?.trim() || deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir Empresa'}
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
