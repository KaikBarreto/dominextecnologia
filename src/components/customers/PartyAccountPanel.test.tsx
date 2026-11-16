import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usePartyAccountStatement, auth } = vi.hoisted(() => ({ usePartyAccountStatement: vi.fn(), auth: { receive: false, reverse: false } }));
vi.mock('@/hooks/usePartyAccountStatement', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/usePartyAccountStatement')>('@/hooks/usePartyAccountStatement');
  return { ...actual, usePartyAccountStatement };
});
vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-BR', currency: 'BRL' }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminOrGestor: () => false, hasPermission: (key: string) => (key === 'fn:receive_pdv_receivable' && auth.receive) || (key === 'fn:reverse_pdv_receivable' && auth.reverse), hasPermissionRecord: true }),
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ open, title, description, children, footer }: { open: boolean; title: string; description?: string; children: unknown; footer?: unknown }) => open ? (
    <div role="dialog" aria-label={title}><p>{description}</p>{children as React.ReactNode}{footer as React.ReactNode}</div>
  ) : null,
}));

import { PartyAccountPanel } from '@/components/customers/PartyAccountPanel';

const mutation = () => ({ isPending: false, error: null, mutateAsync: vi.fn() });
const base = {
  statement: {
    summary: {
      partyType: 'customer', partyId: 'customer-1', openAmount: 120,
      availableCredit: 35, creditLimit: 500, purchaseCapacity: 380, asOf: '2026-11-07',
    },
    entries: [{
      id: 'account-1', sourceType: 'obligation', amount: 120, occurredOn: '2026-11-01',
      description: 'Pedido 42', dueDate: '2026-11-15', isPaid: false, openAmount: 120, accountStatus: 'open',
    }],
    totalCount: 1, limit: 10, offset: 0,
  },
  isLoading: false, isError: false, isHidden: false, error: null, refetch: vi.fn(),
  postCredit: mutation(), applyCredit: mutation(), reverseCredit: mutation(),
  settleReceivable: mutation(), reverseSettlement: mutation(),
  receivableOptions: { data: { accounts: [], cashSessions: [] } },
};

