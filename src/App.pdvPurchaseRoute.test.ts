import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizedTemplatesFor, resolveAppSlug } from '@/lib/i18n/appRouteSlugs';

describe('rota da Nova Compra do PDV', () => {
  it('registra todas as variantes localizadas com a base pt-BR preservada', () => {
    expect(localizedTemplatesFor('pdvPurchase')).toEqual([
      '/pdv/compra',
      '/pos/purchase',
      '/pos/compra',
      '/pos/achat',
    ]);
    expect(resolveAppSlug('/pdv/compra', 'en')).toBe('pdvPurchase');
    expect(resolveAppSlug('/pos/purchase', 'en')).toBe('pdvPurchase');
  });

  it('usa os mesmos gates de módulo e tela do operador de caixa', () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');
    expect(source).toContain('const PdvPurchase = React.lazy(() => import("./pages/PdvPurchase"));');
    expect(source).toContain("localizedAppRoutes('pdvPurchase', <ModuleRoute moduleKey=\"pdv\"><PermissionRoute screenKey=\"screen:pdv\"><PdvPurchase /></PermissionRoute></ModuleRoute>)");
  });
});
