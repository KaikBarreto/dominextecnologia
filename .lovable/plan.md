

## Plano: Sistema de Propostas com Templates

### Conceito

Todo orcamento gera uma **Proposta** — uma pagina HTML publica e estilizada, acessivel via link. O usuario pode escolher entre templates pre-definidos ao criar o orcamento. O botao "Visualizar" abre a proposta (nao mais o dialog atual). O link copiavel ja aponta para a pagina da proposta.

### Estrutura

```text
┌─────────────────────────────────────────────┐
│  DB: proposal_templates (seed com 3 templates)  │
│  - id, name, slug, html_structure, thumbnail_url│
│                                                 │
│  DB: quotes.proposal_template_id (novo campo)   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  /proposta/:token  (nova rota publica)          │
│  - Renderiza a proposta HTML com dados do quote │
│  - Botoes aprovar/rejeitar mantidos             │
│  - Substitui /orcamento/:token como link publico│
└─────────────────────────────────────────────┘
```

### Templates fornecidos (3 iniciais)

1. **Classico** — Layout limpo, logo topo-esquerda, tabelas com bordas sutis, cores neutras. Profissional corporativo.
2. **Moderno** — Header com fundo colorido (cor primaria da empresa), cards arredondados para itens, visual tech/startup.
3. **Minimalista** — Muito branco, tipografia grande, sem bordas, estilo Apple/clean.

### Alteracoes

**1. Migracao de banco**
- Criar tabela `proposal_templates` com: `id`, `name`, `slug`, `description`, `preview_color` (cor de preview), `created_at`
- Adicionar coluna `proposal_template_id` (uuid, nullable, default ao template "classico") na tabela `quotes`
- Seed com 3 registros (classico, moderno, minimalista)

**2. Nova pagina: `src/pages/ProposalPublic.tsx`**
- Rota: `/proposta/:token`
- Busca quote + company_settings + proposal_template
- Renderiza HTML da proposta segundo o template selecionado (logica de render por slug)
- Mantem botoes aprovar/rejeitar para status `enviado`
- Design full-page profissional (nao card dentro de fundo cinza)

**3. Componente: `src/components/quotes/ProposalRenderer.tsx`**
- Recebe `quote`, `company`, `templateSlug` como props
- Switch/map de templates: cada slug renderiza um layout React diferente
- Reutilizado tanto na pagina publica quanto no dialog de visualizacao

**4. Atualizar `QuoteViewDialog.tsx`**
- Substituir o conteudo atual pelo `ProposalRenderer`
- Manter botoes PDF e WhatsApp
- O PDF agora captura a proposta renderizada

**5. Atualizar `QuoteFormDialog.tsx`**
- Adicionar campo `Select` para escolher template de proposta
- Usar hook `useProposalTemplates` para listar opcoes
- Salvar `proposal_template_id` no payload

**6. Hook: `src/hooks/useProposalTemplates.ts`**
- Query simples na tabela `proposal_templates`

**7. Atualizar `useQuotes.ts`**
- Adicionar `proposal_template_id` ao `QuoteInput` e mutations
- Adicionar join com `proposal_templates(slug, name)` na query principal

**8. Atualizar rotas e links**
- `App.tsx`: adicionar rota `/proposta/:token` com `ProposalPublic`
- `Quotes.tsx`: botao copiar link agora usa `/proposta/:token`
- Manter `/orcamento/:token` como redirect para `/proposta/:token` (retrocompatibilidade)

**9. Atualizar `QuotePublic.tsx`**
- Redirecionar para `/proposta/:token`

### Arquivos novos
- `src/pages/ProposalPublic.tsx`
- `src/components/quotes/ProposalRenderer.tsx`
- `src/components/quotes/templates/ClassicTemplate.tsx`
- `src/components/quotes/templates/ModernTemplate.tsx`
- `src/components/quotes/templates/MinimalTemplate.tsx`
- `src/hooks/useProposalTemplates.ts`

### Arquivos editados
- `src/hooks/useQuotes.ts` — adicionar `proposal_template_id`
- `src/components/quotes/QuoteFormDialog.tsx` — campo de template
- `src/components/quotes/QuoteViewDialog.tsx` — usar ProposalRenderer
- `src/pages/Quotes.tsx` — link aponta para `/proposta/`
- `src/pages/QuotePublic.tsx` — redirect
- `src/App.tsx` — nova rota

