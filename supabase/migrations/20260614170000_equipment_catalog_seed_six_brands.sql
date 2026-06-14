-- Seed do catálogo GLOBAL de equipamentos (Auctus): 6 marcas novas.
-- Samsung, LG, Daikin, Consul, Electrolux, Fujitsu.
--
-- Cada marca recebe: a brand (name/slug/logo_url/sort sequencial continuando
-- de Gree=1, Midea=2), 1 modelo principal "linha geral" (categoria Split Hi-Wall)
-- com manual_url quando houver, e os códigos de erro de fabricante ligados a
-- esse modelo principal.
--
-- FONTE PÚBLICA: pesquisa cruzada (>=2 fontes) em manuais de serviço / tabelas
-- de código de erro públicas dos fabricantes e centrais de assistência técnica.
-- description = title quando não há descrição própria. solution = NULL.
-- image_url dos modelos = NULL (sem foto confiável).
--
-- ⚠️ NÃO toca em public.equipment_categories (tabela MULTI-TENANT de cliente).
--    O catálogo usa public.equipment_model_categories (GLOBAL).
--
-- Idempotente: marcas/categoria por nome (WHERE NOT EXISTS), modelos por
-- (brand_id,name), códigos por (model_id,code). Rodar 2x não duplica.
-- IDs capturados via subselect/CTE — nenhum UUID hardcoded.

-- ============================================================
-- 0) CATEGORIA GLOBAL (garantia — deve já existir)
-- ============================================================
INSERT INTO public.equipment_model_categories (name)
SELECT 'Split Hi-Wall'
WHERE NOT EXISTS (
  SELECT 1 FROM public.equipment_model_categories WHERE name = 'Split Hi-Wall'
);

-- ============================================================
-- 1) MARCAS (sort 3..8, continuando de Gree=1 / Midea=2)
-- ============================================================
INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Samsung', 'samsung', 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Samsung_wordmark.svg', 3
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Samsung');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'LG', 'lg', 'https://upload.wikimedia.org/wikipedia/commons/a/a2/LG_logo_%282023%29.svg', 4
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'LG');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Daikin', 'daikin', 'https://logodownload.org/wp-content/uploads/2021/01/daikin-logo.png', 5
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Daikin');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Consul', 'consul', 'https://logodownload.org/wp-content/uploads/2014/04/consul-logo.png', 6
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Consul');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Electrolux', 'electrolux', 'https://companieslogo.com/img/orig/ELUX-A.ST_BIG-cda76053.svg?t=1720244491', 7
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Electrolux');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Fujitsu', 'fujitsu', 'https://upload.wikimedia.org/wikipedia/commons/5/53/Fujitsu-Logo.svg', 8
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Fujitsu');

-- ============================================================
-- 2) MODELOS PRINCIPAIS (brand_id e category_id via subselect)
--    image_url NULL; manual_url quando houver.
-- ============================================================
INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, 'Split Inverter (WindFree / Digital Inverter)', NULL, NULL,
  'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_BR&OriginYN=N&ModelType=N&ModelName=AR12CVFAMWKNAZ&CttFileID=9217744&CDCttType=UM&VPath=UM%2F202306%2F20230608055129911%2FDB68-12033A-00_IB_23Y_AR9500T_WindFree_Wi-Fi_SEDA_AZ_PT_10-03-2023-D02.pdf'
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Samsung' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = 'Split Inverter (WindFree / Digital Inverter)');

INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, 'Split Dual Inverter (linha geral)', NULL, NULL,
  'https://www.lg.com/br/support/products/documents/LSUH2423RM1.pdf'
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'LG' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = 'Split Dual Inverter (linha geral)');

INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, 'EcoSwing / SkyAir (linha geral)', NULL, NULL,
  'https://www.leverosintegra.com.br/download/manuais/Daikin/manual-de-operacao-daikin-ecoswing-gold.pdf'
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Daikin' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = 'EcoSwing / SkyAir (linha geral)');

INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, 'Bem Estar / Maxi Inverter (linha geral)', NULL, NULL,
  'https://cdn2.centralar.com.br/centralar/mds/manuais/consul/inverter/2162/ar-condicionado-split-hw-inverter-consul-9000-btus-frio-220v-monofasico-cbf09ebbna-2162-manual.pdf'
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Consul' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = 'Bem Estar / Maxi Inverter (linha geral)');

INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, 'Color Adapt / Inverter (linha geral)', NULL, NULL,
  'https://www.electrolux-ui.com/DocumentDownLoad.aspx?DocURL=2018%5CA05%5C659201umPT.pdf'
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Electrolux' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = 'Color Adapt / Inverter (linha geral)');

INSERT INTO public.equipment_models (brand_id, category_id, name, code, image_url, manual_url)
SELECT b.id, c.id, 'Airstage Inverter (linha geral)', NULL, NULL,
  'https://www.leverosintegra.com.br/download/manuais/Fujitsu/manual-de-operacao-fujitsu-hw-airstage.pdf'
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Fujitsu' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_models m WHERE m.brand_id = b.id AND m.name = 'Airstage Inverter (linha geral)');

-- ============================================================
-- 3) CÓDIGOS DE ERRO — SAMSUNG
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Samsung'
CROSS JOIN (VALUES
  ('E101', 'Erro de comunicação interna↔externa', 'Cabo de interligação, placa interna/externa ou ventilador externo sem rotação', 'Comunicação'),
  ('E121', 'Sensor de temperatura ambiente (interna)', 'Termistor de ambiente aberto/curto — trocar', 'Evaporadora'),
  ('E122', 'Sensor da serpentina interna', 'Termistor da serpentina interna aberto/curto', 'Evaporadora'),
  ('E154', 'Erro do ventilador interno', 'Motor do fan interno, capacitor ou tensão fora da faixa', 'Evaporadora'),
  ('E162', 'Erro de EEPROM (placa interna)', 'Memória da placa interna corrompida — trocar placa', 'Placa interna'),
  ('E203', 'Comunicação inverter↔micom', 'Falha entre micom do inverter e principal na condensadora', 'Placa inverter'),
  ('E221', 'Sensor de temperatura externa', 'Termistor externo aberto/curto', 'Condensadora'),
  ('E231', 'Sensor do condensador', 'Termistor do condensador aberto/curto', 'Condensadora'),
  ('E251', 'Sensor de descarga', 'Termistor de descarga do compressor aberto/curto', 'Compressor'),
  ('E416', 'Sobretemperatura de descarga', 'Carga de gás baixa, restrição ou EEV', 'Compressor'),
  ('E422', 'EEV / válvula fechada', 'Válvula de expansão eletrônica travada ou registros fechados', 'Sistema'),
  ('E458', 'Erro do ventilador externo', 'Motor do fan da condensadora, capacitor ou placa', 'Condensadora'),
  ('E461', 'Falha de partida do compressor', 'Compressor travado, baixa tensão ou placa inverter', 'Compressor'),
  ('E462', 'Sobrecorrente de entrada (AC)', 'Sobrecarga, compressor ou tensão de rede', 'Inverter'),
  ('E464', 'Sobrecorrente do IPM', 'Módulo de potência em sobrecorrente', 'Placa inverter'),
  ('E466', 'Tensão do barramento DC', 'DC-link fora de faixa (tensão de rede/capacitores)', 'Placa inverter'),
  ('E500', 'Sobretemperatura do dissipador', 'Heatsink superaquecido — ventilação/IPM/fan externo', 'Placa inverter'),
  ('E554', 'Vazamento de gás', 'Falta de refrigerante detectada — checar vazamento/carga', 'Sistema'),
  ('E1/21', 'Sensor de ambiente', 'Termistor de ambiente', 'Evaporadora'),
  ('E1/22', 'Sensor da serpentina', 'Termistor da serpentina', 'Evaporadora'),
  ('E1/54', 'Ventilador/capacitor', 'Fan não gira', 'Evaporadora'),
  ('E1/63', 'EEPROM', 'Placa de controle', 'Placa interna')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Inverter (WindFree / Digital Inverter)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ============================================================
-- 4) CÓDIGOS DE ERRO — LG
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, NULLIF(v.component, '-')
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'LG'
CROSS JOIN (VALUES
  ('CH01', 'Sensor de temperatura ambiente interno', 'Termistor de ar interno aberto/curto', 'Evaporadora'),
  ('CH02', 'Sensor de tubo/externo', 'Termistor de tubulação ou externo aberto/curto', 'Sistema'),
  ('CH04', 'Sensor do dissipador ou boia de dreno', 'Sensor heat-sink aberto/curto OU dreno entupido', 'Sistema'),
  ('CH05', 'Comunicação interna↔externa', 'Sem energia na externa, fiação de interligação ou placa; reiniciar disjuntor 5 min', 'Comunicação'),
  ('CH06', 'Pico de corrente DC (inverter)', 'Sobrecarga elétrica; placa inverter/IPM', 'Placa inverter'),
  ('CH07', 'Modos conflitantes (multi) / sobrecorrente do compressor', 'Multi: igualar todas no mesmo modo. Single: checar compressor', 'Compressor'),
  ('CH10', 'Trava do fan BLDC / descarga alta', 'Fan interno travado ou temperatura de descarga muito alta', 'Evaporadora'),
  ('CH21', 'Sobrecorrente do compressor / IPM', 'Compressor em curto ou placa inverter/IPM', 'Placa inverter'),
  ('CH23', 'Tensão do barramento DC baixa', 'Fonte/capacitor do barramento', 'Placa inverter'),
  ('CH26', 'Posição do compressor DC', 'Compressor mal conectado/agarrado ou placa', 'Compressor'),
  ('CH32', 'Temperatura de descarga muito alta', 'Pouca carga de gás ou fluxo de ar bloqueado (filtro/serpentina)', 'Sistema'),
  ('CH34', 'Alta pressão / sobreaquecimento', 'Serpentina da condensadora suja ou fluxo bloqueado', 'Condensadora'),
  ('CH41', 'Sensor de descarga (inverter)', 'Termistor de descarga aberto/curto', 'Compressor'),
  ('CH44', 'Sensor de ar externo', 'Termistor de ar externo aberto/curto', 'Condensadora'),
  ('CH45', 'Sensor do condensador', 'Termistor do condensador aberto/curto', 'Condensadora'),
  ('CH46', 'Sensor de sucção', 'Termistor da linha de sucção aberto/curto', 'Sistema'),
  ('CH60', 'Erro de checksum da EEPROM', 'Firmware corrompido — placa', 'Placa interna'),
  ('CH62', 'Temperatura do dissipador alta', 'Eletrônica superaquecida — ventilação da placa', 'Placa inverter'),
  ('CH67', 'Trava do fan BLDC externo', 'Motor do fan externo agarrado ou sensor', 'Condensadora'),
  ('CL', 'Trava de segurança (Child Lock)', 'Não é falha — Timer+Min por 3s pra alternar', '-')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Split Dual Inverter (linha geral)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ============================================================
-- 5) CÓDIGOS DE ERRO — DAIKIN
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Daikin'
CROSS JOIN (VALUES
  ('A1', 'Anomalia na placa interna', 'Defeito ou ruído elétrico na PCB interna', 'Placa interna'),
  ('A3', 'Falha no sistema de dreno', 'Tubo entupido, bomba ou boia', 'Evaporadora'),
  ('A5', 'Anticongelamento / alta pressão', 'Filtro sujo ou termistor do trocador', 'Evaporadora'),
  ('A6', 'Motor do ventilador interno', 'Motor travado/sobrecarregado ou PCB', 'Evaporadora'),
  ('A9', 'Válvula de expansão eletrônica', 'Bobina ou conector', 'Sistema'),
  ('C4', 'Termistor do tubo de líquido', 'Conector ou sensor', 'Evaporadora'),
  ('C5', 'Termistor do tubo de gás', 'Conector ou sensor', 'Evaporadora'),
  ('C9', 'Termistor de ar de sucção (ambiente)', 'Conector ou sensor', 'Evaporadora'),
  ('E1', 'Defeito na placa externa', 'Ruído ou falha de PCB', 'Condensadora'),
  ('E3', 'Pressostato de alta pressão', 'Trocador sujo, tubo entupido ou pressostato', 'Condensadora'),
  ('E4', 'Pressostato de baixa pressão', 'Tubo entupido, falta de gás ou conector', 'Condensadora'),
  ('E5', 'Bloqueio/superaquecimento do compressor inverter', 'Falta de refrigerante ou válvula', 'Compressor'),
  ('E6', 'Falha de partida/sobrecorrente do compressor', 'Válvula fechada, compressor travado ou fiação', 'Compressor'),
  ('E7', 'Motor do ventilador externo', 'Conector, motor ou driver', 'Condensadora'),
  ('E8', 'Sobrecorrente do compressor inverter', 'Compressor, PCB ou capacitor', 'Placa inverter'),
  ('EA', 'Válvula de 4 vias (reversora)', 'Válvula, PCB ou falta de gás', 'Sistema'),
  ('F3', 'Temperatura do tubo de descarga', 'Falta de gás, tubulação ou termistor', 'Compressor'),
  ('F6', 'Alta pressão / excesso de gás', 'Ventilador, EEV, termistor ou excesso de refrigerante', 'Condensadora'),
  ('H6', 'Sensor de posição do compressor', 'Mau contato, compressor ou PCB', 'Compressor'),
  ('H8', 'Sistema de entrada (CT) do compressor', 'Transistor, reator, fiação ou PCB', 'Placa inverter'),
  ('H9', 'Termistor de ar externo', 'Conector ou sensor', 'Condensadora'),
  ('J3', 'Termistor do tubo de descarga', 'Conector, PCB ou termistor', 'Compressor'),
  ('J6', 'Termistor do trocador de calor', 'Conector, PCB ou termistor', 'Condensadora'),
  ('L4', 'Temperatura do dissipador do inverter', 'Aleta suja, termistor ou componente', 'Placa inverter'),
  ('L5', 'Sobrecorrente instantânea do inverter', 'Válvula de bloqueio fechada ou compressor', 'Placa inverter'),
  ('P4', 'Sensor de temperatura do dissipador', 'Termistor, fiação ou PCB', 'Placa inverter'),
  ('U0', 'Falta de refrigerante', 'Pouco gás, válvula fechada ou tubo entupido', 'Sistema'),
  ('U2', 'Tensão / queda de energia', 'Tensão fora de faixa ou mau contato', 'Energia'),
  ('U4', 'Transmissão interna↔externa', 'Fiação defeituosa, ruído ou PCB', 'Comunicação'),
  ('UA', 'Combinação imprópria interna/externa', 'Excesso de unidades, config ou alimentação', 'Sistema')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'EcoSwing / SkyAir (linha geral)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ============================================================
-- 6) CÓDIGOS DE ERRO — CONSUL
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Consul'
CROSS JOIN (VALUES
  ('E2', 'Sensor da serpentina externa', 'Só quente/frio; ventilador externo desliga com trocador quente', 'Condensadora'),
  ('E4', 'Motor do ventilador interno', 'Turbina abaixo de 200 rpm — motor não gira ou placa', 'Evaporadora'),
  ('E05', 'Proteção do módulo IPM', 'Inversora/compressor em proteção', 'Placa inverter'),
  ('E06', 'Tensão de alimentação', 'Variação/tensão de entrada fora da especificação', 'Energia'),
  ('E42', 'Proteção de subresfriamento', 'Excesso de subresfriamento', 'Sistema'),
  ('E43', 'Proteção de superaquecimento', 'Superaquecimento', 'Sistema'),
  ('EA', 'Comunicação interface↔placa interna', 'Falha entre placa do display e placa da interna', 'Comunicação')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Bem Estar / Maxi Inverter (linha geral)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ============================================================
-- 7) CÓDIGOS DE ERRO — ELECTROLUX
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Electrolux'
CROSS JOIN (VALUES
  ('F1', 'Sensor de temperatura ambiente', 'Sensor mal encaixado ou em curto', 'Evaporadora'),
  ('F2', 'Sensor do evaporador', 'Sensor da serpentina interna mal encaixado ou em curto', 'Evaporadora'),
  ('H6', 'Motor do ventilador (evaporadora)', 'Motor da ventoinha interna travado/defeito', 'Evaporadora'),
  ('C5', 'Tampa do jumper', 'Jumper ausente/mau contato na placa', 'Placa interna'),
  ('U8', 'Motor do ventilador (zero-crossing)', 'Falha do motor detectada pelo sistema', 'Evaporadora'),
  ('E5', 'Proteção elétrica (sobrecorrente/baixa tensão)', 'Varia por modelo: sobrecorrente (18/22k) ou baixa tensão (9/12k)', 'Energia')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Color Adapt / Inverter (linha geral)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);

