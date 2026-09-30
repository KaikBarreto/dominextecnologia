import { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Landmark,
  Link2,
  Loader2,
  Paperclip,
  Receipt,
  Repeat2,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignedLink } from '@/components/ui/SignedLink';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import type { CostCenter } from '@/hooks/useCostCenters';
import {
  createAttachmentSignedUrl,
  formatAttachmentSize,
  useTransactionAttachments,
} from '@/hooks/useTransactionAttachments';
import { useReceivablePayments } from '@/hooks/useReceivablePayments';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatMoney } from '@/lib/format';
import type { FinancialTransaction } from '@/types/database';
import { cn } from '@/lib/utils';
import { FinancialCategoryPill } from './FinancialCategoryPill';
import { getCostCenterIcon } from './categoryIcons';

/** Mesma regra de CostCenterSelect: sem ícone cadastrado, continua a bolinha lisa. */
function costCenterBadge(costCenter: CostCenter) {
  const Icon = getCostCenterIcon(costCenter.icon);
  return (
    <span className="inline-flex items-center gap-1.5">
      {Icon ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: costCenter.color }}>
          <Icon className="h-2.5 w-2.5 text-white" />
        </span>
      ) : (
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: costCenter.color }} />
      )}
      {costCenter.name}
    </span>
  );
}

type DetailTransaction = FinancialTransaction & {
  customer?: { name?: string | null; document?: string | null } | null;
  supplier?: { name?: string | null; cpf_cnpj?: string | null } | null;
  employee?: { name?: string | null } | null;
  account?: { name?: string | null; type?: string | null; color?: string | null } | null;
  creator?: { full_name?: string | null; email?: string | null } | null;
};

interface FinancialTransactionDetailsPanelProps {
  transaction: DetailTransaction;
  category?: FinancialCategory | null;
  costCenter?: CostCenter | null;
  onViewPartialHistory?: () => void;
  className?: string;
}

const PAYMENT_METHODS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  cheque: 'Cheque',
};

