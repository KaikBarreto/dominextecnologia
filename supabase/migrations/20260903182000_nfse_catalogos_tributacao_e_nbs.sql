-- NFS-e motor próprio — CATÁLOGOS FISCAIS locais (cTribNac / LC 116 e NBS).
-- Plano: docs/planos/2026-09-03-nfse-motor-proprio-sefin-nacional.md (Fase D / pendência do B-bis).
--
-- POR QUE ESTA MIGRATION EXISTE
-- O governo NÃO publica API de catálogo: o OpenAPI do Sefin Nacional (preservado no spike)
-- tem exatamente 8 rotas — /nfse, /nfse/{chave}, /nfse/{chave}/eventos, /DANFSe,
-- /ParametrosMunicipais, /dps/{id}, /decisao-judicial/nfse — e nenhuma de tabela.
-- Até ontem a lista vinha da API da Fisqal; com a assinatura cancelada, o seletor de código
-- de serviço abriria VAZIO pro contador. Logo: catálogo local, versionado no repo.
--
-- ⚠️ HONESTIDADE DO DADO (leia antes de confiar)
-- Código fiscal errado numa nota é problema fiscal DO CLIENTE. Nada aqui foi inventado.
--   • `descricao` é a redação LITERAL da lista de serviços anexa à LC 116/2003
--     (com os subitens acrescidos pela LC 157/2016). É texto de lei, não paráfrase nossa.
--   • `codigo` (cTribNac, 6 dígitos) segue a composição do padrão nacional:
--         2 díg. do item + 2 díg. do subitem + 2 díg. do desdobramento
--     Ex.: 14.01 → "1401" + "01" → 140101. Essa derivação foi CONFERIDA contra a NFS-e nº 23
--     da Glacial Cold, autorizada em produção em 02/09/2026 (<cTribNac>140101</cTribNac>),
--     e a descrição do subitem 14.01 aqui é byte-a-byte idêntica à do exemplo verificado.
--   • O que NÃO temos: os desdobramentos ≥ 02. A tabela oficial completa tem ~337 códigos
--     (o catálogo da Fisqal tinha esse tamanho) contra os 199 subitens da lei — ou seja,
--     ~138 desdobramentos específicos de subitens que a Receita fatiou em mais de um código.
--     Para esses subitens o "01" existe, mas sua redação oficial é MAIS ESTREITA que a do
--     subitem inteiro que gravamos aqui.
--   → Daí as colunas `fonte` e `verificado`: `verificado = true` só no que passou pela
--     autorização do governo. Quando alguém conseguir o arquivo oficial do ADN, é só dar
--     UPSERT por `codigo` — o esquema já é o mesmo.
--
-- Catálogos GLOBAIS (lista pública da LC 116) — sem company_id de propósito.
-- RLS: SELECT liberado a authenticated; escrita só service_role.

-- ============================================================
-- 0) Normalizador de busca (acento-insensível, IMMUTABLE p/ poder indexar)
-- ============================================================
-- `unaccent` não está instalado neste projeto (ver 20260626170000_ponto_link_publico.sql, que
-- já resolveu o mesmo problema com translate). translate() e lower() são IMMUTABLE, então dá
-- pra usar em coluna gerada e em índice — o unaccent real é só STABLE e não daria.

