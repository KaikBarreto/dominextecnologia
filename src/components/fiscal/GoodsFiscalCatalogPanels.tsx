import { useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useGoodsFiscalCatalogs,
  type GoodsFiscalCarrier,
  type GoodsFiscalScenario,
  type NfeSeries,
} from '@/hooks/useGoodsFiscalCatalogs';
import { isValidDocument } from '@/lib/documentValidation';

export type GoodsCatalogTab = 'series' | 'scenarios' | 'carriers';

type NfeSeriesForm = Partial<NfeSeries> & { lastNumberUsed?: number; advanceLastNumberUsed?: number };

const emptySeries = (): NfeSeriesForm => ({ label: '', series: 1, lastNumberUsed: 0, direction: 'saida', active: true });
const emptyScenario = (): Partial<GoodsFiscalScenario> => ({
  name: '', direction: 'saida', operationNature: '', destinationScope: 'ambos', cfopInternal: '', cfopInterstate: '',
  icmsCode: '', icmsRate: null, icmsReductionRate: null, pisCst: '', pisRate: null, cofinsCst: '', cofinsRate: null,
  ipiCst: '', ipiRate: null, notes: '', active: true, applicationStatus: 'draft',
});
const emptyCarrier = (): Partial<GoodsFiscalCarrier> => ({
  name: '', document: '', stateRegistration: '', address: '', addressNumber: '', complement: '', neighborhood: '', city: '', state: '',
  zipCode: '', municipalityCode: '', rntc: '', vehiclePlate: '', vehicleState: '', active: true,
});
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value.replace(',', '.'));