function formatDate(value?: string | null) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function DetailItem({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="min-w-0 rounded-xl bg-background/70 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="break-words text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export function FinancialTransactionDetailsPanel({
  transaction,
  category,
  costCenter,
  onViewPartialHistory,
  className,
}: FinancialTransactionDetailsPanelProps) {
  const { data: attachments = [], isLoading: loadingAttachments } = useTransactionAttachments(transaction.id);
  const { payments, isLoading: loadingPayments } = useReceivablePayments(
    transaction.transaction_type === 'entrada' ? transaction.id : undefined,
  );
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const { toast } = useToast();
  const { locale, currency } = useAppLocaleContext();
  const money = (value: number) => formatMoney(Number(value || 0), currency, locale);
  const counterparty = transaction.employee?.name
    || transaction.customer?.name
    || transaction.supplier?.name
    || 'Não vinculado';
  const counterpartyDocument = transaction.customer?.document || transaction.supplier?.cpf_cnpj;
  const installment = transaction.installment_total && transaction.installment_total > 1
    ? `Sim — ${transaction.installment_number || 1} de ${transaction.installment_total}`
    : 'Não';
  const received = Number(transaction.amount_received || 0);

  const openAttachment = async (id: string, storagePath: string) => {
    setOpeningAttachmentId(id);
    try {
      const url = await createAttachmentSignedUrl(storagePath);
      if (!url) throw new Error('signed_url_failed');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível abrir o anexo' });
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  return (
    <div className={cn('bg-muted/35 px-3 py-4 sm:px-5', className)} onClick={(event) => event.stopPropagation()}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem
          label="Situação"
          icon={CheckCircle2}
          value={transaction.cancelled_at ? 'Cancelada' : transaction.is_paid ? (transaction.transaction_type === 'entrada' ? 'Recebida' : 'Paga') : 'Pendente'}
        />
        <DetailItem
          label="Categoria"
          icon={Receipt}
          value={transaction.category
            ? <FinancialCategoryPill name={transaction.category} category={category} size="sm" />
            : 'Sem categoria'}
        />
        <DetailItem label="Cliente, fornecedor ou colaborador" icon={UserRound} value={counterpartyDocument ? `${counterparty} · ${counterpartyDocument}` : counterparty} />
        <DetailItem label="Conta financeira" icon={Landmark} value={transaction.account?.name || 'Não vinculada'} />
        <DetailItem label="Data do lançamento" icon={CalendarDays} value={formatDate(transaction.transaction_date)} />
        <DetailItem label="Vencimento" icon={CalendarDays} value={formatDate(transaction.due_date)} />
        <DetailItem label={transaction.transaction_type === 'entrada' ? 'Recebimento' : 'Pagamento'} icon={WalletCards} value={transaction.paid_date ? `${formatDate(transaction.paid_date)} · ${PAYMENT_METHODS[transaction.payment_method || ''] || transaction.payment_method || 'Forma não informada'}` : 'Ainda não realizado'} />
        <DetailItem label="Centro de custo" value={costCenter ? costCenterBadge(costCenter) : 'Não vinculado'} />
        <DetailItem label="Repete / parcelamento" icon={Repeat2} value={installment} />
        <DetailItem label="Valor original" value={money(Number(transaction.amount))} />
        {transaction.transaction_type === 'entrada' && received > 0 && (
          <DetailItem label="Já recebido" value={`${money(received)} de ${money(Number(transaction.amount))}`} />
        )}
        <DetailItem label="Vínculos" icon={Link2} value={[
          transaction.contract_id ? 'Contrato' : null,
          transaction.service_order_id ? 'Ordem de serviço' : null,
          transaction.transfer_pair_id ? 'Transferência' : null,
          transaction.payment_group_id ? 'Quitação em lote' : null,
          transaction.tenant_charge_id ? 'Cobrança online' : null,
        ].filter(Boolean).join(' · ') || 'Nenhum'} />
        <DetailItem label="Criado por" value={transaction.creator?.full_name || transaction.creator?.email || 'Não informado'} />
        <DetailItem label="Criado em" value={transaction.created_at ? new Date(transaction.created_at).toLocaleString('pt-BR') : 'Não informado'} />
        <DetailItem label="Última atualização" value={transaction.updated_at ? new Date(transaction.updated_at).toLocaleString('pt-BR') : 'Não informado'} />
      </div>

      {(transaction.notes || transaction.cancelled_reason) && (
        <div className="mt-3 rounded-xl bg-background/70 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Observações</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{transaction.cancelled_reason || transaction.notes}</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-background/70 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-4 w-4" /> Anexos e comprovantes
          </div>
          <div className="mt-2 space-y-1.5">
            {loadingAttachments ? (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando anexos...</span>
            ) : attachments.length === 0 && !transaction.receipt_url ? (
              <p className="text-xs text-muted-foreground">Nenhum anexo vinculado.</p>
            ) : (
              <>
                {attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => openAttachment(attachment.id, attachment.storage_path)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 truncate">{attachment.file_name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {formatAttachmentSize(attachment.size_bytes)}
                      {openingAttachmentId === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                ))}
                {transaction.receipt_url && (
                  <SignedLink src={transaction.receipt_url} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-muted">
                    <FileText className="h-4 w-4" /> Comprovante legado
                  </SignedLink>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-background/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <WalletCards className="h-4 w-4" />
              {transaction.transaction_type === 'entrada' ? 'Detalhes de recebimento' : 'Detalhes de pagamento'}
            </div>
            {onViewPartialHistory && payments.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={onViewPartialHistory}>Gerenciar histórico</Button>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            {loadingPayments ? (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando pagamentos...</span>
            ) : payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {transaction.is_paid
                  ? (transaction.transaction_type === 'entrada' ? 'Recebimento realizado integralmente.' : 'Pagamento realizado integralmente.')
                  : (transaction.transaction_type === 'entrada' ? 'Nenhum recebimento parcial registrado.' : 'Pagamento ainda não realizado.')}
              </p>
            ) : payments.map((payment) => (
              <div key={payment.id} className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-2.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{money(payment.amount)}</span>
                <span className="text-muted-foreground">{formatDate(payment.paid_date)} · {payment.account?.name || 'Conta não informada'} · {PAYMENT_METHODS[payment.payment_method || ''] || payment.payment_method || 'Forma não informada'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
