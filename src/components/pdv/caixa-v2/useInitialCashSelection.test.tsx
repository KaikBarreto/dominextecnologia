import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInitialCashSelection } from './useInitialCashSelection';
function useHarness(props: { ownerKey: string | null; ready: boolean; ownSessionId: string | null }) {
  const [selected, setSelected] = useState('home');
  useInitialCashSelection({ ...props, onSelect: setSelected });
  return { selected, select: setSelected };
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
