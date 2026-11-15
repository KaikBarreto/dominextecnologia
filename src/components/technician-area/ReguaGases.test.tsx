import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReguaGases } from './ReguaGases';
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('./ToolDisclaimer', () => ({ ToolDisclaimer: () => null }));
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('régua de gases: entradas e unidade', () => {
  it('não usa a pressão do limite nem um valor padrão para temperatura inválida', () => {
    render(<ReguaGases />);
    const temp = screen.getByLabelText('Temperatura em graus Celsius');
    fireEvent.change(temp, { target: { value: '100' } });
    expect((screen.getByLabelText('Pressão em PSI (g)') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('alert').textContent).toContain('fora da faixa');
    fireEvent.change(temp, { target: { value: 'abc' } });
    expect(screen.getByRole('alert').textContent).toContain('número válido');
    expect((screen.getByLabelText('Pressão em PSI (g)') as HTMLInputElement).value).toBe('');
    fireEvent.change(temp, { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Pressão em PSI (g)') as HTMLInputElement).value).toBe('');
  });
  it('trocar psi/bar converte a pressão medida, enquanto sugestão corrige só a unidade errada', () => {
    render(<ReguaGases />);
    fireEvent.change(screen.getByLabelText('Pressão em PSI (g)'), { target: { value: '125' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Unidade' }));
    expect(Number((screen.getByLabelText('Pressão em BAR (g)') as HTMLInputElement).value.replace(',', '.'))).toBeCloseTo(125 / 14.503773773, 3);
    fireEvent.change(screen.getByLabelText('Pressão em BAR (g)'), { target: { value: '120' } });
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'psi' }));
    expect((screen.getByLabelText('Pressão em PSI (g)') as HTMLInputElement).value).toBe('120');
  });
  it('expõe orientação vertical e controles de teclado na régua', () => {
    render(<ReguaGases />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-orientation')).toBe('vertical');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect((screen.getByLabelText('Temperatura em graus Celsius') as HTMLInputElement).value).toBe('-40');
    fireEvent.keyDown(slider, { key: 'End' });
    expect((screen.getByLabelText('Temperatura em graus Celsius') as HTMLInputElement).value).toBe('60');
  });
});
