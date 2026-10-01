import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';

import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { StepTransition } from '@/components/ui/step-transition';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import { processImageFile } from '@/utils/imageConvert';
import { supabase } from '@/integrations/supabase/client';

import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useCompanyPmocDocTemplates } from '@/hooks/useCompanyPmocDocTemplates';
import { usePmocContractCustomDocs } from '@/hooks/usePmocContractCustomDocs';
import { useResponsibleTechnicians } from '@/hooks/useResponsibleTechnicians';

import { DocArtSvgRenderer, type DocArtImageUrls } from '@/lib/docArt/DocArtSvgRenderer';
import { idealForeground } from '@/lib/docArt/resolve';
import { DOC_ART_TEMPLATES, getDocArtTemplate } from '@/lib/docArt/templates';
import type {
  DocArtConfig,
  DocArtSlotKey,
  DocArtTemplate,
  DocArtTheme,
  DocArtToggleKey,
} from '@/lib/docArt/types';

import { PmocRichTextEditor } from './PmocRichTextEditor';
import {
  buildPreviewContext,
  substituteVariables,
  type PmocVariableContext,
} from '@/utils/pmocVariables';

/**
 * Wizard de configuração do "Certificado de Conformidade com Arte" (2026-10).
 *
 * Espelha a UX de `src/components/quotes/ProposalConfigDialog.tsx` (pedido
 * explícito do CEO: "igual nos orçamentos") — 3 etapas (Modelo, Personalizar,
 * Revisão), stepper com pills, preview AO VIVO.
 *
 * Duas superfícies, mesmo componente:
 *  - `contractId` ausente → edita o modelo PADRÃO da EMPRESA
 *    (`company_pmoc_document_templates`).
 *  - `contractId` informado → edita o OVERRIDE do CONTRATO
 *    (`pmoc_contract_documents_custom`). Quando o contrato não tem
 *    `certificado_art_slug` próprio (`null`), ele HERDA o que a empresa
 *    configurou — a UI avisa isso com `NoticeBanner` e oferece "Usar o
 *    padrão da empresa" pra voltar a herdar.
 *
 * Motor de renderização (`DocArtSvgRenderer`/`resolveDocArt`) é o MESMO que
 * gera o PDF — não foi tocado aqui. Este arquivo é só UI/estado de edição.
 */

export interface CertificadoArtConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Informe pra editar o override do CONTRATO. Ausente = edita o padrão da EMPRESA. */
  contractId?: string;
  /** RT vinculado ao contrato — só pra mostrar a assinatura real no preview. */
  responsibleTechnicianId?: string | null;
  /** Contexto de variáveis (empresa/RT/cliente/contrato) pro preview ao vivo. */
  variableContext?: PmocVariableContext | null;
}

type CertArtT = ReturnType<typeof useCertArtT>;
function useCertArtT() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.pmoc.certArt;
}

/** Rótulo PT-BR (chrome da app, não o texto da arte) de cada slot editável. */
function slotLabel(t: CertArtT, key: DocArtSlotKey): string {
  const map: Record<DocArtSlotKey, string> = {
    sobretitulo: t.slotSobretitulo,
    titulo: t.slotTitulo,
    subtitulo: t.slotSubtitulo,
    corpo: t.slotCorpo,
    destaque: t.slotDestaque,
    rodape: t.slotRodape,
    lateral: t.slotLateral,
    assinaturaNome: t.slotAssinaturaNome,
    assinaturaCargo: t.slotAssinaturaCargo,
  };
  return map[key] ?? key;
}

/** Rótulo de cada toggle (signature/footer — o que a arte declarar) que a arte declara. */
function toggleLabel(t: CertArtT, key: DocArtToggleKey): string {
  const map: Record<DocArtToggleKey, string> = {
    signature: t.toggleSignature,
    footer: t.toggleFooter,
  };
  return map[key] ?? key;
}

/**
 * Descrição curta de cada arte, DERIVADA da própria arte (orientação + tom),
 * nunca escrita à mão por slug: o catálogo em `docArt/templates/` muda com os
 * redesigns, e descrição escrita à mão envelhece em silêncio. A versão anterior
 * dizia "cara clássica de certificado emoldurado" em artes que já não tinham
 * moldura nenhuma.
 */
