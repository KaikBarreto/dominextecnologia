import { useEffect, useState } from 'react';
import { Globe, Lock } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { useCrmPipelineAccess } from '@/hooks/useCrmPipelineAccess';
import { useUsers } from '@/hooks/useUsers';
import { useLeads } from '@/hooks/useLeads';
import type { CrmPipeline } from '@/hooks/useCrmPipelines';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface PipelineAccessDialogProps {
  pipeline: CrmPipeline | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ACL de UM funil (Onda D3 do overhaul do CRM). Quem chega até aqui já passou
 * pelo gate `isAdminOrGestor() || fn:manage_settings` no PipelineManagerDialog
 * — o mesmo público que a RLS de `crm_pipeline_access` deixa escrever (ver
 * migration 20260918110000, policy "System managers manage crm_pipeline_access",
 * espelho de `public.can_manage_system`).
 *
 * Lista vazia = funil ABERTO pra empresa toda (é o estado de hoje, em toda
 * empresa — a tabela nasce vazia). Ao SALVAR uma lista que tiraria o acesso de
 * alguém que hoje enxerga o funil (a primeira pessoa adicionada numa lista
 * vazia, ou a remoção de alguém de uma lista já restrita), mostramos ANTES de
 * gravar quantas pessoas perdem acesso e quantas oportunidades do funil, das
 * quais elas são responsáveis, somem da tela delas. Achado do Dev de banco: a
 * RLS esconde a oportunidade até de quem é responsável por ela — restringir em
 * silêncio pode orfanar negócio (ver comentário da migration, seção 6).
 *
 * IMPRECISÃO CONHECIDA (documentada, não corrigida — fora do escopo sem RPC
 * nova): o cálculo de "quem perde acesso" usa `useUsers()` (todos os perfis da
 * empresa) como o conjunto de quem hoje enxerga um funil aberto. Isso inclui
 * administradores, que na prática NUNCA perdem acesso (can_access_pipeline
 * sempre libera `fn:manage_crm`). Não há como saber, só no client e sem RPC
 * nova, quem tem essa permissão — então o aviso pode superestimar levemente a
 * contagem quando a lista de pessoas afetadas incluir um admin/gestor. Prefere
 * superestimar a subestimar: o risco de orfanar oportunidade é pior que um
 * aviso levemente exagerado.
 */
export function PipelineAccessDialog({ pipeline, open, onOpenChange }: PipelineAccessDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.pipelineAccess;
  const { users } = useUsers();
  const { leads } = useLeads();
  const { getPipelineAccessUserIds, setPipelineAccess } = useCrmPipelineAccess();

  const savedUserIds = pipeline ? getPipelineAccessUserIds(pipeline.id) : [];
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Reabrir sempre parte do estado salvo — fechar sem salvar não pode "vazar"
  // uma seleção pendente pra próxima vez que o diálogo abrir.
  useEffect(() => {
    if (open) setSelectedUserIds(pipeline ? getPipelineAccessUserIds(pipeline.id) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline?.id]);

  const [confirm, setConfirm] = useState<{
    userIds: string[];
    peopleCount: number;
    opportunitiesCount: number;
  } | null>(null);

  if (!pipeline) return null;

  const willBeRestricted = selectedUserIds.length > 0;

  // Quem enxerga HOJE (antes da troca) x quem enxergaria DEPOIS. Lista vazia
  // em qualquer um dos dois lados = "todo mundo da empresa" nesse lado.
  const computeLosers = (pendingIds: string[]) => {
    const companyUserIds = users.map((u) => u.user_id);
    const currentEffective = savedUserIds.length === 0 ? companyUserIds : savedUserIds;
    const pendingEffective = pendingIds.length === 0 ? companyUserIds : pendingIds;
    return currentEffective.filter((id) => !pendingEffective.includes(id));
  };

  // Oportunidades DESTE funil cujo responsável (principal ou co-responsável)
  // está entre quem vai perder acesso. Union de leads afetados, não soma por
  // pessoa — "quantas oportunidades vão sumir", não "quantas atribuições".
  const countAffectedOpportunities = (loserIds: string[]) => {
    if (loserIds.length === 0) return 0;
    return leads.filter((lead) => {
      if (lead.pipeline_id !== pipeline.id) return false;
      const assigneeIds = lead.assignees?.length
        ? lead.assignees.map((a) => a.user_id)
        : lead.assigned_to
          ? [lead.assigned_to]
          : [];
      return assigneeIds.some((id) => loserIds.includes(id));
    }).length;
  };

  const commit = (userIds: string[]) => {
    setPipelineAccess.mutate(
      { pipelineId: pipeline.id, userIds },
      {
        onSuccess: () => {
          setConfirm(null);
          onOpenChange(false);
        },
      },
    );
  };

  const handleSave = () => {
    const losers = computeLosers(selectedUserIds);
    if (losers.length > 0) {
      setConfirm({
        userIds: selectedUserIds,
        peopleCount: losers.length,
        opportunitiesCount: countAffectedOpportunities(losers),
      });
      return;
    }
    commit(selectedUserIds);
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={`${t.title}: ${pipeline.name}`}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.cancelButton}
            </Button>
            <Button type="button" onClick={handleSave} disabled={setPipelineAccess.isPending}>
              {t.saveButton}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>

          <div
            className={cn(
              'flex items-start gap-2.5 rounded-lg border p-3',
              willBeRestricted ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10',
            )}
          >
            {willBeRestricted ? (
              <Lock className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
            ) : (
              <Globe className="h-4 w-4 mt-0.5 shrink-0 text-success" />
            )}
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {willBeRestricted ? t.restrictedStateTitle : t.openStateTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {willBeRestricted ? t.restrictedStateDesc : t.openStateDesc}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <AssigneeMultiSelect
              technicians={users.map((user) => ({
                user_id: user.user_id,
                full_name: user.full_name,
                avatar_url: user.avatar_url,
              }))}
              teams={[]}
              selectedUserIds={selectedUserIds}
              selectedTeamIds={[]}
              onChangeUsers={setSelectedUserIds}
              onChangeTeams={() => {}}
              label={t.peopleLabel}
            />
            {selectedUserIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {selectedUserIds.map((uid) => {
                  const user = users.find((u) => u.user_id === uid);
                  if (!user) return null;
                  return (
                    <Badge key={uid} variant="secondary" className="gap-1.5 pl-1 pr-2 font-normal">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                          {user.full_name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[140px]">{user.full_name}</span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ResponsiveModal>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? t.confirmDescription(confirm.peopleCount, confirm.opportunitiesCount) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelButton}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && commit(confirm.userIds)}
              className="bg-warning text-white hover:bg-warning/90"
            >
              {t.confirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
