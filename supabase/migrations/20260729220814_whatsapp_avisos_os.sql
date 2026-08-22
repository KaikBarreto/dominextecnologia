-- =============================================================================
-- Add-on "Avisos de WhatsApp" — Onda 1 (só banco)
-- =============================================================================
-- O tenant conecta o próprio WhatsApp (Evolution API auto-hospedada, QR code) e
-- o sistema dispara avisos automáticos ao cliente final em 3 momentos da OS:
--   a_caminho    → técnico saiu para o atendimento
--   em_andamento → técnico fez check-in (iniciou o serviço)
--   concluida    → técnico finalizou
--
-- Modelo comercial/cota CLONA o de NFS-e (nfse_tiers + companies.nfse_tier +
-- nfse_can_emit): catálogo de níveis global + coluna de nível na empresa +
-- RPC de cota mensal (mês-calendário America/Sao_Paulo).
--
-- Virada PREÇO-NEUTRA: todo cliente vira nível 1 (DEFAULT 1). Nada mexe em
-- companies.subscription_value. Números de cota/preço são PLACEHOLDER (CEO calibra).
--
-- RLS: config e log de eventos isolam por company_id (incidente 1.8.4 — white-label
-- vazou entre tenants; isolamento é lei). Catálogos (templates/tiers) são leitura
-- aberta a authenticated e escrita só super_admin.
--
-- Migration ADITIVA (tabelas novas + 1 coluna). Idempotente.
-- Helpers canônicos do projeto: get_user_company_id(auth.uid()), can_manage_system(auth.uid()),
-- has_role(uid, 'super_admin'), update_updated_at_column().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) company_whatsapp_settings — config 1:1 por empresa (tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_whatsapp_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_name         text,
  connection_status     text NOT NULL DEFAULT 'disconnected'
                          CHECK (connection_status IN ('disconnected','qr','connected','banned')),
  connected_number      text,
  enabled               boolean NOT NULL DEFAULT false,
  trigger_a_caminho     boolean NOT NULL DEFAULT true,
  trigger_em_andamento  boolean NOT NULL DEFAULT true,
  trigger_concluida     boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_company_whatsapp_settings ON public.company_whatsapp_settings;
CREATE TRIGGER set_updated_at_company_whatsapp_settings
  BEFORE UPDATE ON public.company_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_company_whatsapp_settings" ON public.company_whatsapp_settings;
CREATE POLICY "service_role_full_access_company_whatsapp_settings"
  ON public.company_whatsapp_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view whatsapp settings from their company" ON public.company_whatsapp_settings;
CREATE POLICY "Users can view whatsapp settings from their company"
  ON public.company_whatsapp_settings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Managers can insert whatsapp settings for their company" ON public.company_whatsapp_settings;
CREATE POLICY "Managers can insert whatsapp settings for their company"
  ON public.company_whatsapp_settings FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );

DROP POLICY IF EXISTS "Managers can update whatsapp settings for their company" ON public.company_whatsapp_settings;
CREATE POLICY "Managers can update whatsapp settings for their company"
  ON public.company_whatsapp_settings FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );
-- DELETE: sem policy authenticated (negado pro tenant).

