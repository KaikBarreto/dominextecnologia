-- Primeira onda dos clusters editoriais verticais: instalacoes eletricas e
-- energia solar. O conteudo prioriza intencao pratica, fontes primarias,
-- resposta direta, checklist original e links para as landings do segmento.
-- Nao altera schema nem RLS.

INSERT INTO public.blog_categories (name, color, locale)
VALUES ('Gestão de Campo', '#10b981', 'pt-br')
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
  'Checklist de ordem de serviço elétrica: como registrar a execução e a segurança',
  'checklist-ordem-de-servico-eletrica-nr10',
  $eletrica$
<p class="lead"><strong>Uma ordem de serviço elétrica bem estruturada registra quem autorizou e executou o trabalho, qual instalação foi atendida, escopo, riscos avaliados, medidas de controle, estado antes e depois, medições, materiais, evidências e aceite.</strong> Ela ajuda a organizar a operação, mas não substitui análise de risco, procedimento técnico, prontuário, projeto, ART ou responsabilidade profissional quando forem exigidos.</p>

<p>Este guia é voltado a gestores de empresas de instalações e manutenção elétrica que querem transformar um atendimento disperso em um histórico verificável. O foco é a gestão da visita e das evidências — não ensinar uma pessoa não habilitada a intervir em instalações elétricas.</p>

<div class="blog-pattern blog-pattern-warning">
  <p><strong>Atenção à vigência:</strong> em novembro de 2026, a redação da NR-10 modificada em 2019 continua vigente até 31 de maio de 2027. A nova redação consolidada pela Portaria MTE nº 737/2026 entra em vigor em 1º de junho de 2027, com regra de transição indicada pelo MTE. Consulte sempre a <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10" target="_blank" rel="noopener">página oficial e viva da NR-10</a>.</p>
</div>

<h2 id="o-que-e">O que é uma ordem de serviço elétrica?</h2>

<p>É o registro operacional que conecta solicitação, planejamento, autorização, execução e encerramento de um serviço. Em uma empresa organizada, a OS identifica o cliente e o local, descreve o circuito ou equipamento envolvido, reúne os controles definidos para aquela atividade e preserva o resultado da visita.</p>

<p>A OS não deve virar um formulário genérico usado para qualquer situação. Instalação de circuito, manutenção em quadro, inspeção termográfica, atendimento emergencial e atividade em altura têm escopos e riscos diferentes. O modelo pode ter uma base comum, mas o checklist precisa acompanhar o procedimento da empresa, a análise de risco e a condição encontrada no local.</p>

<p>A NR-10 vigente prevê procedimentos de trabalho específicos e padronizados e determina que os serviços sejam precedidos de ordens de serviço específicas, aprovadas por trabalhador autorizado, com pelo menos tipo, data, local e referência aos procedimentos adotados. A gestão digital ajuda a garantir que esses campos não fiquem espalhados entre papel, mensagem e memória.</p>

<h2 id="campos">Checklist: quais campos registrar na OS elétrica?</h2>

<table>
  <thead><tr><th>Bloco</th><th>Campos úteis</th><th>Por que registrar</th></tr></thead>
  <tbody>
    <tr><td>Identificação</td><td>Número da OS, cliente, unidade, endereço, solicitante e contato</td><td>Localiza o atendimento e evita confusão entre unidades</td></tr>
    <tr><td>Instalação</td><td>Quadro, circuito, equipamento, tensão nominal, identificação interna e localização</td><td>Liga a visita ao ativo correto e ao seu histórico</td></tr>
    <tr><td>Escopo</td><td>Defeito relatado, serviço autorizado, limites e itens fora do escopo</td><td>Alinha expectativa e reduz execução informal</td></tr>
    <tr><td>Equipe</td><td>Responsável, executantes, autorizações aplicáveis e horário</td><td>Registra quem planejou, autorizou e executou</td></tr>
    <tr><td>Planejamento</td><td>Procedimento de referência, análise de risco, condições impeditivas e permissões aplicáveis</td><td>Conecta a OS aos controles definidos pela organização</td></tr>
    <tr><td>Execução</td><td>Etapas realizadas, desvios, medições, componentes e materiais usados</td><td>Cria rastreabilidade técnica e de custo</td></tr>
    <tr><td>Evidências</td><td>Fotos antes/depois, etiquetas, instrumentos, anexos e observações</td><td>Mostra a condição encontrada e o resultado entregue</td></tr>
    <tr><td>Encerramento</td><td>Teste funcional, pendências, recomendações, aceite e assinatura</td><td>Evita que uma OS “concluída” esconda risco ou retorno necessário</td></tr>
  </tbody>
