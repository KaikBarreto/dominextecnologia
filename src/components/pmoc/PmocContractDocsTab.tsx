import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  Globe,
  Table2,
  Palette,
  Building2,
  CalendarClock,
  Files,
} from 'lucide-react';
import { dateInTz, timeInTz } from '@/lib/timezone';
import {
  getDocumentValidityStatus,
  getValidityLabel,
  getValidityBadgeVariant,
  resolveValidUntil,
  type DocumentValidityStatus,
} from '@/lib/documentValidity';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import { PmocDocEditorDialog } from './PmocDocEditorDialog';
import { RtSignatureQuickDialog } from './RtSignatureQuickDialog';
import { CertificadoArtConfigDialog } from './CertificadoArtConfigDialog';
import { getDocArtTemplate } from '@/lib/docArt/templates';
import { ContractAttachmentsSection } from '@/components/contracts/ContractAttachmentsSection';
import {
  usePmocContractCustomDocs,
} from '@/hooks/usePmocContractCustomDocs';
import { useContracts } from '@/hooks/useContracts';
import { useCompanyPmocDocTemplates } from '@/hooks/useCompanyPmocDocTemplates';
import {
  usePmocDocuments,
  type PmocDocument,
  type PmocDocumentType,
  type PmocDocumentSignatureStatus,
} from '@/hooks/usePmocDocuments';
import {
  useGenerateDossiePdf,
  useGenerateCronogramaPdf,
  useGenerateTrtPdf,
  useGenerateCertificadoPdf,
  useGeneratePlanilhaPdf,
} from '@/hooks/useGeneratePmocDocument';
import {
  buildDefaultTermoRtHtml,
  buildDefaultCertificadoHtml,
  type PmocTemplateContext,
} from '@/utils/pmocDocumentTemplates';
import type { PmocVariableContext } from '@/utils/pmocVariables';

/**
 * Mapeia o shape "antigo" `PmocTemplateContext` (snake_case) pro shape "novo"
 * `PmocVariableContext` (chaves com ponto, igual ao `data-pmoc-var`). Mantém
 * o legado funcionando em ContractDetail sem precisar refatorar a montagem do
 * contexto lá.
 *
 * O conjunto novo é SUPERSET — adiciona chaves que ContractDetail ainda não
 * monta (ex: `empresa.email`, `rt.registro`, `cliente.cidade`,
 * `contrato.nome`). Pra essas, fica `undefined` → badge vermelho até alguém
 * estender a montagem do contexto em ContractDetail.
 */
/** Meses PT-BR lowercase pra `contrato.criado_mes` — espelha edge function. */
const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/**
 * Deriva dia/mês/ano em PT-BR a partir do ISO de `contracts.created_at`.
 * Usa o fuso da EMPRESA pra casar EXATAMENTE com a edge function
 * (`extractContractCreatedParts` também lê o instante no fuso da empresa),
 * evitando off-by-one quando o navegador do gestor está em outro fuso.
 */
function partsFromIso(
  iso: string | undefined,
  timeZone: string | null | undefined,
): { dia: string; mes: string; ano: string } {
  if (!iso) return { dia: '', mes: '', ano: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dia: '', mes: '', ano: '' };
  const [ano, mes, dia] = dateInTz(d, timeZone).split('-');
  return {
    dia,
    mes: MESES_PT_BR[Number(mes) - 1] ?? '',
    ano,
  };
}

function toVariableContext(
  ctx: Partial<PmocTemplateContext> | undefined,
  timeZone: string | null | undefined,
): PmocVariableContext {
  if (!ctx) return {};
  const created = partsFromIso(ctx.contract_created_at_iso, timeZone);
  return {
    'empresa.razao_social': ctx.empresa_razao_social,
    'empresa.cnpj': ctx.empresa_cnpj,
    'empresa.endereco': ctx.empresa_endereco,
    'empresa.cidade': ctx.cidade,
    'rt.nome': ctx.rt_nome,
    'rt.modalidade': ctx.rt_modalidade,
    'rt.cft_crea': ctx.rt_cft_crea,
    'cliente.nome': ctx.customer_name,
    'cliente.documento': ctx.customer_document,
    'cliente.endereco': ctx.customer_address,
    'contrato.frequencia': ctx.contract_frequency_label,
    'contrato.vigencia_inicio': ctx.contract_start_date_extenso,
    'contrato.criado_dia': created.dia,
    'contrato.criado_mes': created.mes,
    'contrato.criado_ano': created.ano,
    'data.hoje_extenso': ctx.generated_at_extenso,
  };
}

