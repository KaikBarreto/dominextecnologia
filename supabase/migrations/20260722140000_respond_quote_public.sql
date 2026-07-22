-- P0 #1 — Aprovação pública da proposta (/proposta/:token) estava QUEBRADA.
--
-- A página é ANÔNIMA e tentava `quotes.update({status}).eq('token', token)`.
-- A única policy de UPDATE anon em `quotes` ("Public can update quote by valid
-- token") exige o header `x-share-token`, que o app NUNCA seta → o PATCH anon
-- volta com 0 linhas (rejeitado silenciosamente). Resultado: cliente real não
-- aprovava, status ficava `enviado` e a empresa nunca era notificada.
--
-- Padrão anon-write do projeto = RPC SECURITY DEFINER escopada só pelo token
-- (igual `record_quote_view` / `get_quote_public_payload`). Esta função faz a
-- transição de status de forma idempotente, mexendo APENAS na coluna `status`
-- do quote daquele token, sem confiar em nada além do token e sem vazar dados
-- de outros quotes/empresas.

CREATE OR REPLACE FUNCTION public.respond_quote_public(_token text, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current text;
  v_rows    integer;
BEGIN
  -- Só aceitamos as duas transições públicas possíveis.
  IF _status NOT IN ('aprovado', 'rejeitado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  -- Resolve o status atual SÓ pelo token. Resposta neutra quando não existe
  -- (não revela se o token é válido ou não).
  SELECT status INTO v_current
  FROM public.quotes
  WHERE token = _token
  LIMIT 1;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Transição única e idempotente: só sai de 'enviado'. Nunca rebaixa um quote
  -- já aprovado/rejeitado/convertido. Mexe SOMENTE em `status`.
  UPDATE public.quotes
     SET status = _status
   WHERE token = _token
     AND status = 'enviado';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    RETURN jsonb_build_object('ok', true, 'status', _status);
  END IF;

  -- 0 linhas = já respondido/expirado. Sem erro real; devolve o status atual.
  RETURN jsonb_build_object('ok', false, 'status', v_current, 'error', 'not_pending');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.respond_quote_public(text, text) TO anon, authenticated;