</table>

<p>Use esse quadro como roteiro administrativo. A definição de medições, sequência de desenergização, bloqueio, sinalização, proteção coletiva e individual deve vir de profissional competente, dos procedimentos da organização e das normas aplicáveis ao serviço real.</p>

<h2 id="antes-durante-depois">Como organizar o checklist antes, durante e depois?</h2>

<h3>Antes: confirmar escopo e condição de início</h3>
<p>Antes do deslocamento, vincule a OS ao local e ao ativo corretos, confira o histórico e separe documentação, materiais e instrumentos previstos. No local, a equipe deve confrontar o chamado com a condição real. Se surgir risco não previsto, equipamento diferente ou ampliação de escopo, registre a divergência e aplique o fluxo de reavaliação da empresa. A pressão por concluir não transforma uma condição insegura em condição aceitável.</p>

<h3>Durante: registrar fatos, não apenas marcar caixas</h3>
<p>Um checklist útil combina confirmações objetivas com campos para valores, fotos e observações. “Inspeção realizada” diz pouco; a identificação do ponto, o resultado obtido, o instrumento utilizado quando aplicável e a ação tomada dão contexto. Campos condicionais evitam formulários enormes: se houver anomalia, abrir foto, classificação, recomendação e pendência.</p>

<h3>Depois: testar, comunicar e separar pendência de conclusão</h3>
<p>O encerramento precisa dizer o que foi efetivamente entregue, quais testes previstos foram realizados e o que continua pendente. Se o cliente recusou uma recomendação ou uma peça depende de orçamento, isso deve aparecer como pendência com responsável e próximo passo — não desaparecer atrás do status “concluído”. Envie o relatório ao cliente e preserve o histórico para a próxima visita.</p>

<h2 id="nr10">Como relacionar a OS à NR-10 sem prometer “conformidade automática”?</h2>

<p>Nenhum software, formulário ou modelo isolado torna uma empresa conforme. A NR-10 trata de um sistema de prevenção que envolve organização, medidas de controle, documentação, capacitação, autorização, procedimentos, análise de risco e responsabilidades. A OS é uma evidência dentro desse sistema.</p>

<ul>
  <li><strong>Procedimento:</strong> referencie a versão do procedimento aplicável, em vez de copiar instruções técnicas soltas para cada OS.</li>
  <li><strong>Análise de risco:</strong> registre a análise ou o vínculo com o documento usado na atividade.</li>
  <li><strong>Autorização:</strong> mantenha a gestão de pessoas autorizadas fora da improvisação do dia do serviço.</li>
  <li><strong>Prontuário:</strong> quando aplicável, organize o Prontuário de Instalações Elétricas como conjunto documental próprio; não trate a OS como substituta.</li>
  <li><strong>Atualização:</strong> diferencie a regra vigente da redação que entrará em vigor em 2027 e planeje a revisão dos processos com responsável técnico e SST.</li>
</ul>

<p>Quando a atividade também envolver diferença de nível com risco de queda, avalie a <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35" target="_blank" rel="noopener">NR-35 na fonte oficial</a>. A versão foi atualizada em 2026; modelos antigos de internet podem não refletir treinamento, análise de risco e regras de transição atuais.</p>

<h2 id="exemplo">Exemplo de fluxo para uma manutenção em quadro elétrico</h2>

<ol>
  <li>O escritório abre a solicitação com local, quadro identificado, sintoma relatado e impacto operacional.</li>
  <li>O responsável avalia o chamado, define equipe, prioridade, procedimento e documentos necessários.</li>
  <li>O técnico consulta o histórico antes da visita e confirma a condição encontrada no local.</li>
  <li>A execução segue o procedimento da empresa; medições, componentes e desvios são registrados na OS.</li>
  <li>Fotos antes/depois e identificação dos materiais ficam vinculadas ao quadro, não perdidas na galeria do celular.</li>
  <li>O encerramento informa teste, resultado, recomendações, pendências e aceite do responsável pelo local.</li>
  <li>Se houver novo escopo, a empresa gera orçamento ou uma nova OS sem apagar a evidência da primeira visita.</li>
