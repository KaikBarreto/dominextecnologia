import { Check, CloudOff, FileClock, Loader2, RefreshCw } from 'lucide-react';
import type { FormDraftSaveStatus } from '@/hooks/useFormDraft';
import type { QuoteDraftPersistence, QuoteDraftSyncIssue } from '@/lib/quotes/quote-form-draft';

/** Só anuncia salvamento na conta depois da confirmação real do servidor. */
export function FormDraftStatus({ status = 'idle', savedAt, persistence = 'local', expiresAt, syncIssue, isLoading, onRetry }: {
  status?: FormDraftSaveStatus; savedAt?: number | null;
  persistence?: QuoteDraftPersistence; expiresAt?: number | null;
  syncIssue?: QuoteDraftSyncIssue; isLoading?: boolean; onRetry?: () => void;
}) {
  const conflict = syncIssue === 'conflict';
  const labels = {
    idle: ['Automático', 'Rascunho automático'],
    saving: ['Salvando…', 'Salvando…'],
    saved: ['Salvo', persistence === 'account' ? 'Salvo na sua conta' : 'Salvo neste navegador'],
    error: ['Não salvo', 'Não foi possível salvar'],
  };
  const Icon = isLoading || status === 'saving' ? Loader2 : conflict || syncIssue === 'unavailable' ? CloudOff : { idle: FileClock, saving: Loader2, saved: Check, error: CloudOff }[status];
  const time = savedAt ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(savedAt) : null;
  const expiry = expiresAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(expiresAt) : null;
  const help = conflict ? 'Este rascunho mudou em outro dispositivo. Sua edição ficou neste navegador. Recarregue para conferir a versão da conta antes de continuar.'
    : `${time ? `Último salvamento às ${time}. ` : ''}${persistence === 'account'
      ? `Disponível somente para seu usuário nesta empresa. Expira ${expiry ? `em ${expiry}` : '30 dias após a última edição'}.`
      : syncIssue === 'unavailable' ? 'Sem sincronização com a conta. O rascunho ficou neste navegador; tente sincronizar novamente.'
        : status === 'error' ? 'O navegador não conseguiu salvar o rascunho. Use Salvar rascunho para guardar na sua conta.'
          : 'O rascunho automático fica neste navegador durante esta sessão. Para guardar na sua conta, use Salvar rascunho.'}`;
  const shortLabel = isLoading ? 'Carregando…' : conflict ? 'Conferir' : syncIssue === 'unavailable' && status === 'saved' ? 'Salvo local' : labels[status][0];
  const fullLabel = isLoading ? 'Buscando rascunho…' : conflict ? 'Alterado em outro dispositivo' : labels[status][1];
  return <div className="flex items-center gap-1 sm:gap-2">
    <div data-draft-status={isLoading ? 'loading' : status} data-draft-persistence={persistence} role="status" aria-live="polite" aria-atomic="true" title={help}
      className={`flex w-24 items-center justify-end gap-1.5 text-right text-xs font-medium sm:w-56 sm:gap-2 sm:text-sm ${status === 'error' || conflict ? 'text-destructive' : 'text-muted-foreground'}`}>
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${isLoading || status === 'saving' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
      <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{fullLabel}</span>
    </div>
    {!!syncIssue && onRetry && <button type="button" onClick={onRetry} title={conflict ? 'Recarregar a versão da conta' : 'Tentar sincronizar rascunho'} aria-label={conflict ? 'Recarregar a versão da conta' : 'Tentar sincronizar rascunho'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RefreshCw className="h-4 w-4" /></button>}
  </div>;
}
