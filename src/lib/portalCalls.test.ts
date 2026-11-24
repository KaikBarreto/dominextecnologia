import { describe, expect, it } from 'vitest';
import {
  buildPortalCallsPath,
  isAwaitingPortalCall,
} from './portalCalls';

describe('portalCalls', () => {
  it('considera somente o estado de triagem como aguardando análise', () => {
    expect(isAwaitingPortalCall({ status: 'aguardando_analise' })).toBe(true);
    expect(isAwaitingPortalCall({ status: 'convertido' })).toBe(false);
    expect(isAwaitingPortalCall({ status: 'encerrado_sem_os' })).toBe(false);
  });

  it('gera links para a aba e para o chamado específico', () => {
    expect(buildPortalCallsPath()).toBe('/ordens-servico?aba=chamados');
    expect(buildPortalCallsPath('call-1')).toBe('/ordens-servico?aba=chamados&chamado=call-1');
  });
});
