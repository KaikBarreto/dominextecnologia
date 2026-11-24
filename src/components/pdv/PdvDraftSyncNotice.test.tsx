import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvDraftSyncNotice, type PdvDraftConflict, type PdvDraftResolveResult, type PdvDraftSyncNoticeProps } from './PdvDraftSyncNotice';

const first: PdvDraftConflict = {
  id: 'private-draft-first', label: '#1048 · Carlos Almeida',
  local: { title: 'Carlos Almeida', details: '2 materiais · R$ 120,00', notes: 'Retirar pela manhã', updatedAt: '2026-11-14T14:00:00Z' },
  server: { title: 'Carlos Almeida', details: '3 materiais · R$ 180,00', updatedAt: '2026-11-14T14:05:00Z' },
  alternativesCount: 1, requiresOrderReview: false, orderId: null,
};
const second: PdvDraftConflict = { ...first, id: 'private-draft-second', label: '#1049 · Marina Costa', local: { title: 'Marina Costa', details: '1 material · R$ 50,00' }, alternativesCount: 0 };
function props(overrides: Partial<PdvDraftSyncNoticeProps> = {}): PdvDraftSyncNoticeProps {
  return { issue: 'conflict', localPersistenceIssue: false, resolvingDraftId: null, conflicts: [first], onResolve: vi.fn(async () => 'resolved' as const), onRetry: vi.fn(), onReviewOrder: vi.fn(), ...overrides };
}
async function open() { fireEvent.click(screen.getByRole('button', { name: 'Revisar versões' })); return screen.findByRole('dialog'); }

