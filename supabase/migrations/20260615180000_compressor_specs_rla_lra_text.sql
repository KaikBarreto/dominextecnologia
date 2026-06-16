-- Fase 2 (catálogo de compressores): RLA/LRA passam a aceitar texto.
-- Por quê: os datasheets reais trazem RLA/LRA com condição/faixa embutida
-- (ex.: "3,08 A (50Hz) / 2,99 A (60Hz)", "5,4 A (PTC) | 5,7 A (relé)"),
-- que não cabem em numeric. Mantemos como text livre, igual aos demais campos.
ALTER TABLE public.compressor_specs ALTER COLUMN rla TYPE text USING rla::text;
ALTER TABLE public.compressor_specs ALTER COLUMN lra TYPE text USING lra::text;
