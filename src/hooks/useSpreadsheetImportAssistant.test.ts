import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), rpc: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/imports', () => ({
  parseEntityImportWorkbook: mocks.parse,
  downloadDominexImportTemplate: mocks.download,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import { createSpreadsheetImportGateway } from './useSpreadsheetImportAssistant';

function spreadsheet(name = 'clientes.xlsx'): File {
  const file = new File(['conteudo'], name);
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
  return file;
}

const parsedCustomer = {
  rows: [{
    rowNumber: 2, sourceId: null, externalId: null, name: 'Cliente Exemplo', customerType: 'pj',
    document: '123', companyName: null, tradeName: null, email: null, phone: null,
    mobile: null, contactName: null, address: null, addressNumber: null, complement: null,
    neighborhood: null, city: null, state: null, zipCode: null, notes: null, origin: null,
    stateRegistration: null, municipalRegistration: null, latitude: null, longitude: null,
    active: true, registeredAt: null, lastVisitAt: null,
  }],
  errors: [], warnings: [],
  source: { provider: 'dominex', entity: 'customers', sheetName: 'Dados', headerRow: 1, skippedDescriptionRows: [] },
  fileHash: 'a'.repeat(64), canonicalHash: 'b'.repeat(64),
};

describe('createSpreadsheetImportGateway', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recusa arquivo fora dos formatos permitidos', async () => {
    const gateway = createSpreadsheetImportGateway(new QueryClient());
    await expect(gateway.prepare({ entity: 'customers', source: 'dominex', file: spreadsheet('clientes.csv') }))
      .rejects.toThrow('.xlsx ou .xls');
  });

  it('mapeia camelCase para payload SQL e apresenta contagens do servidor', async () => {
    mocks.parse.mockResolvedValue(parsedCustomer);
    mocks.rpc.mockResolvedValueOnce({ data: {
      can_apply: true, preview_hash: 'preview-1', file_already_imported: false,
      summary: { customers: { input: 1, create: 1, update: 0, conflict: 0, blocked: 0 } },
      rows: { customers: [{ action: 'create', row_index: 1 }] },
    }, error: null });
    const gateway = createSpreadsheetImportGateway(new QueryClient());
    const preview = await gateway.prepare({ entity: 'customers', source: 'dominex', file: spreadsheet() });

    expect(preview.counts).toEqual({ create: 1, update: 0, conflict: 0, blocked: 0 });
    expect(preview.canImport).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('preview_legacy_master_data', expect.objectContaining({
      p_customers: [expect.objectContaining({ customer_type: 'pj', company_name: null })],
    }));
  });

  it('agrega milhares de avisos equivalentes sem criar milhares de alerts', async () => {
    mocks.parse.mockResolvedValue({
      ...parsedCustomer,
      warnings: Array.from({ length: 1_784 }, (_, index) => ({
        code: 'unidade_ausente', message: 'Unidade não informada; será usada a unidade padrão.', row: index + 2,
      })),
    });
    mocks.rpc.mockResolvedValueOnce({ data: {
      can_apply: true, preview_hash: 'preview-1',
      summary: { customers: { input: 1, create: 1, update: 0, conflict: 0, blocked: 0 } },
      rows: { customers: [{ action: 'create', row_index: 1 }] },
    }, error: null });
    const gateway = createSpreadsheetImportGateway(new QueryClient());
    const preview = await gateway.prepare({ entity: 'customers', source: 'dominex', file: spreadsheet() });

    expect(preview.issues).toHaveLength(1);
    expect(preview.issues[0].description).toContain('1.784 ocorrências');
    expect(preview.issues[0].description).toContain('linhas 2, 3, 4');
  });

  it('resume conflitos equivalentes devolvidos pelo servidor', async () => {
    mocks.parse.mockResolvedValue({
      ...parsedCustomer,
      rows: Array.from({ length: 50 }, (_, index) => ({
        ...parsedCustomer.rows[0], rowNumber: index + 2, name: `Cliente ${index + 1}`,
      })),
    });
    mocks.rpc.mockResolvedValueOnce({ data: {
      can_apply: false, preview_hash: 'preview-1',
      summary: { customers: { input: 50, create: 0, update: 0, conflict: 50, blocked: 0 } },
      rows: { customers: Array.from({ length: 50 }, (_, index) => ({
        action: 'conflict', row_index: index + 1, message: 'Mais de um cliente corresponde a esta linha.',
      })) },
    }, error: null });
    const gateway = createSpreadsheetImportGateway(new QueryClient());
    const preview = await gateway.prepare({ entity: 'customers', source: 'dominex', file: spreadsheet() });

    expect(preview.issues).toHaveLength(1);
    expect(preview.issues[0]).toEqual(expect.objectContaining({ severity: 'conflict', row: undefined }));
    expect(preview.issues[0].description).toContain('50 ocorrências');
    expect(preview.issues[0].description).toContain('linhas 2, 3, 4');
  });

  it('reusa o UUID da tentativa e invalida os caches após aplicar', async () => {
    mocks.parse.mockResolvedValue(parsedCustomer);
    mocks.rpc
      .mockResolvedValueOnce({ data: {
        can_apply: true, preview_hash: 'preview-1', summary: { customers: { create: 1 } },
        rows: { customers: [{ action: 'create', row_index: 1 }] },
      }, error: null })
      .mockResolvedValue({ data: {
        already_applied: false, customers: { input: 1, created: 1, updated: 0 },
      }, error: null });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const gateway = createSpreadsheetImportGateway(queryClient);
    const file = spreadsheet();
    const request = { entity: 'customers' as const, source: 'dominex' as const, file };
    const preview = await gateway.prepare(request);

    const first = await gateway.execute(request, preview);
    await gateway.execute(request, preview);
    const importCalls = mocks.rpc.mock.calls.filter(([name]) => name === 'import_legacy_master_data');

    expect(first).toEqual(expect.objectContaining({ inserted: 1, updated: 0, skipped: 0 }));
    expect(importCalls[0][1].p_client_request_id).toBe(importCalls[1][1].p_client_request_id);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory-stock-levels'] });
  });
});
