// O projeto NÃO importa o `style.css` do react-day-picker: todo o visual sai de
// `classNames` + Tailwind. No modo `captionLayout="dropdown-buttons"` a lib
// renderiza um `<select>` REAL por cima de um rótulo `aria-hidden`, e quem
// esconde o select é justamente o CSS da lib. Sem as classes escritas à mão em
// `calendar.tsx`, apareceriam OS DOIS na tela (select cru do sistema + rótulo).
//
// Este teste trava o contrato: os dois selects existem, estão preenchidos com
// a faixa pedida e saem invisíveis (opacity-0), com o rótulo estilizado por cima.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ptBR } from 'date-fns/locale';
import { Calendar } from './calendar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(ui);
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Calendar com seletor de mês e ano', () => {
  it('renderiza os dois selects, invisíveis, cobrindo o rótulo', () => {
    mount(
      <Calendar
        mode="single"
        captionLayout="dropdown-buttons"
        fromYear={2020}
        toYear={2030}
        locale={ptBR}
        defaultMonth={new Date(2026, 9, 17)}
      />,
    );

    const selects = Array.from(container.querySelectorAll('select'));
    expect(selects).toHaveLength(2);

    const [monthSelect, yearSelect] = selects;
    expect(monthSelect.options).toHaveLength(12);
    // 2020..2030 inclusivo.
    expect(yearSelect.options).toHaveLength(11);
    expect(Array.from(yearSelect.options).map((o) => o.value)).toContain('2020');
    expect(Array.from(yearSelect.options).map((o) => o.value)).toContain('2030');

    // Invisível e sobreposto: é o rótulo estilizado que a pessoa enxerga.
    for (const select of selects) {
      expect(select.className).toContain('opacity-0');
      expect(select.className).toContain('absolute');
    }
  });

  it('sem dropdown, o calendário continua com o título simples e nenhum select', () => {
    mount(<Calendar mode="single" locale={ptBR} defaultMonth={new Date(2026, 9, 17)} />);
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });
});
