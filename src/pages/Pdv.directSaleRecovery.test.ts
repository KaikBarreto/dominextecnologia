import { describe, expect, it, vi } from 'vitest';
import { completeDurablePdvDirectSale, createDurablePdvDirectSaleAttempt, PDV_DIRECT_SALE_REVIEW_MESSAGE, PDV_DIRECT_SALE_SCOPE_MESSAGE } from '@/lib/pdv/directSaleRecovery';
import { createPdvSaleWorkspace, parsePdvSaleWorkspace, type PdvSaleAttempt } from '@/lib/pdv/sale-drafts';

const confirmedSale = { orderId: 'confirmed-order', orderNumber: 12, deliveryId: 'confirmed-delivery', subtotal: 25, discountAmount: 0, total: 25, idempotent: false };

describe('fronteira de recuperação da venda usada em Pdv.tsx', () => {
  it('não chama o writer antes de o servidor confirmar a identidade e persiste o pedido antes dos efeitos pós-venda', async () => {
    let finish!: (value: { server: 'saved'; localSaved: boolean }) => void;
    const persistence = new Promise<{ server: 'saved'; localSaved: boolean }>(resolve => { finish = resolve; });
    const events: string[] = [];
    const persist = vi.fn(async (attempt: PdvSaleAttempt) => {
      events.push(attempt.orderId ? 'persist-confirmed' : 'persist-intent');
      if (!attempt.orderId) return persistence;
      return { server: 'saved' as const, localSaved: true };
    });
    const complete = vi.fn(async () => { events.push('financial-write'); return confirmedSale; });
    const pending = completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist, complete,
      onConfirmed: attempt => { events.push('confirmed-ui'); expect(attempt.orderId).toBe(confirmedSale.orderId); } });
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
    expect(persist.mock.calls[0][0]).toMatchObject({ directSaleVersion: 3, idempotencyKey: expect.stringMatching(/^direct-sale-v3-/) });
    finish({ server: 'saved', localSaved: true });
    const result = await pending;
    expect(events).toEqual(['persist-intent', 'financial-write', 'persist-confirmed', 'confirmed-ui']);
    expect(result.attempt.confirmedSale).toEqual(confirmedSale);
  });

  it.each(['conflict', 'unavailable', 'scope_changed', 'not_found'] as const)('não envia a venda quando a persistência anterior retorna %s', async (server) => {
    const complete = vi.fn();
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist: async () => ({ server, localSaved: true }), complete, onConfirmed: vi.fn() })).rejects.toThrow('A venda não foi enviada');
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 'revise as versões'],
    ['scope_changed', 'contexto do caixa mudou'],
    ['not_found', 'não está mais disponível'],
    ['unavailable', 'Mantenha esta aba aberta'],
  ] as const)('orienta a recuperação específica para %s sem atribuir o erro à conexão', async (server, guidance) => {
    const complete = vi.fn();
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent',
      persist: async () => ({ server, localSaved: true }), complete, onConfirmed: vi.fn() })).rejects.toThrow(guidance);
    expect(complete).not.toHaveBeenCalled();
  });

  it('troca de contexto após a barreira impede o writer e preserva tentativa do mesmo ID no novo caixa', async () => {
    let scope = 'A';
    const draftId = 'same-draft-id';
    let attempts = new Map<string, PdvSaleAttempt>();
    const attemptB = createDurablePdvDirectSaleAttempt('cart-B', 'attempt-B');
    let finishSave!: (value: { server: 'saved'; localSaved: boolean }) => void;
    const saving = new Promise<{ server: 'saved'; localSaved: boolean }>(resolve => { finishSave = resolve; });
    const persist = vi.fn(async (attempt: PdvSaleAttempt) => {
      attempts.set(draftId, attempt);
      return saving;
    });
    const complete = vi.fn();
    const onConfirmed = vi.fn();
    const pending = completeDurablePdvDirectSale({ attempt: null, signature: 'cart-A', persist, complete, onConfirmed,
      isScopeCurrent: () => scope === 'A' });
    scope = 'B';
    attempts = new Map([[draftId, attemptB]]);
    finishSave({ server: 'saved', localSaved: true });
    await expect(pending).rejects.toThrow(PDV_DIRECT_SALE_SCOPE_MESSAGE);
    expect(complete).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledOnce();
    expect(attempts.get(draftId)).toBe(attemptB);
  });

  it('troca de contexto durante commit mantém resultado financeiro sem gravar tentativa ou UI no novo caixa', async () => {
    let scope = 'A';
    const draftId = 'same-draft-id';
    let attempts = new Map<string, PdvSaleAttempt>();
    const attemptB = createDurablePdvDirectSaleAttempt('cart-B', 'attempt-B');
    const persist = vi.fn(async (attempt: PdvSaleAttempt) => {
      attempts.set(draftId, attempt);
      return { server: 'saved' as const, localSaved: true };
    });
    let finishCommit!: (value: typeof confirmedSale) => void;
    const committing = new Promise<typeof confirmedSale>(resolve => { finishCommit = resolve; });
    const complete = vi.fn(() => committing);
    const onConfirmed = vi.fn((attempt: PdvSaleAttempt) => { attempts.set(draftId, attempt); });
    const pending = completeDurablePdvDirectSale({ attempt: null, signature: 'cart-A', persist, complete, onConfirmed,
      isScopeCurrent: () => scope === 'A' });
    await Promise.resolve();
    expect(complete).toHaveBeenCalledOnce();
    scope = 'B';
    attempts = new Map([[draftId, attemptB]]);
    finishCommit(confirmedSale);
    const result = await pending;
    expect(result.sale).toEqual(confirmedSale);
    expect(result.attempt.orderId).toBe(confirmedSale.orderId);
    expect(result.persistence.server).toBe('scope_changed');
    expect(persist).toHaveBeenCalledOnce();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(attempts.get(draftId)).toBe(attemptB);
  });

  it.each([true, false])('mantém pedido já confirmado se o sync pós-commit falhar, localSaved=%s', async (localSaved) => {
    const persist = vi.fn().mockResolvedValueOnce({ server: 'saved', localSaved: true }).mockResolvedValueOnce({ server: 'unavailable', localSaved });
    const complete = vi.fn().mockResolvedValue(confirmedSale);
    const onConfirmed = vi.fn();
    const result = await completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist, complete, onConfirmed });
    expect(result.sale.orderId).toBe(confirmedSale.orderId);
    expect(result.persistence).toEqual({ server: 'unavailable', localSaved });
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ orderId: confirmedSale.orderId }), confirmedSale);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('recupera o resultado durável após falha de upload, sem chamar novamente o writer', async () => {
    let serialized = '';
    const workspace = createPdvSaleWorkspace('2026-11-15', 'stock');
    const complete = vi.fn().mockResolvedValue(confirmedSale);
    const persist = async (attempt: PdvSaleAttempt) => {
      workspace.drafts[0].attempt = attempt;
      serialized = JSON.stringify(workspace);
      return { server: 'saved' as const, localSaved: true };
    };
    await completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist, complete, onConfirmed: vi.fn() });
    await expect(Promise.reject(new Error('upload indisponível'))).rejects.toThrow('upload');
    const restored = parsePdvSaleWorkspace(serialized, '2026-11-15', 'stock').drafts[0].attempt;
    const recovered = await completeDurablePdvDirectSale({ attempt: restored, signature: 'intent', persist, complete, onConfirmed: vi.fn() });
    expect(recovered.sale.orderId).toBe(confirmedSale.orderId);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('histórico sem chave/versionamento preserva conteúdo e exige conferência em vez de novo pedido', async () => {
    const historical = { signature: 'intent', clientRequestId: 'old-local-attempt', orderId: null };
    const persist = vi.fn(); const complete = vi.fn();
    await expect(completeDurablePdvDirectSale({ attempt: historical, signature: 'intent', persist, complete, onConfirmed: vi.fn() })).rejects.toThrow(PDV_DIRECT_SALE_REVIEW_MESSAGE);
    expect(historical).toEqual({ signature: 'intent', clientRequestId: 'old-local-attempt', orderId: null });
    expect(persist).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });

  it('não troca silenciosamente a chave ao alterar uma intenção ainda pendente', async () => {
    const attempt = createDurablePdvDirectSaleAttempt('original', 'stable-attempt');
    const complete = vi.fn();
    await expect(completeDurablePdvDirectSale({ attempt, signature: 'changed', persist: vi.fn(), complete, onConfirmed: vi.fn() })).rejects.toThrow(PDV_DIRECT_SALE_REVIEW_MESSAGE);
    expect(attempt.idempotencyKey).toBe('direct-sale-v3-stable-attempt');
    expect(complete).not.toHaveBeenCalled();
  });
  it('um efeito inesperado após o commit não apaga o resultado nem autoriza outra venda', async () => {
    const complete = vi.fn().mockResolvedValue(confirmedSale);
    const persist = vi.fn(async () => ({ server: 'saved' as const, localSaved: true }));
    const result = await completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist, complete,
      onConfirmed: () => { throw new Error('efeito pós-commit'); } });
    expect(result.attempt.orderId).toBe(confirmedSale.orderId);
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ orderId: confirmedSale.orderId }));
    await completeDurablePdvDirectSale({ attempt: result.attempt, signature: 'intent', persist, complete, onConfirmed: vi.fn() });
    expect(complete).toHaveBeenCalledOnce();
  });
});

