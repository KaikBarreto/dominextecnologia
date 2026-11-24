import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import type { PdvReceiptDocumentKind, PdvReceiptSnapshot } from './model';

export const PDV_RECEIPT_PREVIEW_FIXTURE: PdvReceiptSnapshot = {
  company: { name: 'Loja Exemplo', document: 'CNPJ 00.000.000/0001-00', address: 'Rua das Flores, 120 · Centro', phone: '(00) 0000-0000', timeZone: 'America/Sao_Paulo', whiteLabelEnabled: false },
  order: { number: 1042, issuedAt: '2026-11-07T14:30:00-03:00', operatorName: 'Maria', terminalName: 'Caixa 2', customerName: 'Cliente exemplo' },
  items: [
    { description: 'Cimento CP II 50 kg', unit: 'un', quantity: 2, unitPrice: 42.5, discount: 0, total: 85 },
    { description: 'Areia média — saco 20 kg', unit: 'un', quantity: 3, unitPrice: 35, discount: 5, total: 100 },
  ],
  totals: { subtotal: 190, discount: 5, total: 185 },
  payments: [{ method: 'Pix', amount: 100 }, { method: 'Fiado', amount: 85, dueDate: '2026-12-07' }],
  fulfillment: { mode: 'retirada', status: 'Liberada para retirada parcial' },
  note: 'Separar no depósito coberto.',
};

/** Mesma venda fictícia em cada etapa, para comparação de conteúdo e de layout. */
export function getPdvReceiptPreviewFixture(kind: PdvReceiptDocumentKind): PdvReceiptSnapshot {
  const fixture = structuredClone(PDV_RECEIPT_PREVIEW_FIXTURE);
  fixture.documentKind = kind;
  // Logo Dominex usado como demonstração visual; empresa, cliente e operações são fictícios.
  fixture.company.logoDataUrl = DOMINEX_LOGO_BLACK_BASE64;
  if (kind !== 'budget') { fixture.order.number = 2087; fixture.order.budgetNumber = 1042; }
  if (kind === 'budget') {
    fixture.note = 'Validade: 7 dias.';
    fixture.fulfillment = null;
  }
  if (kind === 'sale') {
    fixture.coverage = { paidAmount: 185, approvedCreditAmount: 0, status: 'paid' };
    fixture.payments = [{ method: 'Pix', amount: 185 }];
    fixture.fulfillment = null;
  }
  if (kind === 'pickup') {
    fixture.payments = [{ method: 'Pix', amount: 185 }];
    fixture.coverage = { paidAmount: 185, approvedCreditAmount: 0, status: 'paid' };
    fixture.fulfillment = { mode: 'retirada', status: 'Aguardando retirada' };
  }
  if (kind === 'delivery') {
    fixture.withdrawal = {
      id: 'RET-2087-01',
      withdrawnAt: '2026-11-07T15:10:00-03:00',
      stockName: 'Depósito principal',
      operatorName: 'Maria',
      receivedBy: 'Cliente exemplo',
      items: [
        { description: 'Cimento CP II 50 kg', unit: 'un', quantity: 1, remainingQuantity: 1 },
        { description: 'Areia média — saco 20 kg', unit: 'un', quantity: 3, remainingQuantity: 0 },
      ],
    };
    fixture.note = null;
    fixture.fulfillment = null;
  }
  return fixture;
}

/** Entradas fictícias: desconto próprio10 por item + geral10 rateado5/5. */
export function getPdvReceiptDiscountFixture(kind: 'sale' | 'pickup' | 'budget' = 'sale'): PdvReceiptSnapshot {
  const fixture = getPdvReceiptPreviewFixture(kind);
  fixture.company.name = 'Refrigeração Exemplo';
  fixture.order.issuedAt = '2026-11-15T21:20:00-03:00';
  fixture.items = [
    { description: 'Tubo de cobre flexível 3/8 para refrigeração', unit: 'm', quantity: 2, unitPrice: 60, discount: 15, total: 105 },
    { description: 'Isolamento térmico para linha de sucção', unit: 'un', quantity: 3, unitPrice: 40, discount: 15, total: 105 },
  ];
  fixture.totals = { subtotal: 240, discount: 30, total: 210 };
  fixture.payments = kind === 'budget' ? [] : [{ method: 'pix', amount: 100 }, { method: 'credito', amount: 60 }, { method: 'fiado', amount: 50, dueDate: '2026-12-15' }];
  fixture.coverage = kind === 'budget' ? null : { paidAmount: 160, approvedCreditAmount: 50, status: 'mixed' };
  fixture.note = kind === 'budget' ? 'Validade: 7 dias.' : null;
  return fixture;
}
