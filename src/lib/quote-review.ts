/** Conferência orientativa: não altera preços, não bloqueia exceções e não presume custo zero como lucro. */
export type QuoteReviewSection = 'services' | 'materials' | 'commercial' | 'review';

export interface QuoteReviewItem {
  item_type: 'servico' | 'material';
  description: string;
  quantity: number;
  unit_price: number;
  unit_total_cost?: number | null;
}

export type QuoteReviewIssueKind = 'invalid_quantity' | 'missing_price' | 'below_item_cost' | 'below_total_cost' | 'expired_validity' | 'missing_first_due_date';

export interface QuoteReviewIssue {
  key: string;
  kind: QuoteReviewIssueKind;
  section: QuoteReviewSection;
  title: string;
  detail: string;
  action: string;
  /** Indices da lista completa, preservados para permitir foco no item. */
  itemIndexes?: number[];
}

export interface QuoteReviewInput {
  items: QuoteReviewItem[];
  /** Total comercial final, já com o desconto do orçamento aplicado. */
  finalTotal: number;
  /** Custo real do deslocamento; nunca o preço cobrado por ele. */
  displacementCost?: number;
  validUntil?: string | null;
  receivableInstallments?: number;
  receivableFirstDueDate?: string | null;
  now?: Date;
}

const positiveFinite = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
const cents = (value: number) => Math.round(value * 100);

function localDay(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function itemList(items: QuoteReviewItem[], indexes: number[]) {
  const names = indexes.slice(0, 3).map(index => items[index].description.trim() || `Item ${index + 1}`);
  return `${names.join(', ')}${indexes.length > 3 ? ` e mais ${indexes.length - 3}` : ''}.`;
}

export function buildQuoteReviewIssues({
  items, finalTotal, displacementCost = 0, validUntil,
  receivableInstallments = 1, receivableFirstDueDate, now = new Date(),
}: QuoteReviewInput): QuoteReviewIssue[] {
  const issues: QuoteReviewIssue[] = [];
  for (const itemType of ['servico', 'material'] as const) {
    const section = itemType === 'servico' ? 'services' : 'materials';
    const indexes = items.flatMap((item, index) => item.item_type === itemType ? [index] : []);
    const invalidQuantities = indexes.filter(index => !Number.isFinite(items[index].quantity) || items[index].quantity <= 0);
    const missingPrices = indexes.filter(index => Number.isFinite(items[index].quantity) && items[index].quantity > 0 && (!Number.isFinite(items[index].unit_price) || cents(items[index].unit_price) <= 0));
    const belowCosts = indexes.filter(index => {
      const item = items[index];
      return Number.isFinite(item.quantity) && item.quantity > 0 && positiveFinite(item.unit_price) > 0
        && cents(item.unit_price) < cents(positiveFinite(item.unit_total_cost));
    });
    const groups: Array<{ kind: QuoteReviewIssueKind; indexes: number[]; title: string; detail: string }> = [
      { kind: 'invalid_quantity', indexes: invalidQuantities, title: 'Confira as quantidades', detail: 'Há itens com quantidade zerada ou inválida' },
      { kind: 'missing_price', indexes: missingPrices, title: 'Há itens sem preço', detail: 'Confirme se estes itens serão oferecidos sem cobrança' },
      { kind: 'below_item_cost', indexes: belowCosts, title: 'Preço abaixo do custo informado', detail: 'Confira o preço destes itens' },
    ];
    for (const group of groups) {
      if (group.indexes.length === 0) continue;
      issues.push({ key: `${group.kind}:${itemType}`, kind: group.kind, section, title: group.title,
        detail: `${group.detail}: ${itemList(items, group.indexes)}`, action: itemType === 'servico' ? 'Rever serviços' : 'Rever materiais', itemIndexes: group.indexes });
    }
  }

  const knownCost = items.reduce((sum, item) => sum + positiveFinite(item.unit_total_cost) * positiveFinite(item.quantity), positiveFinite(displacementCost));
  // Não repetir o aviso global quando os próprios itens já explicam a diferença;
  // ele é útil para o desconto/deslocamento que reduz o resultado do conjunto.
  const itemsBelowCost = issues.some(issue => issue.kind === 'below_item_cost' || issue.kind === 'missing_price');
  if (knownCost > 0 && Number.isFinite(finalTotal) && cents(finalTotal) < cents(knownCost) && !itemsBelowCost) {
    issues.push({ key: 'below_total_cost', kind: 'below_total_cost', section: 'commercial', title: 'Total abaixo dos custos informados',
      detail: 'O valor final, já com o desconto, não cobre os custos informados dos itens e do deslocamento.', action: 'Rever preços e condições' });
  }
  // Data pura é comparada pelo dia civil: uma validade para hoje segue válida até o fim do dia.
  if (validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < localDay(now)) {
    issues.push({ key: 'expired_validity', kind: 'expired_validity', section: 'review', title: 'A validade já passou',
      detail: 'Atualize a data para o cliente receber uma proposta dentro da validade.', action: 'Rever validade' });
  }
  if (receivableInstallments > 1 && !receivableFirstDueDate) {
    issues.push({ key: 'missing_first_due_date', kind: 'missing_first_due_date', section: 'commercial', title: 'Primeiro vencimento não definido',
      detail: `Você escolheu ${receivableInstallments} parcelas. Defina o primeiro vencimento se a data já estiver combinada com o cliente.`, action: 'Rever pagamento' });
  }
  return issues;
}