CREATE OR REPLACE FUNCTION public.fiscal_texto_busca(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT translate(
    lower(coalesce(p_texto, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
  );
$fn$;

COMMENT ON FUNCTION public.fiscal_texto_busca(text) IS
  'Normaliza texto para busca: minúsculas + remoção de acentos via translate (IMMUTABLE, logo indexável — unaccent é só STABLE e não serve para índice/coluna gerada). Usada nos catálogos fiscais para que "manutencao" encontre "manutenção".';

GRANT EXECUTE ON FUNCTION public.fiscal_texto_busca(text) TO authenticated, service_role;

-- pg_trgm dá índice para busca PARCIAL (ILIKE '%texto%'), que é como o front busca.
-- to_tsvector resolveria busca por palavra inteira, não por pedaço de palavra — por isso trigrama.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ============================================================
-- 1) nfse_codigos_tributacao — cTribNac (6 dígitos) / itens da LC 116
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nfse_codigos_tributacao (
  codigo      text PRIMARY KEY,
  item_lc116  text,
  descricao   text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  fonte       text NOT NULL DEFAULT 'LC116/2003',
  verificado  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  descricao_busca text GENERATED ALWAYS AS (public.fiscal_texto_busca(descricao)) STORED
);

-- Guardas idempotentes (caso a tabela já exista de uma execução anterior parcial).
ALTER TABLE public.nfse_codigos_tributacao ADD COLUMN IF NOT EXISTS fonte      text NOT NULL DEFAULT 'LC116/2003';
ALTER TABLE public.nfse_codigos_tributacao ADD COLUMN IF NOT EXISTS verificado boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfse_codigos_tributacao_codigo_check'
      AND conrelid = 'public.nfse_codigos_tributacao'::regclass
  ) THEN
    ALTER TABLE public.nfse_codigos_tributacao
      ADD CONSTRAINT nfse_codigos_tributacao_codigo_check CHECK (codigo ~ '^[0-9]{6}$');
  END IF;
END $$;

COMMENT ON TABLE public.nfse_codigos_tributacao IS
  'Catálogo GLOBAL (sem company_id) de códigos de tributação nacional da NFS-e — cTribNac, 6 dígitos = item(2)+subitem(2)+desdobramento(2). Existe porque o governo não publica API de catálogo e a fonte anterior (API do provedor terceirizado) foi desligada. Semeado com os 199 subitens da lista anexa à LC 116/2003 (redação da LC 157/2016) no desdobramento "01". NÃO cobre desdobramentos >= 02 — ver coluna verificado e o cabeçalho da migration 20260903182000.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.codigo IS 'cTribNac: 6 dígitos. Ex.: 140101 = item 14, subitem 01, desdobramento 01. É o valor que vai na tag <cTribNac> da DPS.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.item_lc116 IS 'Subitem da lista anexa à LC 116/2003 no formato legível (ex.: "14.01"). É o que o contador reconhece.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.descricao IS 'Redação literal do subitem na LC 116/2003. Não parafrasear: é o texto que o contador confere.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.ativo IS 'Soft-off. Código fiscal nunca é apagado (nota antiga referencia) — desativa-se.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.fonte IS 'Procedência da linha. "LC116/2003" = derivado do texto da lei por nós. Quando entrar a tabela oficial do ADN, marcar "ADN" no upsert.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.verificado IS 'true só quando o código foi confirmado contra o governo (nota autorizada ou tabela oficial). false = derivado da lei, provável mas não confirmado. NÃO exibir como "oficial" na tela enquanto for false.';
COMMENT ON COLUMN public.nfse_codigos_tributacao.descricao_busca IS 'descricao em minúsculas e sem acentos (coluna gerada). Buscar aqui com ILIKE para que "manutencao" encontre "manutenção"; normalizar o termo digitado do mesmo jeito no client.';

CREATE INDEX IF NOT EXISTS idx_nfse_codigos_tributacao_busca_trgm
  ON public.nfse_codigos_tributacao USING gin (descricao_busca extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nfse_codigos_tributacao_item
  ON public.nfse_codigos_tributacao (item_lc116);

ALTER TABLE public.nfse_codigos_tributacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_nfse_codigos_tributacao" ON public.nfse_codigos_tributacao;
CREATE POLICY "service_role_full_access_nfse_codigos_tributacao"
  ON public.nfse_codigos_tributacao FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Catálogo global e público (é lista de lei). Sem predicado de tenant de propósito:
-- não há company_id, não há dado de cliente aqui. Só SELECT — escrita é service_role.
DROP POLICY IF EXISTS "Authenticated can read nfse_codigos_tributacao" ON public.nfse_codigos_tributacao;
CREATE POLICY "Authenticated can read nfse_codigos_tributacao"
  ON public.nfse_codigos_tributacao FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.nfse_codigos_tributacao FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nfse_codigos_tributacao FROM authenticated;
GRANT SELECT ON public.nfse_codigos_tributacao TO authenticated;

DROP TRIGGER IF EXISTS trg_nfse_codigos_tributacao_updated_at ON public.nfse_codigos_tributacao;
CREATE TRIGGER trg_nfse_codigos_tributacao_updated_at
  BEFORE UPDATE ON public.nfse_codigos_tributacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) nfse_codigos_nbs — Nomenclatura Brasileira de Serviços (9 dígitos)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nfse_codigos_nbs (
  codigo      text PRIMARY KEY,
  descricao   text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  fonte       text NOT NULL DEFAULT 'NBS',
  verificado  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  descricao_busca text GENERATED ALWAYS AS (public.fiscal_texto_busca(descricao)) STORED
);

ALTER TABLE public.nfse_codigos_nbs ADD COLUMN IF NOT EXISTS fonte      text NOT NULL DEFAULT 'NBS';
ALTER TABLE public.nfse_codigos_nbs ADD COLUMN IF NOT EXISTS verificado boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfse_codigos_nbs_codigo_check'
      AND conrelid = 'public.nfse_codigos_nbs'::regclass
  ) THEN
    ALTER TABLE public.nfse_codigos_nbs
      ADD CONSTRAINT nfse_codigos_nbs_codigo_check CHECK (codigo ~ '^[0-9]{9}$');
  END IF;
END $$;

COMMENT ON TABLE public.nfse_codigos_nbs IS
  'Catálogo GLOBAL (sem company_id) da Nomenclatura Brasileira de Serviços — cNBS, 9 dígitos (ex.: 120016000 = 1.2001.60.00). ⚠️ COBERTURA MÍNIMA DE PROPÓSITO: a NBS não é lei reproduzível como a LC 116 e não achamos fonte confiável acessível; só entrou o código que confirmamos numa nota autorizada. Preferimos catálogo curto e certo a catálogo inventado — cNBS não é obrigatório na DPS (só pesa em exportação de serviço), então poucas linhas não travam emissão. Carregar o arquivo oficial da NBS por UPSERT quando disponível.';
COMMENT ON COLUMN public.nfse_codigos_nbs.codigo IS 'cNBS: 9 dígitos, sem pontos. Ex.: 1.2001.60.00 → 120016000.';
COMMENT ON COLUMN public.nfse_codigos_nbs.verificado IS 'true só quando confirmado contra o governo (nota autorizada ou tabela oficial).';
COMMENT ON COLUMN public.nfse_codigos_nbs.descricao_busca IS 'descricao em minúsculas e sem acentos (coluna gerada), para ILIKE acento-insensível.';

CREATE INDEX IF NOT EXISTS idx_nfse_codigos_nbs_busca_trgm
  ON public.nfse_codigos_nbs USING gin (descricao_busca extensions.gin_trgm_ops);

