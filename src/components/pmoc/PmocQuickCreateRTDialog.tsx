import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  useResponsibleTechnicians,
  type ResponsibleTechnician,
} from '@/hooks/useResponsibleTechnicians';

/**
 * Quick-create RT (Onda UI-1.2) — formulário mínimo invocado de dentro do modal
 * de contrato PMOC. Tem só os campos essenciais pra destravar a seleção; a
 * edição completa (assinatura, carimbo, contatos, observações) continua na
 * tela `/responsaveis-tecnicos`.
 *
 * Fluxo:
 *  1. Usuário marca contrato como PMOC e percebe que não tem RT ainda.
 *  2. Clica no botão "+" ao lado do select de RT.
 *  3. Preenche: nome*, CFT/CREA, modalidade, registro ART/TRT.
 *  4. Salva → `onCreated(rt)` → componente pai seleciona o novo RT
 *     automaticamente e invalida a query da lista.
 *
 * Por que NÃO pede assinatura aqui:
 *   - Cadastro rápido é pra agilizar o contrato em criação; assinatura tem
 *     fluxo próprio (upload OU canvas) que merece tela completa, sem distrair.
 *   - O hint no rodapé do dialog reforça que pode completar depois.
 */
interface PmocQuickCreateRTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (rt: ResponsibleTechnician) => void;
}

interface QuickFormState {
  full_name: string;
  cft_crea: string;
  modality: string;
  registry_number: string;
}

const EMPTY: QuickFormState = {
  full_name: '',
  cft_crea: '',
  modality: '',
  registry_number: '',
};

export function PmocQuickCreateRTDialog({
  open,
  onOpenChange,
  onCreated,
}: PmocQuickCreateRTDialogProps) {
  const { toast } = useToast();
  const { createTechnician } = useResponsibleTechnicians();
  const [form, setForm] = useState<QuickFormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Reset ao abrir.
  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const setField = <K extends keyof QuickFormState>(key: K, value: QuickFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome completo do Responsável Técnico.',
      });
      return;
    }

    setSaving(true);
    try {
      const created = await createTechnician.mutateAsync({
        full_name: form.full_name.trim(),
        cft_crea: form.cft_crea.trim() || null,
        modality: form.modality.trim() || null,
        registry_number: form.registry_number.trim() || null,
        is_active: true,
      });
      // Pai recebe o RT criado e cuida de selecionar/fechar.
      onCreated(created);
    } catch (err) {
      // mutation já emite toast destrutivo.
      console.error('[PmocQuickCreateRTDialog] erro ao criar RT', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo Responsável Técnico"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.full_name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar e selecionar
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <Alert className="border-info/40 bg-info/5">
          <ShieldCheck className="h-4 w-4 text-info" />
          <AlertDescription className="text-xs">
            Cadastro rápido só com os dados essenciais para o contrato. Assinatura,
            carimbo e demais informações podem ser preenchidos depois em
            <strong> Responsáveis Técnicos</strong>.
          </AlertDescription>
        </Alert>

        <div className="space-y-1.5">
          <Label htmlFor="quick-rt-name">
            Nome completo <span className="text-destructive">*</span>
          </Label>
          <Input
            id="quick-rt-name"
            value={form.full_name}
            onChange={(e) => setField('full_name', e.target.value)}
            placeholder="Ex: João da Silva"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quick-rt-cftcrea">CFT/CREA</Label>
            <Input
              id="quick-rt-cftcrea"
              value={form.cft_crea}
              onChange={(e) => setField('cft_crea', e.target.value)}
              placeholder="Ex: CREA-SP 1234567"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-rt-modality">Modalidade</Label>
            <Input
              id="quick-rt-modality"
              value={form.modality}
              onChange={(e) => setField('modality', e.target.value)}
              placeholder="Ex: Engenheiro Mecânico"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quick-rt-registry">Número de registro (ART/TRT)</Label>
          <Input
            id="quick-rt-registry"
            value={form.registry_number}
            onChange={(e) => setField('registry_number', e.target.value)}
            placeholder="Ex: ART 1234567/2026"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
