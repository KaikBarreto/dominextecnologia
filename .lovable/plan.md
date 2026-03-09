

# Plano: 3 Melhorias na Precificação e Custos

## 1. Botão Salvar no card "Taxas do BDI"

**Arquivo:** `src/components/pricing/PricingConfigForm.tsx`

Adicionar botão "Salvar" no card de Taxas do BDI (linha ~119), idêntico ao do card Deslocamento. O mesmo `onClick` já salva todos os campos juntos, então ambos os botões chamam a mesma mutation `upsertSettings.mutate(...)`.

## 2. Cards de recursos vinculados: fundo branco, borda ao selecionar

**Arquivo:** `src/components/service-orders/LinkedResourcesSection.tsx`

Trocar as classes dos cards de recurso:
- **Atual:** `isLinked ? 'border-primary/30 bg-primary/5' : 'border-border'`
- **Novo:** `isLinked ? 'border-primary bg-background' : 'border-border bg-background'`

Mesma mudança nos cards de brindes (linha ~254).

## 3. Calculadora de mão de obra com múltiplos funcionários

**Arquivo:** `src/components/service-orders/LaborCalculatorModal.tsx`

Refatorar para suportar N funcionários na equipe:

### Estado
```typescript
interface Worker {
  id: string;
  name: string;      // opcional, ex: "Técnico 1"
  salary: number;     // custo mensal total
  hours: number;      // horas neste serviço (default = valor global)
}

const [workers, setWorkers] = useState<Worker[]>([defaultWorker]);
const [monthlyHours, setMonthlyHours] = useState(176);  // base mensal global
const [defaultServiceHours, setDefaultServiceHours] = useState(2); // horas padrão do serviço
```

### Lógica de cálculo
```
Para cada funcionário:
  custo_hora = salary / monthlyHours
  custo_no_servico = custo_hora × hours_no_servico

Custo HH total = soma de todos custo_no_servico
Horas totais do serviço = max(hours de todos) ou soma (configurável)
```

### UI do modal
- Campo global "Horas mensais base" (176h) no topo
- Campo "Horas padrão neste serviço" — ao alterar, atualiza todos os workers que não foram editados individualmente
- Lista de funcionários, cada um com:
  - Input "Nome" (placeholder "Funcionário 1")
  - Input "Custo mensal (R$)"
  - Input "Horas neste serviço" (default do global, editável individualmente)
  - Custo calculado inline: `R$ X/h × Yh = R$ Z`
  - Botão remover (se > 1 funcionário)
- Botão "+ Adicionar funcionário"
- Preview resumo:
  - Tabela resumo com cada funcionário e seu custo
  - **Custo HH Total: R$ soma**
  - **Custo/hora médio: R$ total / horas**

### Callback `onApply`
Atualizar a interface para retornar tanto `hourlyRate` quanto `hours`:

```typescript
onApply: (hourlyRate: number, hours: number) => void;
```

No `ServiceCostsTab`, ao aplicar:
- `setHourlyRate(totalCost / totalHours)` — custo/hora combinado
- `setHours(totalHours)` — horas do serviço

### Arquivos afetados
| Arquivo | Mudança |
|---|---|
| `PricingConfigForm.tsx` | Adicionar botão Salvar no card Taxas BDI |
| `LinkedResourcesSection.tsx` | bg-background + border-primary quando selecionado |
| `LaborCalculatorModal.tsx` | Reescrita com lista de N funcionários |
| `ServiceCostsTab.tsx` | Atualizar `onApply` para receber `(rate, hours)` |

