

## Plano: Rastreamento de Campo, Histórico de Deslocamentos e Mapa ao Vivo

### 1. Banco de Dados

**Nova tabela `technician_locations`:**
- `id` (uuid PK), `user_id` (uuid, NOT NULL), `service_order_id` (uuid, nullable), `lat` (double precision), `lng` (double precision), `event_type` (text: 'tracking', 'check_in', 'check_out'), `created_at` (timestamptz)
- RLS: autenticados podem inserir próprias localizações (`auth.uid() = user_id`), admin/gestor podem ver todas
- Habilitar Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_locations;`

### 2. Registro Automático nos Check-ins/Check-outs

**Arquivo: `src/pages/TechnicianOS.tsx`**
- Nos métodos `handleCheckIn` e `handleFinishOS`, após capturar a localização GPS, inserir um registro em `technician_locations` com `event_type: 'check_in'` ou `'check_out'`, o `service_order_id` e as coordenadas.

### 3. Envio Periódico de Geolocalização (App do Técnico)

**Arquivo: `src/pages/TechnicianOS.tsx`**
- Quando o técnico faz check-in (OS em andamento), iniciar `navigator.geolocation.watchPosition` enviando coordenadas a cada ~30s para `technician_locations` com `event_type: 'tracking'`.
- Parar o watch ao finalizar a OS ou sair da página (cleanup no `useEffect`).

### 4. Distância do Técnico ao Cliente na Visualização da OS

**Arquivos: `ServiceOrderViewDialog.tsx`, `OrderSummarySheet.tsx`**
- Buscar a última localização do técnico (`technician_locations` onde `user_id = technician_id`, ordenado por `created_at DESC`, limit 1).
- Calcular distância linear (fórmula Haversine) entre a posição do técnico e o endereço do cliente (usando coordenadas do check-in ou última localização).
- Exibir badge com distância estimada (ex: "~3.2 km do cliente").
- Botões "Abrir no Google Maps" e "Abrir no Waze" com URL de rota (`https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=ADDR` e `https://waze.com/ul?ll=LAT,LNG&navigate=yes`).

### 5. Timeline Visual de Deslocamentos por Técnico/Dia

**Novo arquivo: `src/pages/TechnicianTracking.tsx`**
- Tela acessível pelo gestor (nova rota `/rastreamento`).
- Filtros: selecionar técnico e data.
- Buscar todos os registros de `technician_locations` para o técnico/dia.
- Exibir timeline vertical com horário, tipo de evento (check-in/tracking/check-out), coordenadas e link para Google Maps.
- Card com resumo: total de check-ins, distância total percorrida, tempo em campo.

### 6. Mapa ao Vivo com Leaflet

**Novo arquivo: `src/pages/LiveMap.tsx`** (ou seção dentro de `TechnicianTracking.tsx`)
- Instalar `leaflet` e `react-leaflet`.
- Mapa OpenStreetMap mostrando marcadores de todos os técnicos ativos (com OS em andamento).
- Usar Supabase Realtime para escutar `INSERT` em `technician_locations` e atualizar posições em tempo real.
- Popup nos marcadores: nome do técnico, OS atual, último update.
- Adicionar rota no `App.tsx`: `/rastreamento` e `/mapa-ao-vivo` (ou unificar em uma tela com abas).

### 7. Navegação

- Adicionar links "Rastreamento" e/ou "Mapa ao Vivo" no sidebar (`AppSidebar.tsx`), visível para admin/gestor.

### Resumo de Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | Migration SQL (tabela + RLS + realtime) |
| Criar | `src/hooks/useTechnicianLocations.ts` |
| Criar | `src/pages/TechnicianTracking.tsx` |
| Criar | `src/pages/LiveMap.tsx` |
| Editar | `src/pages/TechnicianOS.tsx` (tracking + insert locations) |
| Editar | `src/components/service-orders/ServiceOrderViewDialog.tsx` (distância + botões rota) |
| Editar | `src/components/schedule/OrderSummarySheet.tsx` (distância + botões rota) |
| Editar | `src/App.tsx` (novas rotas) |
| Editar | `src/components/layout/AppSidebar.tsx` (links navegação) |
| Instalar | `leaflet`, `react-leaflet`, `@types/leaflet` |

