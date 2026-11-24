import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModeloSuperaquecimento } from '@/lib/superaquecimentoModelos';
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


describe('procedimento documentado não vira alvo genérico', () => {
  function setup(model: string, gas = 'R-32') {
    sessionStorage.setItem('tt:state:superaquecimento:modeloId', JSON.stringify(model));
    sessionStorage.setItem('tt:state:superaquecimento:refrigId', JSON.stringify(gas));
    sessionStorage.setItem('tt:state:superaquecimento:pBaixa', JSON.stringify('120'));
    sessionStorage.setItem('tt:state:superaquecimento:tSuccao', JSON.stringify('15'));
    return render(<Superaquecimento />);
  }
  it('mostra a medição e a fonte, mas não recomenda faixa em carga por peso', () => {
    setup('samsung-dxea-dxfa-dyfa-dyfz-2024');
    expect(screen.getByText('Carga por peso')).toBeTruthy();
    expect(screen.queryByText(/Faixa genérica:/)).toBeNull();
    expect(screen.queryByText(/^Ideal$/)).toBeNull();
    expect(screen.getByText(/saturação:/i)).toBeTruthy();
    const model = getModeloSuperaquecimento('samsung-dxea-dxfa-dyfa-dyfz-2024')!;
    expect(screen.getByRole('link', { name: new RegExp(model.fonteDocumento!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).getAttribute('href')).toContain('#page=');
  });
  it('suspende o alvo do manual quando o fluido não corresponde ao perfil', () => {
    setup('carrier-ecosplit-ct-2014', 'R-32');
    expect(screen.getByRole('alert').textContent).toContain('fluido selecionado difere');
    expect(screen.queryByText(/Faixa do manual/)).toBeNull();
  });
  it('não sugere SC genérico quando o manual só informa SH', () => {
    setup('carrier-space-42xqm-18-24-r22-2015', 'R-22');
    sessionStorage.setItem('tt:state:superaquecimento:pAlta', JSON.stringify('200'));
    fireEvent.click(screen.getByRole('button', { name: 'Subresfriamento (SC)' }));
    fireEvent.change(screen.getByLabelText(/Pressão de alta.*psi/), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/Temperatura.*líquido.*°C/), { target: { value: '25' } });
    expect(screen.queryByText(/Faixa genérica:/)).toBeNull();
    expect(screen.queryByText(/^Ideal$/)).toBeNull();
  });
});
