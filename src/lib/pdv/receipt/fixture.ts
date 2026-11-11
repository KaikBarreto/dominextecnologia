import type { PdvReceiptSnapshot } from './model';

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
