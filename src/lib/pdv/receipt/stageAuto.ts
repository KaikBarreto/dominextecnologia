import type { PdvReceiptFormat } from './model';
import type { StageReceiptPolicy } from './stagePolicy';

export interface PdvStageReceiptOpenOptions {
  target: Window;
  copies: 1 | 2 | 3;
}

/** Somente a confirmação do writer pode consumir uma tentativa. Abrir detalhes não a dispara. */
export function preparePdvStageReceiptAuto({
  policy, openPending, seen, notify,
}: {
  policy: StageReceiptPolicy;
  openPending: () => Window | null;
  seen: Set<string>;
  notify: (reason: 'blocked' | 'failed') => void;
}) {
  let target: Window | null = null;
  if (policy.autoPrint) {
    try { target = openPending(); }
    catch { /* O navegador não pode impedir a confirmação da operação. */ }
  }
  let consumed = false;
  return {
    cancel() { if (!consumed) target?.close(); consumed = true; },
    async commit(
      eventKey: string,
      open: (format: PdvReceiptFormat, options: PdvStageReceiptOpenOptions) => Promise<void> | void,
      replayed = false,
    ) {
      if (consumed) return;
      consumed = true;
      if (!policy.autoPrint || replayed || seen.has(eventKey)) { target?.close(); return; }
      seen.add(eventKey);
      if (!target || target.closed) {
        target?.close();
        // O aviso vem após o toast de confirmação da operação, que usa o mesmo slot.
        await Promise.resolve();
        notify('blocked');
        return;
      }
      try { await open(policy.format, { target, copies: policy.copies }); }
      catch { target.close(); notify('failed'); }
    },
  };
}
