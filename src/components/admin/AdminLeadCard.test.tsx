// Prova de DOM real do card da oportunidade do CRM do painel master, depois
// da repaginação que o alinhou ao card do CRM do cliente (2026-09-23).
//
// O que está sendo protegido aqui é exatamente o que o card ANTIGO não tinha e
// por isso ninguém notaria se sumisse de novo:
//  1. barra de probabilidade (o campo `probability` já existia no banco e não
//     aparecia em lugar nenhum do funil);
//  2. badge SATURADO "Sem responsável" (régua de UI: badge de estado nunca é
//     outline — fila sem dono não pode parecer card esquecido);
//  3. o botão de WhatsApp, que é exclusivo do admin e PRECISA sobreviver ao
//     port do componente do tenant.
//
// Driver mínimo com createRoot + act (o repo não usa @testing-library/react).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminLeadCard } from './AdminLeadCard';
import type { AdminLead } from '@/hooks/useAdminCrm';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

function makeLead(overrides: Partial<AdminLead> = {}): AdminLead {
  return {
    id: 'lead-1',
    title: 'Refrigeração Alfa',
    company_name: 'Alfa Climatização LTDA',
    contact_name: 'Joana',
    email: null,
    phone: '11988887777',
    value: 2500,
    probability: 80,
    expected_close_date: '2026-10-15',
    source: null,
    segment: null,
    stage_id: 'stage-1',
    notes: null,
    loss_reason: null,
    created_by: null,
    responsible_id: null,
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<TooltipProvider>{ui}</TooltipProvider>);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const text = () => document.body.textContent || '';

describe('AdminLeadCard', () => {
  it('mostra a barra de probabilidade com o percentual do lead', () => {
    render(<AdminLeadCard lead={makeLead({ probability: 80 })} onClick={() => {}} />);

    expect(text()).toContain('Probabilidade');
    expect(text()).toContain('80%');

    // A barra em si: um filho com width proporcional ao percentual. Sem isso o
    // número apareceria sozinho e o card perderia a leitura visual.
    const bar = Array.from(document.querySelectorAll<HTMLElement>('div[style*="width"]')).find(
      (el) => el.style.width === '80%',
    );
    expect(bar).toBeTruthy();
  });

  it('não desenha a barra quando o lead não tem probabilidade', () => {
    render(<AdminLeadCard lead={makeLead({ probability: null })} onClick={() => {}} />);
    expect(text()).not.toContain('Probabilidade');
  });

  it('lead sem responsável mostra o badge saturado, não um avatar vazio', () => {
    render(<AdminLeadCard lead={makeLead({ responsible_id: null })} onClick={() => {}} />);
    expect(text()).toContain('Sem responsável');
  });

  it('com responsável mostra o nome no lugar do badge', () => {
    render(
      <AdminLeadCard
        lead={makeLead({ responsible_id: 'user-1' })}
        responsible={{ id: 'sp-1', name: 'Matheus Silva', photo_url: null }}
        onClick={() => {}}
      />,
    );
    expect(text()).toContain('Matheus Silva');
    expect(text()).not.toContain('Sem responsável');
  });

  it('mantém o atalho de WhatsApp quando o lead tem telefone', () => {
    render(<AdminLeadCard lead={makeLead({ phone: '11988887777' })} onClick={() => {}} />);
    expect(document.querySelector('[aria-label="Abrir conversa no WhatsApp"]')).toBeTruthy();
  });

  it('sem telefone não oferece o atalho de WhatsApp', () => {
    render(<AdminLeadCard lead={makeLead({ phone: null })} onClick={() => {}} />);
    expect(document.querySelector('[aria-label="Abrir conversa no WhatsApp"]')).toBeNull();
  });

  it('clicar no WhatsApp não abre o card (stopPropagation)', () => {
    let cardClicks = 0;
    render(<AdminLeadCard lead={makeLead()} onClick={() => { cardClicks += 1; }} />);

    const btn = document.querySelector<HTMLButtonElement>('[aria-label="Abrir conversa no WhatsApp"]')!;
    const originalOpen = window.open;
    (window as any).open = () => null;
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    (window as any).open = originalOpen;

    expect(cardClicks).toBe(0);
  });

  it('mostra a previsão de fechamento em dd/MM', () => {
    render(<AdminLeadCard lead={makeLead({ expected_close_date: '2026-10-15' })} onClick={() => {}} />);
    expect(text()).toContain('15/10');
  });
});
