-- Seed MÍNIMO VALIDADO do catálogo GLOBAL de equipamentos (Auctus).
-- Insere 2 marcas reais (Gree, Midea), 1 categoria (Split Hi-Wall),
-- 1 modelo por marca e seus códigos de erro de fabricante.
--
-- FONTE PÚBLICA dos códigos de erro:
--   - Manuais de serviço / tabelas de código de erro públicas dos fabricantes
--     Gree e Springer Midea (split inverter hi-wall residencial).
--   - Códigos E/H/P/F/L conforme documentação de assistência técnica divulgada
--     publicamente pelos fabricantes.
--
-- ⚠️ NÃO toca em public.equipment_categories (tabela MULTI-TENANT de cliente).
--    O catálogo usa public.equipment_model_categories (GLOBAL).
--
-- Idempotente: marcas/categoria por nome (WHERE NOT EXISTS), modelos por
-- (brand_id,name), códigos por (model_id,code). Rodar 2x não duplica.
-- IDs capturados via subselect/CTE — nenhum UUID hardcoded.
-- logo_url/image_url/manual_url ficam NULL (sem URL confirmada).

-- ============================================================
-- 1) CATEGORIA GLOBAL
-- ============================================================
INSERT INTO public.equipment_model_categories (name)
SELECT 'Split Hi-Wall'
WHERE NOT EXISTS (
  SELECT 1 FROM public.equipment_model_categories WHERE name = 'Split Hi-Wall'
);

-- ============================================================
-- 2) MARCAS
-- ============================================================
INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Gree', 'gree', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Gree');

INSERT INTO public.equipment_brands (name, slug, logo_url, sort)
SELECT 'Midea', 'midea', NULL, 2
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_brands WHERE name = 'Midea');

-- ============================================================
-- 3) MODELOS (brand_id e category_id via subselect)
-- ============================================================
INSERT INTO public.equipment_models (brand_id, category_id, name, code)
SELECT b.id, c.id, 'Split Hi-Wall Inverter', NULL
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Gree' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (
    SELECT 1 FROM public.equipment_models m
    WHERE m.brand_id = b.id AND m.name = 'Split Hi-Wall Inverter'
  );

INSERT INTO public.equipment_models (brand_id, category_id, name, code)
SELECT b.id, c.id, 'Split Inverter (Springer Midea)', NULL
FROM public.equipment_brands b
CROSS JOIN public.equipment_model_categories c
WHERE b.name = 'Midea' AND c.name = 'Split Hi-Wall'
  AND NOT EXISTS (
    SELECT 1 FROM public.equipment_models m
    WHERE m.brand_id = b.id AND m.name = 'Split Inverter (Springer Midea)'
  );

-- ============================================================
-- 4) CÓDIGOS DE ERRO — GREE "Split Hi-Wall Inverter"
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.description, v.diagnosis, v.solution, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Gree'
CROSS JOIN (VALUES
  ('E1', 'Proteção de alta pressão',
   'Sistema entrou em proteção por alta pressão de descarga.',
   'Condensadora suja, ventilação obstruída ou excesso de carga de gás.',
   'Limpar a condensadora, verificar ventilação e conferir a carga de gás.',
   'Sistema/Condensadora'),
  ('E2', 'Proteção anticongelamento da evaporadora',
   'Evaporadora congelando, proteção ativada.',
   'Filtro/serpentina sujos, baixa vazão de ar ou carga de gás baixa.',
   'Limpar filtro e serpentina; verificar carga de gás.',
   'Evaporadora'),
  ('E3', 'Proteção de baixa pressão / falta de gás',
   'Baixa pressão no sistema.',
   'Vazamento de refrigerante ou sistema bloqueado.',
   'Localizar e corrigir vazamento; recarregar o gás.',
   'Sistema'),
  ('E4', 'Alta temperatura de descarga do compressor',
   'Temperatura de descarga acima do limite.',
   'Carga de gás baixa ou problema no compressor.',
   'Verificar carga de gás e condição do compressor.',
   'Compressor'),
  ('E5', 'Sobrecorrente / tensão elétrica anormal',
   'Proteção elétrica ativada.',
   'Tensão fora da faixa ou sobrecarga elétrica.',
   'Reiniciar o aparelho; verificar a rede elétrica. Se persistir, acionar técnico certificado.',
   'Elétrica'),
  ('H6', 'Sem resposta do motor do ventilador interno',
   'Unidade interna não detecta o motor do ventilador.',
   'Motor do ventilador ou placa com defeito.',
   'Verificar motor do ventilador e conexões; acionar técnico.',
   'Evaporadora')
) AS v(code, title, description, diagnosis, solution, component)
WHERE m.name = 'Split Hi-Wall Inverter'
  AND NOT EXISTS (
    SELECT 1 FROM public.equipment_error_codes ec
    WHERE ec.model_id = m.id AND ec.code = v.code
  );

