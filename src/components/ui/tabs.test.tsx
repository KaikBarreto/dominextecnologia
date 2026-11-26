import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  HTMLElement.prototype.scrollTo = vi.fn();
});

describe('TabsList com barra horizontal', () => {
  it('preserva ref, atributos e navegação do Radix por teclado', async () => {
    const listRef = React.createRef<HTMLDivElement>();
    render(
      <Tabs defaultValue="primeira">
        <TabsList ref={listRef} variant="underline" aria-label="Seções" data-source="radix">
          <TabsTrigger variant="underline" value="primeira">Primeira</TabsTrigger>
          <TabsTrigger variant="underline" value="segunda">Segunda</TabsTrigger>
        </TabsList>
        <TabsContent value="primeira">Conteúdo inicial</TabsContent>
        <TabsContent value="segunda">Conteúdo seguinte</TabsContent>
      </Tabs>,
    );

    const list = screen.getByRole('tablist', { name: 'Seções' });
    const first = screen.getByRole('tab', { name: 'Primeira' });
    const second = screen.getByRole('tab', { name: 'Segunda' });
    expect(listRef.current).toBe(list);
    expect(list).toHaveAttribute('data-source', 'radix');
    expect(first).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);

    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    await waitFor(() => expect(second).toHaveFocus());
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo seguinte');
  });

  it('preserva estrutura e aparência das abas segmentadas', () => {
    render(
      <Tabs defaultValue="geral" data-testid="root">
        <TabsList className="w-full">
          <TabsTrigger value="geral">Geral</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const list = screen.getByRole('tablist');
    expect(list.parentElement).toBe(screen.getByTestId('root'));
    expect(list).toHaveClass('inline-flex', 'bg-muted', 'rounded-md', 'w-full');
  });

  it('não desenha uma caixa de foco ao redor do conteúdo da aba', () => {
    render(
      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
        </TabsList>
        <TabsContent value="geral">Conteúdo</TabsContent>
      </Tabs>,
    );

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveClass('outline-none');
    expect(panel.className).not.toContain('focus-visible:ring');
  });

  it('aplica posicionamento ao conjunto da barra mantendo estilos da lista', () => {
    render(
      <Tabs defaultValue="geral">
        <TabsList variant="underline" wrapperClassName="sticky top-0" className="grid w-full grid-cols-2">
          <TabsTrigger variant="underline" value="geral">Geral</TabsTrigger>
          <TabsTrigger variant="underline" value="estoque">Estoque</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const list = screen.getByRole('tablist');
    expect(list.parentElement).toHaveClass('sticky', 'top-0');
    expect(list).toHaveClass('grid', 'grid-cols-2', 'w-full');
    expect(list).not.toHaveAttribute('wrapperClassName');
  });

  it('respeita orientação vertical herdada do Root sem controles horizontais', () => {
    render(
      <Tabs defaultValue="geral" orientation="vertical">
        <TabsList variant="underline">
          <TabsTrigger variant="underline" value="geral">Geral</TabsTrigger>
          <TabsTrigger variant="underline" value="estoque">Estoque</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-orientation', 'vertical');
    Object.defineProperty(list.parentElement, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperties(list, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 800 },
    });
    fireEvent.scroll(list);

    expect(screen.queryByRole('button', { name: 'Ver próximas abas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver abas anteriores' })).not.toBeInTheDocument();
  });
});