/**
 * Aba "Documentos" do contrato PMOC (Onda C — v1.9.x).
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.6 / §5.3 (passo 7)
 */

export interface PmocContractDocsTabProps {
  contractId: string;
  /**
   * Contexto pra pré-preencher placeholders dos templates. O componente é
   * tolerante a valores ausentes (cai em fallbacks `[empresa]`, `____`).
   */
  templateContext?: Partial<PmocTemplateContext>;
  /**
   * RT vinculado ao contrato. Quando informado e o TRT mais recente está com
   * `signature_status: 'pending'`, o card do TRT exibe o CTA "Adicionar
   * assinatura agora" abrindo um dialog que atualiza
   * `responsible_technicians.signature_image_url`.
   */
  responsibleTechnicianId?: string | null;
  /**
   * Estado atual do gate de documentos no portal público (2026-06). Vem do
   * contrato carregado em ContractDetail (`contracts.portal_documents_released`).
   * `true` → o cliente final vê os documentos no portal; `false` → ocultos.
   */
  portalDocumentsReleased?: boolean;
}

type DocsT = ReturnType<typeof useDocsT>;

function useDocsT() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.pmoc.docs;
}

/** Badge visual do status da assinatura embarcada num PDF PMOC (Onda E). */
function SignatureStatusBadge({ status, t }: { status: PmocDocumentSignatureStatus; t: DocsT }) {
  if (status === 'signed') {
    return (
      <Badge variant="success" className="gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {t.signedBadge}
      </Badge>
    );
  }
  if (status === 'pending') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {t.pendingSignatureBadge}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {t.notGeneratedBadge}
    </Badge>
  );
}

/**
 * "DD/MM/AAAA às HH:mm" do instante de geração, no fuso da EMPRESA
 * (`company_settings.timezone`), não no do navegador de quem está olhando.
 */
function formatGeneratedAt(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = dateInTz(iso, timeZone).split('-');
    return `${d}/${m}/${y} às ${timeInTz(iso, timeZone)}`;
  } catch {
    return '—';
  }
}

/** Formata um date-only "yyyy-MM-dd" como DD/MM/AAAA (sem off-by-one de fuso). */
function formatValidUntil(dateOnly?: string | null): string {
  if (!dateOnly) return '—';
  const m = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  const [, y, mm, d] = m;
  return `${d}/${mm}/${y}`;
}

/**
 * Selo de validade de um documento regulatório (TRT / Certificado). Cores via
 * tokens semânticos (verde/amarelo/vermelho). Retorna `null` quando não há
 * validade a exibir.
 *
 * Usa o `locale` do `useAppLocaleContext` para que o rótulo ("Vigente" /
 * "Valid" / "Vigente" / "Valide") reflita o idioma do usuário logado — e não
 * fique preso em pt-br independente do idioma configurado.
 */
function ValidityBadge({ status }: { status: DocumentValidityStatus }) {
  const { locale } = useAppLocaleContext();
  if (status === 'sem_validade') return null;
  return (
    <Badge variant={getValidityBadgeVariant(status)} className="text-[10px]">
      {getValidityLabel(status, locale)}
    </Badge>
  );
}

