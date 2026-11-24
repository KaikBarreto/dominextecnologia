import { describe, expect, it } from 'vitest';
import { getPdvReceiptPreviewFixture, PDV_RECEIPT_PREVIEW_FIXTURE } from './fixture';
import { generatePdvReceiptPdf, planPdvReceiptPdfRows } from './pdf';
import jsPDF from 'jspdf';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { formatReceiptMoney } from './model';
import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

async function readPdfSource(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(blob);
  });
}

function decodedPdfStreams(source: string): string[] {
  // /Length delimita bytes binários: CR pode ser o último byte comprimido, não uma quebra do marcador.
  return [...source.matchAll(/\/Length\s+(\d+)\b[\s\S]*?\bstream\r?\n/g)].flatMap(match => {
    const start = (match.index ?? 0) + match[0].length;
    try { return [inflateSync(Buffer.from(source.slice(start, start + Number(match[1])), 'binary')).toString('latin1')]; }
    catch { return []; }
  });
}

async function readPdfContent(blob: Blob) {
  return decodedPdfStreams(await readPdfSource(blob)).map(stream => [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(item => item[1].replace(/\\([()\\])/g, '$1')).join(' ')).join('\n');
}

async function readPdfStructure(blob: Blob) {
  const source = await readPdfSource(blob);
  const mediaBox = source.match(/\/MediaBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/);
  return {
    pages: [...source.matchAll(/\/Type \/Page\b/g)].length,
    width: Number(mediaBox?.[3]) * 25.4 / 72,
    height: Number(mediaBox?.[4]) * 25.4 / 72,
  };
}

describe('generatePdvReceiptPdf', () => {
  it.each(['58mm', '80mm', 'a4'] as const)('mede cada linha com a fonte real e reserva sua altura em %s', (format) => {
    const snapshot = { ...PDV_RECEIPT_PREVIEW_FIXTURE, note: 'Observação muito longa para testar a quebra real da fonte proporcional. '.repeat(15) };
    const rows = planPdvReceiptPdfRows(snapshot, format);
    const measure = new jsPDF({ unit: 'mm', format: 'a4' });
    const width = format === '58mm' ? 50 : format === '80mm' ? 72 : 178;
    for (const row of rows) {
      measure.setFont('helvetica', row.bold ? 'bold' : 'normal');
      measure.setFontSize(row.size);
      expect(measure.getTextWidth(row.text)).toBeLessThanOrEqual(width + 0.05);
      if (!row.rule) expect(row.height).toBeGreaterThan(row.padding + row.size * (25.4 / 72));
    }
    expect(rows.some(row => row.text === 'MATERIAL / QTD. / VALOR')).toBe(true);
    expect(rows.filter(row => row.inverse).length).toBeGreaterThanOrEqual(3);
    expect(rows.length).toBeGreaterThan(25);
  });
  it.each(['a4','58mm','80mm'] as const)('gera PDF %s sem qualquer escrita externa', (format) => {
    const blob = generatePdvReceiptPdf(PDV_RECEIPT_PREVIEW_FIXTURE, format);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });

  it('inclui a marca Dominex somente fora do white-label', () => {
    const branded = generatePdvReceiptPdf(PDV_RECEIPT_PREVIEW_FIXTURE, '80mm');
    const whiteLabel = generatePdvReceiptPdf({
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      company: { ...PDV_RECEIPT_PREVIEW_FIXTURE.company, whiteLabelEnabled: true },
    }, '80mm');
    expect(branded.size).toBeGreaterThan(whiteLabel.size);
  });

  it.each(['58mm', '80mm'] as const)('preserva a largura %s e cresce com o conteúdo, sem cortar em outra página', async format => {
    const regular = await readPdfStructure(generatePdvReceiptPdf(PDV_RECEIPT_PREVIEW_FIXTURE, format));
    const long = await readPdfStructure(generatePdvReceiptPdf({
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      note: 'Separar os materiais por ambiente e conferir as quantidades com o cliente antes da retirada. '.repeat(50),
    }, format));
    expect(regular.width).toBeCloseTo(format === '58mm' ? 58 : 80, 2);
    expect(long.width).toBeCloseTo(regular.width, 2);
    expect(long.height).toBeGreaterThan(regular.height + 100);
    expect(regular.pages).toBe(1);
    expect(long.pages).toBe(1);
  });

  it('mantém o comprovante A4 comum em uma página e pagina pedidos longos', async () => {
    const regular = await readPdfStructure(generatePdvReceiptPdf(PDV_RECEIPT_PREVIEW_FIXTURE, 'a4'));
    const long = await readPdfStructure(generatePdvReceiptPdf({
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      items: Array.from({ length: 100 }, (_, index) => ({ ...PDV_RECEIPT_PREVIEW_FIXTURE.items[0], description: `Material ${index + 1} — descrição completa para conferência na retirada` })),
      note: 'Conferir todos os volumes e manter a lista de separação com o pedido. '.repeat(30),
    }, 'a4'));
    expect(regular.pages).toBe(1);
    expect(long.pages).toBeGreaterThan(2);
    expect(long.width).toBeCloseTo(210, 1);
    expect(long.height).toBeCloseTo(297, 1);
  });

  it.each(['58mm', '80mm', 'a4'] as const)('acomoda logo horizontal ao lado dos dados completos da loja em %s', async format => {
    const withLogo = {
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      company: { ...PDV_RECEIPT_PREVIEW_FIXTURE.company, logoDataUrl: DOMINEX_LOGO_BLACK_BASE64 },
    };
    const document = await readPdfStructure(generatePdvReceiptPdf(withLogo, format));
    expect(document.pages).toBe(1);
    expect(document.width).toBeCloseTo(format === 'a4' ? 210 : format === '58mm' ? 58 : 80, 1);
    // O cabeçalho se adapta sem alterar os dados originais ou o arquivo de logo.
    expect(withLogo.company).toEqual({ ...PDV_RECEIPT_PREVIEW_FIXTURE.company, logoDataUrl: DOMINEX_LOGO_BLACK_BASE64 });
  });

  it('imprime pagamentos em texto e não inventa retirada na venda direta', async () => {
    const content = await readPdfContent(generatePdvReceiptPdf({
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      fulfillment: null,
      payments: [{ method: 'Pix', amount: 100 }, { method: 'Fiado', amount: 85 }],
    }, '80mm'));
    expect(content).toContain('Formas de Pagamento:');
    expect(content).toContain('Pix:');
    expect(content).toContain('Fiado:');
    expect(content).toContain('Sem vencimento');
    expect(content).not.toContain(',Sem vencimento');
    expect(content).not.toContain('PAGAMENTOS');
    expect(content).not.toContain('Retirada:');
    expect(content).not.toContain('Entrega:');
  });

  it('preserva validade e observações do orçamento e omite pagamentos', async () => {
    const content = await readPdfContent(generatePdvReceiptPdf({
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      documentKind: 'budget',
      note: 'Validade: 30 dias. Separar os materiais no balcão.',
    }, '80mm'));
    expect(content).toContain('Validade: 30 dias.');
    expect(content).not.toContain('Leve ao caixa');
    expect(content).not.toContain('NÃO FISCAL');
    expect(content).not.toContain('Retirada:');
    expect(content).not.toContain('Liberada para retirada');
    expect(content).not.toContain('Formas de Pagamento:');
  });
  it.each(['58mm', '80mm', 'a4'] as const)('separa orçamento, pedido e retirada pelo conteúdo operacional em %s', async format => {
    const budget = getPdvReceiptPreviewFixture('budget');
    budget.coverage = { paidAmount: 100, approvedCreditAmount: 85 };
    budget.fulfillment = { mode: 'retirada', status: 'Liberada para retirada' };
    const budgetText = await readPdfContent(generatePdvReceiptPdf(budget, format));
    expect(budgetText).toContain('ORÇAMENTO');
    expect(budgetText).not.toContain('Leve ao caixa');
    expect(budgetText).not.toContain('NÃO FISCAL');
    expect(budgetText).not.toContain('Formas de pagamento');
    expect(budgetText).not.toContain('Fiado');
    expect(budgetText).not.toContain('Pago:');
    expect(budgetText).not.toContain('Liberada para retirada');

    const pickupText = await readPdfContent(generatePdvReceiptPdf(getPdvReceiptPreviewFixture('pickup'), format));
    expect(pickupText).toContain('PEDIDO Nº 2087');
    expect(pickupText).toContain('Orçamento Nº 1042');
    expect(pickupText).toContain('PAGO');
    expect(pickupText).toContain('Formas de Pagamento:');
    expect(pickupText).toContain('Pix:');
    expect(pickupText).toContain('185,00');
    expect(pickupText).toContain('Subtotal');
    expect(pickupText).toContain('UNITÁRIO');
    expect(pickupText).not.toContain('Retirada:');
    expect(pickupText).not.toContain('NÃO FISCAL');
    expect(pickupText).not.toContain('Aguardando retirada');
    expect(pickupText).not.toContain('Fiado aprovado:');
    expect(pickupText).not.toContain('Assinatura');

    const deliveryText = await readPdfContent(generatePdvReceiptPdf(getPdvReceiptPreviewFixture('delivery'), format));
    expect(deliveryText).toContain('COMPROVANTE DE RETIRADA');
    expect(deliveryText).toContain('RET-2087-01');
    expect(deliveryText).toContain('RETIRADO');
    expect(deliveryText).toContain('RESTANTE');
    expect(deliveryText).toContain('1 un');
    expect(deliveryText).toContain('Recebido por: Cliente exemplo');
    expect(deliveryText).toContain('Assinatura:');
    expect(deliveryText).not.toContain('R$');
    expect(deliveryText).not.toContain('Subtotal');
    expect(deliveryText).not.toContain('Fiado');
  });

  it('não infere crédito aprovado ou pagamento a partir de métodos do snapshot', async () => {
    const snapshot = { ...getPdvReceiptPreviewFixture('pickup'), coverage: null };
    const content = await readPdfContent(generatePdvReceiptPdf(snapshot, '80mm'));
    expect(content).toContain('Cobertura não informada.');
    expect(content).not.toContain('Pago:');
    expect(content).not.toContain('Fiado aprovado:');
  });

  it('retirada sem evento não usa itens ou valores da venda como entrega', async () => {
    const snapshot = { ...PDV_RECEIPT_PREVIEW_FIXTURE, documentKind: 'delivery' as const };
    const content = await readPdfContent(generatePdvReceiptPdf(snapshot, '80mm'));
    expect(content).toContain('Nenhum item retirado informado');
    expect(content).not.toContain('Cimento');
    expect(content).not.toContain('R$');
  });

  it.each(['58mm', '80mm', 'a4'] as const)('gera três vias completas em um PDF de %s', async format => {
    const snapshot = getPdvReceiptPreviewFixture('delivery');
    const single = await readPdfStructure(generatePdvReceiptPdf(snapshot, format));
    const copies = await readPdfStructure(generatePdvReceiptPdf(snapshot, format, { copies: 3 }));
    const content = await readPdfContent(generatePdvReceiptPdf(snapshot, format, { copies: 3 }));
    expect(copies.pages).toBe(single.pages * 3);
    expect(content.match(/COMPROVANTE DE RETIRADA/g)).toHaveLength(3);
  });

  it.each(['budget', 'pickup', 'delivery'] as const)('retira site e marca do PDF %s em white-label', async kind => {
    const snapshot = getPdvReceiptPreviewFixture(kind);
    snapshot.company.whiteLabelEnabled = true;
    const content = await readPdfContent(generatePdvReceiptPdf(snapshot, 'a4'));
    expect(content).not.toContain('www.dominex.app');
  });

  it.each([
    {paidAmount: 0, approvedCreditAmount: 185, stamp: 'FIADO APROVADO'},
    {paidAmount: 100, approvedCreditAmount: 85, stamp: 'APROVADO'},
  ])('mantém preço/total e carimba $stamp sem chamar crédito de pago', async coverage => {
    const snapshot = { ...getPdvReceiptPreviewFixture('pickup'), coverage, payments: [{method:'pix',amount:coverage.paidAmount},{method:'fiado',amount:coverage.approvedCreditAmount}].filter(payment=>payment.amount>0) };
    const text = await readPdfContent(generatePdvReceiptPdf(snapshot, '80mm'));
    expect(text).toContain('Subtotal');
    expect(text).toContain('TOTAL');
    expect(text).toContain('185,00');
    expect(text).toContain('Fiado:');
    expect(text).toContain(coverage.stamp);
    expect(text).not.toMatch(/\bPAGO\b/);
    expect(text).not.toContain('Reimpressão não altera');
    expect(text).not.toContain('Este documento');
  });

  it('venda direta integralmente paga recebe PAGO sem inventar etapa de retirada', async () => {
    const text = await readPdfContent(generatePdvReceiptPdf(getPdvReceiptPreviewFixture('sale'), '80mm'));
    expect(text).toContain('PEDIDO Nº 2087');
    expect(text).not.toContain('NÃO FISCAL');
    expect(text).toContain('PAGO');
    expect(text).not.toContain('Liberado para retirada');
    expect(text).not.toContain('Aguardando retirada');
    expect(text).not.toContain('Fiado');
  });

  it.each(['58mm', '80mm', 'a4'] as const)('posiciona o centro real do carimbo PAGO no centro da página em %s', async format => {
    const source = await readPdfSource(generatePdvReceiptPdf(getPdvReceiptPreviewFixture('pickup'), format));
    const commands = decodedPdfStreams(source);
    const block = commands.flatMap(command => [...command.matchAll(/BT([\s\S]*?)ET/g)].map(match => match[1])).find(text => text.includes('(PAGO) Tj'));
    expect(block).toBeDefined();
    const size = Number(block?.match(/\/F\d+ ([\d.]+) Tf/)?.[1]);
    const leftPoints = Number(block?.match(/([\d.-]+) [\d.-]+ Td\s+\(PAGO\) Tj/)?.[1]);
    const measure = new jsPDF({unit:'mm',format:'a4'});
    measure.setFont('helvetica','bold');measure.setFontSize(size);
    const center = leftPoints * 25.4 / 72 + measure.getTextWidth('PAGO') / 2;
    expect(center).toBeCloseTo((format === 'a4' ? 210 : format === '58mm' ? 58 : 80) / 2, 2);
  });

  it.each(['58mm','80mm','a4'] as const)('preserva o valor alto inteiro no item, subtotal, faixa total e cobertura em %s', async format => {
    const snapshot=getPdvReceiptPreviewFixture('pickup');
    snapshot.items=[{description:'Serpentina de refrigeração comercial',unit:'m',quantity:12.375,unitPrice:99999.99,discount:0,total:1237499.88}];
    snapshot.totals={subtotal:1237499.88,discount:0,total:1237499.88};snapshot.coverage={paidAmount:1237499.88,approvedCreditAmount:0};snapshot.payments=[{method:'pix',amount:1237499.88}];
    const content=await readPdfContent(generatePdvReceiptPdf(snapshot,format));
    const amount=formatReceiptMoney(1237499.88);
    expect(content.split(amount).length-1).toBeGreaterThanOrEqual(4);
    expect(content).toContain(formatReceiptMoney(99999.99));
  });

  it.each(['58mm', '80mm', 'a4'] as const)('alinha título e linhas separadas de pagamento à margem esquerda em %s', async format => {
    const snapshot = getPdvReceiptPreviewFixture('pickup');
    snapshot.payments = [{method:'pix',amount:100},{method:'credito',amount:60},{method:'fiado',amount:25}];
    snapshot.coverage = {paidAmount:160,approvedCreditAmount:25};
    const source = await readPdfSource(generatePdvReceiptPdf(snapshot, format));
    const commands = decodedPdfStreams(source).join('\n');
    const content = await readPdfContent(generatePdvReceiptPdf(snapshot, format));
    expect(content).toContain('Formas de Pagamento:');
    expect(content).toContain('Pix:'); expect(content).toContain('Cartão de crédito:'); expect(content).toContain('Fiado:');
    expect(content).not.toContain('Pix: R$ 100,00;');
    const blocks = [...commands.matchAll(/BT([\s\S]*?)ET/g)].map(match => match[1]);
    const header = blocks.find(block => block.includes('(Formas de Pagamento:) Tj'))!;
    const left = Number(header.match(/([\d.-]+) [\d.-]+ Td/)?.[1]);
    expect(left*25.4/72).toBeCloseTo(format==='a4'?16:4,2);
    const paymentBlocks = blocks.filter(block => /\((Pix|Cartão de crédito|Fiado):/.test(block));
    expect(paymentBlocks).toHaveLength(3);
    for(const block of paymentBlocks){
      const x=Number(block.match(/([\d.-]+) [\d.-]+ Td/)?.[1]);
      expect(x*25.4/72).toBeCloseTo(format==='a4'?16:4,2);
    }
    const y = paymentBlocks.map(block => Number(block.match(/[\d.-]+ ([\d.-]+) Td/)?.[1]));
    expect(new Set(y).size).toBe(3);
  });

});
