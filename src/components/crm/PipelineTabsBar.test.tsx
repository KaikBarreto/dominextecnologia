// Abas de funil do cabeçalho do CRM. O que estes testes prendem:
//
// 1) DESKTOP: a engrenagem existe em TODA aba (some/aparece por CSS de hover,
//    que não existe em jsdom) e o "+" fica fora da faixa rolável.
// 2) MOBILE: hover não existe. A engrenagem tem que estar presente na aba
//    ATIVA e AUSENTE nas inativas — é o equivalente de toque combinado no
//    lugar do hover. Se alguém "simplificar" isso pra hover-only, o celular
//    fica sem nenhum caminho pra configurar o funil, que foi exatamente o bug
//    que já existia no menu de ações do PipelineManagerDialog.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Settings2 } from 'lucide-react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));

import { PipelineTabsBar } from './PipelineTabsBar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PIPELINES = [
  { id: 'p1', name: 'Funil de Vendas', color: '#123456', is_default: true, position: 0, company_id: 'c', created_at: '', updated_at: '' },
  { id: 'p2', name: 'Pós-venda', color: '#ABCDEF', is_default: false, position: 1, company_id: 'c', created_at: '', updated_at: '' },
];

let container: HTMLDivElement;
let root: Root;
const onSelect = vi.fn();
const onCreate = vi.fn();
const onConfigure = vi.fn();

function render(mobile: boolean, hideSelected = false) {
  act(() => {
    root.render(
      <PipelineTabsBar
        pipelines={PIPELINES as any}
        selectedId="p1"
        onSelect={onSelect}
        onCreate={onCreate}
        menuActions={() => [{ label: 'Gerenciar etapas', icon: Settings2, onClick: onConfigure }]}
        mobile={mobile}
        configureLabel="Configurar funil"
        createLabel="Novo funil"
        listLabel="Funil"
        hideSelected={hideSelected}
      />,
    );
  });
}

const gears = () => Array.from(document.querySelectorAll('[data-pipeline-gear]')).map((el) => el.getAttribute('data-pipeline-gear'));

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onSelect.mockClear();
  onCreate.mockClear();
  onConfigure.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('PipelineTabsBar — desktop', () => {
  it('desenha uma aba por funil e o botão de criar', () => {
    render(false);
    expect(Array.from(document.querySelectorAll('[data-pipeline-tab]')).map((e) => e.textContent)).toEqual([
      'Funil de Vendas',
      'Pós-venda',
    ]);
    expect(document.querySelector('[data-pipeline-create]')).toBeTruthy();
  });

  it('engrenagem em TODAS as abas (aparece no hover, via CSS)', () => {
    render(false);
    expect(gears()).toEqual(['p1', 'p2']);
  });

  it('mostra a cor persistida como linha abaixo do nome', () => {
    render(false);
    expect((document.querySelector('[data-pipeline-color="p1"]') as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)');
  });

  it('usa apenas a cor do funil como indicador inferior ativo', () => {
    render(false);
    const activeItem = document.querySelector('[data-pipeline-item="p1"]') as HTMLElement;
    expect(activeItem.className).not.toContain('border-primary');
    expect(document.querySelector('[data-pipeline-color="p1"]')?.className).toContain('w-full');
    expect(document.querySelector('[data-pipeline-color="p2"]')?.className).toContain('w-5');
  });

  it('clicar na aba troca de funil; clicar no "+" pede funil novo', () => {
    render(false);
    act(() => {
      document.querySelector('[data-pipeline-tab="p2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith('p2');

    act(() => {
      document.querySelector('[data-pipeline-create]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCreate).toHaveBeenCalled();
  });

  it('mostra somente os outros funis quando o ativo já aparece como título', () => {
    render(false, true);
    expect(document.querySelector('[data-pipeline-item="p1"]')).toBeNull();
    expect(document.querySelector('[data-pipeline-item="p2"]')).toBeTruthy();
    expect(document.querySelector('[data-pipeline-create]')).toBeTruthy();
  });

  it('engrenagem abre a configuração do funil sem trocar o funil ativo', () => {
    render(false);
    act(() => {
      document.querySelector('[data-pipeline-gear="p2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('PipelineTabsBar — mobile (sem hover)', () => {
  it('engrenagem SÓ na aba ativa, e nenhuma aba fica sem caminho de configuração', () => {
    render(true);
    expect(gears()).toEqual(['p1']);
    // A aba inativa continua na tela e alcançável: tocar nela a torna ativa e
    // aí a engrenagem dela aparece.
    const rotulos = Array.from(document.querySelectorAll('span')).map((e) => e.textContent);
    expect(rotulos).toContain('Funil de Vendas');
    expect(rotulos).toContain('Pós-venda');
    expect(document.querySelectorAll('[data-pipeline-color]').length).toBe(2);
  });

  it('o "+" continua existindo no mobile', () => {
    render(true);
    expect(document.querySelector('[data-pipeline-create]')).toBeTruthy();
  });

  it('usa abas transparentes com sublinhado, sem aparência de pill', () => {
    render(true);
    const items = Array.from(document.querySelectorAll('[data-pipeline-item]')) as HTMLElement[];
    expect(items).toHaveLength(2);
    items.forEach((item) => {
      expect(item.className).toContain('bg-transparent');
      expect(item.className).not.toContain('rounded-full');
      expect(item.className).not.toContain('bg-primary/10');
      expect(item.className).not.toContain('bg-muted/50');
    });
  });
});
