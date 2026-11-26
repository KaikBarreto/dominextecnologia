import type { ComponentProps, ReactNode } from 'react';
type PaymentProps = ComponentProps<typeof import('@/components/financial/ReceivePaymentModal').ReceivePaymentModal>;
import type { OsReceivable } from '@/lib/osCommercial';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ receive: vi.fn(), complement: vi.fn(), onOpenChange: vi.fn(), onReceived: vi.fn(), rows: [] as OsReceivable[], data: { total: 3300, items: [{ description: 'Serviço de teste', quantity: 1, unit_price: 3300, item_type: 'servico' }], adjustment: 0 }, paymentProps: null as PaymentProps | null }));
vi.mock('@/hooks/useOsCommercial', () => ({ useOsFieldBudget: () => ({ data: mocks.data, isPending: false, isError: false, draft: null }) }));
vi.mock('@/hooks/useOsManualBilling', () => ({ useOsManualBilling: () => ({ data: mocks.rows, isPending: false, isError: false, receive: mocks.receive, complement: mocks.complement, refetch: vi.fn() }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({open,children}: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: () => <input aria-label="Vencimento" /> }));
vi.mock('./OsFieldBudgetEditor', () => ({ OsFieldBudgetEditor: () => null }));
vi.mock('./OsReceiptDialog', () => ({ OsReceiptDialog: ({open, publicMode}: {open: boolean; publicMode: boolean}) => open ? <p>Recibo {publicMode ? 'público' : 'interno'}</p> : null }));
vi.mock('@/components/financial/ReceivePaymentModal', () => ({ ReceivePaymentModal: (props: PaymentProps) => { mocks.paymentProps=props;return props.open ? <button onClick={() => props.onConfirm({ amount_received: 2600, account_id: 'account-a', payment_method: 'pix', paid_date: '2026-11-26', fee_amount: 0 })}>Confirmar parcial de teste</button> : null; } }));
import { OsManualBillingDialog } from './OsManualBillingDialog';
const context = { serviceOrderId: 'os-a', osNumber: 123, customerName: 'Cliente fictício', suggestedAmount: 1 };
describe('faturar e receber pela OS', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows=[]; mocks.data.total=3300; mocks.receive.mockResolvedValue({ remaining: 700 }); mocks.complement.mockResolvedValue({amount:700}); });
  it('puxa 3300 do orçamento canônico e recebe 2600, com parcial habilitado', async () => {
    render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} onReceived={mocks.onReceived} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receber agora · total ou parcial' }));
    expect(mocks.paymentProps).toMatchObject({ amount: 3300, amountReceived: 0, allowPartial: true, allowPartialInstallments: true });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar parcial de teste' }));
    await waitFor(() => expect(mocks.onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.receive).toHaveBeenCalledWith(3300, expect.objectContaining({ amount_received: 2600 }), expect.any(String), undefined);
    expect(mocks.onReceived).toHaveBeenCalledOnce();
  });
  it('reabre a mesma conta para receber o saldo em outro pagamento', () => {
    mocks.rows=[{ id:'parent-a',amount:3300,amount_received:2600,is_paid:false,due_date:'2026-12-26' }];
    render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(screen.getByText(/Saldo desta conta R\$/)).toHaveTextContent('700,00');
    fireEvent.click(screen.getByRole('button',{ name:'Receber total ou parcial' }));
    expect(mocks.paymentProps).toMatchObject({ amount:3300,amountReceived:2600,allowPartial:true });
  });  it('mantém a base da baixa aberta depois de um refetch, sem transformar uma tentativa em outro pagamento', () => {
    mocks.rows=[{ id:'parent-a',amount:3300,amount_received:0,is_paid:false,due_date:'2026-12-26' }];
    const view=render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    fireEvent.click(screen.getByRole('button',{name:'Receber total ou parcial'}));
    mocks.rows=[{ ...mocks.rows[0], amount_received:2600 }];
    view.rerender(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(mocks.paymentProps).toMatchObject({ amount:3300,amountReceived:0 });
  });

  it('oferece somente os 700 não faturados quando o lançamento legado de 2600 está quitado', async () => {
    mocks.rows=[{id:'legacy',amount:2600,amount_received:0,is_paid:true,due_date:'2026-11-26',can_complement:true}];
    const view=render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(screen.getByText(/ainda não foram faturados/)).toHaveTextContent('700,00');
    expect(screen.queryByRole('button',{name:'Receber total ou parcial'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Criar conta de R\$\s+700,00 a receber/}));
    await waitFor(()=>expect(mocks.complement).toHaveBeenCalledWith(3300,2600,expect.any(String)));
    expect(mocks.receive).not.toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    mocks.rows=[mocks.rows[0],{id:'difference',amount:700,amount_received:0,is_paid:false,due_date:'2026-12-26'}];
    view.rerender(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(screen.queryByRole('button',{name:/Criar conta/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Receber total ou parcial'}));
    expect(mocks.paymentProps).toMatchObject({amount:700,amountReceived:0,allowPartial:true});
  });

  it('mantém recibo e histórico disponíveis quando toda a OS já foi recebida', () => {
    mocks.rows=[{id:'paid',amount:3300,amount_received:0,is_paid:true,due_date:'2026-11-26'}];
    render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(screen.getByText(/O valor desta OS já foi recebido/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Conferir no Financeiro'})).toHaveAttribute('href','/financeiro/movimentacoes');
    fireEvent.click(screen.getByRole('button',{name:'Gerar recibo'}));
    expect(screen.getByText('Recibo interno')).toBeInTheDocument();
  });

  it('explica a diferença bloqueada por parcelas ou cobrança e oferece o Financeiro', () => {
    mocks.rows=[{id:'charge',amount:2600,amount_received:0,is_paid:true,due_date:'2026-11-26',can_complement:false,has_live_charge:true}];
    render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(screen.getByText(/Confira as parcelas e cobranças vinculadas/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Criar conta/})).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Conferir no Financeiro'})).toBeInTheDocument();
  });

  it('mostra faturamento acima do valor comercial sem inventar recebimento negativo', () => {
    mocks.rows=[{id:'paid',amount:3500,amount_received:0,is_paid:true,due_date:'2026-11-26'}];
    render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    expect(screen.getByText(/acima do valor atual/)).toHaveTextContent('200,00');
    expect(screen.queryByRole('button',{name:/Criar conta/})).not.toBeInTheDocument();
  });

  it('mantém o complemento disponível em erro de transporte sem anunciar recebimento', async () => {
    mocks.rows=[{id:'legacy',amount:2600,amount_received:0,is_paid:true,due_date:'2026-11-26',can_complement:true}];
    mocks.complement.mockRejectedValue(new Error('Failed to fetch'));
    render(<OsManualBillingDialog open context={context} onOpenChange={mocks.onOpenChange} />);
    fireEvent.click(screen.getByRole('button',{name:/Criar conta/}));
    await screen.findByText(/Não foi possível confirmar o recebimento/);
    expect(screen.getByRole('button',{name:/Criar conta/})).toBeEnabled();
    expect(mocks.onReceived).not.toHaveBeenCalled();
  });

});
