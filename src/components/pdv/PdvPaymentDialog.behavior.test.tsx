import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pdv } from '@/lib/i18n/messages/app/pdv';
import { PdvPaymentDialog, type PdvPaymentDialogProps } from './PdvPaymentDialog';

const testState = vi.hoisted(() => ({
  compact: false,
  storedValue: {
    data: { availableCredit: 80, vouchers: [] as Array<{ id: string; code: string; balance: number; expiresOn: string | null }> },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsCompact: () => testState.compact,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'operator-1' }, profile: { company_id: 'company-1' } }),
}));

vi.mock('@/components/ui/SignedImg', () => ({
  SignedImg: ({ src, alt }: { src?: string | null; alt: string }) => src ? <img src={src} alt={alt} /> : <span />,
}));

vi.mock('@/hooks/usePdvCustomerPaymentOptions', () => ({
  usePdvCustomerPaymentOptions: () => testState.storedValue,
}));

vi.mock('@/lib/format/hooks', () => ({
  useLocaleFormatters: () => ({
    money: (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  }),
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ open, title, description, children, footer, headerActions, fullScreen }: {
    open: boolean;
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    headerActions?: ReactNode;
    fullScreen?: boolean;
  }) => open ? (
    <section role="dialog" aria-label={title} aria-describedby={description ? 'payment-description' : undefined}>
      {fullScreen && headerActions}
      {description ? <p id="payment-description">{description}</p> : null}
      <div data-testid="payment-body">{children}</div>
      <footer>{footer}</footer>
    </section>
  ) : null,
}));

vi.mock('@/components/pdv/caixa/PdvMoneyInput', () => ({
  PdvMoneyInput: ({ id, value, onChange, onEnter, autoFocus }: {
    id?: string;
    value: number;
    onChange: (value: number) => void;
    onEnter?: () => void;
    autoFocus?: boolean;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(Number(event.target.value))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEnter?.();
      }}
    />
  ),
}));

vi.mock('@/components/ui/DatePicker', () => ({
  DatePicker: ({ id, value, onValueChange }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
  }) => <input id={id} type="date" value={value} onChange={(event) => onValueChange(event.target.value)} />,
}));

const texts = pdv['pt-br'].cashier.payment;
const account = { id: 'account-1', name: 'Conta principal', type: 'bank' };

function defaultProps(overrides: Partial<PdvPaymentDialogProps> = {}): PdvPaymentDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    texts,
    total: 100,
    itemCount: 2,
    customerName: 'Maria da Silva',
    customerId: 'customer-1',
    advancedPaymentsEnabled: true,
    appliedVoucher: null,
    customerCredit: { creditLimit: 500, debt: 50 },
    accounts: [account],
    canUseBankAccounts: true,
    hasOpenCashSession: true,
    hasCofreAccount: true,
    onGoToCashPanel: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderDialog(overrides: Partial<PdvPaymentDialogProps> = {}) {
  const props = defaultProps(overrides);
  render(<PdvPaymentDialog {...props} />);
  return props;
}

function confirmButton() {
  return screen.getByRole('button', { name: /Finalizar Venda|Finalizando/ });
}

