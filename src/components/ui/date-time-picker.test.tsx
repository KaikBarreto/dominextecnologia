// O campo de data+hora guarda `yyyy-MM-ddTHH:mm` (o mesmo formato que um
// `<input type="datetime-local">` entrega) e o calendário trabalha com `Date`.
// A conversão entre os dois é onde mora a armadilha: `new Date('2026-09-19T08:00')`
// não tem offset e é interpretado como UTC por parte das engines — no fuso do
// Brasil (UTC-3) isso volta com a hora, e às vezes o dia, errados.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

import { DateTimePicker, parseIsoDateTime, toIsoDateTime } from './DateTimePicker';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('parseIsoDateTime', () => {
  it('mantém dia e hora escolhidos, sem deslocar pelo fuso', () => {
    const d = parseIsoDateTime('2026-09-19T08:30')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(19);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it('meia-noite não cai pro dia anterior', () => {
    const d = parseIsoDateTime('2026-01-01T00:00')!;
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(0);
    expect(d.getHours()).toBe(0);
  });

  it('devolve undefined pra vazio ou formato errado', () => {
    expect(parseIsoDateTime('')).toBeUndefined();
    expect(parseIsoDateTime('19/09/2026 08:30')).toBeUndefined();
    expect(parseIsoDateTime('2026-09-19')).toBeUndefined();
  });
});

describe('toIsoDateTime', () => {
  it('ida e volta preserva dia e hora', () => {
    for (const iso of ['2026-01-01T00:00', '2026-09-19T08:30', '2026-12-31T23:59']) {
      expect(toIsoDateTime(parseIsoDateTime(iso)!)).toBe(iso);
    }
  });
});

describe('DateTimePicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = (ui: React.ReactElement) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(ui);
    });
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('mostra o valor no formato do idioma e não usa input nativo', () => {
    mount(<DateTimePicker value="2026-09-19T08:30" onValueChange={() => {}} />);

    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(container.textContent).toContain('19/09/2026 08:30');
  });

  it('com o campo vazio mostra o placeholder do idioma', () => {
    mount(<DateTimePicker value="" onValueChange={() => {}} />);
    expect(container.textContent).toContain('dd/mm/aaaa --:--');
  });
});
