-- Migration: white-label QR Code style preferences
-- Adiciona 3 colunas opcionais em company_settings para personalizar o estilo
-- dos QR Codes gerados pelo tenant (pontos, cantos e cor).
-- RLS não é alterada: herdam as políticas já existentes da tabela.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS white_label_qr_dot_style text NULL
    CONSTRAINT company_settings_qr_dot_style_check
      CHECK (white_label_qr_dot_style IN ('square','rounded','dots','classy')),
  ADD COLUMN IF NOT EXISTS white_label_qr_corner_style text NULL
    CONSTRAINT company_settings_qr_corner_style_check
      CHECK (white_label_qr_corner_style IN ('square','rounded','dot')),
  ADD COLUMN IF NOT EXISTS white_label_qr_color text NULL;

-- Comentários descritivos nas colunas
COMMENT ON COLUMN public.company_settings.white_label_qr_dot_style IS
  'Formato dos módulos (pontos) do QR Code. NULL = padrão ''square''. Valores: square | rounded | dots | classy.';

COMMENT ON COLUMN public.company_settings.white_label_qr_corner_style IS
  'Formato dos olhos/cantos do QR Code. NULL = padrão ''square''. Valores: square | rounded | dot.';

COMMENT ON COLUMN public.company_settings.white_label_qr_color IS
  'Cor hexadecimal dos módulos do QR Code (ex: #1A2B3C). NULL = preto padrão. Contraste mínimo aplicado no front.';
