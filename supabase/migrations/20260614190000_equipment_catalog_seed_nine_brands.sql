-- Seed do catálogo GLOBAL de equipamentos (Auctus): 9 marcas novas.
-- Brastemp, Philco, Komeco, Agratto, Carrier, Springer, TCL, Hitachi, Elgin.
--
-- ⚠️ Whirlpool NÃO entra: a marca NÃO vende ar-condicionado no Brasil
--    (opera via Brastemp/Consul). Ver docs/catalogo-equipamentos-lacunas.md.
--
-- Cada marca recebe: a brand (name/slug/logo_url/sort sequencial continuando
-- de Fujitsu=8), modelos por TIPO/BTU com nomes DESCRITIVOS, e os códigos de
-- erro de confiança ALTA/MÉDIA ligados a um modelo representativo.
--
-- FONTE PÚBLICA: pesquisa cruzada (>=2 fontes) em docs/catalogo-pesquisa/*.md.
-- Só confiança ALTA e MÉDIA foram semeadas (BAIXA/conflitante ficou de fora).
-- description = title quando não há descrição própria. solution = NULL.
-- image_url do modelo = SOMENTE quando há URL de FOTO CDN verificada no .md;
-- senão NULL. manual_url = PDF do .md quando houver.
--
-- Equivalências confirmadas nos .md:
--  - Brastemp = plataforma Consul (reaproveita os códigos da Consul).
--  - Carrier/Springer = plataforma Midea (tabela Midea global onde o .md confirma).
--
-- ⚠️ NÃO toca em public.equipment_categories (tabela MULTI-TENANT de cliente).
--    O catálogo usa public.equipment_model_categories (GLOBAL).
--
-- Idempotente: marcas/categorias por nome (WHERE NOT EXISTS), modelos por
-- (brand_id,name), códigos por (model_id,code). Rodar 2x não duplica.
-- IDs capturados via subselect/CTE — nenhum UUID hardcoded.

-- ============================================================
-- 0) CATEGORIAS GLOBAIS (Split Hi-Wall já existe; criar as demais)
-- ============================================================
INSERT INTO public.equipment_model_categories (name)
SELECT v.name
FROM (VALUES ('Split Hi-Wall'), ('Cassete'), ('Piso-Teto'), ('Multi-Split')) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.equipment_model_categories c WHERE c.name = v.name
);

-- ============================================================
-- 1) MARCAS (sort 9..17, continuando de Fujitsu=8)
--    Whirlpool excluída de propósito.
-- ============================================================
INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Brastemp', 'brastemp', 'https://upload.wikimedia.org/wikipedia/commons/1/14/Brastemp.svg', 9
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Brastemp');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Philco', 'philco', 'https://upload.wikimedia.org/wikipedia/commons/7/76/Philco_logo.svg', 10
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Philco');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Komeco', 'komeco', 'https://www.komeco.com.br/wp-content/uploads/2022/10/cropped-logo-komeco-1.png', 11
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Komeco');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Agratto', 'agratto', 'https://images.seeklogo.com/logo-png/31/1/agratto-logo-png_seeklogo-319108.png', 12
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Agratto');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Carrier', 'carrier', 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Logo_of_the_Carrier_Corporation.svg', 13
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Carrier');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Springer', 'springer', 'https://logodownload.org/wp-content/uploads/2017/04/springer-logo.png', 14
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Springer');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'TCL', 'tcl', 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Logo_of_the_TCL_Corporation.svg', 15
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'TCL');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Hitachi', 'hitachi', 'https://www.hitachiaircon.com/br/assets/images/logo.svg', 16
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Hitachi');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Elgin', 'elgin', 'https://elgin.vtexassets.com/assets/vtex/assets-builder/elgin.store/1.0.140/images/logos/logo___8c0ef161d2fcb8c5f07910f575842820.svg', 17
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Elgin');

-- ============================================================
-- 2) MODELOS por TIPO/BTU (brand_id e category_id via subselect)
--    Nomes DESCRITIVOS (tipo + linha + BTU). image_url só com foto CDN
--    verificada no .md; manual_url quando houver.
-- ============================================================

-- helper repetido: cada bloco insere modelos de uma marca a partir de VALUES
-- (category_name, name, code, image_url, manual_url), resolvendo brand/category.

-- ---------- BRASTEMP (só Split Hi-Wall, on/off) ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall 12.000 BTUs Frio (linha Clean)', 'BBV12BB', 'https://i.zst.com.br/thumbs/12/36/18/778859.jpg', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall 9.000 BTUs Frio (linha Clean)', 'BBV09BB', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall 9.000 BTUs Quente/Frio (linha Clean)', 'BBU09BB', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall 12.000 BTUs Quente/Frio (linha Clean)', 'BBU12BB', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Frio (linha ative!)', 'BBF07/09/12/18/22 AB', NULL, 'https://pdf.webarcondicionado.com.br/brastemp/manual/usuario/mdu-split-hi-wall-bbf07-bbf09-bbf12-bbf18-bbf22.pdf')
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Brastemp'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- PHILCO ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Frio (Eco Inverter, R-32)', 'PAC9000IFM15', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Quente/Frio (Eco Inverter, R-32)', 'PAC9000IQFM15', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Frio (Eco Inverter, R-32)', 'PAC12000IFM15', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Frio (R-32)', 'PAC12FB', 'https://friopecas.vtexassets.com/arquivos/ids/245902/PAC12FB_00.jpg.jpg', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 24.000 BTUs Quente/Frio (Eco Inverter, R-32)', 'PAC24000IQFM15', NULL, NULL),
  ('Cassete', 'Cassete 4 Vias Inverter 24.000 BTUs Frio (Eco Inverter, R-410A)', 'PAC24000ICFM9', 'https://friopecas.vtexassets.com/arquivos/ids/224431/Philco-Cassete-Dez-2023.jpg', NULL),
  ('Piso-Teto', 'Piso-Teto Inverter 60.000 BTUs Frio (Eco Inverter, R-32, 220V)', 'PAC60000IPFM15', 'https://refrigeracaovilanova.com/wp-content/uploads/2024/10/01-PAC60000IPFM15-1.jpg', NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Philco'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- KOMECO ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Quente/Frio (KOHI, R-32)', NULL, 'https://t98697.vtexassets.com/arquivos/ids/160303-800-auto', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter Quente/Frio (KOHI 1HX, R-410A)', 'KOHI 09/12/18/22 QC 1HX', NULL, 'https://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/Auto%20Diagnostico/AUTO%20DIAGNOSTICO%20-%20KOHI%201HX_05.04.2018.pdf'),
  ('Split Hi-Wall', 'Split Hi-Wall On/Off Quente/Frio (linha KAC, R-410A)', 'KAC-09CHSA1', NULL, 'https://www.komeco.com.br/arquivos/manuais/ar-condicionado/split-hi-wall/manual-ar-condicionado-split-kac-chsa1.pdf'),
  ('Cassete', 'Cassete Inverter 36.000 BTUs Frio (KOC INV 1HX, R-410A)', 'KOC INV 36FC 1HX', NULL, NULL),
  ('Cassete', 'Cassete Inverter 48.000 BTUs Frio (KOC INV 1HX, R-410A)', 'KOC INV 48FC 1HX', NULL, NULL),
  ('Piso-Teto', 'Piso-Teto Inverter 36.000 BTUs Frio (KOP INV 2HX, R-410A)', 'KOP INV 36FC 2HX', NULL, NULL),
  ('Piso-Teto', 'Piso-Teto Inverter 55.000 BTUs Frio (KOP INV 2HX, R-410A)', 'KOP INV 55FC 2HX', NULL, NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Komeco'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- AGRATTO ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Frio (NEO Inverter)', 'ICS9F', 'https://fujiokadistribuidor.vteximg.com.br/arquivos/ids/166055-292-292/p_50078_alta_2.png?v=637048611186130000', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 18.000 BTUs Frio (NEO Inverter)', 'ICS18F-02', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Frio (ZEN Inverter, R-32)', 'ZICST9F-02', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Quente/Frio (ZEN Inverter, R-32)', 'ZICST9QF-02', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall On/Off 9.000 BTUs Frio (FIT TOP, R-410A)', 'CCST9FIR402', NULL, 'https://cdn2.centralar.com.br/centralar/mds/manuais/agratto/split/9442/ar-condicionado-split-hw-onoff-fit-top-9000-btus-frio-220v-monofasico-ccst9fir402-outlet-9442-manual.pdf'),
  ('Cassete', 'Cassete Inverter 36.000 BTUs Frio (R-32)', 'LCI36F-02', 'https://lojawebcontinental.vtexassets.com/arquivos/ids/67725898-800-auto?v=638730620532100000&width=800&height=auto&aspect=true', 'https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/agratto/Cassete/3693/Manual%20-%20Agratto%20-%20Cassete%20-%20Piso%20teto.pdf'),
  ('Cassete', 'Cassete Inverter 55.000 BTUs Frio (R-32)', 'LCI55F-02', NULL, NULL),
  ('Piso-Teto', 'Piso-Teto Inverter 36.000 BTUs Frio (R-32)', 'LPTI36F-02', NULL, 'https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/agratto/Cassete/3693/Manual%20-%20Agratto%20-%20Cassete%20-%20Piso%20teto.pdf'),
  ('Piso-Teto', 'Piso-Teto Inverter 55.000 BTUs Frio (R-32)', 'LPTI55F-02', NULL, NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Agratto'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- CARRIER ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Frio (X-Power)', '42FVCA09C5 / 38FVCA09C5', 'https://i.zst.com.br/thumbs/12/32/1e/50916406.jpg', 'https://img.carrierdobrasil.com.br/downloads_docs/1c52a-MP-SHW-Carrier-X-Power-H-05-13--view-.pdf'),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Quente/Frio (X-Power)', '38LVQC12C5', 'https://lojawebcontinental.vtexassets.com/arquivos/ids/20718758-800-auto?v=638255688678200000&width=800', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 18.000 BTUs Frio (X-Power)', '42FVCA18C5 / 38FVCA18C5', NULL, NULL),
  ('Cassete', 'Cassete Inverter 30.000 BTUs Frio (R-32)', '40KVCB30C5', NULL, 'https://carrierdobrasil.com.br/wp-content/uploads/2024/07/Manual-do-Usua%CC%81rio.pdf'),
  ('Cassete', 'Cassete Inverter 36.000 BTUs Frio (R-32)', '40KVCB36C5', NULL, NULL),
  ('Piso-Teto', 'Piso-Teto Inverter Frio (X-Power Connect, R-32)', '42ZQVD36M5', NULL, 'https://carrierdobrasil.com.br/wp-content/uploads/2020/03/256.09.126_MP-Xperience-Xpower-Carrier-42ZQ-42ZQV-B-04-21-view.pdf')
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Carrier'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- SPRINGER ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Frio (AirVolution Connect, R-32)', '42AFVCI12S5', NULL, 'https://www.midea.com/content/dam/midea-aem/br/climatizacao/hiwall/ar-condicionado-springer-midea-airvolution-inverter-idrs/Manual%20de%20usu%C3%A1rio%20(3).pdf'),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 24.000 BTUs Quente/Frio (Xtreme Save Connect)', '42AGQA24M5', NULL, 'https://www.midea.com/content/dam/midea-aem/br/climatizacao/hiwall/ar-condicionado-split-springer-midea-xtreme-save-connect-9000-btu-h-quente-frio/Manual%20do%20usu%C3%A1rio.pdf'),
  ('Piso-Teto', 'Piso-Teto Inverter 36.000 BTUs Frio (Connect, R-32)', '42ZQVD36M5', NULL, NULL),
  ('Multi-Split', 'Multi-Split Inverter 42.000 BTUs Quente/Frio (condensadora)', '38MBPA42M5', 'https://acdn-us.mitiendanube.com/stores/877/808/products/50000054971-e394f041c19b49159116940326905754-1024-1024.webp', NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Springer'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- TCL ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Frio (T-Pro 2.0, R-32)', 'TAC-09CTG2-INV', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Quente/Frio (T-Pro 2.0, R-32)', 'TAC-09CHTG2-INV', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Frio (T-Pro 2.0, R-32)', 'TAC-12CTG2-INV', 'https://martinelloeletrodomesticos.fbitsstatic.net/img/p/ar-condicionado-tcl-split-inverter-12000-btus-tac-12ctg2-frio-220v-80007/266599.jpg', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 18.000 BTUs Frio (T-Pro 2.0, R-32)', 'TAC-18CTG2-INV', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 24.000 BTUs Frio (T-Pro 2.0, R-32)', 'TAC-24CTG2-INV', NULL, NULL),
  ('Cassete', 'Cassete Inverter 36.000 BTUs Frio (R-32)', 'TAC-36CSG/CT-INV', NULL, NULL),
  ('Piso-Teto', 'Piso-Teto Inverter 36.000 BTUs Quente/Frio (R-32)', 'TAC-36CSG/CF-INV', NULL, NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'TCL'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- HITACHI ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 9.000 BTUs Frio (airHome 600, R-32)', 'SPK09C3IVF', 'https://castaticstorage.blob.core.windows.net/centralar/mds/produtos/hitachi/2023/Split/3289/1000x1000/ar-condicionado-hitachi-inverter-airhome.jpg', 'https://documentation2.hitachiaircon.com/blbs/files/downloads/HIOM-MSPAR001_Rev02_Dez2023_Split_Hi-Wall_Inverter_airHome_600.pdf'),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Frio (airHome 600, R-32)', 'SPK12C3IVF', 'https://www.leveros.com.br/upload/produto/imagem/m_ar-condicionado-split-hw-inverter-hitachi-airhome-600-12-000-btus-s-frio-220v.jpg', NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Quente/Frio (airHome 600, R-32)', 'SPK12C3IVQ', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 18.000 BTUs Frio (airHome 600, R-32)', 'SPK18C3IVF', NULL, NULL),
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 24.000 BTUs Frio (airHome 600, R-32)', 'SPK24C3IVF', NULL, NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Hitachi'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ---------- ELGIN ----------
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, v.name, v.code, v.image_url, v.manual_url
FROM public.equipment_brands b
JOIN (VALUES
  ('Split Hi-Wall', 'Split Hi-Wall Inverter 12.000 BTUs Frio (Eco Inverter II Wi-Fi, R-32)', 'HJFI12C2WB / HJFE12C2CB', 'https://www.leveros.com.br/upload/produto/imagem/m_ar-condicionado-split-hw-elgin-eco-inverter-ii-wi-fi-12-000-btus-r-32-s-frio-220v.jpg', NULL),
  ('Piso-Teto', 'Piso-Teto Inverter 24.000 BTUs Frio (Inverter Plus, R-32)', '45PDFI24C2DA / 45PDFE24C2CA', 'https://centroeletrico.fbitsstatic.net/img/p/split-piso-teto-inverter-plus-gas-r-32-elgin-24000-btus-frio-220v-monofasico-84073/270587-1.jpg', NULL)
) AS v(cat, name, code, image_url, manual_url) ON TRUE
JOIN public.equipment_model_categories c ON c.name = v.cat
WHERE b.name = 'Elgin'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = v.name);

-- ============================================================
-- 3) CÓDIGOS DE ERRO
--    Ligados a um modelo representativo "linha geral" de cada marca.
--    Só confiança ALTA/MÉDIA dos .md. solution = NULL.
-- ============================================================

-- ---------- BRASTEMP = plataforma CONSUL (equivalência ALTA no .md) ----------
-- "E__" no painel; numéricos via Sleep×4. Ligado ao modelo Clean 12k.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Brastemp'
CROSS JOIN (VALUES
  ('E2', 'Superaquecimento (unidade externa)', 'Sensor da serpentina externa leu temperatura alta — checar ventilação/sujeira da condensadora', 'Condensadora'),
  ('E4', 'Falha do ventilador interno', 'Motor/turbina da evaporadora ou capacitor', 'Evaporadora'),
  ('E6', 'Tensão de alimentação fora do especificado', 'Variação de tensão da rede — medir/estabilizar', 'Energia'),
  ('E42', 'Proteção de subresfriamento', 'Checar carga de gás e sensores de temperatura', 'Sistema'),
  ('E43', 'Proteção de superaquecimento', 'Checar carga de gás, ventilação e sensores', 'Sistema'),
  ('EA', 'Erro de comunicação', 'Comunicação entre placa interface e placa da unidade interna', 'Comunicação'),
  ('00', 'Falha de comunicação / alimentação', 'Comunicação entre placas ou alimentação — checar chicotes e tensão', 'Comunicação'),
  ('1', 'Sensor da serpentina externa', 'Falha do sensor da serpentina externa (conector preto)', 'Condensadora'),
  ('2', 'Sensor de descarga (externa)', 'Falha do sensor de descarga (conector branco)', 'Compressor'),
  ('5', 'Proteção do módulo IPM', 'Proteção do módulo de potência integrado — checar IPM/inversor', 'Placa inverter'),
  ('6', 'Proteção de tensão', 'Variação de tensão de alimentação — medir/estabilizar rede', 'Energia'),
  ('7', 'Comunicação interna↔externa', 'Erro de comunicação — checar cabo de interligação', 'Comunicação'),
  ('13', 'Proteção de temperatura do compressor', 'Falha de sensor ou de ventilação', 'Compressor'),
  ('15', 'Sensor de temperatura do compressor', 'Déficit de refrigerante ou sensor (conector vermelho)', 'Compressor'),
  ('36', 'Comunicação interna↔externa (com atraso)', 'Falha de comunicação exibida após atraso — checar cabo de interligação', 'Comunicação')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall 12.000 BTUs Frio (linha Clean)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- PHILCO (plataforma Inverter genérica F1–F5 + modelo ITQFM9W E1–E10) ----------
-- Ligado ao modelo Eco Inverter 12k (linha geral inverter).
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Philco'
CROSS JOIN (VALUES
  ('F1', 'Falha sensor de temperatura (unidade interna)', 'Sensor interno defeituoso ou desconectado', 'Evaporadora'),
  ('F2', 'Falha sensor de temperatura (unidade externa)', 'Sensor externo defeituoso ou desconectado', 'Condensadora'),
  ('F3', 'Falha sensor do evaporador (interna)', 'Sensor do evaporador danificado', 'Evaporadora'),
  ('F4', 'Falha sensor do condensador (externa)', 'Sensor do condensador danificado', 'Condensadora'),
  ('F5', 'Falha sensor de descarga do compressor', 'Sensor de descarga defeituoso', 'Compressor')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 12.000 BTUs Frio (Eco Inverter, R-32)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- KOMECO (linha LX-HX on/off E1–E8 + KOHI 1HX inverter F/P) ----------
-- E1–E8 ligados ao modelo on/off KAC.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Komeco'
CROSS JOIN (VALUES
  ('DF', 'Descongelamento (degelo)', 'Degelo do trocador externo no modo quente — não é falha', 'Condensadora'),
  ('E1', 'Falha sensor de temperatura do condensador', 'Sensor NTC do condensador em curto/aberto ou descalibrado — medir resistência (~5kΩ a 25°C)', 'Condensadora'),
  ('E2', 'Falha sensor de temperatura ambiente', 'Sensor NTC ambiente em curto/aberto ou descalibrado', 'Evaporadora'),
  ('E3', 'Falha sensor de temperatura do evaporador', 'Sensor NTC do evaporador em curto/aberto ou descalibrado', 'Evaporadora'),
  ('E4', 'Falha na unidade externa', 'Temp. externa alta, ventilador externo parado, alta pressão ou compressor com alta corrente', 'Condensadora'),
  ('E5', 'Falha do motor ventilador da unidade interna', 'Placa não identifica sinal do ventilador interno — medir tensão/capacitor', 'Evaporadora'),
  ('E6', 'Falha na placa eletrônica principal', 'Funcionamento irregular da placa principal — conferir tensão e transformador', 'Placa interna'),
  ('E7', 'Comunicação interna↔externa / alta pressão e corrente', 'Sem comunicação entre placas ou pressostatos/corrente elevada', 'Comunicação'),
  ('E8', 'Falha na unidade interna (aumento de pressão)', 'Pressão do fluido elevada — sensor, ventilador, filtro ou carga', 'Evaporadora')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall On/Off Quente/Frio (linha KAC, R-410A)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- KOHI 1HX inverter F/P ligados ao modelo KOHI 1HX.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Komeco'
CROSS JOIN (VALUES
  ('F1', 'Falha de comunicação', 'Sem comunicação interna↔externa — checar interligação; ler 3–16V DC', 'Comunicação'),
  ('F2', 'Falha sensor de temperatura ambiente (interna)', 'Sensor ambiente interno com defeito — medir resistência', 'Evaporadora'),
  ('F3', 'Falha sensor do trocador (interna)', 'Sensor do trocador interno com defeito', 'Evaporadora'),
  ('F4', 'Falha no motor do ventilador (interna)', 'Motor do ventilador interno com defeito ou acionamento', 'Evaporadora'),
  ('F5', 'Falha na PCB módulo inversor (IPM)', 'Módulo inversor/IPM com falha — checar fixação e compressor', 'Placa inverter'),
  ('F6', 'Falha sensor de temperatura ambiente (externa)', 'Sensor ambiente externo com defeito', 'Condensadora'),
  ('F7', 'Falha sensor do trocador (externa)', 'Sensor do trocador externo com defeito', 'Condensadora'),
  ('F9', 'Falha sensor de descarga do compressor', 'Sensor de descarga do compressor com defeito', 'Compressor'),
  ('FC', 'Acionamento anormal do compressor', 'Compressor não aciona corretamente — checar terminais e PCB', 'Compressor'),
  ('P2', 'Superaquecimento do IPM / sobrecorrente', 'IPM superaquecido — checar fixação dissipador e compressor', 'Placa inverter'),
  ('P3', 'Proteção de sobrecorrente', 'Sobrecorrente detectada — checar temp. externa e detecção de corrente', 'Placa inverter'),
  ('P4', 'Proteção do compressor (alta temp. de descarga)', 'Alta temperatura no sensor de descarga — checar pressão e sensor', 'Compressor'),
  ('P5', 'Superaquecimento do topo do compressor', 'Topo do compressor superaquecido — checar pressão e sensor', 'Compressor'),
  ('P6', 'Proteção de temperatura (sucção)', 'Proteção por temperatura de sucção — checar pressão e sensor', 'Sistema'),
  ('P7', 'Proteção de baixa/alta tensão', 'Tensão fora de 150–270V — checar detecção de tensão do IPM', 'Energia'),
  ('P8', 'Proteção de baixa pressão de sucção', 'Pressão de sucção baixa — checar vazamento/carga', 'Sistema'),
  ('P9', 'Proteção de alta pressão de descarga', 'Pressão de descarga alta — checar vazamento/carga', 'Sistema'),
  ('PA', 'Proteção de alta temp. do trocador (externa)', 'Trocador externo superaquecido — limpar e checar instalação/sensor', 'Condensadora'),
  ('PC', 'Proteção de temp. ambiente excessiva (externa)', 'Temp. ambiente externa muito alta — checar fontes de calor e sensor', 'Condensadora')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter Quente/Frio (KOHI 1HX, R-410A)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- AGRATTO (família ICS/ICST NEO Inverter — alta/média-alta) ----------
-- Ligado ao modelo NEO Inverter 9k.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Agratto'
CROSS JOIN (VALUES
  ('E1', 'Sensor de temperatura ambiente', 'Falha no sensor de temperatura do ambiente — substituir sensor', 'Evaporadora'),
  ('E2', 'Sensor da bobina externa', 'Falha do sensor de temperatura da serpentina externa', 'Condensadora'),
  ('E3', 'Sensor da bobina interna', 'Falha do sensor de temperatura da serpentina interna', 'Evaporadora'),
  ('E4', 'Motor PG da unidade interna', 'Falha do feedback do motor PG interno', 'Evaporadora'),
  ('E5', 'Comunicação interna↔externa', 'Falha de comunicação entre as unidades — checar cabo/placas', 'Comunicação'),
  ('F0', 'Motor CC da unidade externa', 'Falha de retorno do motor CC externo', 'Condensadora'),
  ('F1', 'Módulo IPM', 'Falha modular IPM — verificar/substituir placa inverter', 'Placa inverter'),
  ('F2', 'Módulo PFC', 'Falha modular PFC — verificar/substituir placa inverter', 'Placa inverter'),
  ('F3', 'Compressor', 'Falha na operação do compressor', 'Compressor'),
  ('F4', 'Sensor de descarga (externa)', 'Falha do sensor de temperatura de descarga', 'Compressor'),
  ('F5', 'Topo do compressor', 'Proteção da tampa superior do compressor', 'Compressor'),
  ('F6', 'Sensor ambiente externo', 'Falha do sensor de temperatura ambiente externo', 'Condensadora'),
  ('F7', 'Tensão', 'Proteção contra sub/sobretensão — verificar rede elétrica', 'Energia'),
  ('F9', 'EEPROM da unidade externa', 'Falha na EEPROM da unidade externa', 'Placa inverter'),
  ('FA', 'Sensor de sucção', 'Falha no sensor de temperatura de sucção', 'Sistema'),
  ('P4', 'Sobrecarga', 'Proteção contra sobrecarga — verificar corrente/carga', 'Compressor'),
  ('P5', 'Temperatura de descarga', 'Proteção de temperatura de descarga — checar carga/compressor', 'Compressor'),
  ('P6', 'Alta temperatura', 'Proteção de alta temperatura — verificar troca térmica', 'Sistema'),
  ('P7', 'Congelamento', 'Proteção contra congelamento — checar gás/fluxo de ar', 'Sistema')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 9.000 BTUs Frio (NEO Inverter)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- CARRIER = tabela Midea global (inverter) — onde o .md confirma ----------
-- Ligado ao modelo X-Power 9k.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Carrier'
CROSS JOIN (VALUES
  ('E0', 'Erro de EEPROM (interna)', 'Erro de parâmetro/EEPROM da unidade interna', 'Placa interna'),
  ('E1', 'Comunicação interna↔externa', 'Falha de comunicação evaporadora↔condensadora (EL01 em alguns displays)', 'Comunicação'),
  ('E2', 'Sinal de cruzamento por zero', 'Zero-crossing — sinal de tensão da rede ou placa', 'Energia'),
  ('E3', 'Ventilador interno fora de controle', 'Motor do ventilador interno sem leitura de RPM', 'Evaporadora'),
  ('EC', 'Fuga de gás refrigerante', 'Carga baixa ou vazamento detectado', 'Sistema'),
  ('F1', 'Sensor externo (ambiente T4)', 'Termistor de ar externo aberto/curto', 'Condensadora'),
  ('F2', 'Sensor da serpentina condensadora (T3)', 'Termistor da condensadora aberto/curto', 'Condensadora'),
  ('F3', 'Sensor de descarga (TP)', 'Termistor de descarga do compressor aberto/curto', 'Compressor'),
  ('F4', 'EEPROM da unidade externa', 'Erro de parâmetro/EEPROM da placa externa', 'Placa inverter'),
  ('P0', 'Módulo IPM / IGBT', 'Falha/sobrecorrente do módulo de potência inverter', 'Placa inverter'),
  ('P1', 'Sub/sobretensão', 'Tensão da rede fora de faixa', 'Energia'),
  ('P4', 'Drive do compressor inverter', 'Falha de partida/posição do compressor', 'Compressor')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 9.000 BTUs Frio (X-Power)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- SPRINGER = mesma tabela Midea global (inverter) ----------
-- Ligado ao modelo AirVolution Connect 12k.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Springer'
CROSS JOIN (VALUES
  ('E0', 'Erro de EEPROM (interna)', 'Erro de parâmetro/EEPROM da unidade interna', 'Placa interna'),
  ('E1', 'Comunicação interna↔externa', 'Falha de comunicação evaporadora↔condensadora (EL01 em alguns displays)', 'Comunicação'),
  ('E2', 'Sinal de cruzamento por zero', 'Zero-crossing — sinal de tensão da rede ou placa', 'Energia'),
  ('E3', 'Ventilador interno fora de controle', 'Motor do ventilador interno sem leitura de RPM', 'Evaporadora'),
  ('EC', 'Fuga de gás refrigerante', 'Carga baixa ou vazamento detectado', 'Sistema'),
  ('F1', 'Sensor externo (ambiente T4)', 'Termistor de ar externo aberto/curto', 'Condensadora'),
  ('F2', 'Sensor da serpentina condensadora (T3)', 'Termistor da condensadora aberto/curto', 'Condensadora'),
  ('F3', 'Sensor de descarga (TP)', 'Termistor de descarga do compressor aberto/curto', 'Compressor'),
  ('F4', 'EEPROM da unidade externa', 'Erro de parâmetro/EEPROM da placa externa', 'Placa inverter'),
  ('P0', 'Módulo IPM / IGBT', 'Falha/sobrecorrente do módulo de potência inverter', 'Placa inverter'),
  ('P1', 'Sub/sobretensão', 'Tensão da rede fora de faixa', 'Energia'),
  ('P4', 'Drive do compressor inverter', 'Falha de partida/posição do compressor', 'Compressor')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 12.000 BTUs Frio (AirVolution Connect, R-32)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- TCL (T-Pro 2.0 — E-series falha / P-series proteção / CL) ----------
-- Ligado ao modelo T-Pro 2.0 12k.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'TCL'
CROSS JOIN (VALUES
  ('E0', 'Falha de comunicação interna/externa', 'Ausência de sinal entre placas — conferir cabos de interligação', 'Comunicação'),
  ('E1', 'Sensor de temperatura ambiente', 'Termistor de ar interno defeituoso/desconectado', 'Evaporadora'),
  ('E2', 'Sensor da serpentina (evaporadora)', 'Sensor da serpentina interna rompido — afeta anticongelamento', 'Evaporadora'),
  ('E3', 'Sensor de temperatura da condensadora', 'Termistor da serpentina externa falhou', 'Condensadora'),
  ('E4', 'Falha geral do sistema', 'Funcionamento anormal do circuito de refrigeração — checar carga R-32', 'Sistema'),
  ('E5', 'Configuração de modelo / EEPROM', 'Placa não reconhece configuração ou memória corrompida', 'Placa interna'),
  ('E6', 'Falha do motor do ventilador interno', 'Motor/turbina não responde — bloqueio, capacitor ou driver', 'Evaporadora'),
  ('E7', 'Sensor de temperatura externa', 'Termistor de ar externo falhou', 'Condensadora'),
  ('E8', 'Sensor de descarga do compressor', 'Termistor da linha de descarga falhou', 'Compressor'),
  ('E9', 'Falha do módulo de potência (IPM)', 'Módulo inversor do compressor falhou', 'Placa inverter'),
  ('EA', 'Falha do sensor de corrente', 'Sensor de corrente do compressor com defeito', 'Placa inverter'),
  ('EC', 'Falha de comunicação da condensadora', 'Falha entre placa-fonte e módulo IPM externo', 'Comunicação'),
  ('EE', 'Falha de EEPROM (firmware)', 'Erro de leitura/corrupção da memória de parâmetros', 'Placa interna'),
  ('EF', 'Falha do motor do ventilador externo (DC)', 'Ventilador da condensadora não funciona', 'Condensadora'),
  ('EH', 'Sensor de sucção do compressor', 'Termistor de retorno (entrada do compressor) falhou', 'Sistema'),
  ('EP', 'Atuação do termostato do topo do compressor', 'Pressostato/chave bimetálica do topo atuou por superaquecimento', 'Compressor'),
  ('EU', 'Falha do sensor de tensão', 'Sensor de tensão de entrada ou placa-fonte com defeito', 'Energia'),
  ('P1', 'Proteção de sub/sobretensão', 'Tensão fora de 198–242V (220V)', 'Energia'),
  ('P2', 'Proteção de sobrecorrente', 'Corrente acima do limite — motor travado, capacitor ou IPM', 'Compressor'),
  ('P4', 'Proteção de superaquecimento de descarga', 'Temperatura do gás de saída acima do limite', 'Compressor'),
  ('P5', 'Proteção de subresfriamento (frio)', 'Serpentina interna abaixo do mínimo — filtro sujo/fluxo bloqueado', 'Evaporadora'),
  ('P6', 'Proteção superaquecimento da serpentina externa', 'Serpentina da condensadora acima do limite', 'Condensadora'),
  ('P7', 'Proteção de superaquecimento (modo quente)', 'Serpentina interna excessiva — fluxo bloqueado', 'Evaporadora'),
  ('P9', 'Proteção do drive inverter (software)', 'Inverter detectou condição anormal — aguardar 3 min e religar', 'Placa inverter'),
  ('CL', 'Alerta de limpeza do filtro', 'Alerta de manutenção após 500h — não é falha; limpar e religar', 'Evaporadora')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 12.000 BTUs Frio (T-Pro 2.0, R-32)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- HITACHI (Família B = proteção, default do .md; só MÉDIA) ----------
-- Ligado ao modelo airHome 600 9k. E4/E7/E8 (conflito A/B = BAIXA) ficaram fora.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Hitachi'
CROSS JOIN (VALUES
  ('E0', 'Falha de comunicação interna↔externa', 'Perda de comunicação entre evaporadora e condensadora', 'Comunicação'),
  ('E1', 'Proteção de alta pressão do compressor', 'Pressão de descarga alta — checar condensação, sujeira e carga', 'Compressor'),
  ('E2', 'Proteção anti-congelamento', 'Serpentina interna congelando — baixo fluxo de ar, filtro sujo, baixa carga', 'Evaporadora'),
  ('E3', 'Proteção de baixa pressão / falta de gás', 'Pressão de sucção baixa ou pouco refrigerante — checar vazamento/carga', 'Sistema'),
  ('E5', 'Erro de inverter / sobrecorrente', 'Proteção de sobrecorrente ou erro do drive inverter', 'Placa inverter'),
  ('E6', 'Falha de comunicação', 'Falha de transmissão interna↔externa — cabeamento/placa', 'Comunicação'),
  ('01', 'Bóia / nível de água no dreno', 'Nível alto na bandeja de dreno — dreno entupido/bomba', 'Sistema'),
  ('03', 'Anomalia interna↔externa (comunicação/fiação)', 'Fios soltos, terminal frouxo ou fusível queimado', 'Comunicação'),
  ('CL', 'Aviso de manutenção (não é erro)', 'Alerta de limpeza do filtro após ~500h — limpar e resetar', 'Evaporadora')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 9.000 BTUs Frio (airHome 600, R-32)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ---------- ELGIN (Eco Plus II + Eco Life Inverter — ALTA na origem) ----------
-- Eco Plus II ligado ao modelo Hi-Wall 12k.
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Elgin'
CROSS JOIN (VALUES
  ('E1', 'Falha no EEPROM (interna)', 'Defeito na placa/memória da unidade interna', 'Placa interna'),
  ('E2', 'Erro de sinal do cruzamento zero', 'Problema de detecção de sinal elétrico', 'Energia'),
  ('E3', 'Mau funcionamento do motor ventilador interno', 'Motor/ventilador da interna travado ou em falha', 'Evaporadora'),
  ('E5', 'Falha sensor de temperatura ambiente interno', 'Termistor de ambiente defeituoso/desconectado', 'Evaporadora'),
  ('E6', 'Falha sensor de temperatura do evaporador', 'Termistor do evaporador defeituoso/desconectado', 'Evaporadora'),
  ('E7', 'Falha sensor de temperatura externo', 'Sensor da externa defeituoso/desconectado', 'Condensadora'),
  ('E8', 'Mau funcionamento do motor ventilador externo', 'Motor/ventilador da externa travado ou em falha', 'Condensadora'),
  ('E9', 'Falha de comunicação entre unidades', 'Cabo de comunicação/placa interna↔externa', 'Comunicação'),
  ('EC', 'Detecção de vazamento de refrigerante', 'Perda de carga de gás no sistema', 'Sistema'),
  ('P6', 'Proteção de pressão', 'Proteção contra alta/baixa pressão — sobrecarga/restrição', 'Compressor')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Hi-Wall Inverter 12.000 BTUs Frio (Eco Inverter II Wi-Fi, R-32)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);
