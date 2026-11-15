import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvAppliedVoucherControl } from './PdvAppliedVoucherControl';

interface VoucherOption {
  id: string;
  code: string;
  balance: number;
  expiresOn: string | null;
}

const defaultVoucher: VoucherOption = {
  id: 'voucher-1', code: 'DEV-1042', balance: 150, expiresOn: null,
};
const multipleVouchers: VoucherOption[] = [
  { id: 'voucher-1', code: 'DEV-1042', balance: 150, expiresOn: null },
  { id: 'voucher-2', code: 'RETORNO-35', balance: 35, expiresOn: '2026-12-31' },
  { id: 'voucher-3', code: 'FIDELIDADE-240', balance: 240, expiresOn: null },
];

const refetch = vi.fn();
const hookResult: {
  data: { availableCredit: number; vouchers: VoucherOption[] };
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: typeof refetch;
} = {
  data: {
    availableCredit: 0,
    vouchers: [defaultVoucher],
  },
  isLoading: false,
  isError: false,
  isSuccess: true,
  refetch,
};

vi.mock('@/hooks/usePdvCustomerPaymentOptions', () => ({
  usePdvCustomerPaymentOptions: () => hookResult,
}));

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('PdvAppliedVoucherControl', () => {
  beforeEach(() => {
    refetch.mockClear();
    hookResult.isLoading = false;
    hookResult.isError = false;
    hookResult.isSuccess = true;
    hookResult.data.vouchers = [defaultVoucher];
  });

  it('oferece voucher perto do resumo e limita ao total da venda', async () => {
    const onChange = vi.fn();
    render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={null}
        formatCurrency={money}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    const voucherCard = await screen.findByRole('radio', {
      name: /Voucher DEV-1042, saldo R\$\s*150,00/,
    });
    expect(voucherCard).toHaveAttribute('aria-checked', 'true');
    expect(voucherCard).toHaveClass('via-zinc-900', 'text-white');
    expect(voucherCard).toHaveTextContent('Troca e devolução');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar voucher' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      voucherId: 'voucher-1',
      code: 'DEV-1042',
      amount: 100,
      balance: 150,
    }));
  });

  it('não oferece voucher vencido mesmo se vier numa resposta antiga', () => {
    hookResult.data.vouchers = [defaultVoucher, { id: 'expired', code: 'VENCIDO', balance: 500, expiresOn: '2000-01-01' }];
    render(<PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    expect(screen.queryByRole('radio', { name: /VENCIDO/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /DEV-1042/ })).toBeInTheDocument();
  });

  it('mostra voucher como crédito e calcula o restante sem alterar o total comercial', () => {
    render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={{ voucherId: 'voucher-1', code: 'DEV-1042', amount: 35, balance: 150, expiresOn: null }}
        formatCurrency={money}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Crédito da loja').closest('.from-zinc-950')).toHaveClass('text-white');
    expect(screen.getByText('Troca e devolução').closest('.bg-rose-600')).toHaveClass('text-white');
    expect(screen.getByText('DEV-1042')).toBeInTheDocument();
    expect(screen.getByText('Restante a pagar')).toBeInTheDocument();
    expect(screen.getByText('R$ 65,00')).toBeInTheDocument();
  });

  it('exibe três vouchers como cartões selecionáveis dentro de um radiogroup', async () => {
    hookResult.data.vouchers = multipleVouchers;
    render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={null}
        formatCurrency={money}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText('3 créditos disponíveis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));

    expect(await screen.findByRole('radiogroup', { name: 'Vouchers disponíveis' })).toBeInTheDocument();
    const cards = screen.getAllByRole('radio');
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('DEV-1042'),
      expect.stringContaining('RETORNO-35'),
      expect.stringContaining('FIDELIDADE-240'),
    ]));
    expect(cards[0]).toHaveAttribute('aria-checked', 'true');
    expect(cards[1]).toHaveAttribute('aria-checked', 'false');
    expect(cards[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('troca entre vouchers e recalcula o valor pelo saldo e pelo total da venda', async () => {
    hookResult.data.vouchers = multipleVouchers;
    const onChange = vi.fn();
    render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={null}
        formatCurrency={money}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    const smallerVoucher = await screen.findByRole('radio', { name: /Voucher RETORNO-35/ });
    const largerVoucher = screen.getByRole('radio', { name: /Voucher FIDELIDADE-240/ });
    const amountInput = screen.getByLabelText('Valor a aplicar');

    expect(amountInput).toHaveValue('100,00');
    fireEvent.click(smallerVoucher);
    expect(smallerVoucher).toHaveAttribute('aria-checked', 'true');
    expect(amountInput).toHaveValue('35,00');
    expect(screen.getByText(/Máximo nesta venda:/)).toHaveTextContent('35,00');

    fireEvent.click(largerVoucher);
    expect(largerVoucher).toHaveAttribute('aria-checked', 'true');
    expect(smallerVoucher).toHaveAttribute('aria-checked', 'false');
    expect(amountInput).toHaveValue('100,00');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));

    expect(onChange).toHaveBeenCalledWith({
      voucherId: 'voucher-3',
      code: 'FIDELIDADE-240',
      amount: 100,
      balance: 240,
      expiresOn: null,
    });
  });

  it('pesquisa vouchers pelo código sem ocupar a tela com todos os resultados', async () => {
    hookResult.data.vouchers = multipleVouchers;
    render(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    const search = await screen.findByRole('searchbox', { name: 'Buscar voucher pelo código' });

    fireEvent.change(search, { target: { value: 'retorno' } });
    const filteredCards = screen.getAllByRole('radio');
    expect(filteredCards).toHaveLength(1);
    expect(filteredCards[0]).toHaveTextContent('RETORNO-35');

    fireEvent.change(search, { target: { value: 'não-existe' } });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum voucher encontrado');
  });

  it('permite aplicar somente uma parte do voucher', async () => {
    const onChange = vi.fn();
    render(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    const amountInput = await screen.findByLabelText('Valor a aplicar');
    fireEvent.change(amountInput, { target: { value: '40,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ amount: 40 }));
  });

  it('limita a aplicação integral ao total quando o saldo do voucher é maior que a venda', async () => {
    hookResult.data.vouchers = [multipleVouchers[2]];
    const onChange = vi.fn();
    render(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    expect(await screen.findByLabelText('Valor a aplicar')).toHaveValue('100,00');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      voucherId: 'voucher-3', amount: 100, balance: 240,
    }));
  });

  it('bloqueia aplicação digitada acima do total da venda', async () => {
    hookResult.data.vouchers = [multipleVouchers[2]];
    const onChange = vi.fn();
    render(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    fireEvent.change(await screen.findByLabelText('Valor a aplicar'), { target: { value: '120,00' } });

    expect(screen.getByText('O valor informado ultrapassa o saldo disponível.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar voucher' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('remove o voucher aplicado e devolve o controle ao carrinho', () => {
    const onChange = vi.fn();
    render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={{ voucherId: 'voucher-1', code: 'DEV-1042', amount: 35, balance: 150, expiresOn: null }}
        formatCurrency={money}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover voucher' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('oferece semântica e foco de teclado em todos os cartões de voucher', async () => {
    hookResult.data.vouchers = multipleVouchers;
    render(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    const cards = await screen.findAllByRole('radio');
    for (const card of cards) {
      expect(card.tagName).toBe('BUTTON');
      expect(card).not.toHaveAttribute('tabindex', '-1');
    }
    cards[1].focus();
    expect(cards[1]).toHaveFocus();
  });

  it('não mostra o recurso sem cliente', () => {
    const { container } = render(
      <PdvAppliedVoucherControl
        enabled
        customerId={null}
        total={100}
        value={null}
        formatCurrency={money}
        onChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('não adiciona complexidade quando o cliente não possui voucher', () => {
    hookResult.data.vouchers = [];
    const { container } = render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={null}
        formatCurrency={money}
        onChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra carregamento e permite tentar novamente após erro', () => {
    hookResult.isLoading = true;
    hookResult.isSuccess = false;
    const { rerender } = render(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={() => {}} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Consultando vouchers');

    hookResult.isLoading = false;
    hookResult.isError = true;
    rerender(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={null} formatCurrency={money} onChange={() => {}} />,
    );
    expect(screen.getByText('Vouchers indisponíveis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('detecta em uma atualização que o voucher venceu ou foi consumido', () => {
    const appliedVoucher = { voucherId: 'voucher-1', code: 'DEV-1042', amount: 35, balance: 150, expiresOn: null };
    const { rerender } = render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={appliedVoucher}
        formatCurrency={money}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('O saldo deste voucher mudou')).not.toBeInTheDocument();

    hookResult.data.vouchers = [];
    rerender(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={appliedVoucher} formatCurrency={money} onChange={() => {}} />,
    );

    expect(screen.getByText('O saldo deste voucher mudou')).toBeInTheDocument();
    expect(screen.getByText(/Remova ou ajuste/)).toBeInTheDocument();
  });

  it('detecta em uma atualização quando outra operação reduz o saldo', () => {
    const appliedVoucher = { voucherId: 'voucher-1', code: 'DEV-1042', amount: 35, balance: 150, expiresOn: null };
    const { rerender } = render(
      <PdvAppliedVoucherControl
        enabled
        customerId="customer-1"
        total={100}
        value={appliedVoucher}
        formatCurrency={money}
        onChange={() => {}}
      />,
    );
    hookResult.data.vouchers = [{ id: 'voucher-1', code: 'DEV-1042', balance: 20, expiresOn: null }];
    rerender(
      <PdvAppliedVoucherControl enabled customerId="customer-1" total={100} value={appliedVoucher} formatCurrency={money} onChange={() => {}} />,
    );

    expect(screen.getByText('O saldo deste voucher mudou')).toBeInTheDocument();
  });
});
