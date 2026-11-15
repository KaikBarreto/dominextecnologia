import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PdvCatalogSkeleton, PdvPageSkeleton } from './PdvPageSkeleton';

describe('carregamento estrutural do PDV', () => {
  it.each(['cash', 'sale', 'list-detail', 'detail', 'kanban', 'settings', 'table', 'reports', 'metrics'] as const)('%s anuncia carregamento sem inventar ações, valores ou estado vazio', variant => {
    const { container } = render(<PdvPageSkeleton variant={variant} label="Consultando dados autorizados" />);
    expect(screen.getByRole('status', { name: 'Consultando dados autorizados' })).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('button,input,select,a,[tabindex]')).toBeNull();
    expect(container).not.toHaveTextContent(/R\$|nenhum|salvo|concluído/i);
  });

  it.each(['quick', 'catalog'] as const)('catálogo %s mantém o anúncio de materiais e não permite incluir produto antes dos dados', mode => {
    const { container } = render(<PdvCatalogSkeleton mode={mode} />);
    expect(screen.getByRole('status', { name: 'Carregando materiais' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(container.querySelector('button,input,[tabindex]')).toBeNull();
  });

  it('deixa de anunciar carregamento quando a tela recebe os dados', () => {
    const { rerender } = render(<PdvPageSkeleton variant="list-detail" label="Carregando pedidos" />);
    rerender(<div><h2>Pedido #11</h2><button>Abrir pedido</button></div>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir pedido' })).toBeEnabled();
  });
});
