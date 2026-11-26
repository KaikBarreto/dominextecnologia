import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Search, ShieldCheck, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { fuzzyIncludesAny } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { useToast } from '@/hooks/use-toast';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import {
  useDfeOptIn,
  useInboundNfe,
  useInboundNfse,
  useInboundXmlImport,
  useInboundNoteXml,
  type InboundNfe,
  type InboundNfse,
  type ManifestacaoAcaoTipo,
} from '@/hooks/useInboundNotes';
import { InboundNfeCard } from './InboundNfeCard';
import { InboundNfseCard } from './InboundNfseCard';
import { ManifestarDialog } from './ManifestarDialog';
import { LancarNotaDespesaDialog, type LancarNotaDespesaSource } from './LancarNotaDespesaDialog';
import { NfeFiscalDetailsDialog } from './NfeFiscalDetailsDialog';
import { NfeImportDialog } from '@/components/inventory/NfeImportDialog';
import {
  DirectMaterialPurchaseDialog,
  type DirectMaterialPurchasePrefill,
} from '@/components/inventory/DirectMaterialPurchaseDialog';
import { parseNfeXml, type NfeParseResult } from '@/lib/nfeParser';
import { downloadNfeXml, generateNfeDanfe } from '@/utils/nfeDocumentExport';

type Subtab = 'nfe' | 'nfse';

/**
 * "Notas recebidas" — NF-e/NFS-e emitidas CONTRA o CNPJ do cliente (Frente C do
 * plano). Duas subabas (NF-e/NFS-e), cada uma com seu próprio opt-in
 * (`dfe_nfe_ativo`/`dfe_nfse_ativo`) e cursor de sincronização — são
 * webservices e credenciamentos diferentes, nunca ligados juntos.
 *
 * Ordem de gates, de fora pra dentro:
 * 1. Sem certificado A1 → nenhuma nota chega nunca (aviso + link pra config).
 * 2. Com certificado mas opt-in desligado → cartão explicando + botão de ligar
 *    (nunca lista vazia sem explicação — foi exatamente o bug que o EcoSistema
 *    documentou).
 * 3. Opt-in ligado → lista de verdade, com busca e sincronizar manual.
 */
