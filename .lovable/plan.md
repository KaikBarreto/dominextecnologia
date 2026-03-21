


## Plan: Módulo Contratos (ex-PMOC) — Implementado ✅

### Implementado

1. **Banco de dados**: Tabelas `contracts`, `contract_items`, `contract_occurrences` criadas com RLS por `company_id`. Colunas `contract_id` e `origin` adicionadas a `service_orders`.

2. **Hooks**: `useContracts.ts` (CRUD, stats, geração de OSs em batch) e `useContractDetail.ts` (detalhe, ocorrências, progresso).

3. **ContractFormDialog**: Sheet lateral com stepper de 4 etapas (Informações → Frequência → Itens → Revisão). Atalhos rápidos de frequência, prévia de datas, aviso de fins de semana, itens manuais.

4. **Páginas**: `/contratos` (listagem com KPIs, filtros, tabela) e `/contratos/:id` (detalhe 2 colunas com progresso e ocorrências).

5. **Navegação**: PMOC → Contratos em sidebar, topbar, mobile menu. Rota `/pmoc` redireciona para `/contratos`. Permissão `screen:contracts`.

### Tabelas PMOC antigas mantidas (sem perda de dados)

---

## Plan: Feriados na Agenda + Melhorias Mapa ao Vivo — Implementado ✅

### Implementado

1. **Feriados**: `src/utils/holidays.ts` com cálculo de feriados nacionais (fixos + móveis como Carnaval, Corpus Christi, Páscoa) e municipais (capitais e cidades maiores). Integrado em todos os calendários (Mês, Semana, Dia, Agenda Mobile).

2. **Toggle Feriados**: Nova seção "Agenda" em Configurações > Usabilidade com switch `showHolidays` (padrão: ativado).

3. **Base da Empresa no Mapa**: Marcador teal com ícone de casa mostrando a localização da empresa (geocodificação automática via Nominatim). Incluído nos bounds do mapa.

4. **Popups Maiores + Click-to-Pin**: Tooltip pequeno no hover, popup maior e persistente no clique (fecha com X nativo do Leaflet). CSS customizado para popups com border-radius e shadow.

5. **Legenda atualizada**: Adicionado item "Base da empresa" na legenda do mapa.

---

## Plan: Sistema Modular de Assinatura com Feature Gating — Em Progresso 🔄

### Implementado ✅

1. **Banco de Dados**: Tabelas `subscription_modules` (catálogo) e `company_modules` (ativações por empresa) criadas com RLS. Coluna `included_modules` adicionada a `subscription_plans`. Coluna `extra_users` adicionada a `companies`. Seed de 9 módulos/adicionais.

2. **Hook `useCompanyModules`**: Busca módulos ativos da empresa, expõe `hasModule(code)`. Super admins têm acesso total.

3. **`ModuleGateModal`**: Modal reutilizável com nome, descrição, preço e botão "Contratar Agora" → redireciona para `/assinatura`.

4. **Feature Gating — Financeiro**: Abas "Contas" e "DRE" só aparecem com `finance_advanced`. Modal de gate ao tentar acessar.

5. **Feature Gating — Precificação**: Abas "Custos dos Serviços" e "Custos Globais" em Serviços, e aba "Precificação" em Orçamentos, só com `pricing_advanced`.

6. **Feature Gating — CRM e RH**: Rotas `/crm` e `/funcionarios` protegidas via `ModuleRoute`. Itens do sidebar filtrados por `moduleKey`.

7. **Feature Gating — White Label**: Seção de White Label em Configurações mostra convite de contratação se módulo não ativo.

8. **Sidebar**: Itens de menu filtrados por `moduleKey` além de `screenKey`.

9. **Checkout Modular**: 3 planos pré-montados (Essencial R$200, Avançado R$350, Master R$650) + modo "Monte o Seu" com checkboxes de módulos, contador de usuários extras e cálculo automático.

10. **Billing (Assinatura)**: Mostra módulos ativos e disponíveis com cards visuais e CTA de contratação.

### Pendente 🔲

- Admin: gestão de módulos por empresa no painel super admin
- Landing Page: atualizar PricingSection com novos planos e tabela comparativa
- MobileMenu: filtrar itens por moduleKey (similar ao sidebar)
