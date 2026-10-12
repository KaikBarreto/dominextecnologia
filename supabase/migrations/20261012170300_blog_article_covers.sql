-- Capas localizadas dos 10 novos temas do blog (pt-br, en e es).
-- Os arquivos são públicos no domínio canônico e também alimentam og:image.

WITH covers(locale, slug, cover_image_url) AS (
  VALUES
    ('pt-br', 'como-conseguir-mais-clientes-empresa-de-servicos', 'https://www.dominex.app/images/blog/covers/como-conseguir-mais-clientes-empresa-de-servicos.jpg'),
    ('en', 'how-to-get-more-customers-service-business', 'https://www.dominex.app/images/blog/covers/how-to-get-more-customers-service-business.jpg'),
    ('es', 'como-conseguir-mas-clientes-empresa-servicios', 'https://www.dominex.app/images/blog/covers/como-conseguir-mas-clientes-empresa-servicios.jpg'),
    ('pt-br', 'nfse-para-prestadores-o-que-e-quando-emitir', 'https://www.dominex.app/images/blog/covers/nfse-para-prestadores-o-que-e-quando-emitir.jpg'),
    ('en', 'brazilian-service-invoice-nfse-when-to-issue', 'https://www.dominex.app/images/blog/covers/brazilian-service-invoice-nfse-when-to-issue.jpg'),
    ('es', 'nfse-brasil-cuando-emitir-factura-servicios', 'https://www.dominex.app/images/blog/covers/nfse-brasil-cuando-emitir-factura-servicios.jpg'),
    ('pt-br', 'como-abrir-empresa-de-servicos-mei-me-cnae-impostos', 'https://www.dominex.app/images/blog/covers/como-abrir-empresa-de-servicos-mei-me-cnae-impostos.jpg'),
    ('en', 'how-to-start-service-company-brazil-mei-me-cnae-taxes', 'https://www.dominex.app/images/blog/covers/how-to-start-service-company-brazil-mei-me-cnae-taxes.jpg'),
    ('es', 'como-abrir-empresa-servicios-brasil-mei-me-cnae-impuestos', 'https://www.dominex.app/images/blog/covers/como-abrir-empresa-servicios-brasil-mei-me-cnae-impuestos.jpg'),
    ('pt-br', 'checklist-relatorio-atendimento-tecnico-modelo', 'https://www.dominex.app/images/blog/covers/checklist-relatorio-atendimento-tecnico-modelo.jpg'),
    ('en', 'field-service-report-checklist-template', 'https://www.dominex.app/images/blog/covers/field-service-report-checklist-template.jpg'),
    ('es', 'plantilla-informe-servicio-tecnico-checklist', 'https://www.dominex.app/images/blog/covers/plantilla-informe-servicio-tecnico-checklist.jpg'),
    ('pt-br', 'como-reduzir-inadimplencia-cobrar-clientes', 'https://www.dominex.app/images/blog/covers/como-reduzir-inadimplencia-cobrar-clientes.jpg'),
    ('en', 'reduce-late-payments-collect-customer-debt', 'https://www.dominex.app/images/blog/covers/reduce-late-payments-collect-customer-debt.jpg'),
    ('es', 'reducir-morosidad-cobrar-clientes', 'https://www.dominex.app/images/blog/covers/reducir-morosidad-cobrar-clientes.jpg'),
    ('pt-br', 'controle-estoque-ferramentas-materiais-tecnico', 'https://www.dominex.app/images/blog/covers/controle-estoque-ferramentas-materiais-tecnico.jpg'),
    ('en', 'field-technician-inventory-tools-materials-control', 'https://www.dominex.app/images/blog/covers/field-technician-inventory-tools-materials-control.jpg'),
    ('es', 'control-inventario-herramientas-materiales-tecnico', 'https://www.dominex.app/images/blog/covers/control-inventario-herramientas-materiales-tecnico.jpg'),
    ('pt-br', 'seguranca-trabalho-tecnicos-campo-nr10-nr35', 'https://www.dominex.app/images/blog/covers/seguranca-trabalho-tecnicos-campo-nr10-nr35.jpg'),
    ('en', 'field-technician-safety-electrical-work-at-height', 'https://www.dominex.app/images/blog/covers/field-technician-safety-electrical-work-at-height.jpg'),
    ('es', 'seguridad-tecnicos-campo-riesgo-electrico-altura', 'https://www.dominex.app/images/blog/covers/seguridad-tecnicos-campo-riesgo-electrico-altura.jpg'),
    ('pt-br', 'contrato-de-manutencao-receita-recorrente', 'https://www.dominex.app/images/blog/covers/contrato-de-manutencao-receita-recorrente.jpg'),
    ('en', 'maintenance-contracts-recurring-revenue', 'https://www.dominex.app/images/blog/covers/maintenance-contracts-recurring-revenue.jpg'),
    ('es', 'contrato-mantenimiento-ingresos-recurrentes', 'https://www.dominex.app/images/blog/covers/contrato-mantenimiento-ingresos-recurrentes.jpg'),
    ('pt-br', 'gestao-produtividade-equipes-de-campo', 'https://www.dominex.app/images/blog/covers/gestao-produtividade-equipes-de-campo.jpg'),
    ('en', 'field-team-management-productivity', 'https://www.dominex.app/images/blog/covers/field-team-management-productivity.jpg'),
    ('es', 'gestion-productividad-equipos-de-campo', 'https://www.dominex.app/images/blog/covers/gestion-productividad-equipos-de-campo.jpg'),
    ('pt-br', 'controle-financeiro-fluxo-de-caixa-empresa-de-servicos', 'https://www.dominex.app/images/blog/covers/controle-financeiro-fluxo-de-caixa-empresa-de-servicos.jpg'),
    ('en', 'cash-flow-financial-control-service-business', 'https://www.dominex.app/images/blog/covers/cash-flow-financial-control-service-business.jpg'),
    ('es', 'control-financiero-flujo-de-caja-empresa-servicios', 'https://www.dominex.app/images/blog/covers/control-financiero-flujo-de-caja-empresa-servicios.jpg')
)
UPDATE public.blog_posts AS post
SET
  cover_image_url = covers.cover_image_url,
  updated_at = now()
FROM covers
WHERE post.locale = covers.locale
  AND post.slug = covers.slug
  AND post.status = 'published';
