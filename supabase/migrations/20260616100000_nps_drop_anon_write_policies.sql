-- =============================================================================
-- NPS — Fechamento de segurança: remover escrita/leitura anônima direta em
-- service_ratings. Toda gravação pública agora passa EXCLUSIVAMENTE pela RPC
-- SECURITY DEFINER `submit_public_os_rating`, e a leitura pública por
-- `get_rating_with_os_by_token` / `get_public_os` (ambas SECURITY DEFINER com
-- EXECUTE para anon). O frontend foi migrado e não usa mais .update().eq('token')
-- nem o header x-rating-token.
--
-- Por quê: a policy `Anon update unrated rating` (UPDATE TO anon, rated_at IS NULL)
-- permitia que um anônimo com a anon key fizesse UPDATE em massa de TODAS as
-- avaliações não respondidas, inclusive cross-tenant — o RLS não consegue escopar
-- por token porque o header x-rating-token nunca é setado. As demais policies anon
-- por header também são mortas (frontend não seta o header) e redundantes.
--
-- Estado-alvo: anon NÃO tem nenhuma policy de tabela em service_ratings.
-- =============================================================================

-- 1) Dropar todas as policies anon (escrita e leitura por header) — idempotente.
DROP POLICY IF EXISTS "Anon update unrated rating" ON public.service_ratings;
DROP POLICY IF EXISTS "Public can update rating by valid token" ON public.service_ratings;
DROP POLICY IF EXISTS "Public can view rating by header token" ON public.service_ratings;
DROP POLICY IF EXISTS "Public can view rating by valid token" ON public.service_ratings;

-- 2) Revogar GRANTs de escrita de anon — torna a intenção explícita: anon só
--    grava via RPC SECURITY DEFINER. Mantemos SELECT/REFERENCES? Não: sem policy
--    de tabela o SELECT já fica bloqueado pelo RLS, mas revogamos a escrita por
--    higiene de privilégios.
REVOKE INSERT, UPDATE, DELETE ON public.service_ratings FROM anon;

-- =============================================================================
-- Estado final esperado de service_ratings:
--   anon          -> NENHUMA policy de tabela (escrita via RPC; leitura via RPC)
--   authenticated -> "Users manage own service_ratings" (ALL, escopado por
--                     company da OS OR super_admin) — mantida intacta.
--   service_role  -> bypassa RLS.
-- =============================================================================
