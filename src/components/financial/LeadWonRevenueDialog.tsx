import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readPastedCents } from '@/lib/money-paste-mask';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { useFinancial } from '@/hooks/useFinancial';
import { linkLeadWonTransaction } from '@/hooks/useLeadWonRevenue';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LeadRevenueContext } from '@/hooks/useLeadWonRevenuePrompt';

export interface LeadWonRevenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LeadRevenueContext | null;
}

type LeadRevenueMessages = typeof MESSAGES['pt-br']['app']['finance']['leadRevenue'];

/**
 * Descrição que vai PARA O BANCO no lançamento. Sem travessão (régua de copy):
 * o separador é o ponto médio. Mesma régua do `buildDescription` de
 * OsFinishRevenueDialog.
 */
function buildDescription(t: LeadRevenueMessages, ctx: LeadRevenueContext): string {
  const title = ctx.leadTitle?.trim() ?? '';
  const name = ctx.customerName?.trim() ?? '';
  if (title) {
    return name
      ? t.descriptionWithCustomer.replace('{title}', title).replace('{customer}', name)
      : t.descriptionTitleOnly.replace('{title}', title);
  }
  return name ? `${t.descriptionFallback} · ${name}` : t.descriptionFallback;
}

/**
 * Receita da oportunidade ganha (CRM).
 *
 * Passo 1: a pergunta. Passo 2 (só no "Sim"): o formulário de receita do
 * Financeiro, pré-preenchido e vinculado à oportunidade
 * (`leads.won_transaction_id`).
 *
 * O que este componente NÃO faz, e não pode passar a fazer: parcelamento,
 * cartão, tarifa, escolha de conta/categoria, regime caixa/competência,
 * `paid_date`. Tudo isso é regra do `TransactionFormDialog` e fica lá. Aqui só
 * se pré-preenche e se vincula.
 *
 * POR QUE É UM PAR NOVO E NÃO UMA GENERALIZAÇÃO DO `OsFinishRevenueDialog`:
 * o esqueleto de 2 passos é parecido, mas tudo que importa diverge — a trava de
 * idempotência (lá é consulta em `financial_transactions.service_order_id`, aqui
 * é a coluna `leads.won_transaction_id`), o gate (lá tem toggle da empresa +
 * `fn:os_finish_revenue`, aqui é `fn:manage_finance`), o que acontece DEPOIS de
 * criar (lá invalida o resumo por OS, aqui grava o vínculo) e, sobretudo, a
 * regra de erro: o fluxo da OS é silencioso por lei, este PRECISA gritar se o
 * vínculo não gravar. Misturar "cale-se sempre" com "grite" no mesmo componente
 * é fábrica de bug. Fora isso, o fluxo da OS está em produção em 4 telas e não
 * podia ser tocado.
 */
export function LeadWonRevenueDialog({ open, onOpenChange, context }: LeadWonRevenueDialogProps) {
  // Monta o conteúdo (e os hooks pesados do Financeiro, incluindo o
  // `useFinancial`, que pagina TODAS as transações da empresa) SÓ enquanto o
  // fluxo está em uso. Este componente fica pendurado na tela do CRM: montar o
  // Financeiro inteiro em todo kanban aberto seria caro à toa.
  //
  // O atraso na desmontagem existe pra o drawer do mobile terminar a animação
  // de saída antes de o conteúdo sumir.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted || !context) return null;

  return <LeadWonRevenueFlow open={open} onOpenChange={onOpenChange} context={context} />;
}

interface FlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LeadRevenueContext;
}