describe('revisão explícita das versões de atendimento', () => {
  it('não mostra aviso quando não há diferença nem falha de cópia', () => {
    const view = render(<PdvDraftSyncNotice {...props({ issue: null, conflicts: [] })} />);
    expect(view.container).toBeEmptyDOMElement();
  });
  it('informa falha no dispositivo sem prometer cópia salva e oferece nova tentativa', () => {
    const data = props({ issue: null, conflicts: [], localPersistenceIssue: true });
    render(<PdvDraftSyncNotice {...data} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível guardar uma cópia neste dispositivo. Mantenha esta aba aberta até sincronizar.');
    expect(screen.queryByText(/salvo|sem conexão|internet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(data.onRetry).toHaveBeenCalledOnce();
    expect(data.onResolve).not.toHaveBeenCalled();
  });
  it('trata indisponibilidade sem atribuir a causa à internet nem exibir erro técnico', () => {
    render(<PdvDraftSyncNotice {...props({ issue: 'unavailable', conflicts: [] })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível sincronizar este atendimento com a conta.');
    expect(screen.queryByText(/offline|rede|internet|RPC|JSON|private-draft/i)).not.toBeInTheDocument();
  });
  it.each(['local', 'server'] as const)('compara os dados e envia somente a escolha %s com a identidade correta', async choice => {
    const data = props(); render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    expect(within(dialog).getByRole('region', { name: 'Nesta aba' })).toHaveTextContent('2 materiais · R$ 120,00');
    expect(within(dialog).getByRole('region', { name: 'Na conta' })).toHaveTextContent('3 materiais · R$ 180,00');
    expect(dialog).not.toHaveTextContent(first.id);
    expect(dialog).toHaveTextContent('a outra versão será mantida como cópia');
    fireEvent.click(within(dialog).getByRole('button', { name: choice === 'local' ? 'Manter versão desta aba' : 'Usar versão da conta' }));
    await waitFor(() => expect(data.onResolve).toHaveBeenCalledWith(first.id, choice));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('cancelar apenas fecha a comparação sem escolher nem repetir salvamento', async () => {
    const data = props(); render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(data.onResolve).not.toHaveBeenCalled(); expect(data.onRetry).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('mantém aberto quando houve outra mudança e exige conferir de novo', async () => {
    const data = props({ onResolve: vi.fn(async () => 'refresh_required' as const) }); render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Manter versão desta aba' }));
    expect(await within(dialog).findByText(/Este atendimento mudou novamente/)).toBeVisible();
    expect(dialog).toBeVisible(); expect(data.onResolve).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole('button', { name: 'Usar versão da conta' })).toBeEnabled();
  });
  it('trava escolhas, lista, saída e nova tentativa enquanto a escolha está em andamento', async () => {
    let finish!: (value: PdvDraftResolveResult) => void;
    const data = props({ conflicts: [first, second], onResolve: vi.fn(() => new Promise<PdvDraftResolveResult>(resolve => { finish = resolve; })) });
    render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    const keep = within(dialog).getByRole('button', { name: 'Manter versão desta aba' });
    fireEvent.click(keep); fireEvent.click(keep);
    expect(data.onResolve).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole('button', { name: 'Usar versão da conta' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /#1049/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => finish('resolved'));
    expect(within(dialog).getByRole('heading', { name: second.label })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /#1048/ })).not.toBeInTheDocument();
  });
  it('respeita processamento externo e não permite uma segunda escolha', async () => {
    const data = props(); const view = render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    view.rerender(<PdvDraftSyncNotice {...data} resolvingDraftId={first.id} />);
    expect(within(dialog).getByRole('button', { name: 'Manter versão desta aba' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usar versão da conta' }));
    expect(data.onResolve).not.toHaveBeenCalled();
  });
  it('reconhece fechamento pendente sem acessar dados de uma versão local inexistente', async () => {
    const data = props({ conflicts: [{ ...first, local: null }] }); render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    expect(within(dialog).getByText('O fechamento deste atendimento foi solicitado nesta aba.')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Manter versão desta aba' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar fechamento' }));
    await waitFor(() => expect(data.onResolve).toHaveBeenCalledWith(first.id, 'local'));
  });
  it('pedido existente bloqueia escolhas e abre somente a revisão pedida pelo usuário', async () => {
    const data = props({ conflicts: [{ ...first, requiresOrderReview: true, orderId: 'existing-order' }] });
    render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    expect(data.onReviewOrder).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('button', { name: 'Usar versão da conta' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revisar pedido existente' }));
    expect(data.onReviewOrder).toHaveBeenCalledWith('existing-order'); expect(data.onResolve).not.toHaveBeenCalled();
  });
  it('tentativa incerta sem número bloqueia escolhas sem afirmar que já existe pedido', async () => {
    const data = props({ conflicts: [{ ...first, requiresOrderReview: true, orderId: null }] });
    render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    expect(within(dialog).getByText('A última tentativa precisa ser conferida em Pedidos antes de escolher outra versão.')).toBeVisible();
    expect(dialog).not.toHaveTextContent('Este atendimento já tem um pedido');
    expect(within(dialog).queryByRole('button', { name: 'Usar versão da conta' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Manter versão desta aba' })).not.toBeInTheDocument();
    expect(data.onResolve).not.toHaveBeenCalled();
  });
  it('retorno review_order também bloqueia novas escolhas; sem id não oferece ação inválida', async () => {
    const data = props({ onResolve: vi.fn(async () => 'review_order' as const) }); render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Manter versão desta aba' }));
    expect(await within(dialog).findByText(/Procure o atendimento na lista de pedidos/)).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Manter versão desta aba' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Revisar pedido existente' })).not.toBeInTheDocument();
  });
  it('não oferece uma versão da conta inexistente', async () => {
    render(<PdvDraftSyncNotice {...props({ conflicts: [{ ...first, server: null }] })} />); const dialog = await open();
    expect(within(dialog).getByRole('button', { name: 'Usar versão da conta' })).toBeDisabled();
  });
  it.each(['unavailable', 'not_found', 'throw'] as const)('mantém a revisão aberta em %s sem expor exceções', async result => {
    const data = props({ onResolve: vi.fn(async () => { if (result === 'throw') throw Error('RPC private-secret'); return result; }) });
    render(<PdvDraftSyncNotice {...data} />); const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Manter versão desta aba' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeVisible());
    expect(dialog).not.toHaveTextContent(/RPC|private-secret/);
    expect(within(dialog).getByRole('button', { name: 'Manter versão desta aba' })).toBeEnabled();
  });
});
