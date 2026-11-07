import { Check, CloudOff, FileClock, Loader2 } from 'lucide-react';
import type { FormDraftSaveStatus } from '@/hooks/useFormDraft';

/** Estado real da persistência local; não representa salvamento na conta. */
export function FormDraftStatus({ status = 'idle', savedAt }: { status?: FormDraftSaveStatus; savedAt?: number | null }) {
  const labels = {
    idle: ['Automático', 'Rascunho automático'],
    saving: ['Salvando…', 'Salvando…'],
    saved: ['Salvo', 'Salvo neste navegador'],
    error: ['Não salvo', 'Não foi possível salvar'],
  };
  const Icon = { idle: FileClock, saving: Loader2, saved: Check, error: CloudOff }[status];
  const time = savedAt ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(savedAt) : null;
  const help = status === 'error'
    ? 'O navegador não conseguiu salvar o rascunho. Use Salvar rascunho para guardar na sua conta.'
    : `${time ? `Último salvamento às ${time}. ` : ''}O rascunho automático fica neste navegador durante esta sessão. Para guardar na sua conta, use Salvar rascunho.`;
  return <div data-draft-status={status} role="status" aria-live="polite" aria-atomic="true" title={help} className={`flex w-24 items-center justify-end gap-1.5 text-right text-xs font-medium sm:w-48 sm:gap-2 sm:text-sm ${status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
    <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${status === 'saving' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    <span className="sm:hidden">{labels[status][0]}</span><span className="hidden sm:inline">{labels[status][1]}</span>
  </div>;
}
