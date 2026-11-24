import { useEffect, useRef } from 'react';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import type { preparePdvStageReceiptAuto } from '@/lib/pdv/receipt/stageAuto';

export interface PdvReceiptOperationGuard {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export function assertPdvReceiptOperationCurrent(guard?: Partial<PdvReceiptOperationGuard>) {
  if (guard?.signal?.aborted || guard?.isCurrent?.() === false) {
    throw new Error('O contexto do comprovante mudou. Abra o atendimento novamente.');
  }
}

/** Mantém a aba preparada vinculada à operação durante todas as etapas assíncronas. */
export async function withPdvReceiptTarget(target: Window | null | undefined, guard: Partial<PdvReceiptOperationGuard> | undefined, run: () => Promise<void>) {
  const close = () => target?.close();
  guard?.signal?.addEventListener('abort', close, { once: true });
  try { assertPdvReceiptOperationCurrent(guard); await run(); }
  catch (error) { close(); throw error; }
  finally { guard?.signal?.removeEventListener('abort', close); }
}

/** A RPC continua autorizando o documento. Este guard só impede publicação obsoleta. */
export function usePdvReceiptOperation(entityId?: string | null) {
  const scope = usePdvAuthorizedQueryScope();
  const signature = JSON.stringify([scope.key, entityId ?? null]);
  const current = useRef({ signature });
  if (current.current.signature !== signature) current.current = { signature };
  const captured = current.current;
  const mounted = useRef(true);
  const pending = useRef(new Set<AbortController>());
  const attempts = useRef(new Set<() => void>());
  useEffect(() => {
    mounted.current = true;
    const requests = pending.current, prepared = attempts.current;
    return () => {
      mounted.current = false;
      for (const request of requests) request.abort();
      requests.clear();
      for (const cancel of prepared) cancel();
      prepared.clear();
    };
  }, [signature]);
  const isCurrent = () => mounted.current && current.current === captured && scope.ready;
  return {
    ready: scope.ready,
    isCurrent,
    guardAttempt(attempt: ReturnType<typeof preparePdvStageReceiptAuto>) {
      const cancel = () => attempt.cancel();
      attempts.current.add(cancel);
      return {
        isCurrent,
        cancel() { attempts.current.delete(cancel); cancel(); },
        async commit(...args: Parameters<typeof attempt.commit>) {
          try { if (!isCurrent()) { cancel(); return; } await attempt.commit(...args); }
          finally { attempts.current.delete(cancel); }
        },
      };
    },
    async run(run: (guard: PdvReceiptOperationGuard) => Promise<void>) {
      if (!isCurrent()) return;
      const controller = new AbortController();
      pending.current.add(controller);
      try { await run({ signal: controller.signal, isCurrent }); }
      catch (error) { if (isCurrent() && !controller.signal.aborted) throw error; }
      finally { pending.current.delete(controller); }
    },
  };
}
