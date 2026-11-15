import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Superaquecimento } from './Superaquecimento';
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('./ToolDisclaimer', () => ({ ToolDisclaimer: () => null }));
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('medição no superaquecimento', () => {
  it('preserva a mesma pressão nas duas abas ao trocar psi e bar', () => {
    sessionStorage.setItem('tt:state:superaquecimento:pBaixa', JSON.stringify('120'));
    sessionStorage.setItem('tt:state:superaquecimento:pAlta', JSON.stringify('300'));
    render(<Superaquecimento />);
    fireEvent.click(screen.getByRole('button', { name: 'bar' }));
    const bar = Number((screen.getByLabelText('Pressão de baixa (sucção) (bar)') as HTMLInputElement).value.replace(',', '.'));
    expect(bar).toBeCloseTo(8.27370875, 6);
    expect(Number(JSON.parse(sessionStorage.getItem('tt:state:superaquecimento:pAlta')!).replace(',', '.'))).toBeCloseTo(20.68427188, 6);
    fireEvent.click(screen.getByRole('button', { name: 'psi' }));
    expect((screen.getByLabelText('Pressão de baixa (sucção) (psi)') as HTMLInputElement).value).toBe('120');
    expect(JSON.parse(sessionStorage.getItem('tt:state:superaquecimento:pAlta')!)).toBe('300');
  });
  it('permite pressão manométrica negativa e não altera campo vazio ao trocar unidade', () => {
    render(<Superaquecimento />);
    fireEvent.change(screen.getByLabelText('Pressão de baixa (sucção) (psi)'), { target: { value: '-5' } });
    expect((screen.getByLabelText('Pressão de baixa (sucção) (psi)') as HTMLInputElement).value).toBe('-5');
    fireEvent.click(screen.getByRole('button', { name: 'bar' }));
    expect(Number((screen.getByLabelText('Pressão de baixa (sucção) (bar)') as HTMLInputElement).value.replace(',', '.'))).toBeCloseTo(-0.34473786, 6);
    expect(JSON.parse(sessionStorage.getItem('tt:state:superaquecimento:pAlta')!)).toBe('');
  });
});
