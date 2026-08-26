-- Migration: RLS wrap auth-function calls in (SELECT ...) for InitPlan caching
-- Gerado a partir da definicao VIVA das politicas (pg_policies / pg_get_expr).
-- Snapshot: 2026-08-26 (UTC) a partir do banco linked byqldosixshhuiuarszp.
--
-- POR QUE:
--   Chamadas cruas de funcoes STABLE de auth em predicados de RLS
--   (get_user_company_id/is_super_admin/is_admin_user/has_role com auth.uid())
--   sao reavaliadas POR LINHA quando o predicado vira Filter. Embrulhando em
--   (SELECT ...) o planner as promove a InitPlan: avaliadas 1x por consulta e
--   cacheadas. Ganho medido em caso RLS real (Filter): ~800ms -> ~17ms (~45x),
--   buffers 192k -> 3.9k. Em caso index-cond: empate (nunca piora).
--
-- SEMANTICA: IDENTICA. So se altera a FORMA (embrulho em subselect escalar);
--   nenhuma coluna, OR/AND, role, comando ou funcao fora da lista de 4 e tocada.
--   Isolamento multi-tenant inalterado (regra-lei nº2 do time).
--
-- ESCOPO: 345 politicas em 145 tabelas. 734 chamadas embrulhadas.
--   Funcoes embrulhadas (somente quando referenciam auth.uid()):
--     get_user_company_id, is_super_admin, is_admin_user, has_role
--   Funcoes NAO tocadas (fora de escopo): has_admin_permission, can_manage_users,
--     is_admin_or_gestor, can_bootstrap_admin, get_profile_company_id.
--   Chamadas ja embrulhadas foram detectadas e preservadas (nao ha duplo-embrulho).
--
-- IDEMPOTENCIA: ALTER POLICY substitui o predicado inteiro pelo texto ja embrulhado;
--   rodar 2x reaplica o mesmo texto (no-op efetivo). Cada ALTER e envolvido em
--   um bloco que ignora graciosamente politica/tabela ausente (undefined_object).
--
-- APLICACAO: pendente de OK do CEO (via Tech Lead). NAO aplicada ainda.

BEGIN;

SET LOCAL statement_timeout = '120s';


