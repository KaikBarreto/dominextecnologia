-- ============================================================
-- i18n — CATEGORIAS + MODELOS do catálogo global (en/es/fr)
-- ------------------------------------------------------------
-- Popula equipment_model_categories.i18n e equipment_models.i18n.
-- Chave estável = name (pt-br). Match por nome porque o catálogo é seedado
-- por nome e o texto pt-br é único e imutável (fonte). pt-br NUNCA vai no JSONB.
--
-- REGRA DE TRADUÇÃO (HVAC, semântica, alinhada ao glossário do app):
--   - NÃO traduz: BTU/BTUs, códigos de modelo (BRM44, WW11T...), marcas
--     (Gree, Eco Garden, Samsung...), siglas universais (R-32, R-410A, ACJ,
--     Inverter, Wi-Fi, AI, Frost Free — termos de mercado mantidos).
--   - Traduz partes descritivas: "Ar de Janela"→Window AC / Aire de ventana /
--     Climatiseur de fenêtre; "Frio"→Cooling only / Solo frío / Froid seul;
--     "Quente/Frio"→Heating & Cooling / Frío-Calor / Chaud-Froid;
--     "Frio Mecânico/Eletrônico"→Mechanical/Electronic cooling; etc.
--   - Modelos que são só marca+código (compressores, geladeiras nomeadas por
--     modelo) NÃO recebem entrada: o fallback pt-br é idêntico e correto.
-- ============================================================

-- ---------- CATEGORIAS (16) ----------
UPDATE public.equipment_model_categories c
SET i18n = v.i18n
FROM (VALUES
  ('Cassete',            '{"en":{"name":"Cassette"},"es":{"name":"Cassette"},"fr":{"name":"Cassette"}}'::jsonb),
  ('Freezer',            '{"en":{"name":"Freezer"},"es":{"name":"Congelador"},"fr":{"name":"Congélateur"}}'::jsonb),
  ('Geladeira',          '{"en":{"name":"Refrigerator"},"es":{"name":"Nevera"},"fr":{"name":"Réfrigérateur"}}'::jsonb),
  ('Hermético',          '{"en":{"name":"Hermetic"},"es":{"name":"Hermético"},"fr":{"name":"Hermétique"}}'::jsonb),
  ('Hermético comercial','{"en":{"name":"Commercial hermetic"},"es":{"name":"Hermético comercial"},"fr":{"name":"Hermétique commercial"}}'::jsonb),
  ('Janela (ACJ)',       '{"en":{"name":"Window (WAC)"},"es":{"name":"Ventana (ACV)"},"fr":{"name":"Fenêtre (CF)"}}'::jsonb),
  ('Lava e Seca',        '{"en":{"name":"Washer-dryer"},"es":{"name":"Lavasecadora"},"fr":{"name":"Lave-linge séchant"}}'::jsonb),
  ('Lavadora',           '{"en":{"name":"Washing machine"},"es":{"name":"Lavadora"},"fr":{"name":"Lave-linge"}}'::jsonb),
  ('Multi-Split',        '{"en":{"name":"Multi-split"},"es":{"name":"Multisplit"},"fr":{"name":"Multi-split"}}'::jsonb),
  ('Original',           '{"en":{"name":"Original"},"es":{"name":"Original"},"fr":{"name":"Origine"}}'::jsonb),
  ('Piso-Teto',          '{"en":{"name":"Floor-ceiling"},"es":{"name":"Piso-techo"},"fr":{"name":"Plafonnier / au sol"}}'::jsonb),
  ('Rotativo',           '{"en":{"name":"Rotary"},"es":{"name":"Rotativo"},"fr":{"name":"Rotatif"}}'::jsonb),
  ('Scroll',             '{"en":{"name":"Scroll"},"es":{"name":"Scroll"},"fr":{"name":"Scroll"}}'::jsonb),
  ('Semi-hermético',     '{"en":{"name":"Semi-hermetic"},"es":{"name":"Semihermético"},"fr":{"name":"Semi-hermétique"}}'::jsonb),
  ('Split Hi-Wall',      '{"en":{"name":"Hi-Wall split"},"es":{"name":"Split de pared (Hi-Wall)"},"fr":{"name":"Split mural (Hi-Wall)"}}'::jsonb),
  ('Universal',          '{"en":{"name":"Universal"},"es":{"name":"Universal"},"fr":{"name":"Universel"}}'::jsonb)
) AS v(name, i18n)
WHERE c.name = v.name;

