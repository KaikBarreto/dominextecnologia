import * as RadioGroup from '@radix-ui/react-radio-group';
import { Store, Wrench, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BusinessCore } from '@/lib/businessCore';

interface Props { value: BusinessCore | null; onChange: (core: BusinessCore) => void; disabled?: boolean; dark?: boolean }
const options = [
  {value:'retail' as const,title:'Loja',description:'Vendas, caixa, estoque, clientes e financeiro.',icon:Store},
  {value:'services' as const,title:'Serviços',description:'Ordens de serviço, agenda, equipamentos e financeiro.',icon:Wrench},
];
export function BusinessCoreSelect({value,onChange,disabled,dark}:Props) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className={cn('mb-2 text-sm font-semibold',dark&&'text-white')}>Como sua empresa vai usar a Dominex?</legend>
    <RadioGroup.Root value={value??undefined} onValueChange={next=>onChange(next as BusinessCore)} disabled={disabled} className="grid gap-3 sm:grid-cols-2" aria-label="Perfil da empresa">
      {options.map(({value:core,title,description,icon:Icon})=><RadioGroup.Item key={core} value={core}
        disabled={disabled} className={cn('relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default',
          value===core?'border-primary bg-primary text-primary-foreground':'border-border bg-background text-foreground hover:border-primary',
          dark&&(value===core?'border-white bg-white text-black':'border-white/25 bg-transparent text-white hover:border-white'))}>
        <Icon className="mb-3 h-6 w-6" aria-hidden="true"/>
        <span className="block text-base font-bold">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed">{description}</span>
        {value===core&&<Check className="absolute right-3 top-3 h-4 w-4" aria-hidden="true"/>}
      </RadioGroup.Item>)}
    </RadioGroup.Root>
    <p className={cn('text-xs leading-relaxed text-muted-foreground',dark&&'text-white/75')}>Você pode contratar o outro núcleo depois, mantendo seus cadastros.</p>
  </fieldset>;
}
