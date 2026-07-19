import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  FileText,
  FileCheck,
  ShieldCheck,
  Info,
  Pencil,
  RotateCcw,
  CalendarClock,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { PmocDocEditorDialog } from './PmocDocEditorDialog';
import {
  useCompanyPmocDocTemplates,
  DEFAULT_DOC_VALIDITY_MONTHS,
} from '@/hooks/useCompanyPmocDocTemplates';
import {
  buildDefaultTermoRtHtml,
  buildDefaultCertificadoHtml,
  htmlPreview,
} from '@/utils/pmocDocumentTemplates';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Aba "Documentos" das Configurações de Contrato — edita os MODELOS PADRÃO
 * dos documentos PMOC a NÍVEL DE EMPRESA.
 *
 * Diferente de `PmocContractDocsTab` (que edita os textos de UM contrato), aqui
 * editamos o template-base da empresa via `useCompanyPmocDocTemplates`. Esses
 * modelos são o ponto de partida ao criar um novo contrato PMOC (modelo
 * snapshot: editar aqui NÃO altera contratos já existentes).
 *
 * Como não há contrato/cliente específico, NÃO passamos `templateContext` ao
 * editor — os badges de variável renderizam o RÓTULO da variável (não o valor
 * real), sinalizando ao gestor onde cada dado entrará no PDF de cada contrato.
 *
 * Resolve a empresa internamente (hook usa `getCurrentUserCompanyId`), então
 * não exige props.
 */

