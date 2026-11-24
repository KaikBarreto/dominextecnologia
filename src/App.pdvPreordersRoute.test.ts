import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizedTemplatesFor } from '@/lib/i18n/appRouteSlugs';
import { FUNCTION_PERMISSIONS } from '@/hooks/usePermissions';

describe('rota e capacidades de Orçamentos do balcão', () => {
  it('registra uma única rota localizada sem reutilizar Orçamentos', () => {
    expect(localizedTemplatesFor('pdvPreorders')).toEqual([
      '/pdv/pre-pedidos',
      '/pos/pre-orders',
      '/pos/prepedidos',
      '/pos/precommandes',
    ]);
  });

  it('aceita caixa ou pedidos e mantém os gates do módulo e do modo balcão', () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');
    expect(source).toContain('const PdvPreorders = React.lazy(() => import("./pages/PdvPreorders"));');
    expect(source).toContain(
      "localizedAppRoutes('pdvPreorders', <ModuleRoute moduleKey=\"pdv\"><PermissionRoute screenKey={['screen:pdv', 'screen:pdv_orders']}><PdvCounterModeRoute><PdvPreorders /></PdvCounterModeRoute></PermissionRoute></ModuleRoute>)",
    );
    expect(source).toContain("if (settings?.pdv_mode !== 'balcao') return <Navigate to=\"/pdv\" replace />;");
    expect(source).toContain("['screen:pdv_orders', '/pdv/pedidos']");
    expect(source).toContain("['screen:pdv_dispatch', '/pdv/expedicao']");
  });

  it('cataloga as duas ações sensíveis separadamente', () => {
    const keys = FUNCTION_PERMISSIONS.map((permission) => permission.key);
    expect(keys).toContain('fn:value_pdv_preorder');
    expect(keys).toContain('fn:convert_pdv_preorder');
  });
});
