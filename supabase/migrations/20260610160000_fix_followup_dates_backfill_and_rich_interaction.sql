-- =============================================================================
-- F2 — Backfill: corrigir due_date de follow-ups com data trocada
-- F4 — Interação rica ao concluir follow-up (espelha EcoSistema)
-- =============================================================================
--
-- CAUSA REAL DO BUG F2 (verificada com dados de produção, NÃO com a teoria do recon):
--   A trigger create_followups_on_admin_lead_insert() está CORRETA. O pareamento
--   step<->offset é por LINHA do template (t.step / t.offset_days da mesma linha de
--   admin_crm_followup_template), então a data nasce certa no INSERT. Confirmado:
--     - template no prod: step 1 = offset 1 (mais perto) ... step 10 = offset 31 (mais longe). OK.
--     - prosrc da função no prod == este repositório, byte a byte. OK.
--     - de TODOS os follow-ups do banco, só 2 divergiam do esperado: lead "Kennedy",
--       steps 1 e 10, com as due_date TROCADAS entre si (step 1 ficou em +31d / step 10 em +1d).
--       created_at dos dois = 2026-06-09 18:59 (trigger). updated_at dos dez = 2026-06-10 12:54:
--       um UPDATE em lote DEPOIS da criação trocou as datas dos extremos. Ou seja: a data foi
--       corrompida por EDIÇÃO pós-insert (UI), não pela trigger. A teoria "falta ORDER BY na
--       trigger" do recon é falsa — ORDER BY não pareia data, e o INSERT já nasce certo.
--
--   Portanto: NÃO há mudança de raiz a fazer na trigger de criação (seria no-op). O que resolve
--   é o BACKFILL abaixo, que recomputa due_date a partir do FATO imutável
--   (lead.created_at + offset do passo correto), tornando os dados auto-consistentes e
--   imunes a qualquer troca futura caso seja re-rodado.
--
-- Idempotente: o backfill é um recompute determinístico (rodar 2x = mesmo resultado).
--   F4 usa CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS antes do CREATE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F2 — Backfill determinístico das datas de follow-up
-- -----------------------------------------------------------------------------
-- Recomputa due_date = lead.created_at(date) + offset_days do passo, para TODA
-- tarefa de cadência (followup_step NOT NULL) ainda NÃO resolvida. Resolvidas
-- ficam intactas: a data de um follow-up concluído é fato histórico e não deve
-- ser reescrita. ROW_COUNT lido no MESMO bloco PL/pgSQL do UPDATE (gotcha Postgres).
DO $$
DECLARE
  v_fixed integer;
BEGIN
  UPDATE public.admin_tasks t
     SET due_date = (l.created_at::date + (tpl.offset_days || ' days')::interval)::date
    FROM public.admin_leads l,
         public.admin_crm_followup_template tpl
   WHERE t.crm_lead_id = l.id
     AND tpl.step = t.followup_step
     AND t.type = 'follow-up'::public.admin_task_type
     AND t.followup_step IS NOT NULL
     AND t.status <> 'resolvido'::public.admin_task_status
     -- só toca o que está REALMENTE divergente, pra não inflar updated_at à toa
     AND t.due_date IS DISTINCT FROM (l.created_at::date + (tpl.offset_days || ' days')::interval)::date;

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'F2 backfill: % follow-up(s) com due_date recomputada a partir de created_at + offset do passo.', v_fixed;
END $$;

-- -----------------------------------------------------------------------------
-- F4 — Interação rica ao concluir follow-up
-- -----------------------------------------------------------------------------
-- Antes: 'Follow up X/10 realizado [— observação]'.
-- Agora (espelha EcoSistema auto_comment_on_followup_complete, adaptado ao schema
-- Dominex): vira um COMENTÁRIO no histórico do lead com
--   - passo X/10
--   - data/hora da conclusão em America/Sao_Paulo (UTC-3)
--   - QUEM resolveu (full_name -> email do profiles)
--   - observação, se houver
--
-- DIVERGÊNCIA Dominex vs EcoSistema (CRÍTICA): no EcoSistema o autor é buscado por
--   profiles.id = completed_by. No Dominex o vínculo é profiles.user_id = auth uid
--   (completed_by referencia auth.users(id) = profiles.user_id). Usar 'id' aqui
--   retornaria NULL em silêncio e mostraria sempre 'Sistema'. Por isso: user_id.
--
-- Mantém a MESMA tabela (admin_lead_interactions) e interaction_type='follow-up'.
CREATE OR REPLACE FUNCTION public.auto_interaction_on_followup_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_uid   uuid;
  v_author_name text;
  v_when        timestamptz;
  v_when_local  timestamp;
  v_desc        text;
BEGIN
  -- Só age na transição -> resolvido, em follow-up vinculado a um lead.
  IF NEW.type <> 'follow-up' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'resolvido' OR OLD.status = 'resolvido' THEN
    RETURN NEW;
  END IF;

  IF NEW.crm_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_uid := COALESCE(NEW.completed_by, auth.uid());
  v_when      := COALESCE(NEW.resolved_at, now());
  v_when_local := (v_when AT TIME ZONE 'America/Sao_Paulo');

  -- Nome de quem resolveu — join por user_id (NÃO id) no schema Dominex.
  SELECT COALESCE(NULLIF(p.full_name, ''), p.email, 'Sistema')
    INTO v_author_name
    FROM public.profiles p
   WHERE p.user_id = v_actor_uid;

  v_desc := 'Follow up ' || COALESCE(NEW.followup_step::text, '?') || '/10 realizado'
          || CASE
               WHEN NEW.observation IS NOT NULL AND length(trim(NEW.observation)) > 0
               THEN E'\nObservação: ' || trim(NEW.observation)
               ELSE ''
             END
          || E'\n' || to_char(v_when_local, 'DD/MM/YYYY HH24:MI')
          || ' — ' || COALESCE(v_author_name, 'Sistema');

  INSERT INTO public.admin_lead_interactions (
    lead_id, interaction_type, description, created_by
  )
  VALUES (
    NEW.crm_lead_id,
    'follow-up',
    v_desc,
    v_actor_uid
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_interaction_on_followup_complete ON public.admin_tasks;
CREATE TRIGGER trg_auto_interaction_on_followup_complete
  AFTER UPDATE OF status ON public.admin_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_interaction_on_followup_complete();