describe('PartyAccountPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks(); auth.receive = false; auth.reverse = false;
    usePartyAccountStatement.mockReturnValue(base);
  });

  it('mantém dívida, crédito e limite separados e mostra copy não monetária na aplicação', () => {
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" canManage />);
    expect(screen.getAllByText('Em aberto')).toHaveLength(2);
    expect(screen.getByText('Crédito disponível')).toBeInTheDocument();
    expect(screen.getByText('Limite de fiado')).toBeInTheDocument();
    expect(screen.getByText('Disponível no fiado')).toBeInTheDocument();
    expect(screen.getByText(/não aumenta o limite/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Usar crédito/ }));
    expect(screen.getByText(/Não registra pagamento em dinheiro/)).toBeInTheDocument();
  });

  it('usa A pagar e Adiantamento para fornecedor, sem limite de fiado', () => {
    usePartyAccountStatement.mockReturnValue({
      ...base,
      statement: {
        ...base.statement,
        summary: { ...base.statement.summary, partyType: 'supplier', openAmount: 999999999.99, creditLimit: null, purchaseCapacity: null },
        entries: [
          { ...base.statement.entries[0], id: 'credit-1', sourceType: 'credit', description: 'Adiantamento inicial', openAmount: null, accountStatus: null },
          { ...base.statement.entries[0], id: 'application-1', sourceType: 'application', description: 'Aplicado na compra', openAmount: null, accountStatus: null },
          { ...base.statement.entries[0], id: 'legacy-1', sourceType: 'legacy_credit_balance', description: 'Saldo anterior', openAmount: null, accountStatus: null },
        ],
      },
    });
    render(<PartyAccountPanel partyType="supplier" partyId="supplier-1" canManage />);
    expect(screen.getByText('A pagar')).toBeInTheDocument();
    expect(screen.getAllByText('Adiantamento').length).toBeGreaterThan(0);
    expect(screen.getByText(/999\.999\.999,99/)).toBeInTheDocument();
    expect(screen.getByText('A pagar').parentElement?.parentElement).toHaveClass('grid-cols-1');
    expect(screen.getByRole('button', { name: /Registrar crédito/ })).toHaveClass('whitespace-normal');
    expect(screen.queryByText('Limite de fiado')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Contas' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Saldo' }));
    expect(usePartyAccountStatement).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'balance' }));
  });

  it('permite alternar contas e saldo pelo teclado sem abrir outra ficha', () => {
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" canManage />);
    const accounts = screen.getByRole('tab', { name: 'Contas' });
    const balance = screen.getByRole('tab', { name: 'Saldo' });
    fireEvent.keyDown(accounts, { key: 'ArrowRight' });
    expect(balance).toHaveFocus();
    expect(balance).toHaveAttribute('aria-selected', 'true');
    expect(usePartyAccountStatement).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'balance' }));
    fireEvent.keyDown(balance, { key: 'Home' });
    expect(accounts).toHaveFocus();
    expect(accounts).toHaveAttribute('aria-selected', 'true');
    expect(usePartyAccountStatement).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'accounts' }));
  });

  it('usa a data canônica da empresa no formulário e no payload', async () => {
    const postCredit = mutation();
    postCredit.mutateAsync.mockResolvedValue({ ok: true });
    usePartyAccountStatement.mockReturnValue({
      ...base,
      statement: { ...base.statement, summary: { ...base.statement.summary, asOf: '2030-01-02' } },
      postCredit,
    });
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" canManage />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar crédito/ }));
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '25,50' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Crédito do cliente' } });
    expect(screen.getByLabelText('Data')).toHaveValue('2030-01-02');
    expect(screen.getByLabelText('Data')).toHaveAttribute('max', '2030-01-02');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(postCredit.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      occurredOn: '2030-01-02', amount: 25.5,
    })));
  });

  it('registra Pix do PDV no caixa recebedor e seleciona automaticamente o único caixa aberto', async () => {
    auth.receive = true;
    const settleReceivable = mutation(); settleReceivable.mutateAsync.mockResolvedValue({ ok: true });
    usePartyAccountStatement.mockReturnValue({ ...base, settleReceivable,
      statement: { ...base.statement, entries: [{ ...base.statement.entries[0], requiresCashSession: true }] },
      receivableOptions: { data: { accounts: [{ id: 'bank-1', name: 'Banco da loja', type: 'banco' }],
        cashSessions: [{ id: 'receiving-2', cashAccountId: 'cash-account', label: 'Caixa 2' }] } },
    });
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Receber' }));
    expect(screen.getByLabelText('Caixa que recebe')).toHaveValue('receiving-2');
    fireEvent.change(screen.getByLabelText('Conta financeira'), { target: { value: 'bank-1' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Parcial no Pix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(settleReceivable.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      method: 'pix', accountId: 'bank-1', cashSessionId: 'receiving-2', amount: 4,
    })));
  });

  it('orienta a abrir caixa e bloqueia baixa PDV quando nenhum está disponível', () => {
    auth.receive = true;
    usePartyAccountStatement.mockReturnValue({ ...base,
      statement: { ...base.statement, entries: [{ ...base.statement.entries[0], requiresCashSession: true }] },
      receivableOptions: { data: { accounts: [{ id: 'bank-1', name: 'Banco da loja', type: 'banco' }], cashSessions: [] } },
    });
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Receber' }));
    fireEvent.change(screen.getByLabelText('Conta financeira'), { target: { value: 'bank-1' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Parcial' } });
    expect(screen.getByText('Abra seu caixa no PDV para registrar este recebimento.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('continua recebendo pelo banco sem caixa quando a conta é do financeiro geral', async () => {
    auth.receive = true;
    const settleReceivable = mutation(); settleReceivable.mutateAsync.mockResolvedValue({ ok: true });
    usePartyAccountStatement.mockReturnValue({ ...base, settleReceivable,
      receivableOptions: { data: { accounts: [{ id: 'bank-1', name: 'Banco da loja', type: 'banco' }], cashSessions: [] } },
    });
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Receber' }));
    expect(screen.queryByLabelText('Caixa que recebe')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Conta financeira'), { target: { value: 'bank-1' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Pagamento da conta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(settleReceivable.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ cashSessionId: null })));
  });

  it('estorna Pix usando o caixa registrado no recebimento mesmo que outro esteja aberto', async () => {
    auth.reverse = true;
    const reverseSettlement = mutation(); reverseSettlement.mutateAsync.mockResolvedValue({ ok: true });
    usePartyAccountStatement.mockReturnValue({ ...base, reverseSettlement,
      statement: { ...base.statement, entries: [{ ...base.statement.entries[0], id: 'receipt-4', sourceType: 'settlement',
        amount: 4, openAmount: null, accountStatus: null, accountId: 'bank-1', cashSessionId: 'recorded-closed',
        settlementMethod: 'pix', canReverse: true, requiresCashSession: true }] },
      receivableOptions: { data: { accounts: [{ id: 'bank-1', name: 'Banco da loja', type: 'banco' }],
        cashSessions: [{ id: 'current-open', cashAccountId: 'cash-account', label: 'Caixa atual' }] } },
    });
    render(<PartyAccountPanel partyType="customer" partyId="customer-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Estornar' }));
    expect(screen.getByLabelText('Caixa do recebimento')).toHaveValue('Caixa registrado no recebimento');
    expect(screen.getByLabelText('Caixa do recebimento')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Desfazer parcial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));
    await waitFor(() => expect(reverseSettlement.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      settlementTransactionId: 'receipt-4', cashSessionId: 'recorded-closed', accountId: 'bank-1',
    })));
  });

  it('não mostra a seção sem capability ou quando o rollout está oculto', () => {
    const { container, rerender } = render(<PartyAccountPanel partyType="customer" partyId="customer-1" enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    usePartyAccountStatement.mockReturnValue({ ...base, isHidden: true });
    rerender(<PartyAccountPanel partyType="customer" partyId="customer-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
