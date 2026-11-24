-- Conteudo publico de marketing: artigo de alta intencao sobre modelo de PMOC
-- e planilha operacional gratuita. Nao altera schema nem RLS.
--
-- O material baixavel e uma estrutura de organizacao. Atividades,
-- periodicidades, parametros, habilitacao e documentos de responsabilidade
-- tecnica precisam ser definidos para o caso concreto.

INSERT INTO public.blog_categories (name, color, locale)
VALUES ('PMOC', '#06b6d4', 'pt-br')
ON CONFLICT (locale, name) DO NOTHING;

INSERT INTO public.blog_posts (
  title,
  slug,
  content,
  excerpt,
  cover_image_url,
  category,
  tags,
  status,
  author_name,
  meta_title,
  meta_description,
  published_at,
  locale,
  translation_group
) VALUES (
  'Modelo de PMOC: documentos, planilha e checklist para organizar o plano',
  'modelo-de-pmoc-planilha-checklist',
  $article$
<p class="lead"><strong>Um modelo de PMOC deve reunir a identificação do estabelecimento e dos responsáveis, a relação de ambientes e equipamentos, o plano de atividades com periodicidades definidas para o caso, os registros de execução, as evidências e as orientações para falhas ou emergências.</strong> A planilha ajuda a organizar essas informações, mas não substitui avaliação técnica, registro de responsabilidade quando exigido nem as normas aplicáveis ao imóvel.</p>

<p>Neste guia você encontra uma estrutura prática baseada no Anexo I da Portaria GM/MS nº 3.523/1998, um checklist documental e uma planilha CSV gratuita para começar o inventário. O conteúdo é educacional: adapte o modelo com o profissional competente e confira regras sanitárias, profissionais e locais antes de usar o documento como PMOC definitivo.</p>

<div style="margin:28px 0;padding:22px;border-radius:14px;background:#073b31;color:#fff">
  <p style="margin:0 0 8px;font-size:20px;font-weight:800">Baixe a planilha operacional de PMOC</p>
  <p style="margin:0 0 16px">Modelo editável em CSV para inventário, plano de atividades, execução, evidências, emergências e revisões. Abre no Excel, Google Planilhas e LibreOffice.</p>
  <a href="/downloads/modelo-operacional-pmoc-dominex.csv" download style="display:inline-block;padding:12px 18px;border-radius:9px;background:#00C597;color:#fff;text-decoration:none;font-weight:700">Baixar planilha gratuita</a>
  <p style="margin:14px 0 0;font-size:.86rem;color:#d1fae5">A planilha não define frequências nem substitui responsabilidade técnica. Os campos entre colchetes são instruções de preenchimento.</p>
</div>

<h2 id="documentos">Quais documentos formam um PMOC bem organizado?</h2>

<p>O PMOC não deve ser apenas uma lista genérica de limpezas. O Anexo I da Portaria nº 3.523/1998 apresenta uma estrutura com identificação do ambiente, proprietário, locatário ou preposto, responsável técnico, relação dos ambientes climatizados, plano de manutenção e controle e recomendações para falhas ou emergências.</p>

<table>
  <thead><tr><th>Bloco</th><th>O que registrar</th><th>Evidência útil</th></tr></thead>
  <tbody>
    <tr><td>Identificação</td><td>Estabelecimento, endereço, contatos e responsável pelo local</td><td>Cadastro atualizado e versão do plano</td></tr>
    <tr><td>Ambientes</td><td>Uso, ocupação, área climatizada e carga térmica</td><td>Relação de ambientes e projeto disponível</td></tr>
    <tr><td>Equipamentos</td><td>Código, tipo, fabricante, modelo, capacidade e localização</td><td>Inventário, etiqueta, foto e manual</td></tr>
    <tr><td>Responsabilidades</td><td>Responsável pelo estabelecimento e profissional habilitado quando aplicável</td><td>Registro profissional e documento de responsabilidade pertinente</td></tr>
    <tr><td>Plano</td><td>Atividade, periodicidade, critério técnico e próxima execução</td><td>Plano aprovado e vinculado ao equipamento</td></tr>
    <tr><td>Execução</td><td>Data, executor, aprovação, resultado, desvio e pendência</td><td>OS, checklist, fotos, medições e relatório</td></tr>
    <tr><td>Emergência</td><td>Conduta em falha, risco, parada e comunicação aos usuários</td><td>Procedimento e contatos de acionamento</td></tr>
    <tr><td>Revisão</td><td>Versão, data, responsável e motivo da alteração</td><td>Histórico de versões</td></tr>
  </tbody>
</table>

<p>Projeto, manuais, relatórios de qualidade do ar, registros de limpeza, certificados e documentos profissionais podem compor o conjunto conforme o sistema e a exigência aplicável. Não existe uma pasta idêntica para todos os imóveis.</p>

<h2 id="como-preencher">Como preencher o modelo de PMOC passo a passo?</h2>

<h3>1. Identifique o estabelecimento e o escopo</h3>
<p>Registre razão social ou nome do estabelecimento, endereço, contatos, responsável local e quais ambientes fazem parte do plano. Separe unidades ou prédios quando a operação, o acesso ou a responsabilidade forem diferentes.</p>

<h3>2. Faça o inventário dos ambientes e equipamentos</h3>
<p>Crie um código único para cada equipamento e use o mesmo código na etiqueta, na planilha, na ordem de serviço e nas fotos. Registre localização, tipo, fabricante, modelo, capacidade e componentes relevantes. Um inventário confiável evita que a equipe execute o plano em uma máquina e documente outra.</p>

<h3>3. Relacione atividades e critérios técnicos</h3>
<p>O plano deve descrever atividades verificáveis. Em vez de “fazer manutenção”, use ações que permitam confirmar o resultado, como inspecionar determinado componente, registrar condição, executar procedimento definido e indicar o que foi encontrado.</p>

<p>A Portaria nº 3.523/1998 traz práticas básicas para componentes dos sistemas de climatização, mas o plano final também precisa considerar projeto, fabricante, tipo de sistema, condições de uso, risco, normas técnicas vigentes e regras locais. Não copie uma lista de outro cliente sem avaliar essas diferenças.</p>

<h3>4. Defina periodicidades para o caso concreto</h3>
<p>A frequência não deve nascer de um campo pronto da internet. Segundo a orientação atual da Anvisa, a legislação federal e a ABNT NBR 13971 não fixam um único intervalo para todas as atividades de manutenção programada; a periodicidade deve ser definida pelo responsável competente, preservando a limpeza e o desempenho do sistema e observando regras locais.</p>

<h3>5. Registre cada execução e as pendências</h3>
<p>Para cada atividade, guarde data prevista e executada, identificação de quem executou e aprovou, resultado, evidência e pendência. Quando houver desvio, registre a ação tomada e o próximo passo. Marcar apenas “feito” reduz o valor técnico e gerencial do histórico.</p>

<h3>6. Controle versão e revisão</h3>
<p>Revise o plano quando mudar o sistema, o uso do ambiente, a ocupação, o risco, a referência técnica ou a responsabilidade. Mantenha data, versão e motivo da alteração. Assim, a equipe sabe qual plano está vigente e a fiscalização não recebe versões conflitantes.</p>

<h2 id="checklist">Checklist de documentos e evidências</h2>

<ul>
  <li><strong>Cadastro do estabelecimento:</strong> identificação, endereço e contato.</li>
  <li><strong>Responsáveis:</strong> proprietário, locatário ou preposto e, quando aplicável, profissional habilitado.</li>
  <li><strong>Inventário:</strong> ambientes, equipamentos, capacidades, códigos e localização.</li>
  <li><strong>Plano de atividades:</strong> tarefa, periodicidade, critério técnico e responsável.</li>
  <li><strong>Agenda:</strong> datas previstas, vencimentos e reagendamentos justificados.</li>
  <li><strong>Registros de execução:</strong> OS, checklist, executor, aprovação e resultado.</li>
  <li><strong>Evidências:</strong> fotos, medições, relatórios e documentos relacionados.</li>
  <li><strong>Pendências:</strong> desvio, risco, orçamento corretivo e prazo de retorno.</li>
  <li><strong>Emergências:</strong> recomendações, contatos e forma de comunicação.</li>
  <li><strong>Versões:</strong> data de revisão, revisor, aprovador e alterações realizadas.</li>
</ul>

<h2 id="60-mil-btu">O que muda acima de 60.000 BTU/h?</h2>

<p>A Lei nº 13.589/2018 determina PMOC para edifícios de uso público e coletivo com ambientes climatizados artificialmente. Já o art. 6º da Portaria nº 3.523/1998 estabelece que responsáveis por sistemas com capacidade acima de 5 TR, equivalentes a 60.000 BTU/h, mantenham responsável técnico habilitado para implantação e manutenção do plano.</p>

<p>Por isso, 60.000 BTU/h não deve ser tratado como uma dispensa geral de PMOC. É um marco expresso da Portaria para responsabilidade técnica. Habilitação, documento profissional, escopo e regras adicionais devem ser confirmados com o conselho competente e a vigilância sanitária local.</p>

<h2 id="planilha-ou-software">Planilha ou software de PMOC?</h2>

<table>
  <thead><tr><th>Planilha</th><th>Software</th></tr></thead>
  <tbody>
    <tr><td>Ajuda a estruturar um inventário inicial</td><td>Relaciona cliente, ambiente, equipamento e histórico</td></tr>
    <tr><td>Depende de atualização e controle manual</td><td>Gera recorrências e alertas a partir do plano</td></tr>
    <tr><td>Pode duplicar versões entre escritório e campo</td><td>Mantém a versão operacional compartilhada</td></tr>
    <tr><td>Evidências ficam em arquivos separados</td><td>Vincula checklist, fotos, assinatura e relatório à visita</td></tr>
    <tr><td>Funciona para começar com poucos ativos</td><td>Reduz retrabalho conforme clientes, ativos e técnicos crescem</td></tr>
  </tbody>
</table>

<p>A planilha gratuita desta página é uma boa base para mapear o processo. Quando a operação passa a controlar muitos equipamentos, visitas recorrentes e técnicos, centralizar a execução reduz versões desencontradas e tarefas esquecidas. Veja como funciona o <a href="/sistema-pmoc">sistema de PMOC da Dominex</a> e aprofunde a base legal no guia <a href="/blog/como-funciona-o-pmoc">como funciona o PMOC</a>.</p>

<div style="margin:28px 0;padding:22px;border-radius:14px;background:#073b31;color:#fff">
  <p style="margin:0 0 8px;font-size:20px;font-weight:800">Do plano à visita, sem perder o histórico</p>
  <p style="margin:0 0 16px">A Dominex conecta equipamentos, recorrências, checklist por máquina, fotos, assinatura e relatório de PMOC para escritório e equipe de campo.</p>
  <a href="/sistema-pmoc" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#00C597;color:#fff;text-decoration:none;font-weight:700">Conhecer o sistema de PMOC</a>
</div>

<h2 id="faq">Perguntas frequentes sobre modelo de PMOC</h2>

<h3>Existe um modelo oficial de PMOC?</h3>
<p>A Portaria GM/MS nº 3.523/1998 contém, no Anexo I, uma estrutura de PMOC com identificação, ambientes, responsáveis, plano de manutenção e recomendações de emergência. O documento final precisa ser adaptado ao sistema, ao local, às normas vigentes e à responsabilidade aplicável.</p>

<h3>Uma planilha pronta vale como PMOC?</h3>
<p>Não automaticamente. Ela organiza dados, mas só representa o plano real quando foi preenchida e validada para o estabelecimento, com atividades, frequências, responsabilidades e documentos compatíveis com o caso.</p>

<h3>Quem define a periodicidade das atividades?</h3>
<p>A periodicidade deve considerar avaliação do responsável competente, projeto, fabricante, condição de uso, risco, norma técnica e exigências sanitárias locais. Evite uma frequência universal copiada de outro imóvel.</p>

<h3>Quais evidências guardar?</h3>
<p>Guarde o que demonstra planejamento e execução: plano vigente, ordens de serviço, checklist, datas, responsáveis, fotos, medições, relatórios, pendências e correções. O conjunto exato depende do sistema e da exigência aplicável.</p>

<h3>O PMOC precisa ser atualizado?</h3>
<p>Sim. Mudanças em equipamentos, ambientes, ocupação, uso, riscos, responsáveis ou referências técnicas podem exigir revisão. Registre versão, data, motivo e aprovação.</p>

<h2 id="fontes">Fontes oficiais consultadas</h2>
<ul>
  <li><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm" target="_blank" rel="noopener">Lei nº 13.589/2018 — manutenção de sistemas de climatização e PMOC</a>.</li>
  <li><a href="https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html" target="_blank" rel="noopener">Portaria GM/MS nº 3.523/1998 — regulamento técnico</a>.</li>
  <li><a href="https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/anexo/anexo_prt3523_28_08_1998.pdf" target="_blank" rel="noopener">Anexo I da Portaria nº 3.523/1998 — estrutura do PMOC</a>.</li>
  <li><a href="https://bibliotecadigital.anvisa.gov.br/jspui/bitstream/anvisa/17752/1/Guia%20n%C2%BA%2073%2C%20de%2003%20de%20abril%20de%202025%20-%20vers%C3%A3o%202.pdf" target="_blank" rel="noopener">Anvisa — orientação atual que registra a revogação da RE nº 9/2003 pela RDC nº 886/2024 e a ABNT NBR 17037:2023 como referência para QAI</a>.</li>
</ul>

<p><small>Conteúdo produzido pela equipe Dominex e revisado em 12 de novembro de 2026 com base nas fontes oficiais citadas. Material educacional e operacional; não substitui parecer jurídico, avaliação sanitária, norma técnica licenciada nem atuação de profissional habilitado.</small></p>
  $article$,
  'Baixe uma planilha de PMOC e veja quais documentos, campos, evidências e revisões ajudam a organizar o plano sem confundir modelo operacional com responsabilidade técnica.',
  '/blog-cover-pmoc.svg',
  'PMOC',
  ARRAY['modelo de PMOC', 'planilha PMOC', 'checklist PMOC', 'documentos PMOC', 'PMOC grátis', 'Lei 13.589/2018', 'climatização'],
  'published',
  'Equipe Dominex',
  'Modelo de PMOC: planilha e checklist para baixar',
  'Baixe uma planilha de PMOC e veja documentos, campos, evidências e revisões para organizar o plano conforme a Lei 13.589/2018.',
  '2026-11-12T14:30:00-03:00',
  'pt-br',
  '61f34d59-393f-47bf-a12c-6255c5bdd378'
)
ON CONFLICT (locale, slug) DO UPDATE
SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  excerpt = EXCLUDED.excerpt,
  cover_image_url = EXCLUDED.cover_image_url,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  status = EXCLUDED.status,
  author_name = EXCLUDED.author_name,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = COALESCE(blog_posts.published_at, EXCLUDED.published_at),
  translation_group = EXCLUDED.translation_group,
  updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE locale = 'pt-br'
       AND slug = 'modelo-de-pmoc-planilha-checklist'
       AND status = 'published'
       AND content LIKE '%/downloads/modelo-operacional-pmoc-dominex.csv%'
       AND content LIKE '%RDC nº 886/2024%'
       AND content LIKE '%60.000 BTU/h não deve ser tratado como uma dispensa geral%'
  ) THEN
    RAISE EXCEPTION 'Artigo modelo-de-pmoc-planilha-checklist ficou incompleto';
  END IF;
END
$$;
