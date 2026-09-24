import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { useFinancial } from '@/hooks/useFinancial';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useInboundNfeXml } from '@/hooks/useInboundNotes';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { onlyDigits } from '@/lib/utils';
import { dateInTz } from '@/lib/timezone';
import { formatDate } from '@/lib/format';
import { parseNfeXml, NfeParseError, type NfeParsedDuplicata } from '@/lib/nfeParser';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';

export interface LancarNotaDespesaSource {
  /** Id da nota (inbound_nfe.id ou inbound_nfse.id) — pra gravar de volta. */
  id: string;
  /**
   * De qual tabela vem: decide se dá pra buscar o XML e ler as duplicatas
   * (`<cobr>`) — NFS-e não tem estrutura equivalente padronizada de cobrança,
   * então continua sempre pela data de emissão/competência.
   */
  kind: 'nfe' | 'nfse';
  /** CNPJ de quem emitiu contra o cliente (emitente da NF-e / prestador da NFS-e). */
  document: string | null;
  partyName: string | null;
  /** Valor sugerido. NFS-e já entra líquido (ver `iss_retido`) quando disponível. */
  amount: number | null;
  dataEmissao: string | null;
  numero: string | null;
}

interface LancarNotaDespesaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: LancarNotaDespesaSource | null;
  /** `useInboundNfe().linkTransaction` ou `useInboundNfse().linkTransaction` — o pai escolhe conforme a subaba. */
  linkTransaction: (input: {
    id: string;
    financial_transaction_id: string | null;
    supplier_id?: string | null;
  }) => Promise<void>;
}

/**
 * "Lançar como despesa" a partir de uma nota recebida (NF-e ou NFS-e).
 *
 * Reescrito contra o financeiro do Dominex (decisão D3 do plano — o Eco usa
 * `financial_bills`, que não existe aqui). Reaproveita o `TransactionFormDialog`
 * inteiro (parcelamento, conta, categoria, regime caixa/competência): este
 * componente só PRÉ-PREENCHE a partir da nota, casa o fornecedor pelo CNPJ
 * quando existe, e grava `financial_transaction_id`/`supplier_id` de volta na
 * nota depois que a despesa é criada — exatamente como `OsFinishRevenueDialog`
 * faz para receita ao finalizar a OS.
 *
 * `amount`/`transaction_date` são SUGESTÃO: continuam editáveis no formulário.
 *
 * VENCIMENTO REAL (duplicatas do XML): quando a NF-e traz `<cobr><dup>`, o
 * fornecedor já combinou prazo — usar a data de emissão como vencimento (como
 * o fluxo fazia antes) obrigava corrigir na mão toda vez. Antes de abrir o
 * `TransactionFormDialog`, mostramos um resumo do que a nota já define
 * (1 vencimento, ou N parcelas) e só então abrimos o formulário:
 * - 1 duplicata → semeia `due_date` com o `dVenc` real.
 * - N duplicatas → `TransactionFormDialog` continua coletando conta/categoria/
 *   fornecedor normalmente (parcelamento em 1x pra ele), mas em `handleSubmit`
 *   SUBSTITUÍMOS o parcelamento pelo plano real da nota (`installmentPlan` em
 *   `useFinancial.createTransaction`): cada parcela nasce com a data e o
 *   valor exatos do `<dup>`, nunca redistribuídos. O campo "Valor" do
 *   formulário vira só um resumo nesse caso — avisamos isso no resumo prévio.
 * - Sem `<cobr>` (ou nota ainda "resumo", sem XML liberado, ou erro de
 *   parse) → cai no comportamento de sempre: vencimento = emissão.
 */
