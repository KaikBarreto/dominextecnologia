import { ArrowRight, Paperclip } from 'lucide-react';
import type { PdvLedgerEntry } from '@/lib/pdv/cash';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type HistoryTexts = (typeof pdv)['pt-br']['cashPanel']['history'];

interface PdvLedgerRowDetailProps {
  texts: HistoryTexts;
  entry: PdvLedgerEntry;
  valuesVisible: boolean;
  money: (value: number) => string;
  /** Rótulo localizado da forma de pagamento (o painel já tem o mapa). */
  methodLabel: (method: string) => string;
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
}

/**
 * Painel EXPANSÍVEL de uma linha do histórico do caixa, no padrão do caixa da
 * EcoSistema: clicar na linha abre o detalhe logo embaixo, na mesma superfície.
 *
 * O que NÃO veio da EcoSistema de propósito: coluna de peso/quilos e
 * detalhamento de material por peso (lá é ferro-velho). Aqui o detalhe é o que
 * o balcão precisa conferir, por tipo:
 *  • venda → itens (produto, qtd, unitário, total) e pagamentos (forma, valor,
 *    conta, troco);
 *  • receita/despesa → categoria, conta, observação e anexos;
 *  • sangria/suprimento → as DUAS pontas da transferência.
 *
 * Campo vazio simplesmente não aparece: travessão de placeholder é antipadrão
 * de copy da casa.
 *
 * Sem card aninhado e sem borda: um bloco de fundo sutil e linhas por divisor.
 */
export function PdvLedgerRowDetail({
  texts,
  entry,
  valuesVisible,
  money,
  methodLabel,
  number,
}: PdvLedgerRowDetailProps) {
  const show = (value: number) => (valuesVisible ? money(value) : '•••••');
  const detail = entry.detail ?? {};

  const items = detail.items ?? [];
  const payments = detail.payments ?? [];
  const isSale = entry.kind === 'venda';
  const isTransfer = entry.kind === 'sangria' || entry.kind === 'suprimento';
  const attachments = detail.attachmentCount ?? 0;
  /**
   * A ponta de FORA da gaveta: conta de destino da sangria, conta de origem do
   * suprimento. Sem ela, a RPC não gerou lançamento nenhum (o dinheiro não
   * trocou de conta) e não existe transferência pra desenhar.
   */
  const hasExternalEnd =
    entry.kind === 'sangria' ? !!detail.toAccountName : !!detail.fromAccountName;

  const facts: Array<{ label: string; value: string }> = [];
  if (!isSale && !isTransfer) {
    if (detail.category) facts.push({ label: texts.detailCategory, value: detail.category });
    if (detail.accountName) facts.push({ label: texts.detailAccount, value: detail.accountName });
    if (detail.notes) facts.push({ label: texts.detailNotes, value: detail.notes });
  }

  const hasContent =
    (isSale && (items.length > 0 || payments.length > 0)) ||
    facts.length > 0 ||
    attachments > 0 ||
    isTransfer;

  if (!hasContent) {
    return (
      <div className="rounded-lg bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
        {texts.detailEmpty}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/50 px-3 py-3">
      {/* ── Venda: os itens ─────────────────────────────────────────────── */}
      {isSale && items.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {texts.detailItemsTitle}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1 pr-2 text-left font-semibold">{texts.detailItemProduct}</th>
                <th className="py-1 pr-2 text-right font-semibold">{texts.detailItemQty}</th>
                <th className="py-1 pr-2 text-right font-semibold">{texts.detailItemUnit}</th>
                <th className="py-1 text-right font-semibold">{texts.detailItemTotal}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((item, i) => (
                <tr key={`${entry.key}-item-${i}`}>
                  <td className="py-1.5 pr-2">{item.description}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {number(item.quantity, { maximumFractionDigits: 3 })}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{show(item.unitPrice)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {show(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="py-1.5 pr-2 text-right font-bold" colSpan={3}>
                  {texts.detailOrderTotal}
                </td>
                <td className="py-1.5 text-right font-bold tabular-nums">{show(entry.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Venda: como foi pago ────────────────────────────────────────── */}
      {isSale && payments.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {texts.detailPaymentsTitle}
          </p>
          <ul className="space-y-0.5 text-xs">
            {payments.map((p, i) => (
              <li key={`${entry.key}-pay-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {methodLabel(p.method)}
                  {p.accountName ? ` · ${p.accountName}` : ''}
                  {p.changeAmount > 0
                    ? ` · ${texts.detailChange.replace('{value}', show(p.changeAmount))}`
                    : ''}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{show(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Sangria/suprimento: as duas pontas ──────────────────────────── */}
      {isTransfer && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {texts.detailTransferTitle}
          </p>
          {hasExternalEnd ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <TransferEnd
                label={texts.detailFrom}
                value={detail.fromAccountName || texts.detailDrawer}
              />
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <TransferEnd
                label={texts.detailTo}
                value={detail.toAccountName || texts.detailDrawer}
              />
            </div>
          ) : (
            // Sem conta do outro lado, a RPC não gera lançamento nenhum: o
            // dinheiro continua no cofre e só o esperado da gaveta muda. Dizer
            // isso é mais honesto que desenhar duas pontas iguais.
            <p className="text-xs text-muted-foreground">{texts.detailDrawerOnly}</p>
          )}
        </div>
      )}

      {/* ── Receita/despesa: categoria, conta, observação ───────────────── */}
      {facts.length > 0 && (
        <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {fact.label}
              </dt>
              <dd className="break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {attachments > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          {(attachments === 1 ? texts.detailAttachments : texts.detailAttachmentsPlural).replace(
            '{count}',
            String(attachments),
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Uma ponta da transferência. Só é renderizada quando existe conta do outro
 * lado, então `value` nunca chega vazio — não há placeholder de travessão aqui.
 */
function TransferEnd({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{' '}
      </span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
