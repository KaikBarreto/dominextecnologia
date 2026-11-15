import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import './PdvDraftSyncNotice.css';

export interface PdvDraftVersionSummary {
  title: string;
  details: string;
  notes?: string;
  updatedAt?: string;
}
export interface PdvDraftConflict {
  id: string;
  label: string;
  local: PdvDraftVersionSummary | null;
  server: PdvDraftVersionSummary | null;
  alternativesCount: number;
  requiresOrderReview: boolean;
  orderId: string | null;
}
export type PdvDraftResolveResult = 'resolved' | 'refresh_required' | 'review_order' | 'unavailable' | 'not_found';
export interface PdvDraftSyncNoticeProps {
  issue: 'conflict' | 'unavailable' | null;
  localPersistenceIssue: boolean;
  resolvingDraftId: string | null;
  conflicts: PdvDraftConflict[];
  onResolve: (id: string, choice: 'local' | 'server') => Promise<PdvDraftResolveResult>;
  onRetry: () => void;
  onReviewOrder?: (id: string) => void;
}

function updatedLabel(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function Version({ title, version, empty }: { title: string; version: PdvDraftVersionSummary | null; empty: string }) {
  const date = updatedLabel(version?.updatedAt);
  return <section className="pdv-draft-version" aria-label={title}>
    <h4>{title}</h4>
    {version ? <><strong>{version.title}</strong><p>{version.details}</p>{version.notes && <p className="pdv-draft-notes">{version.notes}</p>}{date && <small>Atualizada em {date}</small>}</> : <p>{empty}</p>}
  </section>;
}

/** Presentation only. Persistence, scope and preservation of alternative copies belong to the caller. */
export function PdvDraftSyncNotice({ issue, localPersistenceIssue, resolvingDraftId, conflicts, onResolve, onRetry, onReviewOrder }: PdvDraftSyncNoticeProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<{ id: string; text: string } | null>(null);
  const [reviewRequired, setReviewRequired] = useState<Set<string>>(() => new Set());
  const lock = useRef(false);
  const currentConflicts = useRef(conflicts);
  currentConflicts.current = conflicts;
  const busy = pendingId !== null || resolvingDraftId !== null;
  const visible = conflicts.filter(conflict => !completed.has(conflict.id));
  const selected = visible.find(conflict => conflict.id === selectedId) ?? visible[0];
  const mustReview = selected && (selected.requiresOrderReview || reviewRequired.has(selected.id));

  useEffect(() => {
    if (open && visible.length === 0) setOpen(false);
  }, [open, visible.length]);

  if (!issue && !localPersistenceIssue && conflicts.length === 0) return null;

  function openReview() {
    setCompleted(new Set()); setFeedback(null); setSelectedId(null); setOpen(true);
  }
  async function resolve(conflict: PdvDraftConflict, choice: 'local' | 'server') {
    if (busy || lock.current || conflict.requiresOrderReview || reviewRequired.has(conflict.id)) return;
    lock.current = true; setPendingId(conflict.id); setFeedback(null);
    try {
      const result = await onResolve(conflict.id, choice);
      if (result === 'resolved') {
        const done = new Set(completed); done.add(conflict.id); setCompleted(done);
        const next = currentConflicts.current.find(item => !done.has(item.id));
        setSelectedId(next?.id ?? null);
        if (!next) setOpen(false);
      } else if (result === 'refresh_required') {
        setFeedback({ id: conflict.id, text: 'Este atendimento mudou novamente. Confira as versões atualizadas antes de escolher.' });
      } else if (result === 'review_order') {
        setReviewRequired(previous => new Set([...previous, conflict.id]));
        setFeedback({ id: conflict.id, text: 'Este atendimento já tem um pedido. Confira o pedido antes de continuar.' });
      } else if (result === 'not_found') {
        setFeedback({ id: conflict.id, text: 'Esta versão não está mais disponível para revisão. Atualize a conferência.' });
      } else {
        setFeedback({ id: conflict.id, text: 'Não foi possível concluir a escolha agora. Mantenha esta aba aberta e tente novamente.' });
      }
    } catch {
      setFeedback({ id: conflict.id, text: 'Não foi possível concluir a escolha agora. Mantenha esta aba aberta e tente novamente.' });
    } finally { lock.current = false; setPendingId(null); }
  }

  return <div className="pdv-draft-sync">
    {localPersistenceIssue && <NoticeBanner variant="destructive">Não foi possível guardar uma cópia neste dispositivo. Mantenha esta aba aberta até sincronizar.</NoticeBanner>}
    {(issue || conflicts.length > 0) && <NoticeBanner variant={issue === 'unavailable' ? 'destructive' : 'info'} icon={issue === 'unavailable' ? CloudOff : undefined}
      action={<div className="pdv-draft-notice-actions">{conflicts.length > 0 && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={openReview}>Revisar versões</Button>}<Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</Button></div>}>
      {issue === 'unavailable' ? 'Não foi possível sincronizar este atendimento com a conta. Mantenha esta aba aberta e tente novamente.' : conflicts.length > 0 ? 'Há versões diferentes de atendimentos. Confira qual deseja continuar.' : 'Há uma diferença entre esta aba e a conta. Atualize a conferência para revisar.'}
    </NoticeBanner>}
    {localPersistenceIssue && !issue && conflicts.length === 0 && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</Button>}
    <ResponsiveModal open={open} onOpenChange={next => { if (!busy) setOpen(next); }} title="Revisar versões" description="Compare os atendimentos antes de escolher qual continuar." density="compact" className="max-w-4xl" bodyClassName="pdv-draft-modal-body"
      footer={<Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>}>
      {selected && <div className="pdv-draft-review" data-detail={selectedId !== null || visible.length === 1 || undefined} aria-busy={busy}>
        <nav className="pdv-draft-conflicts" aria-label="Atendimentos com versões diferentes">
          {visible.map(conflict => <button key={conflict.id} type="button" disabled={busy} aria-current={conflict.id === selected.id ? 'true' : undefined} onClick={() => { setSelectedId(conflict.id); setFeedback(null); }}><strong>{conflict.label}</strong><small>{conflict.requiresOrderReview || reviewRequired.has(conflict.id) ? (conflict.orderId ? 'Conferir pedido existente' : 'Conferir última tentativa') : conflict.local === null ? 'Fechamento pendente' : 'Comparar versões'}</small></button>)}
        </nav>
        <div className="pdv-draft-comparison">
          {visible.length > 1 && <Button type="button" variant="ghost" size="sm" disabled={busy} className="pdv-draft-back" onClick={() => setSelectedId(null)}><ArrowLeft className="h-4 w-4" />Voltar aos atendimentos</Button>}
          <h3>{selected.label}</h3>
          {feedback?.id === selected.id && <NoticeBanner variant="warning">{feedback.text}</NoticeBanner>}
          <div className="pdv-draft-versions">
            <Version title="Nesta aba" version={selected.local} empty="O fechamento deste atendimento foi solicitado nesta aba." />
            <Version title="Na conta" version={selected.server} empty="Não há uma versão deste atendimento disponível na conta." />
          </div>
          {selected.alternativesCount > 0 && <p className="pdv-draft-secondary">Há {selected.alternativesCount === 1 ? 'mais uma cópia deste atendimento' : `mais ${selected.alternativesCount} cópias deste atendimento`} para conferência.</p>}
          {mustReview ? <div className="pdv-draft-decision"><p>{selected.orderId ? 'Este atendimento já tem um pedido. Confira esse pedido antes de escolher outra versão.' : 'A última tentativa precisa ser conferida em Pedidos antes de escolher outra versão.'}</p>{onReviewOrder && selected.orderId ? <Button type="button" disabled={busy} onClick={() => onReviewOrder(selected.orderId!)}>Revisar pedido existente</Button> : <p className="pdv-draft-secondary">Procure o atendimento na lista de pedidos para continuar a conferência.</p>}</div> : <div className="pdv-draft-decision">
            <p>{selected.local === null ? 'Ao confirmar o fechamento, a versão da conta será mantida como cópia.' : 'Ao escolher, a outra versão será mantida como cópia.'}</p>
            <div className="pdv-draft-choice-actions"><Button type="button" disabled={busy} onClick={() => resolve(selected, 'local')}>{pendingId === selected.id && <Loader2 className="h-4 w-4 animate-spin" />}{selected.local === null ? 'Confirmar fechamento' : 'Manter versão desta aba'}</Button><Button type="button" variant="outline" disabled={busy || selected.server === null} onClick={() => resolve(selected, 'server')}>Usar versão da conta</Button></div>
          </div>}
        </div>
      </div>}
    </ResponsiveModal>
  </div>;
}