-- ============================================================
-- 5) CÓDIGOS DE ERRO — MIDEA "Split Inverter (Springer Midea)"
-- ============================================================
INSERT INTO public.equipment_error_codes (model_id, code, title, description, diagnosis, solution, component)
SELECT m.id, v.code, v.title, v.description, v.diagnosis, v.solution, v.component
FROM public.equipment_models m
JOIN public.equipment_brands b ON b.id = m.brand_id AND b.name = 'Midea'
CROSS JOIN (VALUES
  ('E1', 'Erro de comunicação evaporadora-condensadora',
   'Falha de comunicação entre as unidades.',
   'Cabeamento de interligação ou placa.',
   'Verificar a fiação de interligação entre as unidades.',
   'Comunicação'),
  ('E5', 'Proteção por sobrecorrente do compressor',
   'Sobrecorrente detectada no compressor.',
   'Tensão anormal ou problema no compressor.',
   'Verificar rede elétrica e compressor.',
   'Compressor'),
  ('E6', 'Falha de comunicação com o módulo inversor',
   'Placa não comunica com o módulo inversor.',
   'Placa inversora.',
   'Acionar técnico certificado.',
   'Placa inversora'),
  ('P0', 'Erro no módulo IPM (inversor)',
   'Falha no módulo de potência (IPM).',
   'Módulo de potência da placa inversora.',
   'Acionar técnico certificado.',
   'Placa inversora'),
  ('P1', 'Sub/sobretensão da rede elétrica',
   'Tensão da rede fora da faixa.',
   'Rede elétrica instável.',
   'Verificar a tensão da rede elétrica.',
   'Elétrica'),
  ('P4', 'Falha no sensor de descarga do compressor',
   'Sensor de temperatura de descarga com defeito.',
   'Sensor.',
   'Substituir o sensor de temperatura de descarga.',
   'Sensor'),
  ('F1', 'Sensor de temperatura ambiente da evaporadora',
   'Defeito no sensor de ambiente da evaporadora.',
   'Sensor.',
   'Substituir o sensor.',
   'Sensor'),
  ('F2', 'Sensor da serpentina da evaporadora',
   'Defeito no sensor da serpentina interna.',
   'Sensor.',
   'Substituir o sensor.',
   'Sensor'),
  ('F4', 'Sensor da serpentina da condensadora',
   'Defeito no sensor da serpentina externa.',
   'Sensor.',
   'Substituir o sensor.',
   'Sensor'),
  ('H3', 'Sobrecarga / superaquecimento do compressor',
   'Proteção por sobrecarga do compressor.',
   'Carga de gás, condensadora suja ou ventilação.',
   'Verificar carga de gás, limpar condensadora e ventilação.',
   'Compressor'),
  ('H6', 'Falha no motor do ventilador da evaporadora',
   'Motor do ventilador interno não responde.',
   'Motor ou placa.',
   'Verificar motor do ventilador e conexões.',
   'Evaporadora'),
  ('L9', 'Compressor travado / falha de partida',
   'Compressor não parte.',
   'Compressor travado.',
   'Acionar técnico certificado.',
   'Compressor')
) AS v(code, title, description, diagnosis, solution, component)
WHERE m.name = 'Split Inverter (Springer Midea)'
  AND NOT EXISTS (
    SELECT 1 FROM public.equipment_error_codes ec
    WHERE ec.model_id = m.id AND ec.code = v.code
  );
