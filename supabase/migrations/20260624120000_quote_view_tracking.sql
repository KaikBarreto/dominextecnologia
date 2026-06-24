-- Rastreamento de visualizações de proposta (quotes).
-- Por quê: o software de proposta precisa mostrar contador de aberturas e "quando
-- alguém abriu" na lista/detalhe da proposta. A página pública /proposta/:token é
-- anon e resolve por quotes.token, então a gravação precisa passar por uma RPC
-- SECURITY DEFINER (anon não pode escrever em tabela tenant direto).
--
-- Espelha as convenções de quotes/quote_items:
--   owner SELECT = company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
--   pgcrypto/gen_random_bytes vivem em schema extensions.

-- 1) Colunas de leitura barata em quotes (sem agregação na lista).
--    Já cobertas pela RLS de SELECT existente de quotes (policy ALL
--    "Users manage own company quotes"), então o owner já consegue ler.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz NULL;

-- 2) Log detalhado pro "quando" / dedupe por fingerprint.
CREATE TABLE IF NOT EXISTS public.quote_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, -- copiado do quote no insert (RLS por tenant)
  viewed_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NULL,    -- hash leve do navegador, pra dedupe
  user_agent text NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_views_quote_id_viewed_at
  ON public.quote_views (quote_id, viewed_at DESC);

-- Suporta a janela de dedupe de 30min por (quote, fingerprint, tempo) sem fullscan.
CREATE INDEX IF NOT EXISTS idx_quote_views_dedupe
  ON public.quote_views (quote_id, fingerprint, viewed_at DESC);

-- 3) RLS: só leitura pra membros da empresa dona do quote.
--    Mesmo predicado da policy de SELECT de quotes/quote_items.
--    SEM INSERT/UPDATE/DELETE client-side: gravação só pela RPC abaixo.
ALTER TABLE public.quote_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_quote_views" ON public.quote_views;
CREATE POLICY "service_role_full_access_quote_views"
  ON public.quote_views FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Members can view quote_views of own company" ON public.quote_views;
CREATE POLICY "Members can view quote_views of own company"
  ON public.quote_views FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- 4) RPC de gravação (única forma de escrever). SECURITY DEFINER.
--    Resolve quote por token; dedupe de 30min por fingerprint; conta a view.
--    NÃO retorna dados da proposta — só o novo view_count (ou NULL se token inválido).
CREATE OR REPLACE FUNCTION public.record_quote_view(
  _token text,
  _fingerprint text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_quote_id uuid;
  v_company_id uuid;
  v_recent boolean := false;
  v_new_count integer;
BEGIN
  -- Resolve o quote pelo token. Token inválido/ausente => silencioso.
  IF _token IS NULL OR _token = '' THEN
    RETURN NULL;
  END IF;

  SELECT q.id, q.company_id
    INTO v_quote_id, v_company_id
    FROM public.quotes q
   WHERE q.token = _token
   LIMIT 1;

  IF v_quote_id IS NULL THEN
    RETURN NULL; -- não vaza nada
  END IF;

  -- Dedupe: mesma fingerprint pro mesmo quote nos últimos 30 min não conta de novo.
  -- Fingerprint NULL nunca dedupe (sempre conta) — sem fingerprint não dá pra
  -- distinguir refresh de visita nova.
  IF _fingerprint IS NOT NULL AND _fingerprint <> '' THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.quote_views v
       WHERE v.quote_id = v_quote_id
         AND v.fingerprint = _fingerprint
         AND v.viewed_at >= now() - interval '30 minutes'
    ) INTO v_recent;
  END IF;

  IF v_recent THEN
    -- View recente já contada: devolve o contador atual sem incrementar.
    SELECT view_count INTO v_new_count FROM public.quotes WHERE id = v_quote_id;
    RETURN v_new_count;
  END IF;

  INSERT INTO public.quote_views (quote_id, company_id, fingerprint, user_agent)
  VALUES (v_quote_id, v_company_id, NULLIF(_fingerprint, ''), _user_agent);

  -- O log (quote_views) é a fonte da verdade do "quando". O contador em quotes é
  -- só um cache de leitura barata. Atualizamos o cache, mas se a linha do quote
  -- tiver uma FK órfã pré-existente (ex.: proposal_template_id apontando pra
  -- template já apagado), o UPDATE pode falhar por um problema NÃO relacionado a
  -- esta feature. Nesse caso, a view JÁ foi registrada no log acima; apenas
  -- caímos no fallback e retornamos a contagem real derivada do log, sem deixar
  -- o registro da visualização se perder.
  BEGIN
    UPDATE public.quotes
       SET view_count = view_count + 1,
           last_viewed_at = now()
     WHERE id = v_quote_id
    RETURNING view_count INTO v_new_count;
  EXCEPTION WHEN foreign_key_violation THEN
    SELECT count(*) INTO v_new_count FROM public.quote_views WHERE quote_id = v_quote_id;
  END;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_quote_view(text, text, text)
  TO anon, authenticated, service_role;