export function GoodsFiscalCatalogPanels({ tab }: { tab: GoodsCatalogTab }) {
  const catalogs = useGoodsFiscalCatalogs();
  const [series, setSeries] = useState<NfeSeriesForm>(emptySeries);
  const [scenario, setScenario] = useState<Partial<GoodsFiscalScenario>>(emptyScenario);
  const [carrier, setCarrier] = useState<Partial<GoodsFiscalCarrier>>(emptyCarrier);
  const [deletion, setDeletion] = useState<{ type: GoodsCatalogTab; id: string; label: string } | null>(null);

  const saveSeries = async () => {
    if (!series.label?.trim() || !Number.isInteger(Number(series.series)) || Number(series.series) < 0 || Number(series.series) > 889) {
      toast.error('Informe o nome e uma série entre 0 e 889.'); return;
    }
    if (!series.id && (!Number.isInteger(Number(series.lastNumberUsed)) || Number(series.lastNumberUsed) < 0 || Number(series.lastNumberUsed) > 999_999_998)) {
      toast.error('Informe a última numeração utilizada entre 0 e 999.999.998.'); return;
    }
    if (series.id && series.advanceLastNumberUsed != null) {
      const advanceTo = Number(series.advanceLastNumberUsed);
      if (!Number.isInteger(advanceTo) || advanceTo > 999_999_998) { toast.error('Informe a última numeração utilizada entre 0 e 999.999.998.'); return; }
      if (advanceTo + 1 < Number(series.nextNumber)) { toast.error(`A numeração só pode avançar. A próxima nota desta série já é a nº ${series.nextNumber}.`); return; }
    }
    try { await catalogs.upsertSeries(series); setSeries(emptySeries()); toast.success('Série salva.'); }
    catch (error) { toast.error((error as Error).message); }
  };
  const saveScenario = async () => {
    if (!scenario.name?.trim() || !scenario.operationNature?.trim()) { toast.error('Informe o nome e a natureza da operação.'); return; }
    try { await catalogs.upsertScenario(scenario); setScenario(emptyScenario()); toast.success('Cenário fiscal salvo como rascunho.'); }
    catch (error) { toast.error((error as Error).message); }
  };
  const saveCarrier = async () => {
    if (!carrier.name?.trim() || !isValidDocument(carrier.document)) {
      toast.error('Informe o nome e um CPF/CNPJ válido.'); return;
    }
    try { await catalogs.upsertCarrier(carrier); setCarrier(emptyCarrier()); toast.success('Transportadora salva.'); }
    catch (error) { toast.error((error as Error).message); }
  };
  const confirmDeletion = async () => {
    if (!deletion) return;
    try {
      if (deletion.type === 'series') await catalogs.deleteSeries(deletion.id);
      else if (deletion.type === 'scenarios') await catalogs.deleteScenario(deletion.id);
      else await catalogs.deleteCarrier(deletion.id);
      toast.success('Cadastro fiscal excluído.'); setDeletion(null);
    } catch (error) { toast.error((error as Error).message); }
  };

  if (catalogs.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (catalogs.isError) return <div className="rounded-2xl border border-destructive p-5"><p className="font-bold text-destructive">Não foi possível carregar os cadastros fiscais.</p><Button variant="outline" className="mt-4" onClick={() => catalogs.refetch()}>Tentar novamente</Button></div>;

  return <>
    {tab === 'series' && <div className="grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
      <CatalogForm title={series.id ? 'Editar série' : 'Nova série'} description="A numeração é reservada no servidor e só avança. Uma série já utilizada não pode trocar de número nem ser excluída.">
        <Field label="Nome"><Input value={series.label ?? ''} onChange={(event) => setSeries((current) => ({ ...current, label: event.target.value }))} placeholder="Ex.: NF-e saída principal" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Número"><Input inputMode="numeric" disabled={!!series.id} value={series.series ?? 1} onChange={(event) => setSeries((current) => ({ ...current, series: Number(event.target.value) }))} /></Field><Field label="Direção"><Select value={series.direction ?? 'saida'} onValueChange={(direction: NfeSeries['direction']) => setSeries((current) => ({ ...current, direction }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="saida">Saída</SelectItem><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="ambos">Entrada e saída</SelectItem></SelectContent></Select></Field></div>
        {!series.id ? <Field label="Último número utilizado">
          <Input
            inputMode="numeric"
            min={0}
            max={999_999_998}
            value={series.lastNumberUsed ?? 0}
            onChange={(event) => setSeries((current) => ({ ...current, lastNumberUsed: Number(event.target.value) }))}
            aria-describedby="series-last-number-help"
          />
          <p id="series-last-number-help" className="text-sm text-muted-foreground">
            Use 0 se esta série nunca emitiu NF-e. A próxima emissão será a nº <strong className="text-foreground">{Number.isInteger(Number(series.lastNumberUsed)) && Number(series.lastNumberUsed) >= 0 ? Number(series.lastNumberUsed) + 1 : '—'}</strong>.
          </p>
        </Field> : <Field label="Último número utilizado">
          <Input
            inputMode="numeric"
            min={Number(series.nextNumber) - 1}
            max={999_999_998}
            value={series.advanceLastNumberUsed ?? Number(series.nextNumber) - 1}
            onChange={(event) => setSeries((current) => ({ ...current, advanceLastNumberUsed: Number(event.target.value) }))}
            aria-describedby="series-advance-number-help"
          />
          <p id="series-advance-number-help" className="text-sm text-muted-foreground">
            A próxima emissão desta série será a nº <strong className="text-foreground">{Number.isInteger(Number(series.advanceLastNumberUsed ?? Number(series.nextNumber) - 1)) ? Number(series.advanceLastNumberUsed ?? Number(series.nextNumber) - 1) + 1 : '—'}</strong>. Se a empresa já emitiu notas desta série em outro sistema, informe o último número usado lá. A numeração só avança, nunca volta.
          </p>
        </Field>}
        <ActiveField active={series.active !== false} onChange={(active) => setSeries((current) => ({ ...current, active }))} />
        <FormActions editing={!!series.id} busy={catalogs.isMutating} onCancel={() => setSeries(emptySeries())} onSave={saveSeries} />
      </CatalogForm>
      <CatalogList empty="Nenhuma série cadastrada.">{catalogs.series.map((entry) => <CatalogCard key={entry.id} title={`${entry.label} · série ${entry.series}`} subtitle={`Próximo número ${entry.nextNumber} · ${entry.direction === 'ambos' ? 'entrada e saída' : entry.direction}`} active={entry.active} onEdit={() => setSeries(entry)} onDelete={() => setDeletion({ type: 'series', id: entry.id, label: entry.label })} />)}</CatalogList>
    </div>}

    {tab === 'scenarios' && <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500 p-4 text-sm"><p className="font-bold">Cadastro em preparação</p><p className="mt-1 text-muted-foreground">Cenários ficam salvos para revisão da contabilidade, mas não são aplicados automaticamente aos itens nem enviados ao motor fiscal.</p></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)]">
        <CatalogForm title={scenario.id ? 'Editar cenário' : 'Novo cenário'} description="Cadastre somente códigos confirmados pela contabilidade. Nenhum valor é inferido pelo sistema.">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome"><Input value={scenario.name ?? ''} onChange={(event) => setScenario((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Direção"><Select value={scenario.direction ?? 'saida'} onValueChange={(direction: GoodsFiscalScenario['direction']) => setScenario((current) => ({ ...current, direction }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="saida">Saída</SelectItem><SelectItem value="entrada">Entrada</SelectItem></SelectContent></Select></Field></div>
          <Field label="Natureza da operação"><Input value={scenario.operationNature ?? ''} onChange={(event) => setScenario((current) => ({ ...current, operationNature: event.target.value }))} /></Field>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Destino"><Select value={scenario.destinationScope ?? 'ambos'} onValueChange={(destinationScope: GoodsFiscalScenario['destinationScope']) => setScenario((current) => ({ ...current, destinationScope }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ambos">Interna e interestadual</SelectItem><SelectItem value="interna">Interna</SelectItem><SelectItem value="interestadual">Interestadual</SelectItem></SelectContent></Select></Field><Field label="CFOP interno"><Input inputMode="numeric" maxLength={4} value={scenario.cfopInternal ?? ''} onChange={(event) => setScenario((current) => ({ ...current, cfopInternal: event.target.value }))} /></Field><Field label="CFOP interestadual"><Input inputMode="numeric" maxLength={4} value={scenario.cfopInterstate ?? ''} onChange={(event) => setScenario((current) => ({ ...current, cfopInterstate: event.target.value }))} /></Field></div>
          <TaxRow label="ICMS" code={scenario.icmsCode ?? ''} rate={scenario.icmsRate} onCode={(icmsCode) => setScenario((current) => ({ ...current, icmsCode }))} onRate={(icmsRate) => setScenario((current) => ({ ...current, icmsRate }))} />
          <Field label="Redução da base de ICMS %"><Input inputMode="decimal" value={scenario.icmsReductionRate ?? ''} onChange={(event) => setScenario((current) => ({ ...current, icmsReductionRate: numberOrNull(event.target.value) }))} /></Field>
          <TaxRow label="PIS" code={scenario.pisCst ?? ''} rate={scenario.pisRate} onCode={(pisCst) => setScenario((current) => ({ ...current, pisCst }))} onRate={(pisRate) => setScenario((current) => ({ ...current, pisRate }))} />
          <TaxRow label="COFINS" code={scenario.cofinsCst ?? ''} rate={scenario.cofinsRate} onCode={(cofinsCst) => setScenario((current) => ({ ...current, cofinsCst }))} onRate={(cofinsRate) => setScenario((current) => ({ ...current, cofinsRate }))} />
          <TaxRow label="IPI" code={scenario.ipiCst ?? ''} rate={scenario.ipiRate} onCode={(ipiCst) => setScenario((current) => ({ ...current, ipiCst }))} onRate={(ipiRate) => setScenario((current) => ({ ...current, ipiRate }))} />
          <Field label="Observações"><Textarea rows={3} value={scenario.notes ?? ''} onChange={(event) => setScenario((current) => ({ ...current, notes: event.target.value }))} /></Field>
          <ActiveField active={scenario.active !== false} onChange={(active) => setScenario((current) => ({ ...current, active }))} />
          <FormActions editing={!!scenario.id} busy={catalogs.isMutating} onCancel={() => setScenario(emptyScenario())} onSave={saveScenario} />
        </CatalogForm>
        <CatalogList empty="Nenhum cenário fiscal cadastrado.">{catalogs.scenarios.map((entry) => <CatalogCard key={entry.id} title={entry.name} subtitle={`${entry.operationNature} · ${entry.direction === 'saida' ? 'saída' : 'entrada'} · aplicação manual bloqueada`} active={entry.active} onEdit={() => setScenario(entry)} onDelete={() => setDeletion({ type: 'scenarios', id: entry.id, label: entry.name })} />)}</CatalogList>
      </div>
    </div>}

    {tab === 'carriers' && <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)]">
      <CatalogForm title={carrier.id ? 'Editar transportadora' : 'Nova transportadora'} description="O cadastro fica disponível no rascunho da NF-e. A transmissão ao motor permanece bloqueada até o contrato fiscal ser homologado.">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome / razão social"><Input value={carrier.name ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="CPF/CNPJ"><Input inputMode="numeric" value={carrier.document ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, document: event.target.value }))} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Inscrição estadual"><Input value={carrier.stateRegistration ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, stateRegistration: event.target.value }))} /></Field><Field label="RNTRC"><Input value={carrier.rntc ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, rntc: event.target.value }))} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]"><Field label="Logradouro"><Input value={carrier.address ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, address: event.target.value }))} /></Field><Field label="Número"><Input value={carrier.addressNumber ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, addressNumber: event.target.value }))} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Complemento"><Input value={carrier.complement ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, complement: event.target.value }))} /></Field><Field label="Bairro"><Input value={carrier.neighborhood ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, neighborhood: event.target.value }))} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Cidade"><Input value={carrier.city ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, city: event.target.value }))} /></Field><Field label="UF"><Input maxLength={2} value={carrier.state ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, state: event.target.value.toUpperCase() }))} /></Field><Field label="Código IBGE"><Input inputMode="numeric" maxLength={7} value={carrier.municipalityCode ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, municipalityCode: event.target.value }))} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="CEP"><Input inputMode="numeric" value={carrier.zipCode ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, zipCode: event.target.value }))} /></Field><Field label="Placa"><Input maxLength={7} value={carrier.vehiclePlate ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, vehiclePlate: event.target.value.toUpperCase() }))} /></Field><Field label="UF do veículo"><Input maxLength={2} value={carrier.vehicleState ?? ''} onChange={(event) => setCarrier((current) => ({ ...current, vehicleState: event.target.value.toUpperCase() }))} /></Field></div>
        <ActiveField active={carrier.active !== false} onChange={(active) => setCarrier((current) => ({ ...current, active }))} />
        <FormActions editing={!!carrier.id} busy={catalogs.isMutating} onCancel={() => setCarrier(emptyCarrier())} onSave={saveCarrier} />
      </CatalogForm>
      <CatalogList empty="Nenhuma transportadora cadastrada.">{catalogs.carriers.map((entry) => <CatalogCard key={entry.id} title={entry.name} subtitle={`${entry.document}${entry.vehiclePlate ? ` · placa ${entry.vehiclePlate}` : ''}`} active={entry.active} onEdit={() => setCarrier(entry)} onDelete={() => setDeletion({ type: 'carriers', id: entry.id, label: entry.name })} />)}</CatalogList>
    </div>}

    <AlertDialog open={!!deletion} onOpenChange={(open) => { if (!open) setDeletion(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Excluir cadastro fiscal?</AlertDialogTitle><AlertDialogDescription>“{deletion?.label}” será removido. Uma série já utilizada será protegida pelo servidor e deverá ser apenas desativada.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeletion}>Excluir</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function CatalogForm({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-2xl border p-5"><div><h3 className="text-lg font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{children}</section>; }
function CatalogList({ empty, children }: { empty: string; children: React.ReactNode }) { return <section className="space-y-3"><h3 className="text-lg font-bold">Cadastros existentes</h3><div className="space-y-3">{Array.isArray(children) && children.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground"><Plus className="mx-auto mb-3 h-7 w-7" />{empty}</div> : children}</div></section>; }
function CatalogCard({ title, subtitle, active, onEdit, onDelete }: { title: string; subtitle: string; active: boolean; onEdit: () => void; onDelete: () => void }) { return <article className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold">{title}</h4><Badge className={active ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}>{active ? 'Ativo' : 'Inativo'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button type="button" variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button></div></article>; }
function ActiveField({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) { return <div className="flex items-center justify-between gap-4 rounded-xl border p-3"><div><p className="font-semibold">Cadastro ativo</p><p className="text-sm text-muted-foreground">Cadastros inativos permanecem no histórico e não aparecem na emissão.</p></div><Switch checked={active} onCheckedChange={onChange} /></div>; }
function FormActions({ editing, busy, onCancel, onSave }: { editing: boolean; busy: boolean; onCancel: () => void; onSave: () => void }) { return <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">{editing && <Button type="button" variant="outline" onClick={onCancel}>Cancelar edição</Button>}<Button type="button" className="font-bold" disabled={busy} onClick={onSave}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar</Button></div>; }
function TaxRow({ label, code, rate, onCode, onRate }: { label: string; code: string; rate: number | null | undefined; onCode: (value: string) => void; onRate: (value: number | null) => void }) { return <div className="grid grid-cols-[1fr_1fr] gap-3"><Field label={`${label} · CST/CSOSN`}><Input inputMode="numeric" value={code} onChange={(event) => onCode(event.target.value)} /></Field><Field label={`${label} · alíquota %`}><Input inputMode="decimal" value={rate ?? ''} onChange={(event) => onRate(numberOrNull(event.target.value))} /></Field></div>; }
