-- -----------------------------------------------------------------------------
-- NPS: estrelas por categoria viram OPCIONAIS.
-- Por quê: o cliente pode enviar só a nota de recomendação (0–10); qualidade,
-- pontualidade e profissionalismo passam a aceitar NULL (DEFAULT NULL nos params).
-- A validação de range 1–5 já era condicional a NOT NULL na versão anterior;
-- aqui só acrescentamos os DEFAULTs (ordem e assinatura dos params inalteradas).
-- Sem mudança de schema (só corpo + defaults da função) → types.ts não muda.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_os_rating(
  p_os_id            uuid,
  p_nps              integer,
  p_quality          integer DEFAULT NULL,
  p_punctuality      integer DEFAULT NULL,
  p_professionalism  integer DEFAULT NULL,
  p_comment          text    DEFAULT NULL,
  p_name             text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_so      service_orders%ROWTYPE;
  v_rating  service_ratings%ROWTYPE;
BEGIN
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_so.status <> 'concluida' THEN
    RAISE EXCEPTION 'A avaliação só fica disponível após a conclusão do serviço.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- nps continua obrigatório e validado 0–10.
  IF p_nps IS NULL OR p_nps < 0 OR p_nps > 10 THEN
    RAISE EXCEPTION 'A nota de recomendação deve estar entre 0 e 10.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Estrelas opcionais: só valida o range quando NÃO for null.
  IF (p_quality IS NOT NULL AND (p_quality < 1 OR p_quality > 5))
     OR (p_punctuality IS NOT NULL AND (p_punctuality < 1 OR p_punctuality > 5))
     OR (p_professionalism IS NOT NULL AND (p_professionalism < 1 OR p_professionalism > 5))
  THEN
    RAISE EXCEPTION 'As notas por categoria devem estar entre 1 e 5.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Garante a linha (caso a trigger não tenha rodado por algum motivo).
  INSERT INTO public.service_ratings (service_order_id, token)
  VALUES (p_os_id, encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (service_order_id) DO NOTHING;

  -- Trava: 1 resposta por OS, sem reescrever. Pega lock da linha.
  SELECT * INTO v_rating FROM service_ratings
  WHERE service_order_id = p_os_id FOR UPDATE;

  IF v_rating.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta avaliação já foi enviada. Obrigado!'
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE service_ratings SET
    nps_score             = p_nps,
    quality_rating        = p_quality,
    punctuality_rating    = p_punctuality,
    professionalism_rating= p_professionalism,
    comment               = NULLIF(btrim(p_comment), ''),
    rated_by_name         = NULLIF(btrim(p_name), ''),
    rated_at              = now()
  WHERE service_order_id = p_os_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_os_rating(uuid, integer, integer, integer, integer, text, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.submit_public_os_rating(uuid, integer, integer, integer, integer, text, text) IS
  'Coleta a avaliação NPS pelo ID da OS (link público na carona). nps 0–10 obrigatório; estrelas (qualidade/pontualidade/profissionalismo) OPCIONAIS (NULL aceito, range 1–5 só quando preenchido). Valida OS concluída, recusa 2ª resposta (unique_violation), grava + rated_at=now(). SECURITY DEFINER.';
