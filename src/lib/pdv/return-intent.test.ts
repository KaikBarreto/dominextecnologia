import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPdvReturnIntent, parsePdvReturnIntent, pdvReturnIntentKey, preparePdvReturnIntent, readPdvReturnIntent, updatePdvReturnIntent, type PdvReturnIntentOwner } from './return-intent';
const owner: PdvReturnIntentOwner = { companyId: 'company-a', userId: 'user-a', orderId: 'c4110000-0000-4000-8000-000000000001' };
const key = 'c4110000-0000-4000-8000-000000000002';
const args = () => ({ p_order_id: owner.orderId, p_lines: [{ delivery_item_id: 'c4110000-0000-4000-8000-000000000003', quantity: 1, destination: 'none' }], p_dispositions: [{ kind: 'customer_credit', amount: 100 }], p_occurred_on: '2026-11-16', p_reason: 'Uma unidade voltou', p_idempotency_key: key });
const summary = { itemCount: 1, total: 100 };
beforeEach(() => { localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());
describe('intenção durável de devolução', () => {
  it('persiste args/key exatos antes do envio e não expira uma pendência financeira', async () => {
    const payload = args(); const intent = await preparePdvReturnIntent(owner, payload, summary, () => {}); payload.p_lines[0].quantity = 2;
    expect(readPdvReturnIntent(owner)).toEqual(intent); expect(intent.args.p_lines).toEqual([{ delivery_item_id: 'c4110000-0000-4000-8000-000000000003', quantity: 1, destination: 'none' }]);
    updatePdvReturnIntent(intent, 'unknown'); expect(readPdvReturnIntent(owner)?.state).toBe('unknown');
    await expect(preparePdvReturnIntent(owner, { ...args(), p_idempotency_key: crypto.randomUUID() }, summary, () => {})).rejects.toThrow('mesma solicitação');
    expect(readPdvReturnIntent(owner)?.args.p_occurred_on).toBe('2026-11-16');
  });
  it('chave usa somente empresa/usuário/pedido e não permite ler owner diferente', async () => {
    const intent = await preparePdvReturnIntent(owner, args(), summary, () => {});
    for (const other of [{ ...owner, companyId: 'b' }, { ...owner, userId: 'b' }]) {
      expect(readPdvReturnIntent(other)).toBeNull(); expect(() => parsePdvReturnIntent(JSON.stringify(intent), other)).toThrow('armazenamento');
    }
    expect(pdvReturnIntentKey(owner)).not.toMatch(/permission|role|epoch/);
  });
  it('falha fechado se escrita ou readback não confirmarem persistência', async () => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, _value) { originalSet.call(this, key, '{}'); });
    await expect(preparePdvReturnIntent(owner, args(), summary, () => {})).rejects.toThrow('armazenamento');
    vi.restoreAllMocks(); localStorage.clear(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(preparePdvReturnIntent(owner, args(), summary, () => {})).rejects.toThrow('armazenamento');
  });
  it('não aceita storage adulterado, outro pedido, valor ou data malformados', async () => {
    const intent = await preparePdvReturnIntent(owner, args(), summary, () => {});
    for (const malformed of [{ ...intent, version: 2 }, { ...intent, summary: { ...summary, total: 99 } }, { ...intent, args: { ...args(), p_order_id: key } }, { ...intent, args: { ...args(), p_occurred_on: null } }, { ...intent, args: { ...args(), p_dispositions: [{ kind: 'customer_credit', amount: '100' }] } }]) expect(() => parsePdvReturnIntent(JSON.stringify(malformed), owner)).toThrow('armazenamento');
  });
  it('usa Web Lock na preparação e rejeita segunda intenção pendente', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const request = vi.fn(async (_name: string, callback: () => unknown) => callback()); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    try {
      await preparePdvReturnIntent(owner, args(), summary, () => {});
      await expect(preparePdvReturnIntent(owner, args(), summary, () => {})).rejects.toThrow('mesma solicitação');
      expect(request).toHaveBeenCalledWith(pdvReturnIntentKey(owner), expect.any(Function));
    } finally { if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else Reflect.deleteProperty(navigator, 'locks'); }
  });
  it('confirmação limpa somente o registro original e falha conhecida permite nova intenção', async () => {
    const intent = await preparePdvReturnIntent(owner, args(), summary, () => {}); updatePdvReturnIntent(intent, 'failed');
    const replacement = await preparePdvReturnIntent(owner, { ...args(), p_idempotency_key: crypto.randomUUID() }, summary, () => {});
    clearPdvReturnIntent(intent); expect(readPdvReturnIntent(owner)?.args.p_idempotency_key).toBe(replacement.args.p_idempotency_key);
    clearPdvReturnIntent(replacement); expect(readPdvReturnIntent(owner)).toBeNull();
  });
});
