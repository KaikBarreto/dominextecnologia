import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export function PdvCouponScopePicker({ label, options, value, onChange, disabled }: {
  label: string; options: Array<{ id: string; name: string }>; value: string[]; onChange: (value: string[]) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const matching = options.filter(option => option.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium">{label} · {value.length ? `${value.length} selecionados` : 'Todos'}</summary>
    <p className="my-2 text-xs text-muted-foreground">Sem seleção, o cupom vale para todos. Selecione para restringir.</p>
    <Input aria-label={`Buscar ${label.toLowerCase()}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome" />
    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
      {matching.map(option => <label key={option.id} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"><Checkbox disabled={disabled} checked={value.includes(option.id)} onCheckedChange={checked => onChange(checked ? [...value, option.id] : value.filter(id => id !== option.id))} /><span>{option.name}</span></label>)}
      {!matching.length && <p className="py-3 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>}
    </div>
  </details>;
}
