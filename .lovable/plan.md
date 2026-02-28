
# Agenda Tecnica Inteligente + DarkVeil Background

## Resumo
Reconstruir completamente a tela de Agenda com visoes Mes/Semana/Dia, filtros por tecnico/cliente/status, drawer lateral para resumo de OS, Quick Action ao clicar em horario vazio, e visao mobile como lista cronologica. Substituir o background de imagem nas telas de login/cadastro pelo componente DarkVeil (WebGL animado). Modais no mobile serao Drawers vindos de baixo.

---

## Parte 1: DarkVeil no Background de Login/Cadastro

### Novos arquivos:
- `src/components/ui/DarkVeil.tsx` - Componente WebGL usando a lib `ogl` (shader CPPN conforme fornecido)

### Alteracoes:
- **`src/pages/Auth.tsx`** - Substituir `backgroundImage: url(loginBg)` pelo componente `<DarkVeil>` posicionado absolute/fullscreen atras do card
- **`src/pages/Registration.tsx`** - Mesma substituicao
- **`src/pages/ResetPassword.tsx`** - Mesma substituicao
- Instalar dependencia: `ogl`

### Estrutura visual:
```text
+----------------------------------+
|  DarkVeil (fullscreen, z-0)      |
|  +----------------------------+  |
|  |  Card glassmorphism (z-10) |  |
|  |  bg-black/60 backdrop-blur |  |
|  +----------------------------+  |
+----------------------------------+
```

---

## Parte 2: Agenda Tecnica Inteligente

### Novos componentes:
1. `src/components/schedule/ScheduleHeader.tsx` - Header com filtros (Tecnico, Cliente, Status) usando Select + abas Mes/Semana/Dia usando Tabs
2. `src/components/schedule/WeeklyCalendar.tsx` - Visao semanal com grid de horarios (7 colunas x 24 linhas)
3. `src/components/schedule/DailyCalendar.tsx` - Visao diaria com timeline vertical de horarios
4. `src/components/schedule/EventCard.tsx` - Card padrao para exibir evento no calendario (Nome Cliente, Titulo Servico, icone localizacao + bairro)
5. `src/components/schedule/OrderSummarySheet.tsx` - Sheet/Drawer lateral que abre ao clicar em um evento com resumo da OS
6. `src/components/schedule/MobileAgendaView.tsx` - Visao de lista cronologica para mobile
7. `src/components/schedule/ScheduleSkeleton.tsx` - Skeletons de carregamento

### Arquivos alterados:
- `src/pages/Schedule.tsx` - Reescrever completamente para orquestrar as novas visoes
- `src/components/schedule/MonthlyCalendar.tsx` - Refatorar para integrar com o novo sistema de filtros e EventCard
- `src/components/schedule/DaySchedule.tsx` - Pode ser removido (substituido por DailyCalendar + OrderSummarySheet)

### Cores dos badges de status (conforme solicitado):
- **Azul** (`bg-info`): Pendente / Agendada
- **Amarelo/Marca** (`bg-primary`): Em Andamento / Aguardando Peca
- **Verde** (`bg-success`): Concluida
- **Vermelho** (`bg-destructive`): Atrasada (status pendente + data passada) / Cancelada

### Layout Desktop:
```text
+--------------------------------------------------+
| [< >] Janeiro 2026   [Filtros: Tecnico|Cliente|Status]  [+ Nova OS] |
| [Mes] [Semana] [Dia]                              |
+--------------------------------------------------+
|                                                    |
|  Calendario (Mes/Semana/Dia)                      |
|                                                    |
|                        +-------------------------+ |
|                        | Sheet: Resumo da OS     | |
|                        | (abre ao clicar evento) | |
|                        +-------------------------+ |
+--------------------------------------------------+
```

### Layout Mobile:
```text
+----------------------+
| Agenda  [Filtros] [+]|
| Janeiro 2026  [< >]  |
+----------------------+
| 08:00 - Preventiva   |
|   Cliente ABC         |
|   Bairro Centro       |
+----------------------+
| 10:30 - Corretiva    |
|   Cliente XYZ         |
|   Bairro Tijuca       |
+----------------------+
```
- Usa `useIsMobile()` para detectar e alternar automaticamente
- Modais no mobile usam Drawer (vaul) de baixo para cima

### Quick Action (clicar em horario vazio):
- Ao clicar em um slot vazio no calendario (semana ou dia), abre o Dialog/Drawer de nova OS pre-preenchido com a data/hora clicada
- No mes, clicar em um dia vazio abre com a data preenchida

### Filtros:
- **Tecnico**: Select com lista de tecnicos (via `useTechnicians()`)
- **Cliente**: Select com lista de clientes (via `useCustomers()`)  
- **Status**: Select multi com opcoes (Pendente, Em Andamento, Concluida, Cancelada)
- Filtros aplicados via `useMemo` sobre os dados ja carregados

### Drag & Drop de datas:
- Ao arrastar um evento para outra data/horario, dispara `updateServiceOrder` com os novos `scheduled_date` e `scheduled_time`
- Implementacao simples com HTML5 drag events (sem lib externa)

### Skeletons:
- Enquanto `isLoading`, exibir Skeleton com formato do calendario (grid de celulas pulsantes)

---

## Detalhes Tecnicos

### Dependencia nova:
- `ogl` (para o shader WebGL do DarkVeil)

### Componentes shadcn/ui utilizados:
- `Tabs` (abas Mes/Semana/Dia)
- `Card` (EventCard)
- `Badge` (status coloridos)
- `Dialog` (nova OS no desktop)
- `Sheet` (resumo lateral da OS)
- `Drawer` (modais mobile)
- `Select` (filtros)
- `Button`, `Popover`, `Skeleton`
- `ScrollArea` (listas longas)

### Responsive:
- `useIsMobile()` hook existente para detectar mobile
- Desktop: calendario completo + sheet lateral
- Mobile: lista cronologica (MobileAgendaView) + drawers de baixo

### Sincronizacao com banco:
- Alteracao de data no calendario (drag & drop) chama `updateServiceOrder.mutateAsync({ id, scheduled_date, scheduled_time })`
- Dados invalidados automaticamente via React Query

### Parametros do DarkVeil:
- `hueShift={240}` (tom azulado-escuro)
- `speed={0.5}` (animacao suave)
- `noiseIntensity={0}`, `scanlineIntensity={0}`, `scanlineFrequency={0}`, `warpAmount={0}`
