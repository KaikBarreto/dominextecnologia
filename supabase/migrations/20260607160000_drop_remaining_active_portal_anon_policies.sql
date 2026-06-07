-- Fase 0.2 (continuação) — fecha as policies anon `is_customer_in_active_portal`
-- que sobraram em tabelas-satélite após o drop de service_orders/customers.
--
-- Contexto: após dropar "Public view service_orders via portal" e
-- "Public view customers via active portal" (20260607150000), restavam policies
-- `TO anon` SELECT com `is_customer_in_active_portal(customer_id)` (sem token) em
-- tabelas-satélite — `equipment` ainda enumerava 18 linhas (clientes com portal
-- ativo). Toda leitura pública dessas tabelas já passa pelas RPCs SECURITY DEFINER
-- (get_public_os / get_portal_data / get_rating_with_os_by_token), então as policies
-- diretas podem cair. Verificado no ar: enumeração anon → 0 em todas; portal, link
-- de OS e avaliação seguem renderizando.
--
-- `technician_locations` NÃO entra: o mapa público de tracking ao vivo ainda lê
-- essa tabela direto via anon + realtime. Follow-up próprio (RPC + polling) antes
-- de fechar a porta dela.

DROP POLICY IF EXISTS "Public view equipment via active portal"          ON public.equipment;
DROP POLICY IF EXISTS "Public view form_questions via OS portal"         ON public.form_questions;
DROP POLICY IF EXISTS "Public view form_responses via OS portal"         ON public.form_responses;
DROP POLICY IF EXISTS "Public view form_templates via OS portal"         ON public.form_templates;
DROP POLICY IF EXISTS "Public view os_photos via portal"                 ON public.os_photos;
DROP POLICY IF EXISTS "Public view service_order_equipment via portal"   ON public.service_order_equipment;
