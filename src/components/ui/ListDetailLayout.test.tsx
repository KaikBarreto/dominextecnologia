import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListDetailLayout } from '@/components/ui/ListDetailLayout';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('ListDetailLayout', () => {
  it('filtra, seleciona e recolhe a lista sem esconder o detalhe', () => {
    const onSelect = vi.fn();

    render(
      <ListDetailLayout
        items={[
          { id: '1', title: 'Cliente Alpha', subtitle: 'Recife' },
          { id: '2', title: 'Cliente Beta', subtitle: 'Olinda' },
        ]}
        selectedId="1"
        listTitle="Lista de clientes"
        searchPlaceholder="Buscar clientes..."
        emptyLabel="Nenhum cliente encontrado"
        onSelect={onSelect}
      >
        <div>Ficha do cliente</div>
      </ListDetailLayout>,
    );

    expect(screen.getByText('Ficha do cliente')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1-2 de 2')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar clientes...'), { target: { value: 'Olinda' } });
    expect(screen.queryByText('Cliente Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Cliente Beta')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cliente Beta/ }));
    expect(onSelect).toHaveBeenCalledWith('2');

    fireEvent.click(screen.getByRole('button', { name: 'Recolher lista' }));
    expect(screen.getByRole('button', { name: 'Expandir lista' })).toBeInTheDocument();
    expect(screen.getByText('Ficha do cliente')).toBeInTheDocument();
  });

  it('busca sem acento, com palavras fora de ordem e documento sem máscara', () => {
    render(
      <ListDetailLayout
        items={[
          {
            id: '1',
            title: 'Marcos Antônio Braga',
            subtitle: '12.345.678/0001-90',
          },
          { id: '2', title: 'Beatriz Souza', subtitle: 'Recife' },
        ]}
        listTitle="Lista de clientes"
        searchPlaceholder="Buscar clientes..."
        emptyLabel="Nenhum cliente encontrado"
        onSelect={vi.fn()}
      >
        <div>Ficha do cliente</div>
      </ListDetailLayout>,
    );

    const search = screen.getByPlaceholderText('Buscar clientes...');

    fireEvent.change(search, { target: { value: 'antonio' } });
    expect(screen.getByText('Marcos Antônio Braga')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'marcos braga' } });
    expect(screen.getByText('Marcos Antônio Braga')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '12345678' } });
    expect(screen.getByText('Marcos Antônio Braga')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'inexistente' } });
    expect(screen.queryByText('Marcos Antônio Braga')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum cliente encontrado')).toBeInTheDocument();
  });

  it('abre a foto sem selecionar outro registro', () => {
    const onSelect = vi.fn();
    const onImageClick = vi.fn();

    render(
      <ListDetailLayout
        items={[
          {
            id: '1',
            title: 'Equipamento Split',
            imageUrl: 'https://example.com/split.jpg',
            imageAlt: 'Ampliar foto do equipamento',
            onImageClick,
          },
        ]}
        listTitle="Lista de equipamentos"
        searchPlaceholder="Buscar equipamentos..."
        emptyLabel="Nenhum equipamento encontrado"
        onSelect={onSelect}
      >
        <div>Ficha do equipamento</div>
      </ListDetailLayout>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ampliar foto do equipamento' }));

    expect(onImageClick).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('pagina a lista, navega entre páginas e abre na página do selecionado', () => {
    // Nomes com zero à esquerda pra a ordem alfabética bater com a numérica.
    const items = Array.from({ length: 120 }, (_, index) => ({
      id: String(index),
      title: `Cliente ${String(index).padStart(3, '0')}`,
    }));

    render(
      <ListDetailLayout
        items={items}
        selectedId="80"
        listTitle="Lista de clientes"
        searchPlaceholder="Buscar clientes..."
        emptyLabel="Nenhum cliente encontrado"
        onSelect={vi.fn()}
      >
        <div>Ficha do cliente</div>
      </ListDetailLayout>,
    );

    // 120 cadastros em páginas de 25: a lista monta 25 linhas, não 120.
    expect(screen.getAllByRole('listitem')).toHaveLength(25);
    // O selecionado (índice 80) está na 4ª página, e a lista abre nela.
    expect(screen.getByText('Mostrando 76-100 de 120')).toBeInTheDocument();
    expect(screen.getByText('Cliente 080')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Mostrando 51-75 de 120')).toBeInTheDocument();
    expect(screen.queryByText('Cliente 080')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Mostrando 76-100 de 120')).toBeInTheDocument();
  });

  it('ordena pelo critério escolhido no menu compacto', async () => {
    const items = [
      { id: '1', title: 'Ana' },
      { id: '2', title: 'Bruno' },
      { id: '3', title: 'Carla' },
    ];

    render(
      <ListDetailLayout
        items={items}
        listTitle="Lista de clientes"
        searchPlaceholder="Buscar clientes..."
        emptyLabel="Nenhum cliente encontrado"
        onSelect={vi.fn()}
      >
        <div>Ficha do cliente</div>
      </ListDetailLayout>,
    );

    const primeiraLinha = () => within(screen.getAllByRole('listitem')[0]);
    expect(primeiraLinha().getByText('Ana')).toBeInTheDocument();
    expect(screen.getByLabelText('3 registros')).toHaveTextContent('3');

    // Ordenação abre um menu compacto com os critérios disponíveis.
    const botao = screen.getByRole('button', { name: 'Ordenar: Nome (A-Z)' });
    expect(botao).toHaveTextContent('Ordenar');

    fireEvent.click(botao);
    fireEvent.click(await screen.findByRole('button', { name: 'Nome (Z-A)' }));
    expect(primeiraLinha().getByText('Carla')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar: Nome (Z-A)' })).toHaveTextContent('Ordenar');
  });

  it('mantém item geral fixo e alterna lista e detalhe no fluxo mobile', () => {
    const { rerender } = render(
      <ListDetailLayout
        pinnedItems={[{ id: 'all', title: 'Geral (Todos)', emphasized: true }]}
        items={[{ id: '1', title: 'Filtro secador' }]}
        selectedId="all"
        listTitle="Materiais"
        searchPlaceholder="Buscar material..."
        emptyLabel="Nenhum material encontrado"
        onSelect={vi.fn()}
        mobileDetailOpen={false}
      >
        <div>Histórico selecionado</div>
      </ListDetailLayout>,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Geral (Todos)')).toHaveClass('font-bold');
    expect(screen.getByLabelText('1 registro')).toHaveTextContent('1');
    expect(screen.getByText('Histórico selecionado').parentElement).toHaveClass('hidden');

    rerender(
      <ListDetailLayout
        pinnedItems={[{ id: 'all', title: 'Geral (Todos)', emphasized: true }]}
        items={[{ id: '1', title: 'Filtro secador' }]}
        selectedId="1"
        listTitle="Materiais"
        searchPlaceholder="Buscar material..."
        emptyLabel="Nenhum material encontrado"
        onSelect={vi.fn()}
        mobileDetailOpen
      >
        <div>Histórico selecionado</div>
      </ListDetailLayout>,
    );

    expect(screen.getByText('Histórico selecionado').parentElement).not.toHaveClass('hidden');
  });
});