function LeadWonRevenueFlow({ open, onOpenChange, context }: FlowProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.leadRevenue;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { createTransaction } = useFinancial();

  const [step, setStep] = useState<'ask' | 'form'>('ask');

  // Fechou (por qualquer caminho): a próxima abertura recomeça na pergunta.
  useEffect(() => {
    if (!open) setStep('ask');
  }, [open]);

  const suggestedAmount =
    typeof context.suggestedAmount === 'number' && Number.isFinite(context.suggestedAmount)
      ? context.suggestedAmount
      : null;

  /**
   * Valor A LANÇAR, editável já neste primeiro passo.
   *
   * O valor da oportunidade é ESTIMADO e quase nunca é o que foi fechado. Antes
   * ele aparecia aqui como texto fixo e só dava pra corrigir no passo 2, o que
   * levava o usuário a achar que o sistema ia lançar o valor errado. Guardado em
   * CENTAVOS (inteiro) pra não acumular erro de ponto flutuante.
   */
  const [amountCents, setAmountCents] = useState(0);

  // Reancora no valor sugerido a cada abertura e a cada troca de oportunidade —
  // este componente fica pendurado na tela do CRM e NÃO desmonta entre um lead e
  // outro, então sem isso o valor digitado numa venda vazaria pra próxima.
  useEffect(() => {
    setAmountCents(suggestedAmount && suggestedAmount > 0 ? Math.round(suggestedAmount * 100) : 0);
  }, [open, context.leadId, suggestedAmount]);

  const amount = amountCents / 100;

  // Máscara de dinheiro canônica da base: todo dígito digitado entra pela
  // direita como centavos. Colar valor pronto ("4.550" de planilha) passa pelo
  // `readPastedCents`, senão viraria R$ 45,50 (100x menor).
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    setAmountCents(parseInt(digits || '0', 10));
  };
  const handleAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) setAmountCents(cents);
  };
  const amountDisplay = amountCents
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  /**
   * Pré-preenchimento do formulário. Memoizado porque `TransactionFormDialog`
   * usa o conteúdo do prefill pra montar os valores iniciais — objeto novo a
   * cada render seria trabalho repetido sem motivo.
   *
   * `amount` é SUGESTÃO: o valor da oportunidade é ESTIMADO e quase nunca é o
   * que foi fechado, e o campo continua editável. Valor nulo ou zero abre o
   * formulário com o campo vazio pro usuário preencher.
   */
  const prefill = useMemo(
    () => ({
      transaction_type: 'entrada' as const,
      description: buildDescription(t, context),
      amount,
      ...(context.customerId ? { customer_id: context.customerId } : {}),
    }),
    [t, context, amount],
  );

  /**
   * Cria o lançamento e, na sequência, grava o vínculo na oportunidade.
   *
   * NÃO lança erro quando o vínculo falha: jogar exceção aqui manteria o
   * formulário aberto e o usuário salvaria de novo, criando a SEGUNDA receita —
   * exatamente o que a trava existe pra evitar. Em vez disso, avisa alto, com
   * toast destrutivo de vida longa, dizendo o que conferir.
   */
  const handleTransactionSubmit = async (payload: any) => {
    const result = await createTransaction.mutateAsync(payload);

    // Parcelado devolve N ids (em ordem de parcela); à vista devolve um. O
    // vínculo aponta pra primeira parcela, que é a "cabeça" da série.
    const transactionId: string | undefined = Array.isArray(result?.ids) && result.ids.length > 0
      ? result.ids[0]
      : result?.primary?.id;

    const linked = transactionId
      ? await linkLeadWonTransaction(context.leadId, transactionId)
      : false;

    if (!linked) {
      console.error(
        '[receita da oportunidade ganha] receita criada, mas o vínculo com a oportunidade NÃO foi gravado',
        { leadId: context.leadId, transactionId },
      );
      toast({
        variant: 'destructive',
        title: t.linkErrorTitle,
        description: t.linkErrorDesc,
        duration: 15000,
      });
    }

    // O toast de sucesso e as invalidações do Financeiro já saem do
    // `createTransaction`. Falta a lista de oportunidades, que passou a ter um
    // vínculo novo e é query do CRM, não do Financeiro.
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    return result;
  };

  const customerName = context.customerName?.trim() || null;
  const leadTitle = context.leadTitle?.trim() || null;

  const askFooter = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        {t.noLabel}
      </Button>
      <Button
        type="button"
        className="bg-success text-white hover:bg-success/90"
        onClick={() => setStep('form')}
      >
        {t.yesLabel}
      </Button>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={open && step === 'ask'}
        onOpenChange={onOpenChange}
        title={t.title}
        className="sm:max-w-[460px]"
        footer={askFooter}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {/* Ícone branco direto no fundo saturado (régua visual): sem
                círculo dessaturado atrás. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success">
              <Trophy className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-snug">{t.question}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.hint}</p>
            </div>
          </div>

          <dl className="divide-y divide-border rounded-lg border border-border">
            {leadTitle && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-sm text-muted-foreground">{t.opportunityLabel}</dt>
                <dd className="min-w-0 truncate text-sm font-medium">{leadTitle}</dd>
              </div>
            )}
            {customerName && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-sm text-muted-foreground">{t.customerLabel}</dt>
                <dd className="min-w-0 truncate text-sm font-medium">{customerName}</dd>
              </div>
            )}
          </dl>

          {/* Valor EDITÁVEL aqui mesmo. Antes era texto fixo e o usuário só
              descobria que dava pra mudar depois de clicar em "Sim" — como o
              valor da oportunidade é estimado e quase nunca é o fechado, isso
              passava a impressão de que o sistema ia lançar errado. */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-revenue-amount">{t.valueLabel}</Label>
            <Input
              id="lead-revenue-amount"
              value={amountDisplay}
              onChange={handleAmountChange}
              onPaste={handleAmountPaste}
              inputMode="numeric"
              placeholder={t.valuePlaceholder}
              className="text-base font-semibold tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              {suggestedAmount != null && suggestedAmount > 0 ? t.valueHint : t.valueHintEmpty}
            </p>
          </div>
        </div>
      </ResponsiveModal>

      {/* Passo 2 — o formulário de receita do Financeiro, inteiro. `prefill` é
          modo CRIAÇÃO com campos semeados: `transaction` fica vazio de
          propósito (passar um objeto lá colocaria o form em modo EDIÇÃO). */}
      <TransactionFormDialog
        open={open && step === 'form'}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
        onSubmit={handleTransactionSubmit}
        isLoading={createTransaction.isPending}
        defaultType="entrada"
        prefill={prefill}
      />
    </>
  );
}