</ol>

<p>Esse fluxo também melhora orçamento e rentabilidade. Ao comparar horas previstas, horas executadas e materiais, a gestão entende onde há retorno, retrabalho ou escopo mal definido. Para aprofundar a parte financeira, consulte o guia de <a href="/blog/quanto-cobrar-por-um-servico-precificacao">precificação de serviços</a>.</p>

<div style="margin:28px 0;padding:22px;border-radius:14px;background:#073b31;color:#fff">
  <p style="margin:0 0 8px;font-size:20px;font-weight:800">Organize OS, checklist e histórico por instalação</p>
  <p style="margin:0 0 16px">Veja como a Dominex conecta agenda, equipe de campo, fotos, assinatura, materiais e relatório para empresas de instalações elétricas.</p>
  <a href="/sistema-para-eletricistas" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#00C597;color:#fff;text-decoration:none;font-weight:700">Conhecer a solução para eletricistas</a>
</div>

<h2 id="digital">Planilha, papel ou ordem de serviço digital?</h2>

<p>Papel pode atender um volume pequeno, mas dificulta busca, obrigatoriedade de campos, anexos e análise. Planilhas ajudam no controle gerencial, porém não foram desenhadas para conduzir o técnico no atendimento, trabalhar com fotos e assinatura ou manter histórico por ativo. Uma <a href="/os-digital">ordem de serviço digital</a> tende a ser mais útil quando o formulário é configurável, funciona na rotina real do campo e não transforma o técnico em digitador.</p>

<p>Antes de trocar de ferramenta, teste um caso simples, um emergencial e um com pendência. Confira uso no celular, acesso sem conexão, sincronização, permissões, exportação e relatório final. O <a href="/area-do-tecnico">aplicativo da equipe técnica</a> precisa reduzir etapas, e não apenas transportar o papel para uma tela pequena.</p>

<p>Também mantenha uma fonte clara para os dados: cadastro do cliente, ponto de instalação, quadro ou equipamento, OS, materiais e documentos. Quando o mesmo identificador muda em cada planilha, o histórico perde valor. O artigo sobre <a href="/blog/modelo-de-ordem-de-servico">modelo de ordem de serviço</a> mostra como montar essa base sem confundir campos gerais com requisitos específicos do setor elétrico.</p>

<h2 id="faq">Perguntas frequentes</h2>

<h3>Quais dados mínimos devem aparecer em uma OS elétrica?</h3>
<p>A NR-10 vigente menciona tipo, data, local e referência aos procedimentos de trabalho. Na gestão operacional, normalmente também são necessários cliente, instalação ou equipamento, escopo, equipe, horários, análise de risco ou vínculo, controles aplicáveis, execução, medições previstas, materiais, evidências, pendências e aceite.</p>

<h3>Uma ordem de serviço substitui a análise de risco?</h3>
<p>Não. A OS pode registrar ou vincular a análise usada, mas não substitui a avaliação de perigos, riscos e controles aplicáveis. O formato deve ser definido de acordo com a atividade e os procedimentos da organização.</p>

<h3>O checklist da NR-10 pode ser igual para todo serviço?</h3>
<p>Não é uma boa prática. Uma base comum ajuda, mas instalação, inspeção, manutenção, emergência e trabalho em altura têm condições distintas. O checklist deve acompanhar o procedimento e a análise aplicáveis ao serviço real.</p>

<h3>Preciso guardar fotos na OS?</h3>
<p>A exigência depende do processo e do contrato, mas fotos contextualizadas ajudam a demonstrar condição inicial, identificação, anomalia e resultado. Evite fotografar pessoas ou informações desnecessárias e controle o acesso aos anexos.</p>

<h3>Qual NR-10 devo consultar em 2026?</h3>
<p>Consulte a página oficial do MTE, que separa o texto vigente até 31 de maio de 2027 da nova redação com vigência em 1º de junho de 2027. Não use um PDF sem data como única referência.</p>

