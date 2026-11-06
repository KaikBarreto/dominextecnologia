import { describe, expect, it } from 'vitest';
import {
  NFSE_MUTABLE_CONFIRMATION_TTL_MS,
  nfseNeedsOfficialRefresh,
  resolveNfseDisplayStatus,
} from './nfseStatusTruth';

const NOW = Date.parse('2026-11-01T20:00:00.000Z');

describe('verdade temporal do status NFS-e', () => {
  it('não apresenta autorização sem prova oficial', () => {
    expect(resolveNfseDisplayStatus({ status: 'autorizada' }, NOW))
      .toBe('confirmacao_pendente');
  });

  it('aceita autorização confirmada recentemente', () => {
    expect(resolveNfseDisplayStatus({
      status: 'autorizada',
      status_fiscal_confirmado: true,
      status_fiscal_confirmado_em: new Date(NOW - 60_000).toISOString(),
    }, NOW)).toBe('autorizada');
  });

  it('mantém autorização comprovada visível e pede nova consulta quando a prova envelhece', () => {
    const emission = {
      status: 'autorizada',
      status_fiscal_confirmado: true,
      status_fiscal_confirmado_em: new Date(NOW - NFSE_MUTABLE_CONFIRMATION_TTL_MS - 1).toISOString(),
    };
    expect(resolveNfseDisplayStatus(emission, NOW)).toBe('autorizada');
    expect(nfseNeedsOfficialRefresh(emission, NOW)).toBe(true);
  });

  it('não consulta novamente uma autorização confirmada recentemente', () => {
    const emission = {
      status: 'autorizada',
      status_fiscal_confirmado: true,
      status_fiscal_confirmado_em: new Date(NOW - 60_000).toISOString(),
    };
    expect(nfseNeedsOfficialRefresh(emission, NOW)).toBe(false);
  });

  it('apresenta como falha a tentativa rejeitada antes de gerar documento fiscal', () => {
    const emission = {
      status: 'rejeitada',
      status_fiscal_confirmado: false,
      status_fiscal_confirmado_em: null,
      chave_acesso: null,
      error_message: 'Falha de validação antes da emissão',
    };
    expect(resolveNfseDisplayStatus(emission, NOW)).toBe('falhou');
    expect(nfseNeedsOfficialRefresh(emission, NOW)).toBe(false);
  });

  it('aguarda confirmação quando uma rejeição possui identidade fiscal mas ainda não foi confirmada', () => {
    const emission = {
      status: 'rejeitada',
      status_fiscal_confirmado: false,
      chave_acesso: 'chave-fiscal',
      error_message: 'Rejeição retornada pelo ambiente fiscal',
    };
    expect(resolveNfseDisplayStatus(emission, NOW)).toBe('confirmacao_pendente');
    expect(nfseNeedsOfficialRefresh(emission, NOW)).toBe(true);
  });

  it('mantém cancelamento comprovado sem expirar', () => {
    expect(resolveNfseDisplayStatus({
      status: 'cancelada',
      status_fiscal_confirmado: true,
      status_fiscal_confirmado_em: '2025-01-01T00:00:00.000Z',
    }, NOW)).toBe('cancelada');
  });
});
