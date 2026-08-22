-- =============================================================================
-- Add-on "Avisos de WhatsApp" — Templates ENRIQUECIDOS (padrão v2)
-- =============================================================================
-- A migration base (20260729220814) criou whatsapp_templates com seed PLANO
-- (156 linhas, sem markup, placeholders {cliente}{tecnico}{os}{hora}{link}).
--
-- Aqui ENRIQUECEMOS o catálogo GLOBAL:
--   1) 2 colunas novas:
--      - context      → avulsa | contrato | pmoc  (variação por tipo de OS)
--      - requires_eta → linha traz a previsão de chegada {eta} (só a_caminho)
--   2) Novo placeholder {servico} (tipo do serviço) e {eta} (previsão de chegada).
--   3) Mensagens formatadas com markup do WhatsApp (*negrito* / _itálico_),
--      chamada no topo, 2-3 blocos, link em linha própria no fim.
--
-- Placeholders EXATOS: {cliente} {tecnico} {servico} {os} {hora} {eta} {link}
-- Regras: {eta} SÓ em a_caminho + requires_eta=true. {hora} NÃO entra no
-- a_caminho. {servico} em todas.
--
-- O seed antigo é substituído (DELETE + INSERT). whatsapp_events.template_id é
-- ON DELETE SET NULL — apagar o catálogo não estoura FK nem apaga log.
--
-- RLS NÃO muda (SELECT authenticated / ALL super_admin, já definidas na base).
-- Migration ADITIVA nas colunas (IF NOT EXISTS) + reseed idempotente.
--
-- A resolução de {servico}/{eta}/context em runtime é da EDGE (outro dev).
-- Aqui só schema + seed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Colunas novas (idempotentes) + índice de busca por (trigger, context, active)
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'avulsa'
    CHECK (context IN ('avulsa','contrato','pmoc'));

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS requires_eta boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_trigger_context_active
  ON public.whatsapp_templates (trigger, context, active);

-- ---------------------------------------------------------------------------
-- 2) Substitui o seed plano antigo pelo enriquecido (catálogo global).
--    template_id em whatsapp_events é ON DELETE SET NULL: seguro apagar tudo.
-- ---------------------------------------------------------------------------
DELETE FROM public.whatsapp_templates;

