import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Globe,
  Table2,
  Palette,
  Building2,
  CalendarClock,
  Files,
  ChevronRight,
  History,
  Settings2,
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
import { Card } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
  useGenerateTrtPdf,
  useGenerateCertificadoPdf,
  useGeneratePlanilhaPdf,
} from '@/hooks/useGeneratePmocDocument';
import { useToast } from '@/hooks/use-toast';
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
type ManagedDocumentType = Exclude<PmocDocumentType, 'cronograma_anual'>;

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

  const {
    documents,
    latestByType,
    isLoading: isLoadingDocs,
    error: documentsError,
    refetch,
    getSignedDownloadUrl,
  } = usePmocDocuments(contractId);

  const generateDossie = useGenerateDossiePdf();
  const generateTrt = useGenerateTrtPdf();
  const generateCertificado = useGenerateCertificadoPdf();
  const generatePlanilha = useGeneratePlanilhaPdf();

  const [editorOpen, setEditorOpen] = useState<'termo_rt' | 'certificado' | null>(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [artWizardOpen, setArtWizardOpen] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState<ManagedDocumentType | null>(null);

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
  };
  const handleGenerateTrt = async () => {
    await generateTrt.mutateAsync({ contract_id: contractId });
  };
  const handleGenerateCertificado = async () => {
    await generateCertificado.mutateAsync({ contract_id: contractId });
  };
  const handleGeneratePlanilha = async () => {
    await generatePlanilha.mutateAsync({ contract_id: contractId });
  };
  const handleCertValidityChange = async (value: string) => {
    await saveCertificadoValidity(value === 'inherit' ? null : Number(value));
  };

  const generationBlocked = missingFields.length > 0;
  const generationBlockedTitle = generationBlocked ? t.generationBlockedHint : undefined;
  const documentCatalog: Array<{
    type: ManagedDocumentType;
    icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
    title: string;
    description: string;
    latest?: PmocDocument;
    badges: ReactNode;
    metadata: ReactNode;
  }> = [
    {
      type: 'certificado',
      icon: Building2,
      title: t.certContractTitle,
      description: t.certContractDesc,
      latest: latestCertificado,
      badges: (
        <>
          {latestCertificado && <Badge variant="secondary">v{latestCertificado.version}</Badge>}
          <SignatureStatusBadge status={certStatus} t={t} />
          {latestCertificado && <ValidityBadge status={certValidityStatus} />}
        </>
      ),
      metadata: (
        <>
          <span>{t.dossieLastGenerated}: {formatGeneratedAt(latestCertificado?.generated_at, timezone)}</span>
          {latestCertificado && certValidUntil && <span>{t.certValidUntil} {formatValidUntil(certValidUntil)}</span>}
          {certArtModelNote}
        </>
      ),
    },
    {
      type: 'termo_rt',
      icon: FileText,
      title: t.trtTitle,
      description: t.trtTooltip,
      latest: latestTrt,
      badges: (
        <>
          {latestTrt && <Badge variant="secondary">v{latestTrt.version}</Badge>}
          <SignatureStatusBadge status={trtStatus} t={t} />
          {latestTrt && <ValidityBadge status={trtValidityStatus} />}
          <Badge variant="outline">{termoRtHtml ? t.customized : t.defaultText}</Badge>
        </>
      ),
      metadata: (
        <>
          <span>{t.dossieLastGenerated}: {formatGeneratedAt(latestTrt?.generated_at, timezone)}</span>
          {latestTrt && trtValidUntil && <span>{t.trtValidUntil} {formatValidUntil(trtValidUntil)}</span>}
        </>
      ),
    },
    {
      type: 'dossie_pmoc',
      icon: Files,
      title: t.dossieTitle,
      description: t.dossieDesc,
      latest: latestDossie,
      badges: (
        <>
          {latestDossie && <Badge variant="secondary">v{latestDossie.version}</Badge>}
          <SignatureStatusBadge status={dossieStatus} t={t} />
        </>
      ),
      metadata: <span>{t.dossieLastGenerated}: {formatGeneratedAt(latestDossie?.generated_at, timezone)}</span>,
    },
    {
      type: 'planilha',
      icon: Table2,
      title: t.planilhaTitle,
      description: t.planilhaDesc,
      latest: latestPlanilha,
      badges: latestPlanilha ? <Badge variant="secondary">v{latestPlanilha.version}</Badge> : <SignatureStatusBadge status={null} t={t} />,
      metadata: <span>{t.planilhaLastGenerated}: {formatGeneratedAt(latestPlanilha?.generated_at, timezone)}</span>,
    },
  ];
  const selectedDocument = documentCatalog.find((document) => document.type === selectedDocumentType) ?? null;
  const SelectedDocumentIcon = selectedDocument?.icon ?? FileText;

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

        <div>
          <div className="flex min-h-14 items-center justify-between gap-4 rounded-t-lg bg-primary px-4 py-3 text-primary-foreground sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <Globe className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-bold">{t.portalGateTitle}</p>
                <p className="text-xs text-primary-foreground/70">{t.portalGateCompactDesc}</p>
              </div>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 self-start text-xs font-bold sm:self-center">
              <span className="hidden sm:inline">{portalDocumentsReleased ? t.portalGateLiberado : t.portalGateOculto}</span>
              {setPortalDocumentsReleased.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-label={t.portalGateUpdatingLabel} />
              ) : (
                <Switch
                  checked={portalDocumentsReleased}
                  onCheckedChange={(released) => setPortalDocumentsReleased.mutate({ contractId, released })}
                  aria-label={t.portalGateToggleLabel}
                  className="data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-primary-foreground/30 [&[data-state=checked]>span]:bg-primary [&[data-state=unchecked]>span]:bg-primary-foreground"
                />
              )}
            </label>
          </div>

          {isLoadingDocs ? (
            <DocumentsWorkspaceSkeleton />
          ) : documentsError ? (
            <div className="rounded-b-lg border border-t-0 border-border/80 p-4">
              <NoticeBanner variant="destructive" title={t.documentsLoadErrorTitle}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p>{t.documentsLoadErrorDesc}</p>
                  <Button size="sm" variant="secondary" className="min-h-10 shrink-0" onClick={() => refetch()}>
                    <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t.retryBtn}
                  </Button>
                </div>
              </NoticeBanner>
            </div>
          ) : (
          <Card className="overflow-hidden rounded-t-none border-t-0 border-border/80 shadow-none">
            <div className="grid md:min-h-[500px] md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
              <aside
                className={cn(
                  'border-border/80 md:border-r',
                  selectedDocumentType ? 'hidden md:block' : 'block',
                )}
                aria-label={t.documentsListAriaLabel}
              >
                <div className="border-b border-border/80 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t.documentsListTitle}
                  </p>
                </div>
                <nav className="divide-y divide-border/70">
                  {documentCatalog.map((document) => {
                    const Icon = document.icon;
                    const selected = selectedDocumentType === document.type;
                    return (
                      <button
                        key={document.type}
                        type="button"
                        className={cn(
                          'group flex min-h-[104px] w-full items-start gap-3 border-l-[3px] px-4 py-4 text-left transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                          selected
                            ? 'border-l-primary bg-muted/60'
                            : 'border-l-transparent hover:bg-muted/35',
                        )}
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => setSelectedDocumentType(document.type)}
                      >
                        <span className={cn(
                          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground group-hover:bg-muted/80',
                        )}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold leading-snug text-foreground">{document.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {document.latest ? `v${document.latest.version} · ${formatGeneratedAt(document.latest.generated_at, timezone)}` : t.notGeneratedBadge}
                          </span>
                        </span>
                        <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </button>
                    );
                  })}
                </nav>
              </aside>

              <div
                className={cn(
                  'min-w-0 bg-background',
                  selectedDocument ? 'block' : 'hidden md:flex md:items-center md:justify-center',
                )}
                aria-live="polite"
              >
                {!selectedDocument ? (
                  <div className="max-w-sm px-8 py-14 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground">
                      <FileText className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-foreground">{t.selectDocumentTitle}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.selectDocumentDesc}</p>
                  </div>
                ) : (
                  <div className="w-full min-w-0">
                    <div className="border-b border-border/80 p-4 sm:p-5 lg:p-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mb-3 -ml-2 min-h-10 md:hidden"
                        onClick={() => setSelectedDocumentType(null)}
                      >
                        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t.backToDocumentsBtn}
                      </Button>

                      <div>
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex min-w-0 items-start gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <SelectedDocumentIcon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-extrabold tracking-tight text-foreground">{selectedDocument.title}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {selectedDocument.badges}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                          {selectedDocument.latest?.pdf_storage_path && (
                            <DownloadDocumentButton
                              doc={selectedDocument.latest}
                              label={
                                selectedDocument.type === 'certificado' ? t.certDownloadBtn
                                  : selectedDocument.type === 'termo_rt' ? t.trtDownloadBtn
                                    : selectedDocument.type === 'dossie_pmoc' ? t.dossieDownloadBtn
                                      : t.planilhaDownloadBtn
                              }
                              getSignedDownloadUrl={getSignedDownloadUrl}
                              establishmentName={templateContext?.customer_name}
                              errorTitle={t.downloadErrorTitle}
                              errorDescription={t.downloadErrorDesc}
                            />
                          )}
                          {selectedDocument.type === 'certificado' && (
                            <Button
                              size="sm"
                              onClick={handleGenerateCertificado}
                              disabled={generateCertificado.isPending || generationBlocked}
                              title={generationBlockedTitle}
                              className="min-h-11"
                            >
                              {generateCertificado.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              {latestCertificado ? t.certRegenerateBtn : t.certGenerateBtn}
                            </Button>
                          )}
                          {selectedDocument.type === 'termo_rt' && (
                            <Button
                              size="sm"
                              onClick={handleGenerateTrt}
                              disabled={generateTrt.isPending || generationBlocked}
                              title={generationBlockedTitle}
                              className="min-h-11"
                            >
                              {generateTrt.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              {latestTrt ? t.trtRegenerateBtn : t.trtGenerateBtn}
                            </Button>
                          )}
                          {selectedDocument.type === 'dossie_pmoc' && (
                            <Button
                              size="sm"
                              onClick={handleGenerateDossie}
                              disabled={generateDossie.isPending || generationBlocked}
                              title={generationBlockedTitle}
                              className="min-h-11"
                            >
                              {generateDossie.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              {latestDossie ? t.dossieRegenerateBtn : t.dossieGenerateBtn}
                            </Button>
                          )}
                          {selectedDocument.type === 'planilha' && (
                            <Button
                              size="sm"
                              onClick={handleGeneratePlanilha}
                              disabled={generatePlanilha.isPending || generationBlocked}
                              title={generationBlockedTitle}
                              className="min-h-11"
                            >
                              {generatePlanilha.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              {latestPlanilha ? t.planilhaRegenerateBtn : t.planilhaGenerateBtn}
                            </Button>
                          )}
                        </div>
                        </div>
                        <p className="mt-4 w-full text-sm leading-relaxed text-muted-foreground">{selectedDocument.description}</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          {selectedDocument.metadata}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 p-4 sm:p-5 lg:p-6">
                      {selectedDocument.type === 'certificado' && (
                        <section className="space-y-3" aria-labelledby="certificate-settings-title">
                          <div className="flex items-center gap-2">
                            <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <h4 id="certificate-settings-title" className="text-sm font-bold text-foreground">{t.documentSettingsTitle}</h4>
                          </div>
                          <div className="grid gap-4 rounded-lg bg-muted/30 p-4 sm:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] sm:items-end">
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
                                <SelectTrigger id="contract-cert-validity" className="h-11">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit">{t.validityInherit.replace('{n}', String(companyCertValidityMonths))}</SelectItem>
                                  {[3, 6, 12, 18, 24, 36].map((months) => (
                                    <SelectItem key={months} value={String(months)}>{t.validityMonths.replace('{n}', String(months))}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs leading-relaxed text-muted-foreground">{t.validityEffective.replace('{n}', String(effectiveCertValidityMonths))}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <Button size="sm" variant="outline" onClick={() => setArtWizardOpen(true)} className="min-h-11">
                                <Palette className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {tCertArt.openWizardBtn}
                              </Button>
                              <Button variant="edit-ghost" size="sm" className="min-h-11" onClick={() => setEditorOpen('certificado')}>
                                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {t.editFutureVersionsBtn}
                              </Button>
                            </div>
                          </div>
                        </section>
                      )}

                      {selectedDocument.type === 'termo_rt' && (
                        <section className="flex flex-col gap-3 rounded-lg bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-foreground">{t.documentSettingsTitle}</h4>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.futureVersionsHint}</p>
                          </div>
                          <Button variant="edit-ghost" size="sm" className="min-h-11 shrink-0" onClick={() => setEditorOpen('termo_rt')}>
                            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t.editFutureVersionsBtn}
                          </Button>
                        </section>
                      )}

                      <VersionHistory
                        documents={documents.filter((document) => document.doc_type === selectedDocument.type)}
                        documentTitle={selectedDocument.title}
                        getSignedDownloadUrl={getSignedDownloadUrl}
                        establishmentName={templateContext?.customer_name}
                        t={t}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
          )}
        </div>
      </section>

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

type SignedDownloadResolver = (
  document: Pick<PmocDocument, 'contract_id' | 'doc_type' | 'version' | 'generated_at' | 'pdf_storage_path'>,
  establishmentName?: string | null,
) => Promise<string>;

/** Baixa exatamente a versão recebida, sem chamar o gerador nem criar versão. */
function DownloadDocumentButton({
  doc,
  label,
  getSignedDownloadUrl,
  establishmentName,
  errorTitle,
  errorDescription,
}: {
  doc: PmocDocument;
  label: string;
  getSignedDownloadUrl: SignedDownloadResolver;
  establishmentName?: string | null;
  errorTitle: string;
  errorDescription: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const targetWindow = window.open('', '_blank');
    if (targetWindow) targetWindow.opener = null;
    setBusy(true);
    try {
      const signedUrl = await getSignedDownloadUrl(doc, establishmentName);
      if (targetWindow && !targetWindow.closed) {
        targetWindow.location.replace(signedUrl);
      } else {
        const link = document.createElement('a');
        link.href = signedUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }
    } catch {
      targetWindow?.close();
      toast({ variant: 'destructive', title: errorTitle, description: errorDescription });
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
      className="min-h-11 active:scale-[0.97] transition-transform"
    >
      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-1 h-4 w-4" aria-hidden="true" />}
      {label}
    </Button>
  );
}

function VersionHistory({
  documents,
  documentTitle,
  getSignedDownloadUrl,
  establishmentName,
  t,
}: {
  documents: PmocDocument[];
  documentTitle: string;
  getSignedDownloadUrl: SignedDownloadResolver;
  establishmentName?: string | null;
  t: DocsT;
}) {
  const { timezone } = useAppLocaleContext();

  return (
    <section className="space-y-3" aria-label={`${t.versionHistoryLabel}: ${documentTitle}`}>
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-bold text-foreground">
          {t.versionHistoryTitle.replace('{n}', String(documents.length))}
        </h4>
      </div>
      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t.versionHistoryEmpty}
        </div>
      ) : (
        <ul className="max-h-72 divide-y divide-border/70 overflow-y-auto rounded-lg border border-border/80">
          {documents.map((document, index) => (
            <li key={document.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-foreground">v{document.version}</p>
                  {index === 0 && <Badge variant="secondary">{t.currentVersionBadge}</Badge>}
                  {document.signature_status && <SignatureStatusBadge status={document.signature_status} t={t} />}
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatGeneratedAt(document.generated_at, timezone)}</p>
              </div>
              <DownloadDocumentButton
                doc={document}
                label={t.downloadVersionBtn.replace('{n}', String(document.version))}
                getSignedDownloadUrl={getSignedDownloadUrl}
                establishmentName={establishmentName}
                errorTitle={t.downloadErrorTitle}
                errorDescription={t.downloadErrorDesc}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentsWorkspaceSkeleton() {
  return (
    <Card className="overflow-hidden border-border/80 shadow-none" aria-label="Carregando documentos">
      <div className="grid md:min-h-[500px] md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <div className="space-y-3 border-border/80 p-4 md:border-r">
          <Skeleton className="h-4 w-28" />
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="flex items-start gap-3 border-t border-border/70 pt-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden items-center justify-center p-8 md:flex">
          <div className="w-full max-w-sm space-y-3">
            <Skeleton className="mx-auto h-12 w-12 rounded-lg" />
            <Skeleton className="mx-auto h-5 w-2/3" />
            <Skeleton className="mx-auto h-4 w-full" />
          </div>
        </div>
      </div>
    </Card>
  );
}