/** Sub-card de um modelo (apenas apresentação — toda a lógica vem por props). */
function TemplateCard({
  icon: Icon,
  title,
  description,
  preview,
  helperTooltip,
  edited,
  onEdit,
  onReset,
  resetDisabled,
  badgeCustomized = 'Personalizado',
  badgeDefault = 'Texto padrão',
  restoreBtn = 'Restaurar texto padrão',
  editBtn = 'Editar texto',
  fallbackPreview = 'Texto padrão do sistema. Toque em "Editar texto" pra personalizar.',
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  preview: string;
  helperTooltip: string;
  edited: boolean;
  onEdit: () => void;
  onReset: () => void;
  resetDisabled: boolean;
  badgeCustomized?: string;
  badgeDefault?: string;
  restoreBtn?: string;
  editBtn?: string;
  fallbackPreview?: string;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-sm">
      {/* Cabeçalho: ícone em destaque + título + tooltip + status */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="break-words text-sm font-semibold leading-tight sm:text-base">
                {title}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Info className="h-3 w-3" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">
                  {helperTooltip}
                </TooltipContent>
              </Tooltip>
            </div>
            {edited ? (
              <Badge variant="warning" className="shrink-0 text-[10px]">
                {badgeCustomized}
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                {badgeDefault}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Prévia do texto */}
      <p className="min-h-[40px] flex-1 break-words rounded-xl bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
        {preview || fallbackPreview}
      </p>

      {/* Ações: restaurar (neutro) + editar (warning/laranja) */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {edited && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 rounded-xl text-muted-foreground transition-transform active:scale-[0.97] sm:min-h-[40px]"
            onClick={onReset}
            disabled={resetDisabled}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            {restoreBtn}
          </Button>
        )}
        <Button
          variant="edit-ghost"
          size="sm"
          className="min-h-11 rounded-xl transition-transform active:scale-[0.97] sm:min-h-[40px]"
          onClick={onEdit}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          {editBtn}
        </Button>
      </div>
    </div>
  );
}

/**
 * Converte string crua de input numérico em inteiro, com fallback. Estado é
 * string crua (não `value={number}`) pra não prender um "0" intocável — lição
 * do projeto (input numérico controlado).
 */
function num(s: string, fallback: number): number {
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : fallback;
}

export function CompanyPmocTemplatesTab() {
  const { locale } = useAppLocaleContext();
  const tmpl = MESSAGES[locale].app.pmoc.templates;
  const {
    templates,
    saveTermoRT,
    saveCertificado,
    resetTermoRTToDefault,
    resetCertificadoToDefault,
    saveValidity,
    isSavingValidity,
    isSaving,
  } = useCompanyPmocDocTemplates();

  const [editorOpen, setEditorOpen] = useState<'termo_rt' | 'certificado' | null>(null);

  // Validade (meses) — state string crua; converte só no save via `num`.
  const [termoMonths, setTermoMonths] = useState('');
  const [certMonths, setCertMonths] = useState('');

  // Sincroniza os inputs quando os templates carregam (ou são salvos).
  useEffect(() => {
    if (!templates) return;
    setTermoMonths(String(templates.termo_rt_validity_months ?? DEFAULT_DOC_VALIDITY_MONTHS));
    setCertMonths(String(templates.certificado_validity_months ?? DEFAULT_DOC_VALIDITY_MONTHS));
  }, [templates]);

  const handleSaveValidity = () => {
    saveValidity(
      num(termoMonths, DEFAULT_DOC_VALIDITY_MONTHS),
      num(certMonths, DEFAULT_DOC_VALIDITY_MONTHS),
    );
  };

  // Defaults de código — usados quando o template da empresa é NULL (nunca
  // editado). Mesma lógica do por-contrato: o editor pré-preenche com isto.
  const defaultTermoRt = useMemo(() => buildDefaultTermoRtHtml(), []);
  const defaultCertificado = useMemo(() => buildDefaultCertificadoHtml(), []);

  const termoRtHtml = templates?.termo_rt_content ?? null;
  const certificadoHtml = templates?.certificado_content ?? null;

  const termoRtPreview = useMemo(
    () => htmlPreview(termoRtHtml ?? defaultTermoRt, 220),
    [termoRtHtml, defaultTermoRt],
  );
  const certificadoPreview = useMemo(
    () => htmlPreview(certificadoHtml ?? defaultCertificado, 220),
    [certificadoHtml, defaultCertificado],
  );

  return (
    <div className="space-y-6">
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:rounded-lg lg:shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 break-words text-lg sm:text-xl">
            <FileText className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">{tmpl.cardTitle}</span>
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tmpl.cardDesc}
          </p>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TemplateCard
              icon={ShieldCheck}
              title={tmpl.trtCardTitle}
              description={tmpl.trtCardDesc}
              preview={termoRtPreview}
              edited={!!termoRtHtml}
              helperTooltip={tmpl.trtCardTooltip}
              onEdit={() => setEditorOpen('termo_rt')}
              onReset={() => resetTermoRTToDefault()}
              resetDisabled={isSaving}
              badgeCustomized={tmpl.badgeCustomized}
              badgeDefault={tmpl.badgeDefault}
              restoreBtn={tmpl.restoreBtn}
              editBtn={tmpl.editBtn}
              fallbackPreview={tmpl.fallbackPreview}
            />
            <TemplateCard
              icon={FileCheck}
              title={tmpl.certCardTitle}
              description={tmpl.certCardDesc}
              preview={certificadoPreview}
              edited={!!certificadoHtml}
              helperTooltip={tmpl.certCardTooltip}
              onEdit={() => setEditorOpen('certificado')}
              onReset={() => resetCertificadoToDefault()}
              resetDisabled={isSaving}
              badgeCustomized={tmpl.badgeCustomized}
              badgeDefault={tmpl.badgeDefault}
              restoreBtn={tmpl.restoreBtn}
              editBtn={tmpl.editBtn}
              fallbackPreview={tmpl.fallbackPreview}
            />
          </div>
        </CardContent>
      </Card>

      {/* Validade dos documentos — duração (meses) usada pra calcular a data de
          vencimento de cada TRT/Certificado gerado. */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:rounded-lg lg:shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 break-words text-lg sm:text-xl">
            <CalendarClock className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">{tmpl.validityCardTitle}</span>
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tmpl.validityCardDesc.replace('{n}', String(DEFAULT_DOC_VALIDITY_MONTHS))}
          </p>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="termo-validity">{tmpl.termValidityLabel}</Label>
              <NumericInput
                id="termo-validity"
                value={termoMonths}
                onValueChange={setTermoMonths}
                placeholder={String(DEFAULT_DOC_VALIDITY_MONTHS)}
                className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-validity">{tmpl.certValidityLabel}</Label>
              <NumericInput
                id="cert-validity"
                value={certMonths}
                onValueChange={setCertMonths}
                placeholder={String(DEFAULT_DOC_VALIDITY_MONTHS)}
                className="min-h-11"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveValidity}
              disabled={isSavingValidity}
              className="min-h-11 rounded-xl transition-transform active:scale-[0.97] sm:min-h-[40px]"
            >
              {isSavingValidity ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {tmpl.saveValidityBtn}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Editores — sem templateContext: badges mostram o rótulo da variável,
          não valor real (não há contrato/cliente específico aqui). */}
      <PmocDocEditorDialog
        open={editorOpen === 'termo_rt'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title={tmpl.editorTrtTitle}
        initialHtml={termoRtHtml}
        defaultHtml={defaultTermoRt}
        onSave={saveTermoRT}
        onResetToDefault={resetTermoRTToDefault}
        isSaving={isSaving}
        helperText={tmpl.editorHelperTrt}
      />
      <PmocDocEditorDialog
        open={editorOpen === 'certificado'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title={tmpl.editorCertTitle}
        initialHtml={certificadoHtml}
        defaultHtml={defaultCertificado}
        onSave={saveCertificado}
        onResetToDefault={resetCertificadoToDefault}
        isSaving={isSaving}
        helperText={tmpl.editorHelperCert}
      />
    </div>
  );
}