ALTER TABLE public.nfse_codigos_nbs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_nfse_codigos_nbs" ON public.nfse_codigos_nbs;
CREATE POLICY "service_role_full_access_nfse_codigos_nbs"
  ON public.nfse_codigos_nbs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can read nfse_codigos_nbs" ON public.nfse_codigos_nbs;
CREATE POLICY "Authenticated can read nfse_codigos_nbs"
  ON public.nfse_codigos_nbs FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.nfse_codigos_nbs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nfse_codigos_nbs FROM authenticated;
GRANT SELECT ON public.nfse_codigos_nbs TO authenticated;

DROP TRIGGER IF EXISTS trg_nfse_codigos_nbs_updated_at ON public.nfse_codigos_nbs;
CREATE TRIGGER trg_nfse_codigos_nbs_updated_at
  BEFORE UPDATE ON public.nfse_codigos_nbs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) Semeadura — idempotente (UPSERT por código, nunca DELETE)
-- ============================================================
-- Reexecutar a migration reescreve a descrição a partir da lei e não duplica nada.
-- `verificado` NÃO é sobrescrito pelo seed: se alguém já confirmou um código contra o
-- governo, a confirmação sobrevive a um novo push.

INSERT INTO public.nfse_codigos_tributacao (codigo, item_lc116, descricao, verificado) VALUES
  ('010101', '1.01', 'Análise e desenvolvimento de sistemas.', false),
  ('010201', '1.02', 'Programação.', false),
  ('010301', '1.03', 'Processamento, armazenamento ou hospedagem de dados, textos, imagens, vídeos, páginas eletrônicas, aplicativos e sistemas de informação, entre outros formatos, e congêneres.', false),
  ('010401', '1.04', 'Elaboração de programas de computadores, inclusive de jogos eletrônicos, independentemente da arquitetura construtiva da máquina em que o programa será executado, incluindo tablets, smartphones e congêneres.', false),
  ('010501', '1.05', 'Licenciamento ou cessão de direito de uso de programas de computação.', false),
  ('010601', '1.06', 'Assessoria e consultoria em informática.', false),
  ('010701', '1.07', 'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados.', false),
  ('010801', '1.08', 'Planejamento, confecção, manutenção e atualização de páginas eletrônicas.', false),
  ('010901', '1.09', 'Disponibilização, sem cessão definitiva, de conteúdos de áudio, vídeo, imagem e texto por meio da internet, respeitada a imunidade de livros, jornais e periódicos (exceto a distribuição de conteúdos pelas prestadoras de Serviço de Acesso Condicionado, de que trata a Lei nº 12.485, de 12 de setembro de 2011, sujeita ao ICMS).', false),
  ('020101', '2.01', 'Serviços de pesquisas e desenvolvimento de qualquer natureza.', false),
  ('030201', '3.02', 'Cessão de direito de uso de marcas e de sinais de propaganda.', false),
  ('030301', '3.03', 'Exploração de salões de festas, centro de convenções, escritórios virtuais, stands, quadras esportivas, estádios, ginásios, auditórios, casas de espetáculos, parques de diversões, canchas e congêneres, para realização de eventos ou negócios de qualquer natureza.', false),
  ('030401', '3.04', 'Locação, sublocação, arrendamento, direito de passagem ou permissão de uso, compartilhado ou não, de ferrovia, rodovia, postes, cabos, dutos e condutos de qualquer natureza.', false),
  ('030501', '3.05', 'Cessão de andaimes, palcos, coberturas e outras estruturas de uso temporário.', false),
  ('040101', '4.01', 'Medicina e biomedicina.', false),
  ('040201', '4.02', 'Análises clínicas, patologia, eletricidade médica, radioterapia, quimioterapia, ultra-sonografia, ressonância magnética, radiologia, tomografia e congêneres.', false),
  ('040301', '4.03', 'Hospitais, clínicas, laboratórios, sanatórios, manicômios, casas de saúde, prontos-socorros, ambulatórios e congêneres.', false),
  ('040401', '4.04', 'Instrumentação cirúrgica.', false),
  ('040501', '4.05', 'Acupuntura.', false),
  ('040601', '4.06', 'Enfermagem, inclusive serviços auxiliares.', false),
  ('040701', '4.07', 'Serviços farmacêuticos.', false),
  ('040801', '4.08', 'Terapia ocupacional, fisioterapia e fonoaudiologia.', false),
  ('040901', '4.09', 'Terapias de qualquer espécie destinadas ao tratamento físico, orgânico e mental.', false),
  ('041001', '4.10', 'Nutrição.', false),
  ('041101', '4.11', 'Obstetrícia.', false),
  ('041201', '4.12', 'Odontologia.', false),
  ('041301', '4.13', 'Ortóptica.', false),
  ('041401', '4.14', 'Próteses sob encomenda.', false),
  ('041501', '4.15', 'Psicanálise.', false),
  ('041601', '4.16', 'Psicologia.', false),
  ('041701', '4.17', 'Casas de repouso e de recuperação, creches, asilos e congêneres.', false),
  ('041801', '4.18', 'Inseminação artificial, fertilização in vitro e congêneres.', false),
  ('041901', '4.19', 'Bancos de sangue, leite, pele, olhos, óvulos, sêmen e congêneres.', false),
  ('042001', '4.20', 'Coleta de sangue, leite, tecidos, sêmen, órgãos e materiais biológicos de qualquer espécie.', false),
  ('042101', '4.21', 'Unidade de atendimento, assistência ou tratamento móvel e congêneres.', false),
  ('042201', '4.22', 'Planos de medicina de grupo ou individual e convênios para prestação de assistência médica, hospitalar, odontológica e congêneres.', false),
  ('042301', '4.23', 'Outros planos de saúde que se cumpram através de serviços de terceiros contratados, credenciados, cooperados ou apenas pagos pelo operador do plano mediante indicação do beneficiário.', false),
  ('050101', '5.01', 'Medicina veterinária e zootecnia.', false),
  ('050201', '5.02', 'Hospitais, clínicas, ambulatórios, prontos-socorros e congêneres, na área veterinária.', false),
  ('050301', '5.03', 'Laboratórios de análise na área veterinária.', false),
  ('050401', '5.04', 'Inseminação artificial, fertilização in vitro e congêneres.', false),
  ('050501', '5.05', 'Bancos de sangue e de órgãos e congêneres.', false),
  ('050601', '5.06', 'Coleta de sangue, leite, tecidos, sêmen, órgãos e materiais biológicos de qualquer espécie.', false),
  ('050701', '5.07', 'Unidade de atendimento, assistência ou tratamento móvel e congêneres.', false),
  ('050801', '5.08', 'Guarda, tratamento, amestramento, embelezamento, alojamento e congêneres.', false),
  ('050901', '5.09', 'Planos de atendimento e assistência médico-veterinária.', false),
  ('060101', '6.01', 'Barbearia, cabeleireiros, manicuros, pedicuros e congêneres.', false),
  ('060201', '6.02', 'Esteticistas, tratamento de pele, depilação e congêneres.', false),
  ('060301', '6.03', 'Banhos, duchas, sauna, massagens e congêneres.', false),
  ('060401', '6.04', 'Ginástica, dança, esportes, natação, artes marciais e demais atividades físicas.', false),
  ('060501', '6.05', 'Centros de emagrecimento, spa e congêneres.', false),
  ('060601', '6.06', 'Aplicação de tatuagens, piercings e congêneres.', false),
  ('070101', '7.01', 'Engenharia, agronomia, agrimensura, arquitetura, geologia, urbanismo, paisagismo e congêneres.', false),
  ('070201', '7.02', 'Execução, por administração, empreitada ou subempreitada, de obras de construção civil, hidráulica ou elétrica e de outras obras semelhantes, inclusive sondagem, perfuração de poços, escavação, drenagem e irrigação, terraplanagem, pavimentação, concretagem e a instalação e montagem de produtos, peças e equipamentos (exceto o fornecimento de mercadorias produzidas pelo prestador de serviços fora do local da prestação dos serviços, que fica sujeito ao ICMS).', false),
  ('070301', '7.03', 'Elaboração de planos diretores, estudos de viabilidade, estudos organizacionais e outros, relacionados com obras e serviços de engenharia; elaboração de anteprojetos, projetos básicos e projetos executivos para trabalhos de engenharia.', false),
  ('070401', '7.04', 'Demolição.', false),
  ('070501', '7.05', 'Reparação, conservação e reforma de edifícios, estradas, pontes, portos e congêneres (exceto o fornecimento de mercadorias produzidas pelo prestador dos serviços, fora do local da prestação dos serviços, que fica sujeito ao ICMS).', false),
  ('070601', '7.06', 'Colocação e instalação de tapetes, carpetes, assoalhos, cortinas, revestimentos de parede, vidros, divisórias, placas de gesso e congêneres, com material fornecido pelo tomador do serviço.', false),
  ('070701', '7.07', 'Recuperação, raspagem, polimento e lustração de pisos e congêneres.', false),
  ('070801', '7.08', 'Calafetação.', false),
  ('070901', '7.09', 'Varrição, coleta, remoção, incineração, tratamento, reciclagem, separação e destinação final de lixo, rejeitos e outros resíduos quaisquer.', false),
  ('071001', '7.10', 'Limpeza, manutenção e conservação de vias e logradouros públicos, imóveis, chaminés, piscinas, parques, jardins e congêneres.', false),
  ('071101', '7.11', 'Decoração e jardinagem, inclusive corte e poda de árvores.', false),
  ('071201', '7.12', 'Controle e tratamento de efluentes de qualquer natureza e de agentes físicos, químicos e biológicos.', false),
  ('071301', '7.13', 'Dedetização, desinfecção, desinsetização, imunização, higienização, desratização, pulverização e congêneres.', false),
  ('071601', '7.16', 'Florestamento, reflorestamento, semeadura, adubação, reparação de solo, plantio, silagem, colheita, corte e descascamento de árvores, silvicultura, exploração florestal e dos serviços congêneres indissociáveis da formação, manutenção e colheita de florestas, para quaisquer fins e por quaisquer meios.', false),
  ('071701', '7.17', 'Escoramento, contenção de encostas e serviços congêneres.', false),
  ('071801', '7.18', 'Limpeza e dragagem de rios, portos, canais, baías, lagos, lagoas, represas, açudes e congêneres.', false),
  ('071901', '7.19', 'Acompanhamento e fiscalização da execução de obras de engenharia, arquitetura e urbanismo.', false),
  ('072001', '7.20', 'Aerofotogrametria (inclusive interpretação), cartografia, mapeamento, levantamentos topográficos, batimétricos, geográficos, geodésicos, geológicos, geofísicos e congêneres.', false),
  ('072101', '7.21', 'Pesquisa, perfuração, cimentação, mergulho, perfilagem, concretação, testemunhagem, pescaria, estimulação e outros serviços relacionados com a exploração e explotação de petróleo, gás natural e de outros recursos minerais.', false),
  ('072201', '7.22', 'Nucleação e bombardeamento de nuvens e congêneres.', false),
  ('080101', '8.01', 'Ensino regular pré-escolar, fundamental, médio e superior.', false),
  ('080201', '8.02', 'Instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza.', false),
  ('090101', '9.01', 'Hospedagem de qualquer natureza em hotéis, apart-service condominiais, flat, apart-hotéis, hotéis residência, residence-service, suite service, hotelaria marítima, motéis, pensões e congêneres; ocupação por temporada com fornecimento de serviço (o valor da alimentação e gorjeta, quando incluído no preço da diária, fica sujeito ao Imposto Sobre Serviços).', false),
  ('090201', '9.02', 'Agenciamento, organização, promoção, intermediação e execução de programas de turismo, passeios, viagens, excursões, hospedagens e congêneres.', false),
  ('090301', '9.03', 'Guias de turismo.', false),
  ('100101', '10.01', 'Agenciamento, corretagem ou intermediação de câmbio, de seguros, de cartões de crédito, de planos de saúde e de planos de previdência privada.', false),
  ('100201', '10.02', 'Agenciamento, corretagem ou intermediação de títulos em geral, valores mobiliários e contratos quaisquer.', false),
  ('100301', '10.03', 'Agenciamento, corretagem ou intermediação de direitos de propriedade industrial, artística ou literária.', false),
  ('100401', '10.04', 'Agenciamento, corretagem ou intermediação de contratos de arrendamento mercantil (leasing), de franquia (franchising) e de faturização (factoring).', false),
  ('100501', '10.05', 'Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangidos em outros itens ou subitens, inclusive aqueles realizados no âmbito de Bolsas de Mercadorias e Futuros, por quaisquer meios.', false),
  ('100601', '10.06', 'Agenciamento marítimo.', false),
  ('100701', '10.07', 'Agenciamento de notícias.', false),
  ('100801', '10.08', 'Agenciamento de publicidade e propaganda, inclusive o agenciamento de veiculação por quaisquer meios.', false),
  ('100901', '10.09', 'Representação de qualquer natureza, inclusive comercial.', false),
  ('101001', '10.10', 'Distribuição de bens de terceiros.', false),
  ('110101', '11.01', 'Guarda e estacionamento de veículos terrestres automotores, de aeronaves e de embarcações.', false),
  ('110201', '11.02', 'Vigilância, segurança ou monitoramento de bens, pessoas e semoventes.', false),
  ('110301', '11.03', 'Escolta, inclusive de veículos e cargas.', false),
  ('110401', '11.04', 'Armazenamento, depósito, carga, descarga, arrumação e guarda de bens de qualquer espécie.', false),
  ('120101', '12.01', 'Espetáculos teatrais.', false),
  ('120201', '12.02', 'Exibições cinematográficas.', false),
  ('120301', '12.03', 'Espetáculos circenses.', false),
  ('120401', '12.04', 'Programas de auditório.', false),
  ('120501', '12.05', 'Parques de diversões, centros de lazer e congêneres.', false),
  ('120601', '12.06', 'Boates, taxi-dancing e congêneres.', false),
  ('120701', '12.07', 'Shows, ballet, danças, desfiles, bailes, óperas, concertos, recitais, festivais e congêneres.', false),
  ('120801', '12.08', 'Feiras, exposições, congressos e congêneres.', false),
  ('120901', '12.09', 'Bilhares, boliches e diversões eletrônicas ou não.', false),
  ('121001', '12.10', 'Corridas e competições de animais.', false),
  ('121101', '12.11', 'Competições esportivas ou de destreza física ou intelectual, com ou sem a participação do espectador.', false),
  ('121201', '12.12', 'Execução de música.', false),
  ('121301', '12.13', 'Produção, mediante ou sem encomenda prévia, de eventos, espetáculos, entrevistas, shows, ballet, danças, desfiles, bailes, teatros, óperas, concertos, recitais, festivais e congêneres.', false),
  ('121401', '12.14', 'Fornecimento de música para ambientes fechados ou não, mediante transmissão por qualquer processo.', false),
  ('121501', '12.15', 'Desfiles de blocos carnavalescos ou folclóricos, trios elétricos e congêneres.', false),
  ('121601', '12.16', 'Exibição de filmes, entrevistas, musicais, espetáculos, shows, concertos, desfiles, óperas, competições esportivas, de destreza intelectual ou congêneres.', false),
  ('121701', '12.17', 'Recreação e animação, inclusive em festas e eventos de qualquer natureza.', false),
  ('130201', '13.02', 'Fonografia ou gravação de sons, inclusive trucagem, dublagem, mixagem e congêneres.', false),
  ('130301', '13.03', 'Fotografia e cinematografia, inclusive revelação, ampliação, cópia, reprodução, trucagem e congêneres.', false),
  ('130401', '13.04', 'Reprografia, microfilmagem e digitalização.', false),
  ('130501', '13.05', 'Composição gráfica, inclusive confecção de impressos gráficos, fotocomposição, clicheria, zincografia, litografia e fotolitografia, exceto se destinados a posterior operação de comercialização ou industrialização, ainda que incorporados, de qualquer forma, a outra mercadoria que deva ser objeto de posterior circulação, tais como bulas, rótulos, etiquetas, caixas, cartuchos, embalagens e manuais técnicos e de instrução, quando ficarão sujeitos ao ICMS.', false),
  ('140101', '14.01', 'Lubrificação, limpeza, lustração, revisão, carga e recarga, conserto, restauração, blindagem, manutenção e conservação de máquinas, veículos, aparelhos, equipamentos, motores, elevadores ou de qualquer objeto (exceto peças e partes empregadas, que ficam sujeitas ao ICMS).', true),
  ('140201', '14.02', 'Assistência técnica.', false),
  ('140301', '14.03', 'Recondicionamento de motores (exceto peças e partes empregadas, que ficam sujeitas ao ICMS).', false),
  ('140401', '14.04', 'Recauchutagem ou regeneração de pneus.', false),
  ('140501', '14.05', 'Restauração, recondicionamento, acondicionamento, pintura, beneficiamento, lavagem, secagem, tingimento, galvanoplastia, anodização, corte, recorte, plastificação, costura, acabamento, polimento e congêneres de objetos quaisquer.', false),
  ('140601', '14.06', 'Instalação e montagem de aparelhos, máquinas e equipamentos, inclusive montagem industrial, prestados ao usuário final, exclusivamente com material por ele fornecido.', false),
  ('140701', '14.07', 'Colocação de molduras e congêneres.', false),
  ('140801', '14.08', 'Encadernação, gravação e douração de livros, revistas e congêneres.', false),
  ('140901', '14.09', 'Alfaiataria e costura, quando o material for fornecido pelo usuário final, exceto aviamento.', false),
  ('141001', '14.10', 'Tinturaria e lavanderia.', false),
  ('141101', '14.11', 'Tapeçaria e reforma de estofamentos em geral.', false),
  ('141201', '14.12', 'Funilaria e lanternagem.', false),
  ('141301', '14.13', 'Carpintaria e serralheria.', false),
  ('141401', '14.14', 'Guincho intramunicipal, guindaste e içamento.', false),
  ('150101', '15.01', 'Administração de fundos quaisquer, de consórcio, de cartão de crédito ou débito e congêneres, de carteira de clientes, de cheques pré-datados e congêneres.', false),
  ('150201', '15.02', 'Abertura de contas em geral, inclusive conta-corrente, conta de investimentos e aplicação e caderneta de poupança, no País e no exterior, bem como a manutenção das referidas contas ativas e inativas.', false),
  ('150301', '15.03', 'Locação e manutenção de cofres particulares, de terminais eletrônicos, de terminais de atendimento e de bens e equipamentos em geral.', false),
  ('150401', '15.04', 'Fornecimento ou emissão de atestados em geral, inclusive atestado de idoneidade, atestado de capacidade financeira e congêneres.', false),
  ('150501', '15.05', 'Cadastro, elaboração de ficha cadastral, renovação cadastral e congêneres, inclusão ou exclusão no Cadastro de Emitentes de Cheques sem Fundos - CCF ou em quaisquer outros bancos cadastrais.', false),
  ('150601', '15.06', 'Emissão, reemissão e fornecimento de avisos, comprovantes e documentos em geral; abono de firmas; coleta e entrega de documentos, bens e valores; comunicação com outra agência ou com a administração central; licenciamento eletrônico de veículos; transferência de veículos; agenciamento fiduciário ou depositário; devolução de bens em custódia.', false),
  ('150701', '15.07', 'Acesso, movimentação, atendimento e consulta a contas em geral, por qualquer meio ou processo, inclusive por telefone, fac-símile, internet e telex, acesso a terminais de atendimento, inclusive vinte e quatro horas; acesso a outro banco e a rede compartilhada; fornecimento de saldo, extrato e demais informações relativas a contas em geral, por qualquer meio ou processo.', false),
  ('150801', '15.08', 'Emissão, reemissão, alteração, cessão, substituição, cancelamento e registro de contrato de crédito; estudo, análise e avaliação de operações de crédito; emissão, concessão, alteração ou contratação de aval, fiança, anuência e congêneres; serviços relativos a abertura de crédito, para quaisquer fins.', false),
  ('150901', '15.09', 'Arrendamento mercantil (leasing) de quaisquer bens, inclusive cessão de direitos e obrigações, substituição de garantia, alteração, cancelamento e registro de contrato, e demais serviços relacionados ao arrendamento mercantil (leasing).', false),
  ('151001', '15.10', 'Serviços relacionados a cobranças, recebimentos ou pagamentos em geral, de títulos quaisquer, de contas ou carnês, de câmbio, de tributos e por conta de terceiros, inclusive os efetuados por meio eletrônico, automático ou por máquinas de atendimento; fornecimento de posição de cobrança, recebimento ou pagamento; emissão de carnês, fichas de compensação, impressos e documentos em geral.', false),
  ('151101', '15.11', 'Devolução de títulos, protesto de títulos, sustação de protesto, manutenção de títulos, reapresentação de títulos, e demais serviços a eles relacionados.', false),
  ('151201', '15.12', 'Custódia em geral, inclusive de títulos e valores mobiliários.', false),
  ('151301', '15.13', 'Serviços relacionados a operações de câmbio em geral, edição, alteração, prorrogação, cancelamento e baixa de contrato de câmbio; emissão de registro de exportação ou de crédito; cobrança ou depósito no exterior; emissão, fornecimento e cancelamento de cheques de viagem; fornecimento, transferência, cancelamento e demais serviços relativos a carta de crédito de importação, exportação e garantias recebidas; envio e recebimento de mensagens em geral relacionadas a operações de câmbio.', false),
  ('151401', '15.14', 'Fornecimento, emissão, reemissão, renovação e manutenção de cartão magnético, cartão de crédito, cartão de débito, cartão salário e congêneres.', false),
  ('151501', '15.15', 'Compensação de cheques e títulos quaisquer; serviços relacionados a depósito, inclusive depósito identificado, a saque de contas quaisquer, por qualquer meio ou processo, inclusive em terminais eletrônicos e de atendimento.', false),
  ('151601', '15.16', 'Emissão, reemissão, liquidação, alteração, cancelamento e baixa de ordens de pagamento, ordens de crédito e similares, por qualquer meio ou processo; serviços relacionados à transferência de valores, dados, fundos, pagamentos e similares, inclusive entre contas em geral.', false),
  ('151701', '15.17', 'Emissão, fornecimento, devolução, sustação, cancelamento e oposição de cheques quaisquer, avulso ou por talão.', false),
  ('151801', '15.18', 'Serviços relacionados a crédito imobiliário, avaliação e vistoria de imóvel ou obra, análise técnica e jurídica, emissão, reemissão, alteração, transferência e renegociação de contrato, emissão e reemissão do termo de quitação e demais serviços relacionados a crédito imobiliário.', false),
  ('160101', '16.01', 'Serviços de transporte coletivo municipal rodoviário, metroviário, ferroviário e aquaviário de passageiros.', false),
  ('160201', '16.02', 'Outros serviços de transporte de natureza municipal.', false),
  ('170101', '17.01', 'Assessoria ou consultoria de qualquer natureza, não contida em outros itens desta lista; análise, exame, pesquisa, coleta, compilação e fornecimento de dados e informações de qualquer natureza, inclusive cadastro e similares.', false),
  ('170201', '17.02', 'Datilografia, digitação, estenografia, expediente, secretaria em geral, resposta audível, redação, edição, interpretação, revisão, tradução, apoio e infra-estrutura administrativa e congêneres.', false),
  ('170301', '17.03', 'Planejamento, coordenação, programação ou organização técnica, financeira ou administrativa.', false),
  ('170401', '17.04', 'Recrutamento, agenciamento, seleção e colocação de mão-de-obra.', false),
  ('170501', '17.05', 'Fornecimento de mão-de-obra, mesmo em caráter temporário, inclusive de empregados ou trabalhadores, avulsos ou temporários, contratados pelo prestador de serviço.', false),
  ('170601', '17.06', 'Propaganda e publicidade, inclusive promoção de vendas, planejamento de campanhas ou sistemas de publicidade, elaboração de desenhos, textos e demais materiais publicitários.', false),
  ('170801', '17.08', 'Franquia (franchising).', false),
  ('170901', '17.09', 'Perícias, laudos, exames técnicos e análises técnicas.', false),
  ('171001', '17.10', 'Planejamento, organização e administração de feiras, exposições, congressos e congêneres.', false),
  ('171101', '17.11', 'Organização de festas e recepções; bufê (exceto o fornecimento de alimentação e bebidas, que fica sujeito ao ICMS).', false),
  ('171201', '17.12', 'Administração em geral, inclusive de bens e negócios de terceiros.', false),
  ('171301', '17.13', 'Leilão e congêneres.', false),
  ('171401', '17.14', 'Advocacia.', false),
  ('171501', '17.15', 'Arbitragem de qualquer espécie, inclusive jurídica.', false),
  ('171601', '17.16', 'Auditoria.', false),
  ('171701', '17.17', 'Análise de Organização e Métodos.', false),
  ('171801', '17.18', 'Atuária e cálculos técnicos de qualquer natureza.', false),
  ('171901', '17.19', 'Contabilidade, inclusive serviços técnicos e auxiliares.', false),
  ('172001', '17.20', 'Consultoria e assessoria econômica ou financeira.', false),
  ('172101', '17.21', 'Estatística.', false),
  ('172201', '17.22', 'Cobrança em geral.', false),
  ('172301', '17.23', 'Assessoria, análise, avaliação, atendimento, consulta, cadastro, seleção, gerenciamento de informações, administração de contas a receber ou a pagar e em geral, relacionados a operações de faturização (factoring).', false),
  ('172401', '17.24', 'Apresentação de palestras, conferências, seminários e congêneres.', false),
  ('172501', '17.25', 'Inserção de textos, desenhos e outros materiais de propaganda e publicidade, em qualquer meio (exceto em livros, jornais, periódicos e nas modalidades de serviços de radiodifusão sonora e de sons e imagens de recepção livre e gratuita).', false),
  ('180101', '18.01', 'Serviços de regulação de sinistros vinculados a contratos de seguros; inspeção e avaliação de riscos para cobertura de contratos de seguros; prevenção e gerência de riscos seguráveis, prestados por quem não seja o próprio segurado ou companhia de seguro.', false),
  ('190101', '19.01', 'Serviços de distribuição e venda de bilhetes e demais produtos de loteria, bingos, cartões, pules ou cupons de apostas, sorteios, prêmios, inclusive os decorrentes de títulos de capitalização e congêneres.', false),
  ('200101', '20.01', 'Serviços portuários, ferroportuários, utilização de porto, movimentação de passageiros, reboque de embarcações, rebocador escoteiro, atracação, desatracação, serviços de praticagem, capatazia, armazenagem de qualquer natureza, serviços acessórios, movimentação de mercadorias, serviços de apoio marítimo, de movimentação ao largo, serviços de armadores, estiva, conferência, logística e congêneres.', false),
  ('200201', '20.02', 'Serviços aeroportuários, utilização de aeroporto, movimentação de passageiros, armazenagem de qualquer natureza, capatazia, movimentação de aeronaves, serviços de apoio aeroportuários, serviços acessórios, movimentação de mercadorias, logística e congêneres.', false),
  ('200301', '20.03', 'Serviços de terminais rodoviários, ferroviários, metroviários, movimentação de passageiros, mercadorias, inclusive suas operações, logística e congêneres.', false),
  ('210101', '21.01', 'Serviços de registros públicos, cartorários e notariais.', false),
  ('220101', '22.01', 'Serviços de exploração de rodovia mediante cobrança de preço ou pedágio dos usuários, envolvendo execução de serviços de conservação, manutenção, melhoramentos para adequação de capacidade e segurança de trânsito, operação, monitoração, assistência aos usuários e outros serviços definidos em contratos, atos de concessão ou de permissão ou em normas oficiais.', false),
  ('230101', '23.01', 'Serviços de programação e comunicação visual, desenho industrial e congêneres.', false),
  ('240101', '24.01', 'Serviços de chaveiros, confecção de carimbos, placas, sinalização visual, banners, adesivos e congêneres.', false),
  ('250101', '25.01', 'Funerais, inclusive fornecimento de caixão, urna ou esquifes; aluguel de capela; transporte do corpo cadavérico; fornecimento de flores, coroas e outros paramentos; desembaraço de certidão de óbito; fornecimento de véu, essa e outros adornos; embalsamento, embelezamento, conservação ou restauração de cadáveres.', false),
  ('250201', '25.02', 'Translado intramunicipal e cremação de corpos e partes de corpos cadavéricos.', false),
  ('250301', '25.03', 'Planos ou convênio funerários.', false),
  ('250401', '25.04', 'Manutenção e conservação de jazigos e cemitérios.', false),
  ('250501', '25.05', 'Cessão de uso de espaços em cemitérios para sepultamento.', false),
  ('260101', '26.01', 'Serviços de coleta, remessa ou entrega de correspondências, documentos, objetos, bens ou valores, inclusive pelos correios e suas agências franqueadas; courrier e congêneres.', false),
  ('270101', '27.01', 'Serviços de assistência social.', false),
  ('280101', '28.01', 'Serviços de avaliação de bens e serviços de qualquer natureza.', false),
  ('290101', '29.01', 'Serviços de biblioteconomia.', false),
  ('300101', '30.01', 'Serviços de biologia, biotecnologia e química.', false),
  ('310101', '31.01', 'Serviços técnicos em edificações, eletrônica, eletrotécnica, mecânica, telecomunicações e congêneres.', false),
  ('320101', '32.01', 'Serviços de desenhos técnicos.', false),
  ('330101', '33.01', 'Serviços de desembaraço aduaneiro, comissários, despachantes e congêneres.', false),
  ('340101', '34.01', 'Serviços de investigações particulares, detetives e congêneres.', false),
  ('350101', '35.01', 'Serviços de reportagem, assessoria de imprensa, jornalismo e relações públicas.', false),
  ('360101', '36.01', 'Serviços de meteorologia.', false),
  ('370101', '37.01', 'Serviços de artistas, atletas, modelos e manequins.', false),
  ('380101', '38.01', 'Serviços de museologia.', false),
  ('390101', '39.01', 'Serviços de ourivesaria e lapidação, quando o material for fornecido pelo tomador do serviço.', false),
  ('400101', '40.01', 'Obras de arte sob encomenda.', false)
