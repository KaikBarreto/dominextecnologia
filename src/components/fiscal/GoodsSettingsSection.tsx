import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2, ReceiptText, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useGoodsFiscalSettings, type GoodsFiscalSettings } from '@/hooks/useGoodsFiscalSettings';
import { useGoodsFiscalCatalogs } from '@/hooks/useGoodsFiscalCatalogs';
import type { FiscalAmbiente } from '@/hooks/useFiscalSettings';
import { HorizontalTabBar } from '@/components/ui/HorizontalTabBar';
import { GoodsFiscalCatalogPanels, type GoodsCatalogTab } from '@/components/fiscal/GoodsFiscalCatalogPanels';
import { cn } from '@/lib/utils';

type SettingsTab = 'documents' | GoodsCatalogTab;
const CONFIGURATION_TABS: Array<{ value: SettingsTab; label: string }> = [
  { value: 'documents', label: 'Documentos' },
  { value: 'series', label: 'Séries' },
  { value: 'carriers', label: 'Transportadoras' },
];

type GoodsSettingsMode = 'configuration' | 'scenarios';

export function GoodsSettingsSection({ environment, certificateReady, mode = 'configuration' }: { environment: FiscalAmbiente; certificateReady: boolean; mode?: GoodsSettingsMode }) {
  const { user, profile, profileLoading, loading } = useAuth();
  if (!user || profile?.user_id !== user.id || loading !== false || profileLoading !== false || profile.is_active !== true) return <p role={profile?.is_active === false ? 'alert' : 'status'}>{profile?.is_active === false ? 'Seu acesso fiscal está indisponível. Entre novamente para continuar.' : 'Carregando o contexto fiscal…'}</p>;
  return <GoodsSettingsContext key={`${user.id}:${profile.company_id}:${mode}`} environment={environment} certificateReady={certificateReady} mode={mode} />;
}
function GoodsSettingsContext({ environment, certificateReady, mode }: { environment: FiscalAmbiente; certificateReady: boolean; mode: GoodsSettingsMode }) {
  const { settings, isLoading, isError, save, isSaving, refetch } = useGoodsFiscalSettings();
  const catalogs = useGoodsFiscalCatalogs();
  const [activeTab, setActiveTab] = useState<SettingsTab>('documents');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [form, setForm] = useState<GoodsFiscalSettings>(settings);
  useEffect(() => setForm(settings), [settings]);
  const patch = <K extends keyof GoodsFiscalSettings>(key: K, value: Partial<GoodsFiscalSettings[K]>) => setForm((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  const handleSave = async () => {
    if (form.nfe.series < 0 || form.nfe.series > 889 || form.nfce.series < 1 || form.nfce.series > 889) { toast.error('Revise as séries fiscais.'); return; }
    if (form.nfce.enabled && !/^[A-Z]{2}$/.test(form.nfce.uf)) { toast.error('Informe a UF de credenciamento da NFC-e.'); return; }
    try { await save(form); if (alive.current) toast.success('Configurações de NF-e e NFC-e salvas.'); } catch (error) { if (alive.current) toast.error((error as Error).message); }
  };
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (isError) return <div className="rounded-2xl border border-destructive p-5"><p className="font-bold text-destructive">Não foi possível carregar as configurações.</p><Button variant="outline" className="mt-4" onClick={() => refetch()}>Tentar novamente</Button></div>;
  if (mode === 'scenarios') return <div className="space-y-6">
    <div className="flex items-start gap-3 rounded-2xl bg-primary p-5 text-primary-foreground"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary"><ReceiptText className="h-5 w-5" /></span><div><h2 className="text-xl font-bold">Cenários de mercadorias</h2><p className="mt-1 text-sm text-primary-foreground/75">Regras compartilhadas pelas emissões de NF-e e NFC-e. Serviços continuam com tributação própria na configuração de NFS-e.</p></div></div>
    <GoodsFiscalCatalogPanels tab="scenarios" />
  </div>;
  const activeExitSeries = catalogs.series.filter((entry) => entry.active && (entry.direction === 'saida' || entry.direction === 'ambos'));
  const activeEntrySeries = catalogs.series.filter((entry) => entry.active && (entry.direction === 'entrada' || entry.direction === 'ambos'));
  return <div className="space-y-6">
    <div className="flex items-start gap-3 rounded-2xl bg-primary p-5 text-primary-foreground"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary">{certificateReady ? <BadgeCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}</span><div><h2 className="text-xl font-bold">NF-e e NFC-e</h2><p className="mt-1 text-sm text-primary-foreground/75">O certificado A1, os dados da empresa e o ambiente são compartilhados com a NFS-e. Cada documento mantém numeração e liberação próprias.</p></div></div>
    {!certificateReady && <div className="rounded-2xl border border-destructive p-4 text-destructive"><p className="font-bold">Certificado A1 necessário</p><p className="mt-1 text-sm">Envie o certificado na aba Certificado. Sem ele, o rascunho funciona, mas a emissão é bloqueada antes do motor fiscal.</p></div>}
    <HorizontalTabBar asChild>
      <div className="flex min-w-0 gap-6 border-b" role="tablist" aria-label="Configurações de NF-e e NFC-e">
        {CONFIGURATION_TABS.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={activeTab === tab.value} onClick={() => setActiveTab(tab.value)} className={cn('shrink-0 border-b-2 px-1 py-3 text-sm font-semibold transition-colors', activeTab === tab.value ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{tab.label}</button>)}
      </div>
    </HorizontalTabBar>
    {activeTab === 'documents' && <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-5 rounded-2xl border p-5"><div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /><h3 className="text-lg font-bold">NF-e · modelo 55</h3></div><p className="mt-1 text-sm text-muted-foreground">Entradas e saídas de produtos.</p></div><LabeledSwitch className="shrink-0" value={form.nfe.enabled ? 'on' : 'off'} onChange={(value) => patch('nfe', { enabled: value === 'on' })} off={{ value: 'off', label: 'Desativada' }} on={{ value: 'on', label: 'Ativada' }} /></div><div className="flex flex-wrap gap-2"><Badge className={form.nfe.homologationApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfe.homologationApproved ? 'Homologação aprovada' : 'Homologação pendente'}</Badge><Badge className={form.nfe.productionApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfe.productionApproved ? 'Produção liberada' : 'Produção bloqueada'}</Badge></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Série padrão de saída</Label><Select value={form.nfe.defaultExitSeriesId || undefined} onValueChange={(defaultExitSeriesId) => patch('nfe', { defaultExitSeriesId })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{activeExitSeries.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.label} · {entry.series}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Série padrão de entrada</Label><Select value={form.nfe.defaultEntrySeriesId || undefined} onValueChange={(defaultEntrySeriesId) => patch('nfe', { defaultEntrySeriesId })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{activeEntrySeries.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.label} · {entry.series}</SelectItem>)}</SelectContent></Select></div></div>{catalogs.series.length === 0 && <p className="text-sm font-medium text-destructive">Cadastre ao menos uma série ativa na subaba Séries antes de emitir NF-e.</p>}<div className="space-y-2"><Label>Natureza padrão</Label><Input value={form.nfe.defaultOperationNature} onChange={(e) => patch('nfe', { defaultOperationNature: e.target.value })} placeholder="Ex.: VENDA DE MERCADORIA" /></div></section>
      <section className="space-y-5 rounded-2xl border p-5"><div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /><h3 className="text-lg font-bold">NFC-e · modelo 65</h3></div><p className="mt-1 text-sm text-muted-foreground">Venda ao consumidor após a confirmação do pagamento no PDV.</p></div><LabeledSwitch className="shrink-0" value={form.nfce.enabled ? 'on' : 'off'} onChange={(value) => patch('nfce', { enabled: value === 'on' })} off={{ value: 'off', label: 'Desativada' }} on={{ value: 'on', label: 'Ativada' }} /></div><div className="flex flex-wrap gap-2"><Badge className={form.nfce.homologationApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfce.homologationApproved ? 'Homologação aprovada' : 'Homologação pendente'}</Badge><Badge className={form.nfce.productionApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfce.productionApproved ? 'Produção liberada' : 'Produção bloqueada'}</Badge></div><div className="space-y-2"><Label>Após o pagamento no PDV</Label><Select value={form.nfce.afterPaymentMode} onValueChange={(value: 'off' | 'ask') => patch('nfce', { afterPaymentMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Desativado</SelectItem><SelectItem value="ask">Perguntar se deseja emitir</SelectItem><SelectItem value="automatic" disabled>Emitir automaticamente · aguardando canário</SelectItem></SelectContent></Select><p className="text-sm text-muted-foreground">A venda sempre conclui antes da emissão. O modo automático permanece bloqueado.</p></div><div className="space-y-2"><Label>Natureza padrão da NFC-e</Label><Input value={form.nfce.defaultOperationNature} onChange={(e) => patch('nfce', { defaultOperationNature: e.target.value })} /></div><div className="space-y-3"><LabeledSwitch value={form.nfce.includeIdentifiedConsumer ? 'on' : 'off'} onChange={(v) => patch('nfce', { includeIdentifiedConsumer: v === 'on' })} off={{ value: 'off', label: 'Consumidor sem identificação' }} on={{ value: 'on', label: 'Incluir CPF/CNPJ quando informado' }} /><LabeledSwitch value={form.nfce.openDanfceAfterAuthorization ? 'on' : 'off'} onChange={(v) => patch('nfce', { openDanfceAfterAuthorization: v === 'on' })} off={{ value: 'off', label: 'Abrir DANFC-e manualmente' }} on={{ value: 'on', label: 'Abrir DANFC-e após autorização' }} /></div><p className="text-sm text-muted-foreground">O fluxo atual usa QR Code versão 3, que dispensa CSC conforme o padrão nacional. O certificado A1 permanece no backend seguro. A emissão exige credenciamento e URLs oficiais da SEFAZ para a UF e o ambiente.</p><div className="grid grid-cols-3 gap-3"><div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={form.nfce.uf} onChange={(e) => patch('nfce', { uf: e.target.value.toUpperCase() })} /></div><div className="space-y-2"><Label>Série</Label><Input inputMode="numeric" value={form.nfce.series} onChange={(e) => patch('nfce', { series: Number(e.target.value) })} /></div><div className="space-y-2"><Label>Próximo nº</Label><Input value={form.nfce.nextNumber} disabled /></div></div></section>
    </div>
    <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Ambiente compartilhado: <strong className="text-foreground">{environment === 'producao' ? 'Produção' : 'Homologação'}</strong>. Liberação de produção continua fail-closed até aprovação.</p><Button className="h-14 gap-2 px-6 text-base font-bold" onClick={handleSave} disabled={isSaving}>{isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Salvar NF-e e NFC-e</Button></div>
    </div>}
    {activeTab !== 'documents' && <GoodsFiscalCatalogPanels tab={activeTab as GoodsCatalogTab} />}
  </div>;
}
