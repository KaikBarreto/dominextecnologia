// O projeto NÃO importa o `style.css` do react-day-picker: todo o visual sai de
// `classNames` + Tailwind. No modo `captionLayout="dropdown-buttons"` a lib
// renderiza um `<select>` nativo, cuja lista de 100+ anos pode ocupar a altura
// inteira da janela no Chromium. O Calendar troca isso pelo Select do sistema.
//
// Este teste trava o contrato: mês e ano são comboboxes do sistema, sem nenhum
// `<select>` nativo capaz de escapar do popover.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ptBR } from 'date-fns/locale';
import { Calendar } from './calendar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
  it('renderiza mês e ano com o Select do sistema, sem select nativo', () => {
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

    expect(container.querySelectorAll('select')).toHaveLength(0);

    const dropdowns = Array.from(container.querySelectorAll('[role="combobox"]'));
    expect(dropdowns).toHaveLength(2);
    expect(dropdowns[0]).toHaveAttribute('aria-label', 'Month: ');
    expect(dropdowns[1]).toHaveAttribute('aria-label', 'Year: ');
    expect(dropdowns[0].textContent).toMatch(/outubro/i);
    expect(dropdowns[1].textContent).toContain('2026');

    // Exercita o estado que quebrava no print: abrir a lista de anos. O menu
    // fica no portal do Radix, por isso a consulta é no `document.body`.
    act(() => {
      dropdowns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const yearOptions = Array.from(document.body.querySelectorAll('[role="option"]'));
    expect(yearOptions).toHaveLength(11);
    expect(yearOptions[0].textContent).toContain('2020');
    expect(yearOptions.at(-1)?.textContent).toContain('2030');
    expect(document.body.querySelector('[role="listbox"]')?.className).toContain('max-h-64');
  });

  it('sem dropdown, o calendário continua com o título simples e nenhum select', () => {
    mount(<Calendar mode="single" locale={ptBR} defaultMonth={new Date(2026, 9, 17)} />);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(0);
  });
});
