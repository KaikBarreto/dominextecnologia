-- =============================================================================
-- Financeiro: registrar QUEM deu baixa (e quando) em cada lançamento.
--
-- Por quê: na BR Frio uma conta a receber apareceu como recebida e não havia
-- como saber quem marcou. A partir daqui, toda transição de is_paid para TRUE
-- carimba o usuário da requisição (auth.uid()) e a hora; desfazer a baixa
-- limpa o carimbo.
--
-- Decisões:
-- - SEM FK para auth.users. created_by usa ON DELETE SET NULL, e esse SET NULL
--   é um UPDATE na linha: passaria pelos guards do PDV/tesouraria (que recusam
--   mexer em lançamento travado) e pelo próprio gatilho abaixo (que restaura o
--   valor antigo e estouraria a FK). O registro tem que sobreviver à exclusão
--   do usuário; um uuid "solto" é o comportamento desejado.
-- - SEM backfill: nas baixas antigas ninguém sabe quem foi. Ficam NULL.
-- - O carimbo é do SERVIDOR. Usuário (authenticated/anon) não consegue forjar
--   nem apagar: fora de uma transição de is_paid, o valor antigo é restaurado.
--   Só contexto de sistema (sem auth.uid() e sem papel anon/authenticated:
--   postgres, service_role, cron) pode gravar explicitamente (importação,
--   migração, correção).
-- - O gatilho se chama zz_... para rodar POR ÚLTIMO entre os BEFORE (o Postgres
--   dispara em ordem alfabética; o último hoje é
--   update_financial_transactions_updated_at). Assim os guards que comparam
--   to_jsonb(NEW) com to_jsonb(OLD) (tesouraria do PDV: "edição só de texto
--   passa direto"; recálculo de recebível do PDV) enxergam a linha ANTES do
--   carimbo e não passam a recusar baixas legítimas.
-- - Cancelamento (cancelled_at) não é baixa: não mexe nas colunas.
-- =============================================================================

SET lock_timeout = '5s';

-- Nullable e sem default: só metadado no catálogo, sem reescrever a tabela.
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS paid_marked_by uuid NULL,
  ADD COLUMN IF NOT EXISTS paid_marked_at timestamptz NULL;

COMMENT ON COLUMN public.financial_transactions.paid_marked_by IS
  'Usuário (auth.uid()) que marcou o lançamento como pago/recebido. NULL quando a baixa veio do sistema (cron, webhook, importação) ou é anterior a 2026-11-20. Gravado só pelo gatilho zz_financial_transactions_paid_marker.';
COMMENT ON COLUMN public.financial_transactions.paid_marked_at IS
  'Momento em que o lançamento foi marcado como pago/recebido. Limpo ao desfazer a baixa. Gravado só pelo gatilho zz_financial_transactions_paid_marker.';

CREATE OR REPLACE FUNCTION public.financial_transactions_paid_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_role      text := auth.role();
  v_system    boolean;
  v_now_paid  boolean := NEW.is_paid IS TRUE;
  v_was_paid  boolean;
BEGIN
  -- Contexto de sistema: ninguém logado e papel que não é de usuário final.
  -- anon NUNCA é sistema (não pode escolher o carimbo).
  v_system := v_uid IS NULL
              AND COALESCE(v_role, '') NOT IN ('anon', 'authenticated');

  IF TG_OP = 'INSERT' THEN
    IF NOT v_now_paid THEN
      NEW.paid_marked_by := NULL;
      NEW.paid_marked_at := NULL;
    ELSIF v_system THEN
      -- Importação pode trazer quem/quando; se não trouxer, by NULL e at agora.
      NEW.paid_marked_at := COALESCE(NEW.paid_marked_at, now());
    ELSE
      NEW.paid_marked_by := v_uid;
      NEW.paid_marked_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_was_paid := OLD.is_paid IS TRUE;

  IF NOT v_now_paid THEN
    -- Baixa desfeita (ou continua em aberto): sem carimbo.
    NEW.paid_marked_by := NULL;
    NEW.paid_marked_at := NULL;
  ELSIF NOT v_was_paid THEN
    -- Transição para pago: carimba quem está na requisição.
    IF v_system THEN
      NEW.paid_marked_by := CASE WHEN NEW.paid_marked_by IS DISTINCT FROM OLD.paid_marked_by
                                 THEN NEW.paid_marked_by END;
      NEW.paid_marked_at := CASE WHEN NEW.paid_marked_at IS DISTINCT FROM OLD.paid_marked_at
                                  AND NEW.paid_marked_at IS NOT NULL
                                 THEN NEW.paid_marked_at ELSE now() END;
    ELSE
      NEW.paid_marked_by := v_uid;
      NEW.paid_marked_at := now();
    END IF;
  ELSIF NOT v_system THEN
    -- Continua pago e quem pede é usuário: o carimbo é imutável.
    NEW.paid_marked_by := OLD.paid_marked_by;
    NEW.paid_marked_at := OLD.paid_marked_at;
  END IF;
  -- Continua pago em contexto de sistema: aceita o que veio (correção explícita).

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.financial_transactions_paid_marker() IS
  'Carimba paid_marked_by/paid_marked_at nas transições de is_paid. Usuário não forja nem apaga; só contexto de sistema grava explicitamente.';

-- Função de gatilho não é chamável direto; o REVOKE é higiene (o Supabase dá
-- EXECUTE a anon/authenticated por padrão em funções novas do schema public).
REVOKE ALL ON FUNCTION public.financial_transactions_paid_marker() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_financial_transactions_paid_marker ON public.financial_transactions;
CREATE TRIGGER zz_financial_transactions_paid_marker
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.financial_transactions_paid_marker();

RESET lock_timeout;
