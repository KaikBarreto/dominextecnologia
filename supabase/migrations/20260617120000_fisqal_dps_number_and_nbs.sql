-- NFS-e (Fisqal): código NBS padrão + numeração sequencial atômica de DPS por empresa.
-- numeroDps e servico.codigoNbs são obrigatórios no payload da Fisqal.
-- Não mexer em serie_dps / ultimo_numero_dps (já existem em company_fiscal_settings).

-- ============================================================
-- 1) Coluna codigo_nbs_default (nullable) — código NBS padrão por empresa
-- ============================================================
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS codigo_nbs_default text;

-- ============================================================
-- 2) RPC atômica de numeração sequencial de DPS por empresa
--    Padrão do projeto: counter na própria config + SECURITY DEFINER.
--    UPDATE ... RETURNING numa transação => uma nota = um número, sem corrida.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fisqal_next_dps_number(p_company_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num bigint;
BEGIN
  UPDATE public.company_fiscal_settings
     SET ultimo_numero_dps = ultimo_numero_dps + 1
   WHERE company_id = p_company_id
   RETURNING ultimo_numero_dps INTO v_num;

  IF v_num IS NULL THEN
    RAISE EXCEPTION 'company_fiscal_settings ausente para %', p_company_id;
  END IF;

  RETURN v_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fisqal_next_dps_number(uuid) TO authenticated, service_role;
