-- =============================================================================
-- org_charts — fecha a ACL default que concedia privilégio a `anon`
-- =============================================================================
-- PORQUÊ: `public.org_charts` nasceu antes de descobrirmos que a DEFAULT ACL
-- deste banco concede privilégio a `anon` em TODA tabela nova (memória
-- default_acl_concede_anon_em_toda_tabela_nova). Auditoria de 2026-10-01
-- confirmou no prod que `anon` tinha SELECT/INSERT/UPDATE/DELETE/REFERENCES/
-- TRIGGER nessa tabela.
--
-- HOJE NÃO HÁ VAZAMENTO: as 3 policies vigentes de org_charts são todas `TO
-- authenticated`, então a RLS barra o papel `anon` por falta de policy. O
-- problema é que isso deixa o organograma (dado de RH: nome, cargo, hierarquia,
-- e-mail de funcionário) atrás de UMA trava só — se alguém, algum dia, criar
-- uma policy permissiva sem restringir o papel (ex: `FOR ALL USING (true)` pra
-- cobrir um portal público ou super_admin), o GRANT já estaria lá esperando e o
-- dado vaza pra chave anon, que é PÚBLICA no bundle do frontend.
-- Lei nº 1 do projeto: RLS é segurança, GRANT é a outra linha de defesa.
-- Precisa das duas. Esta migration restaura a segunda.
--
-- O QUE FAZ: revoga tudo de `anon` e reafirma (idempotente) o acesso de quem
-- de fato usa a feature — `authenticated` (tela de Organograma, via RLS por
-- company_id) e `service_role` (edge functions / admin Auctus).
--
-- IRMÃ: public.processes (20261001130000) já nasceu com esse REVOKE no passo 6.
-- Esta migration só traz org_charts pro mesmo padrão.
--
-- IDEMPOTENTE: REVOKE e GRANT são declarativos — rodar N vezes dá o mesmo
-- estado final. Nenhum DDL destrutivo, nenhuma policy tocada, zero mudança de
-- dado (0 rows afetadas).
-- =============================================================================

-- PASSO 1 — tira o papel anônimo da tabela.
-- Cobre a tabela e as sequences/colunas herdadas do GRANT default.
REVOKE ALL ON public.org_charts FROM anon;

-- PASSO 2 — reafirma quem precisa continuar entrando.
-- O REVOKE acima é só pra `anon`, mas deixamos o GRANT explícito aqui pra que a
-- migration seja auto-suficiente: se um dia alguém rodar um REVOKE mais largo,
-- reaplicar este arquivo devolve o acesso correto sem adivinhação.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_charts TO authenticated;
GRANT ALL ON public.org_charts TO service_role;

-- NOTA: as policies de RLS de org_charts NÃO foram alteradas por esta migration.
-- Continuam valendo as 3 existentes, todas `TO authenticated` e filtradas por
-- company_id. Quem define regra de RLS é o Dev Plataforma & Multi-tenant.
