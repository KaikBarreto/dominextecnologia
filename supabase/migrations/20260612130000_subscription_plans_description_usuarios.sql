-- Alinha os subtítulos dos cards de checkout (subscription_plans.description)
-- aos limites canônicos 5/10/15 e à terminologia "usuários" (decisão CEO,
-- plano docs/planos/2026-06-12-alinhamento-planos-superficies.md).
-- Textos antigos vinham da era Starter/Pro/Enterprise ("Até 20 técnicos" etc.).
-- Não toca em personalizado nem em price/max_users/included_modules.
-- Idempotente: re-rodar apenas reescreve os mesmos valores.

DO $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.subscription_plans
     SET description = 'Para equipes de até 5 usuários'
   WHERE code = 'start';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'start: % row(s) atualizadas', v_count;

  UPDATE public.subscription_plans
     SET description = 'Para equipes de até 10 usuários'
   WHERE code = 'avancado';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'avancado: % row(s) atualizadas', v_count;

  UPDATE public.subscription_plans
     SET description = 'Para equipes de até 15 usuários'
   WHERE code = 'master';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'master: % row(s) atualizadas', v_count;
END $$;
