-- A tabela de reconhecimento é uma trilha de auditoria. Mesmo com RLS sem policies
-- de escrita, remove também os privilégios diretos para manter defesa em profundidade:
-- admins autenticados escrevem exclusivamente pelas RPCs com guarda is_admin_user.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.asaas_reconciliation_acks FROM authenticated, anon;
