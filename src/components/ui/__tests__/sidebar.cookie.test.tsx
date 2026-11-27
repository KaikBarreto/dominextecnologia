import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sidebar, SidebarProvider, useSidebar } from '../sidebar';

function Probe() {
  const { open, transientOpen, setOpen } = useSidebar();
  return (
    <div>
      <span data-testid="open">{String(open)}</span>
      <span data-testid="transient">{String(transientOpen)}</span>
      <button onClick={() => setOpen(true, { transient: true })}>hover</button>
      <button onClick={() => setOpen(!open)}>toggle</button>
      <button onClick={() => setOpen(false)}>fechar</button>
    </div>
  );
}

const clearLegacyCookie = () => {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
};

describe('SidebarProvider', () => {
  beforeEach(clearLegacyCookie);

  it('começa recolhido por padrão', () => {
    render(<SidebarProvider><Probe /></SidebarProvider>);
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });

  it('permite sobrescrever o default explicitamente', () => {
    render(<SidebarProvider defaultOpen><Probe /></SidebarProvider>);
    expect(screen.getByTestId('open')).toHaveTextContent('true');
  });

  it('ignora o cookie legado e não grava novos estados nele', () => {
    document.cookie = 'sidebar:state=true; path=/';
    render(<SidebarProvider><Probe /></SidebarProvider>);

    expect(screen.getByTestId('open')).toHaveTextContent('false');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(document.cookie).toContain('sidebar:state=true');

    clearLegacyCookie();
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(document.cookie).not.toContain('sidebar:state=');
  });

  it('marca o hover como transitório e mantém o espaçador compacto', () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon">menu</Sidebar>
        <Probe />
      </SidebarProvider>,
    );

    const root = container.querySelector<HTMLElement>("[data-side='left']");
    const gap = container.querySelector<HTMLElement>("[data-sidebar='gap']");
    const panel = container.querySelector<HTMLElement>("[data-sidebar='desktop-panel']");

    expect(gap).toHaveStyle({ width: 'var(--sidebar-width-icon)' });
    expect(panel).toHaveStyle({ width: 'var(--sidebar-width-icon)' });

    fireEvent.click(screen.getByText('hover'));

    expect(root).toHaveAttribute('data-state', 'expanded');
    expect(root).toHaveAttribute('data-transient-open', 'true');
    expect(screen.getByTestId('transient')).toHaveTextContent('true');
    expect(root?.children[0]).toHaveClass('group-data-[transient-open=true]:w-[--sidebar-width-icon]');
    expect(gap).toHaveStyle({ width: 'var(--sidebar-width-icon)' });
    expect(panel).toHaveStyle({ width: 'var(--sidebar-width)' });
  });

  it('mantém aberto quando fixado e recolhe ao desligar a fixação', () => {
    const { rerender } = render(
      <SidebarProvider pinnedOpen>
        <Probe />
      </SidebarProvider>,
    );

    expect(screen.getByTestId('open')).toHaveTextContent('true');
    fireEvent.click(screen.getByText('fechar'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');

    rerender(
      <SidebarProvider pinnedOpen={false}>
        <Probe />
      </SidebarProvider>,
    );
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });

  it('usa a mesma transição ao abrir e fechar e respeita movimento reduzido', () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon">menu</Sidebar>
        <Probe />
      </SidebarProvider>,
    );

    const root = container.querySelector<HTMLElement>("[data-side='left']");
    const gap = root?.children[0] as HTMLElement;
    const panel = root?.children[1] as HTMLElement;

    expect(gap).toHaveStyle({ width: 'var(--sidebar-width-icon)' });
    expect(panel).toHaveStyle({ width: 'var(--sidebar-width-icon)' });

    for (const element of [gap, panel]) {
      expect(element).toHaveClass('duration-300', 'ease-out', 'motion-reduce:transition-none');
    }

    fireEvent.click(screen.getByText('toggle'));
    expect(root).toHaveAttribute('data-state', 'expanded');
    expect(gap).toHaveStyle({ width: 'var(--sidebar-width)' });
    expect(panel).toHaveStyle({ width: 'var(--sidebar-width)' });
    fireEvent.click(screen.getByText('toggle'));
    expect(root).toHaveAttribute('data-state', 'collapsed');
    expect(gap).toHaveStyle({ width: 'var(--sidebar-width-icon)' });
    expect(panel).toHaveStyle({ width: 'var(--sidebar-width-icon)' });
  });

  it('preserva estilos recebidos sem permitir divergência na largura crítica', () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon" style={{ backgroundColor: 'rgb(1, 2, 3)', width: '99rem' }}>
          menu
        </Sidebar>
      </SidebarProvider>,
    );

    const panel = container.querySelector<HTMLElement>("[data-sidebar='desktop-panel']");
    expect(panel).toHaveStyle({
      backgroundColor: 'rgb(1, 2, 3)',
      width: 'var(--sidebar-width-icon)',
    });
  });
});
