

# Plano: Refatoração UI da Precificação + Responsividade

## Escopo
1. **PricingTab** — novo layout 2 colunas com hierarquia visual corrigida
2. **PricingConfigForm** — card educativo BDI, barra de composição, BDI em destaque
3. **BDIPreviewCard** — simulador com resultado hero, breakdown detalhado, fórmula visual
4. **Responsividade** em todas as abas: Orçamentos (QuotesList), Custos Globais, Custos dos Serviços

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/components/pricing/PricingTab.tsx` | Layout 2 colunas com proporção 5/7, stacking no mobile |
| `src/components/pricing/PricingConfigForm.tsx` | Reescrita completa da UI: card educativo BDI no topo, BDI text-2xl no header do card de taxas, barra de composição visual, card separado para deslocamento/pagamento, botão salvar alinhado à direita |
| `src/components/pricing/BDIPreviewCard.tsx` | Reescrita completa: título "Simulador de Preço" com badge, breakdown 4 cards (deslocamento, custo total, BDI em primary, lucro esperado), card resultado hero text-4xl com à vista/cartão, fórmula mono visual no footer |
| `src/components/service-orders/GlobalCostsTab.tsx` | Ajustes responsivos: KPIs 2 colunas no mobile, cards 1 coluna, tabs com scroll horizontal |
| `src/components/service-orders/ServiceCostsTab.tsx` | Ajustes responsivos: grid 1 coluna no mobile, tabs scrolláveis |
| `src/components/service-orders/LinkedResourcesSection.tsx` | Override input em nova linha no mobile |

## Detalhes da UI (Precificação)

### Coluna esquerda (PricingConfigForm)
1. **Card educativo** — `bg-primary/5 border-primary/20`, ícone Calculator em `bg-primary/10`, texto explicativo, fórmula mono `Preço = Custo Total ÷ BDI`
2. **Card Taxas BDI** — Header com "Taxas do BDI" à esquerda e BDI atual `text-2xl font-extrabold text-primary` à direita. Grid 3 cols para inputs. Barra visual de composição (4 segmentos coloridos: destructive, warning, success, primary) com legenda
3. **Card Deslocamento e Pagamento** — Grid 3 cols: KM cost, desconto à vista, parcelas
4. **Botão Salvar** — Alinhado à direita com ícone Save

### Coluna direita (BDIPreviewCard)  
1. **Header** — "Simulador de Preço" + Badge "Tempo real"
2. **Inputs** — Grid 2 cols: custo do serviço, distância KM
3. **Breakdown** — Grid 2×2: Deslocamento (com subtexto "X km × R$ Y/km"), Custo Total, BDI (border-primary/30, cor primary), Lucro Esperado (cor success)
4. **Card resultado hero** — Border primary/30, preço text-4xl font-extrabold, badge "BDI X.XXXX", separator, grid 2 cols com à vista (bg-muted rounded-lg) e cartão, footer com fórmula mono colorida

### Responsividade
- Mobile: colunas empilham (config primeiro, simulador abaixo)
- Grids 3 cols → 1 col no mobile
- Barra composição BDI mantida
- Resultado hero text-3xl no mobile
- KPIs de Custos Globais: 2 cols no mobile
- ServiceCostsTab: grid mão de obra 1 col no mobile

## Regras
- Zero alterações em lógica de cálculo
- Todas as cores via tokens CSS (primary, destructive, warning, success, muted, border)
- Componentes existentes (Card, Input, Badge, Button, Label)

