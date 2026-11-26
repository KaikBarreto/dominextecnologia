import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Eye,
  FileCode,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverDropdownMenu } from '@/components/ui/hover-dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';

import { useIsMobile } from '@/hooks/use-mobile';
import { useTableSort } from '@/hooks/useTableSort';
import { useDataPagination } from '@/hooks/useDataPagination';
import { useGoodsFiscalAccess } from '@/hooks/useGoodsFiscalAccess';
import {
  useGoodsFiscalAutoReconciliation,
  useGoodsFiscalDocumentAction,
  useGoodsFiscalDocuments,
  type GoodsDirection,
  type GoodsFiscalDraft,
  type GoodsModel,
} from '@/hooks/useGoodsFiscal';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import { cpfCnpjMask } from '@/utils/masks';
import { openPendingPdfTab } from '@/utils/openPdfInTab';
import { goodsArtifactUrl, showGoodsArtifact } from '@/lib/fiscal/goodsArtifact';
import { goodsRejectionGuidance } from '@/lib/fiscal/goodsRejectionGuidance';
import { cloneGoodsDraftForReissue, goodsDocumentRecovery } from '@/lib/fiscal/pdvNfce';

import { GoodsFiscalWizard } from './GoodsFiscalWizard';
import { GoodsInvoiceTypeSelector } from './GoodsInvoiceTypeSelector';
import { GOODS_STATUS_FILTER_OPTIONS, GoodsStatusBadge, goodsStatusFilterKey } from './goodsStatus';

/** Itens mostrados no detalhe antes de resumir o restante em "+N". */
const DETAIL_ITEMS_LIMIT = 6;
/** Código que a SEFAZ devolve quando o número já pertence a outra nota. */
const NUMBER_ALREADY_USED = 'sefaz_539';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

interface GoodsRowItem {
  description: string;
  quantity: number;
  total: number;
}

/** Linha da listagem: o documento do banco já resolvido para exibição e ordenação. */
interface GoodsRow {
  id: string;
  raw: Record<string, unknown>;
  payload: Record<string, unknown>;
  status: string;
  /** Última resposta oficial da SEFAZ sobre a chave desta nota. */
  officialStatus: string;
  number: number | null;
  series: number | null;
  homologation: boolean;
  date: string;
  direction: GoodsDirection;
  partyName: string;
  partyDocument: string;
  nature: string;
  total: number;
  items: GoodsRowItem[];
  accessKey: string;
  protocol: string;
  errorCode: string;
  hasXml: boolean;
  hasPdf: boolean;
}

function toGoodsRow(document: Record<string, unknown>, model: GoodsModel): GoodsRow {
  const payload = asRecord(document.draft_payload);
  const party = asRecord(payload.party);
  const items: GoodsRowItem[] = (Array.isArray(payload.items) ? payload.items : []).map((entry) => {
    const item = asRecord(entry);
    return {
      description: asText(item.description),
      quantity: Number(item.quantity || 0),
      total: Number(item.total || 0),
    };
  });
  return {
    id: String(document.id),
    raw: document,
    payload,
    status: String(document.status ?? 'draft'),
    officialStatus: asText(document.official_status),
    number: document.number ? Number(document.number) : null,
    series: document.series != null && document.number ? Number(document.series) : null,
    homologation: Number(document.environment) === 2,
    date: String(document.created_at ?? ''),
    direction: payload.direction === 'entrada' ? 'entrada' : 'saida',
    partyName: asText(party.name),
    partyDocument: asText(party.document),
    nature: asText(payload.nature),
    total: items.reduce((sum, item) => sum + item.total, 0),
    items,
    accessKey: asText(document.access_key),
    protocol: asText(document.protocol),
    errorCode: asText(document.last_error_code),
    hasXml: Boolean(document.processed_xml_path),
    hasPdf: Boolean(document[model === 55 ? 'danfe_pdf_path' : 'danfce_pdf_path']),
  };
}

/** O que dizer ao usuário sobre a situação da nota, quando ela pede explicação. */
function goodsRowHint(row: GoodsRow): string | null {
  if (row.status === 'rejected') return goodsRejectionGuidance(row.errorCode);
  if (row.status === 'uncertain') {
    return 'A SEFAZ ainda não confirmou esta nota. O sistema consulta sozinho e atualiza a situação; nenhum novo envio é feito enquanto isso.';
  }
  if (row.status === 'signed') {
    return row.officialStatus === 'nao_localizada'
      ? 'A SEFAZ confirmou que não recebeu esta nota. Use "Continuar emissão" para enviar o mesmo documento de novo; nenhum número novo é usado.'
      : 'A nota foi preparada, mas ainda não foi enviada. Use "Continuar emissão".';
  }
  return null;
}

