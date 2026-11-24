-- Contador de numeração de equipamento recua ao excluir
-- ----------------------------------------------------------------------------
-- Por quê: equipment_number_counters só andava pra frente. Cliente que cria
-- equipamentos de teste, exclui e recomeça ficava com a numeração começando em
-- 0002/0003 (caso Baruca).
--
-- Regra: depois de um DELETE em equipment, para cada empresa afetada o
-- next_value recua para (maior identifier numérico ainda existente) + 1, ou 1 se
-- não sobrou nenhum — SOMENTE se isso for MENOR que o next_value atual (nunca
-- aumenta). Buraco no meio não é reaproveitado: nunca gera número abaixo de um
-- existente, então o UNIQUE(company_id, identifier) continua protegido.
--
-- Trigger por STATEMENT (REFERENCING OLD TABLE): um cálculo por empresa, não por
-- linha — exclusão em cascata (cliente/empresa/zerar sistema) apaga muitos de
-- uma vez.
--
-- Concorrência: o INSERT concorrente consome o contador (lock na mesma linha) no
-- BEFORE INSERT. Por isso PRIMEIRO travamos a linha do contador (FOR UPDATE) e
-- SÓ DEPOIS, em outro statement (snapshot novo no READ COMMITTED), lemos o max.
-- Assim enxergamos qualquer insert concorrente já commitado e nunca recuamos
-- abaixo de um número em uso. Travar sempre em ORDER BY company_id evita deadlock
-- entre deletes multi-empresa.
--
-- Identificadores legados/não numéricos são ignorados (regex ^[0-9]{1,9}$) para
-- não estourar o cast. Empresa sem linha de contador (ou já apagada no cascade
-- de exclusão de tenant) é ignorada sem erro.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.equipment_counter_recede_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company uuid;
  v_locked  int;
  v_max     int;
BEGIN
  FOR v_company IN
    SELECT DISTINCT company_id
    FROM deleted_rows
    WHERE company_id IS NOT NULL
    ORDER BY company_id
  LOOP
    -- Statement 1: trava o contador (sem linha = nada a fazer).
    SELECT c.next_value INTO v_locked
    FROM public.equipment_number_counters c
    WHERE c.company_id = v_company
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Statement 2: max lido depois do lock (snapshot novo enxerga inserts commitados).
    SELECT COALESCE(max(e.identifier::int), 0) INTO v_max
    FROM public.equipment e
    WHERE e.company_id = v_company
      AND e.identifier ~ '^[0-9]{1,9}$';

    IF v_max + 1 < v_locked THEN
      UPDATE public.equipment_number_counters
      SET next_value = v_max + 1
      WHERE company_id = v_company;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Função de trigger: ninguém chama via API.
REVOKE ALL ON FUNCTION public.equipment_counter_recede_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_counter_recede_on_delete ON public.equipment;
CREATE TRIGGER trg_equipment_counter_recede_on_delete
  AFTER DELETE ON public.equipment
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.equipment_counter_recede_on_delete();
