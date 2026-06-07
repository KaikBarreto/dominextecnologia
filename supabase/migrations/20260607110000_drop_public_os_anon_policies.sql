-- ⚠️⚠️⚠️ NÃO APLICAR AINDA — fecha a porta da enumeração pública. ⚠️⚠️⚠️
--
-- O Tech Lead deve, NESTA ordem:
--   1. Testar o link público real (/os-tecnico/:id?modo=cliente) já renderizando
--      via RPC `get_public_os` (modo cliente + relatório concluído + mapa a_caminho).
--   2. SÓ ENTÃO aplicar este DROP.
--   3. Testar o link de novo (não pode quebrar nada).
-- Se algo faltar no payload da RPC, descobrimos ANTES de fechar a porta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÊ
-- As policies abaixo são `TO anon` com `USING(true)` (ou `... IN (SELECT ... FROM
-- service_orders)`, que na prática é "tudo"). Com a chave pública (que está no
-- bundle), qualquer um fazia `SELECT *` e baixava TODAS as OSs de TODAS as
-- empresas — com nome de cliente, fotos, respostas etc. (vazamento confirmado:
-- 1013 OSs). A leitura pública agora passa 100% pela RPC SECURITY DEFINER
-- `get_public_os(p_os_id)`, que recebe só um id e devolve aquela OS — sem
-- enumeração. Logo, estas policies amplas podem cair.
--
-- O QUE PERMANECE (NÃO mexer):
--   • Policies `... via portal` / `... via active portal` / `... by header token`
--     (fluxo do portal do cliente e do link de avaliação, com token no header).
--   • INSERT/UPDATE anon de form_responses, service_ratings, quotes (submissões).
--   • `technician_locations` (mapa público de tracking ainda lê direto via anon +
--     realtime). FOLLOW-UP separado: precisa de RPC própria + polling antes do
--     drop. NÃO incluído aqui pra não quebrar o tracking ao vivo.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can view service orders by share link"        ON public.service_orders;
DROP POLICY IF EXISTS "Public can view service_types via shared OS"          ON public.service_types;
DROP POLICY IF EXISTS "Public can view equipment_categories via shared OS"   ON public.equipment_categories;
DROP POLICY IF EXISTS "Public can view form_templates via shared OS"         ON public.form_templates;
DROP POLICY IF EXISTS "Public can view form_questions via shared OS"         ON public.form_questions;
DROP POLICY IF EXISTS "Public can view os_photos via shared OS"              ON public.os_photos;
DROP POLICY IF EXISTS "Public can view form_responses via shared OS"         ON public.form_responses;
DROP POLICY IF EXISTS "Public can view service_order_equipment via shared OS" ON public.service_order_equipment;
DROP POLICY IF EXISTS "Public can view service_order_assignees via shared OS" ON public.service_order_assignees;
DROP POLICY IF EXISTS "Public can view customers via shared OS"              ON public.customers;
DROP POLICY IF EXISTS "Public can view equipment via shared OS"             ON public.equipment;
DROP POLICY IF EXISTS "Public can view profiles via shared OS"              ON public.profiles;
DROP POLICY IF EXISTS "Public can view company_settings via shared OS"      ON public.company_settings;

-- service_ratings NÃO tem policy "via shared OS" — só token policies (mantidas).
-- contracts NÃO tem policy anon (a RPC já resolve o nome do contrato no público).
-- technician_locations: DELIBERADAMENTE DE FORA (ver nota acima).