describe('venda recusada pelo servidor não prende o atendimento', () => {
  const saved = async (_attempt: PdvSaleAttempt) => ({ server: 'saved' as const, localSaved: true });
  const refusal = new Error('O limite disponível do cliente não cobre esta venda.');
  const noAnswer = new Error('Failed to fetch');
  const isDefinitiveRejection = (error: unknown) => error === refusal;

  it('libera a tentativa criada agora quando o servidor responde recusando', async () => {
    const release = vi.fn(async () => undefined);
    const persist = vi.fn(saved);
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(persist.mock.calls[0][0]);
  });

  it('mantém a tentativa quando o envio fica sem resposta do servidor', async () => {
    const release = vi.fn();
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist: saved,
      complete: async () => { throw noAnswer; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(noAnswer);
    expect(release).not.toHaveBeenCalled();
  });

  it('nunca libera uma tentativa recuperada do navegador, mesmo com recusa', async () => {
    const release = vi.fn();
    const restored = createDurablePdvDirectSaleAttempt('intent', 'restored-after-reload');
    await expect(completeDurablePdvDirectSale({ attempt: restored, signature: 'intent', persist: saved,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    expect(release).not.toHaveBeenCalled();
  });

  it('recusa depois de um envio sem resposta não libera: o primeiro envio pode ter criado o pedido', async () => {
    const release = vi.fn();
    const persist = vi.fn(saved);
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist,
      complete: async () => { throw noAnswer; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(noAnswer);
    const attempt = persist.mock.calls[0][0];
    await expect(completeDurablePdvDirectSale({ attempt, signature: 'intent', persist,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    expect(release).not.toHaveBeenCalled();
  });

  it('dois envios simultâneos da mesma tentativa nunca a liberam', async () => {
    const release = vi.fn();
    const persist = vi.fn(saved);
    let failFirst!: (error: Error) => void;
    const first = completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist,
      complete: () => new Promise((_, reject) => { failFirst = reject; }), onConfirmed: vi.fn(), isDefinitiveRejection, release });
    await vi.waitFor(() => expect(failFirst).toBeTypeOf('function'));
    const attempt = persist.mock.calls[0][0];
    await expect(completeDurablePdvDirectSale({ attempt, signature: 'intent', persist,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    failFirst(refusal);
    await expect(first).rejects.toBe(refusal);
    expect(release).not.toHaveBeenCalled();
  });

  it('libera quando a barreira falhou antes de qualquer envio e o envio seguinte foi recusado', async () => {
    const release = vi.fn(async () => undefined);
    const complete = vi.fn(async () => { throw refusal; });
    const persist = vi.fn<(attempt: PdvSaleAttempt) => Promise<{ server: 'saved' | 'unavailable'; localSaved: boolean }>>()
      .mockResolvedValueOnce({ server: 'unavailable', localSaved: true }).mockResolvedValue({ server: 'saved', localSaved: true });
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist, complete,
      onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toThrow('A venda não foi enviada');
    expect(complete).not.toHaveBeenCalled();
    const attempt = persist.mock.calls[0][0];
    await expect(completeDurablePdvDirectSale({ attempt, signature: 'intent', persist, complete,
      onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    expect(release).toHaveBeenCalledOnce();
  });

  it('depois de liberada, a tentativa não volta a ser liberável se reaparecer', async () => {
    const release = vi.fn(async () => undefined);
    const persist = vi.fn(saved);
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    const attempt = persist.mock.calls[0][0];
    await expect(completeDurablePdvDirectSale({ attempt, signature: 'intent', persist,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release })).rejects.toBe(refusal);
    expect(release).toHaveBeenCalledOnce();
  });

  it('falha ao liberar não esconde o motivo da recusa nem troca de contexto libera outro caixa', async () => {
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist: saved,
      complete: async () => { throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection,
      release: async () => { throw new Error('storage cheio'); } })).rejects.toBe(refusal);
    let current = true;
    const release = vi.fn();
    await expect(completeDurablePdvDirectSale({ attempt: null, signature: 'intent', persist: saved,
      complete: async () => { current = false; throw refusal; }, onConfirmed: vi.fn(), isDefinitiveRejection, release,
      isScopeCurrent: () => current })).rejects.toBe(refusal);
    expect(release).not.toHaveBeenCalled();
  });
});