function modelDescription(t: CertArtT, template: DocArtTemplate): string {
  const orientation =
    template.orientation === 'portrait' ? t.modelPortrait : t.modelLandscape;
  // Papel que pede texto branco = arte de fundo escuro.
  const isDark = idealForeground(template.defaultTheme.paper) === '#ffffff';
  return `${orientation} · ${isDark ? t.modelToneDark : t.modelToneLight}`;
}

/** Folha (proporção real da arte) usada tanto nos cards do seletor quanto na revisão. */
function CertSheet({
  template,
  config,
  substitute,
  brand,
  images,
  className,
  title,
}: {
  template: DocArtTemplate;
  config?: DocArtConfig;
  substitute: (html: string) => string;
  brand?: Partial<DocArtTheme>;
  images: DocArtImageUrls;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-lg border bg-white shadow-sm', className)}
      style={{ aspectRatio: template.orientation === 'portrait' ? '210 / 297' : '297 / 210' }}
    >
      <DocArtSvgRenderer
        template={template}
        config={config}
        substitute={substitute}
        brand={brand}
        images={images}
        title={title}
      />
    </div>
  );
}

/** Card "Texto simples" — sem arte, só o ícone num fundo neutro. */
function PlainSheet({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40',
        className,
      )}
      style={{ aspectRatio: '210 / 297' }}
    >
      <FileText className="h-8 w-8 text-muted-foreground/50" />
    </div>
  );
}

