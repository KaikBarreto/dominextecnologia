import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  interaction_type: string;
  description: string | null;
  created_at: string;
  created_by?: string | null;
  author_name?: string | null;
}

interface CrmActivityFeedProps {
  interactions: ActivityItem[];
  onAddComment: (text: string) => Promise<unknown> | void;
  isSaving?: boolean;
  resolveAuthor?: (item: ActivityItem) => string | null | undefined;
  className?: string;
}

export function CrmActivityFeed({ interactions, onAddComment, isSaving, resolveAuthor, className }: CrmActivityFeedProps) {
  const [comment, setComment] = useState('');
  const submit = async () => {
    const text = comment.trim();
    if (!text) return;
    await onAddComment(text);
    setComment('');
  };

  return (
    <aside className={cn('flex min-h-[360px] flex-col bg-muted/20 p-4 lg:min-h-0 lg:p-5', className)} aria-label="Comentários e atividades">
      <h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" /> Comentários e atividades</h3>
      <div className="mt-3 space-y-2">
        <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escreva um comentário..." rows={3} />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!comment.trim() || isSaving}><Send className="mr-1.5 h-3.5 w-3.5" /> Comentar</Button>
        </div>
      </div>
      <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
        {interactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        ) : interactions.map((item) => {
          const author = resolveAuthor?.(item) || item.author_name || 'Equipe';
          return (
            <article key={item.id} className="rounded-xl bg-background p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground">{author}</span>
                <time className="shrink-0">{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.description || 'Atividade registrada'}</p>
              {item.interaction_type !== 'comentario' && <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{item.interaction_type.replaceAll('_', ' ')}</p>}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