<h3>Software de OS garante conformidade com a NR-10?</h3>
<p>Não. O software organiza fluxos e evidências, mas conformidade depende da realidade da empresa, profissionais, medidas de prevenção, documentação, capacitação, procedimentos e atendimento às normas vigentes.</p>

<h2 id="fontes">Fontes e revisão</h2>

<ul>
  <li><a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10" target="_blank" rel="noopener">Ministério do Trabalho e Emprego — página oficial da NR-10, textos vigente e futuro</a>.</li>
  <li><a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35" target="_blank" rel="noopener">Ministério do Trabalho e Emprego — página oficial da NR-35</a>.</li>
  <li><a href="https://www.confea.org.br/servicos-prestados/anotacao-de-responsabilidade-tecnica-art" target="_blank" rel="noopener">Confea — Anotação de Responsabilidade Técnica (ART)</a>.</li>
</ul>

<p><small><strong>Revisado em 12/11/2026 pela Equipe Dominex.</strong> Conteúdo informativo sobre gestão operacional. Não substitui norma, projeto, procedimento, análise de risco, orientação de SST nem avaliação de profissional legalmente habilitado. A empresa deve validar o modelo para sua atividade, localidade e regras vigentes.</small></p>
  $eletrica$,
  'Veja quais campos registrar na ordem de serviço elétrica, como organizar o checklist e relacionar as evidências à NR-10 sem prometer conformidade automática.',
  '/segmentos/eletrica/1.webp',
  'Gestão de Campo',
  ARRAY['ordem de serviço elétrica', 'checklist NR-10', 'software para eletricista', 'instalações elétricas', 'gestão de campo', 'Dominex'],
  'published',
  'Equipe Dominex',
  'Checklist de ordem de serviço elétrica e NR-10',
  'Campos e exemplos para organizar uma ordem de serviço elétrica, checklist, evidências e histórico com atenção à NR-10 vigente.',
  now(),
  'pt-br',
  'd6eb0c2b-c94c-49ce-bacf-acde590f5fe2'
), (
  'Manutenção preventiva de energia solar: checklist de O&M e relatório',
  'manutencao-preventiva-energia-solar-checklist-om',
  $solar$
<p class="lead"><strong>A manutenção preventiva de um sistema fotovoltaico deve partir do projeto, dos manuais dos fabricantes, das condições do local e do plano definido pelo responsável técnico.</strong> Na gestão de O&amp;M, o checklist precisa identificar a usina e seus ativos, registrar segurança, inspeções previstas, desempenho, anomalias, evidências, ações executadas e pendências — sempre com histórico por equipamento.</p>

<p>Este guia ajuda integradores e empresas de operação e manutenção a estruturar ordens de serviço e relatórios. Ele não define procedimento elétrico nem periodicidade universal: tecnologia, potência, ambiente, contrato, garantia e orientação profissional mudam o plano.</p>

<h2 id="o-que-e-om">O que significa O&amp;M em energia solar?</h2>

<p>O&amp;M é a operação e manutenção do sistema ao longo da vida útil. O objetivo não é apenas “limpar painel”, mas acompanhar disponibilidade, segurança, desempenho, condição dos componentes, garantias e resposta a falhas. Em uma operação pequena, essas tarefas podem ser executadas pela mesma empresa que instalou. Em uma carteira maior, costumam existir rotinas separadas de monitoramento, preventiva, corretiva, limpeza e atendimento ao cliente.</p>

<p>A <a href="https://www.gov.br/aneel/pt-br/assuntos/geracao-distribuida/" target="_blank" rel="noopener">ANEEL mantém uma página oficial sobre micro e minigeração distribuída</a> e informa que a Resolução Normativa nº 1.059/2023 adequou regras à Lei nº 14.300/2022 e consolidou disposições na Resolução nº 1.000/2021. Essas regras tratam do relacionamento regulatório e do sistema de compensação; elas não substituem o plano técnico de manutenção de cada instalação.</p>

<h2 id="video">Vídeo: geração distribuída e sistema de compensação</h2>

<p>Antes de montar o plano de pós-venda, vale alinhar o conceito regulatório com a equipe comercial e de atendimento. Neste vídeo oficial, a ANEEL explica geração distribuída e o sistema de compensação. Três pontos para observar: a energia é produzida junto ou próxima ao consumo; há modalidades diferentes de participação; e a análise do cliente depende das regras e características de sua unidade.</p>

<figure class="blog-editorial-figure">
  <iframe src="https://www.youtube-nocookie.com/embed/Qs4PPytCASY" title="ANEEL explica geração distribuída e o sistema de compensação de energia elétrica" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
  <figcaption>Vídeo da Agência Nacional de Energia Elétrica, publicado em 23/01/2024. O player complementa o resumo textual e não substitui a consulta às regras atuais.</figcaption>
</figure>

<h2 id="inventario">Comece pelo inventário dos ativos</h2>

<p>Sem inventário confiável, a equipe não sabe exatamente o que está mantendo. Cada sistema deve ter identificação única e vínculo com cliente, unidade consumidora, endereço, projeto e contrato. Dentro dele, registre pelo menos módulos, inversores, estruturas, dispositivos de proteção e monitoramento conforme o escopo administrado pela empresa.</p>

<table>
  <thead><tr><th>Ativo ou conjunto</th><th>Dados úteis</th><th>Uso no pós-venda</th></tr></thead>
  <tbody>
    <tr><td>Sistema/usina</td><td>Código, potência, endereço, unidade, data de entrada em operação e responsável</td><td>Base para agenda, contrato, produção e chamados</td></tr>
    <tr><td>Módulos</td><td>Fabricante, modelo, quantidade, potência, arranjo e documentos de origem</td><td>Rastreio de lote, garantia e configuração</td></tr>
    <tr><td>Inversores</td><td>Fabricante, modelo, número de série, firmware quando relevante e acesso ao monitoramento</td><td>Histórico de alarmes, trocas e garantia</td></tr>
    <tr><td>Proteções e quadros</td><td>Identificação, localização, diagramas e componentes previstos no projeto</td><td>Contexto para inspeção e intervenção autorizada</td></tr>
    <tr><td>Documentos</td><td>Projeto, manual, ART quando aplicável, comissionamento, garantias e relatórios</td><td>Evita procurar arquivos durante uma falha</td></tr>
  </tbody>
</table>

<p>Número de série merece atenção especial. Fotografar a etiqueta e gravar o valor em campo pesquisável reduz erro de digitação e facilita garantia. A foto sozinha é uma evidência; o campo estruturado permite localizar todos os atendimentos daquele inversor.</p>

<h2 id="checklist">Checklist de manutenção preventiva fotovoltaica</h2>

<p>O roteiro abaixo é um modelo de organização da visita, não um procedimento técnico universal. O responsável deve adaptar campos, critérios, medições e limites ao projeto, ao fabricante e às condições reais.</p>

<h3>1. Identificação e segurança da visita</h3>
<ul>
  <li>Confirmar sistema, unidade, ativos, escopo contratado e responsável pelo acesso.</li>
  <li>Registrar equipe, horários, condições do local e documentos aplicáveis.</li>
  <li>Vincular análise de risco, procedimento e permissões definidos pela organização.</li>
  <li>Registrar condição impeditiva e interromper o fluxo quando o procedimento determinar.</li>
</ul>

<h3>2. Histórico e desempenho</h3>
<ul>
  <li>Consultar chamados, alarmes, intervenções, trocas e pendências anteriores.</li>
  <li>Comparar indicadores definidos no plano com períodos e condições equivalentes.</li>
  <li>Registrar indisponibilidade de comunicação separadamente de falha de geração.</li>
  <li>Evitar concluir “perda de desempenho” apenas por uma leitura isolada.</li>
</ul>

<h3>3. Inspeções previstas no plano</h3>
<ul>
  <li>Organizar os pontos de inspeção por conjunto: módulos, estrutura, cabos, conectores, quadros, proteções, inversores e monitoramento.</li>
  <li>Para cada ponto, usar resultado objetivo: conforme, anomalia, não aplicável ou não inspecionado.</li>
  <li>Quando houver anomalia, exigir descrição, localização, evidência e prioridade.</li>
  <li>Executar somente medições e intervenções previstas, por pessoas autorizadas e conforme os controles aplicáveis.</li>
</ul>

<h3>4. Limpeza e condição ambiental</h3>
<ul>
  <li>Registrar sujidade e fatores do local antes de decidir a ação.</li>
  <li>Seguir orientação do fabricante, procedimento da empresa e condições seguras de acesso.</li>
  <li>Documentar área atendida, método aprovado, data e condição após o serviço.</li>
  <li>Não transformar calendário fixo em regra universal; ambiente e evidência orientam o plano.</li>
</ul>

<h3>5. Encerramento e pendências</h3>
<ul>
  <li>Registrar ações executadas, componentes substituídos e respectivos números de série.</li>
  <li>Separar recomendação, orçamento necessário, garantia e retorno técnico.</li>
  <li>Definir responsável e prazo para cada pendência.</li>
  <li>Entregar relatório legível ao cliente e manter o histórico no ativo.</li>
</ul>

<h2 id="periodicidade">Qual é a periodicidade da manutenção solar?</h2>

<p>Não existe uma única resposta válida para todo sistema. A periodicidade deve considerar manual e garantia dos fabricantes, projeto, ambiente, criticidade, histórico, contrato, monitoramento, acesso e avaliação do responsável técnico. Poeira, maresia, vegetação, atividade industrial, presença de aves e eventos climáticos podem alterar a necessidade de inspeção ou limpeza.</p>

<p>Uma boa prática de gestão é separar três gatilhos:</p>

<ul>
  <li><strong>Rotina programada:</strong> visita planejada conforme o plano vigente.</li>
  <li><strong>Condição:</strong> indicador, alarme ou evidência que justifica investigação.</li>
  <li><strong>Evento:</strong> tempestade, obra próxima, falha, dano ou solicitação do cliente.</li>
</ul>

<p>Assim, o contrato tem previsibilidade sem impedir uma atuação baseada na condição do ativo. Se a empresa oferece manutenção recorrente, a <a href="/gestao-de-contratos">gestão de contratos</a> deve gerar as visitas futuras, preservar o escopo acordado e mostrar o que ficou pendente.</p>

<h2 id="relatorio">Como montar o relatório de manutenção?</h2>

<p>O relatório deve permitir que outra pessoa entenda o que foi encontrado, feito e recomendado. Evite um PDF com dezenas de caixas marcadas sem contexto. Inclua identificação do sistema, equipe, data, escopo, documentos de referência, resultados, evidências, materiais, anomalias, ações, pendências e aceite.</p>

<div class="blog-pattern blog-pattern-decision">
  <p><strong>Regra prática:</strong> toda anomalia deve responder quatro perguntas: onde está, qual evidência sustenta o registro, qual impacto ou prioridade foi atribuído pelo processo técnico e qual é o próximo passo. Sem isso, a foto vira arquivo e não gestão.</p>
</div>

<p>Fotos devem ter legenda e vínculo com o item inspecionado. Relatórios comparáveis usam os mesmos identificadores entre visitas. Quando houver troca de inversor ou componente serializado, registre a saída e a entrada, garantia, motivo e documento relacionado. Para organizar materiais aplicados, veja o guia de <a href="/blog/controle-estoque-ferramentas-materiais-tecnico">estoque e materiais da equipe técnica</a>.</p>

<h2 id="fluxo">Exemplo de fluxo: alerta do inversor até o retorno</h2>

<ol>
  <li>O monitoramento ou cliente gera um chamado vinculado ao sistema e ao inversor.</li>
  <li>O escritório consulta histórico, contrato, garantia e pendências antes de agendar.</li>
  <li>O responsável define prioridade, equipe, escopo e documentos necessários.</li>
  <li>O técnico recebe a <a href="/os-digital">ordem de serviço digital</a> com identificação e checklist aplicável.</li>
  <li>A visita registra diagnóstico autorizado, evidências, ação executada e situação do ativo.</li>
  <li>Se depender de fabricante ou peça, a OS gera pendência e acompanhamento, não uma conclusão falsa.</li>
  <li>O retorno é agendado com o mesmo histórico, e o cliente recebe atualização objetiva.</li>
</ol>

<p>Esse encadeamento reduz a perda de contexto entre comercial, suporte e campo. Também ajuda a medir tempo de resposta, reincidência, custo da garantia e rentabilidade do contrato.</p>

<div style="margin:28px 0;padding:22px;border-radius:14px;background:#073b31;color:#fff">
  <p style="margin:0 0 8px;font-size:20px;font-weight:800">Leve o histórico da usina para a equipe em campo</p>
  <p style="margin:0 0 16px">Conheça a Dominex para organizar instalações, O&amp;M, equipamentos, contratos, checklists, fotos e relatórios de energia solar.</p>
  <a href="/sistema-para-energia-solar" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#00C597;color:#fff;text-decoration:none;font-weight:700">Ver a solução para energia solar</a>
</div>

<h2 id="faq">Perguntas frequentes</h2>

<h3>O que verificar na manutenção preventiva de energia solar?</h3>
<p>O plano deve considerar identificação e histórico dos ativos, segurança, desempenho, inspeções previstas pelo projeto e fabricantes, condição ambiental, monitoramento, anomalias, evidências, ações e pendências. Os pontos técnicos e limites precisam ser definidos por responsável competente.</p>

<h3>De quanto em quanto tempo deve ser feita a manutenção?</h3>
<p>A periodicidade depende do projeto, manuais, ambiente, criticidade, garantias, histórico e contrato. Não adote um intervalo encontrado na internet como regra universal; documente o critério usado no plano de O&amp;M.</p>

<h3>Limpeza de painel solar é a mesma coisa que manutenção?</h3>
<p>Não. Limpeza pode fazer parte do plano, mas O&amp;M também envolve monitoramento, histórico, inspeções, resposta a falhas, componentes, garantias, documentação e acompanhamento de pendências.</p>

<h3>Quais dados guardar do inversor?</h3>
<p>Fabricante, modelo, número de série, localização, data de instalação, documentos, garantia, histórico de alarmes, intervenções, trocas e evidências. Registre apenas acessos necessários e proteja credenciais de monitoramento.</p>

<h3>Posso usar o mesmo checklist em todas as usinas?</h3>
<p>Uma estrutura comum ajuda, mas o conteúdo deve variar por projeto, tecnologia, fabricante, ambiente, potência, acesso e escopo contratado. Use versões controladas e preserve qual modelo foi aplicado em cada visita.</p>

<h3>Um software substitui o responsável técnico?</h3>
<p>Não. O sistema organiza ativos, agenda, OS, evidências, contratos e relatórios. Critérios técnicos, procedimentos, responsabilidade profissional e atendimento às regras continuam sob responsabilidade da empresa e dos profissionais competentes.</p>

<h2 id="fontes">Fontes e revisão</h2>

<ul>
  <li><a href="https://www.gov.br/aneel/pt-br/assuntos/geracao-distribuida/" target="_blank" rel="noopener">ANEEL — Micro e Minigeração Distribuída</a>.</li>
  <li><a href="https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14300.htm" target="_blank" rel="noopener">Lei nº 14.300/2022 — marco legal da micro e minigeração distribuída</a>.</li>
  <li><a href="https://www.gov.br/aneel/pt-br/centrais-de-conteudos/procedimentos-regulatorios/prodist" target="_blank" rel="noopener">ANEEL — Procedimentos de Distribuição (PRODIST)</a>.</li>
  <li><a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10" target="_blank" rel="noopener">Ministério do Trabalho e Emprego — NR-10</a>.</li>
  <li><a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35" target="_blank" rel="noopener">Ministério do Trabalho e Emprego — NR-35</a>.</li>
</ul>

<p><small><strong>Revisado em 12/11/2026 pela Equipe Dominex.</strong> Conteúdo informativo de gestão de O&amp;M. Não substitui projeto, manuais, garantias, normas, análise de risco, procedimentos da organização nem avaliação de profissional legalmente habilitado.</small></p>
  $solar$,
  'Monte um checklist de manutenção preventiva solar com inventário, histórico, inspeções, desempenho, evidências, pendências e relatório de O&M.',
  '/segmentos/solar/2.webp',
  'Gestão de Campo',
  ARRAY['manutenção preventiva energia solar', 'checklist energia solar', 'O&M solar', 'ordem de serviço solar', 'software energia solar', 'Dominex'],
  'published',
  'Equipe Dominex',
  'Manutenção preventiva solar: checklist de O&M',
  'Checklist de manutenção preventiva de energia solar: ativos, inspeções, desempenho, evidências, pendências e relatório de O&M.',
  now(),
  'pt-br',
  'a1195368-ed50-41a8-b4be-07d2d6e9fc54'
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

-- Converte o player legado do PMOC para o dominio de privacidade aprimorada.
UPDATE public.blog_posts
   SET content = replace(
         content,
         'https://www.youtube.com/embed/zL9gzpfX6_8',
         'https://www.youtube-nocookie.com/embed/zL9gzpfX6_8'
       ),
       updated_at = now()
 WHERE locale = 'pt-br'
   AND slug = 'como-funciona-o-pmoc'
   AND content LIKE '%https://www.youtube.com/embed/zL9gzpfX6_8%';

-- Acrescenta um video oficial do Sebrae ao guia de precificacao, somente se o
-- bloco ainda nao existir. O texto continua suficiente sem o player.
UPDATE public.blog_posts
   SET content = replace(
         content,
         '<h2 id="tres-formas">As 3 formas de precificar: BDI, markup e margem de contribuição</h2>',
         $video$<h2 id="video-precificacao">Vídeo: como calcular o preço de venda de um serviço</h2>
<p>O vídeo oficial do Sebrae resume a relação entre gastos fixos e variáveis, margem de contribuição, preço de venda e ponto de equilíbrio. Use-o como introdução e faça a conta com seus próprios custos: copiar a margem de outra empresa não revela o preço sustentável da sua operação.</p>
<figure class="blog-editorial-figure">
  <iframe src="https://www.youtube-nocookie.com/embed/ofuPr0mkmNA" title="Sebrae explica como calcular o preço de venda de produto e serviço" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
  <figcaption>Vídeo do Sebrae, publicado em 17/12/2024. A explicação complementa as fórmulas e os exemplos detalhados abaixo.</figcaption>
</figure>

<h2 id="tres-formas">As 3 formas de precificar: BDI, markup e margem de contribuição</h2>$video$
       ),
       updated_at = now()
 WHERE locale = 'pt-br'
   AND slug = 'quanto-cobrar-por-um-servico-precificacao'
   AND content LIKE '%<h2 id="tres-formas">%'
   AND content NOT LIKE '%youtube-nocookie.com/embed/ofuPr0mkmNA%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE locale = 'pt-br'
       AND slug = 'checklist-ordem-de-servico-eletrica-nr10'
       AND status = 'published'
       AND content LIKE '%Revisado em 12/11/2026%'
       AND content LIKE '%normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10%'
       AND content LIKE '%/sistema-para-eletricistas%'
       AND content LIKE '%<h2 id="faq">%'
  ) THEN
    RAISE EXCEPTION 'Artigo vertical de instalacoes eletricas ficou incompleto';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE locale = 'pt-br'
       AND slug = 'manutencao-preventiva-energia-solar-checklist-om'
       AND status = 'published'
       AND content LIKE '%youtube-nocookie.com/embed/Qs4PPytCASY%'
       AND content LIKE '%www.gov.br/aneel%'
       AND content LIKE '%/sistema-para-energia-solar%'
       AND content LIKE '%<h2 id="faq">%'
  ) THEN
    RAISE EXCEPTION 'Artigo vertical de energia solar ficou incompleto';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE locale = 'pt-br'
       AND slug = 'como-funciona-o-pmoc'
       AND content LIKE '%youtube.com/embed/zL9gzpfX6_8%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE locale = 'pt-br'
       AND slug = 'como-funciona-o-pmoc'
       AND content LIKE '%youtube-nocookie.com/embed/zL9gzpfX6_8%'
  ) THEN
    RAISE EXCEPTION 'Player do artigo PMOC nao foi normalizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE locale = 'pt-br'
       AND slug = 'quanto-cobrar-por-um-servico-precificacao'
       AND content LIKE '%youtube-nocookie.com/embed/ofuPr0mkmNA%'
  ) THEN
    RAISE EXCEPTION 'Video do Sebrae nao foi inserido no artigo de precificacao';
  END IF;
END
$$;
