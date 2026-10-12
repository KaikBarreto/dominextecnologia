-- Padroniza as capas dos artigos anteriores e adiciona uma pausa editorial
-- visual aos 30 artigos publicados em 2026-10-12.
-- A migration é idempotente: o bloco usa um marcador versionado no HTML.

-- A obrigatoriedade para ME/EPP do Simples foi prorrogada de setembro para
-- 1º de novembro de 2026 pela Resolução CGSN nº 191/2026.
UPDATE public.blog_posts
SET content = replace(
  replace(
    replace(
      replace(
        content,
        'https://www.gov.br/nfse/pt-br/noticias/nfs-e-e-simples-nacional-obrigatoriedade-de-emissao-atraves-do-emissor-nacional',
        'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026'
      ),
      '1º de setembro de 2026', '1º de novembro de 2026'
    ),
    'September 1, 2026', 'November 1, 2026'
  ),
  '1 de septiembre de 2026', '1 de noviembre de 2026'
)
WHERE translation_group = '5b7e6a20-3a64-4c3b-8d22-2b0c3e2f0502'::uuid
  AND status = 'published';

WITH editorial(
  translation_group, locale, image_key, alt_text, caption, variant,
  eyebrow, visual_title, item_one, item_two, item_three,
  source_prefix, source_label, source_url
) AS (
  VALUES
    ('4a6d5f10-2f53-4f2a-9c11-1a9b2d1f0401'::uuid, 'pt-br', 'clients',
      'Representação 3D de uma jornada de aquisição de clientes para empresas de serviços',
      'Aquisição sustentável conecta descoberta, confiança, proposta, execução e pós-venda.',
      'channels', 'Mapa de aquisição', 'O ciclo que transforma visibilidade em receita',
      'Ser encontrado: perfil local, conteúdo útil e indicação organizada.',
      'Converter: resposta rápida, triagem objetiva e proposta fácil de comparar.',
      'Reter: entrega documentada, pós-venda e próxima necessidade registrada.',
      'Leitura externa:', 'guia de SEO local da HubSpot', 'https://blog.hubspot.com/marketing/local-seo'),
    ('4a6d5f10-2f53-4f2a-9c11-1a9b2d1f0401'::uuid, 'en', 'clients',
      '3D representation of a customer acquisition journey for service businesses',
      'Sustainable acquisition connects discovery, trust, quoting, delivery, and follow-up.',
      'channels', 'Acquisition map', 'The cycle that turns visibility into revenue',
      'Get found through local profiles, useful content, and structured referrals.',
      'Convert with fast replies, clear qualification, and easy-to-compare quotes.',
      'Retain through documented delivery, follow-up, and the next need on record.',
      'Further reading:', 'HubSpot local SEO guide', 'https://blog.hubspot.com/marketing/local-seo'),
    ('4a6d5f10-2f53-4f2a-9c11-1a9b2d1f0401'::uuid, 'es', 'clients',
      'Representación 3D de una jornada de captación de clientes para empresas de servicios',
      'La captación sostenible conecta descubrimiento, confianza, propuesta, ejecución y posventa.',
      'channels', 'Mapa de captación', 'El ciclo que convierte visibilidad en ingresos',
      'Ser encontrado mediante perfil local, contenido útil y recomendaciones organizadas.',
      'Convertir con respuesta rápida, calificación clara y presupuestos comparables.',
      'Fidelizar con entrega documentada, seguimiento y próxima necesidad registrada.',
      'Lectura externa:', 'guía de SEO local de HubSpot', 'https://blog.hubspot.com/marketing/local-seo'),

    ('5b7e6a20-3a64-4c3b-8d22-2b0c3e2f0502'::uuid, 'pt-br', 'nfse',
      'Representação 3D do fluxo de emissão de uma NFS-e para serviços',
      'Antes de emitir, valide enquadramento, operação e dados fiscais na fonte aplicável.',
      'decision', 'Decisão fiscal', 'Antes de emitir, passe por três decisões',
      'Quem emite: MEI, ME/EPP do Simples ou contribuinte sujeito à regra municipal.',
      'Qual operação: serviço, município competente, retenção e momento da emissão.',
      'Quais dados: tomador, código do serviço, valores, tributos e descrição coerente.',
      'Atualização oficial:', 'Receita Federal sobre o prazo de novembro de 2026', 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026'),
    ('5b7e6a20-3a64-4c3b-8d22-2b0c3e2f0502'::uuid, 'en', 'nfse',
      '3D representation of the Brazilian NFS-e issuance workflow',
      'Before issuing, confirm the business category, transaction, and tax data at the applicable source.',
      'decision', 'Tax decision', 'Make three decisions before issuing',
      'Who issues: MEI, Simples Nacional ME or EPP, or a taxpayer under municipal rules.',
      'Which transaction: service, competent city, withholding, and issuing event.',
      'Which data: customer, service code, amounts, taxes, and a consistent description.',
      'Official update:', 'Brazilian Revenue Service on the November 2026 deadline', 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026'),
    ('5b7e6a20-3a64-4c3b-8d22-2b0c3e2f0502'::uuid, 'es', 'nfse',
      'Representación 3D del flujo de emisión de la NFS-e brasileña',
      'Antes de emitir, confirma el encuadre, la operación y los datos fiscales en la fuente aplicable.',
      'decision', 'Decisión fiscal', 'Toma tres decisiones antes de emitir',
      'Quién emite: MEI, ME o EPP de Simples Nacional, o contribuyente bajo regla municipal.',
      'Qué operación: servicio, municipio competente, retención y momento de emisión.',
      'Qué datos: cliente, código del servicio, importes, tributos y descripción coherente.',
      'Actualización oficial:', 'Receita Federal sobre el plazo de noviembre de 2026', 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026'),

    ('6c8f7b30-4b75-4d4c-9e33-3c1d4f3a0603'::uuid, 'pt-br', 'start-company',
      'Representação 3D das etapas para abrir uma empresa de serviços no Brasil',
      'Abertura responsável começa pela atividade real e termina com uma operação pronta para cumprir suas obrigações.',
      'compare', 'Escolha consciente', 'MEI e ME não são versões pequena e grande da mesma coisa',
      'Atividade: confirme se o serviço é permitido e escolha CNAEs coerentes com a execução real.',
      'Estrutura: avalie sócios, responsabilidade, limite de receita e necessidade de contador.',
      'Operação: valide endereço, licenças, emissão fiscal, conta e controles desde o primeiro dia.',
      'Leitura externa:', 'guia de formalização do Sebrae', 'https://meuatendimento.sebrae.com.br/sites/PortalSebrae/artigos/artigoshome/guia-pratico-para-a-formalizacao-de-empresas%2C8f8a634e2ca62410VgnVCM100000b272010aRCRD'),
    ('6c8f7b30-4b75-4d4c-9e33-3c1d4f3a0603'::uuid, 'en', 'start-company',
      '3D representation of the steps to start a service company in Brazil',
      'Responsible formation starts with the real activity and ends with an operation prepared for its obligations.',
      'compare', 'Informed choice', 'MEI and ME are not small and large versions of the same model',
      'Activity: verify eligibility and choose CNAE codes consistent with the actual service.',
      'Structure: assess partners, liability, revenue limits, and accounting support.',
      'Operations: validate address, licenses, invoicing, banking, and controls from day one.',
      'Further reading:', 'Sebrae business formalization guide', 'https://meuatendimento.sebrae.com.br/sites/PortalSebrae/artigos/artigoshome/guia-pratico-para-a-formalizacao-de-empresas%2C8f8a634e2ca62410VgnVCM100000b272010aRCRD'),
    ('6c8f7b30-4b75-4d4c-9e33-3c1d4f3a0603'::uuid, 'es', 'start-company',
      'Representación 3D de las etapas para abrir una empresa de servicios en Brasil',
      'La formalización responsable empieza por la actividad real y termina con una operación preparada para sus obligaciones.',
      'compare', 'Elección informada', 'MEI y ME no son versiones pequeña y grande del mismo modelo',
      'Actividad: comprueba la elegibilidad y elige CNAE coherentes con el servicio real.',
      'Estructura: evalúa socios, responsabilidad, límite de ingresos y apoyo contable.',
      'Operación: valida domicilio, licencias, facturación, cuenta y controles desde el primer día.',
      'Lectura externa:', 'guía de formalización del Sebrae', 'https://meuatendimento.sebrae.com.br/sites/PortalSebrae/artigos/artigoshome/guia-pratico-para-a-formalizacao-de-empresas%2C8f8a634e2ca62410VgnVCM100000b272010aRCRD'),

    ('70000000-0000-4000-8000-000000000007'::uuid, 'pt-br', 'checklist-report',
      'Representação 3D de checklist e relatório digital de atendimento técnico',
      'Um fechamento confiável transforma execução de campo em evidência compreensível para cliente e gestão.',
      'evidence', 'Fechamento de campo', 'A evidência mínima de um atendimento profissional',
      'Contexto: ativo, local, solicitação, condição encontrada e risco observado.',
      'Execução: checklist, medições, fotos, materiais e descrição do que foi feito.',
      'Aceite: resultado, pendências, recomendação, responsável e confirmação do cliente.',
      'Leitura externa:', 'Fiix sobre relatórios de manutenção', 'https://fiixsoftware.com/blog/save-time-with-better-maintenance-reporting/'),
    ('70000000-0000-4000-8000-000000000007'::uuid, 'en', 'checklist-report',
      '3D representation of a digital field service checklist and report',
      'Reliable closeout turns field execution into evidence the customer and management can understand.',
      'evidence', 'Field closeout', 'Minimum evidence for a professional service visit',
      'Context: asset, site, request, observed condition, and identified risk.',
      'Execution: checklist, readings, photos, materials, and work performed.',
      'Acceptance: outcome, open items, recommendation, owner, and customer confirmation.',
      'Further reading:', 'Fiix on better maintenance reporting', 'https://fiixsoftware.com/blog/save-time-with-better-maintenance-reporting/'),
    ('70000000-0000-4000-8000-000000000007'::uuid, 'es', 'checklist-report',
      'Representación 3D de checklist e informe digital de servicio técnico',
      'Un cierre fiable convierte la ejecución de campo en evidencia comprensible para cliente y gestión.',
      'evidence', 'Cierre de campo', 'La evidencia mínima de una visita profesional',
      'Contexto: activo, ubicación, solicitud, condición encontrada y riesgo observado.',
      'Ejecución: checklist, mediciones, fotos, materiales y descripción del trabajo.',
      'Aceptación: resultado, pendientes, recomendación, responsable y confirmación del cliente.',
      'Lectura externa:', 'Fiix sobre informes de mantenimiento', 'https://fiixsoftware.com/blog/save-time-with-better-maintenance-reporting/'),

    ('70000000-0000-4000-8000-000000000008'::uuid, 'pt-br', 'late-payments',
      'Representação 3D de uma régua organizada de cobrança e recebimentos',
      'Cobrança profissional combina prevenção, cadência e registro sem transformar cada atraso em confronto.',
      'script', 'Roteiro de cobrança', 'Três mensagens, três objetivos diferentes',
      'Antes do vencimento: confirme documento, valor, data e canal de pagamento.',
      'No atraso: informe o fato, facilite a regularização e peça uma data objetiva.',
      'Na negociação: registre acordo, consequência, responsável e próximo contato.',
      'Leitura externa:', 'QuickBooks sobre políticas para pagamentos atrasados', 'https://quickbooks.intuit.com/r/payments/late-payment-fees/'),
    ('70000000-0000-4000-8000-000000000008'::uuid, 'en', 'late-payments',
      '3D representation of an organized collection and payment reminder process',
      'Professional collection combines prevention, cadence, and records without turning every delay into conflict.',
      'script', 'Collection script', 'Three messages with three different goals',
      'Before due date: confirm document, amount, date, and payment channel.',
      'When overdue: state the fact, make payment easier, and request a firm date.',
      'During negotiation: record the agreement, consequence, owner, and next contact.',
      'Further reading:', 'QuickBooks on late-payment policies', 'https://quickbooks.intuit.com/r/payments/late-payment-fees/'),
    ('70000000-0000-4000-8000-000000000008'::uuid, 'es', 'late-payments',
      'Representación 3D de un proceso organizado de cobro y recordatorios',
      'El cobro profesional combina prevención, cadencia y registro sin convertir cada atraso en conflicto.',
      'script', 'Guion de cobro', 'Tres mensajes con tres objetivos diferentes',
      'Antes del vencimiento: confirma documento, importe, fecha y canal de pago.',
      'Con atraso: informa el hecho, facilita la regularización y pide una fecha concreta.',
      'En la negociación: registra acuerdo, consecuencia, responsable y próximo contacto.',
      'Lectura externa:', 'QuickBooks sobre políticas de pagos atrasados', 'https://quickbooks.intuit.com/r/payments/late-payment-fees/'),

    ('70000000-0000-4000-8000-000000000009'::uuid, 'pt-br', 'inventory',
      'Representação 3D do controle de ferramentas e materiais por técnico',
      'Estoque de campo confiável depende de localização, movimentação registrada e vínculo com o serviço.',
      'flow', 'Fluxo do material', 'Toda peça precisa deixar um rastro simples',
      'Saída: item, quantidade, origem, técnico responsável e atendimento previsto.',
      'Uso ou devolução: consumo real, sobra, avaria, perda e justificativa quando houver.',
      'Reposição: mínimo, demanda futura, fornecedor, prazo e aprovação de compra.',
      'Leitura externa:', 'Fiix sobre organização do estoque de manutenção', 'https://fiixsoftware.com/blog/organizing-and-managing-maintenance-storeroom/'),
    ('70000000-0000-4000-8000-000000000009'::uuid, 'en', 'inventory',
      '3D representation of tools and materials control by field technician',
      'Reliable field inventory depends on location, recorded movement, and a link to the job.',
      'flow', 'Material flow', 'Every part should leave a simple trail',
      'Issue: item, quantity, source, responsible technician, and planned job.',
      'Use or return: actual consumption, surplus, damage, loss, and reason when needed.',
      'Replenishment: minimum level, future demand, supplier, lead time, and approval.',
      'Further reading:', 'Fiix on maintenance storeroom management', 'https://fiixsoftware.com/blog/organizing-and-managing-maintenance-storeroom/'),
    ('70000000-0000-4000-8000-000000000009'::uuid, 'es', 'inventory',
      'Representación 3D del control de herramientas y materiales por técnico',
      'Un inventario de campo fiable depende de ubicación, movimiento registrado y vínculo con el servicio.',
      'flow', 'Flujo del material', 'Cada pieza debe dejar un rastro sencillo',
      'Salida: artículo, cantidad, origen, técnico responsable y servicio previsto.',
      'Uso o devolución: consumo real, sobrante, avería, pérdida y motivo cuando corresponda.',
      'Reposición: mínimo, demanda futura, proveedor, plazo y aprobación de compra.',
      'Lectura externa:', 'Fiix sobre la organización del almacén de mantenimiento', 'https://fiixsoftware.com/blog/organizing-and-managing-maintenance-storeroom/'),

    ('70000000-0000-4000-8000-000000000010'::uuid, 'pt-br', 'safety',
      'Representação 3D de barreiras de segurança para técnicos em campo',
      'A ordem correta é eliminar o risco quando possível, aplicar proteção coletiva e completar com procedimentos e EPI.',
      'warning', 'Pare e verifique', 'Três barreiras antes de iniciar o trabalho',
      'Condição: energia, altura, acesso, clima, entorno e mudança desde a última visita.',
      'Competência: treinamento, autorização, procedimento e supervisão compatíveis.',
      'Evidência: análise, bloqueio, inspeção, fotos e registro de interrupção quando necessário.',
      'Leitura externa:', 'Fiix sobre segurança e conformidade na manutenção', 'https://fiixsoftware.com/blog/establish-an-effective-health-and-safety-program-with-your-cmms/'),
    ('70000000-0000-4000-8000-000000000010'::uuid, 'en', 'safety',
      '3D representation of safety barriers for field technicians',
      'The right order is to eliminate hazards where possible, apply collective protection, and complete with procedures and PPE.',
      'warning', 'Stop and check', 'Three barriers before work starts',
      'Conditions: energy, height, access, weather, surroundings, and changes since the last visit.',
      'Competence: compatible training, authorization, procedure, and supervision.',
      'Evidence: assessment, isolation, inspection, photos, and stop-work records when needed.',
      'Further reading:', 'Fiix on maintenance safety and compliance', 'https://fiixsoftware.com/blog/establish-an-effective-health-and-safety-program-with-your-cmms/'),
    ('70000000-0000-4000-8000-000000000010'::uuid, 'es', 'safety',
      'Representación 3D de barreras de seguridad para técnicos de campo',
      'El orden correcto es eliminar el riesgo cuando sea posible, aplicar protección colectiva y completar con procedimientos y EPI.',
      'warning', 'Detente y comprueba', 'Tres barreras antes de empezar el trabajo',
      'Condiciones: energía, altura, acceso, clima, entorno y cambios desde la última visita.',
      'Competencia: formación, autorización, procedimiento y supervisión compatibles.',
      'Evidencia: análisis, aislamiento, inspección, fotos y registro de parada cuando sea necesario.',
      'Lectura externa:', 'Fiix sobre seguridad y cumplimiento en mantenimiento', 'https://fiixsoftware.com/blog/establish-an-effective-health-and-safety-program-with-your-cmms/'),

    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c01'::uuid, 'pt-br', 'maintenance-contract',
      'Representação 3D de um contrato de manutenção conectado a ativos e visitas',
      'Receita recorrente saudável nasce de escopo verificável, agenda executável e custo acompanhado.',
      'blueprint', 'Blueprint do contrato', 'O contrato precisa funcionar no papel e no campo',
      'Promessa: ativos, tarefas, frequência, SLA, limites e exclusões compreensíveis.',
      'Operação: agenda, checklist, materiais, evidências, pendências e comunicação.',
      'Economia: preço, reajuste, horas, deslocamento, extras, inadimplência e margem.',
      'Leitura externa:', 'Fiix sobre manutenção preventiva estruturada', 'https://fiixsoftware.com/blog/preventive-maintenance-software-and-tools/'),
    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c01'::uuid, 'en', 'maintenance-contract',
      '3D representation of a maintenance contract connected to assets and visits',
      'Healthy recurring revenue starts with verifiable scope, an executable schedule, and tracked cost.',
      'blueprint', 'Contract blueprint', 'The agreement must work on paper and in the field',
      'Promise: assets, tasks, frequency, SLA, limits, and clear exclusions.',
      'Operations: schedule, checklists, materials, evidence, open items, and communication.',
      'Economics: price, adjustment, hours, travel, extras, late payments, and margin.',
      'Further reading:', 'Fiix on structured preventive maintenance', 'https://fiixsoftware.com/blog/preventive-maintenance-software-and-tools/'),
    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c01'::uuid, 'es', 'maintenance-contract',
      'Representación 3D de un contrato de mantenimiento conectado a activos y visitas',
      'Los ingresos recurrentes sanos nacen de alcance verificable, agenda ejecutable y costos controlados.',
      'blueprint', 'Plano del contrato', 'El acuerdo debe funcionar en el papel y en el campo',
      'Promesa: activos, tareas, frecuencia, SLA, límites y exclusiones claras.',
      'Operación: agenda, checklist, materiales, evidencias, pendientes y comunicación.',
      'Economía: precio, revisión, horas, desplazamiento, extras, morosidad y margen.',
      'Lectura externa:', 'Fiix sobre mantenimiento preventivo estructurado', 'https://fiixsoftware.com/blog/preventive-maintenance-software-and-tools/'),

    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c02'::uuid, 'pt-br', 'team-productivity',
      'Representação 3D de uma equipe de campo coordenada por agenda e indicadores',
      'Produtividade melhora quando a agenda considera habilidade, localização, duração, materiais e prioridade.',
      'dashboard', 'Painel operacional', 'Meça o sistema, não apenas o técnico',
      'Fluxo: tempo de resposta, espera, deslocamento, duração e conclusão no prazo.',
      'Qualidade: retorno, reabertura, pendência, checklist e aceite do cliente.',
      'Capacidade: horas disponíveis, ocupação saudável, competências e carga futura.',
      'Leitura externa:', 'Salesforce sobre agenda de equipes de campo', 'https://www.salesforce.com/blog/field-service-scheduling/'),
    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c02'::uuid, 'en', 'team-productivity',
      '3D representation of a field team coordinated through scheduling and indicators',
      'Productivity improves when schedules consider skills, location, duration, materials, and priority.',
      'dashboard', 'Operations dashboard', 'Measure the system, not only the technician',
      'Flow: response, waiting, travel, job duration, and on-time completion.',
      'Quality: repeat visits, reopenings, open items, checklists, and customer acceptance.',
      'Capacity: available hours, healthy utilization, skills, and future workload.',
      'Further reading:', 'Salesforce on field service scheduling', 'https://www.salesforce.com/blog/field-service-scheduling/'),
    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c02'::uuid, 'es', 'team-productivity',
      'Representación 3D de un equipo de campo coordinado mediante agenda e indicadores',
      'La productividad mejora cuando la agenda considera habilidades, ubicación, duración, materiales y prioridad.',
      'dashboard', 'Panel operativo', 'Mide el sistema, no solo al técnico',
      'Flujo: respuesta, espera, desplazamiento, duración y finalización a tiempo.',
      'Calidad: segunda visita, reapertura, pendiente, checklist y aceptación del cliente.',
      'Capacidad: horas disponibles, ocupación saludable, competencias y carga futura.',
      'Lectura externa:', 'Salesforce sobre agenda de equipos de campo', 'https://www.salesforce.com/blog/field-service-scheduling/'),

    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c03'::uuid, 'pt-br', 'cash-flow',
      'Representação 3D de controle financeiro e projeção de caixa para serviços',
      'Caixa confiável combina saldo conciliado, compromissos futuros e diferença entre previsão e realizado.',
      'formula', 'Três contas essenciais', 'Números que cabem na rotina e mudam decisões',
      'Saldo projetado = saldo atual + entradas previstas − saídas previstas.',
      'Margem do serviço = receita − custos diretamente atribuíveis à entrega.',
      'Necessidade de caixa = compromissos do período − recursos disponíveis no período.',
      'Leitura externa:', 'QuickBooks sobre melhoria do fluxo de caixa', 'https://quickbooks.intuit.com/r/running-a-business/improving-cash-flow-management-pro-tips-to-make-it-better/'),
    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c03'::uuid, 'en', 'cash-flow',
      '3D representation of financial control and cash forecasting for service businesses',
      'Reliable cash visibility combines reconciled balances, future commitments, and forecast-versus-actual review.',
      'formula', 'Three essential calculations', 'Numbers simple enough for the routine and useful enough for decisions',
      'Projected cash = current cash + expected inflows − expected outflows.',
      'Job margin = revenue − costs directly attributable to delivery.',
      'Cash requirement = period commitments − resources available in the period.',
      'Further reading:', 'QuickBooks on improving cash flow', 'https://quickbooks.intuit.com/r/running-a-business/improving-cash-flow-management-pro-tips-to-make-it-better/'),
    ('c7f38a0a-7e6b-4f35-9d93-8f1240a91c03'::uuid, 'es', 'cash-flow',
      'Representación 3D de control financiero y previsión de caja para servicios',
      'Una caja fiable combina saldo conciliado, compromisos futuros y revisión de previsión frente a realidad.',
      'formula', 'Tres cálculos esenciales', 'Números sencillos para la rutina y útiles para decidir',
      'Caja proyectada = saldo actual + entradas previstas − salidas previstas.',
      'Margen del servicio = ingresos − costos directamente atribuibles a la entrega.',
      'Necesidad de caja = compromisos del período − recursos disponibles en el período.',
      'Lectura externa:', 'QuickBooks sobre mejora del flujo de caja', 'https://quickbooks.intuit.com/r/running-a-business/improving-cash-flow-management-pro-tips-to-make-it-better/')
), blocks AS (
  SELECT
    translation_group,
    locale,
    format(
      $block$
<figure class="blog-editorial-figure" data-dominex-editorial="v2">
  <img src="/images/blog/inline/%s.jpg" alt="%s" width="1200" height="630" loading="lazy" decoding="async">
  <figcaption>%s</figcaption>
</figure>
<aside class="blog-pattern blog-pattern--%s" aria-label="%s">
  <span class="blog-pattern__eyebrow">%s</span>
  <p class="blog-pattern__title">%s</p>
  <ol class="blog-pattern__items">
    <li>%s</li>
    <li>%s</li>
    <li>%s</li>
  </ol>
  <p class="blog-pattern__source">%s <a href="%s" target="_blank" rel="noopener noreferrer">%s</a>.</p>
</aside>
$block$,
      image_key,
      alt_text,
      caption,
      variant,
      visual_title,
      eyebrow,
      visual_title,
      item_one,
      item_two,
      item_three,
      source_prefix,
      source_url,
      source_label
    ) AS block_html
  FROM editorial
)
UPDATE public.blog_posts AS post
SET
  content = regexp_replace(post.content, '</p>', '</p>' || blocks.block_html),
  updated_at = now()
