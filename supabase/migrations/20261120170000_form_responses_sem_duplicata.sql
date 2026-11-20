-- =============================================================================
-- form_responses: uma resposta por (OS, pergunta, equipamento)
-- =============================================================================
-- Por quê: a tabela não tinha nenhuma unicidade. Os dois gravadores do app
-- (checklist do técnico e checklist de atividade do PMOC) faziam "procura a
-- linha; se não achou, insere". Quando a procura falhava (rede) ou já existiam
-- 2 linhas (.single() devolve erro), o app inseria outra — e daí em diante cada
-- salvamento daquela pergunta criava mais uma. Além disso, valor e foto da
-- mesma pergunta chegavam a ser gravados no mesmo segundo em linhas separadas
-- (uma só com valor, outra só com foto). O relatório lista cada linha como um
-- item: o cliente via a mesma pergunta repetida (OS 13432 da Glacial, "Split 7"
-- com 7 linhas).
--
-- O que esta migration faz, nesta ordem:
--   1) guarda cópia de TODAS as linhas dos grupos duplicados;
--   2) funde cada grupo numa linha só (merge campo a campo, não "fica a última");
--   3) cria o índice único que impede nova duplicata;
--   4) cria um gatilho que transforma INSERT duplicado em merge na linha que já
--      existe — celular com o app antigo em cache continua fazendo INSERT e não
--      pode passar a tomar erro.
--
-- Regra de "vazio": o app trata string vazia/só espaços como "sem resposta"
-- (DynamicFormQuestions usa `response_value?.trim()` e `photo || null`). Então,
-- no merge, '' conta como nulo nos três campos.
--
-- Formato: response_photo_url é CSV de URLs (OsPhotoField); response_video_url
-- é uma URL única. O merge NÃO une listas de fotos: fica a lista não-vazia mais
-- recente. As linhas descartadas ficam inteiras no backup (passo 1).
--
-- Idempotente: rodar 2x não duplica backup, não recria índice nem gatilho.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Cópia de segurança (invisível ao app)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_responses_dedup_backup_20261120 (
  id                 uuid PRIMARY KEY,
  service_order_id   uuid NOT NULL,
  question_id        uuid NOT NULL,
  response_value     text,
  response_photo_url text,
  responded_at       timestamptz NOT NULL,
  responded_by       uuid,
  equipment_id       uuid,
  response_video_url text,
  backed_up_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.form_responses_dedup_backup_20261120 IS
  'Cópia das linhas de form_responses dos grupos duplicados (mesma OS+pergunta+equipamento) antes do merge de 2026-11-20. Só leitura administrativa; o app não enxerga.';

ALTER TABLE public.form_responses_dedup_backup_20261120 ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito: só service_role/postgres leem.
REVOKE ALL ON public.form_responses_dedup_backup_20261120 FROM anon, authenticated;

INSERT INTO public.form_responses_dedup_backup_20261120
  (id, service_order_id, question_id, response_value, response_photo_url,
   responded_at, responded_by, equipment_id, response_video_url)
SELECT fr.id, fr.service_order_id, fr.question_id, fr.response_value,
       fr.response_photo_url, fr.responded_at, fr.responded_by,
       fr.equipment_id, fr.response_video_url
  FROM public.form_responses fr
 WHERE EXISTS (
   SELECT 1
     FROM public.form_responses o
    WHERE o.service_order_id = fr.service_order_id
      AND o.question_id      = fr.question_id
      AND o.equipment_id IS NOT DISTINCT FROM fr.equipment_id
      AND o.id <> fr.id
 )
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2) Merge dos grupos duplicados
-- -----------------------------------------------------------------------------
-- Sobrevivente: a linha mais recente (responded_at DESC, id DESC).
-- Cada campo de conteúdo recebe o valor não-vazio MAIS RECENTE do grupo.
-- responded_at/responded_by ficam os da sobrevivente.
-- Nenhuma tabela tem FK apontando para form_responses.id e não há gatilhos na
-- tabela (conferido em 2026-11-20), então o DELETE não precisa re-apontar nada.
DO $$
DECLARE
  v_grupos   int;
  v_merged   int;
  v_deleted  int;