-- ---------------------------------------------------------------------------
-- 2) whatsapp_templates — catálogo GLOBAL de variações de mensagem por gatilho
--    (leitura authenticated, escrita super_admin). Diversidade real = anti-ban.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger     text NOT NULL CHECK (trigger IN ('a_caminho','em_andamento','concluida')),
  body        text NOT NULL,   -- placeholders: {cliente} {tecnico} {os} {link} {hora}
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_trigger ON public.whatsapp_templates (trigger);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Anyone can view whatsapp templates"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Super admins can manage whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Super admins can manage whatsapp templates"
  ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT ON public.whatsapp_templates TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) whatsapp_events — log/auditoria + base de contagem de cota (tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  os_id        uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  trigger      text,
  template_id  uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  phone        text,
  status       text NOT NULL CHECK (status IN ('enviado','erro','entregue')),
  error        text,
  sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_company_id ON public.whatsapp_events (company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_os_id ON public.whatsapp_events (os_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_company_sent_at ON public.whatsapp_events (company_id, sent_at);

ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_whatsapp_events" ON public.whatsapp_events;
CREATE POLICY "service_role_full_access_whatsapp_events"
  ON public.whatsapp_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view whatsapp events from their company" ON public.whatsapp_events;
CREATE POLICY "Users can view whatsapp events from their company"
  ON public.whatsapp_events FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
-- INSERT/UPDATE/DELETE: sem policy authenticated (escrita só via edge service_role).

-- ---------------------------------------------------------------------------
-- 4) whatsapp_tiers — catálogo de níveis (CLONE de nfse_tiers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_tiers (
  tier          smallint PRIMARY KEY,
  name          text NOT NULL,
  monthly_limit int,                      -- NULL = ilimitado
  price         numeric(12,2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed placeholder (CEO calibra depois).
INSERT INTO public.whatsapp_tiers (tier, name, monthly_limit, price) VALUES
  (1, 'Nível 1',             500,   49),
  (2, 'Nível 2',            1500,  119),
  (3, 'Nível 3',            4000,  279),
  (4, 'Nível 4 (Ilimitado)', NULL, 449)
ON CONFLICT (tier) DO UPDATE
  SET name          = EXCLUDED.name,
      monthly_limit = EXCLUDED.monthly_limit,
      price         = EXCLUDED.price,
      updated_at    = now();

ALTER TABLE public.whatsapp_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view whatsapp tiers" ON public.whatsapp_tiers;
CREATE POLICY "Anyone can view whatsapp tiers"
  ON public.whatsapp_tiers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Super admins can manage whatsapp tiers" ON public.whatsapp_tiers;
CREATE POLICY "Super admins can manage whatsapp tiers"
  ON public.whatsapp_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT ON public.whatsapp_tiers TO authenticated, anon;

-- Coluna do nível na empresa (DEFAULT 1 = virada preço-neutra).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp_tier smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_whatsapp_tier_fkey'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_whatsapp_tier_fkey
      FOREIGN KEY (whatsapp_tier) REFERENCES public.whatsapp_tiers(tier) NOT VALID;
  END IF;
END $$;

UPDATE public.companies SET whatsapp_tier = 1 WHERE whatsapp_tier IS NULL;

-- ---------------------------------------------------------------------------
-- 5) whatsapp_can_send(p_company_id) -> boolean  (clone de nfse_can_emit)
--    Conta whatsapp_events do mês-calendário corrente (America/Sao_Paulo) com
--    status IN ('enviado','entregue') e compara com o limite do nível da empresa.
--    NULL (ilimitado) = sempre true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_can_send(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_tier  smallint;
  v_limit int;
  v_used  int;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN false;
  END IF;

  -- Nível da empresa (default 1 se ausente).
  SELECT COALESCE(c.whatsapp_tier, 1) INTO v_tier
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_tier IS NULL THEN
    v_tier := 1;
  END IF;

  -- Limite do nível no catálogo (NULL = ilimitado).
  SELECT t.monthly_limit INTO v_limit
  FROM public.whatsapp_tiers t
  WHERE t.tier = v_tier;

  IF v_limit IS NULL THEN
    RETURN true;
  END IF;

  -- Uso do mês-calendário corrente em America/Sao_Paulo (só envios que contam).
  SELECT COUNT(*)::int INTO v_used
  FROM public.whatsapp_events e
  WHERE e.company_id = p_company_id
    AND date_trunc('month', e.sent_at AT TIME ZONE 'America/Sao_Paulo')
        = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
    AND e.status IN ('enviado','entregue');

  RETURN v_used < v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.whatsapp_can_send(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) SEED de templates — >=50 variações POR gatilho (>=150 linhas), PT-BR,
--    tom cordial, diversidade semântica real (anti-ban).
-- ---------------------------------------------------------------------------
INSERT INTO public.whatsapp_templates (trigger, body) VALUES
  ('a_caminho', 'Olá {cliente}! O técnico {tecnico} já está a caminho do seu atendimento (OS {os}). Acompanhe em tempo real: {link}'),
  ('a_caminho', 'Oi, {cliente}! Boas notícias: {tecnico} saiu agora para atender você. Detalhes da OS {os} aqui: {link}'),
  ('a_caminho', '{cliente}, seu técnico {tecnico} está indo até você referente à OS {os}. Veja o andamento por este link: {link}'),
  ('a_caminho', 'Prezado(a) {cliente}, informamos que {tecnico} está a caminho do local para o serviço da OS {os}. Acompanhe: {link}'),
  ('a_caminho', 'Estamos chegando, {cliente}! {tecnico} já está na estrada para o seu atendimento (OS {os}). Acompanhe: {link}'),
  ('a_caminho', 'Olá {cliente}, tudo bem? O profissional {tecnico} acabou de sair para atender sua solicitação (OS {os}). Link: {link}'),
  ('a_caminho', '{cliente}, passando para avisar que {tecnico} está a caminho da sua residência/empresa. OS {os}: {link}'),
  ('a_caminho', 'Boa notícia, {cliente}! Seu atendimento está prestes a começar. {tecnico} está indo até você (OS {os}). Acompanhe: {link}'),
  ('a_caminho', 'Oi {cliente}! Nosso técnico {tecnico} deslocou-se agora para o seu endereço referente à OS {os}. Veja aqui: {link}'),
  ('a_caminho', '{cliente}, já pode se preparar: {tecnico} está a caminho para realizar o serviço da OS {os}. Detalhes: {link}'),
  ('a_caminho', 'Aviso importante, {cliente}: o responsável pelo seu atendimento, {tecnico}, está se deslocando até você (OS {os}). Link: {link}'),
  ('a_caminho', 'Olá {cliente}! Em instantes {tecnico} chega para o seu atendimento. Ele já está a caminho (OS {os}): {link}'),
  ('a_caminho', '{cliente}, seu chamado saiu para atendimento! {tecnico} está a caminho da OS {os}. Acompanhe em tempo real: {link}'),
  ('a_caminho', 'Oi, {cliente}! Só passando para avisar que {tecnico} está indo agora ao seu encontro. OS {os}: {link}'),
  ('a_caminho', 'Prezado(a) {cliente}, o técnico designado {tecnico} iniciou o deslocamento para atender a OS {os}. Acompanhe: {link}'),
  ('a_caminho', '{cliente}, fique à vontade para nos aguardar: {tecnico} já está a caminho do seu atendimento (OS {os}). Link: {link}'),
  ('a_caminho', 'Olá {cliente}! Estamos indo até você. {tecnico} saiu para atender sua OS {os}. Veja os detalhes: {link}'),
  ('a_caminho', '{cliente}, o técnico {tecnico} está a caminho para cuidar do seu equipamento (OS {os}). Acompanhe por aqui: {link}'),
  ('a_caminho', 'Oi {cliente}! Preparamos tudo e {tecnico} já partiu rumo ao seu endereço. Referente à OS {os}: {link}'),
  ('a_caminho', 'Informe de deslocamento: {cliente}, {tecnico} está a caminho do local do atendimento (OS {os}). Acompanhe: {link}'),
  ('a_caminho', '{cliente}, sua espera está quase no fim! {tecnico} está indo até você agora (OS {os}). Detalhes: {link}'),
  ('a_caminho', 'Olá, {cliente}. Confirmamos que {tecnico} deu início ao trajeto até você referente à OS {os}. Link de acompanhamento: {link}'),
  ('a_caminho', '{cliente}, avisamos com carinho: {tecnico} já está a caminho para o seu serviço (OS {os}). Acompanhe aqui: {link}'),
  ('a_caminho', 'Oi {cliente}! Seu técnico {tecnico} está em rota para o atendimento da OS {os}. Veja o percurso: {link}'),
  ('a_caminho', 'Prezado(a) {cliente}, {tecnico} deslocou-se e chegará em breve para atender a OS {os}. Acompanhe pelo link: {link}'),
  ('a_caminho', '{cliente}, mãos à obra! {tecnico} está a caminho e logo estará aí para o serviço da OS {os}. Link: {link}'),
  ('a_caminho', 'Olá {cliente}, aqui é da equipe. {tecnico} está indo até você agora mesmo referente à OS {os}: {link}'),
  ('a_caminho', '{cliente}, contamos com você por aí! {tecnico} está a caminho para realizar o atendimento (OS {os}). Acompanhe: {link}'),
  ('a_caminho', 'Oi, {cliente}! O deslocamento começou: {tecnico} está indo para o local da OS {os}. Detalhes em tempo real: {link}'),
  ('a_caminho', '{cliente}, seu atendimento saiu da base. {tecnico} está a caminho para atender a OS {os}. Veja aqui: {link}'),
  ('a_caminho', 'Olá {cliente}! Pode ir se organizando: {tecnico} já está indo até você referente à OS {os}. Acompanhe: {link}'),
  ('a_caminho', 'Prezado(a) {cliente}, temos um técnico a caminho. {tecnico} atenderá a OS {os} em breve. Link: {link}'),
  ('a_caminho', '{cliente}, notícia fresca: {tecnico} acabou de sair para o seu atendimento (OS {os}). Acompanhe o trajeto: {link}'),
  ('a_caminho', 'Oi {cliente}! Estamos a caminho para cuidar de tudo. {tecnico} atenderá sua OS {os} em instantes: {link}'),
  ('a_caminho', '{cliente}, o técnico {tecnico} está em rota até seu endereço para o serviço da OS {os}. Link de acompanhamento: {link}'),
  ('a_caminho', 'Olá, {cliente}! Sua solicitação está em movimento: {tecnico} está a caminho da OS {os}. Veja os detalhes: {link}'),
  ('a_caminho', '{cliente}, com prazer avisamos que {tecnico} partiu para o seu atendimento (OS {os}). Acompanhe por aqui: {link}'),
  ('a_caminho', 'Oi {cliente}! Já estamos indo. {tecnico} está a caminho para resolver o que você precisa (OS {os}): {link}'),
  ('a_caminho', 'Prezado(a) {cliente}, o profissional {tecnico} está se dirigindo ao seu endereço para a OS {os}. Acompanhe: {link}'),
  ('a_caminho', '{cliente}, seu técnico está a caminho! {tecnico} logo chegará para o atendimento da OS {os}. Link: {link}'),
  ('a_caminho', 'Olá {cliente}! Confira: {tecnico} saiu agora e está indo até você para o serviço da OS {os}. Detalhes: {link}'),
  ('a_caminho', '{cliente}, avisamos que o atendimento está a caminho. {tecnico} está indo até você (OS {os}). Acompanhe: {link}'),
  ('a_caminho', 'Oi, {cliente}! O trajeto começou. {tecnico} vai até você para atender a OS {os}. Veja em tempo real: {link}'),
  ('a_caminho', '{cliente}, prepare o cafezinho! {tecnico} está a caminho para o seu atendimento (OS {os}). Link: {link}'),
  ('a_caminho', 'Olá {cliente}, tudo certo por aí? {tecnico} está indo agora para atender sua OS {os}. Acompanhe aqui: {link}'),
  ('a_caminho', 'Prezado(a) {cliente}, iniciamos o deslocamento. {tecnico} chegará em breve para a OS {os}. Acompanhe: {link}'),
  ('a_caminho', '{cliente}, seu chamado está a caminho! {tecnico} está indo até você para o serviço da OS {os}. Link: {link}'),
  ('a_caminho', 'Oi {cliente}! Passando aqui para dizer que {tecnico} já saiu para o seu atendimento (OS {os}). Detalhes: {link}'),
  ('a_caminho', '{cliente}, o profissional {tecnico} está em deslocamento para a OS {os} e logo estará aí. Acompanhe: {link}'),
  ('a_caminho', 'Olá, {cliente}! Fique tranquilo(a): {tecnico} está a caminho e chegará em breve (OS {os}). Link: {link}'),
  ('a_caminho', '{cliente}, boa notícia! {tecnico} está indo até você agora para cuidar da OS {os}. Acompanhe o trajeto: {link}'),
  ('a_caminho', 'Oi {cliente}! Estamos quase aí. {tecnico} está a caminho para atender sua solicitação (OS {os}): {link}'),
  ('em_andamento', '{cliente}, o técnico {tecnico} chegou e já iniciou o atendimento da OS {os} às {hora}. Acompanhe: {link}'),
  ('em_andamento', 'Olá {cliente}! {tecnico} está no local e começou o serviço da OS {os} agora ({hora}). Detalhes: {link}'),
  ('em_andamento', 'Oi, {cliente}! Fizemos o check-in: {tecnico} deu início ao atendimento da OS {os} às {hora}. Acompanhe: {link}'),
  ('em_andamento', '{cliente}, informamos que o serviço já está em andamento. {tecnico} iniciou a OS {os} às {hora}: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, {tecnico} chegou ao local e começou os trabalhos da OS {os} ({hora}). Acompanhe: {link}'),
  ('em_andamento', '{cliente}, mãos à obra! {tecnico} iniciou o atendimento da sua OS {os} às {hora}. Veja o andamento: {link}'),
  ('em_andamento', 'Olá {cliente}! Seu atendimento começou: {tecnico} está trabalhando na OS {os} desde as {hora}. Link: {link}'),
  ('em_andamento', 'Oi {cliente}, tudo certo! {tecnico} chegou e já está cuidando da OS {os} (início às {hora}). Acompanhe: {link}'),
  ('em_andamento', '{cliente}, o técnico {tecnico} realizou o check-in e iniciou o serviço da OS {os} às {hora}. Detalhes: {link}'),
  ('em_andamento', 'Informamos, {cliente}, que {tecnico} deu início ao atendimento da OS {os} pontualmente às {hora}: {link}'),
  ('em_andamento', '{cliente}, seu serviço está em execução! {tecnico} começou a OS {os} às {hora}. Acompanhe por aqui: {link}'),
  ('em_andamento', 'Olá, {cliente}! {tecnico} já está no local e trabalhando na OS {os} desde as {hora}. Veja os detalhes: {link}'),
  ('em_andamento', 'Oi {cliente}! Passando para avisar que o atendimento da OS {os} começou às {hora} com {tecnico}: {link}'),
  ('em_andamento', '{cliente}, o profissional {tecnico} chegou e iniciou os trabalhos da OS {os} às {hora}. Acompanhe: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, confirmamos o início do serviço. {tecnico} está executando a OS {os} desde as {hora}: {link}'),
  ('em_andamento', '{cliente}, boa notícia: {tecnico} chegou no horário e já começou a OS {os} ({hora}). Link de acompanhamento: {link}'),
  ('em_andamento', 'Olá {cliente}! Estamos em ação. {tecnico} iniciou o atendimento da sua OS {os} às {hora}. Detalhes: {link}'),
  ('em_andamento', 'Oi, {cliente}! O técnico {tecnico} deu início ao serviço da OS {os} agora há pouco, às {hora}. Acompanhe: {link}'),
  ('em_andamento', '{cliente}, atualização do seu atendimento: {tecnico} começou a trabalhar na OS {os} às {hora}. Link: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, o atendimento está em curso. {tecnico} iniciou a OS {os} às {hora}. Acompanhe aqui: {link}'),
  ('em_andamento', '{cliente}, {tecnico} já está com a mão na massa! Início da OS {os} registrado às {hora}. Veja: {link}'),
  ('em_andamento', 'Olá {cliente}! Confirmamos que {tecnico} chegou e começou o serviço da OS {os} às {hora}: {link}'),
  ('em_andamento', 'Oi {cliente}, seu técnico {tecnico} entrou em ação na OS {os} a partir das {hora}. Acompanhe o progresso: {link}'),
  ('em_andamento', '{cliente}, o serviço da OS {os} está em andamento desde as {hora}, conduzido por {tecnico}. Detalhes: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, {tecnico} iniciou pontualmente o atendimento da OS {os} às {hora}. Acompanhe: {link}'),
  ('em_andamento', '{cliente}, tudo caminhando bem! {tecnico} está executando a OS {os} desde as {hora}. Link de acompanhamento: {link}'),
  ('em_andamento', 'Olá, {cliente}! O check-in foi feito e {tecnico} já trabalha na sua OS {os} ({hora}). Veja aqui: {link}'),
  ('em_andamento', 'Oi {cliente}! Só avisando que {tecnico} começou o atendimento da OS {os} às {hora}. Acompanhe em tempo real: {link}'),
  ('em_andamento', '{cliente}, seu equipamento já está sendo cuidado. {tecnico} iniciou a OS {os} às {hora}: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, o serviço começou. {tecnico} está no local executando a OS {os} desde as {hora}. Link: {link}'),
  ('em_andamento', '{cliente}, atualização: {tecnico} deu início aos trabalhos da OS {os} às {hora}. Acompanhe pelo link: {link}'),
  ('em_andamento', 'Olá {cliente}! {tecnico} chegou e o atendimento da OS {os} teve início às {hora}. Detalhes: {link}'),
  ('em_andamento', 'Oi, {cliente}! Estamos trabalhando no seu chamado. {tecnico} começou a OS {os} às {hora}: {link}'),
  ('em_andamento', '{cliente}, o atendimento da OS {os} entrou em execução às {hora} com o técnico {tecnico}. Acompanhe: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, informamos o início do serviço da OS {os} às {hora}, realizado por {tecnico}: {link}'),
  ('em_andamento', '{cliente}, seu serviço já está rolando! {tecnico} iniciou a OS {os} às {hora}. Veja o andamento: {link}'),
  ('em_andamento', 'Olá {cliente}! O técnico {tecnico} fez o check-in e começou a OS {os} às {hora}. Acompanhe: {link}'),
  ('em_andamento', 'Oi {cliente}, tudo em ordem! {tecnico} está executando o serviço da OS {os} desde as {hora}: {link}'),
  ('em_andamento', '{cliente}, confirmamos que os trabalhos da OS {os} começaram às {hora} com {tecnico}. Link: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, o atendimento da sua OS {os} está em andamento desde as {hora}. Técnico: {tecnico}. {link}'),
  ('em_andamento', '{cliente}, notícia do seu atendimento: {tecnico} iniciou a OS {os} às {hora}. Acompanhe por aqui: {link}'),
  ('em_andamento', 'Olá, {cliente}! Já começamos. {tecnico} está cuidando da OS {os} desde as {hora}. Detalhes: {link}'),
  ('em_andamento', 'Oi {cliente}! O serviço da OS {os} teve início às {hora} e {tecnico} está no comando. Acompanhe: {link}'),
  ('em_andamento', '{cliente}, seu chamado está em execução! {tecnico} iniciou a OS {os} às {hora}. Veja em tempo real: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, {tecnico} chegou e deu andamento à OS {os} às {hora}. Link de acompanhamento: {link}'),
  ('em_andamento', '{cliente}, estamos trabalhando por você! {tecnico} começou a OS {os} às {hora}. Acompanhe aqui: {link}'),
  ('em_andamento', 'Olá {cliente}! Registramos o início do atendimento da OS {os} às {hora} com {tecnico}. Detalhes: {link}'),
  ('em_andamento', 'Oi, {cliente}! {tecnico} está com tudo em mãos e iniciou a OS {os} às {hora}. Acompanhe: {link}'),
  ('em_andamento', '{cliente}, o técnico {tecnico} entrou em serviço na OS {os} a partir das {hora}. Link: {link}'),
  ('em_andamento', 'Prezado(a) {cliente}, seu atendimento começou. {tecnico} executa a OS {os} desde as {hora}. Acompanhe: {link}'),
  ('em_andamento', '{cliente}, tudo pronto e em andamento! {tecnico} iniciou a OS {os} às {hora}. Veja os detalhes: {link}'),
  ('em_andamento', 'Olá {cliente}! O serviço já começou com {tecnico} na OS {os}, desde as {hora}. Acompanhe por aqui: {link}'),
  ('concluida', '{cliente}, seu atendimento foi concluído! {tecnico} finalizou a OS {os} às {hora}. Veja o resumo: {link}'),
  ('concluida', 'Olá {cliente}! Serviço finalizado com sucesso. {tecnico} encerrou a OS {os} às {hora}. Detalhes: {link}'),
  ('concluida', 'Oi, {cliente}! Terminamos: {tecnico} concluiu o atendimento da OS {os} às {hora}. Acesse o relatório: {link}'),
  ('concluida', '{cliente}, informamos que a OS {os} foi concluída por {tecnico} às {hora}. Confira aqui: {link}'),
  ('concluida', 'Prezado(a) {cliente}, o serviço da OS {os} foi finalizado às {hora} pelo técnico {tecnico}. Veja: {link}'),
  ('concluida', '{cliente}, missão cumprida! {tecnico} encerrou a OS {os} às {hora}. Acesse os detalhes do atendimento: {link}'),
  ('concluida', 'Olá {cliente}! Tudo resolvido. {tecnico} concluiu a OS {os} às {hora}. Confira o resumo do serviço: {link}'),
  ('concluida', 'Oi {cliente}, atendimento finalizado! A OS {os} foi encerrada por {tecnico} às {hora}. Link: {link}'),
  ('concluida', '{cliente}, o técnico {tecnico} finalizou o serviço da OS {os} às {hora}. Veja o relatório completo: {link}'),
  ('concluida', 'Informamos, {cliente}, que a OS {os} foi concluída com êxito às {hora} por {tecnico}: {link}'),
  ('concluida', '{cliente}, seu serviço está pronto! {tecnico} terminou a OS {os} às {hora}. Acesse os detalhes: {link}'),
  ('concluida', 'Olá, {cliente}! Concluímos o atendimento. {tecnico} finalizou a OS {os} às {hora}. Confira: {link}'),
  ('concluida', 'Oi {cliente}! Boas notícias: a OS {os} foi encerrada por {tecnico} às {hora}. Veja o resumo aqui: {link}'),
  ('concluida', '{cliente}, o atendimento da OS {os} chegou ao fim às {hora}, realizado por {tecnico}. Detalhes: {link}'),
  ('concluida', 'Prezado(a) {cliente}, confirmamos a conclusão do serviço. {tecnico} finalizou a OS {os} às {hora}: {link}'),
  ('concluida', '{cliente}, trabalho concluído! {tecnico} encerrou a OS {os} às {hora}. Acesse o relatório do atendimento: {link}'),
  ('concluida', 'Olá {cliente}! Está tudo pronto. {tecnico} finalizou o serviço da OS {os} às {hora}. Veja aqui: {link}'),
  ('concluida', 'Oi, {cliente}! O técnico {tecnico} concluiu a OS {os} às {hora}. Confira o resumo do que foi feito: {link}'),
  ('concluida', '{cliente}, atualização final: a OS {os} foi concluída por {tecnico} às {hora}. Link do relatório: {link}'),
  ('concluida', 'Prezado(a) {cliente}, o atendimento da OS {os} foi finalizado às {hora}. Técnico responsável: {tecnico}. {link}'),
  ('concluida', '{cliente}, seu equipamento está pronto! {tecnico} encerrou a OS {os} às {hora}. Veja os detalhes: {link}'),
  ('concluida', 'Olá {cliente}! Finalizamos com capricho. {tecnico} concluiu a OS {os} às {hora}. Confira o resumo: {link}'),
  ('concluida', 'Oi {cliente}, tudo certo e concluído! A OS {os} foi encerrada por {tecnico} às {hora}. Acesse: {link}'),
  ('concluida', '{cliente}, o serviço da OS {os} foi entregue às {hora} por {tecnico}. Veja o relatório completo: {link}'),
  ('concluida', 'Prezado(a) {cliente}, temos o prazer de informar a conclusão da OS {os} às {hora} por {tecnico}: {link}'),
  ('concluida', '{cliente}, tudo resolvido por aqui! {tecnico} finalizou a OS {os} às {hora}. Acesse os detalhes: {link}'),
  ('concluida', 'Olá, {cliente}! Encerramos seu atendimento. {tecnico} concluiu a OS {os} às {hora}. Confira: {link}'),
  ('concluida', 'Oi {cliente}! Só avisando que a OS {os} foi finalizada por {tecnico} às {hora}. Veja o resumo: {link}'),
  ('concluida', '{cliente}, atendimento entregue! {tecnico} concluiu o serviço da OS {os} às {hora}. Link: {link}'),
  ('concluida', 'Prezado(a) {cliente}, o serviço solicitado (OS {os}) foi concluído às {hora} por {tecnico}. Detalhes: {link}'),
  ('concluida', '{cliente}, finalizamos tudo com atenção! {tecnico} encerrou a OS {os} às {hora}. Acesse o relatório: {link}'),
  ('concluida', 'Olá {cliente}! Seu atendimento acabou de ser concluído. {tecnico} finalizou a OS {os} às {hora}: {link}'),
  ('concluida', 'Oi, {cliente}! Trabalho entregue. A OS {os} foi encerrada por {tecnico} às {hora}. Confira aqui: {link}'),
  ('concluida', '{cliente}, o técnico {tecnico} concluiu a OS {os} às {hora}. Esperamos ter atendido bem! Detalhes: {link}'),
  ('concluida', 'Prezado(a) {cliente}, informamos o encerramento da OS {os} às {hora}, executada por {tecnico}: {link}'),
  ('concluida', '{cliente}, prontinho! {tecnico} finalizou a OS {os} às {hora}. Acesse o resumo do seu atendimento: {link}'),
  ('concluida', 'Olá {cliente}! Concluímos o serviço da OS {os} às {hora} com {tecnico}. Veja o relatório: {link}'),
  ('concluida', 'Oi {cliente}, seu chamado foi encerrado! {tecnico} finalizou a OS {os} às {hora}. Confira os detalhes: {link}'),
  ('concluida', '{cliente}, atendimento concluído com sucesso por {tecnico} às {hora} (OS {os}). Acesse aqui: {link}'),
  ('concluida', 'Prezado(a) {cliente}, a OS {os} foi finalizada às {hora}. Agradecemos a confiança! Técnico: {tecnico}. {link}'),
  ('concluida', '{cliente}, tudo certo e finalizado! {tecnico} encerrou a OS {os} às {hora}. Veja o que foi feito: {link}'),
  ('concluida', 'Olá, {cliente}! Fechamos seu atendimento. {tecnico} concluiu a OS {os} às {hora}. Detalhes: {link}'),
  ('concluida', 'Oi {cliente}! O serviço da OS {os} está concluído desde as {hora}, feito por {tecnico}. Acesse: {link}'),
  ('concluida', '{cliente}, seu atendimento foi encerrado às {hora} por {tecnico} (OS {os}). Confira o relatório: {link}'),
  ('concluida', 'Prezado(a) {cliente}, concluímos a OS {os} às {hora}. Qualquer coisa, estamos à disposição! {tecnico}. {link}'),
  ('concluida', '{cliente}, entregamos seu serviço! {tecnico} finalizou a OS {os} às {hora}. Acesse os detalhes: {link}'),
  ('concluida', 'Olá {cliente}! Trabalho finalizado com dedicação. {tecnico} encerrou a OS {os} às {hora}. Veja: {link}'),
  ('concluida', 'Oi, {cliente}! A OS {os} foi concluída por {tecnico} às {hora}. Esperamos que goste do resultado: {link}'),
  ('concluida', '{cliente}, atendimento completo! {tecnico} finalizou a OS {os} às {hora}. Acesse o resumo aqui: {link}'),
  ('concluida', 'Prezado(a) {cliente}, o serviço da OS {os} foi encerrado às {hora} por {tecnico}. Agradecemos a preferência: {link}'),
  ('concluida', '{cliente}, missão concluída! {tecnico} terminou a OS {os} às {hora}. Confira o relatório do atendimento: {link}'),
  ('concluida', 'Olá {cliente}! Seu serviço está finalizado. {tecnico} concluiu a OS {os} às {hora}. Veja os detalhes: {link}')
ON CONFLICT DO NOTHING;
-- Fim da migration.
