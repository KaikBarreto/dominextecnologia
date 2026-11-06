-- Atualiza a trilha oficial de tutoriais da DomiFlix com os vídeos e legendas
-- entregues em 06/11/2026. T21 e T22 ficam preparados, mas ocultos até que os
-- respectivos MP4 sejam disponibilizados.

BEGIN;

DO $migration$
DECLARE
  v_path_id uuid;
BEGIN
  SELECT id
    INTO v_path_id
    FROM public.domiflix_learning_paths
   WHERE slug = 'tutoriais-do-sistema';

  IF v_path_id IS NULL THEN
    RAISE EXCEPTION 'Trilha tutoriais-do-sistema não encontrada';
  END IF;

  CREATE TEMP TABLE domiflix_tutorial_import (
    tutorial_number integer PRIMARY KEY,
    title_id uuid NOT NULL,
    episode_id uuid NOT NULL,
    subtitle_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    cover_url text NOT NULL,
    track_group text NOT NULL,
    module_code text,
    track_order integer NOT NULL,
    required_screen_keys text[] NOT NULL,
    video_path text,
    duration_minutes integer NOT NULL,
    published boolean NOT NULL,
    subtitle_path text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO domiflix_tutorial_import VALUES
    (0,  'd0000000-0000-4000-8000-000000000000', 'e0000000-0000-4000-8000-000000000000', 'f0000000-0000-4000-8000-000000000000',
      'Boas-vindas à Dominex',
      'Conheça os combinados da parceria, como funciona a DomiFlix e por onde começar.',
      '/guia-tecnico/img/t0-dashboard-completo.jpg', 'core', NULL, 0, ARRAY[]::text[],
      'tutorials/2026-11-06/t0-boas-vindas-dominex.mp4', 5, true,
      'tutorials/2026-11-06/t0-boas-vindas-dominex.vtt'),
    (1,  'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
      'Configurações e identidade da empresa',
      'Configure os dados, a identidade visual e as preferências iniciais da empresa.',
      '/guia-tecnico/img/t1-configuracoes.jpg', 'core', NULL, 10, ARRAY['screen:settings'],
      'tutorials/2026-11-06/t1-configuracoes-identidade.mp4', 14, true,
      'tutorials/2026-11-06/t1-configuracoes-identidade.vtt'),
    (2,  'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002',
      'Usuários, cargos e permissões',
      'Cadastre a equipe e defina com clareza o que cada pessoa pode acessar.',
      '/guia-tecnico/img/t2-usuarios.jpg', 'core', NULL, 20, ARRAY['screen:users'],
      'tutorials/2026-11-06/t2-usuarios-cargos-permissoes.mp4', 11, true,
      'tutorials/2026-11-06/t2-usuarios-cargos-permissoes.vtt'),
    (3,  'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003',
      'Clientes, fornecedores e equipamentos',
      'Monte a base de clientes, fornecedores e equipamentos usada pela operação.',
      '/guia-tecnico/img/t3-clientes.jpg', 'core', NULL, 30, ARRAY['screen:customers','screen:equipment'],
      'tutorials/2026-11-06/t3-clientes-fornecedores-equipamentos.mp4', 15, true,
      'tutorials/2026-11-06/t3-clientes-fornecedores-equipamentos.vtt'),
    (4,  'd0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004',
      'Serviços, tarefas e checklists',
      'Cadastre os serviços, tipos de tarefa e checklists usados no atendimento.',
      '/guia-tecnico/img/t4-servicos.jpg', 'core', NULL, 40, ARRAY['screen:services','screen:questionnaires'],
      'tutorials/2026-11-06/t4-servicos-tarefas-checklists.mp4', 11, true,
      'tutorials/2026-11-06/t4-servicos-tarefas-checklists.vtt'),
    (5,  'd0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000005',
      'Ordens de Serviço, agenda, equipes e mapa ao vivo',
      'Abra, distribua, agende e acompanhe Ordens de Serviço e equipes em campo.',
      '/guia-tecnico/img/t5-ordens-servico.jpg', 'core', NULL, 50, ARRAY['screen:service_orders','screen:schedule','screen:tracking'],
      'tutorials/2026-11-06/t5-os-agenda-equipes-mapa.mp4', 14, true,
      'tutorials/2026-11-06/t5-os-agenda-equipes-mapa.vtt'),
    (7,  'd0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000007',
      'O técnico em campo',
      'Acompanhe o fluxo completo do técnico no celular, do deslocamento à assinatura do cliente.',
      '/guia-tecnico/img/t7-area-tecnico-inicio.jpg', 'core', NULL, 60, ARRAY['screen:service_orders'],
      'tutorials/2026-11-06/t7-tecnico-em-campo.mp4', 15, true,
      'tutorials/2026-11-06/t7-tecnico-em-campo.vtt'),
    (18, 'd0000000-0000-4000-8000-000000000018', 'e0000000-0000-4000-8000-000000000018', 'f0000000-0000-4000-8000-000000000018',
      'Área do Técnico — Refrigeração e Climatização',
      'Use as ferramentas técnicas de refrigeração e climatização dentro da rotina de campo.',
      '/guia-tecnico/img/t7-ferramentas-cadeado.jpg', 'core', NULL, 70, ARRAY['screen:technician_tools'],
      'tutorials/2026-11-06/t18-area-tecnico-refrigeracao-climatizacao.mp4', 14, true,
      'tutorials/2026-11-06/t18-area-tecnico-refrigeracao-climatizacao.vtt'),
    (8,  'd0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000008',
      'Estoque, compras e inventário',
      'Controle materiais, locais, compras, movimentações, contagens e inventário.',
      '/guia-tecnico/img/t8-estoque.jpg', 'core', NULL, 80, ARRAY['screen:inventory'],
      'tutorials/2026-11-06/t8-estoque-compras-inventario.mp4', 17, true,
      'tutorials/2026-11-06/t8-estoque-compras-inventario.vtt'),
    (9,  'd0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000009',
      'Orçamentos, precificação e proposta',
      'Calcule custos, forme preços e envie propostas profissionais aos clientes.',
      '/guia-tecnico/img/t9-orcamentos.jpg', 'core', NULL, 90, ARRAY['screen:quotes'],
      'tutorials/2026-11-06/t9-orcamentos-precificacao-proposta.mp4', 17, true,
      'tutorials/2026-11-06/t9-orcamentos-precificacao-proposta.vtt'),
    (10, 'd0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000010',
      'CRM — funil, leads e captação',
      'Organize leads, oportunidades, tarefas e etapas comerciais em funis.',
      '/guia-tecnico/img/t10-crm.jpg', 'plan', 'crm', 100, ARRAY['screen:crm'],
      'tutorials/2026-11-06/t10-crm-funil-leads-captacao.mp4', 13, true,
      'tutorials/2026-11-06/t10-crm-funil-leads-captacao.vtt'),
    (11, 'd0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000011',
      'Contratos e PMOC',
      'Cadastre contratos recorrentes, responsáveis técnicos, unidades e cronogramas de PMOC.',
      '/guia-tecnico/img/t11-contratos.jpg', 'plan', 'contracts', 110, ARRAY['screen:contracts'],
      'tutorials/2026-11-06/t11-contratos-pmoc.mp4', 19, true,
      'tutorials/2026-11-06/t11-contratos-pmoc.vtt'),
    (12, 'd0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000012',
      'Portal do Cliente e Portal do Contrato',
      'Compartilhe chamados, documentos, equipamentos e informações de cada contrato com o cliente.',
      '/guia-tecnico/img/t12-portal-cliente.jpg', 'core', NULL, 120, ARRAY['screen:customers','screen:contracts'],
      'tutorials/2026-11-06/t12-portal-cliente-contrato.mp4', 12, true,
      'tutorials/2026-11-06/t12-portal-cliente-contrato.vtt'),
    (13, 'd0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000013',
      'Financeiro',
      'Organize contas, movimentações, categorias, cartões e a rotina financeira da empresa.',
      '/guia-tecnico/img/t13-financeiro-relatorio.jpg', 'core', NULL, 130, ARRAY['screen:finance'],
      'tutorials/2026-11-06/t13-financeiro.mp4', 16, true,
      'tutorials/2026-11-06/t13-financeiro.vtt'),
    (19, 'd0000000-0000-4000-8000-000000000019', 'e0000000-0000-4000-8000-000000000019', 'f0000000-0000-4000-8000-000000000019',
      'Integração com Asaas, assinaturas e cobranças',
      'Configure cobranças, assinaturas e pagamentos online integrados ao financeiro.',
      '/guia-tecnico/img/t13-cobrar-modal.jpg', 'plan', 'cobrancas', 140, ARRAY['screen:finance'],
      'tutorials/2026-11-06/t19-asaas-assinaturas-cobrancas.mp4', 11, true,
      'tutorials/2026-11-06/t19-asaas-assinaturas-cobrancas.vtt'),
    (20, 'd0000000-0000-4000-8000-000000000020', 'e0000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000020',
      'Relatório Financeiro e DRE',
      'Leia os relatórios financeiros e acompanhe o resultado da empresa pela DRE.',
      '/guia-tecnico/img/t13-dre-atual.jpg', 'core', NULL, 150, ARRAY['screen:finance'],
      'tutorials/2026-11-06/t20-relatorio-financeiro-dre.mp4', 10, true,
      'tutorials/2026-11-06/t20-relatorio-financeiro-dre.vtt'),
    (14, 'd0000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000014', 'f0000000-0000-4000-8000-000000000014',
      'Notas Fiscais',
      'Configure a emissão fiscal e acompanhe suas notas fiscais de serviço.',
      '/guia-tecnico/img/t14-notas-fiscais.jpg', 'plan', 'nfe', 160, ARRAY['screen:fiscal_notes'],
      'tutorials/2026-11-06/t14-notas-fiscais.mp4', 10, true,
      'tutorials/2026-11-06/t14-notas-fiscais.vtt'),
    (15, 'd0000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000015', 'f0000000-0000-4000-8000-000000000015',
      'Funcionários — financeiro e ponto eletrônico',
      'Cadastre funcionários, organize pagamentos e acompanhe o ponto eletrônico.',
      '/guia-tecnico/img/t15-funcionarios.jpg', 'plan', 'rh', 170, ARRAY['screen:employees'],
      'tutorials/2026-11-06/t15-funcionarios-financeiro-ponto.mp4', 11, true,
      'tutorials/2026-11-06/t15-funcionarios-financeiro-ponto.vtt'),
    (22, 'd0000000-0000-4000-8000-000000000022', 'e0000000-0000-4000-8000-000000000022', 'f0000000-0000-4000-8000-000000000022',
      'Ferramentas de RH — DISC, organograma e fluxograma',
      'Use DISC, organograma e fluxograma para organizar pessoas, funções e processos.',
      '/guia-tecnico/img/t15-organograma.jpg', 'plan', 'rh', 180, ARRAY['screen:employees'],
      NULL, 10, false,
      'tutorials/2026-11-06/t22-ferramentas-rh.vtt'),
    (21, 'd0000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000021',
      'Integração com WhatsApp',
      'Conecte o WhatsApp e envie avisos da operação pelo número da empresa.',
      '/guia-tecnico/img/t1-integracoes-whatsapp.jpg', 'plan', 'whatsapp', 190, ARRAY[]::text[],
      NULL, 7, false,
      'tutorials/2026-11-06/t21-integracao-whatsapp.vtt'),
    (17, 'd0000000-0000-4000-8000-000000000017', 'e0000000-0000-4000-8000-000000000017', 'f0000000-0000-4000-8000-000000000017',
      'Dashboard, relatórios e exportações',
      'Acompanhe indicadores, filtre relatórios e exporte informações da operação.',
      '/guia-tecnico/img/t17-dashboard-kpis.jpg', 'core', NULL, 200, ARRAY['screen:dashboard'],
      'tutorials/2026-11-06/t17-dashboard-relatorios-exportacoes.mp4', 8, true,
      'tutorials/2026-11-06/t17-dashboard-relatorios-exportacoes.vtt');

  INSERT INTO public.domiflix_titles (
    id, type, title, description, banner_url, thumbnail_url, tags,
    is_featured, order_index, track_group, track_order, learning_path_id,
    required_screen_keys, is_active
  )
  SELECT title_id, 'series', title, description, cover_url, cover_url,
         ARRAY['tutorial'], tutorial_number = 0, track_order, track_group,
         track_order, v_path_id, required_screen_keys, published
    FROM domiflix_tutorial_import
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    banner_url = EXCLUDED.banner_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    tags = EXCLUDED.tags,
    is_featured = EXCLUDED.is_featured,
    order_index = EXCLUDED.order_index,
    track_group = EXCLUDED.track_group,
    track_order = EXCLUDED.track_order,
    learning_path_id = EXCLUDED.learning_path_id,
    required_screen_keys = EXCLUDED.required_screen_keys,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  INSERT INTO public.domiflix_episodes (
    id, title_id, season_id, episode_number, title, description,
    video_id, video_type, duration_minutes, thumbnail_url, order_index,
    recorded_at, is_active
  )
  SELECT episode_id, title_id, NULL, NULL, title, description,
         video_path, 'storage', duration_minutes, cover_url, 0, now(), published
    FROM domiflix_tutorial_import
  ON CONFLICT (id) DO UPDATE SET
    title_id = EXCLUDED.title_id,
    season_id = NULL,
    episode_number = NULL,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    video_id = EXCLUDED.video_id,
    video_type = EXCLUDED.video_type,
    duration_minutes = EXCLUDED.duration_minutes,
    thumbnail_url = EXCLUDED.thumbnail_url,
    order_index = EXCLUDED.order_index,
    recorded_at = EXCLUDED.recorded_at,
    is_active = EXCLUDED.is_active;

  UPDATE public.domiflix_episodes
     SET mobile_video_id = 'tutorials/2026-11-06/t0-boas-vindas-dominex-vertical.mp4',
         mobile_video_type = 'storage'
   WHERE id = 'e0000000-0000-4000-8000-000000000000';

  DELETE FROM public.domiflix_title_modules tm
   USING domiflix_tutorial_import seed
   WHERE tm.title_id = seed.title_id;

  INSERT INTO public.domiflix_title_modules (title_id, module_code)
  SELECT title_id, module_code
    FROM domiflix_tutorial_import
   WHERE module_code IS NOT NULL;

  UPDATE public.domiflix_episode_subtitles subtitle
     SET is_default = false
   WHERE subtitle.episode_id IN (
     SELECT episode_id FROM domiflix_tutorial_import
   );

  INSERT INTO public.domiflix_episode_subtitles (
    id, episode_id, language_code, label, format, content, storage_path,
    is_default, order_index
  )
  SELECT subtitle_id, episode_id, 'pt-BR', 'Português (Brasil)', 'vtt', NULL,
         subtitle_path, true, 0
    FROM domiflix_tutorial_import
  ON CONFLICT (id) DO UPDATE SET
    episode_id = EXCLUDED.episode_id,
    language_code = EXCLUDED.language_code,
    label = EXCLUDED.label,
    format = EXCLUDED.format,
    content = NULL,
    storage_path = EXCLUDED.storage_path,
    is_default = EXCLUDED.is_default,
    order_index = EXCLUDED.order_index;
END;
$migration$;

COMMIT;
