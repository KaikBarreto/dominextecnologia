-- Ajuste de catálogo: ICP do Dominex é prestador de serviço, então a referência
-- correta de nota fiscal é NFS-e (nota fiscal de serviço), não NF-e.
-- O frontend já foi corrigido; aqui alinhamos a description do módulo no catálogo.
-- NÃO mexer no code 'nfe' (chave interna usada no gating de módulos) nem no name.

DO $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.subscription_modules
  SET description = 'Emissão de NFS-e (nota fiscal de serviço) integrada ao sistema'
  WHERE code = 'nfe';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'subscription_modules atualizados (code=nfe): %', v_count;
END $$;