-- ---------- MODELOS ----------
-- Estratégia: token-replacement determinístico sobre a coluna base `name`.
-- Traduz apenas os fragmentos descritivos pt-br; mantém marca, código e BTU.
-- Aplicado a TODOS os 264 modelos; modelos sem fragmento descritivo ficam
-- idênticos ao pt-br (fallback natural), mas ainda gravamos i18n p/ consistência
-- só quando houve alguma substituição (senão deixa NULL = fallback).

DO $$
DECLARE
  r   RECORD;
  en  TEXT;
  es  TEXT;
  fr  TEXT;
  changed BOOLEAN;
  n   INT := 0;
BEGIN
  FOR r IN SELECT id, name FROM public.equipment_models LOOP
    en := r.name; es := r.name; fr := r.name;

    -- Ordem importa: frases compostas ANTES das simples.
    -- "Quente/Frio Mecânico" e "Quente/Frio Eletrônico" (heat pump + tipo de partida)
    -- ANTES de "Frio Mecânico/Eletrônico" e de "Quente/Frio", senão o "Frio X"
    -- interno é consumido e sobra "Quente/".
    en := replace(en, 'Quente/Frio Mecânico', 'Mechanical Heating & Cooling');
    es := replace(es, 'Quente/Frio Mecânico', 'Frío-Calor mecánico');
    fr := replace(fr, 'Quente/Frio Mecânico', 'Chaud-Froid mécanique');

    en := replace(en, 'Quente/Frio Eletrônico', 'Electronic Heating & Cooling');
    es := replace(es, 'Quente/Frio Eletrônico', 'Frío-Calor electrónico');
    fr := replace(fr, 'Quente/Frio Eletrônico', 'Chaud-Froid électronique');

    -- "Frio Eletrônico" / "Frio Mecânico"
    en := replace(en, 'Frio Eletrônico', 'Electronic Cooling only');
    es := replace(es, 'Frio Eletrônico', 'Solo frío electrónico');
    fr := replace(fr, 'Frio Eletrônico', 'Froid seul électronique');

    en := replace(en, 'Frio Mecânico', 'Mechanical Cooling only');
    es := replace(es, 'Frio Mecânico', 'Solo frío mecánico');
    fr := replace(fr, 'Frio Mecânico', 'Froid seul mécanique');

    -- "Quente/Frio" (heat pump / reverse cycle) ANTES de "Frio" solto
    en := replace(en, 'Quente/Frio', 'Heating & Cooling');
    es := replace(es, 'Quente/Frio', 'Frío-Calor');
    fr := replace(fr, 'Quente/Frio', 'Chaud-Froid');

    -- Equipamentos / tipologias
    en := replace(en, 'Ar de Janela', 'Window AC');
    es := replace(es, 'Ar de Janela', 'Aire de ventana');
    fr := replace(fr, 'Ar de Janela', 'Climatiseur de fenêtre');

    en := replace(en, 'Piso-Teto', 'Floor-ceiling');
    es := replace(es, 'Piso-Teto', 'Piso-techo');
    fr := replace(fr, 'Piso-Teto', 'Plafonnier / au sol');

    en := replace(en, 'Cassete 4 Vias', '4-Way Cassette');
    es := replace(es, 'Cassete 4 Vias', 'Cassette 4 vías');
    fr := replace(fr, 'Cassete 4 Vias', 'Cassette 4 voies');

    en := replace(en, 'Cassete', 'Cassette');
    es := replace(es, 'Cassete', 'Cassette');
    fr := replace(fr, 'Cassete', 'Cassette');

    -- "Split Hi-Wall" mantém "Split Hi-Wall" (termo de mercado) nos 3 idiomas.

    en := replace(en, 'Lava e Seca', 'Washer-dryer');
    es := replace(es, 'Lava e Seca', 'Lavasecadora');
    fr := replace(fr, 'Lava e Seca', 'Lave-linge séchant');
    en := replace(en, 'lava e seca', 'washer-dryer');
    es := replace(es, 'lava e seca', 'lavasecadora');
    fr := replace(fr, 'lava e seca', 'lave-linge séchant');

    en := replace(en, 'Controle Remoto', 'Remote Control');
    es := replace(es, 'Controle Remoto', 'Control remoto');
    fr := replace(fr, 'Controle Remoto', 'Télécommande');

    en := replace(en, 'Refrigerador', 'Refrigerator');
    es := replace(es, 'Refrigerador', 'Refrigerador');
    fr := replace(fr, 'Refrigerador', 'Réfrigérateur');

    en := replace(en, 'Rotativo', 'Rotary');
    es := replace(es, 'Rotativo', 'Rotativo');
    fr := replace(fr, 'Rotativo', 'Rotatif');

    en := replace(en, 'Trifásico', 'Three-phase');
    es := replace(es, 'Trifásico', 'Trifásico');
    fr := replace(fr, 'Trifásico', 'Triphasé');

    -- "Frio" solto por último (já tratamos as compostas acima)
    en := replace(en, 'Frio', 'Cooling only');
    es := replace(es, 'Frio', 'Solo frío');
    fr := replace(fr, 'Frio', 'Froid seul');

    -- Descritores de linha branca / detalhes
    en := replace(en, 'linha eletrônica', 'electronic line');
    es := replace(es, 'linha eletrônica', 'línea electrónica');
    fr := replace(fr, 'linha eletrônica', 'gamme électronique');
    en := replace(en, 'linha automática', 'automatic line');
    es := replace(es, 'linha automática', 'línea automática');
    fr := replace(fr, 'linha automática', 'gamme automatique');
    en := replace(en, 'linha', 'line');
    es := replace(es, 'linha', 'línea');
    fr := replace(fr, 'linha', 'gamme');

    en := replace(en, 'condensadora', 'outdoor unit');
    es := replace(es, 'condensadora', 'unidad condensadora');
    fr := replace(fr, 'condensadora', 'unité extérieure');

    en := replace(en, 'com autodiagnóstico', 'with self-diagnosis');
    es := replace(es, 'com autodiagnóstico', 'con autodiagnóstico');
    fr := replace(fr, 'com autodiagnóstico', 'avec autodiagnostic');

    en := replace(en, 'tanquinho / lavadora semiautomática', 'twin-tub / semi-automatic washer');
    es := replace(es, 'tanquinho / lavadora semiautomática', 'lavadora doble tina / semiautomática');
    fr := replace(fr, 'tanquinho / lavadora semiautomática', 'lave-linge bi-cuve / semi-automatique');

    en := replace(en, 'Modo Eco', 'Eco Mode');
    es := replace(es, 'Modo Eco', 'Modo Eco');
    fr := replace(fr, 'Modo Eco', 'Mode Éco');

    en := replace(en, '1 Porta', '1-Door');
    es := replace(es, '1 Porta', '1 puerta');
    fr := replace(fr, '1 Porta', '1 porte');
    en := replace(en, '3 Portas', '3-Door');
    es := replace(es, '3 Portas', '3 puertas');
    fr := replace(fr, '3 Portas', '3 portes');

    changed := (en <> r.name) OR (es <> r.name) OR (fr <> r.name);

    IF changed THEN
      UPDATE public.equipment_models
      SET i18n = jsonb_build_object(
        'en', jsonb_build_object('name', en),
        'es', jsonb_build_object('name', es),
        'fr', jsonb_build_object('name', fr)
      )
      WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'equipment_models i18n populated: % rows (of total in table)', n;
END $$;
