import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inicio } from './Inicio';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
afterEach(cleanup);

describe('ferramentas encontráveis no início', () => {
  it('lista todas as ferramentas e permite buscar e abrir uma sem passar pelo carrossel', () => {
    const onNavigate = vi.fn();
    render(<Inicio segment="refrigeracao" onNavigate={onNavigate} />);
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(10);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ferramenta' }), { target: { value: 'superaquecimento' } });
    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onNavigate).toHaveBeenCalledWith('superaquecimento');
  });
  it('mostra busca vazia sem esconder o glossário e permite recuperar a lista', () => {
    render(<Inicio segment="refrigeracao" onNavigate={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Buscar ferramenta' });
    fireEvent.change(search, { target: { value: 'zzzzzzzzzz' } });
    expect(screen.getByRole('status').textContent).toContain('Nenhuma ferramenta encontrada.');
    expect(screen.getByText('Termos Técnicos Explicados')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(10);
  });
});
