import { createDomiLinkIdempotencyKey, loadDomiLinkProfile, queueDomiLinkDocumentPrint, waitForDomiLinkPrintJob } from './client';
import { getDomiLinkSessionRevision, readDomiLinkEnabled, readDomiLinkReceiptPrinter, readDomiLinkSession, type DomiLinkSessionScope } from './storage';

/** A origem do PDF já foi autorizada pelo leitor canônico de orçamento/pedido/retirada. */
export async function printDomiLinkReceipt(blob: Blob, scope: DomiLinkSessionScope, assertCurrent: () => void) {
  assertCurrent();
  const deviceId = readDomiLinkReceiptPrinter(scope);
  if (!readDomiLinkEnabled() || !deviceId) return false;
  const revision = getDomiLinkSessionRevision();
  const token = readDomiLinkSession(scope);
  if (!token) throw new Error('Conecte o DomiLink novamente para usar a impressora.');
  const assertSession = () => {
    assertCurrent();
    if (getDomiLinkSessionRevision() !== revision) throw new Error('A conexão com o DomiLink mudou. Abra o comprovante novamente.');
  };
  const profile = await loadDomiLinkProfile(token);
  assertSession();
  const device = profile.devices.find(item => item.id === deviceId && item.kind === 'printer');
  if (!device || !device.online) throw new Error('A impressora escolhida está desconectada. Confira o DomiLink.');
  const queued = await queueDomiLinkDocumentPrint(token, device, blob, createDomiLinkIdempotencyKey(), assertSession);
  assertSession();
  await waitForDomiLinkPrintJob(token, queued.job, assertSession);
  assertSession();
  return true;
}
