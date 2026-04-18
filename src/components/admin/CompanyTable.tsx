import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, CalendarIcon, Loader2, AlertTriangle } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

interface CompanyTableProps {
  companies: any[];
  masterUserMap: Map<string, string>;
  origins: any[] | undefined;
  salespersonMap?: Map<string, string>;
  onEdit: (company: any) => void;
  onRefetch: () => void;
}

const PLAN_LABELS: Record<string, string> = {
  start: 'Start',
  starter: 'Start',
  avancado: 'Avançado',
  pro: 'Avançado',
  master: 'Master',
  enterprise: 'Master',
};

const PLAN_COLORS: Record<string, string> = {
  start: 'bg-sky-500 hover:bg-sky-600 text-white border-0',
  starter: 'bg-sky-500 hover:bg-sky-600 text-white border-0',
  avancado: 'bg-violet-600 hover:bg-violet-700 text-white border-0',
  pro: 'bg-violet-600 hover:bg-violet-700 text-white border-0',
  master: 'bg-amber-500 hover:bg-amber-600 text-white border-0',
  enterprise: 'bg-amber-500 hover:bg-amber-600 text-white border-0',
};

export function CompanyTable({ companies, masterUserMap, origins, salespersonMap, onEdit, onRefetch }: CompanyTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [updatingField, setUpdatingField] = useState<{ id: string; field: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  const [confirmationText, setConfirmationText] = useState('');

  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      setUpdatingField({ id, field });
      const { error } = await supabase.from('companies').update({ [field]: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Empresa atualizada' });
      setUpdatingField(null);
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      onRefetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar' });
      setUpdatingField(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Empresa excluída' });
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
      setConfirmationText('');
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Erro ao excluir' }),
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortColumn) return companies;
    return [...companies].sort((a, b) => {
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
  }, [companies, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = sorted.slice(startIndex, startIndex + itemsPerPage);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      active: { label: 'Ativo', className: 'bg-green-500 hover:bg-green-600 text-white' },
      testing: { label: 'Testando', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
      inactive: { label: 'Desativado', className: 'bg-red-500 hover:bg-red-600 text-white' },
    };
    const v = variants[status] || { label: status, className: 'bg-gray-500 text-white' };
    return <Badge className={v.className}>{v.label}</Badge>;
  };

  const getExpirationColor = (expirationDate: string | null) => {
    if (!expirationDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDate);
    exp.setHours(0, 0, 0, 0);
    const diff = differenceInDays(exp, today);
    if (diff > 0) return 'bg-green-600 text-white';
    if (diff === 0) return 'bg-yellow-500 text-white';
    if (diff >= -7) return 'bg-purple-600 text-white';
    return 'bg-red-600 text-white';
  };

  const getOriginData = (originName: string | null) => {
    if (!originName) return null;
    return origins?.find(o => o.name === originName) || null;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('subscription_status')}>
                  Status <SortIcon column="subscription_status" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('contact_name')}>
                  Usuário Master <SortIcon column="contact_name" />
                </Button>
              </TableHead>
              <TableHead className="min-w-[200px]">
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('name')}>
                  Empresa <SortIcon column="name" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('origin')}>
                  Origem <SortIcon column="origin" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('subscription_plan')}>
                  Plano <SortIcon column="subscription_plan" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('subscription_expires_at')}>
                  Vencimento <SortIcon column="subscription_expires_at" />
                </Button>
              </TableHead>
              <TableHead className="w-[140px]">
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-semibold" onClick={() => handleSort('subscription_value')}>
                  Valor Mensal <SortIcon column="subscription_value" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma empresa encontrada</TableCell>
              </TableRow>
            ) : (
              paginated.map((company) => {
                const masterName = company.contact_name || masterUserMap.get(company.id) || 'N/A';
                const originData = getOriginData(company.origin);
                return (
                  <TableRow key={company.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/empresas/${company.id}`)}>
                    {/* Status - inline select */}
                    <TableCell onClick={(e) => e.stopPropagation()} className="py-6 overflow-visible">
                      <Select
                        value={company.subscription_status}
                        onValueChange={(value) => updateCompanyMutation.mutate({ id: company.id, field: 'subscription_status', value })}
                        disabled={updatingField?.id === company.id && updatingField?.field === 'subscription_status'}
                      >
                        <SelectTrigger className="w-[140px] h-auto min-h-[2.5rem] border-0 bg-transparent hover:bg-accent py-3">
                          <SelectValue>
                            {updatingField?.id === company.id && updatingField?.field === 'subscription_status' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : getStatusBadge(company.subscription_status)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="py-2">
                          <SelectItem value="active" className="py-3"><Badge className="bg-green-500 hover:!bg-green-500 !text-white border-green-500">Ativo</Badge></SelectItem>
                          <SelectItem value="testing" className="py-3"><Badge className="bg-orange-500 hover:!bg-orange-500 !text-white border-orange-500">Testando</Badge></SelectItem>
                          <SelectItem value="inactive" className="py-3"><Badge className="bg-red-500 hover:!bg-red-500 !text-white border-red-500">Desativado</Badge></SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{masterName}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{company.name}</TableCell>
                    {/* Origin - inline select */}
                    <TableCell onClick={(e) => e.stopPropagation()} className="py-6 overflow-visible">
                      <Select
                        value={company.origin || ''}
                        onValueChange={(value) => updateCompanyMutation.mutate({ id: company.id, field: 'origin', value })}
                        disabled={updatingField?.id === company.id && updatingField?.field === 'origin'}
                      >
                        <SelectTrigger className="w-[150px] h-auto min-h-[2.5rem] border-0 bg-transparent hover:bg-accent py-3">
                          <SelectValue placeholder="Selecione">
                            {updatingField?.id === company.id && updatingField?.field === 'origin' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : originData ? (
                              <Badge className="text-white border-0" style={{ backgroundColor: originData.color || '#6B7280' }}>
                                {originData.name}
                              </Badge>
                            ) : 'N/A'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="py-2">
                          {origins?.map((o) => (
                            <SelectItem key={o.id} value={o.name} className="py-3">
                              <Badge className="text-white border-0" style={{ backgroundColor: o.color || '#6B7280' }}>{o.name}</Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">{PLAN_LABELS[company.subscription_plan] || company.subscription_plan || 'N/A'}</Badge>
                    </TableCell>
                    {/* Expiration - inline calendar */}
                    <TableCell onClick={(e) => e.stopPropagation()} className={cn('py-6', getExpirationColor(company.subscription_expires_at))}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" className={cn('h-8 w-full justify-start text-left font-normal px-2 hover:bg-white/10', !company.subscription_expires_at && 'text-muted-foreground')} disabled={updatingField?.id === company.id && updatingField?.field === 'subscription_expires_at'}>
                            {updatingField?.id === company.id && updatingField?.field === 'subscription_expires_at' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CalendarIcon className="mr-2 h-3 w-3" />
                                {company.subscription_expires_at ? format(parseISO(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar'}
                              </>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={company.subscription_expires_at ? parseISO(company.subscription_expires_at) : undefined}
                            onSelect={(date) => {
                              if (date) updateCompanyMutation.mutate({ id: company.id, field: 'subscription_expires_at', value: date.toISOString() });
                            }}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>{(company.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {company.phone && (
                          <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 w-8" onClick={() => window.open(`https://wa.me/55${company.phone.replace(/\D/g, '')}`, '_blank')}>
                            <WhatsAppIcon className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-yellow-500 hover:text-white" onClick={() => onEdit(company)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive hover:text-white" onClick={() => { setCompanyToDelete(company); setConfirmationText(''); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sorted.length)} de {sorted.length}
          </div>
          <div className="flex items-center gap-2">
            <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <span className="text-sm px-2">{currentPage}/{totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Você está prestes a excluir <strong className="text-foreground">{companyToDelete?.name}</strong>.</p>
              <p className="text-destructive font-medium">Esta ação é irreversível!</p>
              <div className="space-y-2 pt-2">
                <Label className="text-xs">Digite o nome da empresa para confirmar:</Label>
                <div className="rounded-md bg-muted p-2"><p className="text-xs font-semibold">{companyToDelete?.name}</p></div>
                <Input value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} placeholder="Digite o nome" />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCompanyToDelete(null); setConfirmationText(''); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(companyToDelete.id)} disabled={confirmationText.trim() !== companyToDelete?.name?.trim() || deleteMutation.isPending} className="bg-destructive hover:bg-destructive/90">
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
