

# Plano: Modulo Controle de Ponto + Conversao Drawer→Modal

Este e um modulo grande. Sera implementado em etapas logicas.

---

## 1. Database (Migration SQL)

Criar 3 tabelas + 1 tabela de config + storage bucket + RLS:

**Tabelas:**
- `time_records` — registros individuais de ponto (clock_in, break_start, break_end, clock_out)
- `time_sheets` — folha diaria consolidada por usuario (saldo, status, totais)
- `time_schedules` — jornada semanal por usuario
- `time_settings` — config geral de ponto da empresa (selfie, geo, raio, tolerancia)

**Storage:** Bucket `time-photos` (publico) para selfies.

**RLS:** Isolamento por `company_id`. Tecnicos veem apenas seus registros. Admin/gestor veem todos da empresa via `get_user_company_id()`.

**Realtime:** Habilitar realtime em `time_records` para atualizar painel do gestor.

```sql
-- time_records, time_sheets, time_schedules, time_settings
-- RLS policies usando get_user_company_id() e auth.uid()
-- Storage bucket time-photos
-- ALTER PUBLICATION supabase_realtime ADD TABLE time_records;
```

---

## 2. Hooks

### `src/hooks/useTimeRecords.ts`
- `useTimeRecord(userId)` — registros do dia, nextAction calculado, registerPunch (upload foto, insert record, upsert sheet)
- `useWorkedMinutes(records)` — calculo em tempo real a cada 30s
- `useAdminTimeSheet()` — todos os funcionarios com status do dia, refresh a cada 60s
- `useTimeHistory(filters)` — historico paginado com filtros
- `useTimeSettings()` — CRUD da config de ponto
- `useTimeSchedules()` — CRUD das jornadas individuais

---

## 3. Navegacao — Aba "Controle de Ponto"

Na pagina `Users.tsx`, adicionar aba "Controle de Ponto" usando Tabs simples (nao SettingsSidebarLayout, pois Users nao usa).

Deteccao de role:
- Se `isAdminOrGestor()` → renderiza painel admin com sub-abas
- Se role `tecnico` → renderiza interface mobile-first de registro

---

## 4. Painel Admin (4 sub-abas)

### `src/components/time-tracking/AdminTimePanel.tsx`
Componente wrapper com sub-abas: Hoje | Historico | Relatorio | Configuracoes

### 4.1 Sub-aba "Hoje" (`TimeToday.tsx`)
- 4 KPIs: Presentes, Ausentes, Em intervalo, Concluidos
- Tabela de status com dot pulsante, tempo ao vivo (setInterval 60s)
- Linha clicavel → abre **modal** (ResponsiveModal) com timeline visual do dia
- Acoes: registro manual, justificar falta

### 4.2 Sub-aba "Historico" (`TimeHistory.tsx`)
- Filtros: funcionario, periodo (date range), status
- Tabela com saldo colorido (+green/-red)
- Totais no rodape
- Exportar CSV

### 4.3 Sub-aba "Relatorio" (`TimeReport.tsx`)
- Selector mes/ano + funcionario
- Card resumo (dias trabalhados, total, saldo, faltas, atrasos, extras)
- Calendario mensal visual com cores por status
- Grafico de barras (recharts) horas por dia com linha de referencia 8h
- Clique no dia → popover com horarios

### 4.4 Sub-aba "Configuracoes" (`TimeSettings.tsx`)
- Card jornada padrao (horarios, intervalo, toggles selfie/geo, raio, tolerancia)
- Card jornada individual: tabela por funcionario com horarios semanais, botao editar → modal

---

## 5. Interface do Tecnico (Mobile-First)

### `src/components/time-tracking/TechnicianTimeClock.tsx`
- Card principal com estado atual e botao grande por estado (5 estados)
- Bottom sheet (ResponsiveModal) com 3 etapas: geolocalizacao → selfie → confirmacao
- Camera frontal (`capture="user"`)
- `navigator.geolocation` com `enableHighAccuracy`
- Toast + `navigator.vibrate(200)` ao confirmar
- Historico recente: ultimos 7 dias em cards compactos
- Link "Ver historico completo" → modal com calendario mensal

---

## 6. Exportacao

### `src/utils/exportTimesheets.ts`
- `exportToCSV(records, period, employees)` — gera CSV com colunas completas
- Download automatico via Blob + anchor

---

## 7. Conversao Drawer→Modal

Converter os seguintes componentes de Sheet/Drawer para usar `ResponsiveModal` (modal no desktop, drawer no mobile):

- `ContractFormDialog.tsx` — Sheet → ResponsiveModal (com max-w maior ~700px)
- `PmocPlanFormDialog.tsx` — Dialog → ResponsiveModal
- `PmocContractFormDialog.tsx` — verificar e converter se necessario

---

## 8. Arquivos a Criar

- `src/hooks/useTimeRecords.ts`
- `src/components/time-tracking/AdminTimePanel.tsx`
- `src/components/time-tracking/TimeToday.tsx`
- `src/components/time-tracking/TimeHistory.tsx`
- `src/components/time-tracking/TimeReport.tsx`
- `src/components/time-tracking/TimeSettings.tsx`
- `src/components/time-tracking/TechnicianTimeClock.tsx`
- `src/components/time-tracking/TimeDayDetailModal.tsx`
- `src/components/time-tracking/ManualPunchModal.tsx`
- `src/components/time-tracking/ScheduleEditModal.tsx`
- `src/utils/exportTimesheets.ts`

## 9. Arquivos a Modificar

- `src/pages/Users.tsx` — adicionar aba Controle de Ponto
- `src/components/contracts/ContractFormDialog.tsx` — Sheet → ResponsiveModal
- `src/components/ui/ResponsiveModal.tsx` — adicionar prop para max-width maior
- `src/config/version.ts` — atualizar versao
- `src/pages/Changelog.tsx` — adicionar entrada

## 10. Migration SQL

1 migration para:
- 4 tabelas (time_records, time_sheets, time_schedules, time_settings)
- RLS policies
- Storage bucket time-photos
- Realtime enable

---

## Nota sobre Notificacoes

As notificacoes automaticas (pg_cron + edge functions para alertas de atraso/esquecimento) serao deixadas para uma fase posterior, pois dependem de infraestrutura de push notifications que o sistema ainda nao possui. O painel em si ja mostra os atrasos e ausencias em tempo real.

