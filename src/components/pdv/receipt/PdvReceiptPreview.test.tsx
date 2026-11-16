import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PdvReceiptPreview } from './PdvReceiptPreview';
import { getPdvReceiptPreviewFixture, PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';

describe('PdvReceiptPreview', () => {
  it.each(['58mm', '80mm', 'a4'] as const)('mostra o total dos vouchers em uma linha em %s', format => {
    const snapshot = {...PDV_RECEIPT_PREVIEW_FIXTURE, payments: [
      {method:'voucher',amount:5}, {method:'dinheiro',amount:170}, {method:'voucher',amount:10},
    ]};
    render(<PdvReceiptPreview snapshot={snapshot} format={format} />);
    const payments = screen.getByRole('region', {name:'Formas de pagamento'});
    expect(payments).toHaveTextContent('Vouchers: R$ 15,00');
    expect(payments).toHaveTextContent('Dinheiro: R$ 170,00');
    expect(screen.getAllByText(/Vouchers:/)).toHaveLength(1);
    expect(screen.queryByText(/Voucher:/)).not.toBeInTheDocument();
  });

  it('mostra dados operacionais sem subtítulo ou status de retirada', () => {
    render(<PdvReceiptPreview snapshot={PDV_RECEIPT_PREVIEW_FIXTURE} format="80mm" />);
    const preview = screen.getByLabelText('Prévia do comprovante 80mm');
    expect(preview).toHaveStyle({ fontFamily: 'Arial, Helvetica, ui-sans-serif, system-ui, sans-serif' });
    expect(preview).not.toHaveClass('font-mono');
    expect(screen.getByText('PEDIDO Nº 1042')).toBeInTheDocument();
    expect(screen.queryByText('NÃO FISCAL')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reimpressão não altera pagamento/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', {name:'Formas de pagamento'})).toHaveTextContent('Fiado: R$ 85,00Vence 07/12/2026');
    expect(screen.queryByText(/Liberada para retirada parcial/)).not.toBeInTheDocument();
    expect(screen.getByAltText('Dominex')).toBeInTheDocument();
    expect(screen.getByText('www.dominex.app')).toBeInTheDocument();
  });

  it('mantém logos e dados alinhados à esquerda, como no PDF', () => {
    const snapshot = { ...PDV_RECEIPT_PREVIEW_FIXTURE, company: { ...PDV_RECEIPT_PREVIEW_FIXTURE.company, logoUrl: 'https://example.invalid/logo.png' } };
    const { rerender } = render(<PdvReceiptPreview snapshot={snapshot} format="80mm" />);
    const logo = screen.getByAltText('Logo da empresa');
    Object.defineProperty(logo, 'naturalWidth', { configurable: true, value: 600 });
    Object.defineProperty(logo, 'naturalHeight', { configurable: true, value: 100 });
    fireEvent.load(logo);
    expect(screen.getByLabelText('Prévia do comprovante 80mm').querySelector('header')).toHaveAttribute('data-logo-layout', 'inline');

    rerender(<PdvReceiptPreview snapshot={{ ...snapshot, company: { ...snapshot.company, logoUrl: 'https://example.invalid/logo-square.png' } }} format="80mm" />);
    const squareLogo = screen.getByAltText('Logo da empresa');
    Object.defineProperty(squareLogo, 'naturalWidth', { configurable: true, value: 200 });
    Object.defineProperty(squareLogo, 'naturalHeight', { configurable: true, value: 200 });
    fireEvent.load(squareLogo);
    expect(screen.getByLabelText('Prévia do comprovante 80mm').querySelector('header')).toHaveAttribute('data-logo-layout', 'inline');
  });

  it('remove toda a marca Dominex no white-label', () => {
    render(<PdvReceiptPreview snapshot={{ ...PDV_RECEIPT_PREVIEW_FIXTURE, company: { ...PDV_RECEIPT_PREVIEW_FIXTURE.company, whiteLabelEnabled: true } }} format="a4" />);
    expect(screen.queryByAltText('Dominex')).not.toBeInTheDocument();
    expect(screen.queryByText('www.dominex.app')).not.toBeInTheDocument();
  });
  it('orçamento omite pagamentos e autorização mesmo com esses dados preenchidos', () => {
    const snapshot = { ...PDV_RECEIPT_PREVIEW_FIXTURE, documentKind: 'budget' as const };
    render(<PdvReceiptPreview snapshot={snapshot} format="58mm" />);
    expect(screen.getByText('ORÇAMENTO Nº 1042')).toBeInTheDocument();
    expect(screen.queryByText(/Leve ao caixa/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Formas de pagamento/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Liberada para retirada parcial/)).not.toBeInTheDocument();
  });

  it('pedido distingue pagamento confirmado de crédito aprovado', () => {
    const snapshot = {...getPdvReceiptPreviewFixture('pickup'), coverage:{paidAmount:100,approvedCreditAmount:85},payments:[{method:'pix',amount:100},{method:'fiado',amount:85}]};
    render(<PdvReceiptPreview snapshot={snapshot} format="80mm" />);
    expect(screen.getByText('PEDIDO Nº 2087')).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Formas de pagamento'})).toHaveTextContent('Pix: R$ 100,00Fiado: R$ 85,00');
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('APROVADO')).toBeInTheDocument();
    expect(screen.queryByText('PAGO')).not.toBeInTheDocument();
  });

  it('comprovante mostra quantidades do evento e saldo restante sem assinatura', () => {
    const snapshot = getPdvReceiptPreviewFixture('delivery');
    render(<PdvReceiptPreview snapshot={snapshot} format="a4" />);
    expect(screen.getByRole('heading', {name:/COMPROVANTE DE RETIRADA/})).toBeInTheDocument();
    expect(screen.getAllByText('RETIRADO')).toHaveLength(2);
    expect(screen.getAllByText('RESTANTE')).toHaveLength(2);
    expect(screen.queryByText(/Registro de retirada:/)).not.toBeInTheDocument();
    expect(screen.queryByText('RET-2087-01')).not.toBeInTheDocument();
    expect(screen.queryByText(/Local:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Assinatura/)).not.toBeInTheDocument();
    expect(screen.getByText('Recebido por: Cliente exemplo')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('TOTAL')).not.toBeInTheDocument();
  });

  it('agrupa título centralizado, cliente e operador/data como no comprovante EcoSistema', () => {
    const {container}=render(<PdvReceiptPreview snapshot={getPdvReceiptPreviewFixture('delivery')} format="80mm" />);
    const metadata=container.querySelector('[data-receipt-metadata]')!;
    expect(metadata).toHaveClass('text-center');
    expect(metadata).toContainElement(screen.getByRole('heading',{name:/COMPROVANTE DE RETIRADA/}));
    expect(metadata).toHaveTextContent('Cliente: Cliente exemplo');
    expect(metadata).toHaveTextContent('Operador: Maria');
    expect(metadata).not.toHaveTextContent('Local:');
  });

  it.each(['58mm', '80mm', 'a4'] as const)('retirada não reserva área de assinatura nem exibe campos vazios em %s', format => {
    const snapshot = getPdvReceiptPreviewFixture('delivery');
    snapshot.withdrawal!.receivedBy = null;
    render(<PdvReceiptPreview snapshot={snapshot} format={format} />);
    expect(screen.queryByText(/Assinatura/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recebido por:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Espaço para assinatura')).not.toBeInTheDocument();
  });

  it('orçamento e pedido preservam as mesmas colunas e valores, com PAGO no final do pedido quitado', () => {
    const {rerender} = render(<PdvReceiptPreview snapshot={getPdvReceiptPreviewFixture('budget')} format="80mm" />);
    expect(screen.getByText('ORÇAMENTO Nº 1042')).toBeInTheDocument();
    expect(screen.getAllByText('UNITÁRIO')).toHaveLength(2);
    expect(screen.getAllByText(/185,00/)).toHaveLength(1);
    expect(screen.queryByText('PAGO')).not.toBeInTheDocument();
    rerender(<PdvReceiptPreview snapshot={getPdvReceiptPreviewFixture('pickup')} format="80mm" />);
    expect(screen.getByText('PEDIDO Nº 2087')).toBeInTheDocument();
    expect(screen.getAllByText('UNITÁRIO')).toHaveLength(2);
    expect(screen.getByText('PAGO')).toBeInTheDocument();
    expect(screen.queryByText(/Reimpressão/)).not.toBeInTheDocument();
  });

  it.each(['58mm','80mm','a4'] as const)('usa quadro com bordas e material em linha inteira com valores abaixo em %s', format => {
    const {container}=render(<PdvReceiptPreview snapshot={getPdvReceiptPreviewFixture('pickup')} format={format} />);
    const metadata=container.querySelector('[data-receipt-metadata]');
    expect(metadata).toHaveStyle({border:'1px solid #828282'});
    expect(metadata).toHaveTextContent('Cliente: Cliente exemplo');
    expect(metadata).toHaveTextContent('Operador: Maria');
    expect(metadata).toHaveTextContent('07/11/2026');
    for (const item of container.querySelectorAll('[data-receipt-item]')) {
      expect(item.querySelector('[data-receipt-description]')).toHaveAttribute('colspan','3');
      const rows=item.querySelectorAll('tr');
      expect(rows[0].querySelectorAll('td')).toHaveLength(1);
      expect(rows[1].querySelectorAll('td')).toHaveLength(3);
      expect(rows[1]).toHaveTextContent('QTD.');
      expect(rows[1]).toHaveTextContent('UNITÁRIO');
      expect(rows[1]).toHaveTextContent('TOTAL');
    }
    expect(screen.getByText('PAGO')).toHaveClass('mx-auto');
    expect(screen.queryByText(/Retirada:/)).not.toBeInTheDocument();
  });

  it('retirada usa descrição inteira e duas colunas sem preços abaixo', () => {
    const {container}=render(<PdvReceiptPreview snapshot={getPdvReceiptPreviewFixture('delivery')} format="58mm" />);
    for(const description of container.querySelectorAll('[data-receipt-description]'))expect(description).toHaveAttribute('colspan','2');
    expect(screen.queryByText('UNITÁRIO')).not.toBeInTheDocument();
  });

  it('reflui valor alto em linhas legíveis, mantém pagamentos à esquerda e não usa texto cinza', () => {
    const snapshot=getPdvReceiptPreviewFixture('pickup');
    snapshot.items=[{description:'Serpentina de refrigeração comercial com quantidade fracionada',unit:'m',quantity:12.375,unitPrice:99999.99,discount:0,total:1237499.88}];
    snapshot.totals={subtotal:1237499.88,discount:0,total:1237499.88};snapshot.payments=[{method:'credito',amount:1237499.88}];snapshot.coverage={paidAmount:1237499.88,approvedCreditAmount:0};
    const {container}=render(<PdvReceiptPreview snapshot={snapshot} format="58mm"/>);
    const item=screen.getByRole('table',{name:'Material 1'});
    expect(item).toHaveAttribute('data-receipt-stacked','true');
    expect(item).toHaveTextContent('12,375 m');expect(item).toHaveTextContent('R$ 1.237.499,88');
    expect(item.querySelector('[data-receipt-description]')).toHaveAttribute('colspan','2');
    expect(screen.getByRole('region',{name:'Formas de pagamento'})).toHaveClass('text-left');
    expect(container.querySelector('[style*="font-size: 8.5"]')).toBeNull();
    expect(container.querySelector('[class*="text-black/"]')).toBeNull();
    for(const value of item.querySelectorAll('span[style*="white-space"]'))expect(value).toHaveStyle({whiteSpace:'nowrap'});
  });

});