-- ---------------------------------------------------------------------------
-- 3) SEED enriquecido — 128 variações (markup WhatsApp, dollar-quoting nos bodies
--    p/ apóstrofo/aspas). Distribuição por (trigger, context, requires_eta):
--      a_caminho·avulsa   → 20 (10 c/ {eta} + 10 s/ {eta})
--      a_caminho·contrato → 12 (6 + 6)
--      a_caminho·pmoc     → 12 (6 + 6)
--      em_andamento·avulsa 18 | ·contrato 12 | ·pmoc 12  (s/ {eta}, c/ {hora})
--      concluida·avulsa    18 | ·contrato 12 | ·pmoc 12  (s/ {eta}, c/ {hora})
-- ---------------------------------------------------------------------------
INSERT INTO public.whatsapp_templates (trigger, context, requires_eta, body) VALUES
  ('a_caminho', 'avulsa', true, $tpl$*Seu técnico está a caminho!* 🚗

Olá {cliente}, o técnico *{tecnico}* já saiu para o serviço de *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$🚗 *A caminho da sua casa!*

{cliente}, *{tecnico}* está indo até você para o serviço de *{servico}* _(OS {os})_.

📍 Chegada prevista: *{eta}*

Acompanhe o trajeto:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$*Deslocamento iniciado* 📍

Oi {cliente}! Seu técnico *{tecnico}* saiu agora para atender o serviço de *{servico}* _(OS {os})_.

📍 Deve chegar por volta de *{eta}*.

Veja onde ele está:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$*Estamos indo até você!* 🚙

{cliente}, *{tecnico}* está em rota para realizar *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$🚗 *Técnico a caminho*

Prezado(a) {cliente}, informamos que *{tecnico}* já está se deslocando para o serviço de *{servico}* _(OS {os})_.

📍 Chegada estimada: *{eta}*

Acompanhe o percurso:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$*Boas notícias, {cliente}!* 🚗

Seu atendimento está a caminho: *{tecnico}* saiu para o serviço de *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$📍 *Seu atendimento saiu para a rua!*

{cliente}, o técnico *{tecnico}* está indo até você para *{servico}* _(OS {os})_.

📍 Chega por volta das *{eta}*.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$*A caminho!* 🛻

Olá {cliente}, pode ir se organizando: *{tecnico}* está a caminho para o serviço de *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Veja o trajeto:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$*Estamos chegando, {cliente}!* 🚗

O técnico *{tecnico}* já está na estrada para *{servico}* _(OS {os})_.

📍 Chegada prevista para *{eta}*.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'avulsa', true, $tpl$🚙 *Técnico em rota*

Oi {cliente}! *{tecnico}* deslocou-se agora para atender *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe por aqui:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$🚗 *A caminho!*

{cliente}, *{tecnico}* está indo até você para o serviço de *{servico}* _(OS {os})_.

Acompanhe o trajeto:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$*Seu técnico está a caminho!* 🚙

Olá {cliente}, *{tecnico}* já saiu para realizar *{servico}* _(OS {os})_.

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$📍 *Deslocamento iniciado*

Oi {cliente}! O técnico *{tecnico}* está indo até você para *{servico}* _(OS {os})_.

Veja onde ele está:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$*Estamos indo até você, {cliente}!* 🚗

*{tecnico}* está em rota para o serviço de *{servico}* _(OS {os})_.

Acompanhe o percurso:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$🚙 *Técnico a caminho*

Prezado(a) {cliente}, *{tecnico}* já está se deslocando para *{servico}* _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$*Boas notícias!* 🚗

{cliente}, seu atendimento saiu da base: *{tecnico}* está indo para o serviço de *{servico}* _(OS {os})_.

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$📍 *Já estamos a caminho*

Olá {cliente}, *{tecnico}* está indo até você para realizar *{servico}* _(OS {os})_.

Veja o trajeto:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$*A caminho!* 🛻

{cliente}, pode ir se preparando: *{tecnico}* está indo para *{servico}* _(OS {os})_.

Acompanhe por aqui:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$*Estamos chegando!* 🚗

Oi {cliente}! O técnico *{tecnico}* já está na estrada para *{servico}* _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'avulsa', false, $tpl$🚙 *Técnico em rota*

{cliente}, *{tecnico}* deslocou-se agora para atender *{servico}* _(OS {os})_.

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'contrato', true, $tpl$*Atendimento de contrato a caminho* 🚗

Olá {cliente}, conforme seu contrato, o técnico *{tecnico}* está indo até você para *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'contrato', true, $tpl$📍 *Seu contrato em atendimento*

{cliente}, *{tecnico}* saiu para realizar o serviço de *{servico}* previsto no seu contrato _(OS {os})_.

📍 Chegada estimada: *{eta}*

Acompanhe o trajeto:
{link}$tpl$),
  ('a_caminho', 'contrato', true, $tpl$*Técnico a caminho — contrato* 🚙

Oi {cliente}! O atendimento do seu contrato está a caminho: *{tecnico}* vai realizar *{servico}* _(OS {os})_.

📍 Chega por volta de *{eta}*.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'contrato', true, $tpl$🚗 *Atendimento de contrato*

Prezado(a) {cliente}, o técnico *{tecnico}* está se deslocando para o serviço de *{servico}* do seu contrato _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'contrato', true, $tpl$*Conforme seu contrato, estamos indo!* 🚗

{cliente}, *{tecnico}* está a caminho para *{servico}* _(OS {os})_.

📍 Chegada prevista: *{eta}*

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'contrato', true, $tpl$📍 *Seu atendimento contratado saiu*

Olá {cliente}, *{tecnico}* está indo até você para cumprir o serviço de *{servico}* do contrato _(OS {os})_.

📍 Chegada por volta de *{eta}*.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'contrato', false, $tpl$*Atendimento de contrato a caminho* 🚗

Olá {cliente}, conforme seu contrato, *{tecnico}* está indo até você para *{servico}* _(OS {os})_.

Acompanhe o trajeto:
{link}$tpl$),
  ('a_caminho', 'contrato', false, $tpl$📍 *Seu contrato em atendimento*

{cliente}, *{tecnico}* saiu para o serviço de *{servico}* previsto no seu contrato _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'contrato', false, $tpl$*Técnico a caminho — contrato* 🚙

Oi {cliente}! O atendimento do seu contrato está a caminho: *{tecnico}* vai realizar *{servico}* _(OS {os})_.

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'contrato', false, $tpl$🚗 *Atendimento de contrato*

Prezado(a) {cliente}, *{tecnico}* está se deslocando para o serviço de *{servico}* do seu contrato _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'contrato', false, $tpl$*Conforme seu contrato, já estamos indo!* 🚗

{cliente}, *{tecnico}* está a caminho para *{servico}* _(OS {os})_.

Acompanhe o percurso:
{link}$tpl$),
  ('a_caminho', 'contrato', false, $tpl$📍 *Seu atendimento contratado saiu*

Olá {cliente}, *{tecnico}* está indo até você para cumprir o serviço de *{servico}* do contrato _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', true, $tpl$*Manutenção programada (PMOC)* 🗓️

Olá {cliente}, o técnico *{tecnico}* está a caminho para a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_.

📍 Chegada em *{eta}*

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', true, $tpl$🗓️ *Sua manutenção PMOC está a caminho*

{cliente}, *{tecnico}* saiu para realizar a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe o trajeto:
{link}$tpl$),
  ('a_caminho', 'pmoc', true, $tpl$*Manutenção preventiva programada* 🗓️

Oi {cliente}! O técnico *{tecnico}* está indo até você para a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_.

📍 Chega por volta de *{eta}*.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', true, $tpl$🗓️ *PMOC a caminho*

Prezado(a) {cliente}, *{tecnico}* está se deslocando para a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_.

📍 Chegada estimada: *{eta}*

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', true, $tpl$*Sua manutenção programada está indo!* 🗓️

{cliente}, *{tecnico}* está a caminho para a *manutenção preventiva programada (PMOC)* — *{servico}* _(OS {os})_.

📍 Previsão de chegada: *{eta}*

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'pmoc', true, $tpl$🗓️ *Manutenção programada (PMOC)*

Olá {cliente}, o técnico *{tecnico}* saiu para a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_.

📍 Chegada por volta de *{eta}*.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', false, $tpl$*Manutenção programada (PMOC)* 🗓️

Olá {cliente}, o técnico *{tecnico}* está a caminho para a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', false, $tpl$🗓️ *Sua manutenção PMOC está a caminho*

{cliente}, *{tecnico}* saiu para realizar a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_.

Acompanhe o trajeto:
{link}$tpl$),
  ('a_caminho', 'pmoc', false, $tpl$*Manutenção preventiva programada* 🗓️

Oi {cliente}! *{tecnico}* está indo até você para a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', false, $tpl$🗓️ *PMOC a caminho*

Prezado(a) {cliente}, *{tecnico}* está se deslocando para a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('a_caminho', 'pmoc', false, $tpl$*Sua manutenção programada está indo!* 🗓️

{cliente}, *{tecnico}* está a caminho para a *manutenção preventiva programada (PMOC)* — *{servico}* _(OS {os})_.

Acompanhe em tempo real:
{link}$tpl$),
  ('a_caminho', 'pmoc', false, $tpl$🗓️ *Manutenção programada (PMOC)*

Olá {cliente}, *{tecnico}* saiu para a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Atendimento iniciado* ✅

{cliente}, o técnico *{tecnico}* chegou e começou o serviço de *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Serviço em andamento*

Olá {cliente}! *{tecnico}* está no local e iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o progresso:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Mãos à obra!* ✅

Oi {cliente}, *{tecnico}* deu início ao serviço de *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Check-in feito*

{cliente}, *{tecnico}* chegou e já está cuidando de *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Seu serviço já começou* ✅

Prezado(a) {cliente}, *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Estamos em ação!*

{cliente}, o técnico *{tecnico}* começou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o andamento:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Atendimento em execução* ✅

Olá {cliente}! *{tecnico}* está trabalhando em *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Serviço iniciado*

Oi {cliente}, *{tecnico}* realizou o check-in e começou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Já começamos!* ✅

{cliente}, *{tecnico}* está no local executando *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Atendimento em curso*

Prezado(a) {cliente}, *{tecnico}* iniciou *{servico}* _(OS {os})_ pontualmente às _{hora}_.

Acompanhe o progresso:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Atendimento iniciado* ✅

{cliente}, o técnico *{tecnico}* chegou e começou o serviço de *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Serviço em andamento*

Olá {cliente}! *{tecnico}* está no local e iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Mãos à obra!* ✅

Oi {cliente}, *{tecnico}* deu início ao serviço de *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe em tempo real:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Check-in feito*

{cliente}, *{tecnico}* chegou e já está cuidando de *{servico}* _(OS {os})_ desde as _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Seu serviço já começou* ✅

Prezado(a) {cliente}, *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Confira aqui:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Estamos em ação!*

{cliente}, o técnico *{tecnico}* começou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o andamento:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$*Atendimento em execução* ✅

Olá {cliente}! *{tecnico}* está trabalhando em *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'avulsa', false, $tpl$✅ *Serviço iniciado*

Oi {cliente}, *{tecnico}* realizou o check-in e começou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$*Atendimento de contrato iniciado* ✅

{cliente}, conforme seu contrato, *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$✅ *Serviço do contrato em andamento*

Olá {cliente}! *{tecnico}* chegou e começou *{servico}* previsto no seu contrato _(OS {os})_ às _{hora}_.

Acompanhe o progresso:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$*Seu contrato em atendimento* ✅

Oi {cliente}, *{tecnico}* deu início a *{servico}* do seu contrato _(OS {os})_ desde as _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$✅ *Atendimento de contrato em curso*

Prezado(a) {cliente}, conforme contratado, *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$*Contrato em execução* ✅

{cliente}, *{tecnico}* está no local trabalhando em *{servico}* do seu contrato _(OS {os})_ desde as _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$✅ *Serviço contratado iniciado*

Olá {cliente}! O atendimento do seu contrato começou: *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$*Atendimento de contrato iniciado* ✅

{cliente}, conforme seu contrato, *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$✅ *Serviço do contrato em andamento*

Olá {cliente}! *{tecnico}* chegou e começou *{servico}* previsto no seu contrato _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$*Seu contrato em atendimento* ✅

Oi {cliente}, *{tecnico}* deu início a *{servico}* do seu contrato _(OS {os})_ desde as _{hora}_.

Acompanhe em tempo real:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$✅ *Atendimento de contrato em curso*

Prezado(a) {cliente}, conforme contratado, *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$*Contrato em execução* ✅

{cliente}, *{tecnico}* está no local trabalhando em *{servico}* do seu contrato _(OS {os})_ desde as _{hora}_.

Confira aqui:
{link}$tpl$),
  ('em_andamento', 'contrato', false, $tpl$✅ *Serviço contratado iniciado*

Olá {cliente}! O atendimento do seu contrato começou: *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o andamento:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$*Manutenção PMOC iniciada* ✅

{cliente}, a *manutenção preventiva programada* do seu contrato começou: *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$✅ *Manutenção programada em andamento*

Olá {cliente}! *{tecnico}* chegou e iniciou a *manutenção preventiva programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$*Sua manutenção PMOC começou* ✅

Oi {cliente}, *{tecnico}* deu início à *manutenção programada* do seu contrato — *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe o progresso:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$✅ *PMOC em execução*

Prezado(a) {cliente}, a *manutenção preventiva programada* teve início: *{tecnico}* está em *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$*Manutenção preventiva em curso* ✅

{cliente}, *{tecnico}* iniciou a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$✅ *Sua manutenção programada iniciou*

Olá {cliente}! *{tecnico}* começou a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$*Manutenção PMOC iniciada* ✅

{cliente}, a *manutenção preventiva programada* do seu contrato começou: *{tecnico}* iniciou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$✅ *Manutenção programada em andamento*

Olá {cliente}! *{tecnico}* chegou e iniciou a *manutenção preventiva programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$*Sua manutenção PMOC começou* ✅

Oi {cliente}, *{tecnico}* deu início à *manutenção programada* do seu contrato — *{servico}* _(OS {os})_ desde as _{hora}_.

Acompanhe em tempo real:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$✅ *PMOC em execução*

Prezado(a) {cliente}, a *manutenção preventiva programada* teve início: *{tecnico}* está em *{servico}* _(OS {os})_ desde as _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$*Manutenção preventiva em curso* ✅

{cliente}, *{tecnico}* iniciou a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Confira aqui:
{link}$tpl$),
  ('em_andamento', 'pmoc', false, $tpl$✅ *Sua manutenção programada iniciou*

Olá {cliente}! *{tecnico}* começou a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o andamento:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Serviço concluído!* 🎉

{cliente}, o técnico *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Veja o resumo do atendimento:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Atendimento finalizado*

Olá {cliente}! *{tecnico}* encerrou o serviço de *{servico}* _(OS {os})_ às _{hora}_.

Confira os detalhes:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Tudo pronto!* 🎉

Oi {cliente}, *{tecnico}* concluiu *{servico}* _(OS {os})_ às _{hora}_.

Veja o resumo:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Missão cumprida*

{cliente}, *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Acesse os detalhes do atendimento:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Serviço entregue!* 🎉

Prezado(a) {cliente}, *{tecnico}* concluiu *{servico}* _(OS {os})_ às _{hora}_.

Confira o relatório:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Atendimento concluído*

{cliente}, seu serviço de *{servico}* _(OS {os})_ foi finalizado por *{tecnico}* às _{hora}_.

Veja o resumo:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Prontinho, {cliente}!* 🎉

*{tecnico}* encerrou *{servico}* _(OS {os})_ às _{hora}_.

Acesse os detalhes:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Trabalho finalizado*

Olá {cliente}! *{tecnico}* concluiu com capricho *{servico}* _(OS {os})_ às _{hora}_.

Confira o resumo:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Seu equipamento está pronto!* 🎉

{cliente}, *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Serviço concluído*

Oi {cliente}, *{tecnico}* entregou *{servico}* _(OS {os})_ às _{hora}_.

Acesse o resumo do atendimento:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Serviço concluído!* 🎉

{cliente}, o técnico *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Atendimento finalizado*

Olá {cliente}! *{tecnico}* encerrou o serviço de *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Tudo pronto!* 🎉

Oi {cliente}, *{tecnico}* concluiu *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe em tempo real:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Missão cumprida*

{cliente}, *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Serviço entregue!* 🎉

Prezado(a) {cliente}, *{tecnico}* concluiu *{servico}* _(OS {os})_ às _{hora}_.

Confira aqui:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Atendimento concluído*

{cliente}, seu serviço de *{servico}* _(OS {os})_ foi finalizado por *{tecnico}* às _{hora}_.

Acompanhe o andamento:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$*Prontinho, {cliente}!* 🎉

*{tecnico}* encerrou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('concluida', 'avulsa', false, $tpl$🎉 *Trabalho finalizado*

Olá {cliente}! *{tecnico}* concluiu com capricho *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$*Atendimento de contrato concluído!* 🎉

{cliente}, conforme seu contrato, *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Veja o resumo:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$🎉 *Serviço do contrato finalizado*

Olá {cliente}! O atendimento do seu contrato foi concluído: *{tecnico}* encerrou *{servico}* _(OS {os})_ às _{hora}_.

Confira os detalhes:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$*Seu contrato foi atendido* 🎉

Oi {cliente}, *{tecnico}* concluiu *{servico}* previsto no seu contrato _(OS {os})_ às _{hora}_.

Veja o relatório:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$🎉 *Contrato em dia*

Prezado(a) {cliente}, *{tecnico}* finalizou o serviço de *{servico}* do seu contrato _(OS {os})_ às _{hora}_.

Confira o resumo:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$*Atendimento contratado entregue!* 🎉

{cliente}, *{tecnico}* concluiu *{servico}* _(OS {os})_ às _{hora}_, conforme seu contrato.

Acesse os detalhes:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$🎉 *Serviço do seu contrato concluído*

Olá {cliente}! *{tecnico}* encerrou *{servico}* _(OS {os})_ às _{hora}_.

Veja o resumo do atendimento:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$*Atendimento de contrato concluído!* 🎉

{cliente}, conforme seu contrato, *{tecnico}* finalizou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$🎉 *Serviço do contrato finalizado*

Olá {cliente}! O atendimento do seu contrato foi concluído: *{tecnico}* encerrou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$*Seu contrato foi atendido* 🎉

Oi {cliente}, *{tecnico}* concluiu *{servico}* previsto no seu contrato _(OS {os})_ às _{hora}_.

Acompanhe em tempo real:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$🎉 *Contrato em dia*

Prezado(a) {cliente}, *{tecnico}* finalizou o serviço de *{servico}* do seu contrato _(OS {os})_ às _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$*Atendimento contratado entregue!* 🎉

{cliente}, *{tecnico}* concluiu *{servico}* _(OS {os})_ às _{hora}_, conforme seu contrato.

Confira aqui:
{link}$tpl$),
  ('concluida', 'contrato', false, $tpl$🎉 *Serviço do seu contrato concluído*

Olá {cliente}! *{tecnico}* encerrou *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o andamento:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$*Manutenção PMOC concluída* 🎉

{cliente}, a *manutenção preventiva programada* do seu contrato — *{servico}* — foi concluída por *{tecnico}* _(OS {os})_ às _{hora}_.

O relatório e o certificado ficam disponíveis aqui:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$🎉 *Manutenção programada finalizada*

Olá {cliente}! *{tecnico}* concluiu a *manutenção preventiva programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

O relatório e o certificado estão disponíveis no link:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$*Sua manutenção PMOC está pronta!* 🎉

Oi {cliente}, *{tecnico}* finalizou a *manutenção programada* do seu contrato — *{servico}* _(OS {os})_ às _{hora}_.

Acesse o relatório e o certificado:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$🎉 *PMOC concluída*

Prezado(a) {cliente}, a *manutenção preventiva programada* — *{servico}* — foi concluída por *{tecnico}* _(OS {os})_ às _{hora}_.

O relatório e o certificado ficam disponíveis aqui:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$*Manutenção preventiva finalizada* 🎉

{cliente}, *{tecnico}* concluiu a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Baixe o relatório e o certificado:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$🎉 *Sua manutenção programada foi concluída*

Olá {cliente}! *{tecnico}* encerrou a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_ às _{hora}_.

O relatório e o certificado estão no link:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$*Manutenção PMOC concluída* 🎉

{cliente}, a *manutenção preventiva programada* do seu contrato — *{servico}* — foi concluída por *{tecnico}* _(OS {os})_ às _{hora}_.

Acompanhe:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$🎉 *Manutenção programada finalizada*

Olá {cliente}! *{tecnico}* concluiu a *manutenção preventiva programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe por aqui:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$*Sua manutenção PMOC está pronta!* 🎉

Oi {cliente}, *{tecnico}* finalizou a *manutenção programada* do seu contrato — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe em tempo real:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$🎉 *PMOC concluída*

Prezado(a) {cliente}, a *manutenção preventiva programada* — *{servico}* — foi concluída por *{tecnico}* _(OS {os})_ às _{hora}_.

Veja os detalhes:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$*Manutenção preventiva finalizada* 🎉

{cliente}, *{tecnico}* concluiu a *manutenção programada (PMOC)* — *{servico}* _(OS {os})_ às _{hora}_.

Confira aqui:
{link}$tpl$),
  ('concluida', 'pmoc', false, $tpl$🎉 *Sua manutenção programada foi concluída*

Olá {cliente}! *{tecnico}* encerrou a *manutenção preventiva programada* do seu contrato — *{servico}* _(OS {os})_ às _{hora}_.

Acompanhe o andamento:
{link}$tpl$);

-- Fim da migration.
