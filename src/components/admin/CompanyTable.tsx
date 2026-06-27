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
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { useTableSort } from '@/hooks/useTableSort';
import { Edit, Trash2, ChevronLeft, ChevronRight, CalendarIcon, Loader2, AlertTriangle, MessageCircle, Building2 } from 'lucide-react';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getSelectableSegments, getSegment } from '@/utils/companySegments';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';

interface CompanyTableProps {
  companies: any[];
  masterUserMap: Map<string, string>;
  origins: any[] | undefined;
  salespersonMap?: Map<string, { name: string; photo_url: string | null }>;
  /**
   * Gate financeiro: quando false, oculta a coluna "Valor Mensal" (R$).
   * Consistente com o gate do kanban — vendedor restrito não vê R$ em
   * nenhuma view da tela de Empresas. Default true (super_admin/master).
   */
  canSeeTotals?: boolean;
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

export function CompanyTable({ companies, masterUserMap, origins, salespersonMap, canSeeTotals = true, onEdit, onRefetch }: CompanyTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
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
      const { error } = await supabase.rpc('admin_delete_company', { p_company_id: id });
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

  // Pré-calcula campo derivado pra sort de vencimento (timestamp em vez de string ISO).
  // useTableSort é genérico — qualquer comparação custom precisa virar campo aqui.
  const companiesWithSortFields = useMemo(() => {
    return companies.map((c) => ({
      ...c,
      _expiresAtTs: c.subscription_expires_at ? new Date(c.subscription_expires_at).getTime() : null,
    }));
  }, [companies]);

  const { sortedItems: sorted, sortConfig, handleSort } = useTableSort(companiesWithSortFields);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = sorted.slice(startIndex, startIndex + itemsPerPage);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      active: { label: 'Ativo', className: 'bg-green-500 hover:bg-green-600 text-white' },
      testing: { label: 'Testando', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
      inactive: { label: 'Desativado', className: 'bg-red-500 hover:bg-red-600 text-white' },
      pending_payment: { label: 'Pagamento Pendente', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
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
              <SortableTableHead sortKey="subscription_status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
              <SortableTableHead sortKey="contact_name" sortConfig={sortConfig} onSort={handleSort}>Usuário Master</SortableTableHead>
              <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort} className="min-w-[200px]">Empresa</SortableTableHead>
              <SortableTableHead sortKey="origin" sortConfig={sortConfig} onSort={handleSort}>Origem</SortableTableHead>
              <SortableTableHead sortKey="segment" sortConfig={sortConfig} onSort={handleSort}>Segmento</SortableTableHead>
              <SortableTableHead sortKey="subscription_plan" sortConfig={sortConfig} onSort={handleSort}>Plano</SortableTableHead>
              <SortableTableHead sortKey="salesperson_id" sortConfig={sortConfig} onSort={handleSort}>Vendedor</SortableTableHead>
              <SortableTableHead sortKey="_expiresAtTs" sortConfig={sortConfig} onSort={handleSort}>Vencimento</SortableTableHead>
              {/* Gate de totais R$: coluna oculta para vendedor restrito. */}
              {canSeeTotals && (
                <SortableTableHead sortKey="subscription_value" sortConfig={sortConfig} onSort={handleSort} className="w-[140px]">Valor Mensal</SortableTableHead>
              )}
              <TableHead className="text-right text-xs uppercase tracking-wider">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <EmptyState
                    size="compact"
                    icon={<Building2 className="h-10 w-10" />}
                    title="Nenhuma empresa encontrada"
                    description="Tente uma busca ou filtros diferentes."
                  />
                </TableCell>
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
                    {/* Segment - inline select */}
                    <TableCell onClick={(e) => e.stopPropagation()} className="py-6 overflow-visible">
                      {(() => {
                        const seg = getSegment(company.segment);
                        const isUpd = updatingField?.id === company.id && updatingField?.field === 'segment';
                        return (
                          <Select
                            value={company.segment || ''}
                            onValueChange={(value) => updateCompanyMutation.mutate({ id: company.id, field: 'segment', value })}
                            disabled={isUpd}
                          >
                            <SelectTrigger className="w-[170px] h-auto min-h-[2.5rem] border-0 bg-transparent hover:bg-accent py-3">
                              <SelectValue placeholder="Selecione">
                                {isUpd ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : seg ? (
                                  <Badge className="text-white border-0 gap-1" style={{ backgroundColor: seg.color }}>
                                    <seg.icon className="h-3 w-3" />
                                    <span className="truncate max-w-[110px]">{seg.label}</span>
                                  </Badge>
                                ) : '—'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="py-2 max-h-[320px]">
                              {getSelectableSegments().map((s) => (
                                <SelectItem key={s.value} value={s.value} className="py-2">
                                  <Badge className="text-white border-0 gap-1" style={{ backgroundColor: s.color }}>
                                    <s.icon className="h-3 w-3" />
                                    {s.label}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {company.subscription_plan ? (
                        <Badge className={cn('whitespace-nowrap', PLAN_COLORS[company.subscription_plan] || 'bg-muted text-foreground')}>
                          {PLAN_LABELS[company.subscription_plan] || company.subscription_plan}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.salesperson_id && salespersonMap?.get(company.salesperson_id) ? (
                        (() => {
                          const sp = salespersonMap.get(company.salesperson_id)!;
                          return (
                            <div className="flex items-center gap-2">
                              <SalespersonAvatar name={sp.name} photoUrl={sp.photo_url} size="sm" />
                              <span className="text-sm">{sp.name}</span>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
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
                    {/* Gate de totais R$: célula oculta para vendedor restrito. */}
                    {canSeeTotals && (
                      <TableCell>{(company.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          actions={[
                            {
                              label: 'WhatsApp',
                              icon: MessageCircle,
                              onClick: () => window.open(`https://wa.me/55${company.phone.replace(/\D/g, '')}`, '_blank'),
                              hidden: !company.phone,
                            },
                            {
                              label: 'Editar empresa',
                              icon: Edit,
                              variant: 'edit',
                              onClick: () => onEdit(company),
                            },
                            {
                              label: 'Excluir empresa',
                              icon: Trash2,
                              variant: 'delete',
                              onClick: () => { setCompanyToDelete(company); setConfirmationText(''); setDeleteDialogOpen(true); },
                            },
                          ]}
                        />
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
