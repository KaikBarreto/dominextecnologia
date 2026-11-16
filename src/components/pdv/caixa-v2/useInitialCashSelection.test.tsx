import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInitialCashSelection } from './useInitialCashSelection';
type Input = Parameters<typeof useInitialCashSelection>[0];
function useHarness(props: Omit<Input, 'onSelect'>) {
  const [selected, setSelected] = useState('home');
  const selection = useInitialCashSelection({ ...props, onSelect: setSelected });
  return { selected, select: setSelected, ready: selection.ready, targetChanged: selection.targetChanged };
}
describe('entrada no caixa', () => {
  it('aguarda a consulta e abre o caixa próprio inclusive para gestores', () => {
    const { result, rerender } = renderHook(useHarness, { initialProps: { ownerKey: 'empresa:operador', ready: false, ownSessionId: 'meu-caixa' } });
    expect(result.current.selected).toBe('home');
    rerender({ ownerKey: 'empresa:operador', ready: true, ownSessionId: 'meu-caixa' });
    expect(result.current.selected).toBe('meu-caixa');
    act(() => result.current.select('home'));
    rerender({ ownerKey: 'empresa:operador', ready: true, ownSessionId: 'meu-caixa' });
    expect(result.current.selected).toBe('home');
  });
  it('não escolhe caixa de outro operador quando não tem próprio', () => {
    const { result } = renderHook(useHarness, { initialProps: { ownerKey: 'empresa:operador', ready: true, ownSessionId: null } });
    expect(result.current.selected).toBe('home');
  });
  it('refaz a escolha ao mudar de conta somente depois da autorização carregar', () => {
    const { result, rerender } = renderHook(useHarness, { initialProps: { ownerKey: 'empresaA:operador', ready: true, ownSessionId: 'caixaA' } });
    expect(result.current.selected).toBe('caixaA');
    rerender({ ownerKey: 'empresaB:operador', ready: false, ownSessionId: 'caixaB' });
    expect(result.current.selected).toBe('caixaA');
    rerender({ ownerKey: 'empresaB:operador', ready: true, ownSessionId: 'caixaB' });
    expect(result.current.selected).toBe('caixaB');
  });
});


describe('entrada por pedido explícito', () => {
  const base = { ownerKey: 'empresa:admin', ready: true, ownSessionId: 'próprio' };
  const target = (key: string, status: 'pending' | 'ready' | 'unavailable', sessionId: string | null = null) => ({ key, status, sessionId });
  it('espera o destino autorizado, escolhe outro caixa e não volta ao próprio quando a fila consome a URL', () => {
    const { result, rerender } = renderHook(useHarness, { initialProps: { ...base, requestedTarget: target('pedidoA', 'pending') } });
    expect(result.current.selected).toBe('home'); expect(result.current.ready).toBe(false);
    rerender({ ...base, requestedTarget: target('pedidoA', 'ready', 'caixaA') });
    expect(result.current.selected).toBe('caixaA'); expect(result.current.ready).toBe(true);
    rerender({ ...base, requestedTarget: undefined });
    expect(result.current.selected).toBe('caixaA'); expect(result.current.ready).toBe(true);
  });
  it('respeita navegação manual/refetch e aceita um novo pedido explícito uma única vez', () => {
    const { result, rerender } = renderHook(useHarness, { initialProps: { ...base, requestedTarget: target('pedidoA', 'ready', 'caixaA') } });
    act(() => result.current.select('caixaB'));
    rerender({ ...base, requestedTarget: target('pedidoA', 'ready', 'caixaA') });
    expect(result.current.selected).toBe('caixaB');
    rerender({ ...base, requestedTarget: target('pedidoB', 'pending') });
    expect(result.current.ready).toBe(false);
    rerender({ ...base, requestedTarget: target('pedidoB', 'ready', 'caixaC') });
    expect(result.current.selected).toBe('caixaC');
    act(() => result.current.select('home'));
    rerender({ ...base, requestedTarget: target('pedidoB', 'ready', 'caixaC') });
    expect(result.current.selected).toBe('home');
  });
  it('bloqueia uma reatribuição do mesmo pedido em vez de trocar silenciosamente de caixa', () => {
    const { result, rerender } = renderHook(useHarness, { initialProps: { ...base, requestedTarget: target('pedidoA', 'ready', 'caixaA') } });
    rerender({ ...base, requestedTarget: target('pedidoA', 'ready', 'caixaB') });
    expect(result.current.selected).toBe('caixaA');
    expect(result.current.ready).toBe(false); expect(result.current.targetChanged).toBe(true);
  });

  it('não cai no próprio para um destino negado ou fechado', () => {
    const { result } = renderHook(useHarness, { initialProps: { ...base, requestedTarget: target('negado', 'unavailable') } });
    expect(result.current.selected).toBe('home'); expect(result.current.ready).toBe(false);
  });
  it('mascara imediatamente a seleção ao mudar proprietário e durante A→B→A', () => {
    const { result, rerender } = renderHook(useHarness, { initialProps: { ...base, requestedTarget: target('pedidoA', 'ready', 'caixaA') } });
    rerender({ ...base, ownerKey: 'empresaB:admin', ready: false, requestedTarget: target('pedidoA', 'pending') });
    expect(result.current.ready).toBe(false);
    rerender({ ...base, requestedTarget: target('pedidoA', 'pending') });
    expect(result.current.ready).toBe(false);
    rerender({ ...base, requestedTarget: target('pedidoA', 'ready', 'caixaA2') });
    expect(result.current.selected).toBe('caixaA2'); expect(result.current.ready).toBe(true);
  });
});
