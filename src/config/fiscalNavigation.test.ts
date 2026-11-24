import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fiscalNavigationItem } from '@/config/fiscalNavigation';
import { localizeAppPath, resolveAppSlug } from '@/lib/i18n/appRouteSlugs';

const expectedPaths = [
  '/notas-fiscais/nfe',
  '/notas-fiscais/nfce',
  '/notas-fiscais/nfse',
  '/notas-fiscais/estoque-fiscal',
  '/notas-fiscais/cenarios',
  '/notas-fiscais/configuracoes',
];

describe('supermenu Fiscal', () => {
  it('expõe as seis áreas fiscais na ordem operacional, sem duplicar relatório e estoque', () => {
    expect(fiscalNavigationItem.title).toBe('Fiscal');
    expect(fiscalNavigationItem.screenKey).toBe('screen:fiscal_notes');
    expect(fiscalNavigationItem.moduleKey).toBe('nfe');
    expect(fiscalNavigationItem.children.map((item) => item.path)).toEqual(expectedPaths);
    expect(fiscalNavigationItem.children.map((item) => item.title)).toContain('Relatório/Estoque Fiscal');
    expect(fiscalNavigationItem.children.map((item) => item.title)).not.toContain('Relatórios Fiscais');
  });

  it.each(['SidebarMenuContent.tsx', 'MoreMenuDrawer.tsx', 'TopNavbar.tsx'])('%s consome a fonte única', (file) => {
    const source = readFileSync(`${process.cwd()}/src/components/layout/${file}`, 'utf8');
    expect(source).toContain("import { fiscalNavigationItem } from '@/config/fiscalNavigation';");
    expect(source).toContain('fiscalNavigationItem,');
    expect(source).not.toContain("title: 'Notas Fiscais', icon: Receipt");
  });

  it.each(expectedPaths)('resolve %s e mantém variante localizada navegável', (path) => {
    const key = resolveAppSlug(path, 'pt-br');
    expect(key).toMatch(/^fiscal/);
    const localized = localizeAppPath(path, 'en');
    expect(resolveAppSlug(localized, 'en')).toBe(key);
  });

  it('mantém a raiz antiga apenas como redirecionamento para NF-e', () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');
    expect(source).toContain("localizedTemplatesFor('fiscalNotes').map");
    expect(source).toContain('to="/notas-fiscais/nfe" replace');
    expect(source).toContain("localizedAppRoutes('fiscalNfe'");
    expect(source).toContain("localizedAppRoutes('fiscalScenarios'");
    expect(source).toContain("localizedTemplatesFor('fiscalReports').map");
    expect(source).toContain('to="/notas-fiscais/estoque-fiscal" replace');
  });
});
