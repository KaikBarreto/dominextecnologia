import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FUNCTION_PERMISSIONS } from '@/hooks/usePermissions';

describe('rota e menus da expedição W3', () => {
  it('protege a rota com módulo e permissão próprios', () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');
    expect(source).toContain("localizedAppRoutes('pdvDispatch'");
    expect(source).toContain('screenKey="screen:pdv_dispatch"');
    expect(source).toContain('<ModuleRoute moduleKey="pdv">');
    expect(source).toContain('<PdvDispatchModeRoute><PdvDispatch /></PdvDispatchModeRoute>');
    expect(source).toContain("settings.pdv_fulfillment_mode !== 'dispatch'");
  });

  it('separa Orçamentos, Pedidos e Expedição por permissão no menu', () => {
    for (const file of ['./components/layout/SidebarMenuContent.tsx', './components/layout/MoreMenuDrawer.tsx', './components/layout/TopNavbar.tsx']) {
      const source = readFileSync(`${process.cwd()}/src/${file.replace('./', '')}`, 'utf8');
      expect(source).toContain("requiresPdvCounter: true");
      expect(source).toContain("settings?.pdv_mode !== 'balcao'");
      expect(source).toContain("title: 'Orçamentos'");
      expect(source).toContain("screenKeys: ['screen:pdv', 'screen:pdv_orders']");
      expect(source).toContain("title: 'Pedidos'");
      expect(source).toContain("path: '/pdv/pedidos'");
      expect(source).toContain("title: 'Expedição'");
      expect(source).toContain("path: '/pdv/expedicao'");
      expect(source).toContain("screenKey: 'screen:pdv_dispatch'");
      expect(source).not.toContain("screenKeys: ['screen:pdv', 'screen:pdv_orders', 'screen:pdv_dispatch']");
    }
  });

  it('cataloga cobertura, configuração e entrega como capacidades separadas', () => {
    const keys = FUNCTION_PERMISSIONS.map((permission) => permission.key);
    expect(keys).toEqual(expect.arrayContaining(['fn:cover_pdv_order', 'fn:deliver_pdv_order', 'fn:manage_pdv_settings']));
  });
});
