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
    expect(buildServiceReportPdfFilename({ orderNumber: 1234, customerName: 'Cliente XPTO' }))
      .toBe('Relatório de Serviço - OS 001234 - Cliente XPTO.pdf');
  });

  it('remove caracteres invalidos de arquivo sem perder o nome legivel', () => {
    expect(buildServiceReportPdfFilename({ orderNumber: 7, customerName: 'Loja / Centro: Sul' }))
      .toBe('Relatório de Serviço - OS 000007 - Loja Centro Sul.pdf');
  });

  it.each([null, undefined, '', '   ', 'OS-legada'])('nao transforma numero ausente ou invalido em OS 000000', (orderNumber) => {
    expect(buildServiceReportPdfFilename({ orderNumber, customerName: 'Cliente XPTO' }))
      .toBe('Relatório de Serviço - OS sem-numero - Cliente XPTO.pdf');
  });
});

describe('buildCertificateConformityPdfFilename', () => {
  it('monta nome legivel e remove caracteres invalidos', () => {
    expect(buildCertificateConformityPdfFilename({
      orderNumber: 1234,
      customerName: 'Cliente / Unidade: Sul',
    })).toBe('Certificado de Conformidade - OS 001234 - Cliente Unidade Sul.pdf');
  });

  it('usa fallback legivel quando o numero da OS nao existe', () => {
    expect(buildCertificateConformityPdfFilename({ orderNumber: null, customerName: 'Cliente XPTO' }))
      .toBe('Certificado de Conformidade - OS sem-numero - Cliente XPTO.pdf');
  });
});
