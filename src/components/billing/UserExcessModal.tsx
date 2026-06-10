import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, User, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/utils/errorMessages';
import type { UserWithRole } from '@/hooks/useUsers';

export interface UserExcessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lista completa de usuários da empresa (vem de useUsers). */
  users: UserWithRole[];
  /** Auth uid do usuário logado (não pode ser removido). */
  currentUserId?: string;
  /** Novo limite de usuários do plano alvo (quantos PODEM ficar). */
  targetMaxUsers: number;
  /** Chamado após a redução concluir com sucesso — segue o downgrade. */
  onReduced: () => void;
}

/**
 * Modal de excesso de usuários no DOWNGRADE de plano.
 *
 * Contexto: cada usuário ATIVO (profiles.is_active) ocupa um slot. Para caber no
 * novo plano, o cliente ESCOLHE quem FICA (até `targetMaxUsers`) e os demais são
 * DESATIVADOS (edge `manage-user` action `deactivate_user`) — reversível: libera
 * o slot e derruba a sessão, mas NÃO exclui o usuário (login, permissões e
 * vínculos ficam intactos). Quando houver espaço de novo, dá pra reativar.
 *
 * Fluxo: escolhe quem fica → desativa os não-escolhidos AGORA → o card prossegue
 * com o downgrade (que é agendado pro fim do ciclo já pago).
 */
export function UserExcessModal({
  open,
  onOpenChange,
  users,
  currentUserId,
  targetMaxUsers,
  onReduced,
}: UserExcessModalProps) {
  const queryClient = useQueryClient();
  const [keepIds, setKeepIds] = useState<string[]>([]);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // O usuário logado é sempre mantido e nunca aparece como removível.
  const removableUsers = useMemo(
    () => users.filter((u) => u.user_id !== currentUserId),
    [users, currentUserId],
  );

  // Quantos slots sobram pra escolher, descontando o usuário logado (que fica fixo).
  const selfCount = users.some((u) => u.user_id === currentUserId) ? 1 : 0;
  const keepBudget = Math.max(0, targetMaxUsers - selfCount);

  // Pré-seleciona os primeiros `keepBudget` removíveis quando abre (escolha inicial).
  useEffect(() => {
    if (open) {
      setKeepIds(removableUsers.slice(0, keepBudget).map((u) => u.user_id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalUsers = users.length;
  const toDeactivateIds = removableUsers
    .filter((u) => !keepIds.includes(u.user_id))
    .map((u) => u.user_id);
  const deactivateCount = toDeactivateIds.length;

  // Total que vai ficar = logado + escolhidos.
  const stayingCount = selfCount + keepIds.length;
  const overBudget = keepIds.length > keepBudget;
  const canConfirm = !overBudget && stayingCount <= targetMaxUsers && deactivateCount > 0;

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const toggleKeep = (userId: string) => {
    setKeepIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      // Bloqueia selecionar além do orçamento de slots.
      if (prev.length >= keepBudget) {
        toast.warning(`Seu novo plano permite ${targetMaxUsers} usuários no total.`);
        return prev;
      }
      return [...prev, userId];
    });
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsDeactivating(true);
    try {
      // Desativação sequencial via edge (libera slot + derruba sessão; reversível).
      for (const userId of toDeactivateIds) {
        const { data: result, error } = await supabase.functions.invoke('manage-user', {
          body: { action: 'deactivate_user', user_id: userId },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
      }

      // Atualiza a contagem de usuários e as listas dependentes.
      await queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });

      toast.success(
        deactivateCount === 1
          ? 'Usuário desativado. Aplicando seu novo plano...'
          : `${deactivateCount} usuários desativados. Aplicando seu novo plano...`,
      );

      onOpenChange(false);
      onReduced();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Não foi possível desativar os usuários.'));
    } finally {
      setIsDeactivating(false);
    }
  };

  const footer = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className={cn('font-medium', overBudget ? 'text-destructive' : 'text-muted-foreground')}>
          {stayingCount}/{targetMaxUsers} permanecem
        </span>
        <span className="text-warning font-medium">
          {deactivateCount} {deactivateCount === 1 ? 'será desativado' : 'serão desativados'}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onOpenChange(false)}
          disabled={isDeactivating}
        >
          Cancelar
        </Button>
        <Button
          className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90"
          onClick={handleConfirm}
          disabled={!canConfirm || isDeactivating}
        >
          {isDeactivating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Desativando...</>
          ) : (
            `Desativar ${deactivateCount > 0 ? deactivateCount : ''} e continuar`
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => { if (!isDeactivating) onOpenChange(next); }}
      title="Você tem mais usuários do que o novo plano permite"
      className="sm:max-w-lg"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Resumo do limite */}
        <div className="flex items-start gap-2.5 rounded-lg bg-warning/10 border border-warning/30 p-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Seu novo plano permite {targetMaxUsers} usuário{targetMaxUsers !== 1 ? 's' : ''} e você tem {totalUsers} ativo{totalUsers !== 1 ? 's' : ''}.
            </p>
            <p className="text-xs text-muted-foreground">
              Escolha quais continuam. Os não escolhidos serão{' '}
              <strong>desativados</strong> (você pode reativar depois, quando liberar espaço) — não são excluídos.
            </p>
          </div>
        </div>

        {/* Timing: desativação agora, valor do plano só no fim do ciclo (B2) */}
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            A desativação dos usuários acontece <strong>agora</strong>. Já o novo valor do plano
            (mais barato) passa a valer só na <strong>próxima cobrança</strong> — você mantém o
            plano atual até o fim do período que já pagou.
          </p>
        </div>

        {/* Lista: escolha quem fica */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Quem continua com acesso?{' '}
            <span className="text-muted-foreground font-normal">
              (até {targetMaxUsers})
            </span>
          </p>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-0.5">
            {/* Usuário logado: fixo, sempre fica */}
            {users
              .filter((u) => u.user_id === currentUserId)
              .map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-primary/40 bg-primary/5"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={u.avatar_url || undefined} alt={u.full_name} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(u.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{u.full_name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">Você</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.phone || '—'}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                </div>
              ))}

            {/* Demais usuários: selecionáveis pra ficar */}
            {removableUsers.map((u) => {
              const keep = keepIds.includes(u.user_id);
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggleKeep(u.user_id)}
                  disabled={isDeactivating}
                  className={cn(
                    'w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-colors',
                    keep
                      ? 'border-primary bg-primary/5'
                      : 'border-warning/30 bg-warning/5 hover:bg-warning/10',
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={u.avatar_url || undefined} alt={u.full_name} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(u.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{u.full_name}</span>
                    </div>
                    <p className="text-xs truncate">
                      {keep ? (
                        <span className="text-primary">Continua com acesso</span>
                      ) : (
                        <span className="text-warning">Será desativado</span>
                      )}
                    </p>
                  </div>
                  {keep ? (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <span className="h-5 w-5 rounded-full border-2 border-warning/40 shrink-0" />
                  )}
                </button>
              );
            })}

            {removableUsers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Não há outros usuários para remover.
              </p>
            )}
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
