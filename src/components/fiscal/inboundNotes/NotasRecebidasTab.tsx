import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Search, ShieldCheck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  type InboundNfe,
  type InboundNfse,
  type ManifestacaoAcaoTipo,
} from '@/hooks/useInboundNotes';
import { InboundNfeCard } from './InboundNfeCard';
import { InboundNfseCard } from './InboundNfseCard';
import { ManifestarDialog } from './ManifestarDialog';
import { LancarNotaDespesaDialog, type LancarNotaDespesaSource } from './LancarNotaDespesaDialog';

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

  const { settings: fiscalSettings } = useFiscalSettings();
  // Mesmo critério de "certificado no ar" usado em `isFiscalReadyToEmit`: só o
  // certificado, sem exigir `pode_emitir` (emissão e recebimento são fluxos
  // distintos — uma empresa pode nunca emitir e ainda assim receber notas).
  const hasCertificate = !!fiscalSettings.provider_certificate_id;

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
    if (!hasCertificate) {
      return (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10" />}
          title={t.emptyNoCertificate.title}
          description={t.emptyNoCertificate.description}
          action={{ label: t.emptyNoCertificate.action, onClick: () => navigate('/notas-fiscais/configuracoes') }}
        />
      );
    }

    if (!activeOptIn) {
      return (
        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            {/* Ícone branco direto no fundo saturado (régua visual): sem círculo dessaturado atrás. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
              <FileText className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-snug">
                {subtab === 'nfe' ? t.optIn.titleNfe : t.optIn.titleNfse}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {subtab === 'nfe' ? t.optIn.descriptionNfe : t.optIn.descriptionNfse}
              </p>
            </div>
          </div>
          <Button onClick={handleActivate} disabled={isActivating}>
            {isActivating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.optIn.activating}
              </>
            ) : (
              t.optIn.action
            )}
          </Button>
        </div>
      );
    }

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
              />
            ))
          : filteredNfse.map((nota) => (
              <InboundNfseCard
                key={nota.id}
                nota={nota}
                onLancarDespesa={openLancarNfse}
                onVerLancamento={(n) => verLancamento(n.financial_transaction_id)}
              />
            ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SegmentedControl<Subtab>
        options={[
          { value: 'nfe', label: t.nfeSubtab },
          { value: 'nfse', label: t.nfseSubtab },
        ]}
        value={subtab}
        onValueChange={setSubtab}
        aria-label={`${t.nfeSubtab} / ${t.nfseSubtab}`}
      />

      {hasCertificate && activeOptIn && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{lastSyncLabel}</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleSync} disabled={active.isSyncing}>
              {active.isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {active.isSyncing ? t.sync.syncing : t.sync.button}
            </Button>
          </div>
        </>
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
    </div>
  );
}
