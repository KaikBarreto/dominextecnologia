-- Portal do Contrato: generaliza o token público pra TODO contrato (PMOC ou não)
-- + toggle público/privado por contrato.
--
-- CONTEXTO: até aqui o public_pmoc_token só existia pra contrato is_pmoc=true.
-- O trigger ensure_pmoc_token gerava o token quando is_pmoc virava true e o NULAVA
-- quando is_pmoc virava false. Agora o portal vale pra QUALQUER contrato, então:
--   - todo contrato recebe public_pmoc_token (gerado se NULL, nunca nulado);
--   - portal_is_public liga/desliga o acesso público ao portal do contrato.
--
-- O nome da coluna/token segue public_pmoc_token de propósito: já é referenciado por
-- código existente (front, edge, RPC do portal). Agora ele é, na prática, "token do
-- portal do contrato". Não renomear pra não quebrar nada.
--
-- RLS: não tocada aqui (acesso ao portal é via edge/RPC, tratado por outro dev).
-- is_pmoc: não alterado pra nenhum contrato.

-- =====================================================================
-- PASSO 1 — coluna portal_is_public (idempotente).
-- Default TRUE (decisão do CEO): portal vem ligado, preserva QR de PMOC já
-- compartilhados. Coberta pelas policies tenant-scoped existentes de contracts
-- (USING + WITH CHECK por company_id) — nenhuma policy nova é necessária.
-- =====================================================================
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS portal_is_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.contracts.portal_is_public IS
  'Toggle do Portal do Contrato (/portal/contrato/:token). TRUE = qualquer um com o link vê (read-only); FALSE = portal desligado/privado. Default TRUE preserva PMOC já compartilhados.';

-- =====================================================================
-- PASSO 2 — generalizar a função do trigger.
-- ANTES: gera token só se is_pmoc=true; nula se is_pmoc=false.
-- DEPOIS: SEMPRE gera o token se estiver NULL (qualquer contrato); NUNCA nula.
-- Loop de retry contra a UNIQUE da coluna (colisão de gen_random_bytes(16) é
-- astronômica, mas o retry torna o trigger robusto sob backfill em massa).
-- next_pmoc_generation_date NÃO é tocado por esta função (nunca foi) — preservado.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ensure_pmoc_token()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_attempts int := 0;
BEGIN
  -- Token do portal do contrato: vale pra TODO contrato (PMOC ou não).
  -- Gera apenas se ainda não há token; uma vez emitido, é estável (nunca nulado).
  IF NEW.public_pmoc_token IS NULL THEN
    LOOP
      v_token := public.generate_pmoc_token();
      -- Garante unicidade vs. tokens já persistidos (a coluna é UNIQUE).
      IF NOT EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.public_pmoc_token = v_token
      ) THEN
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION '[contract-portal-token] não foi possível gerar token único após % tentativas', v_attempts;
      END IF;
    END LOOP;
    NEW.public_pmoc_token := v_token;
  END IF;
  RETURN NEW;
END;
$function$;

-- =====================================================================
-- PASSO 3 — ampliar o evento do trigger.
-- ANTES: BEFORE INSERT OR UPDATE OF is_pmoc (só disparava ao mexer em is_pmoc).
-- DEPOIS: BEFORE INSERT OR UPDATE — todo contrato novo (PMOC ou não) recebe token
-- na criação, sem depender de is_pmoc. Idempotente: DROP IF EXISTS antes do CREATE.
-- =====================================================================
DROP TRIGGER IF EXISTS trg_ensure_pmoc_token ON public.contracts;

CREATE TRIGGER trg_ensure_pmoc_token
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_pmoc_token();

-- =====================================================================
-- PASSO 4 — backfill: gerar token pros contratos existentes sem token
-- (os não-PMOC que tiveram o token nulado pela regra antiga). Idempotente:
-- só toca os NULL. Loop por linha pra garantir unicidade na coluna UNIQUE.
-- =====================================================================
DO $$
DECLARE
  r           record;
  v_token     text;
  v_attempts  int;
  v_done      int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.contracts WHERE public_pmoc_token IS NULL
  LOOP
    v_attempts := 0;
    LOOP
      v_token := public.generate_pmoc_token();
      IF NOT EXISTS (
        SELECT 1 FROM public.contracts c WHERE c.public_pmoc_token = v_token
      ) THEN
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION '[contract-portal-token backfill] token único não gerado p/ contrato % após % tentativas', r.id, v_attempts;
      END IF;
    END LOOP;
    UPDATE public.contracts SET public_pmoc_token = v_token WHERE id = r.id;
    v_done := v_done + 1;
  END LOOP;
  RAISE NOTICE '[contract-portal-token backfill] % contrato(s) receberam token', v_done;
END $$;
