import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('rota canônica da configuração do DomiLink', () => {
  it('aplica exceção restrita sem bloquear preferências pessoais protegidas pelo Settings', () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');
    expect(source).toContain("localizedAppRoutes('settings', <SettingsDomiLinkRoute><Settings /></SettingsDomiLinkRoute>)");
  });

  it('mantém somente o atalho na aba Equipamentos do PDV', () => {
    const source = readFileSync(`${process.cwd()}/src/pages/PdvSettings.tsx`, 'utf8');
    expect(source).toContain('<DomiLinkDeviceShortcut />');
    expect(source).not.toContain('DomiLinkSettingsCard');
  });
});
