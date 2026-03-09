import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  FileText, Plus, Search, Pencil, Trash2, Eye, CheckCircle2, XCircle,
  ExternalLink, DollarSign, ArrowRight, Settings2, TrendingUp, Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsSidebarLayout } from '@/components/SettingsSidebarLayout';
import { useQuotes, STATUS_LABELS, STATUS_COLORS, type Quote } from '@/hooks/useQuotes';
import { useQuoteConversion } from '@/hooks/useQuoteConversion';
import { QuoteFormDialog } from '@/components/quotes/QuoteFormDialog';
import { QuoteViewDialog } from '@/components/quotes/QuoteViewDialog';
import { ProposalConfigDialog } from '@/components/quotes/ProposalConfigDialog';
import { PricingTab } from '@/components/pricing/PricingTab';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';

const SIDEBAR_TABS = [
  { value: 'quotes', label: 'Orçamentos', icon: FileText },
  { value: 'pricing', label: 'Precificação', icon: Settings2 },
];

function QuotesList() {
  const isMobile = useIsMobile();
  const { quotes, isLoading, updateStatus, deleteQuote, duplicateQuote, createFinancialFromQuote, kpis } = useQuotes();
  const { convertToServiceOrder, isConverting } = useQuoteConversion();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = quotes;
    if (statusFilter !== 'all') list = list.filter((q) => q.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) =>
          q.customers?.name?.toLowerCase().includes(s) ||
          q.prospect_name?.toLowerCase().includes(s) ||
          String(q.quote_number).includes(s)
      );
    }
    return list;
  }, [quotes, statusFilter, search]);

  const pagination = useDataPagination(filtered);

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/proposta/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link da proposta copiado!' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Orçamentos</h2>
            <p className="text-xs text-muted-foreground">{quotes.length} orçamentos</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
            Configurar Proposta
          </Button>
          <Button size="sm" onClick={() => { setEditQuote(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Orçamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total em Aberto</p>
            <p className="text-sm sm:text-lg font-bold text-foreground truncate">
              {kpis.totalOpen.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Taxa de Conversão</p>
            <p className="text-sm sm:text-lg font-bold text-foreground">{kpis.conversionRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Ticket Médio</p>
            <p className="text-sm sm:text-lg font-bold text-foreground truncate">
              {kpis.avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />Margem Média
            </p>
            <p className="text-sm sm:text-lg font-bold text-foreground">{kpis.avgMarginPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
              <Calculator className="h-3 w-3" />Custo Total
            </p>
            <p className="text-sm sm:text-lg font-bold text-foreground truncate">
              {kpis.totalCostSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
            <p className="text-sm sm:text-lg font-bold text-foreground">{kpis.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum orçamento encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {isMobile ? (
            <div className="p-3 space-y-3">
              {pagination.paginatedItems.map((q) => (
                <Card key={q.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-sm">#{q.quote_number}</span>
                      <Badge className={STATUS_COLORS[q.status] ?? ''}>{STATUS_LABELS[q.status] ?? q.status}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{q.customers?.name ?? q.prospect_name ?? '—'}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{format(new Date(q.created_at), 'dd/MM/yy', { locale: ptBR })}</span>
                      <span className="font-semibold text-foreground">
                        {(q.final_price ?? q.total_value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 pt-1 border-t">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewQuote(q)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`${window.location.origin}/proposta/${q.token}`, '_blank')}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => { setEditQuote(q); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Data</TableHead>
                  <TableHead className="hidden lg:table-cell">Custo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="hidden lg:table-cell">Margem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((q) => {
                  const cost = Number(q.total_cost ?? 0);
                  const price = Number(q.final_price ?? q.total_value ?? 0);
                  const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null;
                  return (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">#{q.quote_number}</TableCell>
                    <TableCell>
                      {q.customers?.name ?? q.prospect_name ?? '—'}
                      {!q.customer_id && q.prospect_name && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">(prospecto)</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                      {format(new Date(q.created_at), 'dd/MM/yy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                      {cost > 0 ? cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {margin !== null ? (
                        <Badge variant={margin >= 20 ? 'success' : margin >= 0 ? 'warning' : 'destructive'} className="text-[10px]">
                          {margin}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[q.status] ?? ''}>
                        {STATUS_LABELS[q.status] ?? q.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider delayDuration={300}>
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewQuote(q)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Visualizar</TooltipContent>
                          </Tooltip>

                          {q.status === 'enviado' && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-success"
                                    onClick={() => updateStatus.mutate({ id: q.id, status: 'aprovado' })}>
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Aprovar</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                    onClick={() => updateStatus.mutate({ id: q.id, status: 'rejeitado' })}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Rejeitar</TooltipContent>
                              </Tooltip>
                            </>
                          )}

                          {q.status === 'aprovado' && !q.converted_to_os_id && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"
                                    onClick={() => convertToServiceOrder.mutate(q)}
                                    disabled={isConverting}>
                                    <ArrowRight className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Converter em OS</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-success"
                                    onClick={() => createFinancialFromQuote.mutate(q)}>
                                    <DollarSign className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Gerar Conta a Receber</TooltipContent>
                              </Tooltip>
                            </>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"
                                onClick={() => window.open(`${window.location.origin}/proposta/${q.token}`, '_blank')}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Abrir em nova guia</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="edit-ghost" size="icon" className="h-8 w-8"
                                onClick={() => { setEditQuote(q); setFormOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="destructive-ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(q.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <DataTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </Card>
      )}

      {/* Modals */}
      <QuoteFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditQuote(null); }}
        quote={editQuote}
      />
      {viewQuote && (
        <QuoteViewDialog
          open={!!viewQuote}
          onOpenChange={(v) => { if (!v) setViewQuote(null); }}
          quote={viewQuote}
        />
      )}
      <ProposalConfigDialog open={configOpen} onOpenChange={setConfigOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteQuote.mutate(deleteId); setDeleteId(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Quotes() {
  const [activeTab, setActiveTab] = useState('quotes');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Gerencie orçamentos e configurações de precificação</p>
        </div>
      </div>

      <SettingsSidebarLayout
        tabs={SIDEBAR_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === 'quotes' && <QuotesList />}
        {activeTab === 'pricing' && <PricingTab />}
      </SettingsSidebarLayout>
    </div>
  );
}