BEGIN
  DROP TABLE IF EXISTS _fr_rank;
  CREATE TEMP TABLE _fr_rank ON COMMIT DROP AS
  SELECT fr.id,
         fr.service_order_id, fr.question_id, fr.equipment_id,
         fr.responded_at,
         NULLIF(btrim(fr.response_value), '')     IS NOT NULL AS has_value,
         NULLIF(btrim(fr.response_photo_url), '') IS NOT NULL AS has_photo,
         NULLIF(btrim(fr.response_video_url), '') IS NOT NULL AS has_video,
         fr.response_value, fr.response_photo_url, fr.response_video_url,
         row_number() OVER (
           PARTITION BY fr.service_order_id, fr.question_id, fr.equipment_id
           ORDER BY fr.responded_at DESC NULLS LAST, fr.id DESC
         ) AS rn,
         count(*) OVER (
           PARTITION BY fr.service_order_id, fr.question_id, fr.equipment_id
         ) AS n
    FROM public.form_responses fr;

  DELETE FROM _fr_rank WHERE n < 2;

  SELECT count(*) INTO v_grupos FROM _fr_rank WHERE rn = 1;

  WITH merged AS (
    SELECT s.id AS survivor_id,
           (SELECT r.response_value FROM _fr_rank r
             WHERE r.service_order_id = s.service_order_id
               AND r.question_id = s.question_id
               AND r.equipment_id IS NOT DISTINCT FROM s.equipment_id
               AND r.has_value
             ORDER BY r.rn LIMIT 1) AS v,
           (SELECT r.response_photo_url FROM _fr_rank r
             WHERE r.service_order_id = s.service_order_id
               AND r.question_id = s.question_id
               AND r.equipment_id IS NOT DISTINCT FROM s.equipment_id
               AND r.has_photo
             ORDER BY r.rn LIMIT 1) AS p,
           (SELECT r.response_video_url FROM _fr_rank r
             WHERE r.service_order_id = s.service_order_id
               AND r.question_id = s.question_id
               AND r.equipment_id IS NOT DISTINCT FROM s.equipment_id
               AND r.has_video
             ORDER BY r.rn LIMIT 1) AS vid
      FROM _fr_rank s
     WHERE s.rn = 1
  )
  UPDATE public.form_responses fr
     SET response_value     = m.v,
         response_photo_url = m.p,
         response_video_url = m.vid
    FROM merged m
   WHERE fr.id = m.survivor_id;
  GET DIAGNOSTICS v_merged = ROW_COUNT;

  DELETE FROM public.form_responses fr
   USING _fr_rank r
   WHERE fr.id = r.id
     AND r.rn > 1;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'form_responses dedup: % grupos, % sobreviventes mescladas, % linhas removidas',
    v_grupos, v_merged, v_deleted;

  IF v_merged <> v_grupos THEN
    RAISE EXCEPTION 'dedup inconsistente: % grupos x % sobreviventes', v_grupos, v_merged;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Trava: uma linha por (OS, pergunta, equipamento); equipamento NULL conta
--    como valor (NULLS NOT DISTINCT, PG15+). service_order_id e question_id são
--    NOT NULL na tabela.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS form_responses_os_question_equipment_uniq
  ON public.form_responses (service_order_id, question_id, equipment_id)
  NULLS NOT DISTINCT;

-- -----------------------------------------------------------------------------
-- 4) INSERT duplicado vira merge na linha existente
-- -----------------------------------------------------------------------------
-- Quem faz INSERT "achava que não existia linha": os campos nulos dele
-- significam "não sei", não "apaguei". Então só sobrescreve o que veio
-- preenchido. UPDATE por id (caminho normal) não passa por aqui e continua
-- podendo gravar NULL.
--
-- SECURITY INVOKER de propósito: o SELECT/UPDATE rodam sob a RLS de quem
-- inseriu. Se a pessoa não pode ver/atualizar a linha existente, deixa o INSERT
-- seguir e o índice único responde 23505 — nunca engole a gravação em silêncio.
CREATE OR REPLACE FUNCTION public.form_responses_merge_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing_id uuid;
  v_rows        int;
BEGIN
  -- Papel sem SELECT/UPDATE na tabela (ex.: anon do portal, que só tem INSERT):
  -- não dá pra mesclar; segue o INSERT e o índice decide.
  IF NOT has_table_privilege('public.form_responses', 'SELECT')
     OR NOT has_table_privilege('public.form_responses', 'UPDATE') THEN
    RETURN NEW;
  END IF;

  -- Serializa inserts simultâneos da mesma tripla. Em READ COMMITTED o SELECT
  -- abaixo já enxerga a linha do concorrente que commitou enquanto esperávamos.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.service_order_id::text || '|' || NEW.question_id::text || '|'
        || coalesce(NEW.equipment_id::text, ''),
      0
    )
  );

  SELECT fr.id
    INTO v_existing_id
    FROM public.form_responses fr
   WHERE fr.service_order_id = NEW.service_order_id
     AND fr.question_id      = NEW.question_id
     AND fr.equipment_id IS NOT DISTINCT FROM NEW.equipment_id
   ORDER BY fr.responded_at DESC NULLS LAST, fr.id DESC
   LIMIT 1;

  IF v_existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.form_responses fr
     SET response_value     = CASE WHEN NULLIF(btrim(NEW.response_value), '') IS NULL
                                   THEN fr.response_value ELSE NEW.response_value END,
         response_photo_url = CASE WHEN NULLIF(btrim(NEW.response_photo_url), '') IS NULL
                                   THEN fr.response_photo_url ELSE NEW.response_photo_url END,
         response_video_url = CASE WHEN NULLIF(btrim(NEW.response_video_url), '') IS NULL
                                   THEN fr.response_video_url ELSE NEW.response_video_url END,
         responded_at       = COALESCE(NEW.responded_at, now()),
         responded_by       = COALESCE(NEW.responded_by, fr.responded_by)
   WHERE fr.id = v_existing_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    RETURN NULL;  -- mesclado na linha existente; não insere outra
  END IF;

  -- RLS não deixou atualizar: segue o INSERT e o índice único responde 23505.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.form_responses_merge_on_insert() IS
  'BEFORE INSERT em form_responses: se já existe linha da mesma OS+pergunta+equipamento, mescla nela (campos vazios do INSERT não apagam nada) e cancela o INSERT. SECURITY INVOKER: respeita a RLS de quem grava.';

DROP TRIGGER IF EXISTS form_responses_merge_on_insert ON public.form_responses;
CREATE TRIGGER form_responses_merge_on_insert
  BEFORE INSERT ON public.form_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.form_responses_merge_on_insert();
