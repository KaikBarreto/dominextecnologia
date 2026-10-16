import { describe, expect, it } from 'vitest';
import {
  buildPortalCallsPath,
  getPortalCallSource,
  isOpenPortalCall,
  isPortalCall,
} from './portalCalls';

describe('portalCalls', () => {
  it('reconhece chamados sem confundir OS internas', () => {
    expect(isPortalCall({ origin: 'portal' })).toBe(true);
    expect(isPortalCall({ origin: 'manual' })).toBe(false);
    expect(isPortalCall({ origin: null })).toBe(false);
  });

  it('considera concluídos e cancelados como encerrados', () => {
    expect(isOpenPortalCall({ origin: 'portal', status: 'pendente' })).toBe(true);
    expect(isOpenPortalCall({ origin: 'portal', status: 'concluida' })).toBe(false);
    expect(isOpenPortalCall({ origin: 'portal', status: 'cancelada' })).toBe(false);
    expect(isOpenPortalCall({ origin: 'manual', status: 'pendente' })).toBe(false);
  });

  it('distingue a origem pelo vínculo contratual', () => {
    expect(getPortalCallSource({ contract_id: 'contract-1' })).toBe('contract');
    expect(getPortalCallSource({ contract_id: undefined })).toBe('customer');
  });

  it('gera links para a aba e para o chamado específico', () => {
    expect(buildPortalCallsPath()).toBe('/ordens-servico?aba=chamados');
    expect(buildPortalCallsPath('os-1')).toBe('/ordens-servico?aba=chamados&os=os-1');
  });
});
