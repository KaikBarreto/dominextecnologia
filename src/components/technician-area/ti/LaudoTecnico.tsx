import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToolDisclaimer } from '../ToolDisclaimer';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { pdfDownloadAssets } from '@/utils/pdfDownloadButton';
import { escapeHtml } from '@/utils/escapeHtml';
import { buildCompanyDocumentHeader, buildDominexDocumentFooter } from '@/utils/companyDocumentHeader';
import { useToast } from '@/hooks/use-toast';

// ── Tipos de aparelho ────────────────────────────────────────────────────────
type DeviceType = 'celular' | 'notebook' | 'desktop' | 'tablet' | 'outro';

function openHTMLInNewTab(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.onload = () => URL.revokeObjectURL(url);
  } else {
    URL.revokeObjectURL(url);
  }
}

/** Gera o HTML A4 do laudo técnico usando o padrão pdfDownloadAssets. */
function generateLaudoHtml(opts: {
  settings: CompanySettings | null | undefined;
  whiteLabel: boolean;
  deviceType: string;
  brand: string;
  model: string;
  imei: string;
  problem: string;
  diagnosis: string;
  service: string;
  parts: string;
  opinion: string;
  technician: string;
  warrantyDays: string;
  date: string;
  t: ReturnType<typeof useLaudoT>;
}): string {
  const {
    settings,
    whiteLabel, deviceType, brand, model, imei,
    problem, diagnosis, service, parts, opinion,
    technician, warrantyDays, date, t,
  } = opts;

  const safeDate = escapeHtml(date);
  const safeTechnician = escapeHtml(technician);
  const safeDevice = escapeHtml(deviceType);
  const safeBrand = escapeHtml(brand);
  const safeModel = escapeHtml(model);
  const safeImei = escapeHtml(imei);
  const safeProblem = escapeHtml(problem).replace(/\n/g, '<br>');
  const safeDiagnosis = escapeHtml(diagnosis).replace(/\n/g, '<br>');
  const safeService = escapeHtml(service).replace(/\n/g, '<br>');
  const safeParts = escapeHtml(parts).replace(/\n/g, '<br>');
  const safeOpinion = escapeHtml(opinion).replace(/\n/g, '<br>');
  const safeWarranty = escapeHtml(warrantyDays);

  // Cabeçalho e rodapé canônicos (logo + toggles + white-label)
  const companyHeader = buildCompanyDocumentHeader(settings);
  const dominexFooter = buildDominexDocumentFooter(whiteLabel);

  const sectionStyle = 'margin-bottom:20px;';
  const labelStyle = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:4px;';
  const valueStyle = 'font-size:13px;color:#111827;line-height:1.6;';
  const dividerStyle = 'border:none;border-top:1px solid #e5e7eb;margin:16px 0;';

  const renderSection = (title: string, content: string) => `
    <div style="${sectionStyle}">
      <p style="${labelStyle}">${escapeHtml(title)}</p>
      <p style="${valueStyle}">${content}</p>
    </div>`;

  const warrantyText = warrantyDays && Number(warrantyDays) > 0
    ? t.pdfWarrantyDays.replace('{n}', safeWarranty)
    : '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(t.pdfTitle)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; color: #111827; }
    .no-print { }
    @media print {
      body { background: white; }
      .no-print { display: none !important; }
    }
    #pdf-root {
      background: white;
      max-width: 740px;
      margin: 32px auto;
      padding: 48px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    @media print {
      #pdf-root { margin: 0; box-shadow: none; border-radius: 0; padding: 32px; }
    }
  </style>
</head>
<body>
<div id="pdf-root">
  <!-- Cabeçalho: logo + dados da empresa respeitando toggles show_*_in_documents -->
  <div data-pdf-keep>
    ${companyHeader}
  </div>

  <!-- Título do documento -->
  <div style="text-align:center;margin-bottom:20px;" data-pdf-keep>
    <h1 style="font-size:20px;font-weight:700;color:#111827;letter-spacing:0.02em;">${escapeHtml(t.pdfTitle)}</h1>
    <p style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(t.pdfDateLabel)} ${safeDate}</p>
  </div>

  <hr style="${dividerStyle}">

  <!-- Dados do Equipamento -->
  <div data-pdf-keep>
    <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#374151;margin-bottom:12px;">${escapeHtml(t.pdfDeviceSection)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:8px;">
      ${renderSection(t.deviceTypeLabel, safeDevice)}
      ${renderSection(t.brandLabel, safeBrand || '—')}
      ${renderSection(t.modelLabel, safeModel || '—')}
    </div>
    ${safeImei ? renderSection(t.imeiLabel, safeImei) : ''}
  </div>

  <hr style="${dividerStyle}">

  <!-- Diagnóstico -->
  ${problem ? `
  <div data-pdf-keep>
    <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#374151;margin-bottom:12px;">${escapeHtml(t.problemLabel)}</h2>
    <p style="${valueStyle}">${safeProblem}</p>
  </div>
  <hr style="${dividerStyle}">
  ` : ''}

  <div data-pdf-keep>
    <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#374151;margin-bottom:12px;">${escapeHtml(t.pdfDiagnosisSection)}</h2>
    <p style="${valueStyle}">${safeDiagnosis || '—'}</p>
  </div>

  ${service ? `
  <hr style="${dividerStyle}">
  <div data-pdf-keep>
    <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#374151;margin-bottom:12px;">${escapeHtml(t.pdfServiceSection)}</h2>
    <p style="${valueStyle}">${safeService}</p>
  </div>
  ` : ''}

  ${parts ? `
  <hr style="${dividerStyle}">
  <div data-pdf-keep>
    <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#374151;margin-bottom:12px;">${escapeHtml(t.pdfPartsSection)}</h2>
    <p style="${valueStyle}">${safeParts}</p>
  </div>
  ` : ''}

  ${opinion ? `
  <hr style="${dividerStyle}">
  <div data-pdf-keep>
    <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#374151;margin-bottom:12px;">${escapeHtml(t.pdfOpinionSection)}</h2>
    <p style="${valueStyle}">${safeOpinion}</p>
  </div>
  ` : ''}

  <hr style="${dividerStyle}">

  <!-- Técnico e Garantia -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;" data-pdf-keep>
    <div>
      <p style="${labelStyle}">${escapeHtml(t.pdfTechnicianSection)}</p>
      <p style="${valueStyle}">${safeTechnician || '—'}</p>
    </div>
    <div>
      <p style="${labelStyle}">${escapeHtml(t.pdfWarrantyLabel)}</p>
      <p style="${valueStyle}">${warrantyText}</p>
    </div>
  </div>

  <!-- Rodapé -->
  ${dominexFooter}
