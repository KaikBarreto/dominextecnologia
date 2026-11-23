import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

import {
  buildPmocDocumentDownloadName,
  requestPmocDocumentDownloadUrl,
} from './usePmocDocuments';

beforeEach(() => {
  invokeMock.mockReset();
});

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

describe('requestPmocDocumentDownloadUrl', () => {
  const contractId = 'a1111111-1111-4111-8111-111111111111';
  const documentId = 'a2222222-2222-4222-8222-222222222222';

  it('pede a URL pelo ID canônico sem enviar o caminho privado do bucket', async () => {
    invokeMock.mockResolvedValue({
      data: { url: 'https://backend.example.invalid/storage/signed/documento' },
      error: null,
    });

    await expect(requestPmocDocumentDownloadUrl({
      id: documentId,
      contract_id: contractId,
    }, contractId)).resolves.toBe('https://backend.example.invalid/storage/signed/documento');

    expect(invokeMock).toHaveBeenCalledWith('pmoc-document-download', {
      body: { documentId, contractId },
    });
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain('pdf_storage_path');
  });

  it('bloqueia localmente documento de outro contrato', async () => {
    await expect(requestPmocDocumentDownloadUrl({
      id: documentId,
      contract_id: 'a3333333-3333-4333-8333-333333333333',
    }, contractId)).rejects.toThrow('Documento não pertence ao contrato aberto.');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('propaga a orientação PT-BR devolvida pela edge', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({
          error: 'Você não tem permissão para baixar documentos deste contrato.',
        }), { status: 403, headers: { 'content-type': 'application/json' } }),
      },
    });

    await expect(requestPmocDocumentDownloadUrl({
      id: documentId,
      contract_id: contractId,
    }, contractId)).rejects.toThrow('Você não tem permissão para baixar documentos deste contrato.');
  });
});