export function DocumentRow({
  icon: Icon,
  title,
  description,
  badges,
  metadata,
  actions,
  settings,
  emphasized = false,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  title: string;
  description: string;
  badges?: ReactNode;
  metadata?: ReactNode;
  actions: ReactNode;
  settings?: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <article className={cn('p-4 sm:p-5', emphasized && 'bg-muted/20')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            emphasized ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          )}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold tracking-tight text-foreground">{title}</h3>
              {badges}
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            {metadata && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                {metadata}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-[46%] lg:justify-end">
          {actions}
        </div>
      </div>
      {settings && <div className="mt-4 border-t border-border/70 pt-4">{settings}</div>}
    </article>
  );
}

export function PmocContractDocsTab({
  contractId,
  templateContext,
  responsibleTechnicianId,
  portalDocumentsReleased = false,
}: PmocContractDocsTabProps) {
  const t = useDocsT();
  // Fuso da EMPRESA (company_settings.timezone). Toda data desta aba, incluindo
  // o selo de validade dos documentos regulatórios, sai no calendário dela.
  const { timezone, locale } = useAppLocaleContext();
  const tCertArt = MESSAGES[locale].app.pmoc.certArt;
  const tTemplates = MESSAGES[locale].app.pmoc.templates;
  const {
    customDocs,
    saveTermoRT,
    saveCertificado,
    resetTermoRTToDefault,
    resetCertificadoToDefault,
    saveCertificadoValidity,
    isSavingCertificadoValidity,
    isSaving,
  } = usePmocContractCustomDocs(contractId);

  // Gate dos documentos no portal público — libera/oculta pro cliente final.
  const { setPortalDocumentsReleased } = useContracts();

  // Modelo padrão da empresa — fonte do botão "Puxar template padrão da empresa"
  // dentro de cada editor. NULL pra um doc = empresa nunca definiu modelo.
  const { templates: companyTemplates } = useCompanyPmocDocTemplates();

  const { documents, latestByType, isLoading: isLoadingDocs, refetch } = usePmocDocuments(contractId);

  const generateDossie = useGenerateDossiePdf();
  const generateTrt = useGenerateTrtPdf();
  const generateCertificado = useGenerateCertificadoPdf();
  const generatePlanilha = useGeneratePlanilhaPdf();

  const [editorOpen, setEditorOpen] = useState<'termo_rt' | 'certificado' | null>(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [artWizardOpen, setArtWizardOpen] = useState(false);

  // Onda H — templates default NÃO recebem mais ctx: emitem `<span
  // data-pmoc-var>` que vira badge visual no editor. Substituição pelo valor
  // real acontece (a) no NodeView do editor pra UX e (b) na edge function de
  // PDF pra rendering final.
  const defaultTermoRt = useMemo(() => buildDefaultTermoRtHtml(), []);
  const defaultCertificado = useMemo(() => buildDefaultCertificadoHtml(), []);

  // Contexto no shape novo (chaves com ponto). Passado ao editor via prop
  // `templateContext` pra pintar badges azul (cheio) / vermelho (vazio).
  const variableContext = useMemo(
    () => toVariableContext(templateContext, timezone),
    [templateContext, timezone],
  );

  const termoRtHtml = customDocs?.termo_rt_content ?? null;
  const certificadoHtml = customDocs?.certificado_content ?? null;

  // Modelo visual (arte) do Certificado — só pra exibir a dica "Modelo
  // visual: X" no card. O contrato HERDA o padrão da empresa quando não tem
  // o seu próprio (`certificado_art_slug: null`); a lógica de edição/
  // salvamento em si vive dentro do `CertificadoArtConfigDialog`.
  const certArtOwnSlug = customDocs?.certificado_art_slug ?? null;
  const certArtCompanySlug = companyTemplates?.certificado_art_slug ?? null;
  const certArtInherits = certArtOwnSlug === null;
  const certArtEffectiveSlug = certArtInherits ? certArtCompanySlug : certArtOwnSlug;
  const certArtEffectiveName = certArtEffectiveSlug
    ? getDocArtTemplate(certArtEffectiveSlug)?.name ?? certArtEffectiveSlug
    : null;
  const certArtModelNote = certArtEffectiveName ? (
    <>
      <Palette className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{tCertArt.cardCurrentModel.replace('{model}', certArtEffectiveName)}</span>
      <Badge variant="outline" className="text-[9px]">
        {certArtInherits ? tCertArt.cardBadgeInherited : tCertArt.cardBadgeOwn}
      </Badge>
    </>
  ) : null;

  const latestDossie = latestByType.dossie_pmoc;
  const latestTrt = latestByType.termo_rt;
  const latestCertificado = latestByType.certificado;
  const latestPlanilha = latestByType.planilha;
  const companyCertValidityMonths = companyTemplates?.certificado_validity_months ?? 12;
  const contractCertValidityMonths = customDocs?.certificado_validity_months ?? null;
  const effectiveCertValidityMonths = contractCertValidityMonths ?? companyCertValidityMonths;

  // Onda G — diagnóstico de campos faltantes no `templateContext`. Quando
  // algum campo crítico estiver vazio, exibimos banner warning no topo da aba
  // pra o gestor cadastrar ANTES de salvar/gerar (em vez de o template sair
  // com placeholder literal tipo "[CNPJ]" no PDF).
  const missingFields = useMemo(() => {
    const list: Array<{ label: string; href?: string }> = [];
    if (!templateContext?.empresa_razao_social) list.push({ label: t.missingCompanyName, href: '/configuracoes?tab=empresa' });
    if (!templateContext?.empresa_cnpj) list.push({ label: t.missingCompanyCnpj, href: '/configuracoes?tab=empresa' });
    if (!templateContext?.rt_nome) list.push({ label: t.missingRtName, href: '/responsaveis-tecnicos' });
    if (!templateContext?.rt_modalidade) list.push({ label: t.missingRtModality, href: '/responsaveis-tecnicos' });
    if (!templateContext?.rt_cft_crea) list.push({ label: t.missingRtCft, href: '/responsaveis-tecnicos' });
    // Cliente vinculado ao contrato — a Planilha PMOC (Seção 2 "Proprietário")
    // exige um cliente; sem ele a geração falha. Quando ausente, o nome do
    // cliente chega vazio no contexto (ContractDetail manda `''`).
    if (!templateContext?.customer_name?.trim()) {
      list.push({
        label: t.missingCustomer,
      });
    } else {
      // Cliente existe mas sem CNPJ/CPF ou endereço → Seção 2 "Proprietário"
      // sai incompleta na Planilha PMOC. Avisa sem disparar query nova.
      if (!templateContext?.customer_document?.trim()) {
        list.push({
          label: t.missingCustomerDoc,
        });
      }
      if (!templateContext?.customer_address?.trim()) {
        list.push({
          label: t.missingCustomerAddress,
        });
      }
    }
    return list;
  }, [templateContext, t]);

  // Status visual do TRT: signed | pending | null (não gerado).
  const trtStatus: PmocDocumentSignatureStatus = latestTrt
    ? latestTrt.signature_status ?? 'pending'
    : null;
  // Mesma lógica pro Certificado individual (também leva assinatura do RT).
  const certStatus: PmocDocumentSignatureStatus = latestCertificado
    ? latestCertificado.signature_status ?? 'pending'
    : null;
  // Mesma lógica pro Dossiê (também leva assinatura — Onda E).
  const dossieStatus: PmocDocumentSignatureStatus = latestDossie
    ? latestDossie.signature_status ?? 'pending'
    : null;

  // Validade dos documentos regulatórios (TRT / Certificado). Usa o
  // `valid_until` persistido; cai no fallback de exibição (generated_at + 12
  // meses) só pra docs legados gerados antes desta feature.
  const trtValidUntil = latestTrt
    ? resolveValidUntil(latestTrt.valid_until, latestTrt.generated_at)
    : null;
  const certValidUntil = latestCertificado
    ? resolveValidUntil(latestCertificado.valid_until, latestCertificado.generated_at)
    : null;
  // Fuso da empresa: sem ele, tenant em UTC-4 via "Vencido" ainda dentro do dia
  // do vencimento no relógio dele.
  const trtValidityStatus = getDocumentValidityStatus(trtValidUntil, new Date(), timezone);
  const certValidityStatus = getDocumentValidityStatus(certValidUntil, new Date(), timezone);
  const hasExpiredDoc =
    trtValidityStatus === 'vencido' || certValidityStatus === 'vencido';

  const handleGenerateDossie = async () => {
    await generateDossie.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGenerateTrt = async () => {
    await generateTrt.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGenerateCertificado = async () => {
    await generateCertificado.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGeneratePlanilha = async () => {
    await generatePlanilha.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleCertValidityChange = async (value: string) => {
    await saveCertificadoValidity(value === 'inherit' ? null : Number(value));
  };

  return (
    <div className="space-y-6">
      {/* Documentos vencidos — alerta no topo (validade regulatória PMOC). */}
      {hasExpiredDoc && (
        <NoticeBanner variant="destructive" title={t.expiredAlert}>
          {trtValidityStatus === 'vencido' && certValidityStatus === 'vencido'
            ? t.expiredAlertDescBoth
            : trtValidityStatus === 'vencido'
              ? t.expiredAlertDescTrt
              : t.expiredAlertDescCert}
        </NoticeBanner>
      )}

      {/* Onda G — banner de campos obrigatórios faltando. Avisa o gestor antes
          dele gerar documento com placeholder literal no PDF. */}
      {missingFields.length > 0 && (
        <NoticeBanner variant="warning" title={t.missingFieldsAlert}>
          <div className="space-y-2">
            <p>
              {t.missingFieldsDesc}
            </p>
            <ul className="ml-4 list-disc space-y-0.5">
              {missingFields.map((f) => (
                <li key={f.label}>
                  {f.href ? (
                    <Link to={f.href} className="underline hover:opacity-80">
                      {f.label}
                    </Link>
                  ) : (
                    f.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </NoticeBanner>
      )}

      {/* Gate do portal público — libera/oculta os documentos pro cliente final.
          Quando liberado, o cliente vê Dossiê, Termo, Certificado e Cronograma
          no portal público da unidade (QR Code). Ação neutra/primária. */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden border-0 bg-muted/25 shadow-none">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                portalDocumentsReleased ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              <Globe className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{t.portalGateTitle}</p>
                <Badge variant={portalDocumentsReleased ? 'success' : 'outline'} className="gap-1 text-[10px]">
                  {portalDocumentsReleased ? (
                    <>
                      <Eye className="h-3 w-3" aria-hidden="true" /> {t.portalGateLiberado}
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3 w-3" aria-hidden="true" /> {t.portalGateOculto}
                    </>
                  )}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.portalGateDesc}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={portalDocumentsReleased ? 'outline' : 'default'}
            onClick={() =>
              setPortalDocumentsReleased.mutate({
                contractId,
                released: !portalDocumentsReleased,
              })
            }
            disabled={setPortalDocumentsReleased.isPending}
            className="min-h-11 shrink-0 active:scale-[0.97] transition-transform rounded-xl"
          >
            {setPortalDocumentsReleased.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : portalDocumentsReleased ? (
              <EyeOff className="mr-1.5 h-4 w-4" />
            ) : (
              <Eye className="mr-1.5 h-4 w-4" />
            )}
            {portalDocumentsReleased ? t.portalGateHideBtn : t.portalGateReleaseBtn}
          </Button>
        </CardContent>
      </Card>

      {trtStatus === 'pending' && (
        <NoticeBanner variant="warning" title={t.rtSignaturePendingTitle}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{t.rtSignaturePendingDesc}</p>
            <Button
              size="sm"
              variant="secondary"
              className="min-h-10 shrink-0"
              onClick={() => setSignatureDialogOpen(true)}
              disabled={!responsibleTechnicianId}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {t.rtSignatureAddBtn}
            </Button>
          </div>
        </NoticeBanner>
      )}

      <section className="space-y-3" aria-labelledby="pmoc-documents-title">
        <div>
          <h2 id="pmoc-documents-title" className="text-xl font-bold tracking-tight text-foreground">
            {t.officialDocumentsTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.officialDocumentsDesc}</p>
        </div>

        <Card className="overflow-hidden border-border/80 shadow-none">
          <div className="divide-y divide-border/80">
            <DocumentRow
              icon={Building2}
              title={t.certContractTitle}
              description={t.certContractDesc}
              emphasized
              badges={
                <>
                  {latestCertificado && <Badge variant="secondary">v{latestCertificado.version}</Badge>}
                  <SignatureStatusBadge status={certStatus} t={t} />
                  {latestCertificado && <ValidityBadge status={certValidityStatus} />}
                </>
              }
              metadata={
                <>
                  <span>{t.dossieLastGenerated}: {formatGeneratedAt(latestCertificado?.generated_at, timezone)}</span>
                  {latestCertificado && certValidUntil && (
                    <span>{t.certValidUntil} {formatValidUntil(certValidUntil)}</span>
                  )}
                  {certArtModelNote}
                </>
              }
              actions={
                <>
                  {latestCertificado?.pdf_storage_path && (
                    <DownloadLatestButton doc={latestCertificado} label={t.certDownloadBtn} />
                  )}
                  <Button
                    size="sm"
                    onClick={handleGenerateCertificado}
                    disabled={generateCertificado.isPending}
                    className="min-h-11 rounded-xl"
                  >
                    {generateCertificado.isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                    )}
                    {latestCertificado ? t.certRegenerateBtn : t.certGenerateBtn}
                  </Button>
                </>
              }
              settings={
                <div className="grid gap-4 rounded-xl bg-background/80 p-4 sm:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="contract-cert-validity" className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                      {tTemplates.certValidityLabel}
                    </Label>
                    <Select
                      value={contractCertValidityMonths === null ? 'inherit' : String(contractCertValidityMonths)}
                      onValueChange={handleCertValidityChange}
                      disabled={isSavingCertificadoValidity}
                    >
                      <SelectTrigger id="contract-cert-validity" className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">
                          {t.validityInherit.replace('{n}', String(companyCertValidityMonths))}
                        </SelectItem>
                        {[3, 6, 12, 18, 24, 36].map((months) => (
                          <SelectItem key={months} value={String(months)}>
                            {t.validityMonths.replace('{n}', String(months))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t.validityEffective.replace('{n}', String(effectiveCertValidityMonths))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setArtWizardOpen(true)}
                      className="min-h-11 rounded-xl"
                    >
                      <Palette className="mr-1.5 h-4 w-4" />
                      {tCertArt.openWizardBtn}
                    </Button>
                    <Button
                      variant="edit-ghost"
                      size="sm"
                      className="min-h-11 rounded-xl"
                      onClick={() => setEditorOpen('certificado')}
                    >
                      <Pencil className="mr-1.5 h-4 w-4" />
                      {t.editTextBtn}
                    </Button>
                  </div>
                </div>
              }
            />

            <DocumentRow
              icon={FileText}
              title={t.trtTitle}
              description={t.trtTooltip}
              badges={
                <>
                  {latestTrt && <Badge variant="secondary">v{latestTrt.version}</Badge>}
                  <SignatureStatusBadge status={trtStatus} t={t} />
                  {latestTrt && <ValidityBadge status={trtValidityStatus} />}
                  <Badge variant="outline">{termoRtHtml ? t.customized : t.defaultText}</Badge>
                </>
              }
              metadata={
                <>
                  <span>{t.dossieLastGenerated}: {formatGeneratedAt(latestTrt?.generated_at, timezone)}</span>
                  {latestTrt && trtValidUntil && <span>{t.trtValidUntil} {formatValidUntil(trtValidUntil)}</span>}
                </>
              }
              actions={
                <>
                  <Button variant="edit-ghost" size="sm" className="min-h-11 rounded-xl" onClick={() => setEditorOpen('termo_rt')}>
                    <Pencil className="mr-1.5 h-4 w-4" />
                    {t.editTextBtn}
                  </Button>
                  {latestTrt?.pdf_storage_path && <DownloadLatestButton doc={latestTrt} label={t.trtDownloadBtn} />}
                  <Button size="sm" variant="outline" onClick={handleGenerateTrt} disabled={generateTrt.isPending} className="min-h-11 rounded-xl">
                    {generateTrt.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                    {latestTrt ? t.trtRegenerateBtn : t.trtGenerateBtn}
                  </Button>
                </>
              }
            />

            <DocumentRow
              icon={Files}
              title={t.dossieTitle}
              description={t.dossieDesc}
              badges={
                <>
                  {latestDossie && <Badge variant="secondary">v{latestDossie.version}</Badge>}
                  <SignatureStatusBadge status={dossieStatus} t={t} />
                </>
              }
              metadata={<span>{t.dossieLastGenerated}: {formatGeneratedAt(latestDossie?.generated_at, timezone)}</span>}
              actions={
                <>
                  {latestDossie?.pdf_storage_path && <DownloadLatestButton doc={latestDossie} label={t.dossieDownloadBtn} />}
                  <Button size="sm" variant="outline" onClick={handleGenerateDossie} disabled={generateDossie.isPending} className="min-h-11 rounded-xl">
                    {generateDossie.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                    {latestDossie ? t.dossieRegenerateBtn : t.dossieGenerateBtn}
                  </Button>
                </>
              }
            />

            <DocumentRow
              icon={Table2}
              title={t.planilhaTitle}
              description={t.planilhaDesc}
              badges={latestPlanilha ? <Badge variant="secondary">v{latestPlanilha.version}</Badge> : undefined}
              metadata={<span>{t.planilhaLastGenerated}: {formatGeneratedAt(latestPlanilha?.generated_at, timezone)}</span>}
              actions={
                <>
                  {latestPlanilha?.pdf_storage_path && <DownloadLatestButton doc={latestPlanilha} label={t.planilhaDownloadBtn} />}
                  <Button size="sm" variant="outline" onClick={handleGeneratePlanilha} disabled={generatePlanilha.isPending} className="min-h-11 rounded-xl">
                    {generatePlanilha.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                    {latestPlanilha ? t.planilhaRegenerateBtn : t.planilhaGenerateBtn}
                  </Button>
                </>
              }
            />
          </div>
        </Card>
      </section>

      {/* Histórico de versões */}
      <VersionHistory documents={documents} isLoading={isLoadingDocs} t={t} />

      {/* Anexos externos — card abaixo dos documentos gerados */}
      <ContractAttachmentsSection contractId={contractId} />

      {/* Editores */}
      <PmocDocEditorDialog
        open={editorOpen === 'termo_rt'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title={t.editorTrtTitle}
        initialHtml={termoRtHtml}
        defaultHtml={defaultTermoRt}
        onSave={saveTermoRT}
        onResetToDefault={resetTermoRTToDefault}
        onPullCompanyTemplate={() => companyTemplates?.termo_rt_content ?? defaultTermoRt}
        pullCompanyTemplateDisabled={!companyTemplates?.termo_rt_content}
        isSaving={isSaving}
        helperText={t.editorTrtHelper}
        templateContext={variableContext}
      />
      <PmocDocEditorDialog
        open={editorOpen === 'certificado'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title={t.editorCertTitle}
        initialHtml={certificadoHtml}
        defaultHtml={defaultCertificado}
        onSave={saveCertificado}
        onResetToDefault={resetCertificadoToDefault}
        onPullCompanyTemplate={() => companyTemplates?.certificado_content ?? defaultCertificado}
        pullCompanyTemplateDisabled={!companyTemplates?.certificado_content}
        isSaving={isSaving}
        helperText={t.editorCertHelper}
        templateContext={variableContext}
      />

      {/* Onda E — atalho rápido pra cadastrar assinatura do RT do contrato. */}
      <RtSignatureQuickDialog
        open={signatureDialogOpen}
        onOpenChange={setSignatureDialogOpen}
        responsibleTechnicianId={responsibleTechnicianId ?? null}
      />

      {/* Modelo visual (arte) do Certificado — 2026-10. Edita o override
          deste CONTRATO (herda da empresa quando não tem o seu próprio). */}
      <CertificadoArtConfigDialog
        open={artWizardOpen}
        onOpenChange={setArtWizardOpen}
        contractId={contractId}
        responsibleTechnicianId={responsibleTechnicianId}
        variableContext={variableContext}
      />
    </div>
  );
}

/**
 * Botão de download da última versão de um doc PMOC.
 *
 * Por enquanto, baixa via signed URL gerada pela edge function (a Database
 * vai expor um endpoint `pmoc-document-signed-url` ou retornar URL na edge
 * function de geração). Como ainda não temos esse endpoint na Onda C parcial,
 * o handler chama a mesma edge de geração — que faz cache hit quando hash
 * não mudou e retorna a URL existente.
 */
function DownloadLatestButton({
  doc,
  label,
}: {
  doc: PmocDocument;
  label: string;
}) {
  const generateDossie = useGenerateDossiePdf();
  const generateCronograma = useGenerateCronogramaPdf();
  const generateTrt = useGenerateTrtPdf();
  const generateCertificado = useGenerateCertificadoPdf();
  const generatePlanilha = useGeneratePlanilhaPdf();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      let result;
      if (doc.doc_type === 'dossie_pmoc') {
        result = await generateDossie.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'cronograma_anual') {
        result = await generateCronograma.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'certificado') {
        result = await generateCertificado.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'planilha') {
        result = await generatePlanilha.mutateAsync({ contract_id: doc.contract_id });
      } else {
        // termo_rt (Onda E)
        result = await generateTrt.mutateAsync({ contract_id: doc.contract_id });
      }
      if (result.pdf_url) {
        window.open(result.pdf_url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      className="min-h-11 sm:min-h-[40px] active:scale-[0.97] transition-transform rounded-xl"
    >
      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
      {label}
    </Button>
  );
}

function VersionHistory({
  documents,
  isLoading,
  t,
}: {
  documents: PmocDocument[];
  isLoading: boolean;
  t: DocsT;
}) {
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="w-full border-0 bg-muted/25 shadow-none">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          {t.versionHistoryLoading}
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="w-full border-0 bg-muted/25 shadow-none">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          {t.versionHistoryEmpty}
        </CardContent>
      </Card>
    );
  }

  // Agrupar por doc_type
  const byType = documents.reduce<Record<PmocDocumentType, PmocDocument[]>>(
    (acc, d) => {
      (acc[d.doc_type] ||= []).push(d);
      return acc;
    },
    { dossie_pmoc: [], cronograma_anual: [], termo_rt: [], certificado: [], planilha: [] },
  );

  return (
    <Card className="w-full border-0 bg-transparent shadow-none">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between gap-2 px-4 py-3 text-left min-h-11',
              'text-sm font-semibold active:scale-[0.995] transition-transform',
            )}
          >
            <span>{t.versionHistoryTitle.replace('{n}', String(documents.length))}</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t pt-4">
            <TypeBlock title={t.trtTitle} docs={byType.termo_rt} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.certTitle} docs={byType.certificado} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.dossieTitle} docs={byType.dossie_pmoc} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.planilhaTitle} docs={byType.planilha} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.cronogramaAnualTitle} docs={byType.cronograma_anual} downloadLabel={t.downloadBtn} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function TypeBlock({ title, docs, downloadLabel }: { title: string; docs: PmocDocument[]; downloadLabel: string }) {
  // Fuso da empresa (não o do navegador do gestor) — regra do time.
  const { timezone } = useAppLocaleContext();
  if (docs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {docs.map(d => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-muted/25 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                v{d.version}{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  • {formatGeneratedAt(d.generated_at, timezone)}
                </span>
              </p>
            </div>
            <DownloadLatestButton doc={d} label={downloadLabel} />
          </li>
        ))}
      </ul>
    </div>
  );
}
