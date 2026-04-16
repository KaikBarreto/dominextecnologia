-- Limpeza de dados demo lançados por engano em 2026-04-14 22:07:37
-- Remove equipamentos, clientes, inventário e categorias demo da Glacial Cold

-- 1. Equipamentos demo (cascade remove attachments e tasks)
DELETE FROM public.equipment WHERE created_at::text LIKE '2026-04-14 22:07:37%';

-- 2. Clientes demo (cascade remove contatos e equipamentos vinculados)
DELETE FROM public.customers WHERE created_at::text LIKE '2026-04-14 22:07:37%';

-- 3. Itens de inventário demo
DELETE FROM public.inventory WHERE created_at::text LIKE '2026-04-14 22:07:37%';

-- 4. Categorias de equipamento demo
DELETE FROM public.equipment_categories WHERE created_at::text LIKE '2026-04-14 22:07:37%';