import { BadgeCheck, Info } from 'lucide-react';
import type { InventoryItemInsert } from '@/hooks/useInventory';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { missingMaterialFiscalFields, type MaterialFiscalField } from '@/lib/fiscal/materialFiscal';

interface Props {
  value: Partial<InventoryItemInsert>;
  onChange: (field: MaterialFiscalField, value: string | number | null) => void;
}

function RateField({ id, label, value, onChange }: { id: MaterialFiscalField; label: string; value: unknown; onChange: Props['onChange'] }) {
  return <div className="space-y-2"><Label htmlFor={`inventory-${id}`}>{label}</Label><div className="relative"><Input id={`inventory-${id}`} inputMode="decimal" value={value == null ? '' : String(value).replace('.', ',')} onChange={(event) => { const raw = event.target.value.trim(); onChange(id, raw === '' ? null : Number(raw.replace(',', '.'))); }} className="pr-9" /><span className="pointer-events-none absolute right-3 top-3 text-sm text-muted-foreground">%</span></div></div>;
}

const ORIGINS = [
  ['0', '0 — Nacional'], ['1', '1 — Estrangeira, importação direta'],
  ['2', '2 — Estrangeira, adquirida no mercado interno'], ['3', '3 — Nacional, conteúdo de importação acima de 40%'],
  ['4', '4 — Nacional, processo produtivo básico'], ['5', '5 — Nacional, conteúdo de importação até 40%'],
  ['6', '6 — Estrangeira, importação direta sem similar'], ['7', '7 — Estrangeira, mercado interno sem similar'],
  ['8', '8 — Nacional, conteúdo de importação acima de 70%'],
] as const;

function Field({ id, label, hint, value, onChange, inputMode = 'numeric', maxLength }: {
  id: MaterialFiscalField; label: string; hint?: string; value: unknown;
  onChange: Props['onChange']; inputMode?: 'numeric' | 'text'; maxLength?: number;
}) {
  return <div className="space-y-2">
    <Label htmlFor={`inventory-${id}`}>{label}</Label>
    <Input id={`inventory-${id}`} value={String(value ?? '')} onChange={(event) => onChange(id, event.target.value || null)} inputMode={inputMode} maxLength={maxLength} />
    {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
  </div>;
}

export function InventoryFiscalFields({ value, onChange }: Props) {
  const missing = missingMaterialFiscalFields(value);
  return <section aria-labelledby="inventory-fiscal-title" className="space-y-6">
    <div className="flex items-start gap-3 rounded-2xl bg-primary p-4 text-primary-foreground sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary">
        {missing.length ? <Info className="h-5 w-5" /> : <BadgeCheck className="h-5 w-5" />}
      </span>
      <div>
        <h3 id="inventory-fiscal-title" className="text-lg font-bold">Dados para NF-e e NFC-e</h3>
        <p className="mt-1 text-sm leading-relaxed text-primary-foreground/80">
          {missing.length ? `Ainda faltam: ${missing.join(', ')}. O material pode ser salvo, mas a emissão será bloqueada até completar.` : 'Este material tem os campos mínimos para seguir à conferência fiscal da nota.'}
        </p>
      </div>
    </div>

    <div>
      <h4 className="text-base font-bold">Classificação do produto</h4>
      <p className="mt-1 text-sm text-muted-foreground">Use os códigos definidos pela contabilidade. O sistema não preenche tributação por aproximação.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="fiscal_ncm" label="NCM" hint="8 dígitos." value={value.fiscal_ncm} onChange={onChange} maxLength={10} />
      <Field id="fiscal_cest" label="CEST" hint="7 dígitos, quando aplicável." value={value.fiscal_cest} onChange={onChange} maxLength={9} />
      <Field id="fiscal_gtin" label="GTIN tributável" hint="EAN/GTIN oficial; deixe vazio quando o produto não possuir." value={value.fiscal_gtin} onChange={onChange} maxLength={14} />
      <div className="space-y-2">
        <Label>Origem da mercadoria</Label>
        <Select value={value.fiscal_origin ?? ''} onValueChange={(entry) => onChange('fiscal_origin', entry)}>
          <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
          <SelectContent>{ORIGINS.map(([code, label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Field id="fiscal_tax_unit" label="Unidade tributável" hint="Ex.: UN, KG, M, L." value={value.fiscal_tax_unit} onChange={onChange} inputMode="text" maxLength={6} />
      <Field id="fiscal_ibs_cbs_cst" label="CST IBS/CBS" hint="Preencha somente conforme orientação contábil." value={value.fiscal_ibs_cbs_cst} onChange={onChange} inputMode="text" maxLength={6} />
    </div>

    <div className="border-t pt-6">
      <h4 className="text-base font-bold">Operação e tributação padrão</h4>
      <p className="mt-1 text-sm text-muted-foreground">Esses valores entram como padrão na nota e continuam visíveis para conferência antes de emitir.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field id="fiscal_cfop_entry_internal" label="CFOP entrada · dentro do estado" value={value.fiscal_cfop_entry_internal} onChange={onChange} maxLength={4} />
      <Field id="fiscal_cfop_entry_interstate" label="CFOP entrada · interestadual" value={value.fiscal_cfop_entry_interstate} onChange={onChange} maxLength={4} />
      <Field id="fiscal_cfop_exit_internal" label="CFOP saída · dentro do estado" value={value.fiscal_cfop_exit_internal ?? value.fiscal_cfop_internal} onChange={onChange} maxLength={4} />
      <Field id="fiscal_cfop_exit_interstate" label="CFOP saída · interestadual" value={value.fiscal_cfop_exit_interstate ?? value.fiscal_cfop_interstate} onChange={onChange} maxLength={4} />
      <Field id="fiscal_icms_code" label="CST/CSOSN do ICMS" value={value.fiscal_icms_code} onChange={onChange} maxLength={3} />
      <RateField id="fiscal_icms_rate" label="Alíquota de ICMS" value={value.fiscal_icms_rate} onChange={onChange} />
      <RateField id="fiscal_icms_reduction_rate" label="Redução da base de ICMS" value={value.fiscal_icms_reduction_rate} onChange={onChange} />
      <Field id="fiscal_pis_cst" label="CST de PIS" value={value.fiscal_pis_cst} onChange={onChange} maxLength={2} />
      <RateField id="fiscal_pis_rate" label="Alíquota de PIS" value={value.fiscal_pis_rate} onChange={onChange} />
      <Field id="fiscal_cofins_cst" label="CST de COFINS" value={value.fiscal_cofins_cst} onChange={onChange} maxLength={2} />
      <RateField id="fiscal_cofins_rate" label="Alíquota de COFINS" value={value.fiscal_cofins_rate} onChange={onChange} />
      <Field id="fiscal_ipi_cst" label="CST de IPI" hint="Opcional quando não houver incidência." value={value.fiscal_ipi_cst} onChange={onChange} maxLength={2} />
      <RateField id="fiscal_ipi_rate" label="Alíquota de IPI" value={value.fiscal_ipi_rate} onChange={onChange} />
    </div>
  </section>;
}
