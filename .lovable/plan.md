
# Plano de Modernizacao do Sistema Glacial Cold Brasil

## Resumo

Este plano cobre a implementacao das telas faltantes do sistema e a modernizacao visual baseada no site glacialcoldbrasil.com.br, com foco em:
- Fonte Product Sans (alternativa ao Google Sans, que e proprietario)
- Paleta de cores preto e dourado premium
- Cards com glassmorphism e sombras modernas
- Animacoes sutis e micro-interacoes

---

## 1. Atualizacao do Design System

### 1.1 Tipografia
- Adicionar fonte **Inter** como principal (ja instalada) com fallback para Product Sans via CDN
- Alternativa: usar "Plus Jakarta Sans" do Google Fonts (muito similar ao Google Sans)
- Atualizar `index.html` com link para a fonte escolhida
- Atualizar `tailwind.config.ts` e `index.css` com a nova configuracao

### 1.2 Paleta de Cores Modernizada
Baseado no site da Glacial Cold:
- **Dourado Principal**: `hsl(43 74% 49%)` (ja configurado)
- **Preto Premium**: `hsl(0 0% 5%)`
- **Glassmorphism**: backgrounds com blur e transparencia

### 1.3 Componentes Modernizados
- Cards com bordas sutis e sombras mais pronunciadas
- Botoes com gradientes dourados
- Inputs com bordas arredondadas e focus states modernos
- Efeito de hover com escala e sombra

---

## 2. Telas a Implementar/Melhorar

### 2.1 Estoque (Inventory) - CRUD Completo
**Arquivo**: `src/pages/Inventory.tsx`

Funcionalidades:
- Listagem de itens com busca e filtros
- Formulario de cadastro/edicao de itens
- Alertas de estoque baixo
- Historico de movimentacoes
- Cards de resumo (total itens, valor total, itens em baixa)

**Novo componente**: `src/components/inventory/InventoryFormDialog.tsx`

### 2.2 PMOC - Gestao de Contratos
**Arquivo**: `src/pages/PMOC.tsx`

Funcionalidades:
- Listagem de contratos PMOC
- Formulario de novo contrato vinculado a cliente
- Cronograma de manutencoes (calendario)
- Geracao de relatorios
- Status do contrato (ativo/inativo)

**Novos componentes**:
- `src/components/pmoc/PmocContractFormDialog.tsx`
- `src/components/pmoc/PmocScheduleView.tsx`

### 2.3 CRM - Pipeline de Vendas
**Arquivo**: `src/pages/CRM.tsx`

Funcionalidades:
- Kanban de leads/oportunidades
- Cadastro de novos leads
- Arraste e solte entre estagios
- Historico de interacoes
- Valor total por estagio

**Novos componentes**:
- `src/components/crm/LeadFormDialog.tsx`
- `src/components/crm/LeadCard.tsx`
- `src/components/crm/PipelineColumn.tsx`

### 2.4 Usuarios - Gestao de Equipe
**Arquivo**: `src/pages/Users.tsx`

Funcionalidades:
- Listagem de usuarios do sistema
- Atribuicao de roles (admin, gestor, tecnico, etc)
- Perfil com avatar
- Ativacao/desativacao de usuarios

**Novo componente**: `src/components/users/UserFormDialog.tsx`

### 2.5 Configuracoes - Melhorias
**Arquivo**: `src/pages/Settings.tsx`

Funcionalidades:
- Salvar dados da empresa no banco
- Configuracoes de notificacao funcionais
- Troca de tema (claro/escuro)
- Logo da empresa personalizavel

---

## 3. Componentes de UI Modernizados

### 3.1 Novo Card Premium
Criar variante de card com:
- Glassmorphism effect
- Borda com gradiente dourado sutil
- Hover com elevacao

### 3.2 Stats Card Component
Componente reutilizavel para KPIs com:
- Icone
- Valor principal
- Label
- Indicador de variacao (up/down)

### 3.3 Page Header Component
Componente para cabecalho de paginas com:
- Titulo
- Descricao
- Acoes (botoes)
- Breadcrumbs (opcional)

---

## 4. Ordem de Implementacao

| Fase | Tarefa | Arquivos |
|------|--------|----------|
| 1 | Atualizar Design System (fonte + cores) | `index.html`, `index.css`, `tailwind.config.ts` |
| 2 | Criar componentes UI modernos | `src/components/ui/` |
| 3 | Implementar Estoque completo | `Inventory.tsx`, `InventoryFormDialog.tsx` |
| 4 | Implementar PMOC completo | `PMOC.tsx`, `PmocContractFormDialog.tsx` |
| 5 | Implementar CRM com Kanban | `CRM.tsx`, componentes de CRM |
| 6 | Implementar Usuarios | `Users.tsx`, `UserFormDialog.tsx` |
| 7 | Modernizar telas existentes | Dashboard, Clientes, OS, Financeiro |
| 8 | Melhorar tela de Auth | `Auth.tsx` |

---

## 5. Detalhes Tecnicos

### 5.1 Hooks a Criar
- `useInventory.ts` - CRUD de itens de estoque
- `usePmocContracts.ts` - CRUD de contratos PMOC
- `useLeads.ts` - CRUD de leads/oportunidades

### 5.2 Tabelas do Banco (ja existentes)
As tabelas `inventory`, `leads`, `lead_interactions`, `pmoc_contracts` e `pmoc_schedules` ja existem no schema.

### 5.3 Fonte Recomendada
Como o Google Sans nao e publico, usaremos **Plus Jakarta Sans** que tem aparencia muito similar:
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## 6. Resultado Esperado

Apos a implementacao:
- Sistema com visual moderno alinhado ao site glacialcoldbrasil.com.br
- Todas as telas funcionais com CRUD completo
- Fonte elegante e profissional
- Cards com efeitos de hover e sombras modernas
- Experiencia de usuario premium

