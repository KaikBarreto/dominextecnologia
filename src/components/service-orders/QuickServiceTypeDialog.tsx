import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useServiceTypes, type ServiceType } from '@/hooks/useServiceTypes';
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface QuickServiceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após criar com sucesso, recebendo a linha criada. */
  onCreated: (serviceType: ServiceType) => void;
  /** Nome pré-preenchido (ex.: texto digitado na busca do seletor). */
  initialName?: string;
  /**
   * Mostra os campos fiscais (códigos da NFS-e) no cadastro rápido.
   * Ligado quando o quick-create nasce da emissão de nota: sem os códigos o
   * serviço nasce incompleto e a próxima nota volta a exigir busca manual.
   */
  showFiscalFields?: boolean;
}

const DEFAULT_COLOR = '#22c55e';

/**
 * Quick-create MÍNIMO de Tipo de Serviço (create-only, poucos campos).
 * Para o CRUD completo, ver ServiceTypesPanel — é a MESMA tabela; aqui só
 * existe o atalho de criação, nunca um catálogo paralelo.
 * Campos: Nome (obrigatório) + Cor + "Exige equipamento" (+ fiscal opcional).
 */
export function QuickServiceTypeDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = '',
  showFiscalFields = false,
}: QuickServiceTypeDialogProps) {
  const { createServiceType } = useServiceTypes();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.serviceTypes;

  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [requiresEquipment, setRequiresEquipment] = useState(true);
  // Fiscal (opt-in) — todos opcionais.
  const [codigoServico, setCodigoServico] = useState('');
  const [itemLc116, setItemLc116] = useState('');
  const [codigoTribMun, setCodigoTribMun] = useState('');
  const [codigoNbs, setCodigoNbs] = useState('');
  const [issAliquota, setIssAliquota] = useState('');

  const reset = () => {
    setName('');
    setColor(DEFAULT_COLOR);
    setRequiresEquipment(true);
    setCodigoServico('');
    setItemLc116('');
    setCodigoTribMun('');
    setCodigoNbs('');
    setIssAliquota('');
  };

  // Radix não sincroniza estado quando o modal é aberto por código: o
  // pré-preenchimento tem que vir do efeito de `open`, nunca do handler.
  useEffect(() => {
    if (!open) return;
    reset();
    setName(initialName);
  }, [open, initialName]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  // cTribMun é opcional, mas quando preenchido tem que ter os 3 dígitos.
  const cTribMunInvalid = codigoTribMun.length > 0 && codigoTribMun.length !== 3;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    // Botão já fica desabilitado nesses casos — guarda contra Enter no form.
    if (!trimmed || cTribMunInvalid) return;
    const iss = issAliquota.trim().replace(',', '.');
    const created = await createServiceType.mutateAsync({
      name: trimmed,
      color,
      requires_equipment: requiresEquipment,
      is_active: true,
      ...(showFiscalFields
        ? {
            codigo_servico: codigoServico.trim() || null,
            codigo_tributacao_municipal: codigoTribMun.trim() || null,
            codigo_nbs: codigoNbs.trim() || null,
            item_lc116: itemLc116.trim() || null,
            iss_aliquota: iss === '' || !Number.isFinite(Number(iss)) ? null : Number(iss),
          }
        : {}),
    });
    // A mutation já invalida ['service-types'] no onSuccess.
    onCreated(created as ServiceType);
    reset();
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.modalTitleCreate}
      footer={
        <div className="space-y-2 pt-2">
          {cTribMunInvalid && (
            <p className="text-xs text-destructive text-right">{t.errorCTribMun}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="destructive-ghost"
              onClick={() => handleOpenChange(false)}
            >
              {t.btnCancel}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createServiceType.isPending || cTribMunInvalid || !name.trim()}
            >
              {createServiceType.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.btnCreate}
            </Button>
          </div>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!createServiceType.isPending) handleSubmit();
        }}
        className="space-y-4 py-2"
      >
        <div className="space-y-2">
          <Label htmlFor="quick-service-type-name">{t.labelName}</Label>
          <Input
            id="quick-service-type-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.placeholderName}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-service-type-color">{t.labelColor}</Label>
          <div className="flex items-center gap-3">
            <input
              id="quick-service-type-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-10 rounded cursor-pointer border-0"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={requiresEquipment} onCheckedChange={setRequiresEquipment} />
          <Label>{t.labelEquipmentRequired}</Label>
        </div>

        {/* ------------------------------------------------------------------
         * Fiscal (opt-in): mesmos campos da aba Fiscal do cadastro completo.
         * Preenchidos aqui, o serviço já nasce pronto pra próxima nota.
         * ------------------------------------------------------------------ */}
        {showFiscalFields && (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">{t.fiscalTitle}</p>
              <p className="text-xs text-muted-foreground">{t.fiscalSubtitle}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t.labelCTribNac}</Label>
              <TaxCodeCombobox
                type="servico"
                value={codigoServico}
                onSelect={(codigo, item) => {
                  setCodigoServico(codigo);
                  if (item?.itemLc116) setItemLc116(String(item.itemLc116));
                }}
                placeholder={t.placeholderTaxSearch}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t.labelCTribMun}</Label>
              <Input
                value={codigoTribMun}
                onChange={(e) => setCodigoTribMun(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder={t.placeholderCTribMun}
                inputMode="numeric"
                maxLength={3}
                className="sm:max-w-[160px]"
              />
              <p className="text-[11px] text-muted-foreground">{t.helperCTribMun}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t.labelNBS}</Label>
              <TaxCodeCombobox
                type="nbs"
                value={codigoNbs}
                onSelect={(codigo) => setCodigoNbs(codigo)}
                placeholder={t.placeholderTaxSearch}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t.labelISS}</Label>
              <Input
                value={issAliquota}
                onChange={(e) => setIssAliquota(e.target.value)}
                placeholder="5"
                inputMode="decimal"
                className="sm:max-w-[160px]"
              />
            </div>
          </div>
        )}

        {/* submit escondido para permitir Enter no formulário */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveModal>
  );
}
