

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