-- ============================================================
-- 8) CÓDIGOS DE ERRO — FUJITSU
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.title, v.diagnosis, NULL, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Fujitsu'
CROSS JOIN (VALUES
  ('11', 'Comunicação serial interna↔externa', 'Fiação painel↔condensadora↔evaporadora; tensões', 'Comunicação'),
  ('12', 'Comunicação do controle com fio', 'Conexão do terminal do controle ou cabo rompido', 'Comunicação'),
  ('41', 'Termistor de ambiente (interna)', 'Aberto/curto — checar resistência', 'Evaporadora'),
  ('42', 'Termistor da serpentina (interna)', 'Aberto/curto', 'Evaporadora'),
  ('51', 'Motor do ventilador interno', 'Rotação abaixo de 1/3 do alvo — checar fan/motor', 'Evaporadora'),
  ('62', 'Placa principal da externa', 'Falha de acesso à EEPROM — reset/checar tensão', 'Placa externa'),
  ('63', 'Erro do inverter', 'Erro da PCB do inverter/transistor — checar conectores', 'Placa inverter'),
  ('64', 'Filtro ativo / PFC', 'Tensão DC do inverter fora de faixa', 'Placa inverter'),
  ('65', 'Erro do IPM', 'Corrente anormal no IPM ou dissipação bloqueada', 'Placa inverter'),
  ('71', 'Termistor de descarga', 'Aberto/curto', 'Compressor'),
  ('72', 'Termistor do compressor', 'Aberto/curto', 'Compressor'),
  ('73', 'Termistor do trocador (tubo)', 'Aberto/curto', 'Condensadora'),
  ('74', 'Termistor da externa (ambiente)', 'Aberto/curto', 'Condensadora'),
  ('77', 'Termistor do dissipador (heat sink)', 'Falha da PCB inverter', 'Placa inverter'),
  ('84', 'Sensor de corrente', 'Lê 0 A com compressor rodando — conector solto', 'Placa inverter'),
  ('86', 'Pressostato', 'Aberto por mais de 10s — reset 3-5 min, checar pressostato', 'Sistema'),
  ('94', 'Sobrecorrente', 'Proteção 10x seguidas — trocador entupido, fan externo ou recirculação', 'Condensadora'),
  ('95', 'Controle do compressor (posição do rotor)', 'Rotor fora de fase — checar conexão/cabo, testar compressor', 'Compressor'),
  ('97', 'Motor do ventilador externo', 'Fan abaixo de 100 rpm — motor travado/enrolamentos', 'Condensadora'),
  ('99', 'Válvula de 4 vias', 'Δ temperatura fora da regra — bobina/válvula 4 vias', 'Sistema'),
  ('A1', 'Temperatura de descarga alta', '>=110°C — válvula 3 vias, EEV, fan/trocador, carga de gás', 'Compressor'),
  ('A3', 'Temperatura do compressor alta', '>=108°C — 3 vias, EEV, fan/trocador, carga de gás', 'Compressor'),
  ('A5', 'Baixa pressão', 'Sucção muito baixa — 3 vias fechada, filtro entupido, EEV ou carga de gás', 'Sistema')
) AS v(code, title, diagnosis, component)
WHERE m.name = 'Airstage Inverter (linha geral)'
  AND NOT EXISTS (SELECT 1 FROM public.equipment_error_codes ec WHERE ec.model_id = m.id AND ec.code = v.code);
