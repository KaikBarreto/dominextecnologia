-- =============================================================================
-- get_lead_capture_form: allowlist de colunas em company_settings
-- =============================================================================
-- POR QUE:
--   A RPC e SECURITY DEFINER com EXECUTE pra `anon` (formulario publico de
--   captacao de lead, resolvido por short_code de 12 chars). O bloco
--   `to_jsonb(cs) || ...` entregava a LINHA INTEIRA de company_settings --
--   46 colunas -- pra qualquer anonimo de posse do codigo.
--
--   Medido em producao via chave anon, no formulario djezbng4thrr (2026-09-19),
--   ANTES desta migration. Vazava, entre outros:
--     document ....... "59.226.132/0001-89"  (CNPJ da prestadora)
--     email .......... e-mail pessoal do dono (gmail)
--     phone .......... celular do dono
--     address/address_number/complement/neighborhood/city/state/zip_code
--                      endereco COMPLETO -- e residencial (complement "casa")
--     proposal_customization ....... jsonb de config comercial interna
--     dre_start_date, quote_approval_revenue_mode,
--     quote_public_approval_creates_receivable, os_stock_consumption_enabled,
--     os_finish_revenue_prompt_enabled ....... regra de negocio interna
--     disc_show_result_to_employee ........... config de RH
--     report_header_* / show_*_in_documents .. layout de relatorio
--
--   Nada disso tem consumidor: a pagina publica e um FORMULARIO DE CADASTRO.
--   O cabecalho renderiza logo + titulo + descricao, e so (linhas 499-512).
--
-- DIFERENCA DELIBERADA PRA get_public_os (20260919210000):
--   La `document` FICOU, porque o OSReport imprime o CNPJ da prestadora no
--   cabecalho do relatorio/PDF -- tem consumidor real. AQUI NAO TEM: `cs` e
--   lido em exatamente dois pontos (linhas 496-497, brandName/brandLogo) mais
--   o white-label (229-230) e o idioma (223). Por isso a allowlist daqui e
--   bem mais curta (9 chaves) que a de la (25).
--
-- O QUE MUDA: 46 chaves -> 9. Saem 37, todas sem leitor.
-- O QUE NAO MUDA: o bloco `form` ja era allowlist de 7 campos e esta byte a
--   byte igual; a resolucao de short_code, o calculo de `expired`, o retorno
--   NULL de "nao encontrado" e a assinatura (text) -> jsonb, idem.
--
-- COMO FOI FEITA: gerada programaticamente a partir da definicao VIVA
--   (pg_get_functiondef), com a ancora do bloco company_settings assertada
--   1x antes de substituir -- nao reescrita a partir do arquivo de julho.
--
-- IDEMPOTENTE: CREATE OR REPLACE + GRANT. Re-executavel sem efeito colateral.
-- ASSINATURA INALTERADA: (text) -> jsonb. Sem regen de types.ts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_lead_capture_form(p_short_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_form    public.lead_capture_forms%ROWTYPE;
  v_expired boolean;
BEGIN
  IF p_short_code IS NULL OR length(trim(p_short_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_form
  FROM public.lead_capture_forms
  WHERE short_code = p_short_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;  -- página trata como "não encontrado"
  END IF;

  v_expired := (v_form.expires_at IS NOT NULL AND v_form.expires_at <= now())
            OR (v_form.max_submissions IS NOT NULL AND v_form.submission_count >= v_form.max_submissions);

  RETURN jsonb_build_object(
    'form', jsonb_build_object(
      'title',           v_form.title,
      'description',     v_form.description,
      'field_config',    v_form.field_config,
      'require_consent', v_form.require_consent,
      'consent_text',    v_form.consent_text,
      'is_active',       v_form.is_active,
      'expired',         v_expired
    ),
    'company_settings', (
      SELECT jsonb_build_object(
        -- Identidade visual do dono do link. E TUDO que a pagina publica le:
        --   PublicLeadCapture.tsx:496  brandName  = cs.name        (alt da <img>)
        --   PublicLeadCapture.tsx:497  brandLogo  = (white_label_enabled && white_label_logo_url) || logo_url
        --   PublicLeadCapture.tsx:229  white_label_enabled
        --   PublicLeadCapture.tsx:230  white_label_primary_color   (hexToHsl -> --primary)
        'name',                      cs.name,
        'logo_url',                  cs.logo_url,
        'white_label_enabled',       cs.white_label_enabled,
        'white_label_primary_color', cs.white_label_primary_color,
        'white_label_logo_url',      cs.white_label_logo_url,
        -- Declarado em CompanySettingsPayload (PublicLeadCapture.tsx:41) e hoje
        -- nao lido. Fica: e branding puro, do mesmo grupo dos de cima, e cortar
        -- so criaria divergencia entre o tipo do front e o payload real.
        'white_label_icon_url',      cs.white_label_icon_url,
        -- Locale. `language` alimenta normalizeLang() (linha 223) e escolhe o
        -- dicionario UI. `currency`/`timezone` nao sao lidos por esta tela hoje,
        -- mas o COALESCE deles ja era contrato explicito desta RPC antes desta
        -- migration -- mantidos byte a byte pra nao encolher o contrato.
        'language', COALESCE(cs.language, 'pt-br'),
        'currency', COALESCE(cs.currency, 'BRL'),
        'timezone', COALESCE(cs.timezone, 'America/Sao_Paulo')
      )
      FROM company_settings cs WHERE cs.company_id = v_form.company_id
    )
  );
END;
$function$
;


COMMENT ON FUNCTION public.get_lead_capture_form(text) IS
  'Formulario publico de captacao por short_code. company_settings e ALLOWLIST de 9 chaves (identidade visual + locale) desde 2026-09-19: a linha inteira vazava CNPJ, e-mail, telefone e endereco da prestadora pra qualquer anonimo com o codigo.';

-- EXECUTE reafirmado: CREATE OR REPLACE preserva os grants, mas explicitar
-- mantem a migration auto-suficiente se algum dia virar DROP + CREATE.
GRANT EXECUTE ON FUNCTION public.get_lead_capture_form(text) TO anon, authenticated;
