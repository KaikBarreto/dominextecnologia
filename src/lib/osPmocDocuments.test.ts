import { describe, expect, it } from 'vitest';
import {
  buildCertificateConformityPdfFilename,
  buildServiceReportPdfFilename,
  canGenerateOsPmocDocuments,
} from './osPmocDocuments';

describe('canGenerateOsPmocDocuments', () => {
  it('libera OS concluida quando refrigeracao esta entre varios segmentos', () => {
    expect(canGenerateOsPmocDocuments(
      { status: 'concluida', entry_type: 'os' },
      ['eletrica', 'refrigeracao'],
    )).toBe(true);
  });

  it('aceita o segmento legado quando o array multiplo ainda nao existe', () => {
    expect(canGenerateOsPmocDocuments(
      { status: 'concluida', entry_type: null },
      null,
      'refrigeracao',
    )).toBe(true);
  });

  it.each([
    [{ status: 'concluida', entry_type: 'tarefa' }, ['refrigeracao'], null],
    [{ status: 'pausada', entry_type: 'os' }, ['refrigeracao'], null],
    [{ status: 'cancelada', entry_type: 'os' }, ['refrigeracao'], null],
    [{ status: 'concluida', entry_type: 'os' }, ['eletrica'], null],
    [{ status: 'concluida', entry_type: 'os' }, null, null],
  ] as const)('falha fechado para registro/segmento inelegivel', (order, segments, legacySegment) => {
    expect(canGenerateOsPmocDocuments(order, segments, legacySegment)).toBe(false);
  });
});

describe('buildServiceReportPdfFilename', () => {
  it('monta nome legivel com numero da OS e cliente', () => {
    expect(buildServiceReportPdfFilename({ orderNumber: 1234, customerName: 'Cliente XPTO', generatedAt: '2026-11-07T12:00:00Z', timeZone: 'America/Sao_Paulo' }))
      .toBe('Relatório de Serviço - OS 001234 - Cliente XPTO - 07 NOV 2026.pdf');
  });

  it('remove caracteres invalidos de arquivo sem perder o nome legivel', () => {
    expect(buildServiceReportPdfFilename({ orderNumber: 7, customerName: 'Loja / Centro: Sul', generatedAt: '2026-11-07T12:00:00Z' }))
      .toBe('Relatório de Serviço - OS 000007 - Loja Centro Sul - 07 NOV 2026.pdf');
  });

  it.each([null, undefined, '', '   ', 'OS-legada'])('nao transforma numero ausente ou invalido em OS 000000', (orderNumber) => {
    expect(buildServiceReportPdfFilename({ orderNumber, customerName: 'Cliente XPTO', generatedAt: '2026-11-07T12:00:00Z' }))
      .toBe('Relatório de Serviço - OS sem-numero - Cliente XPTO - 07 NOV 2026.pdf');
  });
});

describe('buildCertificateConformityPdfFilename', () => {
  it('monta nome legivel e remove caracteres invalidos', () => {
    expect(buildCertificateConformityPdfFilename({
      orderNumber: 1234,
      customerName: 'Cliente / Unidade: Sul',
      generatedAt: '2026-11-07T12:00:00Z',
    })).toBe('Certificado de Conformidade - OS 001234 - Cliente Unidade Sul - 07 NOV 2026.pdf');
  });

  it('usa fallback legivel quando o numero da OS nao existe', () => {
    expect(buildCertificateConformityPdfFilename({ orderNumber: null, customerName: 'Cliente XPTO', generatedAt: '2026-11-07T12:00:00Z' }))
      .toBe('Certificado de Conformidade - OS sem-numero - Cliente XPTO - 07 NOV 2026.pdf');
  });

  it('respeita o dia civil do fuso da empresa', () => {
    expect(buildCertificateConformityPdfFilename({
      orderNumber: 1,
      customerName: 'Cliente',
      generatedAt: '2026-11-08T01:30:00Z',
      timeZone: 'America/Sao_Paulo',
    })).toContain('07 NOV 2026.pdf');
  });
});