export function NotasRecebidasTab() {
  const navigate = useNavigate();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas;
  const { toast } = useToast();

  const [subtab, setSubtab] = useState<Subtab>('nfe');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlImport = useInboundXmlImport();
  const noteXml = useInboundNoteXml();

  const { settings: fiscalSettings } = useFiscalSettings();
  // Recebimento não exige cobertura municipal, mas exige A1 próprio dentro da
  // validade. Validade ausente ou inválida falha fechado.
  const certificateExpiresAt = fiscalSettings.certificate_expires_at
    ? new Date(fiscalSettings.certificate_expires_at).getTime()
    : Number.NaN;
  const hasCertificate =
    !!fiscalSettings.certificado_ref &&
    Number.isFinite(certificateExpiresAt) &&
    certificateExpiresAt > Date.now();

  const { optIn, activate, isActivating } = useDfeOptIn();
  const nfe = useInboundNfe();
  const nfse = useInboundNfse();

  const active = subtab === 'nfe' ? nfe : nfse;
  const activeOptIn = subtab === 'nfe' ? optIn.dfe_nfe_ativo : optIn.dfe_nfse_ativo;

  const filteredNfe = useMemo(
    () =>
      nfe.notes.filter((n) =>
        fuzzyIncludesAny([n.emitente_nome, n.emitente_cnpj, n.numero != null ? String(n.numero) : null], search),
      ),
    [nfe.notes, search],
  );
  const filteredNfse = useMemo(
    () =>
      nfse.notes.filter((n) =>
        fuzzyIncludesAny([n.prestador_nome, n.prestador_documento, n.numero, n.discriminacao], search),
      ),
    [nfse.notes, search],
  );

  const [manifestarNota, setManifestarNota] = useState<InboundNfe | null>(null);
  const [despesaSource, setDespesaSource] = useState<{ subtab: Subtab; source: LancarNotaDespesaSource } | null>(
    null,
  );
  const [fiscalDetails, setFiscalDetails] = useState<NfeParseResult | null>(null);
  const [stockImport, setStockImport] = useState<{ nota: InboundNfe; key: string; xml: string } | null>(null);
  const [purchaseSource, setPurchaseSource] = useState<{
    nota: InboundNfe;
    prefill: DirectMaterialPurchasePrefill;
  } | null>(null);

  const loadNfeXml = async (nota: InboundNfe) => {
    const xml = await noteXml.fetchXml({ tipo: 'nfe', id: nota.id });
    return { xml, parsed: parseNfeXml(xml) };
  };

  const handleNfeXmlAction = async (
    nota: InboundNfe,
    action: 'details' | 'download' | 'danfe' | 'stock' | 'purchase',
  ) => {
    try {
      if ((action === 'stock' || action === 'purchase') && nota.inventory_imported_at) {
        toast({
          title: 'Entrada já registrada',
          description: 'Esta nota já movimentou o estoque e não pode gerar uma segunda entrada.',
        });
        return;
      }
      const { xml, parsed } = await loadNfeXml(nota);
      if (action === 'details') setFiscalDetails(parsed);
      if (action === 'download') downloadNfeXml(xml, parsed.accessKey);
      if (action === 'danfe') await generateNfeDanfe(parsed);
      if (action === 'stock') setStockImport({ nota, key: nota.id, xml });
      if (action === 'purchase') {
        setPurchaseSource({
          nota,
          prefill: {
            key: nota.id,
            supplierDocument: parsed.supplier.cnpj,
            description: `Compra da NF-e ${parsed.number || nota.numero || ''}`.trim(),
            purchaseDate: parsed.issueDate ?? nota.data_emissao,
            dueDate: parsed.duplicatas[0]?.dueDate ?? null,
            notes: parsed.accessKey ? `Origem: NF-e ${parsed.accessKey}` : 'Origem: NF-e recebida',
            itemsTotal: parsed.items.reduce((sum, item) => sum + item.total, 0),
            documentTotal: parsed.total ?? nota.valor,
            items: parsed.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitCost,
              fiscal: {
                ncm: item.ncm,
                cest: item.cest,
                gtin: item.ean,
                origin: item.origem,
                icmsCode: item.csosn ?? item.cst,
                icmsRate: item.icms.rate,
                pisCst: item.pis.cst,
                pisRate: item.pis.rate,
                cofinsCst: item.cofins.cst,
                cofinsRate: item.cofins.rate,
                ipiCst: item.ipi.cst,
                ipiRate: item.ipi.rate,
              },
            })),
          },
        });
      }
    } catch (error) {
      toast({
        title: 'Não foi possível abrir o XML da nota.',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleNfseDownload = async (nota: InboundNfse) => {
    try {
      const xml = await noteXml.fetchXml({ tipo: 'nfse', id: nota.id });
      downloadNfeXml(xml, nota.chave_acesso || nota.chave_natural);
    } catch (error) {
      toast({
        title: 'Não foi possível baixar o XML da nota.',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleSync = async () => {
    try {
      const result = await active.sync();
      // `aviso` é PT-BR já pronto que a EDGE decide (espera de 1h, opt-in
      // desligado, consumo indevido, "NFS-e ainda não suportada" etc.) — vem
      // primeiro sempre que existir, mesmo em `ok:true` parcial. Nunca é erro
      // destrutivo: `ok:false` com HTTP 200 é estado legítimo (ver
      // `supabase/functions/dfe-sync/index.ts`).
      if (result.aviso) {
        toast({ title: result.aviso });
      } else if (result.ok && result.novas > 0) {
        toast({ title: t.sync.toastSuccessNew.replace('{count}', String(result.novas)) });
      } else if (result.ok) {
        toast({ title: t.sync.toastSuccessNone });
      } else {
        toast({ title: t.sync.toastError, variant: 'destructive' });
      }
    } catch (e: unknown) {
      // Aqui sim é falha de verdade (rede, 4xx/5xx sem corpo legível) — a edge
      // já devolve 200 pros estados esperados, então quem chega aqui é exceção.
      toast({ title: t.sync.toastError, description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleActivate = async () => {
    try {
      await activate(subtab);
      toast({ title: t.optIn.toastSuccess });
    } catch (e: unknown) {
      toast({ title: t.optIn.toastError, description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleXmlFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('O XML deve ter no máximo 2 MB.');
      const result = await xmlImport.importXml(await file.text());
      setSubtab(result.tipo);
      toast({
        title: result.nova === false ? 'Nota atualizada com o XML completo.' : 'Nota importada com sucesso.',
        description: result.tipo === 'nfe' ? 'A NF-e já está disponível em Notas recebidas.' : 'A NFS-e já está disponível em Notas recebidas.',
      });
    } catch (e: unknown) {
      toast({
        title: 'Não foi possível importar o XML.',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManifestar = async (tipo: ManifestacaoAcaoTipo, justificativa?: string) => {
    if (!manifestarNota) return;
    try {
      const result = await nfe.manifestar({ inboundNfeId: manifestarNota.id, tipo, justificativa });
      // `ja_manifestada`/`em_andamento` são ESTADOS LEGÍTIMOS (o usuário clicou
      // duas vezes, ou outra pessoa já pediu) — a edge é explícita: "não pode
      // virar toast vermelho" (ver `supabase/functions/dfe-manifestar/index.ts`).
      toast({ title: result.ok ? t.manifestarDialog.toastSuccess : result.message || t.manifestarDialog.toastError });
      setManifestarNota(null);
    } catch (e: unknown) {
      toast({
        title: t.manifestarDialog.toastError,
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const openLancarNfe = (nota: InboundNfe) => {
    setDespesaSource({
      subtab: 'nfe',
      source: {
        id: nota.id,
        kind: 'nfe',
        document: nota.emitente_cnpj,
        partyName: nota.emitente_nome,
        amount: nota.valor,
        dataEmissao: nota.data_emissao,
        numero: nota.numero != null ? String(nota.numero) : null,
      },
    });
  };

  const openLancarNfse = (nota: InboundNfse) => {
    setDespesaSource({
      subtab: 'nfse',
      source: {
        id: nota.id,
        kind: 'nfse',
        document: nota.prestador_documento,
        partyName: nota.prestador_nome,
        amount: nota.valor_liquido ?? nota.valor_servico,
        dataEmissao: nota.data_emissao,
        numero: nota.numero,
      },
    });
  };

  const verLancamento = (financialTransactionId: string | null) => {
    if (!financialTransactionId) return;
    navigate(`${localizeAppPath('/financeiro/movimentacoes', locale)}?txn=${financialTransactionId}`);
  };

  const lastSyncLabel = active.syncState?.ultima_consulta_em
    ? t.sync.lastSync.replace('{when}', formatDateTime(active.syncState.ultima_consulta_em, locale, timezone))
    : t.sync.neverSynced;

  const renderBody = () => {
    if (active.isLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      );
    }

    const rows = subtab === 'nfe' ? filteredNfe : filteredNfse;
    if (rows.length === 0) {
      if (search.trim()) {
        return <EmptyState icon={<Search className="h-10 w-10" />} title={t.emptySearch} />;
      }
      return (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={t.emptyNoNotes.title}
          description={t.emptyNoNotes.description}
        />
      );
    }

    return (
      <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
        {subtab === 'nfe'
          ? filteredNfe.map((nota) => (
              <InboundNfeCard
                key={nota.id}
                nota={nota}
                onManifestar={setManifestarNota}
                onLancarDespesa={openLancarNfe}
                onVerLancamento={(n) => verLancamento(n.financial_transaction_id)}
                onViewFiscal={(n) => void handleNfeXmlAction(n, 'details')}
                onDownloadXml={(n) => void handleNfeXmlAction(n, 'download')}
                onGenerateDanfe={(n) => void handleNfeXmlAction(n, 'danfe')}
                onImportStock={(n) => void handleNfeXmlAction(n, 'stock')}
                onGeneratePurchase={(n) => void handleNfeXmlAction(n, 'purchase')}
              />
            ))
          : filteredNfse.map((nota) => (
              <InboundNfseCard
                key={nota.id}
                nota={nota}
                onLancarDespesa={openLancarNfse}
                onVerLancamento={(n) => verLancamento(n.financial_transaction_id)}
                onDownloadXml={(n) => void handleNfseDownload(n)}
              />
            ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Subtab>
          options={[
            { value: 'nfe', label: t.nfeSubtab },
            { value: 'nfse', label: t.nfseSubtab },
          ]}
          value={subtab}
          onValueChange={setSubtab}
          aria-label={`${t.nfeSubtab} / ${t.nfseSubtab}`}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          className="sr-only"
          onChange={(event) => void handleXmlFile(event.target.files?.[0])}
        />
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={xmlImport.isImporting}
        >
          {xmlImport.isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {xmlImport.isImporting ? 'Importando…' : 'Importar XML'}
        </Button>
      </div>

      {!hasCertificate && (
        <NoticeBanner variant="warning" title={t.emptyNoCertificate.title}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t.emptyNoCertificate.description}</span>
            <Button variant="outline" size="sm" onClick={() => navigate('/notas-fiscais/configuracoes')}>
              <ShieldCheck className="mr-2 h-4 w-4" /> {t.emptyNoCertificate.action}
            </Button>
          </div>
        </NoticeBanner>
      )}

      {hasCertificate && !activeOptIn && (
        <NoticeBanner
          variant="info"
          title={subtab === 'nfe' ? t.optIn.titleNfe : t.optIn.titleNfse}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{subtab === 'nfe' ? t.optIn.descriptionNfe : t.optIn.descriptionNfse}</span>
            <Button size="sm" onClick={handleActivate} disabled={isActivating}>
              {isActivating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {isActivating ? t.optIn.activating : t.optIn.action}
            </Button>
          </div>
        </NoticeBanner>
      )}

      <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
      </div>

      {hasCertificate && activeOptIn && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{lastSyncLabel}</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleSync} disabled={active.isSyncing}>
              {active.isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {active.isSyncing ? t.sync.syncing : t.sync.button}
            </Button>
          </div>
      )}

      {renderBody()}

      <ManifestarDialog
        open={!!manifestarNota}
        onOpenChange={(v) => !v && setManifestarNota(null)}
        nota={manifestarNota}
        submitting={nfe.isManifesting}
        onConfirm={handleManifestar}
      />

      <LancarNotaDespesaDialog
        open={!!despesaSource}
        onOpenChange={(v) => !v && setDespesaSource(null)}
        source={despesaSource?.source ?? null}
        linkTransaction={despesaSource?.subtab === 'nfe' ? nfe.linkTransaction : nfse.linkTransaction}
      />

      <NfeFiscalDetailsDialog
        open={!!fiscalDetails}
        onOpenChange={(open) => !open && setFiscalDetails(null)}
        note={fiscalDetails}
      />

      <NfeImportDialog
        open={!!stockImport}
        onOpenChange={(open) => !open && setStockImport(null)}
        initialXml={stockImport}
        inboundNfeId={stockImport?.nota.id}
      />

      <DirectMaterialPurchaseDialog
        open={!!purchaseSource}
        onOpenChange={(open) => !open && setPurchaseSource(null)}
        prefill={purchaseSource?.prefill}
        inboundNfeId={purchaseSource?.nota.id}
        onSuccess={() => setPurchaseSource(null)}
      />
    </div>
  );
}
