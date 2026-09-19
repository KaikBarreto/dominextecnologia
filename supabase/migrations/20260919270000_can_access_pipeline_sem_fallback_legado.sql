-- ============================================================================
-- can_access_pipeline deixa de herdar o FALLBACK LEGADO de user_has_permission
--
-- O DEFEITO (latente, medido em 2026-09-19 no banco vivo)
-- ---------------------------------------------------------------------------
-- public.can_access_pipeline (20260918110000) e a fonte unica da ACL de funil
-- do CRM. Um dos ramos dela era:
--
--     OR public.user_has_permission(_user_id, 'fn:manage_crm')
--
-- public.user_has_permission (20260917150000) tem TRES ramos, e o terceiro e:
--
--     ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
--
-- ou seja: usuario que tem QUALQUER papel e NENHUMA linha em user_permissions
-- recebe true pra QUALQUER chave de permissao. Esse ramo e DELIBERADO e nao e
-- pra mexer — foi ele que impediu o permissionamento de trancar a base inteira
-- quando nasceu, e ele continua valendo pro resto do sistema.
--
-- O problema e especifico do CRM: ACL de funil e uma regra que o GESTOR
-- configura a mao ("so estes usuarios veem este funil"). Herdar o fallback
-- legado faz um usuario sem linha de permissao passar POR CIMA da configuracao
-- do gestor — exatamente o oposto do que a ACL existe pra fazer.
--
-- Esta migration troca SO esse ramo por um "gestor de CRM explicito":
-- e admin/super_admin, OU tem linha propria em user_permissions concedendo
-- '*' ou 'fn:manage_crm'. Isto e, `user_has_permission` MENOS o ramo 3.
-- Nada mais da funcao muda: assinatura, LANGUAGE sql, STABLE,
-- SECURITY DEFINER, search_path, GRANT/REVOKE e o _pipeline_id IS NULL => true
-- continuam iguais. As tres policies RESTRICTIVE que chamam esta funcao
-- (leads, crm_pipelines, crm_stages) NAO sao tocadas — CREATE OR REPLACE
-- preserva tudo de pe, inclusive os GRANTs (DROP FUNCTION levaria os GRANTs
-- junto, por isso nao ha DROP aqui).
--
-- MEDICAO DE IMPACTO (feita ANTES de aplicar, no banco de producao)
-- ---------------------------------------------------------------------------
--   * crm_pipeline_access: 4 linhas, 2 funis, 1 empresa (Glacial Cold Brasil).
--   * Pares (usuario x funil) da MESMA empresa: 97. Mudam de resultado: 0.
--   * Usuarios no ramo 3 na base inteira: 11, em 2 empresas (Deixamos limpo,
--     Fox Solution) — ambas com 0 leads e 0 linhas de ACL. Nenhum deles esta
--     numa empresa que usa ACL, entao ninguem perde acesso hoje.
--   * Leads vazando hoje por causa disso: 0 de 123 em funis restritos.
--   * Cross join TOTAL (93 perfis x 54 funis = 5022 pares, ignorando empresa):
--     22 pares mudam — todos de usuarios do ramo 3 de OUTRA empresa contra os
--     2 funis da Glacial. Esses pares ja eram barrados pela policy PERMISSIVA
--     de company_id; a mudanca so os barra uma segunda vez.
--
-- Portanto: efeito pratico HOJE = zero. Isto e conserto de defeito LATENTE, que
-- acordaria quando (a) uma empresa com usuario de ramo 3 configurasse ACL, ou
-- (b) nascesse usuario sem linha de permissao na Glacial.
--
-- POR QUE INLINE E NAO FUNCAO AUXILIAR
-- ---------------------------------------------------------------------------
-- Cogitou-se uma has_explicit_permission(_user_id, _key) reusavel. Hoje ela
-- teria UM chamador so, e criar funcao nova alarga a superficie publica (e o
-- types.ts) sem uso real. Fica inline, com este comentario explicando a regra.
-- Se um segundo chamador aparecer (ver "PENDENCIA" abaixo), extrair ai.
--
-- PENDENCIA CONHECIDA, FORA DESTE ESCOPO (decisao separada do CEO)
-- ---------------------------------------------------------------------------
-- A policy RESTRICTIVE "Leads visiveis apenas ao responsavel" (20260917150000)
-- chama o MESMO user_has_permission e tem o MESMO ponto cego. Medido hoje: se
-- o mesmo criterio fosse aplicado la, 0 usuarios e 0 leads mudariam de
-- visibilidade (924 pares usuario x lead avaliados). Nao foi alterada aqui de
-- proposito: o escopo aprovado foi "uma funcao so do CRM".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_access_pipeline(_pipeline_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- leads.pipeline_id e NULLABLE (decisao (b) de 20260918100000): lead sem
    -- funil NAO pode sumir da tela. Inalterado.
    _pipeline_id IS NULL

    -- GESTOR DE CRM EXPLICITO. E user_has_permission(_user_id,'fn:manage_crm')
    -- MENOS o ramo 3 (o "sem linha em user_permissions => true pra tudo").
    -- Inline de proposito: ACL de funil e configuracao explicita do gestor e
    -- nao pode ser furada por ausencia de configuracao de permissao.
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role IN ('admin'::app_role, 'super_admin'::app_role)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
       WHERE up.user_id = _user_id
         AND up.is_active
         AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_crm')
    )

    -- Default aberto: funil sem NENHUMA linha de ACL e visivel pra empresa
    -- inteira. Inalterado, e proposital (nenhuma empresa acorda com funil
    -- escondido).
    OR NOT EXISTS (
      SELECT 1 FROM public.crm_pipeline_access a
       WHERE a.pipeline_id = _pipeline_id
    )

    -- Usuario listado na ACL do funil. Inalterado.
    OR EXISTS (
      SELECT 1 FROM public.crm_pipeline_access a
       WHERE a.pipeline_id = _pipeline_id AND a.user_id = _user_id
    );
$$;

-- Reafirmados pra migration ser auto-suficiente (CREATE OR REPLACE ja preserva).
REVOKE ALL ON FUNCTION public.can_access_pipeline(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_pipeline(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_pipeline(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_pipeline(uuid, uuid) IS
  'Regra de acesso ao funil do CRM: sem nenhuma linha de ACL => aberto; com linhas => so os listados; gestor de CRM EXPLICITO (admin/super_admin em user_roles, ou linha ativa em user_permissions com ''*'' ou ''fn:manage_crm'') sempre passa. NAO usa user_has_permission: o fallback legado dela (sem linha em user_permissions => true pra tudo) passaria por cima da ACL que o gestor configurou. pipeline_id NULL => true (lead sem funil nao pode sumir). Fonte unica das policies RESTRICTIVE de crm_pipelines, crm_stages e leads.';
