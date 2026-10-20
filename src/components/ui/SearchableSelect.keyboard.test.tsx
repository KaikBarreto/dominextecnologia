import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
Element.prototype.scrollIntoView = vi.fn();

describe('SearchableSelect — fluxo rápido por teclado', () => {
  it('foca a pesquisa ao abrir e avança com Enter quando ela está vazia', async () => {
    const onEmptyEnter = vi.fn();
    render(
      <SearchableSelect
        options={[{ value: 'material-1', label: 'Material 1' }]}
        onValueChange={() => {}}
        placeholder="Escolher material"
        searchPlaceholder="Pesquisar material"
        focusSearchOnOpen
        onEmptyEnter={onEmptyEnter}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Escolher material' }));
    const search = await screen.findByPlaceholderText('Pesquisar material');
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onEmptyEnter).toHaveBeenCalledOnce();
  });

  it('preserva o Enter normal quando há texto pesquisado', async () => {
    const onEmptyEnter = vi.fn();
    render(
      <SearchableSelect
        options={[{ value: 'material-1', label: 'Material 1' }]}
        onValueChange={() => {}}
        placeholder="Escolher material"
        searchPlaceholder="Pesquisar material"
        onEmptyEnter={onEmptyEnter}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Escolher material' }));
    const search = await screen.findByPlaceholderText('Pesquisar material');
    fireEvent.change(search, { target: { value: 'Material' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onEmptyEnter).not.toHaveBeenCalled();
  });
});
