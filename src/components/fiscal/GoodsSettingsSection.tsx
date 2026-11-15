import { useEffect, useState } from 'react';
import { BadgeCheck, Loader2, ReceiptText, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Badge } from '@/components/ui/badge';
import { useGoodsFiscalSettings, type GoodsFiscalSettings } from '@/hooks/useGoodsFiscalSettings';
import type { FiscalAmbiente } from '@/hooks/useFiscalSettings';

export function GoodsSettingsSection({ environment, certificateReady }: { environment: FiscalAmbiente; certificateReady: boolean }) {
  const { settings, isLoading, isError, save, isSaving, refetch } = useGoodsFiscalSettings();
  const [form, setForm] = useState<GoodsFiscalSettings>(settings);
  useEffect(() => setForm(settings), [settings]);
  const patch = <K extends keyof GoodsFiscalSettings>(key: K, value: Partial<GoodsFiscalSettings[K]>) => setForm((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  const handleSave = async () => {
    if (form.nfe.series < 0 || form.nfe.series > 889 || form.nfce.series < 1 || form.nfce.series > 889) { toast.error('Revise as séries fiscais.'); return; }
    if (form.nfce.enabled && !/^[A-Z]{2}$/.test(form.nfce.uf)) { toast.error('Informe a UF de credenciamento da NFC-e.'); return; }
    try { await save(form); toast.success('Configurações de NF-e e NFC-e salvas.'); } catch (error) { toast.error((error as Error).message); }
  };
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (isError) return <div className="rounded-2xl border border-destructive p-5"><p className="font-bold text-destructive">Não foi possível carregar as configurações.</p><Button variant="outline" className="mt-4" onClick={() => refetch()}>Tentar novamente</Button></div>;
  return <div className="space-y-6">
    <div className="flex items-start gap-3 rounded-2xl bg-primary p-5 text-primary-foreground"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary">{certificateReady ? <BadgeCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}</span><div><h2 className="text-xl font-bold">NF-e e NFC-e</h2><p className="mt-1 text-sm text-primary-foreground/75">O certificado A1, os dados da empresa e o ambiente são compartilhados com a NFS-e. Cada documento mantém numeração e liberação próprias.</p></div></div>
    {!certificateReady && <div className="rounded-2xl border border-destructive p-4 text-destructive"><p className="font-bold">Certificado A1 necessário</p><p className="mt-1 text-sm">Envie o certificado na aba Certificado. Sem ele, o rascunho funciona, mas a emissão é bloqueada antes do motor fiscal.</p></div>}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-5 rounded-2xl border p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /><h3 className="text-lg font-bold">NF-e · modelo 55</h3></div><p className="mt-1 text-sm text-muted-foreground">Entradas e saídas de produtos.</p></div><LabeledSwitch value={form.nfe.enabled ? 'on' : 'off'} onChange={(value) => patch('nfe', { enabled: value === 'on' })} off={{ value: 'off', label: 'Desativada' }} on={{ value: 'on', label: 'Ativada' }} /></div><div className="flex flex-wrap gap-2"><Badge className={form.nfe.homologationApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfe.homologationApproved ? 'Homologação aprovada' : 'Homologação pendente'}</Badge><Badge className={form.nfe.productionApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfe.productionApproved ? 'Produção liberada' : 'Produção bloqueada'}</Badge></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Série</Label><Input inputMode="numeric" value={form.nfe.series} onChange={(e) => patch('nfe', { series: Number(e.target.value) })} /></div><div className="space-y-2"><Label>Próximo número</Label><Input value={form.nfe.nextNumber} disabled /></div></div><div className="space-y-2"><Label>Natureza padrão</Label><Input value={form.nfe.defaultOperationNature} onChange={(e) => patch('nfe', { defaultOperationNature: e.target.value })} placeholder="Ex.: VENDA DE MERCADORIA" /></div></section>
      <section className="space-y-5 rounded-2xl border p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /><h3 className="text-lg font-bold">NFC-e · modelo 65</h3></div><p className="mt-1 text-sm text-muted-foreground">Venda ao consumidor e integração futura com o PDV.</p></div><LabeledSwitch value={form.nfce.enabled ? 'on' : 'off'} onChange={(value) => patch('nfce', { enabled: value === 'on' })} off={{ value: 'off', label: 'Desativada' }} on={{ value: 'on', label: 'Ativada' }} /></div><div className="flex flex-wrap gap-2"><Badge className={form.nfce.homologationApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfce.homologationApproved ? 'Homologação aprovada' : 'Homologação pendente'}</Badge><Badge className={form.nfce.productionApproved ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{form.nfce.productionApproved ? 'Produção liberada' : 'Produção bloqueada'}</Badge></div><div className="grid grid-cols-3 gap-3"><div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={form.nfce.uf} onChange={(e) => patch('nfce', { uf: e.target.value.toUpperCase() })} /></div><div className="space-y-2"><Label>Série</Label><Input inputMode="numeric" value={form.nfce.series} onChange={(e) => patch('nfce', { series: Number(e.target.value) })} /></div><div className="space-y-2"><Label>Próximo nº</Label><Input value={form.nfce.nextNumber} disabled /></div></div></section>
    </div>
    <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Ambiente compartilhado: <strong className="text-foreground">{environment === 'producao' ? 'Produção' : 'Homologação'}</strong>. Liberação de produção continua fail-closed até aprovação.</p><Button className="h-14 gap-2 px-6 text-base font-bold" onClick={handleSave} disabled={isSaving}>{isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Salvar NF-e e NFC-e</Button></div>
  </div>;
}
