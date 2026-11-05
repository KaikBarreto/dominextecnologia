import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatePicker } from './DatePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('DatePicker — indicadores de agenda', () => {
  it('explica os pontos no hover e mantém a legenda textual', async () => {
    await act(async () => {
      root.render(
        <DatePicker
          value="2027-01-10"
          onValueChange={() => undefined}
          indicators={[
            { date: '2027-01-10', color: 'amber', label: 'Visita de contrato deste equipamento' },
            { date: '2027-01-10', color: 'blue', label: 'O.S. deste cliente' },
          ]}
          indicatorLegend={[
            { color: 'amber', label: 'Visita de contrato' },
            { color: 'blue', label: 'O.S.' },
          ]}
        />,
      );
    });

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.querySelector('[title="Visita de contrato deste equipamento • O.S. deste cliente"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Visita de contrato');
    expect(document.body.textContent).toContain('O.S.');
  });
});