export function CertificadoArtConfigDialog({
  open,
  onOpenChange,
  contractId,
  responsibleTechnicianId,
  variableContext,
}: CertificadoArtConfigDialogProps) {
  const t = useCertArtT();
  const { locale } = useAppLocaleContext();
  const tCommon = MESSAGES[locale].app.common;
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const isContract = !!contractId;

  const { settings: company } = useCompanySettings();
  const {
    templates: companyTemplates,
    saveCertificadoArt: saveCompanyArt,
    isSavingCertificadoArt: isSavingCompanyArt,
  } = useCompanyPmocDocTemplates();
  const {
    customDocs,
    saveCertificadoArt: saveContractArt,
    resetCertificadoArtToDefault,
    isSavingCertificadoArt: isSavingContractArt,
  } = usePmocContractCustomDocs(contractId);
  const { technicians } = useResponsibleTechnicians();

  const signatureUrl = useMemo(
    () => technicians.find((rt) => rt.id === responsibleTechnicianId)?.signature_image_url ?? null,
    [technicians, responsibleTechnicianId],
  );

  const companySlug = companyTemplates?.certificado_art_slug ?? null;
  const companyConfig = companyTemplates?.certificado_art_config ?? null;
  const ownSlug = isContract ? (customDocs?.certificado_art_slug ?? null) : null;
  const ownConfig = isContract ? (customDocs?.certificado_art_config ?? null) : null;
  /** Contrato sem override próprio → herda o que a empresa configurou. */
  const inherits = isContract && ownSlug === null;

  const baselineSlug = isContract ? (inherits ? companySlug : ownSlug) : companySlug;
  const baselineConfig = isContract ? (inherits ? companyConfig : ownConfig) : companyConfig;

  const isSaving = isContract ? isSavingContractArt : isSavingCompanyArt;

  // ── Wizard navigation ──
  const STEPS = [
    { key: 'model', label: t.stepModel },
    { key: 'customize', label: t.stepCustomize },
    { key: 'review', label: t.stepReview },
  ];
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const currentStepKey = STEPS[step]?.key ?? 'model';

  // ── Estado de edição (rascunho — só vira linha no banco ao Salvar) ──
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [theme, setTheme] = useState<Partial<DocArtTheme>>({});
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [toggles, setToggles] = useState<Partial<Record<DocArtToggleKey, boolean>>>({});
  const [slots, setSlots] = useState<Partial<Record<DocArtSlotKey, string>>>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Reseta o rascunho a partir do efetivo (próprio do contrato, ou herdado da
  // empresa, ou o padrão da empresa) toda vez que o diálogo abre.
  useEffect(() => {
    if (!open) {
      setStep(0);
      setMaxStepReached(0);
      return;
    }
    setStep(0);
    setMaxStepReached(STEPS.length - 1);
    setSelectedSlug(baselineSlug);
    setTheme(baselineConfig?.theme ?? {});
    setLogoUrl(baselineConfig?.logoUrl ?? null);
    setToggles(baselineConfig?.toggles ?? {});
    setSlots(baselineConfig?.slots ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setMaxStepReached((prev) => (step > prev ? step : prev));
  }, [step]);

  const selectedTemplate = useMemo(() => getDocArtTemplate(selectedSlug), [selectedSlug]);

  // ── Preview ao vivo: variáveis reais + genéricas pro que faltar (nunca
  //    aparece com linha pontilhada, igual ao PmocDocPreviewModal). ──
  const previewContext = useMemo(() => buildPreviewContext(variableContext), [variableContext]);
  const substitute = useCallback(
    (html: string) => substituteVariables(html, previewContext),
    [previewContext],
  );

  // Mesma regra do servidor (`generate-pmoc-certificado-pdf`): com white-label
  // ligado vale o logo do white-label. Divergir aqui faria o preview mostrar um
  // logo e o PDF sair com outro.
  const companyLogoUrl =
    (company?.white_label_enabled
      ? company?.white_label_logo_url ?? company?.logo_url
      : company?.logo_url) ?? null;
  const effectiveLogo = logoUrl || companyLogoUrl || undefined;

  // Cor da marca que entra como default do tema, ESPELHANDO a regra do
  // servidor (`generate-pmoc-certificado-pdf`): só vale com white-label ligado.
  // Sem isso o preview mostrava a cor da arte e o PDF saía na cor da marca.
  const brandTheme = useMemo<Partial<DocArtTheme> | undefined>(() => {
    const primary = company?.white_label_enabled ? company?.white_label_primary_color : null;
    return primary ? { primary } : undefined;
  }, [company?.white_label_enabled, company?.white_label_primary_color]);

  // Imagens pros CARDS do seletor de modelo — sempre o logo/assinatura reais,
  // sem o rascunho de personalização (os cards mostram a arte "de base").
  const baseImages = useMemo<DocArtImageUrls>(
    () => ({
      logo: companyLogoUrl ?? undefined,
      signature: signatureUrl ?? undefined,
    }),
    [companyLogoUrl, signatureUrl],
  );

  // Imagens pro preview AO VIVO (Personalizar/Revisão) — já com o rascunho de logo.
  const draftImages = useMemo<DocArtImageUrls>(
    () => ({ ...baseImages, logo: effectiveLogo }),
    [baseImages, effectiveLogo],
  );

  const draftConfig = useMemo<DocArtConfig>(() => {
    const cfg: DocArtConfig = {};
    const themeOverrides: Partial<DocArtTheme> = {};
    if (theme.primary) themeOverrides.primary = theme.primary;
    if (theme.accent) themeOverrides.accent = theme.accent;
    if (Object.keys(themeOverrides).length > 0) cfg.theme = themeOverrides;
    if (logoUrl) cfg.logoUrl = logoUrl;
    if (Object.keys(toggles).length > 0) cfg.toggles = toggles;
    if (Object.keys(slots).length > 0) cfg.slots = slots;
    return cfg;
  }, [theme, logoUrl, toggles, slots]);

  const setToggle = (key: DocArtToggleKey, value: boolean) =>
    setToggles((prev) => ({ ...prev, [key]: value }));

  const setSlot = (key: DocArtSlotKey, html: string) =>
    setSlots((prev) => ({ ...prev, [key]: html }));

  const clearSlot = (key: DocArtSlotKey) =>
    setSlots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // ── Logo do certificado — upload simples pro bucket de logos da empresa.
  //    Fica só no rascunho local; só grava no banco ao Salvar (igual
  //    cores/toggles/textos desta tela). ──
  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: t.logoTooBig });
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: t.logoNotImage });
      e.target.value = '';
      return;
    }
    setUploadingLogo(true);
    try {
      const filePath = `pmoc_cert_art_logo_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      setLogoUrl(data.publicUrl);
    } catch (err) {
      toast({ variant: 'destructive', title: t.logoErrorToast, description: getErrorMessage(err) });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = () => setLogoUrl(null);

  // ── "Usar o padrão da empresa" — restaura a herança (slug/config = null no
  //    contrato) e resincroniza o rascunho pro que a empresa tem agora. ──
  const handleRestoreInheritance = async () => {
    await resetCertificadoArtToDefault();
    setSelectedSlug(companySlug);
    setTheme(companyConfig?.theme ?? {});
    setLogoUrl(companyConfig?.logoUrl ?? null);
    setToggles(companyConfig?.toggles ?? {});
    setSlots(companyConfig?.slots ?? {});
  };

  const handleSave = async () => {
    const configToSave = selectedSlug === null ? null : draftConfig;
    if (isContract) {
      await saveContractArt(selectedSlug, configToSave);
    } else {
      await saveCompanyArt(selectedSlug, configToSave);
    }
  };

  const goToStep = (target: number) => {
    if (target === step) return;
    if (target <= maxStepReached || target === step + 1) setStep(target);
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  // ── Cards do seletor de modelo ──
  const modelCards = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <button
        type="button"
        onClick={() => setSelectedSlug(null)}
        className={cn(
          'flex flex-col gap-2 rounded-xl border-2 p-2.5 text-left transition-all',
          selectedSlug === null
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border hover:border-muted-foreground/30',
        )}
      >
        <div className="relative">
          <PlainSheet />
          {selectedSlug === null && (
            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </span>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t.modelPlainName}</p>
          <p className="text-xs text-muted-foreground">{t.modelPlainDesc}</p>
        </div>
      </button>

      {DOC_ART_TEMPLATES.map((tpl) => {
        const selected = selectedSlug === tpl.slug;
        return (
          <button
            key={tpl.slug}
            type="button"
            onClick={() => setSelectedSlug(tpl.slug)}
            className={cn(
              'flex flex-col gap-2 rounded-xl border-2 p-2.5 text-left transition-all',
              selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30',
            )}
          >
            <div className="relative">
              <CertSheet template={tpl} substitute={substitute} brand={brandTheme} images={baseImages} />
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
              <p className="text-xs text-muted-foreground">{modelDescription(t, tpl)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );

  // ── Preview ao vivo grande (usado na Personalizar — lado a lado no desktop
  //    — e na Revisão — folha inteira, sozinha). ──
  const livePreview = (
    <div className="mx-auto w-full" style={{ maxWidth: selectedTemplate?.orientation === 'landscape' ? 480 : 340 }}>
      {selectedTemplate ? (
        <CertSheet
          template={selectedTemplate}
          config={draftConfig}
          substitute={substitute}
          brand={brandTheme}
          images={draftImages}
        />
      ) : (
        <PlainSheet />
      )}
    </div>
  );

  const wizardContent = (
    <div className="flex flex-col">
      {/* Stepper */}
      <div className="space-y-3">
        <Progress value={progressPercent} className="h-1.5 max-w-md mx-auto" />
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {STEPS.map((s, i) => {
            const clickable = i <= maxStepReached || i === step + 1;
            return (
              <div key={s.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                    i < step
                      ? 'bg-primary text-primary-foreground'
                      : i === step
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                        : 'bg-muted text-muted-foreground',
                    clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-70',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  className={cn(
                    'text-xs hidden sm:inline truncate text-left',
                    i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                    clickable ? 'cursor-pointer hover:text-foreground' : 'cursor-not-allowed',
                  )}
                >
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-4 sm:w-8 h-px bg-border mx-1" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 mt-4">
        <StepTransition stepKey={currentStepKey} index={step} className="space-y-5">

          {/* ══ ETAPA 1: MODELO ══ */}
          {currentStepKey === 'model' && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{t.modelHeader}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.modelSubtitle}</p>

              {isContract && inherits && (
                <NoticeBanner variant="info" title={t.inheritedBannerTitle}>
                  {t.inheritedBannerDesc.replace(
                    '{model}',
                    companySlug ? getDocArtTemplate(companySlug)?.name ?? t.modelPlainName : t.modelPlainName,
                  )}
                </NoticeBanner>
              )}
              {isContract && !inherits && (
                <NoticeBanner
                  variant="neutral"
                  title={t.ownBannerTitle}
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleRestoreInheritance}
                      disabled={isSaving}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      {t.restoreInheritanceBtn}
                    </Button>
                  }
                >
                  {t.ownBannerDesc}
                </NoticeBanner>
              )}
              {isContract && selectedSlug === null && companySlug !== null && (
                <NoticeBanner variant="warning" title={t.plainBlockedTitle}>
                  {t.plainBlockedDesc.replace('{model}', getDocArtTemplate(companySlug)?.name ?? companySlug)}
                </NoticeBanner>
              )}

              {modelCards}
            </section>
          )}

          {/* ══ ETAPA 2: PERSONALIZAR ══ */}
          {currentStepKey === 'customize' && (
            <div className={cn('gap-5', !isMobile && selectedTemplate && 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-start')}>
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{t.customizeHeader}</span>
                </div>

                {!selectedTemplate ? (
                  <NoticeBanner variant="neutral" title={t.plainNoCustomizeTitle}>
                    {t.plainNoCustomizeDesc}
                  </NoticeBanner>
                ) : (
                  <>
                    {isMobile && <div className="pb-1">{livePreview}</div>}

                    {/* Logo */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.logoSectionTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.logoSectionSubtitle}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-28 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                          {effectiveLogo ? (
                            <img src={effectiveLogo} alt={t.logoSectionTitle} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <label>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleLogoUpload}
                              disabled={uploadingLogo}
                            />
                            <Button asChild size="sm" variant="outline" disabled={uploadingLogo}>
                              <span className="cursor-pointer">
                                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                {logoUrl ? t.logoChange : t.logoUpload}
                              </span>
                            </Button>
                          </label>
                          {logoUrl && (
                            <Button size="sm" variant="destructive-ghost" onClick={handleRemoveLogo}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t.logoRemove}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Cores */}
                    <div className="space-y-4">
                      <p className="text-sm font-semibold text-foreground">{t.colorsSectionTitle}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{t.colorPrimary}</Label>
                          <ColorPicker
                            value={theme.primary ?? selectedTemplate.defaultTheme.primary}
                            onChange={(c) => setTheme((prev) => ({ ...prev, primary: c }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{t.colorAccent}</Label>
                          <ColorPicker
                            value={theme.accent ?? selectedTemplate.defaultTheme.accent}
                            onChange={(c) => setTheme((prev) => ({ ...prev, accent: c }))}
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Toggles (assinatura / rodapé — o que a arte declarar) */}
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">{t.togglesSectionTitle}</p>
                      {selectedTemplate.toggles.map((key) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                          <p className="text-sm text-foreground">{toggleLabel(t, key)}</p>
                          <LabeledSwitch
                            value={toggles[key] === false ? 'nao' : 'sim'}
                            onChange={(v) => setToggle(key, v === 'sim')}
                            off={{ value: 'nao', label: tCommon.no }}
                            on={{ value: 'sim', label: tCommon.yes }}
                            aria-label={toggleLabel(t, key)}
                          />
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {/* Textos de cada slot — editor rich-text com variáveis PMOC */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.slotsSectionTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.slotsSectionSubtitle}</p>
                      </div>
                      {selectedTemplate.slots.map((key) => {
                        const overridden = slots[key] !== undefined;
                        const value = slots[key] ?? selectedTemplate.defaultSlots[key] ?? '';
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-muted-foreground">{slotLabel(t, key)}</Label>
                              {overridden && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-muted-foreground"
                                  onClick={() => clearSlot(key)}
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  {t.restoreSlotBtn}
                                </Button>
                              )}
                            </div>
                            <PmocRichTextEditor
                              value={value}
                              onChange={(html) => setSlot(key, html)}
                              minHeight={key === 'corpo' ? 200 : 72}
                              templateContext={previewContext}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Preview ao vivo — lado a lado no desktop */}
              {!isMobile && selectedTemplate && (
                <div className="sticky top-0">{livePreview}</div>
              )}
            </div>
          )}

          {/* ══ ETAPA 3: REVISÃO ══ */}
          {currentStepKey === 'review' && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{t.reviewHeader}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.reviewSubtitle}</p>

              {!selectedTemplate ? (
                <NoticeBanner variant="neutral" title={t.reviewPlainTitle}>
                  {t.reviewPlainDesc}
                </NoticeBanner>
              ) : (
                <div
                  className="mx-auto w-full"
                  style={{ maxWidth: selectedTemplate.orientation === 'landscape' ? 640 : 440 }}
                >
                  <CertSheet
                    template={selectedTemplate}
                    config={draftConfig}
                    substitute={substitute}
                    brand={brandTheme}
                    images={draftImages}
                    className="shadow-md"
                  />
                </div>
              )}
            </section>
          )}

        </StepTransition>
      </div>
    </div>
  );

  const wizardFooter = (
    <div className="flex flex-row items-center justify-between gap-2">
      <Button
        variant="outline"
        onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
        disabled={isSaving}
      >
        {step === 0 ? t.cancel : <><ChevronLeft className="h-4 w-4 mr-1" /> {t.back}</>}
      </Button>

      {step < STEPS.length - 1 ? (
        <Button onClick={() => setStep(step + 1)}>
          {t.next} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button onClick={handleSave} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.saving}</> : <><Save className="h-4 w-4 mr-2" /> {t.save}</>}
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.configTitle} className="sm:max-w-4xl" footer={wizardFooter}>
      {wizardContent}
    </ResponsiveModal>
  );
}
