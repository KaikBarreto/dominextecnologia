import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PdvReceiptPreview } from './PdvReceiptPreview';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';

describe('PdvReceiptPreview', () => {
  it('mostra dados operacionais e deixa explícito que não é fiscal', () => {
    render(<PdvReceiptPreview snapshot={PDV_RECEIPT_PREVIEW_FIXTURE} format="80mm" />);
    const preview = screen.getByLabelText('Prévia do comprovante 80mm');
    expect(preview).toHaveStyle({ fontFamily: 'Arial, Helvetica, ui-sans-serif, system-ui, sans-serif' });
    expect(preview).not.toHaveClass('font-mono');
    expect(screen.getByText('COMPROVANTE NÃO FISCAL')).toBeInTheDocument();
    expect(screen.getByText(/não substitui nota fiscal/i)).toBeInTheDocument();
    expect(screen.getByText(/Reimpressão não altera pagamento/i)).toBeInTheDocument();
    expect(screen.getByText((_content, element) =>
      element?.tagName === 'P'
      && element.textContent?.includes('Fiado: R$ 85,00') === true
      && element.textContent?.includes('vence 07/12/2026') === true,
    )).toBeInTheDocument();
    expect(screen.getByText(/Liberada para retirada parcial/)).toBeInTheDocument();
    expect(screen.getByAltText('Dominex')).toBeInTheDocument();
    expect(screen.getByText('www.dominex.app')).toBeInTheDocument();
  });

  it('empilha logo horizontal e mantém logo quadrado ao lado dos dados', () => {
    const snapshot = { ...PDV_RECEIPT_PREVIEW_FIXTURE, company: { ...PDV_RECEIPT_PREVIEW_FIXTURE.company, logoUrl: 'https://example.invalid/logo.png' } };
    const { rerender } = render(<PdvReceiptPreview snapshot={snapshot} format="80mm" />);
    const logo = screen.getByAltText('Logo da empresa');
    Object.defineProperty(logo, 'naturalWidth', { configurable: true, value: 600 });
    Object.defineProperty(logo, 'naturalHeight', { configurable: true, value: 100 });
    fireEvent.load(logo);
    expect(screen.getByLabelText('Prévia do comprovante 80mm').querySelector('header')).toHaveAttribute('data-logo-layout', 'stacked');

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
});
