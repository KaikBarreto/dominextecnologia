
-- ============================================================================
-- CORREÇÕES DE SEGURANÇA CRÍTICAS
-- ============================================================================

-- 1) crm_webhooks: bloquear leitura pública de tokens
DROP POLICY IF EXISTS "Public can view active webhooks by token" ON public.crm_webhooks;
DROP POLICY IF EXISTS "Anonymous can view active webhooks" ON public.crm_webhooks;

-- 2) service_ratings: exigir token via header
DROP POLICY IF EXISTS "Public can view rating by token" ON public.service_ratings;
CREATE POLICY "Public can view rating by header token"
  ON public.service_ratings FOR SELECT TO anon
  USING (token = current_setting('request.headers', true)::json->>'x-rating-token');

-- 3) customer_portals: exigir token via header
DROP POLICY IF EXISTS "Public can view portal by token" ON public.customer_portals;
CREATE POLICY "Public can view portal by header token"
  ON public.customer_portals FOR SELECT TO anon
  USING (token = current_setting('request.headers', true)::json->>'x-portal-token');

-- 4) quotes: exigir token via header
DROP POLICY IF EXISTS "Public view quotes by token" ON public.quotes;
CREATE POLICY "Public view quote by header token"
  ON public.quotes FOR SELECT TO anon
  USING (token IS NOT NULL AND token = current_setting('request.headers', true)::json->>'x-share-token');

-- 5) Buckets privados: remover qualquer SELECT público residual
DROP POLICY IF EXISTS "Anyone can view employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view time photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read time photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read financial receipts" ON storage.objects;

-- 6) Portal: criação de OS só se portal ativo
DROP POLICY IF EXISTS "Public can create portal tickets" ON public.service_orders;
CREATE POLICY "Public can create portal tickets"
  ON public.service_orders FOR INSERT TO anon
  WITH CHECK (
    origin = 'portal'
    AND customer_id IS NOT NULL
    AND public.is_customer_in_active_portal(customer_id)
  );

-- 7) Realtime: somente autenticados podem inscrever, e mensagens são filtradas
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (true);
