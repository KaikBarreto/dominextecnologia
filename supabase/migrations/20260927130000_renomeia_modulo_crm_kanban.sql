-- O módulo não é restrito a vendas: cada empresa pode criar funis Kanban para
-- pós-venda, atendimento e outros processos. Atualiza o nome canônico lido pelo
-- catálogo de módulos; o código estável `crm` e os contratos de billing não mudam.
UPDATE public.subscription_modules
SET name = 'CRM/Kanban',
    description = 'Funis Kanban, oportunidades, interações e webhooks de captação'
WHERE code = 'crm';
