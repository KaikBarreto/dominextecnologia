-- =============================================================
-- salespeople: foto de perfil (avatar)
-- =============================================================
-- Contexto: o CRM admin (/admin/crm) precisa mostrar a foto do
-- vendedor atribuido em cada card de lead. Para isso:
--   1) salespeople ganha coluna photo_url (URL publica do avatar)
--   2) view salespeople_basic recriada incluindo photo_url
--   3) bucket de Storage 'salesperson-avatars' criado (publico,
--      mesmo padrao de team-photos/employee-photos versao public,
--      pois avatar de funcionario interno e' mostrado em UI sem
--      fricao e nao contem dado sensivel)
--   4) policies em storage.objects: SELECT publico, INSERT/UPDATE/
--      DELETE apenas super_admin (vendedor admin NAO cadastra/edita
--      vendedor, so' le)
--
-- Path convention recomendada (nao enforcada no banco):
--   <salesperson_id>/<uuid>.<ext>
-- =============================================================


-- -----------------------------------------------------------------
-- Parte 1: coluna photo_url em public.salespeople
-- -----------------------------------------------------------------
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS photo_url text NULL;

COMMENT ON COLUMN public.salespeople.photo_url IS
  'URL publica do avatar do vendedor (bucket salesperson-avatars). NULL = renderizar iniciais no front.';


-- -----------------------------------------------------------------
-- Parte 2: recriar view salespeople_basic incluindo photo_url
-- -----------------------------------------------------------------
-- Postgres nao suporta adicionar coluna a uma view existente via
-- CREATE OR REPLACE quando a ordem muda. DROP + CREATE garante a
-- forma certa. security_invoker=true preservado.
DROP VIEW IF EXISTS public.salespeople_basic;

CREATE VIEW public.salespeople_basic
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  email,
  referral_code,
  is_active,
  user_id,
  photo_url
FROM public.salespeople;

GRANT SELECT ON public.salespeople_basic TO authenticated;

COMMENT ON VIEW public.salespeople_basic IS
  'View blindada de salespeople para dropdowns/lookups no painel admin. NUNCA adicionar salary, monthly_goal, notes ou outras colunas sensiveis aqui.';


-- -----------------------------------------------------------------
-- Parte 3: bucket Storage salesperson-avatars
-- -----------------------------------------------------------------
-- public=true: avatar de vendedor interno aparece em multiplas UIs
-- sem precisar gerar signed URL. Mesmo padrao de team-photos,
-- employee-photos (versao public original) e company-logos.
-- Se algum dia virar marketplace de afiliados externos, migrar
-- pra public=false + signed URL (vide 20260418165057).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'salesperson-avatars',
  'salesperson-avatars',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------
-- Parte 4: storage RLS - policies do bucket
-- -----------------------------------------------------------------
-- SELECT: publico (bucket e' public=true, mas policy explicita
--   atende defesa em profundidade caso alguem mude bucket pra
--   public=false sem refatorar callers).
-- INSERT/UPDATE/DELETE: apenas super_admin (vendedor admin nao
--   cria/edita vendedor; so leitura).
DROP POLICY IF EXISTS "Public can view salesperson avatars" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can upload salesperson avatars" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can update salesperson avatars" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can delete salesperson avatars" ON storage.objects;

CREATE POLICY "Public can view salesperson avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'salesperson-avatars');

CREATE POLICY "Super admins can upload salesperson avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'salesperson-avatars'
    AND public.is_super_admin(auth.uid())
  );

CREATE POLICY "Super admins can update salesperson avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'salesperson-avatars'
    AND public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'salesperson-avatars'
    AND public.is_super_admin(auth.uid())
  );

CREATE POLICY "Super admins can delete salesperson avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'salesperson-avatars'
    AND public.is_super_admin(auth.uid())
  );