</div>

${pdfDownloadAssets({
    filename: `laudo-tecnico-${(brand || 'aparelho').replace(/\s+/g, '-').toLowerCase()}`,
    label: escapeHtml(t.generateBtn),
    targetSelector: '#pdf-root',
  })}
</body>
</html>`;
}

// Hook auxiliar para extrair o namespace do i18n
function useLaudoT() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.technicianTools.laudoTecnico;
}

export function LaudoTecnico() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.laudoTecnico;
  const { settings } = useCompanySettings();
  const { enabled: wlEnabled } = useWhiteLabel();
  const { toast } = useToast();

  // Estado do formulário
  const [deviceType, setDeviceType] = useState<DeviceType>('celular');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [imei, setImei] = useState('');
  const [problem, setProblem] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [service, setService] = useState('');
  const [parts, setParts] = useState('');
  const [opinion, setOpinion] = useState('');
  const [technician, setTechnician] = useState('');
  const [warrantyDays, setWarrantyDays] = useState('90');
  const [date] = useState(() => new Date().toLocaleDateString('pt-BR'));

  const deviceTypeOptions: { value: DeviceType; label: string }[] = [
    { value: 'celular',   label: t.deviceTypeCelular },
    { value: 'notebook',  label: t.deviceTypeNotebook },
    { value: 'desktop',   label: t.deviceTypeDesktop },
    { value: 'tablet',    label: t.deviceTypeTablet },
    { value: 'outro',     label: t.deviceTypeOutro },
  ];

  const deviceTypeLabel = deviceTypeOptions.find((o) => o.value === deviceType)?.label ?? deviceType;

  const handleGenerate = () => {
    if (!deviceType || !diagnosis.trim()) {
      toast({
        title: t.emptyForm,
        variant: 'destructive',
      });
      return;
    }

    const html = generateLaudoHtml({
      settings: settings ?? null,
      whiteLabel: wlEnabled,
      deviceType: deviceTypeLabel,
      brand,
      model,
      imei,
      problem,
      diagnosis,
      service,
      parts,
      opinion,
      technician,
      warrantyDays,
      date,
      t,
    });

    openHTMLInNewTab(html);
  };

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">{t.subtitle}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        {/* Tipo de aparelho */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.deviceTypeLabel}</Label>
          <Select value={deviceType} onValueChange={(v) => setDeviceType(v as DeviceType)}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deviceTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Marca e Modelo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.brandLabel}</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder={t.brandPlaceholder}
              className="h-14 text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.modelLabel}</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t.modelPlaceholder}
              className="h-14 text-lg"
            />
          </div>
        </div>

        {/* IMEI / Número de série */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.imeiLabel}</Label>
          <Input
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            placeholder={t.imeiPlaceholder}
            className="h-14 text-lg"
          />
        </div>

        {/* Problema relatado */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.problemLabel}</Label>
          <Textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder={t.problemPlaceholder}
            rows={3}
            className="resize-y"
          />
        </div>

        {/* Diagnóstico técnico */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.diagnosisLabel}</Label>
          <Textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder={t.diagnosisPlaceholder}
            rows={3}
            className="resize-y"
          />
        </div>

        {/* Serviço realizado */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.serviceLabel}</Label>
          <Textarea
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder={t.servicePlaceholder}
            rows={3}
            className="resize-y"
          />
        </div>

        {/* Peças utilizadas */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.partsLabel}</Label>
          <Textarea
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            placeholder={t.partsPlaceholder}
            rows={3}
            className="resize-y"
          />
        </div>

        {/* Parecer técnico */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.opinionLabel}</Label>
          <Textarea
            value={opinion}
            onChange={(e) => setOpinion(e.target.value)}
            placeholder={t.opinionPlaceholder}
            rows={3}
            className="resize-y"
          />
        </div>

        {/* Técnico responsável e Garantia */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.technicianLabel}</Label>
            <Input
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
              placeholder={t.technicianPlaceholder}
              className="h-14 text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.warrantyLabel}</Label>
            <NumericInput
              value={warrantyDays}
              onValueChange={setWarrantyDays}
              className="h-14 text-lg"
            />
          </div>
        </div>

        {/* Data (readonly) */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.dateLabel}</Label>
          <Input value={date} readOnly className="h-14 text-lg bg-muted/40 cursor-default" />
        </div>
      </div>

      {/* Botão de geração */}
      <Button
        type="button"
        className="w-full gap-2"
        onClick={handleGenerate}
      >
        <FileText className="h-4 w-4" />
        {t.generateBtn}
      </Button>

      <ToolDisclaimer texto={t.disclaimer} />
    </div>
  );
}
