import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { planTransactionEdit, carryOverTransactionLinks } from '@/lib/finance-edit-plan';
import { computeBillDates } from '@/hooks/useCreditCardBills';
import type { FinancialTransaction } from '@/types/database';

/**
 * Fonte ÚNICA do "Salvar" de um lançamento financeiro (criar E editar).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE HOOK EXISTE
 *
 * O mesmo `TransactionFormDialog` é aberto em duas telas: o Financeiro geral
 * (`src/pages/Finance.tsx`) e a aba Financeiro da ficha do cliente
 * (`src/pages/CustomerDetail.tsx`). Cada uma tinha a SUA cópia da decisão
 * "atualizo esta linha ou recrio o lançamento?".
 *
 * Quando o bug que derretia parcelamento foi corrigido, só uma das cópias foi
 * corrigida. A da ficha do cliente continuou com um `needsReplace` próprio e um
 * `.delete().eq('installment_group_id', ...)` — ou seja, editar a parcela 3/10
 * por lá criava UMA linha de R$ 100 e apagava as DEZ de R$ 100. A venda de
 * R$ 1.000 virava R$ 100, em silêncio, sem erro e sem alerta.
 *
 * Duas cópias de uma regra que move dinheiro é uma cópia a mais. Agora existe
 * uma só, e ela vive aqui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE HOOK GARANTE
 *
 *  • Quem decide entre UPDATE e "recriar" é `planTransactionEdit`, o motor puro
 *    e testado de `src/lib/finance-edit-plan.ts`. A tela não decide nada.
 *  • O caminho "recriar" apaga NO MÁXIMO UMA linha: a própria, pelo `id`, via
 *    `deleteTransaction.mutateAsync(id)`. Este arquivo NÃO tem, e não pode
 *    ganhar, um delete por `installment_group_id`: a única porta de exclusão
 *    aqui recebe um id de linha e nada mais. Apagar um parcelamento inteiro
 *    continua sendo uma ação explícita do usuário, em outro lugar.
 *  • Lançamento recriado carrega os vínculos da original (cliente, OS,
 *    contrato, funcionário/folha) via `carryOverTransactionLinks` — senão ele
 *    nasce órfão e some da ficha do cliente que o gerou.
 *  • Falha de anexo ou de exclusão não engole o erro: vira toast, nos 4 idiomas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE AS MUTATIONS VÊM DE FORA
 *
 * As duas telas já chamam `useFinancial()` (precisam da lista e dos `isPending`
 * do botão). Se este hook chamasse `useFinancial()` por conta própria, haveria
 * uma terceira instância derivando as mesmas listas a cada render, sem ganho.
 * Recebendo as mutations, a dependência fica explícita e a fronteira do
 * Supabase continua sendo o hook — o componente nunca fala com o banco.
 */

/** Só o que este hook precisa das mutations de `useFinancial()`. */
interface CreateTransactionLike {
  mutateAsync: (input: any) => Promise<{ ids: string[]; primary: any }>;
}
interface UpdateTransactionLike {
  mutateAsync: (input: any) => Promise<any>;
}
/**
 * A porta de exclusão recebe UM id. Não existe assinatura aqui capaz de
 * expressar "apague o grupo" — é essa a trava.
 */
interface DeleteTransactionLike {
  mutateAsync: (id: string) => Promise<any>;
}

export interface UseTransactionEditSubmitArgs {
  createTransaction: CreateTransactionLike;
  updateTransaction: UpdateTransactionLike;
  deleteTransaction: DeleteTransactionLike;
  /**
   * Cliente "dono da tela". Um lançamento antigo sem `customer_id`, editado de
   * dentro da ficha de um cliente, adota aquele cliente. Só entra quando nem o
   * formulário nem a transação original trazem `customer_id` — nunca
   * sobrescreve vínculo existente. No Financeiro geral não existe dono de tela,
   * então fica `undefined`.
   */
  fallbackCustomerId?: string | null;
}

export interface TransactionSubmitResult {
  ids: string[];
  primary: any;
}

/**
 * Duplica as linhas de `financial_transaction_attachments` da transação
 * original pra cada linha nova, apontando pro MESMO `storage_path` (arquivo
 * físico único, várias rows referenciando). Não copia o arquivo no Storage —
 * alinhado ao padrão de `useUploadTransactionAttachmentShared`.
 */
async function relinkAttachments(oldTransactionId: string, newIds: string[]) {
  if (newIds.length === 0) return;
  const { data: existing, error: selErr } = await supabase
    .from('financial_transaction_attachments')
    .select('storage_path, file_name, mime_type, size_bytes, uploaded_by')
    .eq('transaction_id', oldTransactionId);
  if (selErr) throw selErr;
  if (!existing || existing.length === 0) return;

  const rows = newIds.flatMap((newId) =>
    existing.map((att) => ({
      transaction_id: newId,
      storage_path: att.storage_path,
      file_name: att.file_name,
      mime_type: att.mime_type,
      size_bytes: att.size_bytes,
      uploaded_by: att.uploaded_by,
    }))
  );
  const { error: insErr } = await supabase
    .from('financial_transaction_attachments')
    .insert(rows);
  if (insErr) throw insErr;
}

