-- =====================================================================
-- company_origins.utm_key — chave estável para atribuição por UTM
-- + REVOKE dos grants residuais de anon na tabela
-- =====================================================================
-- PROBLEMA QUE ESTA MIGRATION FECHA
--
-- A migration 20261004120200 criou trg_propagate_company_origin_rename
-- pra que renomear uma origem no painel arraste o histórico junto
-- (companies.origin e admin_leads.source guardam o NOME, não o id).
--
-- Só que o client resolve a UTM do visitante pra um NOME hardcoded
-- (COMPANY_ORIGIN_NAMES em src/lib/whatsapp.ts). Ou seja: no dia em que o
-- CEO renomear "Site/Google", a trigger corrige o passado e o client
-- continua gravando o nome antigo — órfãs novas no dia seguinte. A
-- trigger e a constante se anulam.
--
-- Conserto: o client passa a trabalhar com uma CHAVE estável (utm_key) e
-- o banco resolve chave -> nome. Renomear a origem deixa de ser um evento
-- que o client precisa saber.
--
-- Ligação com o client (quem consome):
--   utm_key = 'search'    -> google/bing/duckduckgo/yahoo/ecosia/site
--   utm_key = 'social'    -> instagram/ig/facebook/fb/threads
--   utm_key = 'ai'        -> chatgpt/openai/perplexity/gemini/copilot/claude
--   utm_key = 'video'     -> youtube/yt
--   utm_key = 'messaging' -> whatsapp/wa
--   utm_key = 'paid'      -> utm_medium=cpc/ppc/paid/... ou gerenciador de ads
--   utm_key = 'other'     -> utm_source presente mas não reconhecido
-- Indicação, Feira/Evento, BNI, Parceiro e Prospecção Ativa ficam com
-- utm_key NULL: não chegam por UTM (as duas primeiras são escolha da
-- pessoa no cadastro, as três últimas são catálogo comercial interno).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Coluna
-- ---------------------------------------------------------------------
ALTER TABLE public.company_origins
  ADD COLUMN IF NOT EXISTS utm_key text;

COMMENT ON COLUMN public.company_origins.utm_key IS
  'Chave canônica e ESTÁVEL usada pelo client pra atribuir origem por UTM. NUNCA muda quando a origem é renomeada no painel — é justamente o contrário do name, que o CEO pode editar. O client manda a chave, o banco devolve o nome. NULL = origem que não chega por UTM (escolha manual no cadastro ou catálogo comercial interno).';

-- ---------------------------------------------------------------------
-- 2. Popula as 7 origens que chegam por UTM (casando por name)
-- ---------------------------------------------------------------------
-- As outras 5 ficam NULL, que é o default da coluna nova — nada a fazer.
-- Nomes ausentes viram NOTICE, não EXCEPTION: com a trigger de rename no
-- ar, um name pode ter mudado legitimamente antes de um replay.
DO $$
DECLARE
  v_row RECORD;
  v_updated INTEGER := 0;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_with_key INTEGER;
  v_null_key INTEGER;
BEGIN
  FOR v_row IN
    SELECT *
    FROM (VALUES
      ('Site/Google',        'search'),
      ('Facebook/Instagram', 'social'),
      ('ChatGPT/IAs',        'ai'),
      ('YouTube',            'video'),
      ('WhatsApp',           'messaging'),
      ('Tráfego Pago',       'paid'),
      ('Outros',             'other')
    ) AS t(name, utm_key)
  LOOP
    UPDATE public.company_origins AS co
    SET utm_key = v_row.utm_key
    WHERE co.name = v_row.name
      AND co.utm_key IS DISTINCT FROM v_row.utm_key;

    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSIF EXISTS (SELECT 1 FROM public.company_origins AS co WHERE co.name = v_row.name) THEN
      RAISE NOTICE 'company_origins: "%" já estava com utm_key = %', v_row.name, v_row.utm_key;
    ELSE
      v_missing := v_missing || v_row.name;
    END IF;
  END LOOP;

  SELECT COUNT(*) FILTER (WHERE utm_key IS NOT NULL),
         COUNT(*) FILTER (WHERE utm_key IS NULL)
    INTO v_with_key, v_null_key
  FROM public.company_origins;

  RAISE NOTICE 'company_origins.utm_key: % linhas atualizadas | % com chave | % sem chave',
    v_updated, v_with_key, v_null_key;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE NOTICE 'company_origins: nomes do de-para ausentes na tabela: %', v_missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Unicidade da chave
-- ---------------------------------------------------------------------
-- Duas origens com a mesma utm_key tornariam a resolução chave -> nome
-- ambígua e o client escolheria uma das duas na sorte. O banco impede.
-- Parcial porque NULL é o caso normal (5 das 12 linhas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_origins_utm_key
  ON public.company_origins (utm_key)
  WHERE utm_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. RPC pública: devolve show_in_signup e utm_key
-- ---------------------------------------------------------------------
-- Por que a RPC precisa devolver linhas com show_in_signup = false:
-- "Tráfego Pago" é atribuído pela UTM e nunca escolhido pela pessoa, mas o
-- cadastro precisa resolver 'paid' -> 'Tráfego Pago' pra gravar. Então o
-- filtro passa a ser (show_in_signup OR utm_key IS NOT NULL):
--   • show_in_signup = true  -> vira card na tela
--   • utm_key IS NOT NULL    -> serve pra atribuição automática
--
-- Isso expõe publicamente o rótulo "Tráfego Pago" — aceitável, é nome de
-- canal de marketing. O catálogo comercial interno (BNI, Parceiro,
-- Prospecção Ativa) tem show_in_signup = false E utm_key NULL, logo
-- continua fora da RPC.
--
-- DROP antes do CREATE porque mudar o tipo de retorno de uma função não é
-- possível com CREATE OR REPLACE. O DROP leva os GRANTs junto, por isso
-- eles são reaplicados abaixo.
DROP FUNCTION IF EXISTS public.get_signup_origins();

CREATE FUNCTION public.get_signup_origins()
RETURNS TABLE(
  name text,
  icon text,
  color text,
  description text,
  show_in_signup boolean,
  utm_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT co.name, co.icon, co.color, co.description, co.show_in_signup, co.utm_key
  FROM public.company_origins AS co
  WHERE co.show_in_signup = true
     OR co.utm_key IS NOT NULL
  ORDER BY co.sort_order, co.name;
$fn$;

COMMENT ON FUNCTION public.get_signup_origins() IS
  'Origens de captação para o cadastro público: as que viram card (show_in_signup) mais as atribuíveis por UTM (utm_key). Não expõe o catálogo comercial interno (BNI, Parceiro, Prospecção Ativa).';

REVOKE ALL ON FUNCTION public.get_signup_origins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_signup_origins() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. REVOKE dos grants residuais de anon na TABELA
-- ---------------------------------------------------------------------
-- anon tinha SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER em
-- company_origins — resíduo do default ACL do Supabase, nunca concedido de
-- propósito. Hoje não é um buraco só porque não existe policy pra anon
-- (RLS barra), ou seja: está a uma policy mal escrita de virar um.
--
-- A leitura pública passa SÓ pela RPC SECURITY DEFINER acima, que roda
-- como owner e não depende de grant de tabela do chamador. Verificado
-- antes de aplicar: nenhum caminho anônimo lê a tabela direto — todos os
-- .from('company_origins') do código estão no painel admin (authenticated
-- + super_admin) e o cadastro público não toca a tabela.
--
-- Defesa em profundidade, custo zero.
REVOKE ALL ON TABLE public.company_origins FROM anon;
