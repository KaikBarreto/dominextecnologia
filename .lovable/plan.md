

# Plano de Implementacao

Este plano cobre 7 itens distintos solicitados.

---

## 1. Scrollbar personalizada em todos os ScrollArea do sistema

**O que**: Estilizar o thumb do `ScrollBar` no componente `scroll-area.tsx` para usar a cor da marca (#00C597) com track escuro, consistente com a landing page.

**Como**:
- Editar `src/components/ui/scroll-area.tsx`: trocar a classe `bg-border` do `ScrollAreaThumb` por classes que apliquem a cor primaria (`bg-primary/60 hover:bg-primary/80`)
- Isso propaga automaticamente para todos os ~13 arquivos que usam `ScrollArea`

---

## 2. Portal do Cliente (self-service)

**Escopo**: Pagina publica acessivel via link gerado na tela do cliente, permitindo abertura de chamados, acompanhamento de OS em tempo real, historico de servicos/equipamentos, com QR code do equipamento levando ao portal.

### 2.1 Database

Nova tabela `customer_portals`:
- `id` uuid PK
- `customer_id` uuid FK -> customers
- `token` text unique (random 32 hex)
- `is_active` boolean default true
- `created_at` timestamp

RLS: SELECT publico (filtro por token no app), gestao para INSERT/UPDATE/DELETE.

### 2.2 Backend / Edge Function

Nenhuma edge function necessaria — tudo via queries client-side filtradas por token.

### 2.3 Frontend

- **Nova pagina `src/pages/CustomerPortal.tsx`**: rota publica `/portal/:token`
  - Layout publico com logo da empresa
  - Abas: "Meus Equipamentos", "Minhas OS", "Abrir Chamado"
  - **Abrir Chamado**: formulario simples (descricao, equipamento opcional, urgencia) que cria service_order com `origin: 'portal'`
  - **Minhas OS**: lista de OS do cliente com status em tempo real (realtime subscription)
  - **Meus Equipamentos**: lista de equipamentos com link para detalhe
  - **Detalhe do Equipamento**: info basica, historico de OS

- **Rota em `App.tsx`**: `/portal/:token`

- **Botao "Gerar Link do Portal"** na tela `CustomerDetail.tsx`:
  - Gera token na tabela `customer_portals`
  - Exibe link copiavel e QR code

- **QR Code do equipamento**: atualizar para apontar para `/portal/:token?eq=:equipmentId` (mostra o portal na aba do equipamento especifico)

### 2.4 RLS para acesso publico

- Politica SELECT publica em `service_orders` filtrada por `customer_id` (ja existe via token no app)
- Politica INSERT publica em `service_orders` para chamados do portal (com validacao no app)
- Politica SELECT publica em `equipment` por customer_id (ja existe)

### 2.5 Migracao SQL

```sql
CREATE TABLE public.customer_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_portals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view portal by token" ON public.customer_portals
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can manage portals" ON public.customer_portals
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow public to insert service orders (portal tickets)
CREATE POLICY "Public can create portal tickets" ON public.service_orders
  FOR INSERT WITH CHECK (true);
```

---

## 3. Editar/Excluir contrato no topo da tela de contrato

**O que**: Adicionar botoes "Editar" e "Excluir" no topo direito de `ContractDetail.tsx`.

**Como**:
- No header (linha ~146-157), adicionar `DropdownMenu` ou botoes com icones Edit e Trash2
- **Editar**: abre `ContractFormDialog` em modo edicao (reutilizar o dialog existente)
- **Excluir**: abre `AlertDialog` listando o que sera apagado (N ocorrencias, N OSs vinculadas, N contas a receber)
- Ao confirmar exclusao: deletar `contract_occurrences`, `service_orders` vinculadas (where contract_id), `financial_transactions` vinculadas, depois o contrato
- Apos exclusao, redirecionar para `/contratos`

---

## 4. Botao "Renovar Contrato" no Resumo

**O que**: No card "Resumo" da sidebar direita, adicionar botao "Renovar Contrato".

**Como**:
- Botao com icone `Repeat` no card Resumo
- Ao clicar, abre modal pre-preenchido com os dados do contrato atual, mas com `start_date` = dia seguinte ao ultimo `scheduled_date` das ocorrencias
- Usa `createContract` do hook existente para criar novo contrato
- Apos criacao, navega para o novo contrato

---

## 5. Toggle "Todos os servicos" desativado por padrao no novo questionario

**O que**: Ao criar um novo questionario no `FormTemplateManagerDialog`, o toggle "Todos os serviços" deve iniciar desativado.

**Como**:
- No hook `useFormTemplates`, ao criar template, setar `service_type_ids` para o array com o primeiro servico ativo (nao vazio), forcando o toggle "Todos" a ficar OFF
- Alternativa: no `createTemplate` mutation, apos criar, chamar `setTemplateServices` com o primeiro tipo de servico ativo

---

## 6. Paginacao padrao de 10 itens

**O que**: Alterar o default de todas as paginacoes de 25 para 10.

**Como**:
- Editar `useDataPagination.ts`: mudar `PageSizeOption` para `10 | 25 | 50 | 100 | 'all'` e default para `10`
- Editar `DataTablePagination.tsx`: adicionar opcao "10" no Select e ajustar tipo
- Isso propaga para todos os consumidores automaticamente

---

## 7. Resumo de Impacto

### Arquivos a criar:
- `src/pages/CustomerPortal.tsx`

### Arquivos a modificar:
- `src/components/ui/scroll-area.tsx` (scrollbar styling)
- `src/hooks/useDataPagination.ts` (default 10)
- `src/components/ui/DataTablePagination.tsx` (opcao 10)
- `src/pages/ContractDetail.tsx` (editar/excluir/renovar)
- `src/hooks/useContracts.ts` (delete cascade logic)
- `src/components/service-orders/FormTemplateManagerDialog.tsx` (toggle default)
- `src/hooks/useFormTemplates.ts` (create with services off)
- `src/pages/CustomerDetail.tsx` (gerar link portal)
- `src/App.tsx` (rota /portal/:token)

### Migracao SQL:
- 1 migration para tabela `customer_portals` + politica INSERT publica em service_orders