/**
 * Garante que a FATURA do mês exista quando um lançamento passa a viver num
 * cartão. A tela "Contas e Cartões" lista as faturas a partir de
 * `credit_card_bills`: compra com `credit_card_bill_date` de um mês sem fatura
 * não aparece em lugar nenhum. O `createTransaction` já faz esse upsert; o
 * UPDATE plano não fazia, e agora que editar uma parcela é sempre UPDATE, a
 * lacuna ficaria visível. Idempotente (`ignoreDuplicates`).
 */
async function ensureCreditCardBill(
  accountId?: string | null,
  billDate?: string | null,
) {
  if (!accountId || !billDate) return;
  const { data: account } = await supabase
    .from('financial_accounts')
    .select('id, company_id, type, closing_day, payment_due_days, due_day')
    .eq('id', accountId)
    .maybeSingle();
  if (!account || account.type !== 'cartao') return;
  const { closing_date, due_date } = computeBillDates(account as any, billDate);
  await supabase.from('credit_card_bills').upsert(
    {
      company_id: account.company_id,
      account_id: account.id,
      reference_month: billDate,
      closing_date,
      due_date,
      status: 'open',
      amount_paid: 0,
    },
    { onConflict: 'account_id,reference_month', ignoreDuplicates: true },
  );
}

export function useTransactionEditSubmit({
  createTransaction,
  updateTransaction,
  deleteTransaction,
  fallbackCustomerId,
}: UseTransactionEditSubmitArgs) {
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const replaceToast = MESSAGES[locale].app.finance.transactionForm.replaceToast;

  /**
   * `editing = null` → criação. `editing` preenchido → edição, e aí quem manda
   * é o plano.
   */
  return async function submitTransaction(
    data: any,
    editing: FinancialTransaction | null,
  ): Promise<TransactionSubmitResult> {
    // ── Criação: o `createTransaction` já devolve { ids, primary } e já cobre
    //    à vista e parcelado. Nada a decidir.
    if (!editing) {
      return await createTransaction.mutateAsync(data);
    }

    // ── Edição: a decisão é do motor puro, não da tela. É ele que impede que
    //    uma parcela entre no caminho "recriar" (o `amount` dela é FATIA, não
    //    total) e que garante `rowsToDelete` ∈ {0, 1}.
    const plan = planTransactionEdit({
      original: editing,
      intent: {
        payment_method: data.payment_method,
        installment_count: data.installment_count,
      },
    });

    if (plan.action === 'replace') {
      // 1. Cria primeiro, pra não perder dados se algo falhar.
      //    `carryOverTransactionLinks` reinjeta cliente, OS, contrato e folha:
      //    o formulário não conhece esses campos.
      const payload = {
        ...carryOverTransactionLinks(data, editing as any, { fallbackCustomerId }),
        installment_count: plan.installmentCount,
      };
      const created = await createTransaction.mutateAsync(payload);

      // 2. Relink dos anexos ANTES do delete, senão perdem o `storage_path`
      //    referenciado pela transação original.
      try {
        await relinkAttachments(editing.id, created.ids);
      } catch {
        toast({
          variant: 'destructive',
          title: replaceToast.attachmentsLostTitle,
          description: replaceToast.attachmentsLostDesc,
        });
      }

      // 3. Delete da original: UMA linha, pelo id dela. `plan.rowsToDelete` é
      //    tipado `0 | 1` — "apagar o grupo" não é representável.
      if (plan.rowsToDelete === 1) {
        try {
          await deleteTransaction.mutateAsync(editing.id);
        } catch {
          toast({
            variant: 'destructive',
            title: replaceToast.originalKeptTitle,
            description: replaceToast.originalKeptDesc,
          });
        }
      }
      return created;
    }

    // ── Caminho normal: UPDATE na própria linha. `installment_count` vem do
    //    plano (sempre 1 aqui): o `amount` da linha é o valor dela, e nada
    //    pode redividi-lo.
    const updated = await updateTransaction.mutateAsync({
      ...data,
      installment_count: plan.installmentCount,
      id: editing.id,
    });

    // Passou a viver num cartão? A fatura do mês precisa existir.
    if (
      data.credit_card_bill_date &&
      data.credit_card_bill_date !== (editing as any).credit_card_bill_date
    ) {
      try {
        await ensureCreditCardBill(data.account_id, data.credit_card_bill_date);
      } catch {
        // Falha aqui não desfaz a edição: a linha está salva. A fatura é
        // recriada no próximo lançamento naquele cartão.
      }
    }

    return { ids: [editing.id], primary: updated };
  };
}
