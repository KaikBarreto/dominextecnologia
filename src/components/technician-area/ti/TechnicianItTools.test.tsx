import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversorArmazenamento } from './ConversorArmazenamento';
import { CalculadoraFontePSU } from './CalculadoraFontePSU';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('../ToolDisclaimer', () => ({ ToolDisclaimer: () => null }));
afterEach(cleanup);

describe('entradas decimais de armazenamento e transferência', () => {
  it('preserva vírgula decimal e usa SI/IEC corretamente', () => {
    render(<ConversorArmazenamento />);
    const input = screen.getByLabelText('Valor');
    fireEvent.change(input, { target: { value: '1,5' } });
    expect((input as HTMLInputElement).value).toBe('1,5');
    expect(screen.getByText('1,5 TB = 1.396,9839 GiB')).toBeTruthy();
  });
  it('preserva decimal na velocidade e tamanho do arquivo, com tempo localizado', () => {
    render(<ConversorArmazenamento />);
    fireEvent.click(screen.getByRole('button', { name: 'Velocidade' }));
    fireEvent.change(screen.getByLabelText('Velocidade'), { target: { value: '1,5' } });
    fireEvent.change(screen.getByLabelText('Tamanho do arquivo'), { target: { value: '1,6' } });
    expect(screen.getByText('8,53 s')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Velocidade'), { target: { value: '0' } });
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('fonte calculada com potências declaradas', () => {
  it('mostra o mínimo acima de1600W sem recomendar uma fonte subdimensionada', () => {
    render(<CalculadoraFontePSU />);
    fireEvent.change(screen.getByLabelText('Processador (CPU)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Placa de vídeo (GPU)'), { target: { value: '1000' } });
    expect(screen.getByText('Potência mínima estimada')).toBeTruthy();
    expect(screen.getByText(/O cálculo excede as faixas/)).toBeTruthy();
    expect(screen.queryByText(/1600|1\.600|RTX|80 Plus Bronze/)).toBeNull();
    expect(screen.getAllByText(/2\.682/).length).toBeGreaterThan(0);
  });
});
