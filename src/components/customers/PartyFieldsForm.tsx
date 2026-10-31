import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePartyFieldConfig, type PartyEntityType } from '@/hooks/usePartyFieldConfig';

export function PartyFieldsForm({ entityType, values, onChange, errors = [] }: {
  entityType: PartyEntityType;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors?: string[];
}) {
  const { fields } = usePartyFieldConfig(entityType);
  const visible = fields.filter((field) => field.is_visible);
  if (visible.length === 0) return null;

  const setValue = (key: string, value: unknown) => onChange({ ...values, [key]: value });
  return (
    <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
      <p className="sm:col-span-2 mt-2 text-xs font-bold uppercase tracking-widest text-foreground/70">Campos personalizados</p>
      {visible.map((field) => (
        <div key={field.id} className="space-y-2">
          <Label htmlFor={`party-field-${entityType}-${field.field_key}`}>{field.label}{field.is_required ? ' *' : ''}</Label>
          {field.field_type === 'select' ? (
            <Select value={String(values[field.field_key] ?? '')} onValueChange={(value) => setValue(field.field_key, value)}>
              <SelectTrigger id={`party-field-${entityType}-${field.field_key}`} className={errors.includes(field.field_key) ? 'border-destructive' : undefined}>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>{(field.options ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          ) : field.field_type === 'boolean' ? (
            <label className="flex h-10 items-center gap-2 rounded-md border px-3">
              <Checkbox checked={values[field.field_key] === true} onCheckedChange={(value) => setValue(field.field_key, value === true)} />
              <span className="text-sm">Sim</span>
            </label>
          ) : field.field_type === 'date' ? (
            <DatePicker value={String(values[field.field_key] ?? '')} onValueChange={(value) => setValue(field.field_key, value)} clearable />
          ) : (
            <Input
              id={`party-field-${entityType}-${field.field_key}`}
              type={field.field_type === 'number' ? 'number' : 'text'}
              value={String(values[field.field_key] ?? '')}
              onChange={(event) => setValue(field.field_key, event.target.value)}
              className={errors.includes(field.field_key) ? 'border-destructive' : undefined}
            />
          )}
          {errors.includes(field.field_key) && <p className="text-xs text-destructive">Preencha este campo obrigatório.</p>}
        </div>
      ))}
    </div>
  );
}
