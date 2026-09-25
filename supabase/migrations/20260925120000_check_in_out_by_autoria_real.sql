-- =============================================================================
-- Autoria REAL do check-in / check-out de OS (check_in_by / check_out_by)
-- -----------------------------------------------------------------------------
-- POR QUE (2026-09-25): o sistema NUNCA gravou QUEM fez o check-in/check-out.
-- service_orders tinha check_in_time, check_in_location, check_out_time e
-- check_out_location -- e nenhuma coluna de AUTOR. Por isso o relatorio de OS
-- ADIVINHAVA o tecnico: usava service_orders.technician_id e, quando ele era
-- NULL (OS de equipe), pegava o primeiro service_order_assignees por
-- created_at ASC. Como vario assignee e inserido no MESMO instante, o
-- created_at e IDENTICO e o desempate virava arbitrario -> nome aleatorio.
--
-- Medicao no prod antes desta migration:
--   * 226 OSs com check_in_time preenchido; 223 delas tem evento 'check_in'
--     registrado em technician_locations.
--   * 139 dessas 223 exibiam o nome ERRADO (executor real <> tecnico exibido),
--     em 10 empresas distintas.
--   * 174 OSs tem check_in E check_out; em 14 delas o autor do check-in e
--     DIFERENTE do autor do check-out -> as duas colunas tem que ser
--     INDEPENDENTES, nao da pra derivar uma da outra.
--   * 51 OSs com check-in tem technician_id NULL, e 100% delas sao
--     backfillaveis por technician_locations.
--
-- Caso que o cliente reportou: OS a00e9ce5-5018-474c-ab81-288304622a4b
-- (numero 2287, Glacial Cold Brasil). technician_id NULL, team_id preenchido.
-- Quem fez check-in E check-out foi Thiago Da Silva Lino Costa
-- (74fbf64b-25cb-4538-bf47-716061263bcd), comprovado em technician_locations.
-- O relatorio exibia Diego Garcia, so por ser o 1o assignee.
--
-- DECISAO SOBRE FOREIGN KEY: check_in_by / check_out_by ficam SEM FK pra
-- auth.users. As irmas dessa tabela (created_by, technician_id) usam
-- "REFERENCES auth.users(id) ON DELETE SET NULL", mas aqui isso seria um TIRO
-- NO PE:
--   1. Estas colunas sao REGISTRO DE AUDITORIA de um fato historico ("o Thiago
--      bateu o ponto nesta OS as 12:06 de 25/09/2026"). ON DELETE SET NULL
--      APAGARIA silenciosamente a autoria de toda OS ja concluida no dia em
--      que o tecnico fosse desligado e o usuario removido -- exatamente o dado
--      que esta migration existe pra preservar.
--   2. A fonte de verdade do backfill, technician_locations.user_id, TAMBEM
--      nao tem FK (conferido: a tabela so tem FK de company_id e
--      service_order_id). Colocar FK aqui deixaria as duas metades do mesmo
--      fato com regras de retencao diferentes.
--   3. A coluna nunca e usada em JOIN de integridade: o unico consumo e
--      resolver o nome via profiles.user_id, e tanto a RPC publica quanto o
--      front ja tratam "perfil nao encontrado" como NULL, com fallback.
--   4. service_orders e a tabela mais escrita do sistema; FK pra auth.users
--      obriga um lookup de integridade extra em todo check-in.
-- Consequencia aceita: pode sobrar uuid sem usuario correspondente. E o
-- comportamento DESEJADO -- a pista fica, mesmo sem o nome.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS antes do CREATE TRIGGER e backfill que so escreve
-- onde a coluna ainda esta NULL.
-- =============================================================================

-- Protege a tabela mais quente do sistema: se alguem estiver segurando lock,
-- a migration falha rapido em vez de empilhar fila de espera atras do DDL.
SET lock_timeout = '10s';

-- -----------------------------------------------------------------------------
-- 1. COLUNAS
-- -----------------------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS check_in_by  uuid,
  ADD COLUMN IF NOT EXISTS check_out_by uuid;

COMMENT ON COLUMN public.service_orders.check_in_by IS
  'Autor REAL do check-in: o usuario (auth.users.id) que efetivamente bateu o check-in nesta OS. NAO confundir com technician_id, que e quem foi ESCALADO. Em OS de equipe os dois divergem na maioria dos casos. Preenchido explicitamente pelo app no momento do check-in e, como rede de seguranca, pelo trigger trg_service_orders_stamp_check_author (auth.uid()). Sem FK pra auth.users de proposito: e registro de auditoria historico e nao pode ser zerado quando o usuario e removido (ver cabecalho da migration 20260925120000). NULL = autoria desconhecida (historico anterior a 2026-09-25 sem evento em technician_locations) -> o consumidor cai no fallback legado.';

COMMENT ON COLUMN public.service_orders.check_out_by IS
  'Autor REAL do check-out: o usuario (auth.users.id) que efetivamente bateu o check-out nesta OS. Independente de check_in_by -- em 14 OSs do historico quem fechou nao foi quem abriu. NAO confundir com technician_id (quem foi escalado). Sem FK pra auth.users de proposito (auditoria historica). NULL = autoria desconhecida.';

-- Sem indice: nenhuma consulta filtra/ordena por estas colunas (o consumo e
-- sempre "dada a OS, quem foi o autor"). Indice aqui seria custo de escrita na
-- tabela mais quente do sistema sem leitor. Se um dia existir tela "OSs
-- executadas por X", cria-se o indice nessa hora.

-- -----------------------------------------------------------------------------
-- 2. TRIGGER DE REDE DE SEGURANCA
-- -----------------------------------------------------------------------------
-- O caminho normal e o app mandar check_in_by / check_out_by EXPLICITAMENTE no
-- mesmo UPDATE do check_in_time / check_out_time. Este trigger existe pra
-- cobrir (a) versao antiga do PWA ainda em cache no celular do tecnico,
-- (b) qualquer superficie que grave o horario e esqueca o autor.
--
-- REGRAS:
--   * NUNCA sobrescreve valor que o client mandou (so age se NEW.*_by IS NULL).
--   * auth.uid() NULL (service_role, edge function, cron) -> deixa NULL, sem
--     erro. Autoria desconhecida e um estado valido.
--   * So carimba na TRANSICAO NULL -> NOT NULL do horario. Re-check-in ou
--     correcao manual de horario ja preenchido nao mexe na autoria original.
--   * Sai cedo em QUALQUER outro UPDATE de service_orders (tabela mais quente
--     do sistema): o WHEN da clausula UPDATE OF ja evita a chamada na maioria
--     dos casos, e o IS NOT DISTINCT FROM nos dois campos fecha o resto antes
--     de sequer chamar auth.uid().
--
-- CONVIVENCIA com os BEFORE UPDATE que ja existem em service_orders
-- (ordem de execucao no Postgres = ordem alfabetica do nome do trigger):
--   trg_enforce_pmoc_conformity            (BEFORE INS/UPD OF pmoc_conformity_status)
--   trg_ensure_public_short_code           (BEFORE INS/UPD)
--   trg_service_orders_stamp_check_author  (ESTE -- BEFORE UPD OF check_in_time, check_out_time)
--   trg_service_orders_track_pause_resume  (BEFORE UPD)
--   update_service_orders_updated_at       (BEFORE UPD)
-- Nenhum deles le ou escreve check_in_by / check_out_by / check_in_time /
-- check_out_time, e este nao toca em nenhum campo que eles usem (status,
-- public_short_code, pmoc_conformity_status, updated_at). Ordem e indiferente.
CREATE OR REPLACE FUNCTION public.service_orders_stamp_check_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid;
BEGIN
  -- Saida cedo #1: horario nenhum mudou -> nao e evento de check-in/out.
  IF NEW.check_in_time  IS NOT DISTINCT FROM OLD.check_in_time
     AND NEW.check_out_time IS NOT DISTINCT FROM OLD.check_out_time THEN
    RETURN NEW;
  END IF;

  -- Saida cedo #2: os dois autores ja vieram preenchidos do client.
  IF NEW.check_in_by IS NOT NULL AND NEW.check_out_by IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    -- service_role / edge / cron: sem sessao, sem autor. Deixa NULL.
    RETURN NEW;
  END IF;

  IF OLD.check_in_time IS NULL
     AND NEW.check_in_time IS NOT NULL
     AND NEW.check_in_by IS NULL THEN
    NEW.check_in_by := v_uid;
  END IF;

  IF OLD.check_out_time IS NULL
     AND NEW.check_out_time IS NOT NULL
     AND NEW.check_out_by IS NULL THEN
    NEW.check_out_by := v_uid;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.service_orders_stamp_check_author() IS
  'Rede de seguranca: carimba check_in_by / check_out_by com auth.uid() quando o horario correspondente passa de NULL para NOT NULL e o app nao mandou o autor. Nunca sobrescreve valor vindo do client; auth.uid() NULL deixa NULL.';

DROP TRIGGER IF EXISTS trg_service_orders_stamp_check_author ON public.service_orders;
CREATE TRIGGER trg_service_orders_stamp_check_author
  BEFORE UPDATE OF check_in_time, check_out_time ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.service_orders_stamp_check_author();

-- -----------------------------------------------------------------------------
-- 3. BACKFILL DO HISTORICO a partir de technician_locations
-- -----------------------------------------------------------------------------
-- Fonte de verdade: o evento que o proprio app grava em technician_locations no
-- momento do check-in / check-out (event_type 'check_in' / 'check_out'), com o
-- user_id de quem estava logado. Regra: PRIMEIRO evento de cada tipo por OS
-- (menor created_at) -- se o tecnico bateu duas vezes, vale a primeira.
--
-- Nao inventa autor: OS sem evento registrado fica NULL (o front tem fallback).
-- Escreve so onde a coluna ainda esta NULL, entao rodar 2x nao muda nada.
--
-- O trigger update_service_orders_updated_at fica DESLIGADO durante o backfill:
-- sem isso, 226 OSs historicas (varias concluidas ha meses) apareceriam como
-- "atualizadas hoje" em toda tela que ordena/exibe updated_at, e o delta sync
-- do PWA baixaria tudo de novo. Backfill de auditoria tem que ser INVISIVEL.
-- O DISABLE/ENABLE mora DENTRO do mesmo bloco DO do backfill de proposito: um
-- DO e uma unica instrucao, logo atomica mesmo em autocommit. Se qualquer
-- UPDATE abaixo falhar, o rollback do bloco RELIGA o trigger sozinho -- nao ha
-- janela em que o banco fique com updated_at desligado. service_orders tem
-- 1538 linhas, entao o lock de DDL dura milissegundos.
DO $backfill$
DECLARE
  v_in   integer := 0;
  v_out  integer := 0;
  v_gap  integer := 0;
  v_st   "char";
BEGIN
  EXECUTE 'ALTER TABLE public.service_orders DISABLE TRIGGER update_service_orders_updated_at';
  -- check_in_by
  WITH primeiro_check_in AS (
    SELECT DISTINCT ON (tl.service_order_id)
           tl.service_order_id,
           tl.user_id
    FROM public.technician_locations tl
    WHERE tl.event_type = 'check_in'
      AND tl.service_order_id IS NOT NULL
      AND tl.user_id IS NOT NULL
    ORDER BY tl.service_order_id, tl.created_at ASC
  )
  UPDATE public.service_orders so
     SET check_in_by = p.user_id
    FROM primeiro_check_in p
   WHERE p.service_order_id = so.id
     AND so.check_in_by IS NULL;
  GET DIAGNOSTICS v_in = ROW_COUNT;

  -- check_out_by (independente: em 14 OSs do historico o autor difere)
  WITH primeiro_check_out AS (
    SELECT DISTINCT ON (tl.service_order_id)
           tl.service_order_id,
           tl.user_id
    FROM public.technician_locations tl
    WHERE tl.event_type = 'check_out'
      AND tl.service_order_id IS NOT NULL
      AND tl.user_id IS NOT NULL
    ORDER BY tl.service_order_id, tl.created_at ASC
  )
  UPDATE public.service_orders so
     SET check_out_by = p.user_id
    FROM primeiro_check_out p
   WHERE p.service_order_id = so.id
     AND so.check_out_by IS NULL;
  GET DIAGNOSTICS v_out = ROW_COUNT;

  -- Auditoria: OSs com horario de check-in mas SEM evento pra backfillar.
  SELECT count(*) INTO v_gap
  FROM public.service_orders so
  WHERE so.check_in_time IS NOT NULL
    AND so.check_in_by IS NULL;

  RAISE NOTICE '[check-author backfill] check_in_by preenchido em % OSs', v_in;
  RAISE NOTICE '[check-author backfill] check_out_by preenchido em % OSs', v_out;
  RAISE NOTICE '[check-author backfill] % OSs com check_in_time seguem SEM autor (nenhum evento em technician_locations) -- ficam NULL de proposito', v_gap;

  EXECUTE 'ALTER TABLE public.service_orders ENABLE TRIGGER update_service_orders_updated_at';

  -- Trava: nao sai daqui deixando o updated_at desligado.
  SELECT t.tgenabled INTO v_st
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.service_orders'::regclass
    AND t.tgname  = 'update_service_orders_updated_at';
  IF v_st IS DISTINCT FROM 'O'::"char" THEN
    RAISE EXCEPTION '[check-author backfill] update_service_orders_updated_at ficou em estado % -- abortando pra religar no rollback', v_st;
  END IF;
END
$backfill$;

-- -----------------------------------------------------------------------------
-- 4. RPC PUBLICA get_public_os: expoe o autor real do check-in/check-out
-- -----------------------------------------------------------------------------
-- Recriada por CREATE OR REPLACE (mesma assinatura), partindo da DEFINICAO VIVA
-- do prod via pg_get_functiondef -- NAO de memoria. Assim a allowlist de 50
-- colunas de 'service_order', a guarda entry_type = 'tarefa' -> RETURN NULL e
-- todo o resto do payload saem BYTE A BYTE iguais. CREATE OR REPLACE (sem DROP)
-- tambem preserva os GRANTs existentes: anon, authenticated, service_role.
--
-- Mudanca: DUAS chaves novas no nivel de topo, ao lado da legada 'technician'
-- (que fica intacta -- outras superficies ainda dependem dela):
--   check_in_technician  -> {full_name, avatar_url} do perfil de check_in_by
--   check_out_technician -> {full_name, avatar_url} do perfil de check_out_by
-- Ambas NULL quando a coluna e NULL ou o perfil nao existe.
-- Os uuids em si NAO entram na allowlist de 'service_order': anonimo nao
-- recebe id de usuario, so nome e foto.

CREATE OR REPLACE FUNCTION public.get_public_os(p_os_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so            service_orders%ROWTYPE;
  v_technician_id uuid;
  v_result        jsonb;
  v_activities    jsonb;
BEGIN
  -- Linha da OS. Se nao existir, devolve NULL (pagina trata como "nao encontrada").
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- TAREFA INTERNA NAO E SERVIDA POR LINK PUBLICO (2026-09-19).
  -- O trigger `ensure_public_short_code` carimba short_code em TODA linha de
  -- service_orders, tarefa inclusive -> qualquer anonimo com um codigo de 12
  -- chars abria uma tarefa interna completa. Tarefa nao tem tela publica.
  -- Devolve NULL, exatamente como "nao encontrada" (o front ja trata).
  IF v_so.entry_type = 'tarefa' THEN
    RETURN NULL;
  END IF;

  -- Resolve o tecnico: technician_id primeiro, senao o primeiro assignee.
  v_technician_id := v_so.technician_id;
  IF v_technician_id IS NULL THEN
    SELECT user_id INTO v_technician_id
    FROM service_order_assignees
    WHERE service_order_id = p_os_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    -- ALLOWLIST (2026-09-19) no lugar do `to_jsonb(v_so)` cru, que devolvia a
    -- LINHA INTEIRA de service_orders pro anon. Sao as 50 colunas que alguma
    -- superficie PUBLICA realmente le (TechnicianOS ?modo=cliente, OSReport
    -- anonimo, PublicTrackingMap, CustomerPortal). Filtro por CHAVE, nao
    -- jsonb_build_object, por dois motivos: (1) 50 colunas = 100 argumentos,
    -- exatamente o teto do Postgres; (2) coluna NOVA em service_orders nasce
    -- FORA do payload publico por padrao -- so entra se alguem colocar aqui.
    -- Os valores saem identicos ao que saia antes (mesmo to_jsonb por coluna).
    'service_order', COALESCE((
      SELECT jsonb_object_agg(e.k, e.v)
      FROM jsonb_each(to_jsonb(v_so)) AS e(k, v)
      WHERE e.k = ANY (ARRAY[
        'id', 'order_number', 'customer_id', 'equipment_id', 'technician_id',
        'os_type', 'status', 'scheduled_date', 'scheduled_time',
        'description', 'diagnosis', 'solution', 'check_in_time',
        'check_in_location', 'check_out_time', 'check_out_location',
        'client_signature', 'notes', 'created_at', 'updated_at',
        'form_template_id', 'service_type_id', 'require_tech_signature',
        'require_client_signature', 'tech_signature', 'duration_minutes',
        'contract_id', 'entry_type', 'snapshot_data', 'company_id',
        'started_at', 'paused_at', 'resumed_at', 'completed_at',
        'pmoc_conformity_status', 'pmoc_conformity_notes', 'service_address',
        'service_address_number', 'service_neighborhood', 'service_city',
        'service_state', 'service_zip_code', 'service_latitude',
        'service_longitude', 'public_short_code', 'partial_finish',
        'tech_signature_at', 'client_signature_at', 'tech_signed_location',
        'client_signed_location'
      ]::text[])
    ), '{}'::jsonb),

    'customer', (
      SELECT jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
        'city', c.city, 'state', c.state, 'document', c.document, 'photo_url', c.photo_url
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    'customer_geo', (
      SELECT jsonb_build_object(
        'id', c.id, 'lat', c.lat, 'lng', c.lng, 'address', c.address,
        'city', c.city, 'state', c.state, 'zip_code', c.zip_code
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    'equipment', (
      SELECT jsonb_build_object(
        'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
        'serial_number', e.serial_number, 'location', e.location, 'capacity', e.capacity
      )
      FROM equipment e WHERE e.id = v_so.equipment_id
    ),

    'form_template', (
      SELECT jsonb_build_object('id', ft.id, 'name', ft.name)
      FROM form_templates ft WHERE ft.id = v_so.form_template_id
    ),

    'service_type', (
      SELECT jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color)
      FROM service_types st WHERE st.id = v_so.service_type_id
    ),

    'photos', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC)
      FROM os_photos p WHERE p.service_order_id = p_os_id
    ), '[]'::jsonb),

    'form_responses', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', fr.id,
          'question_id', fr.question_id,
          'response_value', fr.response_value,
          'response_photo_url', fr.response_photo_url,
          'response_video_url', fr.response_video_url,
          'equipment_id', fr.equipment_id,
          'question', (SELECT to_jsonb(fq) FROM form_questions fq WHERE fq.id = fr.question_id),
          -- template_id/template_name: NOME real do checklist personalizado,
          -- resolvido via form_questions.template_id -> form_templates.name.
          'template_id', (SELECT fq2.template_id FROM form_questions fq2 WHERE fq2.id = fr.question_id),
          'template_name', (
            SELECT ft3.name
            FROM form_questions fq3
            LEFT JOIN form_templates ft3 ON ft3.id = fq3.template_id
            WHERE fq3.id = fr.question_id
          )
        )
      )
      FROM form_responses fr WHERE fr.service_order_id = p_os_id
    ), '[]'::jsonb),

    'equipment_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'equipment_id', soe.equipment_id,
          'form_template_id', soe.form_template_id,
          -- environment_name: NOME do ambiente do equipamento neste contrato.
          -- Subselect escalar (nao join) pra nao multiplicar o jsonb_agg quando
          -- o equipamento tem mais de uma contract_items row.
          'environment_name', (
            SELECT ce.identificacao
            FROM contract_items ci
            JOIN contract_environments ce ON ce.id = ci.environment_id
            WHERE ci.equipment_id = soe.equipment_id
              AND ci.contract_id  = v_so.contract_id
              AND ci.environment_id IS NOT NULL
            ORDER BY ci.sort_order ASC NULLS LAST
            LIMIT 1
          ),
          'equipment', (
            SELECT jsonb_build_object(
              'id', e2.id, 'name', e2.name, 'brand', e2.brand, 'model', e2.model,
              'location', e2.location, 'photo_url', e2.photo_url,
              'category', (
                SELECT jsonb_build_object('id', ec.id, 'name', ec.name, 'color', ec.color)
                FROM equipment_categories ec WHERE ec.id = e2.category_id
              )
            )
            FROM equipment e2 WHERE e2.id = soe.equipment_id
          ),
          'form_template', (
            SELECT jsonb_build_object('id', ft2.id, 'name', ft2.name)
            FROM form_templates ft2 WHERE ft2.id = soe.form_template_id
          )
        )
      )
      FROM service_order_equipment soe WHERE soe.service_order_id = p_os_id
    ), '[]'::jsonb),

    'technician', (
      SELECT jsonb_build_object('full_name', pr.full_name, 'avatar_url', pr.avatar_url)
      FROM profiles pr WHERE pr.user_id = v_technician_id
    ),

    -- check_in_technician / check_out_technician (2026-09-25): QUEM REALMENTE
    -- fez o check-in / check-out, lido de service_orders.check_in_by /
    -- check_out_by. Antes disso o relatorio publico so tinha a chave
    -- 'technician' acima, que ADIVINHA o executor (technician_id, senao o
    -- primeiro assignee por created_at) -- e em OS de equipe vario assignee
    -- tem created_at IDENTICO, entao o desempate era arbitrario e o nome saia
    -- errado (139 de 223 OSs com check-in exibiam o tecnico errado).
    -- NULL quando a coluna esta NULL (historico sem evento em
    -- technician_locations) ou quando o perfil nao existe -> o front cai no
    -- fallback legado 'technician'.
    -- SEGURANCA: os uuids check_in_by / check_out_by NAO entram na allowlist de
    -- 'service_order'. O anonimo recebe so nome e foto, nunca o id do usuario.
    'check_in_technician', (
      SELECT jsonb_build_object('full_name', pr.full_name, 'avatar_url', pr.avatar_url)
      FROM profiles pr WHERE pr.user_id = v_so.check_in_by
      LIMIT 1
    ),
    'check_out_technician', (
      SELECT jsonb_build_object('full_name', pr.full_name, 'avatar_url', pr.avatar_url)
      FROM profiles pr WHERE pr.user_id = v_so.check_out_by
      LIMIT 1
    ),

    -- rating: subset SEM token. Inclui flags de estado pro link publico decidir
    -- se mostra o formulario de avaliacao ou o "obrigado".
    'rating', (
      SELECT jsonb_build_object(
        'is_concluded', (v_so.status = 'concluida'),
        'already_rated', (sr.rated_at IS NOT NULL),
        'rated_at', sr.rated_at,
        'nps_score', sr.nps_score,
        'quality_rating', sr.quality_rating,
        'punctuality_rating', sr.punctuality_rating,
        'professionalism_rating', sr.professionalism_rating,
        'comment', sr.comment,
        'rated_by_name', sr.rated_by_name
      )
      FROM service_ratings sr WHERE sr.service_order_id = p_os_id LIMIT 1
    ),

    -- survey_enabled: existe linha de rating (criada na conclusao da OS) ->
    -- a pesquisa de satisfacao pode ser ofertada no modo cliente.
    'survey_enabled', EXISTS (
      SELECT 1 FROM service_ratings sr2 WHERE sr2.service_order_id = p_os_id
    ),

    -- nps_config: pergunta + estrelas obrigatorias + generate_on_finish da
    -- empresa DONA da OS. Defaults quando a empresa nao tem linha em nps_settings.
    -- ACRESCENTA google_review_url + google_review_min_score:
    --   - google_review_url NULL      => recurso desligado.
    --   - google_review_min_score NULL => mostrar sempre (quando ha url).
    --   - google_review_min_score N   => mostrar so quando nps_score >= N.
    'nps_config', (
      SELECT jsonb_build_object(
        'question', COALESCE(ns.question,
          'De 0 a 10, o quao satisfeito(a) voce ficou com o nosso servico?'),
        'require_stars', COALESCE(ns.require_stars, false),
        'generate_on_finish', COALESCE(ns.generate_on_finish, true),
        'google_review_url', ns.google_review_url,
        'google_review_min_score', ns.google_review_min_score
      )
      FROM (SELECT 1) dummy
      LEFT JOIN nps_settings ns ON ns.company_id = v_so.company_id
    ),

    -- nps_criteria: criterios de estrela DINAMICOS ATIVOS da empresa, ordenados.
    'nps_criteria', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', nc.id, 'label', nc.label)
        ORDER BY nc.position ASC, nc.created_at ASC
      )
      FROM nps_criteria nc
      WHERE nc.company_id = v_so.company_id AND nc.active = true
    ), '[]'::jsonb),

    -- company_settings: white-label completo + locale da empresa.
    -- language/currency/timezone com COALESCE pra garantir defaults mesmo se NULL.
    -- ALLOWLIST (2026-09-19) no lugar do `to_jsonb(cs)` cru: marca, contato,
    -- cabecalho do relatorio e locale. Ficam de fora proposal_customization,
    -- segment, dre_start_date, os show_*_in_documents e as flags de
    -- comportamento do tenant -- nada disso tem leitor publico.
    -- `document` (CNPJ da EMPRESA PRESTADORA) FICA: o ReportHeader imprime
    -- "CNPJ: ..." no cabecalho do relatorio publico e do PDF.
    'company_settings', (
      SELECT COALESCE((
        SELECT jsonb_object_agg(e.k, e.v)
        FROM jsonb_each(to_jsonb(cs)) AS e(k, v)
        WHERE e.k = ANY (ARRAY[
          'id', 'company_id', 'name', 'document', 'phone', 'email',
          'address', 'city', 'state', 'zip_code', 'logo_url',
          'white_label_enabled', 'white_label_logo_url',
          'white_label_icon_url', 'white_label_primary_color',
          'report_header_bg_color', 'report_header_text_color',
          'report_header_logo_size', 'report_header_show_logo_bg',
          'report_header_logo_bg_color', 'report_status_bar_color',
          'report_header_logo_type', 'language', 'currency', 'timezone'
        ]::text[])
      ), '{}'::jsonb) || jsonb_build_object(
        'language', COALESCE(cs.language, 'pt-br'),
        'currency', COALESCE(cs.currency, 'BRL'),
        'timezone', COALESCE(cs.timezone, 'America/Sao_Paulo')
      )
      FROM company_settings cs WHERE cs.company_id = v_so.company_id
    ),

    'contract', (
      SELECT jsonb_build_object(
        'id', ct.id,
        'name', ct.name,
        'is_pmoc', ct.is_pmoc,
        'pmoc_legal_compliance_text', ct.pmoc_legal_compliance_text
      )
      FROM contracts ct WHERE ct.id = v_so.contract_id
    )
  );

  -- ---------------------------------------------------------------------------
  -- activities: respostas do checklist PMOC (service_order_activities).
  -- No modo anonimo o RLS bloqueia leitura direta dessa tabela, entao o
  -- relatorio publico depende deste payload. So inclui a chave quando a OS
  -- TEM checklist (>=1 linha).
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                a.id,
      'equipment_id',      a.equipment_id,
      'equipment_name',    e.name,
      'environment_name', (
        SELECT ce.identificacao
        FROM contract_items ci
        JOIN contract_environments ce ON ce.id = ci.environment_id
        WHERE ci.equipment_id = a.equipment_id
          AND ci.contract_id  = v_so.contract_id
          AND ci.environment_id IS NOT NULL
        ORDER BY ci.sort_order ASC NULLS LAST
        LIMIT 1
      ),
      'description',       a.description,
      'section',           a.section,
      'component',         a.component,
      'guidance',          a.guidance,
      'conformity_status', a.conformity_status,
      'is_measurement',    a.is_measurement,
      'measured_value',    a.measured_value,
      'unit',              a.unit,
      'expected_min',      a.expected_min,
      'expected_max',      a.expected_max,
      'sort_order',        a.sort_order,
      'form_template_id',  a.form_template_id,
      'freq_code',         a.freq_code,
      'photos', COALESCE((
        SELECT jsonb_agg(trim(u))
        FROM unnest(string_to_array(a.activity_photos, ',')) AS u
        WHERE trim(u) <> ''
      ), '[]'::jsonb)
    )
    ORDER BY (e.name IS NULL), e.name ASC, a.sort_order ASC NULLS LAST, a.section ASC NULLS LAST
  )
  INTO v_activities
  FROM service_order_activities a
  LEFT JOIN equipment e ON e.id = a.equipment_id
  WHERE a.service_order_id = p_os_id;

  IF v_activities IS NOT NULL THEN
    v_result := jsonb_set(v_result, '{activities}', v_activities);
  END IF;

  -- Caso a OS esteja concluida mas (excepcionalmente) sem linha de rating ainda,
  -- ainda assim devolve o estado pra UI poder ofertar a avaliacao.
  IF v_result->'rating' IS NULL OR v_result->>'rating' = 'null' THEN
    v_result := jsonb_set(v_result, '{rating}', jsonb_build_object(
      'is_concluded', (v_so.status = 'concluida'),
      'already_rated', false,
      'rated_at', NULL,
      'nps_score', NULL,
      'quality_rating', NULL,
      'punctuality_rating', NULL,
      'professionalism_rating', NULL,
      'comment', NULL,
      'rated_by_name', NULL
    ));
  END IF;

  RETURN v_result;
END;
$function$;


-- GRANTs: CREATE OR REPLACE preserva o ACL, mas reafirmar e idempotente e
-- protege quem rodar esta migration num banco novo (ex.: ambiente de teste).
GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated, service_role;

RESET lock_timeout;