describe('PdvPaymentDialog — fechamento real da venda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    localStorage.clear();
    testState.compact = false;
    testState.storedValue.data = { availableCredit: 80, vouchers: [] };
    testState.storedValue.isLoading = false;
    testState.storedValue.isError = false;
  });

  it('envia voucher parcial e somente o restante em dinheiro', async () => {
    testState.storedValue.data.vouchers = [
      { id: 'voucher-1', code: 'DEV-1042', balance: 100, expiresOn: null },
    ];
    const props = renderDialog({
      total: 100,
      appliedVoucher: { voucherId: 'voucher-1', code: 'DEV-1042', amount: 35 },
    });

    fireEvent.click(screen.getByRole('button', { name: /Créditos do cliente/ }));

    expect(screen.getByText('DEV-1042')).toBeInTheDocument();
    expect(screen.getByText('Valor deste recebimento').parentElement).toHaveTextContent('R$ 65,00');

    fireEvent.click(confirmButton());

    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledWith([
      { method: 'voucher', amount: 35, reference_id: 'voucher-1' },
      { method: 'dinheiro', amount: 65 },
    ]));
  });

  it('conclui com voucher integral sem exigir outra forma de pagamento', async () => {
    testState.storedValue.data.vouchers = [
      { id: 'voucher-1', code: 'DEV-1042', balance: 100, expiresOn: null },
    ];
    const props = renderDialog({
      total: 100,
      appliedVoucher: { voucherId: 'voucher-1', code: 'DEV-1042', amount: 100 },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Venda coberta pelo voucher');
    expect(screen.queryByText('Como receber o restante')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dinheiro' })).not.toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();

    fireEvent.click(confirmButton());

    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledWith([
      { method: 'voucher', amount: 100, reference_id: 'voucher-1' },
    ]));
  });

  it('distribui pagamento dividido e mantém a soma exata no payload', async () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('radio', { name: 'Combinar formas' }));
    fireEvent.click(screen.getByRole('button', { name: 'PIX' }));
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '40' } });

    expect(screen.getByText('Distribuído').parentElement).toHaveTextContent('R$ 100,00');
    expect(screen.getByText('Falta receber').parentElement).toHaveTextContent('R$ 0,00');

    fireEvent.click(confirmButton());

    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledWith([
      { method: 'dinheiro', amount: 60 },
      { method: 'pix', amount: 40, account_id: 'account-1' },
    ]));
  });

  it('oferece e envia saldo do cliente apenas quando existe crédito disponível', async () => {
    const props = renderDialog({ total: 60 });
    fireEvent.click(screen.getByRole('button', { name: /Créditos do cliente/ }));

    const balanceButton = screen.getByRole('button', { name: 'Saldo do cliente' });
    fireEvent.click(balanceButton);

    expect(balanceButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Disponível:')).toHaveTextContent('R$ 80,00');
    fireEvent.click(confirmButton());

    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledWith([
      { method: 'saldo_cliente', amount: 60 },
    ]));
  });

  it('não acrescenta a opção de saldo quando o cliente não possui crédito', () => {
    testState.storedValue.data.availableCredit = 0;
    renderDialog();

    expect(screen.queryByRole('button', { name: 'Saldo do cliente' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dinheiro' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('anuncia consulta de saldo e oferece nova tentativa quando ela falha', () => {
    testState.storedValue.isLoading = true;
    const props = defaultProps();
    const { rerender } = render(<PdvPaymentDialog {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('Consultando saldo e vouchers do cliente');

    testState.storedValue.isLoading = false;
    testState.storedValue.isError = true;
    rerender(<PdvPaymentDialog {...props} />);

    expect(screen.getByText('Saldo e vouchers indisponíveis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(testState.storedValue.refetch).toHaveBeenCalledTimes(1);
  });

  it('aceita fiado com cliente e envia o vencimento preenchido', async () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Fiado/Saldo' }));
    expect(screen.getByText(/Maria da Silva já deve/)).toBeInTheDocument();
    expect((screen.getByLabelText('Vencimento') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(confirmButton());

    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ method: 'fiado', amount: 100, due_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    ]));
  });

  it('bloqueia fiado sem cliente e explica o que falta após atalho de confirmação', () => {
    const props = renderDialog({ customerId: null, customerName: null, customerCredit: null });

    fireEvent.click(screen.getByRole('button', { name: 'Fiado/Saldo' }));
    fireEvent.keyDown(window, { key: 'F9' });

    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText(/Venda no fiado precisa de cliente identificado/)).toBeInTheDocument();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('avisa caixa fechado antes da digitação e leva à abertura do caixa', () => {
    const onGoToCashPanel = vi.fn();
    const props = renderDialog({ hasOpenCashSession: false, onGoToCashPanel });

    expect(screen.getByText('Caixa fechado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o caixa' }));
    expect(onGoToCashPanel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dinheiro' }));
    fireEvent.keyDown(window, { key: 'F9' });
    expect(screen.getByText('Abra o caixa antes de receber em dinheiro.')).toBeInTheDocument();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('avisa quando falta conta do cofre e impede receber em dinheiro', () => {
    const props = renderDialog({ hasCofreAccount: false });

    expect(screen.getByText('Conta do cofre não configurada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dinheiro' }));
    fireEvent.keyDown(window, { key: 'F9' });

    expect(screen.getAllByText(/Escolha a conta do cofre em Configurações do PDV antes de receber em dinheiro/)).toHaveLength(2);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('mostra erro útil do servidor dentro do modal', async () => {
    const props = renderDialog({
      onConfirm: vi.fn().mockRejectedValue(new Error('Este voucher já foi usado em outra venda.')),
    });

    fireEvent.click(confirmButton());

    expect(await screen.findByText('Este voucher já foi usado em outra venda.')).toBeInTheDocument();
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmButton()).toBeEnabled();
  });

  it('não envia duas vezes enquanto a primeira finalização está pendente', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const props = renderDialog({ onConfirm: vi.fn(() => pending) });

    const button = confirmButton();
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'F9' });
    fireEvent.keyDown(window, { key: 'F9' });

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveTextContent('Finalizando...');

    finish();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });

  it('mantém hierarquia de leitura, nomes acessíveis e estado selecionado', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Pagamento' });
    const body = within(dialog).getByTestId('payment-body');
    const total = within(body).getByText('Valor a receber');
    const heading = within(body).getByRole('radiogroup', { name: 'Formas de pagamento' });
    const cash = within(body).getByRole('button', { name: 'Dinheiro' });
    const received = within(body).getByLabelText('Valor recebido');

    expect(total.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(cash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cash.compareDocumentPosition(received) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cash).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('radio', { name: 'Uma forma' })).toHaveAttribute('aria-checked', 'true');
  });

  it('no celular não rouba foco do início nem repete uma descrição longa', () => {
    testState.compact = true;
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Pagamento' });
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('Valor recebido')).not.toHaveFocus();
    expect(screen.getByRole('button', { name: /Finalizar Venda/ })).toBeInTheDocument();
  });

  it('amplia com os materiais reais do resumo e lembra a escolha ao reabrir', () => {
    const props = defaultProps({ summarySubtotal: 110, summaryDiscount: 10, summaryItems: [
      { id: 'item-1', name: 'Tubo de cobre', quantity: 2, unit: 'm', unitPrice: 55, total: 100, imageUrl: '/cobre.png' },
    ] });
    const first = render(<PdvPaymentDialog {...props} />);
    expect(document.querySelector('[data-checkout-expanded]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar' }));
    expect(document.querySelector('[data-checkout-expanded]')).not.toBeNull();
    expect(screen.getByText('Tubo de cobre')).toBeInTheDocument();
    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent('R$ 110,00');
    expect(localStorage.getItem('pdv:checkout-layout:company-1:operator-1')).toBe('expanded');
    first.unmount();
    render(<PdvPaymentDialog {...props} />);
    expect(screen.getByRole('button', { name: 'Reduzir' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reduzir' }));
    expect(document.querySelector('[data-checkout-expanded]')).toBeNull();
  });

  it('combina as seis formas suportadas sem perder o total no payload', async () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Combinar formas' }));
    for (const method of ['pix', 'debito', 'credito', 'transferencia', 'fiado'] as const) {
      fireEvent.click(screen.getByRole('button', { name: method === 'fiado' ? 'Fiado/Saldo' : texts.methods[method] }));
    }
    for (const method of ['pix', 'debito', 'credito', 'transferencia', 'fiado']) {
      const input = document.querySelector(`[data-payment-method="${method}"] input`)!;
      fireEvent.change(input, { target: { value: '10' } });
    }
    fireEvent.click(confirmButton());
    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledTimes(1));
    const payments = vi.mocked(props.onConfirm).mock.calls[0][0];
    expect(payments).toHaveLength(6);
    expect(payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(100);
    expect(payments.find((payment) => payment.method === 'dinheiro')?.amount).toBe(50);
  });
  it('mantém identidade, valor e conta na própria linha selecionada ao combinar formas', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Combinar formas' }));
    fireEvent.click(screen.getByRole('button', { name: 'PIX' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cartão de crédito' }));
    const pix = screen.getByRole('region', { name: 'Pagamento: PIX' });
    const credit = screen.getByRole('region', { name: 'Pagamento: Cartão de crédito' });
    expect(within(pix).getByLabelText('Valor')).toBeInTheDocument();
    expect(within(pix).getByRole('combobox', { name: 'Conta que recebe' })).toHaveTextContent('Conta principal');
    expect(within(credit).getByLabelText('Valor')).toBeInTheDocument();
    expect(within(credit).getByRole('combobox', { name: 'Conta que recebe' })).toHaveTextContent('Conta principal');
    expect(screen.getAllByRole('region', { name: /^Pagamento:/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'PIX' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pagamento: PIX' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Pagamento: Cartão de crédito' })).toBeInTheDocument();
  });

});
