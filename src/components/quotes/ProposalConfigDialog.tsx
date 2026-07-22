import { useState, useEffect, useRef } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { StepTransition } from '@/components/ui/step-transition';
import { Progress } from '@/components/ui/progress';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCompanySettings, type CompanySettings } from '@/hooks/useCompanySettings';
import { ProposalRenderer } from './ProposalRenderer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Check, Save, Loader2, Upload, Trash2, ImageIcon, LayoutTemplate, Palette, Eye, ChevronLeft, ChevronRight, Gem, AudioLines, Pyramid, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { cn } from '@/lib/utils';
import type { Quote } from '@/hooks/useQuotes';
import type { ProposalCustomization } from './templates/types';

interface ProposalConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Step keys are defined inside the component via tp (locale-aware labels).

// Amostra rica o bastante pra a Revisão demonstrar TODOS os recursos:
// muitos itens (escopo pagina em várias folhas), deslocamento e brindes ligados,
// validade preenchida. Os toggles de deslocamento/brindes ligam/desligam as
// respectivas seções no preview ao vivo.
const SAMPLE_SERVICES = [
  'Manutenção preventiva', 'Limpeza de dutos', 'Higienização do evaporador',
  'Recarga de gás refrigerante', 'Troca de capacitor', 'Verificação elétrica',
  'Limpeza do condensador', 'Substituição de filtro secador',
];
const SAMPLE_MATERIALS = [
  'Filtro de ar condicionado', 'Tubulação de cobre 3/8"', 'Fita isolante PVC',
  'Suporte de parede reforçado', 'Gás R-410A (cilindro)', 'Dreno flexível',
];

const SAMPLE_ITEMS = [
  ...SAMPLE_SERVICES.map((description, i) => ({
    position: i, item_type: 'servico', description,
    quantity: 1, unit_price: 180 + i * 20, total_price: 180 + i * 20,
  })),
  ...SAMPLE_MATERIALS.map((description, i) => ({
    position: SAMPLE_SERVICES.length + i, item_type: 'material', description,
    quantity: 2, unit_price: 60 + i * 15, total_price: (60 + i * 15) * 2,
  })),
];
const SAMPLE_SUBTOTAL = SAMPLE_ITEMS.reduce((s, it) => s + it.total_price, 0);

const SAMPLE_QUOTE: Quote = {
  id: 'sample',
  quote_number: 1042,
  customer_id: null,
  prospect_name: 'Maria Silva',
  prospect_phone: '(11) 99999-0000',
  prospect_email: 'maria@exemplo.com',
  status: 'enviado',
  valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  discount_type: 'valor',
  discount_value: 50,
  subtotal: SAMPLE_SUBTOTAL,
  discount_amount: 50,
  distance_km: 18,
  displacement_cost: 90,
  include_gifts: true,
  total_value: SAMPLE_SUBTOTAL + 90 - 50,
  notes: 'Exemplo de observação da proposta.',
  terms: 'Pagamento em até 30 dias após aprovação.',
  assigned_to: null,
  proposal_template_id: null,
  token: 'sample',
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  converted_to_os_id: null,
  final_price: SAMPLE_SUBTOTAL + 90 - 50,
  customers: { name: 'Maria Silva', email: 'maria@exemplo.com', phone: '(11) 99999-0000' },
  quote_items: SAMPLE_ITEMS,
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  clean: 'Documento branco e enxuto: cabeçalho da empresa, cliente, tabelas de serviços e materiais, totais e informações. Padrão de novos orçamentos.',
  vanguarda: 'Premium em A4 vertical, fundo escuro, dirigido pela sua cor de marca. Capa marcante + apresentação, escopo, investimento e encerramento.',
  aurora: 'Capa preta com barras em gradiente azul→roxo→rosa. Visual moderno e vibrante, A4 vertical.',
  prisma: 'Capa preta com cubos de vidro 3D iridescentes. Preto e branco minimalista, tipografia condensada, A4 vertical.',
};

