import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockLocationsTab } from './StockLocationsTab';
import type { Stock } from '@/hooks/useStocks';

const mocks = vi.hoisted(() => ({ create: vi.fn(), rename: vi.fn(), remove: vi.fn(), principal: vi.fn() }));
vi.mock('@/hooks/useStocks', () => ({ useStocks: () => ({ createStock: { mutateAsync: mocks.create }, renameStock: { mutate: mocks.rename }, deleteStock: { mutateAsync: mocks.remove }, setDefaultStock: { mutate: mocks.principal } }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
const stock = { id: 'store-1', name: 'Loja centro', purpose: 'pdv', is_default: false } as Stock;
const props = { stocks: [stock], context: 'general' as const, pdvEnabled: true, canManage: true, selectedId: stock.id, onSelect: vi.fn(), onConfigure: vi.fn() };

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ ...stock, id: 'new' }); });

describe('gestão de locais', () => {
  it('mantém consulta sem expor ações de escrita a quem não pode gerenciar', () => {
    render(<StockLocationsTab {...props} canManage={false} />);
    expect(screen.getByDisplayValue('Loja centro')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Criar local/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Configurar materiais/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByDisplayValue('Loja centro').closest('form')!);
    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it('cria local de loja explicitamente e seleciona o registro confirmado', async () => {
    render(<StockLocationsTab {...props} stocks={[]} selectedId={null} context="store" />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar local de loja' }));
    const form = screen.getByRole('form', { name: 'Criar local' });
    fireEvent.change(within(form).getByLabelText('Nome do local'), { target: { value: '  Loja nova  ' } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: 'Loja nova', purpose: 'pdv' }));
    expect(props.onSelect).toHaveBeenCalledWith('new');
  });

  it('salva renomeação inline, exige nome válido e não confunde principal geral com padrão PDV', () => {
    render(<StockLocationsTab {...props} context="store" />);
    const input = screen.getByLabelText('Nome do local');
    fireEvent.change(input, { target: { value: 'X' } });
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled();
    fireEvent.submit(input.closest('form')!);
    expect(mocks.rename).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Loja bairro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(mocks.rename).toHaveBeenCalledWith({ id: stock.id, name: 'Loja bairro' });
    expect(screen.queryByText('Definir como principal geral')).not.toBeInTheDocument();
  });

  it('não menciona loja/PDV quando o módulo não está disponível', () => {
    render(<StockLocationsTab {...props} stocks={[{ ...stock, purpose: 'operacional' }]} pdvEnabled={false} />);
    expect(screen.queryByText(/Configurações do PDV/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar local' }));
    expect(screen.queryByLabelText('Tipo do local')).not.toBeInTheDocument();
  });

  it('exige confirmação e mantém o diálogo aberto quando o servidor protege o histórico', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('Local em uso'));
    render(<StockLocationsTab {...props} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Excluir local' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('O histórico de operações será preservado');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir local' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(stock.id));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