export function LancarNotaDespesaDialog({
  open,
  onOpenChange,
  source,
  linkTransaction,
}: LancarNotaDespesaDialogProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas.lancarDespesaDialog;
  const { toast } = useToast();
  const { createTransaction } = useFinancial();
  const { suppliers } = useSuppliers();

  // Só NF-e tem XML/`<cobr>` pra ler. NFS-e nem entra na query (id null desliga).
  const { data: xmlRow, isLoading: xmlLoading } = useInboundNfeXml(
    source?.kind === 'nfe' ? source.id : null,
  );

  // Passo de confirmação do vencimento/parcelamento (só aparece quando a nota
  // traz duplicatas). Reseta sempre que a nota muda ou o diálogo fecha — sem
  // isso, abrir outra nota herdaria a confirmação da anterior (o componente
  // nunca desmonta: só alterna entre `null`/resumo/formulário).
  const [confirmedInstallments, setConfirmedInstallments] = useState(false);
  useEffect(() => {
    if (!open) setConfirmedInstallments(false);
  }, [open, source?.id]);

  // Casa fornecedor pelo CNPJ (regra de referência: `inboundBill.ts` do Eco).
  // Só compara dígitos — o cadastro do cliente pode ter máscara ou não.
  const matchedSupplierId = useMemo(() => {
    if (!source?.document) return null;
    const sourceDigits = onlyDigits(source.document);
    if (!sourceDigits) return null;
    const match = suppliers.find((s) => onlyDigits(s.cpf_cnpj) === sourceDigits);
    return match?.id ?? null;
  }, [source?.document, suppliers]);

  const description = source?.partyName
    ? t.descriptionWithParty.replace('{party}', source.partyName)
    : t.descriptionFallback;

  const emissionDate = source?.dataEmissao ? dateInTz(source.dataEmissao, timezone) : undefined;

  // Duplicatas do bloco `<cobr>` — só dá pra ler com XML completo (`resumo:
  // false`). Nota ainda resumo (sem manifestação de ciência) ou erro de parse
  // (XML malformado/parcial) cai no fallback de sempre: vazio.
  const duplicatas: NfeParsedDuplicata[] = useMemo(() => {
    if (!xmlRow?.xml_content || xmlRow.resumo) return [];
    try {
      return parseNfeXml(xmlRow.xml_content).duplicatas;
    } catch (e) {
      if (!(e instanceof NfeParseError)) throw e;
      return [];
    }
  }, [xmlRow?.xml_content, xmlRow?.resumo]);

  const hasMultipleInstallments = duplicatas.length > 1;
  const singleDueDate = duplicatas.length === 1 ? duplicatas[0].dueDate : null;
  // Vencimento efetivo do lançamento único: a duplicata real quando existe,
  // senão a emissão (comportamento de sempre). Em N duplicatas este valor não
  // é usado como vencimento final — cada parcela recebe a própria data em
  // `handleSubmit` — mas ainda pré-preenche o campo enquanto o usuário navega
  // o formulário.
  const dueDate = singleDueDate ?? emissionDate;

  const prefill = useMemo(
    () => ({
      transaction_type: 'saida' as const,
      description,
      amount: source?.amount ?? 0,
      ...(emissionDate ? { transaction_date: emissionDate } : {}),
      ...(dueDate ? { due_date: dueDate } : {}),
      // Nasce em aberto: a nota chegou, mas o cliente ainda não deu baixa no
      // pagamento dela. Fica editável — quem já pagou marca na hora.
      is_paid: false,
      ...(matchedSupplierId ? { supplier_id: matchedSupplierId } : {}),
    }),
    [description, source?.amount, emissionDate, dueDate, matchedSupplierId],
  );

  if (!open || !source) {
    // `TransactionFormDialog` monta o Financeiro inteiro (categorias, contas,
    // clientes, fornecedores) — só existe custo pra montar isso enquanto o
    // fluxo está em uso, mesmo padrão de `OsFinishRevenueDialog`.
    return null;
  }

  const handleSubmit = async (payload: any) => {
    // N duplicatas: o parcelamento real vem da nota, não do que o usuário
    // escolheu no seletor "Parcelas" do formulário (que fica em 1x — quem
    // decide quantas parcelas e quando cada uma vence é o fornecedor, no XML).
    const finalPayload = hasMultipleInstallments
      ? {
          ...payload,
          installment_count: duplicatas.length,
          installmentPlan: duplicatas.map((d) => ({ date: d.dueDate, amount: d.amount })),
        }
      : payload;

    const result = await createTransaction.mutateAsync(finalPayload);
    // Com N parcelas, `result.ids` vem ordenado por `installment_number` (ver
    // `useFinancial.ts`) — o primeiro é a PARCELA 1 (a de vencimento mais
    // próximo, já que as duplicatas chegam ordenadas do parser). Vinculamos a
    // ela: é a que "Ver lançamento" abre, e de lá dá pra ver as demais
    // parcelas do grupo em "Transações relacionadas".
    const newId: string | null = result?.primary?.id ?? result?.ids?.[0] ?? null;
    if (newId) {
      try {
        await linkTransaction({
          id: source.id,
          financial_transaction_id: newId,
          supplier_id: matchedSupplierId,
        });
        toast({ title: t.toastLinked });
      } catch {
        // A despesa JÁ foi criada — não desfazemos por causa de um vínculo que
        // falhou. O selo "Lançada" simplesmente não aparece ainda.
        toast({ title: t.toastLinkError, variant: 'destructive' });
      }
    }
    return result;
  };

  // Ainda buscando o XML pra saber se há duplicatas: janela curta (1 linha),
  // mas sem isso a tela pularia direto pro formulário e só descobriria o
  // vencimento real depois de aberto.
  if (source.kind === 'nfe' && xmlLoading) {
    return (
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.hint}>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ResponsiveModal>
    );
  }

  // Resumo do que vai acontecer, antes de abrir o formulário — só quando a
  // nota realmente define vencimento(s) (`<cobr>` presente).
  if (duplicatas.length >= 1 && !confirmedInstallments) {
    const dates = duplicatas.map((d) => formatDate(d.dueDate, locale, timezone)).join(', ');
    const summaryLine = hasMultipleInstallments
      ? t.installmentsConfirm.multipleLine
          .replace('{count}', String(duplicatas.length))
          .replace('{dates}', dates)
      : t.installmentsConfirm.singleLine.replace('{date}', dates);

    return (
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={t.installmentsConfirm.title}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.installmentsConfirm.cancel}
            </Button>
            <Button onClick={() => setConfirmedInstallments(true)}>
              {t.installmentsConfirm.continue}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1 text-sm">
          <p>{summaryLine}</p>
          {hasMultipleInstallments && (
            <p className="text-xs text-muted-foreground">{t.installmentsConfirm.amountNote}</p>
          )}
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <TransactionFormDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      isLoading={createTransaction.isPending}
      defaultType="saida"
      prefill={prefill}
    />
  );
}
