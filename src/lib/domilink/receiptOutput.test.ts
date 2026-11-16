import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printDomiLinkReceipt } from './receiptOutput';
import { readDomiLinkReceiptPrinter, writeDomiLinkEnabled, writeDomiLinkReceiptPrinter, writeDomiLinkSession } from './storage';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), queue: vi.fn(), wait: vi.fn() }));
vi.mock('./client', async importOriginal => ({ ...await importOriginal<typeof import('./client')>(), loadDomiLinkProfile: mocks.profile, queueDomiLinkDocumentPrint: mocks.queue, waitForDomiLinkPrintJob: mocks.wait }));
const scope = { userId: 'user-A', companyId: 'company-A' };
const printer = { id: 'printer-A', kind: 'printer', online: true, capabilities: { print_formats: ['pdf'] } };

describe('destino local dos comprovantes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
    writeDomiLinkEnabled(true); writeDomiLinkSession('fixture-session', scope);
    mocks.profile.mockResolvedValue({ devices: [printer] });
    mocks.queue.mockResolvedValue({ job: { id: 'job-A', status: 'queued' } });
    mocks.wait.mockResolvedValue({ id: 'job-A', status: 'completed' });
  });
  it('mantém PDF como padrão sem fazer requisições locais', async () => {
    expect(await printDomiLinkReceipt(new Blob(), scope, () => undefined)).toBe(false);
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it('imprime na escolha explícita do usuário/empresa e espera o resultado', async () => {
    writeDomiLinkReceiptPrinter(scope, 'printer-A');
    expect(await printDomiLinkReceipt(new Blob(), scope, () => undefined)).toBe(true);
    expect(mocks.queue).toHaveBeenCalledOnce(); expect(mocks.wait).toHaveBeenCalledOnce();
  });
  it('não herda impressora nem token entre usuários ou empresas', async () => {
    writeDomiLinkReceiptPrinter(scope, 'printer-A');
    const other = { ...scope, companyId: 'company-B' };
    expect(readDomiLinkReceiptPrinter(other)).toBeNull();
    expect(readDomiLinkReceiptPrinter({ ...scope, userId: 'user-B' })).toBeNull();
    expect(await printDomiLinkReceipt(new Blob(), other, () => undefined)).toBe(false);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('não imprime se o contexto muda durante a consulta de dispositivos', async () => {
    writeDomiLinkReceiptPrinter(scope, 'printer-A');
    let valid = true; mocks.profile.mockImplementation(async () => { valid = false; return { devices: [printer] }; });
    await expect(printDomiLinkReceipt(new Blob(), scope, () => { if (!valid) throw new Error('mudou'); })).rejects.toThrow('mudou');
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('não troca para outra impressora quando a escolhida está desconectada', async () => {
    writeDomiLinkReceiptPrinter(scope, 'printer-A'); mocks.profile.mockResolvedValue({ devices: [{ ...printer, online: false }] });
    await expect(printDomiLinkReceipt(new Blob(), scope, () => undefined)).rejects.toThrow(/desconectada/);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
