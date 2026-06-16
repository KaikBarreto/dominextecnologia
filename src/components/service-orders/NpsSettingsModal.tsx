import { useEffect, useState } from 'react';
import { Loader2, Lock, Plus, Trash2, ChevronUp, ChevronDown, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useNpsSettings, NPS_DEFAULT_QUESTION } from '@/hooks/useNpsSettings';
import { useNpsCriteria } from '@/hooks/useNpsCriteria';

interface NpsSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal "Configurações de NPS" (aba NPS). Edita a pergunta da escala 0–10 e dois
 * comportamentos (estrelas obrigatórias / gerar pesquisa ao finalizar). Só quem
 * tem gestão do sistema pode editar — sem permissão, exibe em modo leitura.
 */
export function NpsSettingsModal({ open, onOpenChange }: NpsSettingsModalProps) {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const { settings, isLoading, save, isSaving } = useNpsSettings();
  const {
    criteria,
    isLoading: criteriaLoading,
    create: createCriterion,
    update: updateCriterion,
    remove: removeCriterion,
    isMutating: criteriaMutating,
  } = useNpsCriteria();

  // '*' (Acesso Total) ou a permissão de gestão do sistema liberam a edição.
  // O server (can_manage_system) é a fronteira real; isto é só UX.
  const canEdit = hasPermission('*') || hasPermission('manage_system');

  const [question, setQuestion] = useState('');
  const [requireStars, setRequireStars] = useState(false);
  const [generateOnFinish, setGenerateOnFinish] = useState(true);

  // Rascunho local dos rótulos (edição inline) — grava no blur/Enter.
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const labelOf = (id: string, fallback: string) =>
    labelDrafts[id] !== undefined ? labelDrafts[id] : fallback;

  // Re-seed sempre que abrir / quando a config carregar.
  useEffect(() => {
    if (open) {
      setQuestion(settings.question || NPS_DEFAULT_QUESTION);
      setRequireStars(settings.require_stars);
      setGenerateOnFinish(settings.generate_on_finish);
    }
  }, [open, settings.question, settings.require_stars, settings.generate_on_finish]);

  const handleSave = async () => {
    try {
      await save({
        question: question.trim() || NPS_DEFAULT_QUESTION,
        require_stars: requireStars,
        generate_on_finish: generateOnFinish,
      });
      toast({ title: 'Configurações de NPS salvas' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar', description: getErrorMessage(err) });
    }
  };

  // ——— Critérios de avaliação (CRUD) ———

  const handleCommitLabel = async (id: string, original: string) => {
    const next = (labelDrafts[id] ?? original).trim();
    // Limpa o rascunho assim que processado.
    setLabelDrafts((d) => {
      const { [id]: _, ...rest } = d;
      return rest;
    });
    if (!next || next === original) return;
    try {
      await updateCriterion({ id, label: next });
      toast({ title: 'Critério atualizado' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar', description: getErrorMessage(err) });
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await updateCriterion({ id, active });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar', description: getErrorMessage(err) });
    }
  };

  // Troca de posição com o vizinho (setas ↑/↓).
  const handleMove = async (index: number, dir: -1 | 1) => {
    const a = criteria[index];
    const b = criteria[index + dir];
    if (!a || !b) return;
    try {
      await Promise.all([
        updateCriterion({ id: a.id, position: b.position }),
        updateCriterion({ id: b.id, position: a.position }),
      ]);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Não foi possível reordenar', description: getErrorMessage(err) });
    }
  };

  const handleAdd = async () => {
    const nextPos = criteria.length > 0 ? Math.max(...criteria.map((c) => c.position)) + 1 : 0;
    try {
      await createCriterion({ label: 'Novo critério', position: nextPos });
      toast({ title: 'Critério adicionado' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Não foi possível adicionar', description: getErrorMessage(err) });
    }
  };

  const handleRemove = async (id: string, label: string) => {
    if (!window.confirm(`Remover o critério "${label}"? Ele deixará de aparecer na pesquisa.`)) return;
    try {
      await removeCriterion(id);
      toast({ title: 'Critério removido' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Não foi possível remover', description: getErrorMessage(err) });
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Configurações de NPS"
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Somente a gestão pode alterar estas configurações.
          </div>
        )
      }
    >
      <div className="space-y-6 py-1">
        <p className="text-sm text-muted-foreground">
          Defina o que o cliente vê na pesquisa de satisfação enviada ao concluir uma OS.
        </p>

        <div className="space-y-2">
          <Label htmlFor="nps-question" className="text-sm font-medium">
            Pergunta da escala 0–10
          </Label>
          <Textarea
            id="nps-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={NPS_DEFAULT_QUESTION}
            rows={3}
            disabled={!canEdit || isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Texto que o cliente vê acima das notas de 0 a 10 no link da pesquisa.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Avaliação por estrelas</Label>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">
              Exigir que o cliente toque nas estrelas de todos os critérios.
            </span>
            <LabeledSwitch
              value={requireStars ? 'on' : 'off'}
              onChange={(v) => canEdit && setRequireStars(v === 'on')}
              off={{ value: 'off', label: 'Opcional' }}
              on={{ value: 'on', label: 'Obrigatória' }}
              aria-label="Exigir avaliação por estrelas"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-medium">Critérios de avaliação</Label>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleAdd}
                disabled={criteriaLoading || criteriaMutating}
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cada critério é avaliado de 1 a 5 estrelas pelo cliente na pesquisa.
          </p>

          {criteriaLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando critérios…
            </div>
          ) : criteria.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum critério cadastrado.
            </div>
          ) : (
            <div className="space-y-2">
              {criteria.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <Star className="h-4 w-4 shrink-0 fill-warning text-warning" />
                  <Input
                    value={labelOf(c.id, c.label)}
                    onChange={(e) => setLabelDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    onBlur={() => handleCommitLabel(c.id, c.label)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    disabled={!canEdit || criteriaMutating}
                    className="h-9 flex-1"
                  />
                  {canEdit ? (
                    <>
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          onClick={() => handleMove(i, -1)}
                          disabled={i === 0 || criteriaMutating}
                          aria-label="Mover para cima"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          onClick={() => handleMove(i, 1)}
                          disabled={i === criteria.length - 1 || criteriaMutating}
                          aria-label="Mover para baixo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      <Switch
                        checked={c.active}
                        onCheckedChange={(v) => handleToggleActive(c.id, v)}
                        disabled={criteriaMutating}
                        aria-label={c.active ? 'Critério ativo' : 'Critério inativo'}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(c.id, c.label)}
                        disabled={criteriaMutating}
                        aria-label="Remover critério"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    !c.active && (
                      <span className="shrink-0 text-xs text-muted-foreground">Inativo</span>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Gerar pesquisa ao finalizar OS (padrão)</Label>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">
              Padrão aplicado a novas OS. Pode ser ajustado caso a caso na própria OS.
            </span>
            <LabeledSwitch
              value={generateOnFinish ? 'on' : 'off'}
              onChange={(v) => canEdit && setGenerateOnFinish(v === 'on')}
              off={{ value: 'off', label: 'Não' }}
              on={{ value: 'on', label: 'Sim' }}
              aria-label="Gerar pesquisa de satisfação ao finalizar OS"
            />
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
