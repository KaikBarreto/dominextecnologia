-- Numeração sequencial por empresa para compras.numero
-- ----------------------------------------------------------------------------
-- Por quê: o módulo de Compras de Material precisa de um código sequencial e
-- único POR EMPRESA, começando em 1 (não SERIAL global, que vazaria a contagem
-- entre tenants e revelaria volume de outros clientes). Espelha EXATAMENTE o
-- padrão já estabelecido em 20260610140000_equipment_identifier_sequential_per_company.sql
-- (contador por empresa + função SECURITY DEFINER atômica via upsert ON CONFLICT,
-- sem MAX+1 = sem corrida + trigger BEFORE INSERT + backfill + UNIQUE).
--
-- Diferença: aqui numero é INTEGER puro (não zero-padded text), porque é um
-- código numérico de exibição. company_id em compras já é NOT NULL e preenchido
-- no INSERT, então o trigger usa NEW.company_id direto.
--
-- Ordem dos passos importa: backfill ANTES de tornar NOT NULL e da UNIQUE.
-- ----------------------------------------------------------------------------

-- 1) Coluna numero (nullable por enquanto; vira NOT NULL após backfill)
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS numero integer;

-- 2) Tabela contador (sem acesso do client; só via função SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.compras_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value int NOT NULL DEFAULT 1
);

ALTER TABLE public.compras_number_counters ENABLE ROW LEVEL SECURITY;

-- Regra de segurança (Tech Lead): NENHUM acesso direto do client. Não criamos
-- policy permissiva; revogamos privilégios das roles do client. A função
-- next_compra_numero roda como owner (SECURITY DEFINER) e contorna RLS.
REVOKE ALL ON public.compras_number_counters FROM anon, authenticated;

-- 3) Função atômica que consome e devolve o próximo valor (integer)
CREATE OR REPLACE FUNCTION public.next_compra_numero(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_consumed int;
BEGIN
  -- Upsert atômico: primeira inserção da empresa consome 1 (RETURNING vê a linha
  -- final com next_value=2, logo 2-1=1). Em conflito, DO UPDATE soma 1 e o
  -- RETURNING enxerga a linha pós-update, então (next_value)-1 = valor antigo =
  -- valor consumido. Sem corrida porque o ON CONFLICT trava a linha.
  INSERT INTO public.compras_number_counters AS c (company_id, next_value)
  VALUES (p_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_value = c.next_value + 1
  RETURNING (c.next_value - 1)
  INTO v_consumed;

  RETURN v_consumed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_compra_numero(uuid) TO authenticated, service_role;

-- 4) Trigger BEFORE INSERT: preenche numero quando vier NULL
CREATE OR REPLACE FUNCTION public.set_compra_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.numero IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.numero := public.next_compra_numero(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_compra_numero ON public.compras;
CREATE TRIGGER trg_set_compra_numero
  BEFORE INSERT ON public.compras
  FOR EACH ROW
  EXECUTE FUNCTION public.set_compra_numero();

-- 5) Backfill: numera TODA compra por empresa (ordem created_at, id), de 1..N
DO $$
DECLARE
  v_renumbered bigint;
  v_companies  bigint;
BEGIN
  WITH ordered AS (
    SELECT id,
           row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
    FROM public.compras
  )
  UPDATE public.compras c
  SET numero = o.rn
  FROM ordered o
  WHERE c.id = o.id;
  GET DIAGNOSTICS v_renumbered = ROW_COUNT;

  -- Inicializa o contador por empresa para o próximo valor livre (max + 1).
  INSERT INTO public.compras_number_counters (company_id, next_value)
  SELECT company_id, max(numero) + 1
  FROM public.compras
  GROUP BY company_id
  ON CONFLICT (company_id) DO UPDATE SET next_value = EXCLUDED.next_value;
  GET DIAGNOSTICS v_companies = ROW_COUNT;

  RAISE NOTICE 'Backfill compras.numero: % compras numeradas, % contadores inicializados', v_renumbered, v_companies;
END $$;

-- 6) Tornar NOT NULL e criar UNIQUE (depois do backfill)
ALTER TABLE public.compras ALTER COLUMN numero SET NOT NULL;

ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_company_numero_unique;
ALTER TABLE public.compras
  ADD CONSTRAINT compras_company_numero_unique UNIQUE (company_id, numero);
