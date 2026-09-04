// Testes de COMPORTAMENTO do editor de permissões. Driver mínimo com
// createRoot + act (o repo não tem @testing-library/dom instalado — mesmo padrão
// de useFormDraft.test.tsx). Cobrem as regras que voltaram em correção lá no
// EcoSistema: chip derivado (acende/apaga sozinho), aplicar cargo SUBSTITUI,
// ação-filha ligável com a tela desligada, e as 3 regras da busca.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo', isLoading: false, setUserLanguage: async () => {} }),
}));

import { PermissionsEditor } from './PermissionsEditor';
import { getAllPermissionKeys } from '@/hooks/usePermissions';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PRESETS = [
  { id: 'p1', name: 'Técnico', description: 'só o essencial de campo', permissions: ['screen:service_orders', 'fn:create_os'], created_at: '', updated_at: '' },
];

let container: HTMLDivElement;
let root: Root;
let current: string[] = [];

function Harness({ initial, allowFullAccess }: { initial: string[]; allowFullAccess?: boolean }) {
  const [value, setValue] = React.useState<string[]>(initial);
  current = value;
  return (
    <PermissionsEditor value={value} onChange={setValue} presets={PRESETS} allowFullAccess={allowFullAccess} />
  );
}

function mount(initial: string[] = [], allowFullAccess = false) {
  act(() => { root.render(<Harness initial={initial} allowFullAccess={allowFullAccess} />); });
}
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const text = () => container.textContent || '';
const click = (el: Element | null) => { act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
function chipByName(name: string) {
  return Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === name) || null;
}
function typeSearch(v: string) {
  const input = q('input[placeholder="Buscar tela ou ação..."]') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PermissionsEditor', () => {
  it('renderiza telas, contador e o chip Personalizado', () => {
    mount();
    expect(text()).toContain('Ordens de Serviço');
    expect(text()).toContain('Notas Fiscais');
    expect(text()).toContain('Personalizado');
    expect(text()).toContain('0/5'); // 5 ações na tela de OS
  });

  it('aplicar cargo SUBSTITUI a seleção e acende o chip', () => {
    mount(['screen:finance']);
    click(chipByName('Técnico'));
    expect(current).toEqual(['screen:service_orders', 'fn:create_os']);
    expect(text()).not.toContain('Personalizado');
  });

  it('desligar uma permissão do cargo faz o chip virar Personalizado sozinho', () => {
    mount(['screen:service_orders', 'fn:create_os']);
    expect(text()).not.toContain('Personalizado');
    click(byLabel('Acesso à tela Ordens de Serviço'));
    expect(text()).toContain('Personalizado');
    // religar volta o chip do cargo
    click(byLabel('Acesso à tela Ordens de Serviço'));
    expect(text()).not.toContain('Personalizado');
  });

  it('Acesso Total marca tudo', () => {
    mount([], true);
    click(chipByName('Acesso Total'));
    expect(current).toEqual(getAllPermissionKeys());
  });

  it('curinga "*" aparece como tudo ligado', () => {
    mount(['*'], true);
    expect((byLabel('Acesso à tela Ordens de Serviço') as HTMLElement).getAttribute('data-state')).toBe('checked');
    expect(text()).not.toContain('Personalizado');
  });

  it('busca por ação filtra a tela e mostra só a ação que casou', () => {
    mount();
    typeSearch('reabrir');
    expect(text()).toContain('Ordens de Serviço');
    expect(text()).toContain('Reabrir OS');
    expect(text()).not.toContain('Criar OS');
    expect(text()).not.toContain('Notas Fiscais');
  });

  it('busca sem resultado mostra o vazio com o termo', () => {
    mount();
    typeSearch('domiflix');
    expect(text()).toContain('Nenhuma tela ou ação encontrada para "domiflix".');
  });

  it('ação filha é ligável mesmo com a tela desligada e mostra o aviso', () => {
    mount();
    click(byLabel('Ver ações de Ordens de Serviço'));
    expect(text()).toContain('A tela está desligada, mas estas ações continuam valendo por conta própria.');
    const sw = byLabel('Criar OS')!;
    expect(sw.hasAttribute('disabled')).toBe(false);
    click(sw);
    expect(current).toEqual(['fn:create_os']);
  });

  it('tela sem ações não tem trigger de expandir', () => {
    mount();
    expect(byLabel('Ver ações de Orçamentos')).toBeNull();
    expect(byLabel('Acesso à tela Orçamentos')).not.toBeNull();
  });
});