// Lista de templates FIXA no client (independe das linhas em proposal_templates).
// A persistência da escolha na quote ainda usa o registro do banco; o preview
// renderiza só pelo slug. Slugs válidos: clean | vanguarda | aurora | prisma.
// Cada modelo carrega um ÍCONE autêntico (lucide) que combina com sua identidade:
//   Clean → FileText (documento branco/limpo, é o padrão → vem primeiro),
//   Vanguarda → Gem (premium/sofisticado), Aurora → AudioLines (barras vibrantes),
//   Prisma → Pyramid (geométrico/3D minimalista). A cor do modelo (preview_color)
//   vira só um leve toque no ícone, não mais uma bolinha lisa.
const TEMPLATE_OPTIONS = [
  { id: 'clean', slug: 'clean', name: 'Clean', preview_color: '#0f172a', icon: FileText, description: null },
  { id: 'vanguarda', slug: 'vanguarda', name: 'Vanguarda', preview_color: '#22d3ee', icon: Gem, description: null },
  { id: 'aurora', slug: 'aurora', name: 'Aurora', preview_color: '#ec4899', icon: AudioLines, description: null },
  { id: 'prisma', slug: 'prisma', name: 'Prisma', preview_color: '#c084fc', icon: Pyramid, description: null },
];

export function ProposalConfigDialog({ open, onOpenChange }: ProposalConfigDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const tp = MESSAGES[locale].app.crm.proposals;
  const STEPS = [
    { key: 'model', label: tp.stepModel },
    { key: 'customize', label: tp.stepCustomize },
    { key: 'review', label: tp.stepReview },
  ];
  const { settings: company, updateSettings } = useCompanySettings();
  // selectedSlug é só PREVIEW — este diálogo NÃO persiste o template (handleSave só
  // grava proposal_customization/cores). A escolha por-orçamento vive no
  // QuoteFormDialog. Default = 'clean' pra refletir o padrão de novos orçamentos.
  const [selectedSlug, setSelectedSlug] = useState<string>('clean');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // ── Estado da navegação do preview da Revisão (ELEVADO pro dialog) ──
  // Compartilhado entre o footer (setas ◀ Página X/Y ▶) e o ProposalA4Preview.
  // O preview reporta página atual / total e expõe um goToPage via ref; o footer
  // consome o estado e dispara o scroll horizontal.
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotal, setPreviewTotal] = useState(1);
  const previewGoToRef = useRef<(target: number) => void>(() => {});

  // ── Wizard navigation ──
  const [step, setStep] = useState(0);
  // Etapa mais avançada já visitada — libera o clique direto no stepper para
  // navegar livremente (ida e volta) até onde já se chegou.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const currentStepKey = STEPS[step]?.key ?? 'model';

  const existing = company?.proposal_customization;
  const [colors, setColors] = useState<ProposalCustomization>({
    primary_color: '#2563eb',
    accent_color: '#f97316',
    header_bg: '#1e3a5f',
    show_pagination: true,
    show_displacement: true,
    show_gifts: true,
  });

  useEffect(() => {
    if (existing) {
      setColors({
        primary_color: existing.primary_color || '#2563eb',
        accent_color: existing.accent_color || '#f97316',
        header_bg: existing.header_bg || '#1e3a5f',
        logo_url: existing.logo_url || undefined,
        show_pagination: existing.show_pagination ?? true,
        // Default LIGADO em config antiga sem o campo (undefined → true).
        show_displacement: existing.show_displacement ?? true,
        show_gifts: existing.show_gifts ?? true,
      });
    }
  }, [existing]);

  // ── Reset wizard nav on open/close ──
  // Como sempre há um template default (clean) e cores válidas, a config já
  // está "completa" desde a abertura → navegação livre por todas as etapas
  // (espelha o maxStepReached dos outros wizards no modo edição).
  useEffect(() => {
    if (!open) {
      setStep(0);
      setMaxStepReached(0);
      setPreviewPage(1);
      setPreviewTotal(1);
      return;
    }
    setStep(0);
    setMaxStepReached(STEPS.length - 1);
  }, [open]);

  // Mantém o "mais avançado já visitado" sempre ≥ etapa atual.
  useEffect(() => {
    setMaxStepReached(prev => (step > prev ? step : prev));
  }, [step]);

  const handleSave = async () => {
    setSaving(true);
    await updateSettings.mutateAsync({ proposal_customization: colors } as any);
    setSaving(false);
    toast({ title: tp.savedToast });
  };

  // Upload do logo da proposta. Espelha o fluxo do logo da empresa (Settings):
  // mesmo bucket `company-logos`, processImageFile, getPublicUrl. Persiste a URL
  // dentro de proposal_customization.logo_url. Vazio = cai no logo da empresa.
  const handleProposalLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: tp.logoTooBig });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: tp.logoNotImage });
      return;
    }
    setUploadingLogo(true);
    try {
      // Remove o logo de proposta anterior (se houver) do bucket.
      const current = colors.logo_url;
      if (current) {
        try {
          const oldPath = current.split('/company-logos/')[1];
          if (oldPath) await supabase.storage.from('company-logos').remove([oldPath]);
        } catch {}
      }
      const filePath = `proposal_logo_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      const next = { ...colors, logo_url: publicUrl };
      setColors(next);
      await updateSettings.mutateAsync({ proposal_customization: next } as any);
      toast({ title: tp.logoUploadedToast });
    } catch (err: any) {
      toast({ variant: 'destructive', title: tp.logoErrorToast, description: getErrorMessage(err) });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveProposalLogo = async () => {
    const current = colors.logo_url;
    if (current) {
      try {
        const path = current.split('/company-logos/')[1];
        if (path) await supabase.storage.from('company-logos').remove([path]);
      } catch {}
    }
    const next = { ...colors, logo_url: undefined };
    setColors(next);
    await updateSettings.mutateAsync({ proposal_customization: next } as any);
    toast({ title: tp.logoRemovedToast });
  };

  const effectiveLogo = colors.logo_url || company?.logo_url || null;

  // ── Wizard gating ──
  // Etapa Modelo sempre tem um template selecionado (default clean) → ok.
  // Demais etapas livres. Voltar é sempre livre.
  const canNext = () => {
    switch (currentStepKey) {
      case 'model':
        return !!selectedSlug;
      default:
        return true;
    }
  };

  const goToStep = (target: number) => {
    if (target === step) return;
    if (target <= maxStepReached) { setStep(target); return; }
    if (target === step + 1 && canNext()) setStep(target);
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  // ─── Wizard content (stepper + steps) ───────────────────────────────────────
  const wizardContent = (
    <div className="flex flex-col">
      {/* Stepper — indicador de etapas centralizado horizontalmente */}
      <div className="space-y-3">
        <Progress value={progressPercent} className="h-1.5 max-w-md mx-auto" />
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {STEPS.map((s, i) => {
            const clickable = i <= maxStepReached || (i === step + 1 && canNext());
            return (
              <div key={s.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                    i < step ? 'bg-primary text-primary-foreground' :
                    i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                    'bg-muted text-muted-foreground',
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

      {/* Content */}
      <div className="flex-1 mt-4">
        <StepTransition stepKey={currentStepKey} index={step} className="space-y-5">

          {/* ══ STEP 1: MODELO ══ */}
          {currentStepKey === 'model' && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{tp.modelHeader}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {tp.modelSubtitle}
              </p>

              {/* Desktop: 2 colunas (lista de modelos | capa A4). Mobile: empilha
                  com a CAPA em cima e a seleção embaixo, compacto pra caber numa
                  view só do drawer. */}
              {isMobile ? (
                <div className="flex flex-col gap-3">
                  {/* Capa (compacta) primeiro no mobile */}
                  <ProposalCoverPreview
                    quote={SAMPLE_QUOTE}
                    company={company ?? null}
                    templateSlug={selectedSlug}
                    customization={colors}
                    maxHeight={300}
                  />
                  {/* Seleção de modelo embaixo */}
                  <TemplatePickerCarousel
                    options={TEMPLATE_OPTIONS}
                    selectedSlug={selectedSlug}
                    onSelect={setSelectedSlug}
                    itemHeight={52}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 items-start">
                  {/* Esquerda: carrossel vertical infinito de modelos */}
                  <TemplatePickerCarousel
                    options={TEMPLATE_OPTIONS}
                    selectedSlug={selectedSlug}
                    onSelect={setSelectedSlug}
                    itemHeight={64}
                  />
                  {/* Direita: prévia A4 só da capa do modelo selecionado */}
                  <ProposalCoverPreview
                    quote={SAMPLE_QUOTE}
                    company={company ?? null}
                    templateSlug={selectedSlug}
                    customization={colors}
                  />
                </div>
              )}
            </section>
          )}

          {/* ══ STEP 2: PERSONALIZAÇÃO ══ */}
          {currentStepKey === 'customize' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{tp.customizeHeader}</span>
              </div>

              {/* Logo da proposta (opcional, separado do logo da empresa) */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{tp.logoSectionTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tp.logoSectionSubtitle}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-28 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                    {effectiveLogo ? (
                      <img src={effectiveLogo} alt={tp.logoSectionTitle} className="max-h-full max-w-full object-contain" />
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
                        onChange={handleProposalLogoUpload}
                        disabled={uploadingLogo}
                      />
                      <Button asChild size="sm" variant="outline" disabled={uploadingLogo}>
                        <span className="cursor-pointer">
                          {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                          {colors.logo_url ? tp.logoChange : tp.logoUpload}
                        </span>
                      </Button>
                    </label>
                    {colors.logo_url && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveProposalLogo}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {tp.logoRemove}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Color customization */}
              <div className="rounded-xl border border-border p-4 space-y-4">
                <p className="text-sm font-semibold text-foreground">{tp.colorsSectionTitle}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{tp.colorPrimary}</Label>
                    <ColorPicker
                      value={colors.primary_color || '#2563eb'}
                      onChange={(c) => setColors(prev => ({ ...prev, primary_color: c }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{tp.colorAccent}</Label>
                    <ColorPicker
                      value={colors.accent_color || '#f97316'}
                      onChange={(c) => setColors(prev => ({ ...prev, accent_color: c }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{tp.colorHeaderBg}</Label>
                    <ColorPicker
                      value={colors.header_bg || '#1e3a5f'}
                      onChange={(c) => setColors(prev => ({ ...prev, header_bg: c }))}
                    />
                  </div>
                </div>
              </div>

              {/* Paginação — "Página XX/YY" no rodapé de cada folha da proposta */}
              <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{tp.paginationTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tp.paginationSubtitle}
                  </p>
                </div>
                <LabeledSwitch
                  value={colors.show_pagination ? 'sim' : 'nao'}
                  onChange={(v) => setColors(prev => ({ ...prev, show_pagination: v === 'sim' }))}
                  off={{ value: 'nao', label: tp.switchNo }}
                  on={{ value: 'sim', label: tp.switchYes }}
                  aria-label={tp.paginationTitle}
                />
              </div>

              {/* Deslocamento — linha de deslocamento no bloco de Investimento */}
              <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{tp.displacementTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tp.displacementSubtitle}
                  </p>
                </div>
                <LabeledSwitch
                  value={(colors.show_displacement ?? true) ? 'sim' : 'nao'}
                  onChange={(v) => setColors(prev => ({ ...prev, show_displacement: v === 'sim' }))}
                  off={{ value: 'nao', label: tp.switchNo }}
                  on={{ value: 'sim', label: tp.switchYes }}
                  aria-label={tp.displacementTitle}
                />
              </div>

              {/* Brindes — seção de cortesias quando a proposta inclui brindes */}
              <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{tp.giftsTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tp.giftsSubtitle}
                  </p>
                </div>
                <LabeledSwitch
                  value={(colors.show_gifts ?? true) ? 'sim' : 'nao'}
                  onChange={(v) => setColors(prev => ({ ...prev, show_gifts: v === 'sim' }))}
                  off={{ value: 'nao', label: tp.switchNo }}
                  on={{ value: 'sim', label: tp.switchYes }}
                  aria-label={tp.giftsTitle}
                />
              </div>
            </div>
          )}

          {/* ══ STEP 3: REVISÃO ══ */}
          {currentStepKey === 'review' && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{tp.reviewHeader}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {tp.reviewSubtitle}
              </p>
              {/* Preview — folhas A4 LADO A LADO (proporção 210:297), com UMA rolagem
                  horizontal só. As setas de navegação vivem no FOOTER do modal; aqui
                  só reportamos página atual/total e expomos o goToPage via ref. */}
              <ProposalA4Preview
                quote={SAMPLE_QUOTE}
                company={company ?? null}
                templateSlug={selectedSlug}
                customization={colors}
                compact={isMobile}
                onPageChange={setPreviewPage}
                onTotalChange={setPreviewTotal}
                goToRef={previewGoToRef}
              />
            </section>
          )}

        </StepTransition>
      </div>
    </div>
  );

  // ── Wizard footer (navegação + salvar) ──
  // Na etapa Revisão, o centro do footer ganha a navegação de página do preview
  // (◀ Página X/Y ▶), pra ficar sempre visível sem rolar o preview.
  const isReview = currentStepKey === 'review';
  const wizardFooter = (
    <div className="flex flex-row items-center justify-between gap-2">
      <Button
        variant="outline"
        onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)}
        disabled={saving}
      >
        {step === 0 ? tp.cancel : <><ChevronLeft className="h-4 w-4 mr-1" /> {tp.back}</>}
      </Button>

      {/* Centro: navegação de página do preview (só na Revisão e com >1 folha) */}
      {isReview && previewTotal > 1 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => previewGoToRef.current(previewPage - 1)}
            disabled={previewPage <= 1}
            aria-label={tp.back}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground tabular-nums min-w-[78px] text-center">
            {tp.pageLabel.replace('{current}', String(previewPage)).replace('{total}', String(previewTotal))}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => previewGoToRef.current(previewPage + 1)}
            disabled={previewPage >= previewTotal}
            aria-label={tp.next}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {step < STEPS.length - 1 ? (
        <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
          {tp.next} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tp.saving}</> : <><Save className="h-4 w-4 mr-2" /> {tp.save}</>}
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={tp.configTitle}
      className="sm:max-w-4xl"
      footer={wizardFooter}
      lockBackdrop
    >
      {wizardContent}
    </ResponsiveModal>
  );
}

/**
 * Pré-visualização em proporção A4 REAL (210:297) com as folhas LADO A LADO e
 * UMA rolagem horizontal só.
 *
 * O template renderiza com largura nativa de 794px (1 folha A4 @96dpi) como um
 * documento contínuo. Aqui medimos a altura real do documento, dividimos por
 * 1123px (altura de 1 folha A4) e descobrimos quantas FOLHAS existem. Cada folha
 * é renderizada como uma "janela" A4 separada (aspecto 210:297, `overflow:hidden`)
 * que mostra a fatia correspondente do documento — translada verticalmente em
 * `-páginaIndex * A4_H` (já escalado). As janelas ficam numa linha horizontal
 * (flex-row) com um gap discreto; o único scroll é o HORIZONTAL do container.
 *
 * A navegação (setas ◀ ▶) mora no FOOTER do modal: este componente expõe o
 * `goToPage` via `goToRef` e reporta página atual (`onPageChange`) e total
 * (`onTotalChange`). As setas dão `scrollTo` horizontal de exatamente 1 folha
 * (largura da folha + gap), `behavior: smooth`. "Página X/Y": Y = nº de folhas,
 * X pela posição do scroll horizontal.
 */
const A4_W = 794;
const A4_H = 1123;
const SHEET_GAP = 16; // gap discreto entre folhas A4 (px)

function ProposalA4Preview({
  quote,
  company,
  templateSlug,
  customization,
  compact,
  onPageChange,
  onTotalChange,
  goToRef,
}: {
  quote: Quote;
  company: CompanySettings | null;
  templateSlug: string;
  customization: ProposalCustomization;
  compact?: boolean;
  onPageChange: (p: number) => void;
  onTotalChange: (n: number) => void;
  goToRef: React.MutableRefObject<(target: number) => void>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);     // mede a largura/altura disponível do painel
  const scrollRef = useRef<HTMLDivElement>(null);   // container scrollável (rolagem HORIZONTAL)
  const measureRef = useRef<HTMLDivElement>(null);  // documento oculto p/ medir a altura real
  const [scale, setScale] = useState(0.5);
  const [contentH, setContentH] = useState(A4_H);

  // Altura definida da área de conteúdo do preview. A folha A4 INTEIRA tem que
  // caber aqui (vertical), por isso o `scale` é limitado pela altura. No desktop
  // damos uma altura generosa (vh) que preenche o corpo do modal; no mobile
  // (drawer) um pouco menor pra deixar espaço pro footer/handle.
  const PREVIEW_VH = compact ? 60 : 64;
  const PREVIEW_MAX = compact ? 560 : 760;

  // Altura escalada de 1 folha A4 — define a janela A4 de cada página.
  const sheetH = A4_H * scale;
  const sheetW = A4_W * scale;

  // Total de folhas A4 do documento (altura real / altura de 1 folha).
  const totalPages = Math.max(1, Math.round(contentH / A4_H));

  // Passo do scroll horizontal por página = largura da folha + gap.
  const stepW = sheetW + SHEET_GAP;

  // Reporta o total pro footer sempre que muda; ao mudar o nº de folhas (troca de
  // template/conteúdo), volta o scroll e a página pro início pra não ficar fora do
  // range.
  useEffect(() => {
    onTotalChange(totalPages);
    onPageChange(1);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [totalPages, onTotalChange, onPageChange]);

  useEffect(() => {
    const el = wrapRef.current;
    const sc = scrollRef.current;
    if (!el) return;
    // Padding interno da faixa de folhas (p-3 = 12px em cima/baixo e laterais).
    const PAD = 12;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      // Altura disponível REAL do conteúdo do preview: altura do container
      // scrollável menos o padding interno (cima+baixo). É o teto vertical pra
      // 1 folha A4.
      const boxH = (sc?.clientHeight ?? el.clientHeight) || A4_H;
      const availH = Math.max(1, boxH - PAD * 2);
      const availW = Math.max(1, w - PAD * 2);
      // A folha A4 INTEIRA cabe na altura → escala mandada pela altura; a largura
      // só limita se o container ficar mais estreito que a folha. Nunca amplia
      // além do nativo (1:1). Na prática a altura é o fator dominante → letterbox
      // horizontal (sobra nas laterais).
      const s = Math.min(availH / A4_H, availW / A4_W, 1);
      setScale(s);
      if (measureRef.current) setContentH(measureRef.current.scrollHeight || A4_H);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (sc) ro.observe(sc);
    if (measureRef.current) ro.observe(measureRef.current);
    return () => ro.disconnect();
  }, [templateSlug, customization, compact]);

  // Sincroniza "Página X/Y" com a rolagem horizontal.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || stepW <= 0) return;
    const p = Math.round(el.scrollLeft / stepW) + 1;
    onPageChange(Math.min(totalPages, Math.max(1, p)));
  };

  // Salto de 1 folha por clique nas setas do footer (exposto via goToRef).
  goToRef.current = (target: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.min(totalPages, Math.max(1, target));
    el.scrollTo({ left: (clamped - 1) * stepW, behavior: 'smooth' });
    onPageChange(clamped);
  };

  return (
    <div ref={wrapRef} className="w-full">
      {/* Documento oculto SÓ pra medir a altura real (define o nº de folhas). */}
      <div className="absolute -left-[99999px] top-0 pointer-events-none" aria-hidden>
        <div ref={measureRef} style={{ width: A4_W }}>
          <ProposalRenderer
            quote={quote}
            company={company}
            templateSlug={templateSlug}
            customization={customization}
          />
        </div>
      </div>

      {/* ÚNICA rolagem: horizontal. As folhas A4 ficam lado a lado com gap. O
          container tem ALTURA DEFINIDA (preenche o corpo do modal) → a folha é
          escalada pra caber INTEIRA nessa altura (sem corte embaixo); sobra nas
          laterais = letterbox horizontal. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="rounded-xl border shadow-sm bg-muted/40 overflow-x-auto overflow-y-hidden"
        style={{
          scrollSnapType: 'x mandatory',
          height: `min(${PREVIEW_VH}vh, ${PREVIEW_MAX}px)`,
        }}
      >
        <div className="flex flex-row items-center justify-start h-full p-3" style={{ gap: SHEET_GAP }}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 rounded-lg overflow-hidden border bg-white shadow-sm"
              style={{ width: sheetW, height: sheetH, scrollSnapAlign: 'center' }}
            >
              {/* Fatia da página i: o documento inteiro escalado, transladado pra
                  cima em i folhas. overflow:hidden do pai recorta a 1 folha A4. */}
              <div
                style={{
                  width: A4_W,
                  transform: `scale(${scale}) translateY(${-i * A4_H}px)`,
                  transformOrigin: 'top left',
                }}
              >
                <ProposalRenderer
                  quote={quote}
                  company={company}
                  templateSlug={templateSlug}
                  customization={customization}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Lista vertical de modelos como CARROSSEL VERTICAL INFINITO (embla, loop).
 * Mostra ~3 itens por vez; com 3 modelos hoje os 3 aparecem e o loop é suave.
 * Preparado pra quando houver mais que 3 modelos (cicla sem fim). Cada item:
 * ícone autêntico do modelo (tingido pela cor) + nome + selo de selecionado.
 * Clicar seleciona e dispara a troca da capa na direita.
 */
function TemplatePickerCarousel({
  options,
  selectedSlug,
  onSelect,
  itemHeight,
}: {
  options: typeof TEMPLATE_OPTIONS;
  selectedSlug: string;
  onSelect: (slug: string) => void;
  itemHeight: number;
}) {
  // Mostra 3 itens visíveis; o container é alto o bastante pra 3 linhas + gaps.
  const visible = Math.min(3, options.length);
  const gap = 8; // pt-2 entre slides (embla usa -mt-4/pt-4 → aqui customizamos)
  const viewportH = visible * itemHeight + (visible - 1) * gap;

  return (
    <Carousel
      orientation="vertical"
      opts={{ loop: true, align: 'start', dragFree: false }}
      className="w-full"
    >
      <CarouselContent
        className="!mt-0"
        style={{ height: viewportH }}
      >
        {options.map((t) => {
          const active = selectedSlug === t.slug;
          const Icon = t.icon;
          return (
            <CarouselItem
              key={t.id}
              className="!pt-0 basis-auto"
              style={{ height: itemHeight, marginBottom: gap }}
            >
              <button
                type="button"
                onClick={() => onSelect(t.slug)}
                style={{ height: itemHeight }}
                className={cn(
                  'relative w-full flex items-center gap-2.5 px-3 rounded-xl border-2 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-muted-foreground/30',
                )}
              >
                {/* Ícone autêntico do modelo (substitui a bolinha lisa). Chip sutil
                    tingido pela cor do modelo; o ícone herda a cor do modelo. */}
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: `${t.preview_color}1f` }}
                >
                  <Icon className="h-5 w-5" style={{ color: t.preview_color }} />
                </span>
                <span className="font-semibold text-sm text-foreground truncate">{t.name}</span>
                {active && (
                  <span className="ml-auto h-5 w-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </span>
                )}
              </button>
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}

/**
 * Prévia A4 mostrando APENAS A CAPA (primeira folha) do modelo selecionado.
 * Reusa o template real renderizado por slug e RECORTA a altura a UMA folha A4
 * (1123px nativos): container com `overflow: hidden` e altura = `1123 * scale`,
 * mantendo a proporção 210:297. Assim a capa da prévia é EXATAMENTE a que o
 * cliente verá — só a primeira página, sem o documento inteiro.
 *
 * `maxHeight` (mobile) limita a altura visível da capa pra caber junto com a
 * lista numa view só; nesse caso a escala é derivada da altura, não da largura.
 */
function ProposalCoverPreview({
  quote,
  company,
  templateSlug,
  customization,
  maxHeight,
}: {
  quote: Quote;
  company: CompanySettings | null;
  templateSlug: string;
  customization: ProposalCustomization;
  maxHeight?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      let s = w / A4_W;
      // No mobile, limita pela altura máxima da capa (uma folha A4).
      if (maxHeight) {
        const maxScale = maxHeight / A4_H;
        if (s > maxScale) s = maxScale;
      }
      setScale(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  // Recorta a UMA folha A4 (capa). overflow hidden esconde o resto do documento.
  const coverH = Math.round(A4_H * scale);
  // Largura efetiva da capa quando limitada pela altura (mobile): centraliza.
  const coverW = maxHeight ? Math.round(A4_W * scale) : undefined;

  return (
    <div ref={wrapRef} className="w-full flex justify-center">
      <div
        className="rounded-xl overflow-hidden border shadow-sm bg-black/5"
        style={{ height: coverH, width: coverW ?? '100%' }}
      >
        <div
          style={{
            width: A4_W,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <ProposalRenderer
            quote={quote}
            company={company}
            templateSlug={templateSlug}
            customization={customization}
          />
        </div>
      </div>
    </div>
  );
}
