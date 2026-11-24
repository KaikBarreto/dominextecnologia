import { describe, expect, it, vi } from 'vitest';
import { preparePdvStageReceiptAuto } from './stageAuto';

function setup(autoPrint = true) {
  const target = { close: vi.fn(), closed: false } as unknown as Window;
  const openPending = vi.fn(() => target);
  const notify = vi.fn();
  const seen = new Set<string>();
  const prepare = () => preparePdvStageReceiptAuto({ policy: { autoPrint, format: '58mm', copies: 3 }, openPending, seen, notify });
  return { prepare, target, openPending, notify };
}

describe('comprovante automático de etapa confirmada', () => {
  it('não gera antes da confirmação e abre uma única vez com formato e três vias no mesmo PDF', async () => {
    const { prepare, openPending } = setup();
    const open = vi.fn();
    const attempt = prepare();
    expect(openPending).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    await attempt.commit('delivery:evento-parcial-1', open);
    await attempt.commit('delivery:evento-parcial-1', open);
    await prepare().commit('delivery:evento-parcial-1', open);
    expect(open).toHaveBeenCalledExactlyOnceWith('58mm', { target: expect.anything(), copies: 3 });
    await prepare().commit('delivery:evento-parcial-2', open);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('não abre aba quando desativado, nem gera em falha ou replay da operação', async () => {
    const disabled = setup(false);
    const open = vi.fn();
    await disabled.prepare().commit('sale:1', open);
    expect(disabled.openPending).not.toHaveBeenCalled();
    const enabled = setup();
    const failed = enabled.prepare();
    failed.cancel();
    await failed.commit('sale:2', open);
    await enabled.prepare().commit('sale:3', open, true);
    expect(open).not.toHaveBeenCalled();
    expect(enabled.target.close).toHaveBeenCalledTimes(2);
  });

  it('informa abertura manual quando popup bloqueado sem alegar impressão', async () => {
    const notify = vi.fn();
    const open = vi.fn();
    const attempt = preparePdvStageReceiptAuto({ policy: { autoPrint: true, format: 'a4', copies: 1 }, openPending: () => null, seen: new Set(), notify });
    await attempt.commit('budget:1:revision2', open);
    expect(open).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('blocked');
  });

  it('isola falha do PDF da operação já confirmada e fecha placeholder', async () => {
    const { prepare, target, notify } = setup();
    await expect(prepare().commit('sale:4', async () => { throw new Error('pdf'); })).resolves.toBeUndefined();
    expect(target.close).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith('failed');
  });
});
