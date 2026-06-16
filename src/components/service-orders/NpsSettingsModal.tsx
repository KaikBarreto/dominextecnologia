import { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useNpsSettings, NPS_DEFAULT_QUESTION } from '@/hooks/useNpsSettings';

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

  // '*' (Acesso Total) ou a permissão de gestão do sistema liberam a edição.
  // O server (can_manage_system) é a fronteira real; isto é só UX.
  const canEdit = hasPermission('*') || hasPermission('manage_system');

  const [question, setQuestion] = useState('');
  const [requireStars, setRequireStars] = useState(false);
  const [generateOnFinish, setGenerateOnFinish] = useState(true);

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
              Exigir que o cliente toque nas estrelas das três categorias.
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
