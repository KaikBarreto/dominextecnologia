import { describe, expect, it } from 'vitest';
import { buildPmocDocumentDownloadName } from './usePmocDocuments';

describe('buildPmocDocumentDownloadName', () => {
  it('inclui tipo, estabelecimento, data e versão em um nome legível', () => {
    expect(buildPmocDocumentDownloadName({
      doc_type: 'certificado',
      version: 4,
      generated_at: '2026-11-07T14:32:00.000Z',
    }, 'Hospital Modelo · Unidade Centro')).toBe(
      'Certificado de Conformidade - Hospital Modelo · Unidade Centro - 2026-11-07 - v4.pdf',
    );
  });

  it('remove caracteres inválidos sem expor identificador técnico como fallback', () => {
    expect(buildPmocDocumentDownloadName({
      doc_type: 'termo_rt',
      version: 1,
      generated_at: '2026-11-07T10:00:00.000Z',
    }, 'Unidade / Centro: Norte')).toBe(
      'Termo de Responsabilidade Técnica - Unidade Centro Norte - 2026-11-07 - v1.pdf',
    );
  });
});