export function GoodsFiscalTab({ model }: { model: GoodsModel }) {
  const access = useGoodsFiscalAccess();
  if (!access.allowed) {
    return (
      <p role={access.isLoading ? 'status' : 'alert'} className="py-6 text-sm text-muted-foreground">
        {access.isLoading
          ? 'Verificando acesso fiscal…'
          : 'Você precisa de permissão para emitir notas fiscais de mercadorias. Peça ao administrador para conferir seu acesso.'}
      </p>
    );
  }
  return <GoodsFiscalTabContext key={`${access.scopeId}:${model}`} model={model} />;
}

function GoodsFiscalTabContext({ model }: { model: GoodsModel }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { locale, timezone } = useAppLocaleContext();
  const label = model === 65 ? 'NFC-e' : 'NF-e';
  const pdfLabel = model === 55 ? 'DANFE' : 'DANFC-e';
  const partyFallback = model === 65 ? 'Consumidor não identificado' : 'Não informado';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; draft: GoodsFiscalDraft } | null>(null);
  const [artifact, setArtifact] = useState<{ documentId: string; url: string; kind: 'xml' | 'pdf'; expiresAt: number } | null>(null);
  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);
  const [direction, setDirection] = useState<GoodsDirection>('saida');
  const [cancelDocumentId, setCancelDocumentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState<GoodsDirection[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const documents = useGoodsFiscalDocuments(model);
  const action = useGoodsFiscalDocumentAction();
  useGoodsFiscalAutoReconciliation(model, documents.data);

  const rows = useMemo(() => (documents.data ?? []).map((document) => toGoodsRow(document, model)), [documents.data, model]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter.length > 0 && !statusFilter.includes(goodsStatusFilterKey(row.status))) return false;
        if (directionFilter.length > 0 && !directionFilter.includes(row.direction)) return false;
        return fuzzyIncludesAny(
          [row.number ? String(row.number) : null, row.partyName, row.partyDocument, row.nature, row.accessKey],
          search,
        );
      }),
    [rows, statusFilter, directionFilter, search],
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredRows);
  const pagination = useDataPagination(sortedItems, 25, `goods-fiscal-${model}`);
  const visibleRows = pagination.paginatedItems;

  const fmtMoney = (value: number) => formatMoney(value, 'BRL', locale);
  const fmtDate = (value: string) => (value ? formatDate(value, locale, timezone) : '—');

  const toggleExpand = (id: string) =>
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startNew = () => {
    setEditing(null);
    if (model === 55) setTypeSelectorOpen(true);
    else {
      setDirection('saida');
      setOpen(true);
    }
  };

  const openDraft = (id: string | null, draft: GoodsFiscalDraft) => {
    setEditing({ id, draft });
    setDirection(draft.direction === 'entrada' ? 'entrada' : 'saida');
    setOpen(true);
  };

  const runAction = async (row: GoodsRow, name: 'consult' | 'artifact', kind?: 'xml' | 'pdf') => {
    if (action.isPending) return;
    const pending =
      name === 'artifact' ? openPendingPdfTab(kind === 'xml' ? 'Preparando XML fiscal…' : `Preparando ${pdfLabel}…`) : null;
    setBusyId(row.id);
    try {
      const result = await action.mutateAsync({ model, documentId: row.id, action: name, kind });
      if (!alive.current) {
        pending?.close();
        return;
      }
      if (name === 'artifact') {
        const url = goodsArtifactUrl(result.url);
        if (!url) throw new Error('Não foi possível liberar o arquivo fiscal. Tente novamente.');
        setArtifact({
          documentId: row.id,
          url,
          kind: kind ?? 'pdf',
          expiresAt: Date.now() + Math.min(300, Number(result.expiresIn) || 300) * 1000,
        });
        if (!showGoodsArtifact(pending, url)) toast.message('O navegador não abriu a nova aba. Use o link acima da lista.');
      } else if (result.notTransmitted) toast.message('A SEFAZ não recebeu esta nota. Use "Continuar emissão" para enviar de novo.');
      else if (result.status === 'rejected') toast.error('A SEFAZ não autorizou esta nota. Veja o motivo no detalhe.');
      else if (result.status === 'authorized') toast.success(`${label} autorizada pela SEFAZ.`);
      else toast.message('Situação fiscal consultada.');
    } catch (error) {
      pending?.close();
      if (alive.current) toast.error((error as Error).message);
    } finally {
      if (alive.current) setBusyId(null);
    }
  };

  const runRecovery = async (row: GoodsRow, recovery: NonNullable<ReturnType<typeof goodsDocumentRecovery>>) => {
    try {
      if (recovery.action === 'reissue') {
        openDraft(null, cloneGoodsDraftForReissue(row.payload) as unknown as GoodsFiscalDraft);
        return;
      }
      setBusyId(row.id);
      await action.mutateAsync({ model, documentId: row.id, action: recovery.action });
      if (!alive.current) return;
      await documents.refetch();
      if (!alive.current) return;
      if (recovery.action === 'revise') openDraft(row.id, row.payload as unknown as GoodsFiscalDraft);
      else toast.message('Emissão retomada. Acompanhe a situação desta mesma nota.');
    } catch (error) {
      if (alive.current) toast.error((error as Error).message);
    } finally {
      if (alive.current) setBusyId(null);
    }
  };

  const confirmCancellation = async () => {
    if (!cancelDocumentId || cancelReason.trim().length < 15) return;
    try {
      const result = await action.mutateAsync({
        model,
        documentId: cancelDocumentId,
        action: 'cancel',
        reason: cancelReason.trim(),
      });
      if (!alive.current) return;
      toast.message(
        result.status === 'cancelled' ? 'Cancelamento confirmado pela SEFAZ.' : 'Cancelamento enviado e mantido sob consulta.',
      );
      setCancelDocumentId(null);
      setCancelReason('');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // ─── Ações por linha (o mesmo conteúdo na tabela e no card) ────────────────

  const itemClass = 'gap-2 focus:bg-primary focus:text-primary-foreground';

  const rowActionItems = (row: GoodsRow) => {
    const recovery = goodsDocumentRecovery(row.raw);
    const canConsult = Boolean(row.accessKey) && row.status !== 'signed';
    const canCancel = row.status === 'authorized';
    const numberAlreadyUsed = row.status === 'rejected' && row.errorCode === NUMBER_ALREADY_USED;
    const disabled = action.isPending;
    return (
      <>
        <DropdownMenuItem onClick={() => toggleExpand(row.id)} className={itemClass}>
          <Eye className="h-4 w-4" />
          {expandedRows.has(row.id) ? 'Ocultar detalhes' : 'Ver detalhes'}
        </DropdownMenuItem>
        {row.status === 'draft' && (
          <DropdownMenuItem
            onClick={() => openDraft(row.id, row.payload as unknown as GoodsFiscalDraft)}
            className={itemClass}
          >
            <Pencil className="h-4 w-4" />
            Continuar rascunho
          </DropdownMenuItem>
        )}
        {numberAlreadyUsed && (
          <DropdownMenuItem
            onClick={() => navigate('/notas-fiscais/configuracoes?tab=mercadorias')}
            className={itemClass}
          >
            <Settings className="h-4 w-4" />
            Ajustar numeração
          </DropdownMenuItem>
        )}
        {recovery && (
          <DropdownMenuItem onClick={() => void runRecovery(row, recovery)} disabled={disabled} className={itemClass}>
            <Send className="h-4 w-4" />
            {recovery.label}
          </DropdownMenuItem>
        )}
        {canConsult && (
          <DropdownMenuItem onClick={() => void runAction(row, 'consult')} disabled={disabled} className={itemClass}>
            <RefreshCw className="h-4 w-4" />
            Consultar SEFAZ
          </DropdownMenuItem>
        )}
        {row.hasPdf && (
          <DropdownMenuItem onClick={() => void runAction(row, 'artifact', 'pdf')} disabled={disabled} className={itemClass}>
            <FileDown className="h-4 w-4" />
            Baixar {pdfLabel}
          </DropdownMenuItem>
        )}
        {row.hasXml && (
          <DropdownMenuItem onClick={() => void runAction(row, 'artifact', 'xml')} disabled={disabled} className={itemClass}>
            <FileCode className="h-4 w-4" />
            Baixar XML
          </DropdownMenuItem>
        )}
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              // Cancelamento é irreversível na SEFAZ e exige justificativa de 15+
              // caracteres: sempre passa pela confirmação, nunca direto do menu.
              onClick={() => setCancelDocumentId(row.id)}
              disabled={disabled}
              className="gap-2 text-destructive focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white"
            >
              <Ban className="h-4 w-4" />
              Cancelar nota
            </DropdownMenuItem>
          </>
        )}
      </>
    );
  };

  // ─── Filtros ───────────────────────────────────────────────────────────────

  const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  const filterDropdown = <T extends string>(
    title: string,
    options: { value: T; label: string }[],
    selected: T[],
    onChange: (next: T[]) => void,
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', isMobile ? 'h-10' : 'h-9')}>
          {title}
          {selected.length > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground border-transparent hover:bg-primary">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {selected.length === 0 ? 'Mostrando todas' : title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => onChange(toggleIn(selected, option.value))}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])} className={itemClass}>
              Limpar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const statusFilterControl = filterDropdown('Situação', GOODS_STATUS_FILTER_OPTIONS, statusFilter, setStatusFilter);
  // Entrada e saída só existem na NF-e; a NFC-e é sempre venda ao consumidor.
  const directionFilterControl =
    model === 55
      ? filterDropdown<GoodsDirection>(
          'Tipo',
          [
            { value: 'saida', label: 'Saída' },
            { value: 'entrada', label: 'Entrada' },
          ],
          directionFilter,
          setDirectionFilter,
        )
      : null;

  const searchPlaceholder =
    model === 55 ? 'Buscar por número, cliente, CNPJ ou operação' : 'Buscar por número, consumidor ou operação';
  const hasFilters = statusFilter.length > 0 || directionFilter.length > 0 || search.trim().length > 0;

  // ─── Detalhe da nota ───────────────────────────────────────────────────────

  const DetailField = ({ label: fieldLabel, value }: { label: string; value: ReactNode }) => {
    if (value == null || value === '') return null;
    return (
      <>
        <span className="text-muted-foreground">{fieldLabel}:</span>
        <span className="font-medium break-words">{value}</span>
      </>
    );
  };

  // Campo longo (chave, protocolo) fica fora da grade: dentro dela um valor
  // comprido empurra o rótulo seguinte para outra linha.
  const DetailLongField = ({ label: fieldLabel, value }: { label: string; value: string }) => {
    if (!value) return null;
    return (
      <div className="mt-2 text-sm">
        <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
        <span className="font-mono text-xs font-medium break-all">{value}</span>
      </div>
    );
  };

  const blockTitle = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2';
  const detailGrid = 'grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-6 gap-y-1.5 text-sm';

  const renderDetails = (row: GoodsRow) => {
    const hint = goodsRowHint(row);
    const extraItems = row.items.length - DETAIL_ITEMS_LIMIT;
    return (
      <div className="space-y-4">
        {hint && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3 text-sm',
              row.status === 'rejected' ? 'border-destructive text-destructive' : 'border-border text-foreground',
            )}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{hint}</p>
          </div>
        )}

        <div>
          <div className={blockTitle}>{row.direction === 'entrada' ? 'Remetente' : 'Destinatário'}</div>
          <div className={detailGrid}>
            <DetailField label="Nome" value={row.partyName || partyFallback} />
            <DetailField label="CPF/CNPJ" value={row.partyDocument ? cpfCnpjMask(row.partyDocument) : null} />
          </div>
        </div>

        <div className="border-t border-border/40 pt-3">
          <div className={blockTitle}>Identificação</div>
          <div className={detailGrid}>
            {model === 55 && <DetailField label="Tipo" value={row.direction === 'entrada' ? 'Entrada' : 'Saída'} />}
            <DetailField label="Número" value={row.number ? formatNumber(row.number, locale) : null} />
            <DetailField label="Série" value={row.series != null ? String(row.series) : null} />
            <DetailField label="Ambiente" value={row.homologation ? 'Homologação (teste)' : 'Produção'} />
            <DetailField label="Natureza da operação" value={row.nature} />
            <DetailField label="Criada em" value={fmtDate(row.date)} />
          </div>
          <DetailLongField label="Chave de acesso" value={row.accessKey} />
          <DetailLongField label="Protocolo" value={row.protocol} />
        </div>

        {row.items.length > 0 && (
          <div className="border-t border-border/40 pt-3">
            <div className={blockTitle}>
              {row.items.length === 1 ? '1 item' : `${formatNumber(row.items.length, locale)} itens`}
            </div>
            <ul className="space-y-1 text-sm">
              {row.items.slice(0, DETAIL_ITEMS_LIMIT).map((item, index) => (
                <li key={index} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 break-words">
                    <span className="text-muted-foreground">{formatNumber(item.quantity, locale)} ×</span>{' '}
                    {item.description || 'Item sem descrição'}
                  </span>
                  <span className="shrink-0 font-medium whitespace-nowrap">{fmtMoney(item.total)}</span>
                </li>
              ))}
            </ul>
            {extraItems > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                + {extraItems === 1 ? '1 item' : `${formatNumber(extraItems, locale)} itens`}
              </p>
            )}
            <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border/40 pt-2 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold whitespace-nowrap">{fmtMoney(row.total)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const numberCell = (row: GoodsRow) => (row.number ? `#${row.number}` : '—');
  const Icon = model === 65 ? ReceiptText : FileText;
  const artifactRow = artifact && artifact.expiresAt > Date.now() ? rows.find((row) => row.id === artifact.documentId) : null;

  return (
    <div className="space-y-4 min-w-0 w-full">
      {/* Busca + filtros + ação principal. No mobile a emissão vira FAB. */}
      {isMobile ? (
        <MobileListToolbar searchValue={search} onSearchChange={setSearch} searchPlaceholder={searchPlaceholder}>
          {statusFilterControl}
          {directionFilterControl}
        </MobileListToolbar>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
            <Button className="gap-2 shrink-0" onClick={startNew}>
              <Plus className="h-4 w-4" />
              Nova {label}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusFilterControl}
            {directionFilterControl}
          </div>
        </div>
      )}

      {/* Arquivo liberado: o link fica aqui caso o navegador bloqueie a nova aba. */}
      {artifact && artifactRow && (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm">
          <p className="min-w-0">
            Arquivo pronto{artifactRow.number ? ` da ${label} nº ${artifactRow.number}` : ''}.{' '}
            <a
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-4"
            >
              Abrir {artifact.kind === 'xml' ? 'XML' : pdfLabel}
            </a>
          </p>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Fechar aviso" onClick={() => setArtifact(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {documents.isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando notas…</p>
        </div>
      ) : documents.isError ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive p-4 text-destructive">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar as notas</p>
            <p className="text-sm">Tente novamente. Nenhuma emissão foi iniciada.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void documents.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Icon className="h-10 w-10" />}
          title={`Nenhuma ${label} por aqui`}
          description="Crie manualmente ou importe uma venda/compra já registrada."
          action={{ label: `Nova ${label}`, onClick: startNew }}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="Nenhuma nota encontrada"
          description="Nenhuma nota corresponde à busca ou aos filtros escolhidos."
          action={
            hasFilters
              ? {
                  label: 'Limpar filtros',
                  onClick: () => {
                    setSearch('');
                    setStatusFilter([]);
                    setDirectionFilter([]);
                  },
                }
              : undefined
          }
        />
      ) : isMobile ? (
        /* ─── Mobile: cards ─── */
        <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
          {visibleRows.map((row) => {
            const isExpanded = expandedRows.has(row.id);
            return (
              <div key={row.id}>
                <div className="flex items-center gap-3 px-4 py-3.5" onClick={() => toggleExpand(row.id)}>
                  <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate leading-tight">{row.partyName || partyFallback}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                      {row.number && (
                        <>
                          <span className="font-medium">
                            {label} {row.number}
                          </span>
                          <span className="text-muted-foreground/50">·</span>
                        </>
                      )}
                      <span>{fmtDate(row.date)}</span>
                    </div>
                    {row.nature && <p className="mt-0.5 text-xs text-muted-foreground truncate">{row.nature}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <GoodsStatusBadge status={row.status} />
                      {row.homologation && (
                        <Badge className="bg-slate-500 text-white hover:bg-slate-500 border-transparent">Homologação</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <p className="font-bold text-sm whitespace-nowrap">{fmtMoney(row.total)}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 -mr-2 text-muted-foreground shrink-0"
                          aria-label={`Ações da ${label}${row.number ? ` ${row.number}` : ''}`}
                          disabled={busyId === row.id}
                        >
                          {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                        {rowActionItems(row)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {isExpanded && <div className="border-t border-border/60 bg-background px-4 py-4">{renderDetails(row)}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Desktop: tabela ─── */
        <div className="rounded-lg border overflow-x-auto">
          <Table className="table-fixed [&_th]:px-2 [&_td]:px-2">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-9" />
                <SortableTableHead sortKey="number" sortConfig={sortConfig} onSort={handleSort} className="w-[92px] text-center">
                  Número
                </SortableTableHead>
                <SortableTableHead sortKey="date" sortConfig={sortConfig} onSort={handleSort} className="w-[100px] whitespace-nowrap">
                  Data
                </SortableTableHead>
                <SortableTableHead sortKey="partyName" sortConfig={sortConfig} onSort={handleSort} className="w-[200px]">
                  {model === 65 ? 'Consumidor' : 'Cliente / Fornecedor'}
                </SortableTableHead>
                <SortableTableHead sortKey="nature" sortConfig={sortConfig} onSort={handleSort}>
                  Operação
                </SortableTableHead>
                <SortableTableHead sortKey="total" sortConfig={sortConfig} onSort={handleSort} className="w-[112px] whitespace-nowrap text-right">
                  Valor
                </SortableTableHead>
                <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort} className="w-[168px] text-center">
                  Situação
                </SortableTableHead>
                <TableHead className="w-[56px] text-center text-xs uppercase tracking-wider">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn('cursor-pointer hover:bg-muted/30', isExpanded && 'bg-muted/80 dark:bg-muted/40')}
                      onClick={() => toggleExpand(row.id)}
                    >
                      <TableCell className="w-9">
                        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                      </TableCell>
                      <TableCell className="font-medium text-center">
                        {numberCell(row)}
                        {row.series != null && <div className="text-xs text-muted-foreground font-normal">Série {row.series}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(row.date)}</TableCell>
                      <TableCell>
                        <span className="block truncate">{row.partyName || partyFallback}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block truncate text-muted-foreground">{row.nature || '—'}</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">{fmtMoney(row.total)}</TableCell>
                      <TableCell className="text-center">
                        <GoodsStatusBadge status={row.status} hint={goodsRowHint(row)} />
                        {row.homologation && <div className="mt-1 text-xs text-muted-foreground">Homologação</div>}
                      </TableCell>
                      <TableCell className="text-center" onClick={(event) => event.stopPropagation()}>
                        <HoverDropdownMenu
                          align="end"
                          contentClassName="w-56"
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Ações da ${label}${row.number ? ` ${row.number}` : ''}`}
                              disabled={busyId === row.id}
                            >
                              {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          }
                        >
                          {rowActionItems(row)}
                        </HoverDropdownMenu>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="p-0">
                          <div className="px-6 py-4 bg-background border-t">{renderDetails(row)}</div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!documents.isLoading && !documents.isError && filteredRows.length > 0 && (
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
      )}

      {isMobile && <FABButton icon={<Plus className="h-5 w-5" />} label={`Nova ${label}`} onClick={startNew} />}

      <GoodsInvoiceTypeSelector
        open={typeSelectorOpen}
        onOpenChange={setTypeSelectorOpen}
        onSelect={(selectedDirection) => {
          setDirection(selectedDirection);
          setOpen(true);
        }}
      />
      <GoodsFiscalWizard
        model={model}
        direction={direction}
        documentId={editing?.id}
        initialDraft={editing?.draft}
        sourceType={editing?.draft.sourceType && editing.draft.sourceType !== 'manual' ? editing.draft.sourceType : undefined}
        sourceId={editing?.draft.sourceId}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => documents.refetch()}
      />
      <AlertDialog
        open={cancelDocumentId !== null}
        onOpenChange={(value) => {
          if (!value) {
            setCancelDocumentId(null);
            setCancelReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {label} na SEFAZ?</AlertDialogTitle>
            <AlertDialogDescription>
              A situação oficial será consultada antes do envio. Essa operação fiscal não pode ser desfeita depois de
              confirmada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="goods-cancel-reason">Justificativa</Label>
            <Textarea
              id="goods-cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={255}
              placeholder="Explique o motivo com pelo menos 15 caracteres"
            />
            <p className="text-xs text-muted-foreground">{cancelReason.trim().length}/15 caracteres mínimos</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelReason.trim().length < 15 || action.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmCancellation();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {action.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
