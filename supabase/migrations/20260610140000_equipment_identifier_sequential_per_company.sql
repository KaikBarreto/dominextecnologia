-- Numeração sequencial por empresa para equipment.identifier
-- ----------------------------------------------------------------------------
-- Por quê: o identifier era gerado no frontend com Math.random() memoizado e
-- ficava preso, fazendo equipamentos consecutivos receberem o MESMO número.
-- Não havia constraint UNIQUE, então duplicatas vazaram em prod (Domper e o
-- tenant 478ee686). identifier é só rótulo de exibição — nenhuma FK aponta pra
-- ele (OS/PMOC usam equipment.id UUID), então renumerar é seguro.
--
-- Solução: contador por empresa + função SECURITY DEFINER atômica (upsert com
-- ON CONFLICT, sem MAX+1 = sem corrida) + trigger BEFORE INSERT + backfill
-- renumerando tudo 0001..N por empresa + UNIQUE(company_id, identifier).
--
-- Formato decidido pelo CEO: número puro zero-padded a 4 dígitos (0001, 0002...).
-- Ordem dos passos importa: backfill ANTES da constraint UNIQUE.
-- ----------------------------------------------------------------------------

-- 1) Tabela contador (sem acesso do client; só via função SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.equipment_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value int NOT NULL DEFAULT 1
);

ALTER TABLE public.equipment_number_counters ENABLE ROW LEVEL SECURITY;

-- Regra de segurança (Tech Lead): NENHUM acesso direto do client.
-- Não criamos policy permissiva. Revogamos privilégios das roles do client
-- pra garantir que nem mesmo um GRANT herdado vaze acesso. A função
-- next_equipment_identifier roda como owner (SECURITY DEFINER) e contorna RLS.
REVOKE ALL ON public.equipment_number_counters FROM anon, authenticated;

-- 2) Função atômica que consome e devolve o próximo valor (zero-padded 4 dígitos)
CREATE OR REPLACE FUNCTION public.next_equipment_identifier(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumed int;
BEGIN
  -- Upsert atômico: primeira inserção da empresa consome 1 (RETURNING vê a
  -- linha final com next_value=2, logo 2-1=1). Em conflito, DO UPDATE soma 1 e
  -- o RETURNING enxerga a linha pós-update, então (next_value)-1 = valor antigo
  -- = valor consumido. Sem corrida porque o ON CONFLICT trava a linha.
  INSERT INTO public.equipment_number_counters AS c (company_id, next_value)
  VALUES (p_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_value = c.next_value + 1
  RETURNING (c.next_value - 1)
  INTO v_consumed;

  RETURN lpad(v_consumed::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_equipment_identifier(uuid) TO authenticated, service_role;

-- 3) Trigger BEFORE INSERT: preenche identifier quando vier vazio
CREATE OR REPLACE FUNCTION public.set_equipment_identifier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.identifier IS NULL OR btrim(NEW.identifier) = '')
     AND NEW.company_id IS NOT NULL THEN
    NEW.identifier := public.next_equipment_identifier(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_equipment_identifier ON public.equipment;
CREATE TRIGGER trg_set_equipment_identifier
  BEFORE INSERT ON public.equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.set_equipment_identifier();

-- 4) Backfill: renumera TODO equipamento por empresa (ordem created_at, id)
DO $$
DECLARE
  v_renumbered bigint;
  v_companies  bigint;
BEGIN
  WITH ordered AS (
    SELECT id,
           row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
    FROM public.equipment
  )
  UPDATE public.equipment e
  SET identifier = lpad(o.rn::text, 4, '0')
  FROM ordered o
  WHERE e.id = o.id;
  GET DIAGNOSTICS v_renumbered = ROW_COUNT;

  -- Inicializa o contador por empresa para o próximo valor livre.
  -- Seguro converter identifier::int porque acabamos de reescrever todos como
  -- numéricos zero-padded acima.
  INSERT INTO public.equipment_number_counters (company_id, next_value)
  SELECT company_id, max(identifier::int) + 1
  FROM public.equipment
  GROUP BY company_id
  ON CONFLICT (company_id) DO UPDATE SET next_value = EXCLUDED.next_value;
  GET DIAGNOSTICS v_companies = ROW_COUNT;

  RAISE NOTICE 'Backfill equipment.identifier: % equipamentos renumerados, % contadores inicializados', v_renumbered, v_companies;
END $$;

-- 5) Constraint UNIQUE (depois do backfill)
ALTER TABLE public.equipment
  DROP CONSTRAINT IF EXISTS equipment_company_identifier_unique;
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_company_identifier_unique UNIQUE (company_id, identifier);