-- admin_crm_followup_template :: Admin CRM users can view admin_crm_followup_template (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can view admin_crm_followup_template" ON public."admin_crm_followup_template"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can view admin_crm_followup_template', 'admin_crm_followup_template';
END
$wrap$;

-- admin_crm_followup_template :: Super admins manage admin_crm_followup_template (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins manage admin_crm_followup_template" ON public."admin_crm_followup_template"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins manage admin_crm_followup_template', 'admin_crm_followup_template';
END
$wrap$;

-- admin_crm_stages :: Admin panel users manage admin_crm_stages (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users manage admin_crm_stages" ON public."admin_crm_stages"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users manage admin_crm_stages', 'admin_crm_stages';
END
$wrap$;

-- admin_financial_categories :: Admin panel users delete non-system admin_financial_categories (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users delete non-system admin_financial_categories" ON public."admin_financial_categories"
  USING ((( SELECT is_admin_user(auth.uid()) ) AND (is_system = false)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users delete non-system admin_financial_categories', 'admin_financial_categories';
END
$wrap$;

-- admin_financial_categories :: Admin panel users insert admin_financial_categories (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users insert admin_financial_categories" ON public."admin_financial_categories"
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users insert admin_financial_categories', 'admin_financial_categories';
END
$wrap$;

-- admin_financial_categories :: Admin panel users update admin_financial_categories (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users update admin_financial_categories" ON public."admin_financial_categories"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users update admin_financial_categories', 'admin_financial_categories';
END
$wrap$;

-- admin_financial_categories :: Admin panel users view admin_financial_categories (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users view admin_financial_categories" ON public."admin_financial_categories"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users view admin_financial_categories', 'admin_financial_categories';
END
$wrap$;

-- admin_financial_transactions :: Admin panel users delete admin_financial_transactions (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users delete admin_financial_transactions" ON public."admin_financial_transactions"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users delete admin_financial_transactions', 'admin_financial_transactions';
END
$wrap$;

-- admin_financial_transactions :: Admin panel users insert admin_financial_transactions (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users insert admin_financial_transactions" ON public."admin_financial_transactions"
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users insert admin_financial_transactions', 'admin_financial_transactions';
END
$wrap$;

-- admin_financial_transactions :: Admin panel users update admin_financial_transactions (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users update admin_financial_transactions" ON public."admin_financial_transactions"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users update admin_financial_transactions', 'admin_financial_transactions';
END
$wrap$;

-- admin_financial_transactions :: Admin panel users view admin_financial_transactions (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users view admin_financial_transactions" ON public."admin_financial_transactions"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users view admin_financial_transactions', 'admin_financial_transactions';
END
$wrap$;

-- admin_lead_interactions :: Admin CRM users can delete admin_lead_interactions (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can delete admin_lead_interactions" ON public."admin_lead_interactions"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can delete admin_lead_interactions', 'admin_lead_interactions';
END
$wrap$;

-- admin_lead_interactions :: Admin CRM users can insert admin_lead_interactions (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can insert admin_lead_interactions" ON public."admin_lead_interactions"
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can insert admin_lead_interactions', 'admin_lead_interactions';
END
$wrap$;

-- admin_lead_interactions :: Admin CRM users can update admin_lead_interactions (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can update admin_lead_interactions" ON public."admin_lead_interactions"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can update admin_lead_interactions', 'admin_lead_interactions';
END
$wrap$;

-- admin_lead_interactions :: Admin CRM users can view admin_lead_interactions (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can view admin_lead_interactions" ON public."admin_lead_interactions"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can view admin_lead_interactions', 'admin_lead_interactions';
END
$wrap$;

-- admin_lead_interactions :: Super admins can manage admin_lead_interactions (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage admin_lead_interactions" ON public."admin_lead_interactions"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage admin_lead_interactions', 'admin_lead_interactions';
END
$wrap$;

-- admin_leads :: Admin CRM users can delete admin_leads (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can delete admin_leads" ON public."admin_leads"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can delete admin_leads', 'admin_leads';
END
$wrap$;

-- admin_leads :: Admin CRM users can insert admin_leads (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can insert admin_leads" ON public."admin_leads"
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can insert admin_leads', 'admin_leads';
END
$wrap$;

-- admin_leads :: Admin CRM users can update admin_leads (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can update admin_leads" ON public."admin_leads"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can update admin_leads', 'admin_leads';
END
$wrap$;

-- admin_leads :: Admin CRM users can view admin_leads (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can view admin_leads" ON public."admin_leads"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can view admin_leads', 'admin_leads';
END
$wrap$;

-- admin_leads :: Super admins can manage admin_leads (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage admin_leads" ON public."admin_leads"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage admin_leads', 'admin_leads';
END
$wrap$;

-- admin_notifications :: Admin panel users update admin_notifications (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users update admin_notifications" ON public."admin_notifications"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users update admin_notifications', 'admin_notifications';
END
$wrap$;

-- admin_notifications :: Admin panel users view admin_notifications (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users view admin_notifications" ON public."admin_notifications"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users view admin_notifications', 'admin_notifications';
END
$wrap$;

-- admin_notifications :: User reads own targeted notifications (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "User reads own targeted notifications" ON public."admin_notifications"
  USING (((target_user_id = auth.uid()) OR ((target_user_id IS NULL) AND ( SELECT is_admin_user(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'User reads own targeted notifications', 'admin_notifications';
END
$wrap$;

-- admin_notifications :: User updates own targeted notifications (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "User updates own targeted notifications" ON public."admin_notifications"
  USING (((target_user_id = auth.uid()) OR ((target_user_id IS NULL) AND ( SELECT is_admin_user(auth.uid()) ))))
  WITH CHECK (((target_user_id = auth.uid()) OR ((target_user_id IS NULL) AND ( SELECT is_admin_user(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'User updates own targeted notifications', 'admin_notifications';
END
$wrap$;

-- admin_permissions :: Super admins can delete admin_permissions (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete admin_permissions" ON public."admin_permissions"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete admin_permissions', 'admin_permissions';
END
$wrap$;

-- admin_permissions :: Super admins can insert admin_permissions (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert admin_permissions" ON public."admin_permissions"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert admin_permissions', 'admin_permissions';
END
$wrap$;

-- admin_permissions :: Super admins can update admin_permissions (UPDATE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update admin_permissions" ON public."admin_permissions"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update admin_permissions', 'admin_permissions';
END
$wrap$;

-- admin_permissions :: Super admins can view admin_permissions (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can view admin_permissions" ON public."admin_permissions"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can view admin_permissions', 'admin_permissions';
END
$wrap$;

-- admin_tasks :: Admin CRM users can delete admin_tasks (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can delete admin_tasks" ON public."admin_tasks"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can delete admin_tasks', 'admin_tasks';
END
$wrap$;

-- admin_tasks :: Admin CRM users can insert admin_tasks (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can insert admin_tasks" ON public."admin_tasks"
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can insert admin_tasks', 'admin_tasks';
END
$wrap$;

-- admin_tasks :: Admin CRM users can update admin_tasks (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can update admin_tasks" ON public."admin_tasks"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can update admin_tasks', 'admin_tasks';
END
$wrap$;

-- admin_tasks :: Admin CRM users can view admin_tasks (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin CRM users can view admin_tasks" ON public."admin_tasks"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_crm'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin CRM users can view admin_tasks', 'admin_tasks';
END
$wrap$;

-- app_feature_flags :: app_feature_flags_write (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "app_feature_flags_write" ON public."app_feature_flags"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'app_feature_flags_write', 'app_feature_flags';
END
$wrap$;

-- blog_categories :: super_admin can delete blog categories (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can delete blog categories" ON public."blog_categories"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can delete blog categories', 'blog_categories';
END
$wrap$;

-- blog_categories :: super_admin can insert blog categories (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can insert blog categories" ON public."blog_categories"
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can insert blog categories', 'blog_categories';
END
$wrap$;

-- blog_categories :: super_admin can update blog categories (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can update blog categories" ON public."blog_categories"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can update blog categories', 'blog_categories';
END
$wrap$;

-- blog_post_comments :: super_admin can delete comments (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can delete comments" ON public."blog_post_comments"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can delete comments', 'blog_post_comments';
END
$wrap$;

-- blog_post_comments :: super_admin can update comments (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can update comments" ON public."blog_post_comments"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can update comments', 'blog_post_comments';
END
$wrap$;

-- blog_post_comments :: super_admin can view all comments (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can view all comments" ON public."blog_post_comments"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can view all comments', 'blog_post_comments';
END
$wrap$;

-- blog_posts :: super_admin can delete blog posts (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can delete blog posts" ON public."blog_posts"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can delete blog posts', 'blog_posts';
END
$wrap$;

-- blog_posts :: super_admin can insert blog posts (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can insert blog posts" ON public."blog_posts"
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can insert blog posts', 'blog_posts';
END
$wrap$;

-- blog_posts :: super_admin can read all blog posts (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can read all blog posts" ON public."blog_posts"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can read all blog posts', 'blog_posts';
END
$wrap$;

-- blog_posts :: super_admin can update blog posts (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin can update blog posts" ON public."blog_posts"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin can update blog posts', 'blog_posts';
END
$wrap$;

-- companies :: Admin users and own company can view companies (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users and own company can view companies" ON public."companies"
  USING ((( SELECT is_admin_user(auth.uid()) ) OR (id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users and own company can view companies', 'companies';
END
$wrap$;

-- companies :: Admin users can update companies (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users can update companies" ON public."companies"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users can update companies', 'companies';
END
$wrap$;

-- companies :: Super admins can delete companies (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete companies" ON public."companies"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete companies', 'companies';
END
$wrap$;

-- companies :: Super admins can insert companies (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert companies" ON public."companies"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert companies', 'companies';
END
$wrap$;

-- company_fiscal_settings :: Managers can insert fiscal settings for their company (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can insert fiscal settings for their company" ON public."company_fiscal_settings"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can insert fiscal settings for their company', 'company_fiscal_settings';
END
$wrap$;

-- company_fiscal_settings :: Managers can update fiscal settings for their company (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can update fiscal settings for their company" ON public."company_fiscal_settings"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can update fiscal settings for their company', 'company_fiscal_settings';
END
$wrap$;

-- company_fiscal_settings :: Users can view fiscal settings from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view fiscal settings from their company" ON public."company_fiscal_settings"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view fiscal settings from their company', 'company_fiscal_settings';
END
$wrap$;

-- company_modules :: Admins with admin_empresas can delete company_modules (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admins with admin_empresas can delete company_modules" ON public."company_modules"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_empresas'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admins with admin_empresas can delete company_modules', 'company_modules';
END
$wrap$;

-- company_modules :: Admins with admin_empresas can insert company_modules (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admins with admin_empresas can insert company_modules" ON public."company_modules"
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_empresas'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admins with admin_empresas can insert company_modules', 'company_modules';
END
$wrap$;

-- company_modules :: Admins with admin_empresas can update company_modules (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admins with admin_empresas can update company_modules" ON public."company_modules"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_empresas'::text)))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR has_admin_permission(auth.uid(), 'admin_empresas'::text)));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admins with admin_empresas can update company_modules', 'company_modules';
END
$wrap$;

-- company_modules :: Super admins can manage company_modules (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage company_modules" ON public."company_modules"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage company_modules', 'company_modules';
END
$wrap$;

-- company_modules :: Users can view own company modules (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company modules" ON public."company_modules"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company modules', 'company_modules';
END
$wrap$;

-- company_origins :: Super admins can manage origins (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage origins" ON public."company_origins"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage origins', 'company_origins';
END
$wrap$;

-- company_payments :: Admin users can view company_payments (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users can view company_payments" ON public."company_payments"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users can view company_payments', 'company_payments';
END
$wrap$;

-- company_payments :: Super admins can delete company_payments (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete company_payments" ON public."company_payments"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete company_payments', 'company_payments';
END
$wrap$;

-- company_payments :: Super admins can insert company_payments (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert company_payments" ON public."company_payments"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert company_payments', 'company_payments';
END
$wrap$;

-- company_payments :: Super admins can update company_payments (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update company_payments" ON public."company_payments"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update company_payments', 'company_payments';
END
$wrap$;

-- company_pmoc_document_templates :: company_pmoc_tpl_admin_gestor_insert (INSERT)  [wraps: qual=0 check=4]
DO $wrap$
BEGIN
  ALTER POLICY "company_pmoc_tpl_admin_gestor_insert" ON public."company_pmoc_document_templates"
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'company_pmoc_tpl_admin_gestor_insert', 'company_pmoc_document_templates';
END
$wrap$;

-- company_pmoc_document_templates :: company_pmoc_tpl_admin_gestor_update (UPDATE)  [wraps: qual=4 check=4]
DO $wrap$
BEGIN
  ALTER POLICY "company_pmoc_tpl_admin_gestor_update" ON public."company_pmoc_document_templates"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )))
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'company_pmoc_tpl_admin_gestor_update', 'company_pmoc_document_templates';
END
$wrap$;

-- company_pmoc_document_templates :: company_pmoc_tpl_super_admin_delete (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "company_pmoc_tpl_super_admin_delete" ON public."company_pmoc_document_templates"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'company_pmoc_tpl_super_admin_delete', 'company_pmoc_document_templates';
END
$wrap$;

-- company_pmoc_document_templates :: company_pmoc_tpl_tenant_select (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "company_pmoc_tpl_tenant_select" ON public."company_pmoc_document_templates"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'company_pmoc_tpl_tenant_select', 'company_pmoc_document_templates';
END
$wrap$;

-- company_settings :: Company settings visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Company settings visible to own company" ON public."company_settings"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company settings visible to own company', 'company_settings';
END
$wrap$;

-- company_settings :: System managers can manage company_settings (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage company_settings" ON public."company_settings"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage company_settings', 'company_settings';
END
$wrap$;

-- company_settings :: Users view own company_settings (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company_settings" ON public."company_settings"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company_settings', 'company_settings';
END
$wrap$;

-- company_whatsapp_settings :: Managers can insert whatsapp settings for their company (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can insert whatsapp settings for their company" ON public."company_whatsapp_settings"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can insert whatsapp settings for their company', 'company_whatsapp_settings';
END
$wrap$;

-- company_whatsapp_settings :: Managers can update whatsapp settings for their company (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can update whatsapp settings for their company" ON public."company_whatsapp_settings"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can update whatsapp settings for their company', 'company_whatsapp_settings';
END
$wrap$;

-- company_whatsapp_settings :: Users can view whatsapp settings from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view whatsapp settings from their company" ON public."company_whatsapp_settings"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view whatsapp settings from their company', 'company_whatsapp_settings';
END
$wrap$;

-- compra_cotacao_precos :: compra_cotacao_precos_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacao_precos_delete_own_company" ON public."compra_cotacao_precos"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacao_precos_delete_own_company', 'compra_cotacao_precos';
END
$wrap$;

-- compra_cotacao_precos :: compra_cotacao_precos_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacao_precos_insert_own_company" ON public."compra_cotacao_precos"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacao_precos_insert_own_company', 'compra_cotacao_precos';
END
$wrap$;

-- compra_cotacao_precos :: compra_cotacao_precos_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacao_precos_select_own_company" ON public."compra_cotacao_precos"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacao_precos_select_own_company', 'compra_cotacao_precos';
END
$wrap$;

-- compra_cotacao_precos :: compra_cotacao_precos_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacao_precos_update_own_company" ON public."compra_cotacao_precos"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacao_precos_update_own_company', 'compra_cotacao_precos';
END
$wrap$;

-- compra_cotacoes :: compra_cotacoes_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacoes_delete_own_company" ON public."compra_cotacoes"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacoes_delete_own_company', 'compra_cotacoes';
END
$wrap$;

-- compra_cotacoes :: compra_cotacoes_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacoes_insert_own_company" ON public."compra_cotacoes"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacoes_insert_own_company', 'compra_cotacoes';
END
$wrap$;

-- compra_cotacoes :: compra_cotacoes_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacoes_select_own_company" ON public."compra_cotacoes"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacoes_select_own_company', 'compra_cotacoes';
END
$wrap$;

-- compra_cotacoes :: compra_cotacoes_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compra_cotacoes_update_own_company" ON public."compra_cotacoes"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_cotacoes_update_own_company', 'compra_cotacoes';
END
$wrap$;

-- compra_materiais :: compra_materiais_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compra_materiais_delete_own_company" ON public."compra_materiais"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_materiais_delete_own_company', 'compra_materiais';
END
$wrap$;

-- compra_materiais :: compra_materiais_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compra_materiais_insert_own_company" ON public."compra_materiais"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_materiais_insert_own_company', 'compra_materiais';
END
$wrap$;

-- compra_materiais :: compra_materiais_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compra_materiais_select_own_company" ON public."compra_materiais"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_materiais_select_own_company', 'compra_materiais';
END
$wrap$;

-- compra_materiais :: compra_materiais_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compra_materiais_update_own_company" ON public."compra_materiais"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compra_materiais_update_own_company', 'compra_materiais';
END
$wrap$;

-- compras :: compras_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compras_delete_own_company" ON public."compras"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compras_delete_own_company', 'compras';
END
$wrap$;

-- compras :: compras_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compras_insert_own_company" ON public."compras"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compras_insert_own_company', 'compras';
END
$wrap$;

-- compras :: compras_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "compras_select_own_company" ON public."compras"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compras_select_own_company', 'compras';
END
$wrap$;

-- compras :: compras_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "compras_update_own_company" ON public."compras"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'compras_update_own_company', 'compras';
END
$wrap$;

-- compressor_specs :: super_admin manage compressor_specs (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage compressor_specs" ON public."compressor_specs"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage compressor_specs', 'compressor_specs';
END
$wrap$;

-- consent_records :: Managers can view company consent records (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can view company consent records" ON public."consent_records"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can view company consent records', 'consent_records';
END
$wrap$;

-- consent_records :: Super admins can view all consent records (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can view all consent records" ON public."consent_records"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can view all consent records', 'consent_records';
END
$wrap$;

-- contract_attachments :: Users delete own company contract_attachments (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users delete own company contract_attachments" ON public."contract_attachments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users delete own company contract_attachments', 'contract_attachments';
END
$wrap$;

-- contract_attachments :: Users insert own company contract_attachments (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users insert own company contract_attachments" ON public."contract_attachments"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users insert own company contract_attachments', 'contract_attachments';
END
$wrap$;

-- contract_attachments :: Users update own company contract_attachments (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users update own company contract_attachments" ON public."contract_attachments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users update own company contract_attachments', 'contract_attachments';
END
$wrap$;

-- contract_attachments :: Users view own company contract_attachments (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company contract_attachments" ON public."contract_attachments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company contract_attachments', 'contract_attachments';
END
$wrap$;

-- contract_environments :: Users can delete own company contract_environments (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can delete own company contract_environments" ON public."contract_environments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can delete own company contract_environments', 'contract_environments';
END
$wrap$;

-- contract_environments :: Users can insert own company contract_environments (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users can insert own company contract_environments" ON public."contract_environments"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can insert own company contract_environments', 'contract_environments';
END
$wrap$;

-- contract_environments :: Users can update own company contract_environments (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users can update own company contract_environments" ON public."contract_environments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can update own company contract_environments', 'contract_environments';
END
$wrap$;

-- contract_environments :: Users can view own company contract_environments (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company contract_environments" ON public."contract_environments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company contract_environments', 'contract_environments';
END
$wrap$;

-- contract_items :: Admin/gestor can manage contract_items (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin/gestor can manage contract_items" ON public."contract_items"
  USING ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.id = contract_items.contract_id) AND (c.company_id = ( SELECT get_user_company_id(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.id = contract_items.contract_id) AND (c.company_id = ( SELECT get_user_company_id(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin/gestor can manage contract_items', 'contract_items';
END
$wrap$;

-- contract_items :: Managers can delete own company contract_items (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can delete own company contract_items" ON public."contract_items"
  USING (((contract_id IN ( SELECT contracts.id
   FROM contracts
  WHERE (contracts.company_id = ( SELECT get_user_company_id(auth.uid()) )))) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can delete own company contract_items', 'contract_items';
END
$wrap$;

-- contract_items :: Users can view contract_items (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view contract_items" ON public."contract_items"
  USING ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.id = contract_items.contract_id) AND (c.company_id = ( SELECT get_user_company_id(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view contract_items', 'contract_items';
END
$wrap$;

-- contract_plan_activities :: Users can delete own company contract_plan_activities (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can delete own company contract_plan_activities" ON public."contract_plan_activities"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can delete own company contract_plan_activities', 'contract_plan_activities';
END
$wrap$;

-- contract_plan_activities :: Users can insert own company contract_plan_activities (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users can insert own company contract_plan_activities" ON public."contract_plan_activities"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can insert own company contract_plan_activities', 'contract_plan_activities';
END
$wrap$;

-- contract_plan_activities :: Users can update own company contract_plan_activities (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users can update own company contract_plan_activities" ON public."contract_plan_activities"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can update own company contract_plan_activities', 'contract_plan_activities';
END
$wrap$;

-- contract_plan_activities :: Users can view own company contract_plan_activities (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company contract_plan_activities" ON public."contract_plan_activities"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company contract_plan_activities', 'contract_plan_activities';
END
$wrap$;

-- contracts :: Admin/gestor can manage contracts (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin/gestor can manage contracts" ON public."contracts"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin/gestor can manage contracts', 'contracts';
END
$wrap$;

-- contracts :: Users can view own company contracts (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company contracts" ON public."contracts"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company contracts', 'contracts';
END
$wrap$;

-- cost_resource_items :: Company users can view cost_resource_items (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Company users can view cost_resource_items" ON public."cost_resource_items"
  USING ((EXISTS ( SELECT 1
   FROM cost_resources cr
  WHERE ((cr.id = cost_resource_items.resource_id) AND (cr.company_id = ( SELECT get_user_company_id(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company users can view cost_resource_items', 'cost_resource_items';
END
$wrap$;

-- cost_resource_items :: System managers can manage cost_resource_items (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage cost_resource_items" ON public."cost_resource_items"
  USING ((EXISTS ( SELECT 1
   FROM cost_resources cr
  WHERE ((cr.id = cost_resource_items.resource_id) AND (cr.company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM cost_resources cr
  WHERE ((cr.id = cost_resource_items.resource_id) AND (cr.company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage cost_resource_items', 'cost_resource_items';
END
$wrap$;

-- cost_resources :: Company users can view cost_resources (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Company users can view cost_resources" ON public."cost_resources"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company users can view cost_resources', 'cost_resources';
END
$wrap$;

-- cost_resources :: System managers can manage cost_resources (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage cost_resources" ON public."cost_resources"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage cost_resources', 'cost_resources';
END
$wrap$;

-- credit_card_bills :: Users can create credit card bills for their company (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users can create credit card bills for their company" ON public."credit_card_bills"
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can create credit card bills for their company', 'credit_card_bills';
END
$wrap$;

-- credit_card_bills :: Users can delete their company credit card bills (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can delete their company credit card bills" ON public."credit_card_bills"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can delete their company credit card bills', 'credit_card_bills';
END
$wrap$;

-- credit_card_bills :: Users can manage their company credit card bills (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users can manage their company credit card bills" ON public."credit_card_bills"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can manage their company credit card bills', 'credit_card_bills';
END
$wrap$;

-- credit_card_bills :: Users can update their company credit card bills (UPDATE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can update their company credit card bills" ON public."credit_card_bills"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can update their company credit card bills', 'credit_card_bills';
END
$wrap$;

-- credit_card_bills :: Users can view their company credit card bills (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view their company credit card bills" ON public."credit_card_bills"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view their company credit card bills', 'credit_card_bills';
END
$wrap$;

-- crm_stages :: System managers can manage crm_stages (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage crm_stages" ON public."crm_stages"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage crm_stages', 'crm_stages';
END
$wrap$;

-- crm_stages :: Users view own company crm_stages (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company crm_stages" ON public."crm_stages"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company crm_stages', 'crm_stages';
END
$wrap$;

-- crm_webhooks :: Users manage own company crm_webhooks (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company crm_webhooks" ON public."crm_webhooks"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company crm_webhooks', 'crm_webhooks';
END
$wrap$;

-- customer_contacts :: Users manage own customer_contacts (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own customer_contacts" ON public."customer_contacts"
  USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_contacts.customer_id) AND ((c.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_contacts.customer_id) AND ((c.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own customer_contacts', 'customer_contacts';
END
$wrap$;

-- customer_origins :: System managers can manage customer_origins (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage customer_origins" ON public."customer_origins"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage customer_origins', 'customer_origins';
END
$wrap$;

-- customer_origins :: Users view own company customer_origins (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company customer_origins" ON public."customer_origins"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company customer_origins', 'customer_origins';
END
$wrap$;

-- customer_portals :: Users manage own customer_portals (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own customer_portals" ON public."customer_portals"
  USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_portals.customer_id) AND ((c.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_portals.customer_id) AND ((c.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own customer_portals', 'customer_portals';
END
$wrap$;

-- customers :: Customers visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Customers visible to own company" ON public."customers"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Customers visible to own company', 'customers';
END
$wrap$;

-- customers :: Users delete own company customers (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users delete own company customers" ON public."customers"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users delete own company customers', 'customers';
END
$wrap$;

-- customers :: Users insert own company customers (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users insert own company customers" ON public."customers"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users insert own company customers', 'customers';
END
$wrap$;

-- customers :: Users update own company customers (UPDATE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users update own company customers" ON public."customers"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users update own company customers', 'customers';
END
$wrap$;

-- customers :: Users view own company customers (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company customers" ON public."customers"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company customers', 'customers';
END
$wrap$;

-- destructive_actions_audit :: select_own_company_or_master (SELECT)  [wraps: qual=3 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "select_own_company_or_master" ON public."destructive_actions_audit"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND ( SELECT has_role(auth.uid(), 'admin'::app_role) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'select_own_company_or_master', 'destructive_actions_audit';
END
$wrap$;

-- disc_assessments :: DISC visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "DISC visible to own company" ON public."disc_assessments"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'DISC visible to own company', 'disc_assessments';
END
$wrap$;

-- disc_assessments :: Managers can manage own company DISC (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can manage own company DISC" ON public."disc_assessments"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can manage own company DISC', 'disc_assessments';
END
$wrap$;

-- domiflix_episodes :: domiflix_episodes_admin_all (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "domiflix_episodes_admin_all" ON public."domiflix_episodes"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'domiflix_episodes_admin_all', 'domiflix_episodes';
END
$wrap$;

-- domiflix_seasons :: domiflix_seasons_admin_all (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "domiflix_seasons_admin_all" ON public."domiflix_seasons"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'domiflix_seasons_admin_all', 'domiflix_seasons';
END
$wrap$;

-- domiflix_section_titles :: domiflix_section_titles_admin_all (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "domiflix_section_titles_admin_all" ON public."domiflix_section_titles"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'domiflix_section_titles_admin_all', 'domiflix_section_titles';
END
$wrap$;

-- domiflix_sections :: domiflix_sections_admin_all (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "domiflix_sections_admin_all" ON public."domiflix_sections"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'domiflix_sections_admin_all', 'domiflix_sections';
END
$wrap$;

-- domiflix_titles :: domiflix_titles_admin_all (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "domiflix_titles_admin_all" ON public."domiflix_titles"
  USING ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )))
  WITH CHECK ((( SELECT has_role(auth.uid(), 'super_admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'domiflix_titles_admin_all', 'domiflix_titles';
END
$wrap$;

-- employee_movements :: Users manage own employee_movements (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own employee_movements" ON public."employee_movements"
  USING ((EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = employee_movements.employee_id) AND ((e.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = employee_movements.employee_id) AND ((e.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own employee_movements', 'employee_movements';
END
$wrap$;

-- employees :: Employees visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Employees visible to own company" ON public."employees"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Employees visible to own company', 'employees';
END
$wrap$;

-- employees :: Managers can manage own company employees (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can manage own company employees" ON public."employees"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can manage own company employees', 'employees';
END
$wrap$;

-- employees :: Users manage own company employees (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company employees" ON public."employees"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company employees', 'employees';
END
$wrap$;

-- equipment :: Equipment visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Equipment visible to own company" ON public."equipment"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Equipment visible to own company', 'equipment';
END
$wrap$;

-- equipment :: Users manage own company equipment (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company equipment" ON public."equipment"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company equipment', 'equipment';
END
$wrap$;

-- equipment :: Users view own company equipment (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company equipment" ON public."equipment"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company equipment', 'equipment';
END
$wrap$;

-- equipment_attachments :: Users manage own equipment_attachments (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own equipment_attachments" ON public."equipment_attachments"
  USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_attachments.equipment_id) AND ((e.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_attachments.equipment_id) AND ((e.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own equipment_attachments', 'equipment_attachments';
END
$wrap$;

-- equipment_brands :: super_admin manage equipment_brands (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage equipment_brands" ON public."equipment_brands"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage equipment_brands', 'equipment_brands';
END
$wrap$;

-- equipment_categories :: System managers can manage equipment_categories (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage equipment_categories" ON public."equipment_categories"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage equipment_categories', 'equipment_categories';
END
$wrap$;

-- equipment_categories :: Users view own company equipment_categories (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company equipment_categories" ON public."equipment_categories"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company equipment_categories', 'equipment_categories';
END
$wrap$;

-- equipment_error_codes :: super_admin manage equipment_error_codes (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage equipment_error_codes" ON public."equipment_error_codes"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage equipment_error_codes', 'equipment_error_codes';
END
$wrap$;

-- equipment_field_config :: System managers can manage equipment_field_config (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage equipment_field_config" ON public."equipment_field_config"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage equipment_field_config', 'equipment_field_config';
END
$wrap$;

-- equipment_field_config :: Users view own company equipment_field_config (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company equipment_field_config" ON public."equipment_field_config"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company equipment_field_config', 'equipment_field_config';
END
$wrap$;

-- equipment_model_categories :: super_admin manage equipment_model_categories (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage equipment_model_categories" ON public."equipment_model_categories"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage equipment_model_categories', 'equipment_model_categories';
END
$wrap$;

-- equipment_models :: super_admin manage equipment_models (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage equipment_models" ON public."equipment_models"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage equipment_models', 'equipment_models';
END
$wrap$;

-- equipment_tasks :: Users manage own equipment_tasks (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own equipment_tasks" ON public."equipment_tasks"
  USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_tasks.equipment_id) AND ((e.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_tasks.equipment_id) AND ((e.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own equipment_tasks', 'equipment_tasks';
END
$wrap$;

-- financial_accounts :: Managers can manage own company accounts (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can manage own company accounts" ON public."financial_accounts"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can manage own company accounts', 'financial_accounts';
END
$wrap$;

-- financial_accounts :: Users can view own company accounts (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company accounts" ON public."financial_accounts"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company accounts', 'financial_accounts';
END
$wrap$;

-- financial_categories :: Cannot delete system categories (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Cannot delete system categories" ON public."financial_categories"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (is_system = false) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Cannot delete system categories', 'financial_categories';
END
$wrap$;

-- financial_categories :: Managers can manage own company categories (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can manage own company categories" ON public."financial_categories"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can manage own company categories', 'financial_categories';
END
$wrap$;

-- financial_categories :: Users can view own company categories (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company categories" ON public."financial_categories"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company categories', 'financial_categories';
END
$wrap$;

-- financial_transaction_attachments :: Managers delete own company financial_transaction_attachments (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers delete own company financial_transaction_attachments" ON public."financial_transaction_attachments"
  USING (((EXISTS ( SELECT 1
   FROM financial_transactions ft
  WHERE ((ft.id = financial_transaction_attachments.transaction_id) AND (ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers delete own company financial_transaction_attachments', 'financial_transaction_attachments';
END
$wrap$;

-- financial_transaction_attachments :: Users insert own company financial_transaction_attachments (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users insert own company financial_transaction_attachments" ON public."financial_transaction_attachments"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM financial_transactions ft
  WHERE ((ft.id = financial_transaction_attachments.transaction_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users insert own company financial_transaction_attachments', 'financial_transaction_attachments';
END
$wrap$;

-- financial_transaction_attachments :: Users update own company financial_transaction_attachments (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users update own company financial_transaction_attachments" ON public."financial_transaction_attachments"
  USING ((EXISTS ( SELECT 1
   FROM financial_transactions ft
  WHERE ((ft.id = financial_transaction_attachments.transaction_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM financial_transactions ft
  WHERE ((ft.id = financial_transaction_attachments.transaction_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users update own company financial_transaction_attachments', 'financial_transaction_attachments';
END
$wrap$;

-- financial_transaction_attachments :: Users view own company financial_transaction_attachments (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company financial_transaction_attachments" ON public."financial_transaction_attachments"
  USING ((EXISTS ( SELECT 1
   FROM financial_transactions ft
  WHERE ((ft.id = financial_transaction_attachments.transaction_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company financial_transaction_attachments', 'financial_transaction_attachments';
END
$wrap$;

-- financial_transactions :: Managers can delete own company financial_transactions (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can delete own company financial_transactions" ON public."financial_transactions"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can delete own company financial_transactions', 'financial_transactions';
END
$wrap$;

-- financial_transactions :: Users manage own company financial_transactions (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company financial_transactions" ON public."financial_transactions"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company financial_transactions', 'financial_transactions';
END
$wrap$;

-- form_questions :: Managers manage own company form_questions (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Managers manage own company form_questions" ON public."form_questions"
  USING ((((EXISTS ( SELECT 1
   FROM form_templates ft
  WHERE ((ft.id = form_questions.template_id) AND (ft.company_id = ( SELECT get_user_company_id(auth.uid()) ))))) AND can_manage_system(auth.uid())) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK ((((EXISTS ( SELECT 1
   FROM form_templates ft
  WHERE ((ft.id = form_questions.template_id) AND (ft.company_id = ( SELECT get_user_company_id(auth.uid()) ))))) AND can_manage_system(auth.uid())) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers manage own company form_questions', 'form_questions';
END
$wrap$;

-- form_questions :: Users view own company form_questions (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company form_questions" ON public."form_questions"
  USING ((EXISTS ( SELECT 1
   FROM form_templates ft
  WHERE ((ft.id = form_questions.template_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company form_questions', 'form_questions';
END
$wrap$;

-- form_responses :: Form responses visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Form responses visible to own company" ON public."form_responses"
  USING ((service_order_id IN ( SELECT service_orders.id
   FROM service_orders
  WHERE (service_orders.company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Form responses visible to own company', 'form_responses';
END
$wrap$;

-- form_responses :: Users manage own form_responses (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own form_responses" ON public."form_responses"
  USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = form_responses.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = form_responses.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own form_responses', 'form_responses';
END
$wrap$;

-- form_template_service_types :: Users manage own form_template_service_types (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own form_template_service_types" ON public."form_template_service_types"
  USING ((EXISTS ( SELECT 1
   FROM form_templates ft
  WHERE ((ft.id = form_template_service_types.template_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM form_templates ft
  WHERE ((ft.id = form_template_service_types.template_id) AND ((ft.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own form_template_service_types', 'form_template_service_types';
END
$wrap$;

-- form_templates :: Managers manage own company form_templates (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Managers manage own company form_templates" ON public."form_templates"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers manage own company form_templates', 'form_templates';
END
$wrap$;

-- form_templates :: Users view own company form_templates (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company form_templates" ON public."form_templates"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company form_templates', 'form_templates';
END
$wrap$;

-- holidays :: Manage own company holidays (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Manage own company holidays" ON public."holidays"
  USING (((company_id IS NULL) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Manage own company holidays', 'holidays';
END
$wrap$;

-- inventory :: Inventory visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Inventory visible to own company" ON public."inventory"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Inventory visible to own company', 'inventory';
END
$wrap$;

-- inventory :: Users manage own company inventory (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company inventory" ON public."inventory"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company inventory', 'inventory';
END
$wrap$;

-- inventory_count_items :: inventory_count_items_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_items_delete_own_company" ON public."inventory_count_items"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_items_delete_own_company', 'inventory_count_items';
END
$wrap$;

-- inventory_count_items :: inventory_count_items_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_items_insert_own_company" ON public."inventory_count_items"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_items_insert_own_company', 'inventory_count_items';
END
$wrap$;

-- inventory_count_items :: inventory_count_items_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_items_select_own_company" ON public."inventory_count_items"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_items_select_own_company', 'inventory_count_items';
END
$wrap$;

-- inventory_count_items :: inventory_count_items_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_items_update_own_company" ON public."inventory_count_items"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_items_update_own_company', 'inventory_count_items';
END
$wrap$;

-- inventory_count_stocks :: inventory_count_stocks_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_stocks_delete_own_company" ON public."inventory_count_stocks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_stocks_delete_own_company', 'inventory_count_stocks';
END
$wrap$;

-- inventory_count_stocks :: inventory_count_stocks_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_stocks_insert_own_company" ON public."inventory_count_stocks"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_stocks_insert_own_company', 'inventory_count_stocks';
END
$wrap$;

-- inventory_count_stocks :: inventory_count_stocks_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_stocks_select_own_company" ON public."inventory_count_stocks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_stocks_select_own_company', 'inventory_count_stocks';
END
$wrap$;

-- inventory_count_stocks :: inventory_count_stocks_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_count_stocks_update_own_company" ON public."inventory_count_stocks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_count_stocks_update_own_company', 'inventory_count_stocks';
END
$wrap$;

-- inventory_counts :: inventory_counts_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_counts_delete_own_company" ON public."inventory_counts"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_counts_delete_own_company', 'inventory_counts';
END
$wrap$;

-- inventory_counts :: inventory_counts_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_counts_insert_own_company" ON public."inventory_counts"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_counts_insert_own_company', 'inventory_counts';
END
$wrap$;

-- inventory_counts :: inventory_counts_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_counts_select_own_company" ON public."inventory_counts"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_counts_select_own_company', 'inventory_counts';
END
$wrap$;

-- inventory_counts :: inventory_counts_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_counts_update_own_company" ON public."inventory_counts"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_counts_update_own_company', 'inventory_counts';
END
$wrap$;

-- inventory_movements :: Users view own inventory_movements (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own inventory_movements" ON public."inventory_movements"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((EXISTS ( SELECT 1
   FROM inventory i
  WHERE ((i.id = inventory_movements.inventory_id) AND (i.company_id = ( SELECT get_user_company_id(auth.uid()) ))))) AND can_access_stock(auth.uid(), stock_id))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own inventory_movements', 'inventory_movements';
END
$wrap$;

-- inventory_stock_levels :: inventory_stock_levels_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_stock_levels_delete_own_company" ON public."inventory_stock_levels"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_access_stock(auth.uid(), stock_id))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_stock_levels_delete_own_company', 'inventory_stock_levels';
END
$wrap$;

-- inventory_stock_levels :: inventory_stock_levels_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_stock_levels_insert_own_company" ON public."inventory_stock_levels"
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_access_stock(auth.uid(), stock_id))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_stock_levels_insert_own_company', 'inventory_stock_levels';
END
$wrap$;

-- inventory_stock_levels :: inventory_stock_levels_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_stock_levels_select_own_company" ON public."inventory_stock_levels"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_access_stock(auth.uid(), stock_id))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_stock_levels_select_own_company', 'inventory_stock_levels';
END
$wrap$;

-- inventory_stock_levels :: inventory_stock_levels_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "inventory_stock_levels_update_own_company" ON public."inventory_stock_levels"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_access_stock(auth.uid(), stock_id))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_access_stock(auth.uid(), stock_id))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'inventory_stock_levels_update_own_company', 'inventory_stock_levels';
END
$wrap$;

-- lead_capture_forms :: Users manage own company lead_capture_forms (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company lead_capture_forms" ON public."lead_capture_forms"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company lead_capture_forms', 'lead_capture_forms';
END
$wrap$;

-- lead_capture_submissions_log :: Users view own company lead_capture_log (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company lead_capture_log" ON public."lead_capture_submissions_log"
  USING (((form_id IN ( SELECT lead_capture_forms.id
   FROM lead_capture_forms
  WHERE (lead_capture_forms.company_id = ( SELECT get_user_company_id(auth.uid()) )))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company lead_capture_log', 'lead_capture_submissions_log';
END
$wrap$;

-- lead_interactions :: Users manage own lead_interactions (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own lead_interactions" ON public."lead_interactions"
  USING ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_interactions.lead_id) AND ((l.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_interactions.lead_id) AND ((l.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own lead_interactions', 'lead_interactions';
END
$wrap$;

-- leads :: Users manage own company leads (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company leads" ON public."leads"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company leads', 'leads';
END
$wrap$;

-- ledger_asaas :: Admin panel users delete ledger_asaas (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users delete ledger_asaas" ON public."ledger_asaas"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users delete ledger_asaas', 'ledger_asaas';
END
$wrap$;

-- ledger_asaas :: Admin panel users insert ledger_asaas (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users insert ledger_asaas" ON public."ledger_asaas"
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users insert ledger_asaas', 'ledger_asaas';
END
$wrap$;

-- ledger_asaas :: Admin panel users update ledger_asaas (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users update ledger_asaas" ON public."ledger_asaas"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users update ledger_asaas', 'ledger_asaas';
END
$wrap$;

-- ledger_asaas :: Admin panel users view ledger_asaas (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin panel users view ledger_asaas" ON public."ledger_asaas"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin panel users view ledger_asaas', 'ledger_asaas';
END
$wrap$;

-- master_login_audit :: Super admins can view master login audit (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can view master login audit" ON public."master_login_audit"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can view master login audit', 'master_login_audit';
END
$wrap$;

-- material_groups :: material_groups_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "material_groups_delete_own_company" ON public."material_groups"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'material_groups_delete_own_company', 'material_groups';
END
$wrap$;

-- material_groups :: material_groups_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "material_groups_insert_own_company" ON public."material_groups"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'material_groups_insert_own_company', 'material_groups';
END
$wrap$;

-- material_groups :: material_groups_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "material_groups_select_own_company" ON public."material_groups"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'material_groups_select_own_company', 'material_groups';
END
$wrap$;

-- material_groups :: material_groups_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "material_groups_update_own_company" ON public."material_groups"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'material_groups_update_own_company', 'material_groups';
END
$wrap$;

-- nfe_imports :: nfe_imports_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "nfe_imports_delete_own_company" ON public."nfe_imports"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nfe_imports_delete_own_company', 'nfe_imports';
END
$wrap$;

-- nfe_imports :: nfe_imports_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "nfe_imports_insert_own_company" ON public."nfe_imports"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nfe_imports_insert_own_company', 'nfe_imports';
END
$wrap$;

-- nfe_imports :: nfe_imports_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "nfe_imports_select_own_company" ON public."nfe_imports"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nfe_imports_select_own_company', 'nfe_imports';
END
$wrap$;

-- nfe_imports :: nfe_imports_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "nfe_imports_update_own_company" ON public."nfe_imports"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nfe_imports_update_own_company', 'nfe_imports';
END
$wrap$;

-- nfse_emissions :: Users can view nfse emissions from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view nfse emissions from their company" ON public."nfse_emissions"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view nfse emissions from their company', 'nfse_emissions';
END
$wrap$;

-- nfse_events :: Users can view nfse events from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view nfse events from their company" ON public."nfse_events"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view nfse events from their company', 'nfse_events';
END
$wrap$;

-- nfse_tiers :: Super admins can manage nfse tiers (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage nfse tiers" ON public."nfse_tiers"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage nfse tiers', 'nfse_tiers';
END
$wrap$;

-- nps_criteria :: Managers can delete nps_criteria (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can delete nps_criteria" ON public."nps_criteria"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can delete nps_criteria', 'nps_criteria';
END
$wrap$;

-- nps_criteria :: Managers can insert nps_criteria (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can insert nps_criteria" ON public."nps_criteria"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can insert nps_criteria', 'nps_criteria';
END
$wrap$;

-- nps_criteria :: Managers can update nps_criteria (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can update nps_criteria" ON public."nps_criteria"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can update nps_criteria', 'nps_criteria';
END
$wrap$;

-- nps_criteria :: Users can view nps_criteria from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view nps_criteria from their company" ON public."nps_criteria"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view nps_criteria from their company', 'nps_criteria';
END
$wrap$;

-- nps_settings :: nps_settings_insert_manage_system (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "nps_settings_insert_manage_system" ON public."nps_settings"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nps_settings_insert_manage_system', 'nps_settings';
END
$wrap$;

-- nps_settings :: nps_settings_select_own_company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "nps_settings_select_own_company" ON public."nps_settings"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nps_settings_select_own_company', 'nps_settings';
END
$wrap$;

-- nps_settings :: nps_settings_update_manage_system (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "nps_settings_update_manage_system" ON public."nps_settings"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'nps_settings_update_manage_system', 'nps_settings';
END
$wrap$;

-- org_charts :: Managers can manage own company org charts (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can manage own company org charts" ON public."org_charts"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can manage own company org charts', 'org_charts';
END
$wrap$;

-- org_charts :: Org charts visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Org charts visible to own company" ON public."org_charts"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Org charts visible to own company', 'org_charts';
END
$wrap$;

-- org_charts :: Users manage own company org charts (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company org charts" ON public."org_charts"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company org charts', 'org_charts';
END
$wrap$;

-- os_photos :: Managers can delete own company os_photos (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can delete own company os_photos" ON public."os_photos"
  USING (((service_order_id IN ( SELECT service_orders.id
   FROM service_orders
  WHERE (service_orders.company_id = ( SELECT get_user_company_id(auth.uid()) )))) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can delete own company os_photos', 'os_photos';
END
$wrap$;

-- os_photos :: Technicians can insert photos for own company OS (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Technicians can insert photos for own company OS" ON public."os_photos"
  WITH CHECK ((service_order_id IN ( SELECT service_orders.id
   FROM service_orders
  WHERE (service_orders.company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Technicians can insert photos for own company OS', 'os_photos';
END
$wrap$;

-- os_photos :: Users delete own os_photos (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users delete own os_photos" ON public."os_photos"
  USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = os_photos.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users delete own os_photos', 'os_photos';
END
$wrap$;

-- os_photos :: Users view own os_photos (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own os_photos" ON public."os_photos"
  USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = os_photos.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own os_photos', 'os_photos';
END
$wrap$;

-- os_statuses :: System managers can manage os_statuses (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage os_statuses" ON public."os_statuses"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage os_statuses', 'os_statuses';
END
$wrap$;

-- os_statuses :: Users view own company os_statuses (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company os_statuses" ON public."os_statuses"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company os_statuses', 'os_statuses';
END
$wrap$;

-- pmoc_activity_catalog :: Super admin can delete pmoc_activity_catalog (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admin can delete pmoc_activity_catalog" ON public."pmoc_activity_catalog"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admin can delete pmoc_activity_catalog', 'pmoc_activity_catalog';
END
$wrap$;

-- pmoc_activity_catalog :: Super admin can insert pmoc_activity_catalog (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admin can insert pmoc_activity_catalog" ON public."pmoc_activity_catalog"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admin can insert pmoc_activity_catalog', 'pmoc_activity_catalog';
END
$wrap$;

-- pmoc_activity_catalog :: Super admin can update pmoc_activity_catalog (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admin can update pmoc_activity_catalog" ON public."pmoc_activity_catalog"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admin can update pmoc_activity_catalog', 'pmoc_activity_catalog';
END
$wrap$;

-- pmoc_contract_documents_custom :: pmoc_custom_admin_delete (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_custom_admin_delete" ON public."pmoc_contract_documents_custom"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_contracts(auth.uid())) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_custom_admin_delete', 'pmoc_contract_documents_custom';
END
$wrap$;

-- pmoc_contract_documents_custom :: pmoc_custom_admin_gestor_insert (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_custom_admin_gestor_insert" ON public."pmoc_contract_documents_custom"
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_contracts(auth.uid())) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_custom_admin_gestor_insert', 'pmoc_contract_documents_custom';
END
$wrap$;

-- pmoc_contract_documents_custom :: pmoc_custom_admin_gestor_update (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_custom_admin_gestor_update" ON public."pmoc_contract_documents_custom"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_contracts(auth.uid())) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )))
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_contracts(auth.uid())) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_custom_admin_gestor_update', 'pmoc_contract_documents_custom';
END
$wrap$;

-- pmoc_contract_documents_custom :: pmoc_custom_tenant_select (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_custom_tenant_select" ON public."pmoc_contract_documents_custom"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_custom_tenant_select', 'pmoc_contract_documents_custom';
END
$wrap$;

-- pmoc_documents :: pmoc_docs_notes_update (UPDATE)  [wraps: qual=4 check=4]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_docs_notes_update" ON public."pmoc_documents"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )))
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_docs_notes_update', 'pmoc_documents';
END
$wrap$;

-- pmoc_documents :: pmoc_docs_super_admin_delete (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_docs_super_admin_delete" ON public."pmoc_documents"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_docs_super_admin_delete', 'pmoc_documents';
END
$wrap$;

-- pmoc_documents :: pmoc_docs_tenant_select (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "pmoc_docs_tenant_select" ON public."pmoc_documents"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'pmoc_docs_tenant_select', 'pmoc_documents';
END
$wrap$;

-- pricing_settings :: Users manage own company pricing_settings (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company pricing_settings" ON public."pricing_settings"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company pricing_settings', 'pricing_settings';
END
$wrap$;

-- profiles :: Super admins can update any profile (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update any profile" ON public."profiles"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update any profile', 'profiles';
END
$wrap$;

-- profiles :: Super admins can view all profiles (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can view all profiles" ON public."profiles"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can view all profiles', 'profiles';
END
$wrap$;

-- profiles :: System managers can update company profiles (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can update company profiles" ON public."profiles"
  USING ((can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))))
  WITH CHECK ((can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can update company profiles', 'profiles';
END
$wrap$;

-- profiles :: System managers can view company profiles (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can view company profiles" ON public."profiles"
  USING ((can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can view company profiles', 'profiles';
END
$wrap$;

-- quote_item_materials :: Users manage own quote_item_materials (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own quote_item_materials" ON public."quote_item_materials"
  USING ((EXISTS ( SELECT 1
   FROM (quote_items qi
     JOIN quotes q ON ((q.id = qi.quote_id)))
  WHERE ((qi.id = quote_item_materials.quote_item_id) AND ((q.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (quote_items qi
     JOIN quotes q ON ((q.id = qi.quote_id)))
  WHERE ((qi.id = quote_item_materials.quote_item_id) AND ((q.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own quote_item_materials', 'quote_item_materials';
END
$wrap$;

-- quote_items :: Users manage own quote_items (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own quote_items" ON public."quote_items"
  USING ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_items.quote_id) AND ((q.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_items.quote_id) AND ((q.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own quote_items', 'quote_items';
END
$wrap$;

-- quote_views :: Members can view quote_views of own company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Members can view quote_views of own company" ON public."quote_views"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Members can view quote_views of own company', 'quote_views';
END
$wrap$;

-- quotes :: Users manage own company quotes (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company quotes" ON public."quotes"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company quotes', 'quotes';
END
$wrap$;

-- refrigerant_gases :: super_admin manage refrigerant_gases (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage refrigerant_gases" ON public."refrigerant_gases"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage refrigerant_gases', 'refrigerant_gases';
END
$wrap$;

-- remote_configs :: super_admin manage remote_configs (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin manage remote_configs" ON public."remote_configs"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin manage remote_configs', 'remote_configs';
END
$wrap$;

-- responsible_technicians :: Admin can delete RTs (DELETE)  [wraps: qual=3 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin can delete RTs" ON public."responsible_technicians"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND ( SELECT has_role(auth.uid(), 'admin'::app_role) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin can delete RTs', 'responsible_technicians';
END
$wrap$;

-- responsible_technicians :: Admin/gestor can insert RTs (INSERT)  [wraps: qual=0 check=4]
DO $wrap$
BEGIN
  ALTER POLICY "Admin/gestor can insert RTs" ON public."responsible_technicians"
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin/gestor can insert RTs', 'responsible_technicians';
END
$wrap$;

-- responsible_technicians :: Admin/gestor can update RTs (UPDATE)  [wraps: qual=4 check=4]
DO $wrap$
BEGIN
  ALTER POLICY "Admin/gestor can update RTs" ON public."responsible_technicians"
  USING ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )))
  WITH CHECK ((((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ))) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin/gestor can update RTs', 'responsible_technicians';
END
$wrap$;

-- responsible_technicians :: Users can view RTs of own company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view RTs of own company" ON public."responsible_technicians"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT has_role(auth.uid(), 'super_admin'::app_role) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view RTs of own company', 'responsible_technicians';
END
$wrap$;

-- salespeople :: Admin users can view salespeople (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users can view salespeople" ON public."salespeople"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users can view salespeople', 'salespeople';
END
$wrap$;

-- salespeople :: Super admins can delete salespeople (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete salespeople" ON public."salespeople"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete salespeople', 'salespeople';
END
$wrap$;

-- salespeople :: Super admins can insert salespeople (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert salespeople" ON public."salespeople"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert salespeople', 'salespeople';
END
$wrap$;

-- salespeople :: Super admins can update salespeople (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update salespeople" ON public."salespeople"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update salespeople', 'salespeople';
END
$wrap$;

-- salesperson_advances :: Admin users can view salesperson_advances (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users can view salesperson_advances" ON public."salesperson_advances"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users can view salesperson_advances', 'salesperson_advances';
END
$wrap$;

-- salesperson_advances :: Super admins can delete salesperson_advances (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete salesperson_advances" ON public."salesperson_advances"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete salesperson_advances', 'salesperson_advances';
END
$wrap$;

-- salesperson_advances :: Super admins can insert salesperson_advances (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert salesperson_advances" ON public."salesperson_advances"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert salesperson_advances', 'salesperson_advances';
END
$wrap$;

-- salesperson_advances :: Super admins can update salesperson_advances (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update salesperson_advances" ON public."salesperson_advances"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update salesperson_advances', 'salesperson_advances';
END
$wrap$;

-- salesperson_payments :: Admin users can view salesperson_payments (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users can view salesperson_payments" ON public."salesperson_payments"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users can view salesperson_payments', 'salesperson_payments';
END
$wrap$;

-- salesperson_payments :: Super admins can delete salesperson_payments (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete salesperson_payments" ON public."salesperson_payments"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete salesperson_payments', 'salesperson_payments';
END
$wrap$;

-- salesperson_payments :: Super admins can insert salesperson_payments (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert salesperson_payments" ON public."salesperson_payments"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert salesperson_payments', 'salesperson_payments';
END
$wrap$;

-- salesperson_payments :: Super admins can update salesperson_payments (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update salesperson_payments" ON public."salesperson_payments"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update salesperson_payments', 'salesperson_payments';
END
$wrap$;

-- salesperson_sales :: Admin users can view salesperson_sales (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users can view salesperson_sales" ON public."salesperson_sales"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users can view salesperson_sales', 'salesperson_sales';
END
$wrap$;

-- salesperson_sales :: Super admins can delete salesperson_sales (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can delete salesperson_sales" ON public."salesperson_sales"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can delete salesperson_sales', 'salesperson_sales';
END
$wrap$;

-- salesperson_sales :: Super admins can insert salesperson_sales (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can insert salesperson_sales" ON public."salesperson_sales"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can insert salesperson_sales', 'salesperson_sales';
END
$wrap$;

-- salesperson_sales :: Super admins can update salesperson_sales (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can update salesperson_sales" ON public."salesperson_sales"
  USING (( SELECT is_super_admin(auth.uid()) ))
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can update salesperson_sales', 'salesperson_sales';
END
$wrap$;

-- service_cost_resources :: Users view own service_cost_resources (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own service_cost_resources" ON public."service_cost_resources"
  USING ((EXISTS ( SELECT 1
   FROM service_types st
  WHERE ((st.id = service_cost_resources.service_id) AND ((st.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own service_cost_resources', 'service_cost_resources';
END
$wrap$;

-- service_costs :: Users manage own company service_costs (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company service_costs" ON public."service_costs"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company service_costs', 'service_costs';
END
$wrap$;

-- service_gifts :: Users view own service_gifts (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own service_gifts" ON public."service_gifts"
  USING ((EXISTS ( SELECT 1
   FROM service_types st
  WHERE ((st.id = service_gifts.service_id) AND ((st.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own service_gifts', 'service_gifts';
END
$wrap$;

-- service_materials :: Users manage own company service_materials (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company service_materials" ON public."service_materials"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )))
  WITH CHECK ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company service_materials', 'service_materials';
END
$wrap$;

-- service_order_activities :: Users can delete own company service_order_activities (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can delete own company service_order_activities" ON public."service_order_activities"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can delete own company service_order_activities', 'service_order_activities';
END
$wrap$;

-- service_order_activities :: Users can insert own company service_order_activities (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users can insert own company service_order_activities" ON public."service_order_activities"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can insert own company service_order_activities', 'service_order_activities';
END
$wrap$;

-- service_order_activities :: Users can update own company service_order_activities (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users can update own company service_order_activities" ON public."service_order_activities"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can update own company service_order_activities', 'service_order_activities';
END
$wrap$;

-- service_order_activities :: Users can view own company service_order_activities (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view own company service_order_activities" ON public."service_order_activities"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view own company service_order_activities', 'service_order_activities';
END
$wrap$;

-- service_order_assignees :: Managers can delete own company service_order_assignees (DELETE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can delete own company service_order_assignees" ON public."service_order_assignees"
  USING (((service_order_id IN ( SELECT service_orders.id
   FROM service_orders
  WHERE (service_orders.company_id = ( SELECT get_user_company_id(auth.uid()) )))) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can delete own company service_order_assignees', 'service_order_assignees';
END
$wrap$;

-- service_order_assignees :: Users manage own service_order_assignees (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own service_order_assignees" ON public."service_order_assignees"
  USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_assignees.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_assignees.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own service_order_assignees', 'service_order_assignees';
END
$wrap$;

-- service_order_equipment :: Editors delete own service_order_equipment (DELETE)  [wraps: qual=3 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Editors delete own service_order_equipment" ON public."service_order_equipment"
  USING (((can_edit_os(auth.uid()) OR ( SELECT is_super_admin(auth.uid()) )) AND (EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_equipment.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Editors delete own service_order_equipment', 'service_order_equipment';
END
$wrap$;

-- service_order_equipment :: Editors insert own service_order_equipment (INSERT)  [wraps: qual=0 check=3]
DO $wrap$
BEGIN
  ALTER POLICY "Editors insert own service_order_equipment" ON public."service_order_equipment"
  WITH CHECK (((can_edit_os(auth.uid()) OR ( SELECT is_super_admin(auth.uid()) )) AND (EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_equipment.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Editors insert own service_order_equipment', 'service_order_equipment';
END
$wrap$;

-- service_order_equipment :: Editors update own service_order_equipment (UPDATE)  [wraps: qual=3 check=3]
DO $wrap$
BEGIN
  ALTER POLICY "Editors update own service_order_equipment" ON public."service_order_equipment"
  USING (((can_edit_os(auth.uid()) OR ( SELECT is_super_admin(auth.uid()) )) AND (EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_equipment.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))))))
  WITH CHECK (((can_edit_os(auth.uid()) OR ( SELECT is_super_admin(auth.uid()) )) AND (EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_equipment.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Editors update own service_order_equipment', 'service_order_equipment';
END
$wrap$;

-- service_order_equipment :: Users view own service_order_equipment (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own service_order_equipment" ON public."service_order_equipment"
  USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_equipment.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own service_order_equipment', 'service_order_equipment';
END
$wrap$;

-- service_orders :: Service orders visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Service orders visible to own company" ON public."service_orders"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Service orders visible to own company', 'service_orders';
END
$wrap$;

-- service_orders :: Users manage own company service_orders (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company service_orders" ON public."service_orders"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company service_orders', 'service_orders';
END
$wrap$;

-- service_rating_criteria :: Users can view service_rating_criteria from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view service_rating_criteria from their company" ON public."service_rating_criteria"
  USING ((EXISTS ( SELECT 1
   FROM (service_ratings sr
     JOIN service_orders so ON ((so.id = sr.service_order_id)))
  WHERE ((sr.id = service_rating_criteria.rating_id) AND (so.company_id = ( SELECT get_user_company_id(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view service_rating_criteria from their company', 'service_rating_criteria';
END
$wrap$;

-- service_ratings :: Users manage own service_ratings (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own service_ratings" ON public."service_ratings"
  USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_ratings.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_ratings.service_order_id) AND ((so.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own service_ratings', 'service_ratings';
END
$wrap$;

-- service_type_categories :: service_type_categories_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "service_type_categories_delete_own_company" ON public."service_type_categories"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'service_type_categories_delete_own_company', 'service_type_categories';
END
$wrap$;

-- service_type_categories :: service_type_categories_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "service_type_categories_insert_own_company" ON public."service_type_categories"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'service_type_categories_insert_own_company', 'service_type_categories';
END
$wrap$;

-- service_type_categories :: service_type_categories_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "service_type_categories_select_own_company" ON public."service_type_categories"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'service_type_categories_select_own_company', 'service_type_categories';
END
$wrap$;

-- service_type_categories :: service_type_categories_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "service_type_categories_update_own_company" ON public."service_type_categories"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'service_type_categories_update_own_company', 'service_type_categories';
END
$wrap$;

-- service_types :: System managers can manage service_types (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage service_types" ON public."service_types"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage service_types', 'service_types';
END
$wrap$;

-- service_types :: Users view own company service_types (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company service_types" ON public."service_types"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company service_types', 'service_types';
END
$wrap$;

-- stock_access :: stock_access_delete_admin_gestor (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "stock_access_delete_admin_gestor" ON public."stock_access"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND is_admin_or_gestor(auth.uid()))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stock_access_delete_admin_gestor', 'stock_access';
END
$wrap$;

-- stock_access :: stock_access_insert_admin_gestor (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "stock_access_insert_admin_gestor" ON public."stock_access"
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND is_admin_or_gestor(auth.uid()))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stock_access_insert_admin_gestor', 'stock_access';
END
$wrap$;

-- stock_access :: stock_access_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "stock_access_select_own_company" ON public."stock_access"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stock_access_select_own_company', 'stock_access';
END
$wrap$;

-- stock_access :: stock_access_update_admin_gestor (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "stock_access_update_admin_gestor" ON public."stock_access"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND is_admin_or_gestor(auth.uid()))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND is_admin_or_gestor(auth.uid()))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stock_access_update_admin_gestor', 'stock_access';
END
$wrap$;

-- stocks :: stocks_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "stocks_delete_own_company" ON public."stocks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stocks_delete_own_company', 'stocks';
END
$wrap$;

-- stocks :: stocks_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "stocks_insert_own_company" ON public."stocks"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stocks_insert_own_company', 'stocks';
END
$wrap$;

-- stocks :: stocks_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "stocks_select_own_company" ON public."stocks"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_access_stock(auth.uid(), id))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stocks_select_own_company', 'stocks';
END
$wrap$;

-- stocks :: stocks_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "stocks_update_own_company" ON public."stocks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'stocks_update_own_company', 'stocks';
END
$wrap$;

-- subscription_cancellation_requests :: Admin users and own company view cancellation_requests (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users and own company view cancellation_requests" ON public."subscription_cancellation_requests"
  USING ((( SELECT is_admin_user(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users and own company view cancellation_requests', 'subscription_cancellation_requests';
END
$wrap$;

-- subscription_cancellation_requests :: Admin users update cancellation_requests (UPDATE)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users update cancellation_requests" ON public."subscription_cancellation_requests"
  USING (( SELECT is_admin_user(auth.uid()) ))
  WITH CHECK (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users update cancellation_requests', 'subscription_cancellation_requests';
END
$wrap$;

-- subscription_cancellation_requests :: Own company creates cancellation_requests (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Own company creates cancellation_requests" ON public."subscription_cancellation_requests"
  WITH CHECK ((( SELECT is_admin_user(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Own company creates cancellation_requests', 'subscription_cancellation_requests';
END
$wrap$;

-- subscription_history :: super_admin inserts subscription_history (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin inserts subscription_history" ON public."subscription_history"
  WITH CHECK (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin inserts subscription_history', 'subscription_history';
END
$wrap$;

-- subscription_history :: super_admin reads subscription_history (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin reads subscription_history" ON public."subscription_history"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin reads subscription_history', 'subscription_history';
END
$wrap$;

-- subscription_modules :: Super admins can manage modules (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage modules" ON public."subscription_modules"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage modules', 'subscription_modules';
END
$wrap$;

-- subscription_payments :: Admin users and own company view subscription_payments (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin users and own company view subscription_payments" ON public."subscription_payments"
  USING ((( SELECT is_admin_user(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin users and own company view subscription_payments', 'subscription_payments';
END
$wrap$;

-- subscription_plans :: Super admins can manage plans (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage plans" ON public."subscription_plans"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage plans', 'subscription_plans';
END
$wrap$;

-- suppliers :: suppliers_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "suppliers_delete_own_company" ON public."suppliers"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'suppliers_delete_own_company', 'suppliers';
END
$wrap$;

-- suppliers :: suppliers_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "suppliers_insert_own_company" ON public."suppliers"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'suppliers_insert_own_company', 'suppliers';
END
$wrap$;

-- suppliers :: suppliers_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "suppliers_select_own_company" ON public."suppliers"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'suppliers_select_own_company', 'suppliers';
END
$wrap$;

-- suppliers :: suppliers_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "suppliers_update_own_company" ON public."suppliers"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'suppliers_update_own_company', 'suppliers';
END
$wrap$;

-- task_types :: System managers can manage task_types (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "System managers can manage task_types" ON public."task_types"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (can_manage_system(auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'System managers can manage task_types', 'task_types';
END
$wrap$;

-- task_types :: Users view own company task_types (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users view own company task_types" ON public."task_types"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users view own company task_types', 'task_types';
END
$wrap$;

-- team_members :: Users manage own team_members (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own team_members" ON public."team_members"
  USING ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_members.team_id) AND ((t.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_members.team_id) AND ((t.company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) ))))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own team_members', 'team_members';
END
$wrap$;

-- teams :: Users manage own company teams (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Users manage own company teams" ON public."teams"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users manage own company teams', 'teams';
END
$wrap$;

-- technician_locations :: Locations visible to own company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Locations visible to own company" ON public."technician_locations"
  USING ((service_order_id IN ( SELECT service_orders.id
   FROM service_orders
  WHERE (service_orders.company_id = ( SELECT get_user_company_id(auth.uid()) )))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Locations visible to own company', 'technician_locations';
END
$wrap$;

-- technician_locations :: tl_insert_own_user_same_company (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "tl_insert_own_user_same_company" ON public."technician_locations"
  WITH CHECK (((auth.uid() = user_id) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'tl_insert_own_user_same_company', 'technician_locations';
END
$wrap$;

-- technician_locations :: tl_select_tenant_scoped (SELECT)  [wraps: qual=4 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "tl_select_tenant_scoped" ON public."technician_locations"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR ((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) ) OR ( SELECT has_role(auth.uid(), 'gestor'::app_role) ) OR (auth.uid() = user_id)))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'tl_select_tenant_scoped', 'technician_locations';
END
$wrap$;

-- tenant_charges :: Company can manage own charges (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Company can manage own charges" ON public."tenant_charges"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company can manage own charges', 'tenant_charges';
END
$wrap$;

-- tenant_payment_accounts :: Company can manage own payment account (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Company can manage own payment account" ON public."tenant_payment_accounts"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company can manage own payment account', 'tenant_payment_accounts';
END
$wrap$;

-- tenant_payment_webhook_events :: Company can view own webhook events (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Company can view own webhook events" ON public."tenant_payment_webhook_events"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company can view own webhook events', 'tenant_payment_webhook_events';
END
$wrap$;

-- tenant_subscriptions :: Company can manage own subscriptions (ALL)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "Company can manage own subscriptions" ON public."tenant_subscriptions"
  USING ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))))
  WITH CHECK ((( SELECT is_super_admin(auth.uid()) ) OR (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Company can manage own subscriptions', 'tenant_subscriptions';
END
$wrap$;

-- tenant_tasks :: tenant_tasks_delete_own_company (DELETE)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "tenant_tasks_delete_own_company" ON public."tenant_tasks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'tenant_tasks_delete_own_company', 'tenant_tasks';
END
$wrap$;

-- tenant_tasks :: tenant_tasks_insert_own_company (INSERT)  [wraps: qual=0 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "tenant_tasks_insert_own_company" ON public."tenant_tasks"
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'tenant_tasks_insert_own_company', 'tenant_tasks';
END
$wrap$;

-- tenant_tasks :: tenant_tasks_select_own_company (SELECT)  [wraps: qual=2 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "tenant_tasks_select_own_company" ON public."tenant_tasks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'tenant_tasks_select_own_company', 'tenant_tasks';
END
$wrap$;

-- tenant_tasks :: tenant_tasks_update_own_company (UPDATE)  [wraps: qual=2 check=2]
DO $wrap$
BEGIN
  ALTER POLICY "tenant_tasks_update_own_company" ON public."tenant_tasks"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) OR ( SELECT is_super_admin(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'tenant_tasks_update_own_company', 'tenant_tasks';
END
$wrap$;

-- time_records :: Admin can manage time_records (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin can manage time_records" ON public."time_records"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin can manage time_records', 'time_records';
END
$wrap$;

-- time_records :: Users can insert own time_records (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users can insert own time_records" ON public."time_records"
  WITH CHECK (((user_id = auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can insert own time_records', 'time_records';
END
$wrap$;

-- time_schedules :: Admin can manage schedules (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin can manage schedules" ON public."time_schedules"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin can manage schedules', 'time_schedules';
END
$wrap$;

-- time_settings :: Admin can manage time_settings (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin can manage time_settings" ON public."time_settings"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin can manage time_settings', 'time_settings';
END
$wrap$;

-- time_settings :: Users can view time_settings (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view time_settings" ON public."time_settings"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view time_settings', 'time_settings';
END
$wrap$;

-- time_sheets :: Admin can manage time_sheets (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Admin can manage time_sheets" ON public."time_sheets"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())))
  WITH CHECK (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin can manage time_sheets', 'time_sheets';
END
$wrap$;

-- time_sheets :: Admin can view company time_sheets (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Admin can view company time_sheets" ON public."time_sheets"
  USING (((company_id = ( SELECT get_user_company_id(auth.uid()) )) AND can_manage_system(auth.uid())));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Admin can view company time_sheets', 'time_sheets';
END
$wrap$;

-- time_sheets :: Users can insert own time_sheets (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Users can insert own time_sheets" ON public."time_sheets"
  WITH CHECK (((user_id = auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can insert own time_sheets', 'time_sheets';
END
$wrap$;

-- time_sheets :: Users can update own time_sheets (UPDATE)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can update own time_sheets" ON public."time_sheets"
  USING (((user_id = auth.uid()) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can update own time_sheets', 'time_sheets';
END
$wrap$;

-- usage_events :: admin users read usage_events (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "admin users read usage_events" ON public."usage_events"
  USING (( SELECT is_admin_user(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'admin users read usage_events', 'usage_events';
END
$wrap$;

-- usage_events :: authenticated users insert usage_events for own company (INSERT)  [wraps: qual=0 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "authenticated users insert usage_events for own company" ON public."usage_events"
  WITH CHECK (((auth.uid() IS NOT NULL) AND (company_id = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'authenticated users insert usage_events for own company', 'usage_events';
END
$wrap$;

-- usage_events :: super_admin reads all usage_events (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "super_admin reads all usage_events" ON public."usage_events"
  USING (( SELECT is_super_admin(auth.uid()) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'super_admin reads all usage_events', 'usage_events';
END
$wrap$;

-- user_roles :: Managers can manage company user_roles (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Managers can manage company user_roles" ON public."user_roles"
  USING ((can_manage_users(auth.uid()) AND (get_profile_company_id(user_id) = ( SELECT get_user_company_id(auth.uid()) ))))
  WITH CHECK ((can_manage_users(auth.uid()) AND (get_profile_company_id(user_id) = ( SELECT get_user_company_id(auth.uid()) ))));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Managers can manage company user_roles', 'user_roles';
END
$wrap$;

-- user_roles :: Super admins can manage user_roles (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage user_roles" ON public."user_roles"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage user_roles', 'user_roles';
END
$wrap$;

-- whatsapp_events :: Users can view whatsapp events from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view whatsapp events from their company" ON public."whatsapp_events"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view whatsapp events from their company', 'whatsapp_events';
END
$wrap$;

-- whatsapp_opt_outs :: Users can view whatsapp opt-outs from their company (SELECT)  [wraps: qual=1 check=0]
DO $wrap$
BEGIN
  ALTER POLICY "Users can view whatsapp opt-outs from their company" ON public."whatsapp_opt_outs"
  USING ((company_id = ( SELECT get_user_company_id(auth.uid()) )));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Users can view whatsapp opt-outs from their company', 'whatsapp_opt_outs';
END
$wrap$;

-- whatsapp_templates :: Super admins can manage whatsapp templates (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage whatsapp templates" ON public."whatsapp_templates"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage whatsapp templates', 'whatsapp_templates';
END
$wrap$;

-- whatsapp_tiers :: Super admins can manage whatsapp tiers (ALL)  [wraps: qual=1 check=1]
DO $wrap$
BEGIN
  ALTER POLICY "Super admins can manage whatsapp tiers" ON public."whatsapp_tiers"
  USING (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ))
  WITH CHECK (( SELECT has_role(auth.uid(), 'super_admin'::app_role) ));
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'skip: policy % on % inexistente', 'Super admins can manage whatsapp tiers', 'whatsapp_tiers';
END
$wrap$;


COMMIT;