ON CONFLICT (codigo) DO UPDATE
  SET item_lc116 = EXCLUDED.item_lc116,
      descricao  = EXCLUDED.descricao,
      verificado = public.nfse_codigos_tributacao.verificado OR EXCLUDED.verificado,
      ativo      = true;

-- Único código confirmado contra o governo até aqui: veio da NFS-e nº 23 da Glacial Cold,
-- autorizada em produção (<cNBS>120016000</cNBS>).
INSERT INTO public.nfse_codigos_nbs (codigo, descricao, fonte, verificado) VALUES
  ('120016000', 'Serviços de manutenção e reparação de maquinários e equipamentos de uso comercial', 'NBS/nota autorizada 2026-09-02', true)
ON CONFLICT (codigo) DO UPDATE
  SET descricao = EXCLUDED.descricao,
      fonte     = EXCLUDED.fonte,
      verificado = public.nfse_codigos_nbs.verificado OR EXCLUDED.verificado,
      ativo     = true;

-- ============================================================
-- 4) Conferência de carga (falha alto se o seed não bater)
-- ============================================================
DO $$
DECLARE
  v_trib int;
  v_nbs  int;
  v_1401 text;
BEGIN
  SELECT count(*) INTO v_trib FROM public.nfse_codigos_tributacao;
  SELECT count(*) INTO v_nbs  FROM public.nfse_codigos_nbs;
  SELECT item_lc116 INTO v_1401 FROM public.nfse_codigos_tributacao WHERE codigo = '140101';

  IF v_trib < 199 THEN
    RAISE EXCEPTION 'Seed de nfse_codigos_tributacao incompleto: % linhas (esperado >= %).', v_trib, 199;
  END IF;
  IF v_1401 IS DISTINCT FROM '14.01' THEN
    RAISE EXCEPTION 'Ancora de conferencia falhou: 140101 deveria mapear para o subitem 14.01, veio %.', coalesce(v_1401, '<nulo>');
  END IF;

  RAISE NOTICE 'Catalogos fiscais semeados: nfse_codigos_tributacao=% linhas (subitens da LC116 no desdobramento 01), nfse_codigos_nbs=% linhas.', v_trib, v_nbs;
END $$;
