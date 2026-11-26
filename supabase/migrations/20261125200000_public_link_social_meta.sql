-- Preview social (og:image / titulo) com a marca do tenant em TODOS os links
-- publicos, nao so na OS.
--
-- Por que: quando uma empresa com White Label compartilha /pagar, /proposta,
-- /portal, /contrato, /ponto etc. no WhatsApp, o preview saia com a marca da
-- Dominex. As Cloudflare Pages Functions passam a chamar a RPC publica abaixo
-- com (tipo do link, parametro cru da rota) e montam o <head> social.
--
-- Regua (identica a get_public_os_social_meta, que NAO e alterada aqui):
--   - White Label ativo (modulo + flag) => somente a arte social 1200x630 ja
--     composta (company_settings.os_social_image_url); sem ela, arte padrao.
--   - Nunca o logo bruto do tenant.
--   - Saida: so nome de exibicao da empresa + URL da arte. Sem PII, sem id.
--
-- Seguranca:
--   - O helper company_public_social_meta(uuid) recebe company_id cru: seria
--     oraculo de enumeracao se exposto. REVOKE de anon/authenticated; so e
--     chamado de dentro da RPC (mesmo owner, SECURITY DEFINER).
--   - A RPC resolve cada tipo SOMENTE pelo mesmo segredo que a pagina publica
--     ja aceita (mesma coluna, mesmo formato). Nenhum caminho novo (ex.: UUID
--     interno onde a pagina so aceita token).
--   - Qualquer falha => NULL. Sem excecao, sem diferenca observavel entre
--     "nao existe" e "formato invalido". Nenhum cast para uuid.
--   - Existencia apenas: expiracao/revogacao/uso continuam sendo decididos pela
--     pagina. Filtros de "registro apagado/desabilitado" que o resolvedor
--     aplica na propria busca foram replicados.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT. Sem mudanca de schema.

