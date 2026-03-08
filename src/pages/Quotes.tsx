import { useState, useMemo } from 'react';
import {
  FileText, Plus, Search, Pencil, Trash2, Eye, Send, CheckCircle2, XCircle,
  ExternalLink, ClipboardList, DollarSign, Palette,
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
import { useQuotes, STATUS_LABELS, STATUS_COLORS, type Quote } from '@/hooks/useQuotes';
import { QuoteFormDialog } from '@/components/quotes/QuoteFormDialog';
import { QuoteViewDialog } from '@/components/quotes/QuoteViewDialog';
import { ProposalConfigDialog } from '@/components/quotes/ProposalConfigDialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

export default function Quotes() {
  const { quotes, isLoading, updateStatus, deleteQuote, duplicateQuote, createFinancialFromQuote, kpis } = useQuotes();
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

  const shareWhatsApp = (q: Quote) => {
    const url = `${window.location.origin}/proposta/${q.token}`;
    const msg = `Olá! Segue a proposta #${q.quote_number} no valor de R$ ${(q.total_value ?? 0).toFixed(2)}.\n\nAcesse: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Orçamentos</h1>
            <p className="text-sm text-muted-foreground">{quotes.length} orçamentos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfigOpen(true)}>
            <Palette className="h-4 w-4 mr-2" /> Configurar Proposta
          </Button>
          <Button onClick={() => { setEditQuote(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Orçamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total em Aberto</p>
            <p className="text-lg font-bold text-foreground">R$ {kpis.totalOpen.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
            <p className="text-lg font-bold text-foreground">{kpis.conversionRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ticket Médio</p>
            <p className="text-lg font-bold text-foreground">R$ {kpis.avgTicket.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-foreground">{kpis.total}</p>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                <TableHead className="hidden sm:table-cell">Validade</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.map((q) => (
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
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                    {q.valid_until ? format(new Date(q.valid_until), 'dd/MM/yy', { locale: ptBR }) : '—'}
                  </TableCell>
                  <TableCell className="font-semibold">R$ {(q.total_value ?? 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[q.status] ?? ''}>
                      {STATUS_LABELS[q.status] ?? q.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={300}>
                      <div className="flex justify-end gap-1">
                        {/* View */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewQuote(q)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Visualizar</TooltipContent>
                        </Tooltip>


                        {/* Approve / Reject */}
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

                        {/* Generate Financial */}
                        {q.status === 'aprovado' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success"
                                onClick={() => createFinancialFromQuote.mutate(q)}>
                                <DollarSign className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Gerar Conta a Receber</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Abrir em nova guia */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`${window.location.origin}/proposta/${q.token}`, '_blank')}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir em nova guia</TooltipContent>
                        </Tooltip>

                        {/* Edit */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="edit-ghost" size="icon" className="h-8 w-8"
                              onClick={() => { setEditQuote(q); setFormOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>

                        {/* Delete */}
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
              ))}
            </TableBody>
          </Table>
          <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
        </Card>
      )}

      <QuoteFormDialog open={formOpen} onOpenChange={setFormOpen} quote={editQuote} />
      <QuoteViewDialog open={!!viewQuote} onOpenChange={(o) => !o && setViewQuote(null)} quote={viewQuote ? (quotes.find(q => q.id === viewQuote.id) ?? viewQuote) : null} />
      <ProposalConfigDialog open={configOpen} onOpenChange={setConfigOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Orçamento</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.</AlertDialogDescription>
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
