// Prova de WIRING (não só a função pura): garante que colar de verdade num
// <input> do NumericInput renderizado no DOM passa pelo `onPaste` do
// componente e cai em `sanitizeNumeric(..., { pasted: true })`. A suíte
// `numeric-input.test.ts` cobre a função `sanitizeNumeric` isolada; este
// arquivo cobre que ela está de fato conectada ao evento de colar do
// elemento real, e não só disponível como opção não usada por ninguém.
//
// Driver mínimo com createRoot + act (mesmo padrão de ChargeDialog.test.tsx
// e PermissionsEditor.test.tsx — o repo não usa @testing-library/react).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NumericInput } from '@/components/ui/numeric-input';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [v, setV] = React.useState('');
  return (
    <>
      <NumericInput decimal maxDecimals={2} value={v} onValueChange={setV} data-testid="real-field" />
      <span data-testid="mirror">{v}</span>
    </>
  );
}

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & { clipboardData: any };
  pasteEvent.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(pasteEvent);
  });
}

describe('NumericInput — paste real no DOM (prova de wiring)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("colar 'R$ 4.550' num campo real produz 4550, não 4,55 (bug do sócio)", () => {
    act(() => root.render(<Harness />));
    const input = container.querySelector('[data-testid="real-field"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    paste(input, 'R$ 4.550');

    const mirror = container.querySelector('[data-testid="mirror"]') as HTMLElement;
    expect(mirror.textContent).toBe('4550');
  });

  it('colar "1.234,56" num campo real produz 1234,56', () => {
    act(() => root.render(<Harness />));
    const input = container.querySelector('[data-testid="real-field"]') as HTMLInputElement;

    paste(input, '1.234,56');

    const mirror = container.querySelector('[data-testid="mirror"]') as HTMLElement;
    expect(mirror.textContent).toBe('1234,56');
  });
});
