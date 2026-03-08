

# Plano: Responsividade Mobile-First em Todas as Telas

## Problema
Os cards de funcionários e outros componentes quebram em telas desktop menores (1024px-1280px). Várias páginas usam grids e tabelas que não se adaptam bem a larguras intermediárias.

## Abordagem
Implementar em **3 etapas**, priorizando as telas mais impactadas. A filosofia é: mobile-first, layout verticalizado, cards em vez de tabelas em telas menores, `overflow-hidden` e `truncate` para evitar quebras.

---

## Etapa 1 — Cards e Listagens com Quebra Visual

### 1.1 EmployeeCard (`src/components/employees/EmployeeCard.tsx`)
- Salary + Badge: mudar de `flex items-center gap-2` para `flex flex-wrap` para evitar overflow
- Action buttons: garantir `flex-wrap` e reduzir padding em telas menores
- Truncar email/endereço com `truncate` e `max-w-full`

### 1.2 Employees grid (`src/pages/Employees.tsx`)
- Mudar grid de `sm:grid-cols-2 xl:grid-cols-3` para `grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3` (cards ocupam 1 coluna até 640px)
- Toolbar: empilhar busca + sort + botão em mobile (`flex-col`)

### 1.3 Users page (`src/pages/Users.tsx`)
- Cards de usuários: garantir `min-w-0` e `truncate` em nomes/emails
- Permissões: converter grid horizontal para vertical em telas menores

### 1.4 Teams page (`src/pages/Teams.tsx`)
- Cards: ajustar grid para `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`

---

## Etapa 2 — Tabelas Responsivas (Card-view em Mobile)

### 2.1 Customers (`src/pages/Customers.tsx`)
- Em mobile (< 1024px): renderizar como cards em vez de tabela
- Cada card mostra: foto, nome, documento, telefone, tipo badge, ações
- Desktop: manter tabela atual

### 2.2 Service Orders (`src/pages/ServiceOrders.tsx`)
- Mesmo padrão: card-view em mobile com OS number, status badge, cliente, data
- Desktop: tabela existente

### 2.3 Contracts (`src/pages/Contracts.tsx`)
- Card-view mobile: nome contrato, cliente, status, valor, próxima ocorrência

### 2.4 Quotes (`src/pages/Quotes.tsx`)
- Card-view mobile: número, cliente, valor, status badge

### 2.5 Inventory (`src/pages/Inventory.tsx`)
- Card-view mobile: nome, SKU, quantidade, valor

### 2.6 PMOC (`src/pages/PMOC.tsx`)
- Tabelas de planos/contratos/cronograma: card-view em mobile

---

## Etapa 3 — Dashboard, Financeiro e Demais Telas

### 3.1 Dashboard (`src/pages/Dashboard.tsx`)
- Stats: `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4` (já razoável, ajustar texto para não overflow)
- Charts: empilhar em mobile (`grid-cols-1 lg:grid-cols-2` — já OK)
- Recent OS cards: garantir truncate

### 3.2 Finance (`src/pages/Finance.tsx`)
- Overview cards: responsivos com `grid-cols-2 lg:grid-cols-4`
- Transaction list: card-view em mobile

### 3.3 CRM (`src/pages/CRM.tsx`)
- Kanban: scroll horizontal em mobile (já funciona), mas ajustar largura mínima dos cards
- Summary cards: `grid-cols-2` em mobile

### 3.4 Schedule (`src/pages/Schedule.tsx`)
- Já tem tratamento mobile (MobileAgendaView). Verificar filtros empilhados.

### 3.5 Settings (`src/pages/Settings.tsx`)
- SettingsSidebarLayout já tem Select mobile. Verificar inputs de endereço em grid.

### 3.6 Equipment (`src/pages/Equipment.tsx`)
- Sidebar nav: já flexível. Verificar tabela de equipamentos.

---

## Detalhes Técnicos

**Padrão de Card-View Mobile**: Criar um padrão reutilizável onde cada página com tabela verifica `useIsMobile()` e renderiza cards em vez de `<Table>`. Os cards seguem layout vertical: info principal no topo, metadados no meio, ações no rodapé.

**Classes-chave aplicadas globalmente**:
- `min-w-0` em flex children para permitir truncate
- `overflow-hidden` em containers de card
- `truncate` em textos longos (nomes, emails, endereços)
- `flex-wrap` em grupos de badges/botões
- Grids: sempre começar com `grid-cols-1` e escalar

**Arquivos impactados** (~15-18 arquivos):
- `src/components/employees/EmployeeCard.tsx`
- `src/pages/Employees.tsx`
- `src/pages/Customers.tsx`
- `src/pages/ServiceOrders.tsx`
- `src/pages/Contracts.tsx`
- `src/pages/Quotes.tsx`
- `src/pages/Inventory.tsx`
- `src/pages/PMOC.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Finance.tsx`
- `src/pages/CRM.tsx`
- `src/pages/Users.tsx`
- `src/pages/Teams.tsx`
- `src/pages/Equipment.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Schedule.tsx`

