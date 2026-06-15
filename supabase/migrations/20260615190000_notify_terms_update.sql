-- =====================================================================
-- Notificação de "Termos de Uso" pra TODOS os usuários (broadcast)
-- =====================================================================
-- Propósito: quando a versão dos Termos de Uso muda (ou é publicada pela
-- primeira vez), disparar UMA notificação por usuário existente, de forma
-- IDEMPOTENTE por versão — re-rodar a migration NÃO duplica notificações.
--
-- Pattern espelhado do broadcast global do EcoSistema
-- (20260521212401_ecoflix_trigger_notif_novo_episodio.sql): um único
-- INSERT ... SELECT FROM auth.users gera 1 row em user_notifications por
-- usuário. Diferença: aqui o disparo é uma função explícita chamada por
-- migration/service_role (não um trigger de tabela), porque a fonte da
-- verdade da versão dos termos é uma constante no front (TERMS_VERSION),
-- não uma linha de banco.
--
-- A tabela user_notifications NÃO tem company_id (notificação é por
-- usuário, escopo global) — diferente do schema do EcoSistema.
--
-- >>> FUTURO <<<
-- Quando a versão dos Termos mudar (constante TERMS_VERSION no front),
-- crie uma NOVA migration chamando, p.ex.:
--   SELECT public.notify_terms_update(
--     '1.1',
--     'Termos de Uso atualizados',
--     'Atualizamos os Termos de Uso do Dominex. Toque para ler.'
--   );
-- Por ser idempotente por versão, isso dispara pra todos sem re-notificar
-- quem já recebeu versões anteriores. A copy de "atualizamos" só faz
-- sentido a partir da 2ª versão; a 1ª (inaugural) usa "disponível".
-- =====================================================================

BEGIN;

-- =====================================================================
-- (a) Tabela de idempotência
-- =====================================================================
-- Guarda quais versões de termos já foram broadcastadas. PK = version
-- impede broadcast duplicado da mesma versão. Ninguém lê isso pelo
-- client: RLS habilitada SEM policies — só service_role/migrations
-- (que ignoram RLS) escrevem/leem.
CREATE TABLE IF NOT EXISTS public.terms_update_broadcasts (
  version      text PRIMARY KEY,
  broadcast_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terms_update_broadcasts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.terms_update_broadcasts IS
  'Idempotência do broadcast de Termos de Uso: 1 linha por versão já notificada. RLS sem policies — só service_role/migrations acessam.';

-- =====================================================================
-- (b) Função public.notify_terms_update(...)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_terms_update(
  p_version text,
  p_title   text DEFAULT 'Termos de Uso atualizados',
  p_message text DEFAULT 'Atualizamos os Termos de Uso do Dominex. Toque para ler.'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Idempotente: se a versão já foi broadcastada, não faz nada.
  IF EXISTS (
    SELECT 1 FROM public.terms_update_broadcasts WHERE version = p_version
  ) THEN
    RETURN;
  END IF;

  -- 1 INSERT em set (não loop) — uma row por usuário em auth.users.
  INSERT INTO public.user_notifications (
    user_id, type, title, message, action_url, icon, expires_at
  )
  SELECT
    u.id,
    'terms_updated',
    p_title,
    p_message,
    '/configuracoes?tab=empresa&termos=1',
    'file-text',
    now() + interval '30 days'
  FROM auth.users u;

  -- Marca a versão como broadcastada (fecha a janela de idempotência).
  INSERT INTO public.terms_update_broadcasts (version) VALUES (p_version);
END;
$fn$;

COMMENT ON FUNCTION public.notify_terms_update(text, text, text) IS
  'Broadcast idempotente de mudança/publicação dos Termos de Uso: gera 1 notificação (type=terms_updated) por usuário em auth.users, uma única vez por p_version (controle em terms_update_broadcasts). Chamada só por migration/service_role.';

-- Só roda via migration/service_role. Expor a authenticated/anon deixaria
-- qualquer usuário spammar todo mundo.
REVOKE ALL     ON FUNCTION public.notify_terms_update(text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.notify_terms_update(text, text, text) FROM anon, authenticated;

-- =====================================================================
-- (c) Disparo INAUGURAL — versão '1.0', copy de "disponível"
-- =====================================================================
-- Cria 1 notificação por usuário existente. Idempotente por versão:
-- re-rodar esta migration não duplica.
SELECT public.notify_terms_update(
  '1.0',
  'Termos de Uso do Dominex',
  'Agora você pode consultar e baixar os Termos de Uso do Dominex a qualquer momento. Toque para ler.'
);

COMMIT;
