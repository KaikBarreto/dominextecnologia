/**
 * Observação automática de valor personalizado (painel master Auctus).
 *
 * Padrão: "Este cliente pagará R$ X até DD/MM/AAAA por conta de uma promoção dada por: NOME"
 * — sem o " até DD/MM/AAAA" quando o valor é permanente (sem prazo).
 *
 * Usada na criação de empresa (enviada pronta pra edge create-company, que anexa
 * em companies.notes) e na edição (append client-side quando o valor personalizado
 * é ativado ou alterado). A edge self-register monta o mesmo texto server-side.
 */

interface CustomPriceNoteOpts {
  /** Valor personalizado em R$. */
  price: number;
  /** true = valor vale pra sempre (sem "até ..."). */
  permanent: boolean;
  /** Quantos meses a promoção dura (só quando !permanent). */
  months?: number | null;
  /** Quem concedeu: closer selecionado > admin logado > 'Admin'. */
  grantedBy: string;
}

export function buildCustomPriceNote({ price, permanent, months, grantedBy }: CustomPriceNoteOpts): string {
  const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  let untilText = '';
  if (!permanent && months && months > 0) {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);
    // Exibição sempre em horário do Brasil (regra do projeto: America/Sao_Paulo).
    const dateStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(endDate);
    untilText = ` até ${dateStr}`;
  }

  return `Este cliente pagará ${formattedPrice}${untilText} por conta de uma promoção dada por: ${grantedBy}`;
}

/** Anexa a nota ao texto de observações existente (parágrafo novo), sem duplicar separadores. */
export function appendNote(existing: string | null | undefined, note: string): string {
  const base = (existing || '').trim();
  return base ? `${base}\n\n${note}` : note;
}
