-- =====================================================================
-- company_origins — metadados para o cadastro público
-- =====================================================================
-- Contexto: o cadastro público (Registration.tsx) usava uma lista
-- hardcoded em src/utils/companyOrigins.ts com nomes que não existem em
-- company_origins ("Google", "Instagram", "Outro"...). Resultado:
-- companies.origin guardou rótulos órfãos e o painel master (que casa por
-- nome pra achar cor/ícone) renderizava texto cru / "N/A".
--
-- Esta migration transforma company_origins na fonte única: além de
-- cor/ícone, ela passa a dizer QUAIS origens aparecem pro cliente final,
-- com que descrição e em que ordem.
--
-- show_in_signup = false para o catálogo comercial interno (BNI,
-- Parceiro, Prospecção Ativa) e para "Tráfego Pago", que é atribuído
-- automaticamente pela UTM e nunca escolhido pela pessoa.
-- =====================================================================

ALTER TABLE public.company_origins
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS show_in_signup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 99;

COMMENT ON COLUMN public.company_origins.description IS
  'Texto curto exibido no card da etapa Origem do cadastro público (PT-BR).';
COMMENT ON COLUMN public.company_origins.show_in_signup IS
  'Se a origem aparece pro cliente final no cadastro público. Catálogo comercial interno fica false.';
COMMENT ON COLUMN public.company_origins.sort_order IS
  'Ordem dos cards na etapa Origem. 99 = fim da lista (Outros).';

-- ---------------------------------------------------------------------
-- Popula os metadados nas 12 linhas existentes (casando por name)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_row RECORD;
  v_updated INTEGER := 0;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_total INTEGER;
BEGIN
  FOR v_row IN
    SELECT *
    FROM (VALUES
      ('Site/Google',        true,  'Busca na internet',    1),
      ('Facebook/Instagram', true,  'Perfil ou anúncio',    2),
      ('ChatGPT/IAs',        true,  'Indicação de uma IA',  3),
      ('YouTube',            true,  'Vídeo ou anúncio',     4),
      ('WhatsApp',           true,  'Contato ou grupo',     5),
      ('Indicação',          true,  'Alguém recomendou',    6),
      ('Feira/Evento',       true,  'Evento presencial',    7),
      ('Outros',             true,  'Outra forma',          99),
      ('Tráfego Pago',       false, 'Anúncio pago',         20),
      ('BNI',                false, 'Rede de networking',   21),
      ('Parceiro',           false, 'Parceiro comercial',   22),
      ('Prospecção Ativa',   false, 'Contato nosso',        23)
    ) AS t(name, show_in_signup, description, sort_order)
  LOOP
    UPDATE public.company_origins AS co
    SET show_in_signup = v_row.show_in_signup,
        description = v_row.description,
        sort_order = v_row.sort_order
    WHERE co.name = v_row.name;

    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      v_missing := v_missing || v_row.name;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.company_origins;

  RAISE NOTICE 'company_origins: % linhas atualizadas de % existentes', v_updated, v_total;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE NOTICE 'company_origins: nomes do de-para ausentes na tabela: %', v_missing;
  END IF;
END $$;

-- Índice de apoio para a RPC pública (lista curta, mas evita seq scan
-- e mantém a ordenação estável).
CREATE INDEX IF NOT EXISTS idx_company_origins_signup
  ON public.company_origins (show_in_signup, sort_order, name);
