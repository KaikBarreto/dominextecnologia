import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversao } from './Conversao';
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('./ToolDisclaimer', () => ({ ToolDisclaimer: () => null }));
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('tt:state:conversao:categoria', JSON.stringify('potencia')); });
afterEach(cleanup);

describe('conversor com contextos explícitos', () => {
  it('mostra referência comercial como aproximada e inverte sem perder a quantidade', () => {
    render(<Conversao />);
    expect(screen.getByRole('button', { name: /Capacidade de refrigeração/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('9.000');
    expect(screen.getByText(/Varia por marca e modelo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Inverter unidades' }));
    expect((screen.getByLabelText('De: BTU/h') as HTMLInputElement).value).toBe('9000');
    expect((screen.getByLabelText('Para: HP comercial (aprox.)') as HTMLInputElement).value).toBe('1');
    fireEvent.change(screen.getByLabelText('Para: HP comercial (aprox.)'), { target: { value: '2' } });
    expect((screen.getByLabelText('De: BTU/h') as HTMLInputElement).value).toBe('18.000');
    fireEvent.click(screen.getByRole('button', { name: 'Inverter unidades' }));
    expect((screen.getByLabelText('De: HP comercial (aprox.)') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('18.000');
  });
  it('usa potência real em HP mecânico e recupera o contexto certo nos favoritos', async () => {
    sessionStorage.setItem('tt:state:conversao:potencia:modo', JSON.stringify('energia'));
    sessionStorage.setItem('tt:state:conversao:potencia:de', JSON.stringify('HP'));
    sessionStorage.setItem('tt:state:conversao:potencia:para', JSON.stringify('BTU/h'));
    render(<Conversao />);
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('2.544,433853');
    fireEvent.click(screen.getByRole('button', { name: 'Favoritar conversão' }));
    fireEvent.click(screen.getByRole('button', { name: /Capacidade de refrigeração/ }));
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('9.000');
    fireEvent.click(screen.getByRole('button', { name: 'HP mecânico → BTU/h' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Potência mecânica/ }).getAttribute('aria-pressed')).toBe('true'));
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('2.544,433853');
  });
  it('não mostra zero como resultado de entrada inválida ou vazia', () => {
    render(<Conversao />);
    const input = screen.getByLabelText('De: HP comercial (aprox.)');
    fireEvent.change(input, { target: { value: 'erro' } });
    expect(screen.getByRole('alert').textContent).toContain('Digite um número válido');
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('—');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('');
  });
  it('migra HP de sessão comercial antiga sem transformar em potência mecânica', () => {
    sessionStorage.setItem('tt:state:conversao:potencia:de', JSON.stringify('HP'));
    sessionStorage.setItem('tt:state:conversao:potencia:para', JSON.stringify('BTU/h'));
    render(<Conversao />);
    expect(screen.getByLabelText('De: HP comercial (aprox.)')).toBeTruthy();
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('9.000');
  });
  it('restaura refrigeração para um deep-link de TR mesmo após usar potência mecânica', async () => {
    sessionStorage.setItem('tt:state:conversao:potencia:modo', JSON.stringify('energia'));
    render(<Conversao inicial={{ categoria: 'potencia', de: 'TR', para: 'kW' }} />);
    await waitFor(() => expect(screen.getByLabelText('De: TR (tonelada de refrigeração)')).toBeTruthy());
    expect((screen.getByLabelText('Para: kW térmicos') as HTMLInputElement).value).toBe('3,516853');
  });
  it('reabre o mesmo favorito após trocar o contexto', async () => {
    localStorage.setItem('tt:favoritos:conversao', JSON.stringify([{ categoria: 'potencia', de: 'HP', para: 'BTU/h' }]));
    render(<Conversao />);
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'HP mecânico → BTU/h' }));
    abrir();
    await waitFor(() => expect(screen.getByLabelText('De: HP mecânico')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Capacidade de refrigeração/ }));
    expect(screen.getByLabelText('De: HP comercial (aprox.)')).toBeTruthy();
    abrir();
    await waitFor(() => expect(screen.getByLabelText('De: HP mecânico')).toBeTruthy());
    expect((screen.getByLabelText('Para: BTU/h') as HTMLInputElement).value).toBe('2.544,433853');
  });
});
