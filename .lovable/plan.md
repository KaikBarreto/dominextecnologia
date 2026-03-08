

## Plano: Corrigir template na visualizacao + Modal "Configurar Proposta"

### Problemas identificados

1. **Template nao muda na visualizacao**: O `QuoteViewDialog` le `quote.proposal_templates?.slug` do objeto em memoria. Apos editar e salvar, o `queryClient.invalidateQueries` recarrega os dados, mas o usuario precisa fechar e reabrir. O dado deve estar correto apos o refetch — vou garantir que o slug e lido corretamente do join.

2. **Template selector esta dentro do form de orcamento** — o usuario quer que isso va para um modal separado "Configurar Proposta".

### Alteracoes

**1. Novo componente: `ProposalConfigDialog.tsx`**
- Modal acessivel pelo botao "Configurar Proposta" ao lado de "Novo Orcamento"
- Mostra os 3 templates lado a lado como cards com preview visual (miniatura estilizada, nao imagem)
- Cada card mostra: nome, descricao curta, cor de preview, badge "selecionado"
- Ao clicar em um template, uma preview maior aparece ao lado (ou abaixo em mobile)
- Nao salva nada globalmente — apenas serve para o usuario visualizar os templates disponiveis
- Pode ter um botao "Usar este template" que copia o ID para o clipboard ou simplesmente mostra informacao

**2. Remover selector de template do `QuoteFormDialog.tsx`**
- Mover o campo de template para dentro do form porem simplificado, OU manter no form mas com visual melhor (radio cards em vez de select dropdown)
- Na verdade, manter o select no form faz sentido para vincular ao orcamento. Vou mante-lo mas adicionar o modal de configuracao como preview/catalogo.

**3. Corrigir leitura do template no `QuoteViewDialog`**
- Garantir que `quote.proposal_templates?.slug` funciona corretamente apos o refetch
- O tipo `Quote` ja inclui `proposal_templates?: { slug: string; name: string } | null` — preciso verificar se o cast esta correto

**4. Melhorar os 3 templates visuais**
- **ClassicTemplate**: Redesenhar com visual corporativo mais elaborado — header com linha dupla, tipografia serif, tabelas com alternating rows
- **ModernTemplate**: Header com gradiente, cards com sombras, tipografia bold moderna, cores vibrantes
- **MinimalTemplate**: Ultra clean, muito espaco branco, tipografia fina, sem bordas, estilo editorial

### Arquivos

- **Novo**: `src/components/quotes/ProposalConfigDialog.tsx`
- **Editar**: `src/pages/Quotes.tsx` (botao configurar proposta)
- **Editar**: `src/components/quotes/QuoteViewDialog.tsx` (fix slug reading)
- **Editar**: `src/components/quotes/templates/ClassicTemplate.tsx` (redesign)
- **Editar**: `src/components/quotes/templates/ModernTemplate.tsx` (redesign)
- **Editar**: `src/components/quotes/templates/MinimalTemplate.tsx` (redesign)

### Sem alteracoes de banco

Tudo ja existe na tabela `proposal_templates`.