-- ---------------------------------------------------------------------------
-- 1) Helper interno: marca social publica de uma empresa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_public_social_meta(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_image constant text := 'https://www.dominex.app/images/og-social.jpg';
  v_found boolean := false;
  v_name text;
  v_wl_flag boolean;
  v_social text;
  v_wl_active boolean;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT true,
         COALESCE(NULLIF(btrim(cs.name), ''), NULLIF(btrim(c.name), '')),
         COALESCE(cs.white_label_enabled, false),
         NULLIF(cs.os_social_image_url, '')
    INTO v_found, v_name, v_wl_flag, v_social
    FROM public.companies c
    LEFT JOIN public.company_settings cs ON cs.company_id = c.id
   WHERE c.id = p_company_id
   LIMIT 1;

  IF NOT COALESCE(v_found, false) THEN
    RETURN NULL;
  END IF;

  v_wl_active := v_wl_flag
                 AND COALESCE(public.company_has_module(p_company_id, 'white_label'), false);

  RETURN jsonb_build_object(
    'company_name', v_name,
    'social_image_url', CASE
      WHEN v_wl_active THEN COALESCE(v_social, v_default_image)
      ELSE v_default_image
    END,
    'social_image_is_composed', (v_wl_active AND v_social IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.company_public_social_meta(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_public_social_meta(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_public_social_meta(uuid) TO service_role;

COMMENT ON FUNCTION public.company_public_social_meta(uuid) IS
  'Interno (nao exposto a anon/authenticated). Regua unica da marca social publica: nome de exibicao + arte 1200x630 composta quando White Label ativo; nunca o logo bruto.';

-- ---------------------------------------------------------------------------
-- 2) RPC publica: (tipo do link, parametro cru da rota) -> marca social
-- ---------------------------------------------------------------------------
--   pagar          /pagar/:code                 tenant_charges.public_short_code (ultimo segmento)
--   assinar        /assinar/:code               tenant_subscriptions.public_short_code (ultimo segmento), deleted_at IS NULL
--   orcamento      /orcamento/:token            quotes.token (64 hex, inteiro ou ultimo segmento)
--   proposta       /proposta/:token             idem
--   portal         /portal/:token               customer_portals.token (64 hex), is_active, cliente nao excluido
--   contrato       /contrato|pmoc/unidade/:t    contracts.public_pmoc_token (32 hex) ou public_short_code (ultimo segmento)
--   certificado    /c/:token                    pmoc_certificate_validations.validation_token ([A-Za-z0-9_-]{16}, inteiro)
--   cadastro       /cadastro/:code              lead_capture_forms.short_code (ultimo segmento)
--   ponto          /ponto/:slug                 employees.ponto_slug (inteiro), ponto_enabled
--   ponto_empresa  /ponto/empresa/:kioskSlug    companies.ponto_kiosk_slug (inteiro)
--   ativar_ponto   /ativar-ponto|cadastro-facial/:token
--                                               employee_face_enrollment_tokens.token_hash = sha256 hex do token (64 hex)
--   avaliacao      /avaliacao/:token            disc_assessments.public_short_code (ultimo segmento)
CREATE OR REPLACE FUNCTION public.get_public_link_social_meta(p_kind text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_ref text := btrim(COALESCE(p_reference, ''));
  v_parts text[];
  v_last text;
  v_short text;     -- codigo curto base32 (12) extraido do ultimo segmento
  v_hex64 text;     -- token 64 hex (inteiro ou ultimo segmento)
  v_company_id uuid;
BEGIN
  IF v_kind = '' OR v_ref = '' OR length(v_ref) > 200 THEN
    RETURN NULL;
  END IF;

  -- Mesmo criterio de extractShortCode/extractQuoteToken (src/utils/prettyLinks.ts):
  -- o codigo e sempre o ultimo segmento apos o ultimo '-'.
  v_parts := string_to_array(v_ref, '-');
  v_last := v_parts[array_length(v_parts, 1)];
  IF v_last ~ '^[a-hj-np-z2-9]{12}$' THEN
    v_short := v_last;
  END IF;
  IF v_ref ~ '^[0-9a-f]{64}$' THEN
    v_hex64 := v_ref;
  ELSIF v_last ~ '^[0-9a-f]{64}$' THEN
    v_hex64 := v_last;
  END IF;

  BEGIN
    CASE v_kind
      WHEN 'pagar' THEN
        IF v_short IS NOT NULL THEN
          SELECT tc.company_id INTO v_company_id
            FROM public.tenant_charges tc
           WHERE tc.public_short_code = v_short
           LIMIT 1;
        END IF;

      WHEN 'assinar' THEN
        IF v_short IS NOT NULL THEN
          SELECT ts.company_id INTO v_company_id
            FROM public.tenant_subscriptions ts
           WHERE ts.public_short_code = v_short
             AND ts.deleted_at IS NULL
           LIMIT 1;
        END IF;

      WHEN 'orcamento', 'proposta' THEN
        IF v_hex64 IS NOT NULL THEN
          SELECT q.company_id INTO v_company_id
            FROM public.quotes q
           WHERE q.token = v_hex64
           LIMIT 1;
        END IF;

      WHEN 'portal' THEN
        -- A pagina usa o parametro inteiro como token (sem slug).
        IF v_ref ~ '^[0-9a-f]{64}$' THEN
          SELECT cu.company_id INTO v_company_id
            FROM public.customer_portals cp
            JOIN public.customers cu ON cu.id = cp.customer_id
           WHERE cp.token = v_ref
             AND cp.is_active = true
             AND COALESCE(cu.is_deleted, false) = false
           LIMIT 1;
        END IF;

      WHEN 'contrato' THEN
        -- Mesma ordem da edge pmoc-portal-share: token antigo 32 hex inteiro
        -- primeiro; senao codigo curto no ultimo segmento.
        IF v_ref ~ '^[0-9a-f]{32}$' THEN
          SELECT ct.company_id INTO v_company_id
            FROM public.contracts ct
           WHERE ct.public_pmoc_token = v_ref
           LIMIT 1;
        ELSIF v_short IS NOT NULL THEN
          SELECT ct.company_id INTO v_company_id
            FROM public.contracts ct
           WHERE ct.public_short_code = v_short
           LIMIT 1;
        END IF;

      WHEN 'certificado' THEN
        -- Token pode conter '-': nunca fatiar; parametro inteiro.
        IF v_ref ~ '^[A-Za-z0-9_-]{16}$' THEN
          SELECT pv.company_id INTO v_company_id
            FROM public.pmoc_certificate_validations pv
           WHERE pv.validation_token = v_ref
           LIMIT 1;
        END IF;

      WHEN 'cadastro' THEN
        IF v_short IS NOT NULL THEN
          SELECT lf.company_id INTO v_company_id
            FROM public.lead_capture_forms lf
           WHERE lf.short_code = v_short
           LIMIT 1;
        END IF;

      WHEN 'ponto' THEN
        -- Slug inteiro, case-sensitive (igual a edge time-clock-portal).
        IF v_ref ~ '^[A-Za-z0-9_-]+$' THEN
          SELECT e.company_id INTO v_company_id
            FROM public.employees e
           WHERE e.ponto_slug = v_ref
             AND e.ponto_enabled = true
           LIMIT 1;
        END IF;

      WHEN 'ponto_empresa' THEN
        IF v_ref ~ '^[A-Za-z0-9_-]+$' THEN
          SELECT c.id INTO v_company_id
            FROM public.companies c
           WHERE c.ponto_kiosk_slug = v_ref
           LIMIT 1;
        END IF;

      WHEN 'ativar_ponto' THEN
        -- O token bruto nunca e persistido: a edge face-enrollment faz
        -- sha256 hex (sem pepper) e busca por token_hash. Mesmo calculo aqui.
        IF v_ref ~ '^[0-9a-f]{64}$' THEN
          SELECT t.company_id INTO v_company_id
            FROM public.employee_face_enrollment_tokens t
            JOIN public.employees e
              ON e.id = t.employee_id
             AND e.company_id = t.company_id
           WHERE t.token_hash = encode(pg_catalog.sha256(convert_to(v_ref, 'UTF8')), 'hex')
           LIMIT 1;
        END IF;

      WHEN 'avaliacao' THEN
        IF v_short IS NOT NULL THEN
          SELECT da.company_id INTO v_company_id
            FROM public.disc_assessments da
           WHERE da.public_short_code = v_short
           LIMIT 1;
        END IF;

      ELSE
        RETURN NULL;
    END CASE;

    IF v_company_id IS NULL THEN
      RETURN NULL;
    END IF;

    RETURN public.company_public_social_meta(v_company_id);
  EXCEPTION WHEN OTHERS THEN
    -- Nunca vaza erro (nem diferenca de comportamento) pro chamador anonimo.
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_link_social_meta(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_link_social_meta(text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_link_social_meta(text, text) IS
  'Allowlist minima do head social de links publicos (pagar, assinar, orcamento, proposta, portal, contrato, certificado, cadastro, ponto, ponto_empresa, ativar_ponto, avaliacao). Resolve so pelo mesmo segredo da pagina publica; devolve {company_name, social_image_url, social_image_is_composed} ou NULL. White Label ativo expoe somente arte 1200x630 composta; nunca o logo bruto do tenant.';
