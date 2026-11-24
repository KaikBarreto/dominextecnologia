import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, NavLink } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

// Cobre a configuração dos três menus e o comportamento do router na transição
// painel → subárea, sem carregar perfil, contas ou permissões para testar URL.
describe('seleção do Caixa na navegação do PDV', () => {
  it.each([
    ['SidebarMenuContent.tsx', "end={child.path === '/pdv'}"],
    ['MoreMenuDrawer.tsx', "end={sub.path === '/pdv'}"],
  ])('%s exige correspondência exata para o Caixa filho', (file, expression) => {
    const source = readFileSync(`${process.cwd()}/src/components/layout/${file}`, 'utf8');
    expect(source).toContain(expression);
  });

  it('o menu superior mantém seleção exata nos itens do dropdown', () => {
    const source = readFileSync(`${process.cwd()}/src/components/layout/TopNavbar.tsx`, 'utf8');
    expect(source).toContain('location.pathname === L(child.path)');
  });

  it.each(['/pdv', '/pdv/expedicao', '/pdv/pedidos', '/pdv/pre-pedidos'])('marca somente a tela aberta em %s', path => {
    const links = [
      { path: '/pdv', label: 'Caixa' },
      { path: '/pdv/expedicao', label: 'Expedição' },
      { path: '/pdv/pedidos', label: 'Pedidos' },
      { path: '/pdv/pre-pedidos', label: 'Orçamentos' },
    ];
    render(<MemoryRouter initialEntries={[path]}><nav>{links.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/pdv'}>{item.label}</NavLink>)}</nav></MemoryRouter>);
    const active = screen.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', path);
  });
});