FROM blocks
WHERE post.translation_group = blocks.translation_group
  AND post.locale = blocks.locale
  AND post.status = 'published'
  AND post.content NOT LIKE '%data-dominex-editorial="v2"%';

WITH covers(locale, slug, cover_image_url) AS (
  VALUES
    ('pt-br', 'modelo-de-ordem-de-servico', 'https://www.dominex.app/images/blog/covers/modelo-de-ordem-de-servico.jpg'),
    ('en', 'work-order-what-it-is-how-to-create-free-template', 'https://www.dominex.app/images/blog/covers/work-order-what-it-is-how-to-create-free-template.jpg'),
    ('es', 'orden-de-trabajo-que-es-como-hacer-plantilla', 'https://www.dominex.app/images/blog/covers/orden-de-trabajo-que-es-como-hacer-plantilla.jpg'),
    ('fr', 'bon-de-travail-quest-ce-que-cest-modele-gratuit', 'https://www.dominex.app/images/blog/covers/bon-de-travail-quest-ce-que-cest-modele-gratuit.jpg'),
    ('pt-br', 'gas-r22-substitutos-retrofit-guia', 'https://www.dominex.app/images/blog/covers/gas-r22-substitutos-retrofit-guia.jpg'),
    ('en', 'r22-refrigerant-substitutes-retrofit-guide', 'https://www.dominex.app/images/blog/covers/r22-refrigerant-substitutes-retrofit-guide.jpg'),
    ('es', 'gas-r22-sustitutos-retrofit-guia', 'https://www.dominex.app/images/blog/covers/gas-r22-sustitutos-retrofit-guia.jpg'),
    ('fr', 'gaz-r22-substituts-retrofit-guide', 'https://www.dominex.app/images/blog/covers/gaz-r22-substituts-retrofit-guide.jpg'),
    ('pt-br', 'quanto-cobrar-por-um-servico-precificacao', 'https://www.dominex.app/images/blog/covers/quanto-cobrar-por-um-servico-precificacao.jpg'),
    ('en', 'how-much-to-charge-for-a-service-pricing', 'https://www.dominex.app/images/blog/covers/how-much-to-charge-for-a-service-pricing.jpg'),
    ('es', 'cuanto-cobrar-por-un-servicio-precios', 'https://www.dominex.app/images/blog/covers/cuanto-cobrar-por-un-servicio-precios.jpg'),
    ('fr', 'combien-facturer-un-service-tarification', 'https://www.dominex.app/images/blog/covers/combien-facturer-un-service-tarification.jpg'),
    ('pt-br', 'como-funciona-o-pmoc', 'https://www.dominex.app/images/blog/covers/como-funciona-o-pmoc.jpg')
)
UPDATE public.blog_posts AS post
SET
  cover_image_url = covers.cover_image_url,
  updated_at = now()
FROM covers
WHERE post.locale = covers.locale
  AND post.slug = covers.slug
  AND post.status = 'published';
