-- Atualiza o conteudo do artigo do blog 'Como funciona o PMOC' (versao expandida)
-- Aplicar via: npx supabase db query --linked < supabase/update-blog-pmoc.sql  (ou stdin)
update public.blog_posts
set
    content = $html$
<p>Se você trabalha com climatização ou administra um prédio com ar-condicionado, mais cedo ou mais tarde vai esbarrar em uma sigla de quatro letras que mexe com obrigação legal, saúde pública e contrato de manutenção: <strong>PMOC</strong>. Apesar de ser exigido por lei há mais de duas décadas, ainda gera muita confusão — quem precisa ter, o que entra no documento, com que frequência fazer a manutenção e o que acontece se ele não existir.</p>

<p>Neste guia completo, a equipe Dominex explica, de forma técnica e didática, <strong>como funciona o PMOC do começo ao fim</strong>: o conceito, a base legal, quem é obrigado, o conteúdo do plano, a periodicidade da manutenção por componente, as responsabilidades de cada parte, o passo a passo de implantação, os riscos de não ter e como um <a href="/sistema-pmoc">software de PMOC</a> transforma essa obrigação em um processo simples e auditável.</p>

<h2>O que é o PMOC</h2>

<p>PMOC é a sigla de <strong>Plano de Manutenção, Operação e Controle</strong>. É um documento técnico que descreve, de maneira estruturada, todas as rotinas necessárias para manter os sistemas de climatização de um ambiente funcionando dentro de padrões de <strong>qualidade do ar interior</strong> e de eficiência. Em outras palavras, o PMOC é o "plano de saúde" do ar-condicionado de um edifício.</p>

<p>Ele não é uma simples ordem de serviço nem um contrato de manutenção genérico. O PMOC reúne o inventário dos equipamentos, o cronograma de atividades (limpeza, troca de filtros, verificação de componentes), os responsáveis técnicos, os parâmetros a serem monitorados e os registros que comprovam que a manutenção realmente aconteceu. É, ao mesmo tempo, um <strong>plano de ação</strong> e um <strong>histórico de evidências</strong>.</p>

<blockquote>
<p>O PMOC nasceu de uma preocupação concreta de saúde pública: ambientes climatizados artificialmente, quando mal mantidos, acumulam poeira, fungos, bactérias e poluentes que circulam pelo ar e adoecem as pessoas. O caso mais conhecido no Brasil foi a morte de um ministro de Estado em 1998, atribuída à contaminação por uma bactéria proliferada em um sistema de ar-condicionado mal conservado — episódio que acelerou a regulamentação da qualidade do ar em ambientes climatizados.</p>
</blockquote>

<h2>Para que serve e por que existe</h2>

<p>O objetivo central do PMOC é garantir a <strong>qualidade do ar interior (QAI)</strong> em ambientes de uso coletivo climatizados artificialmente. Um sistema de ar-condicionado mal mantido recircula ar contaminado e pode causar a chamada "síndrome do edifício doente": dores de cabeça, alergias, problemas respiratórios e até doenças graves como a legionelose.</p>

<p>Além da saúde, o PMOC traz benefícios diretos para quem opera o sistema:</p>

<ul>
  <li><strong>Eficiência energética:</strong> equipamentos limpos e regulados consomem menos energia. Um filtro entupido ou um condensador sujo podem aumentar o consumo em dois dígitos percentuais.</li>
  <li><strong>Vida útil dos equipamentos:</strong> manutenção preventiva evita falhas catastróficas e prolonga a vida do compressor, o componente mais caro do sistema.</li>
  <li><strong>Segurança jurídica:</strong> com o plano em dia, o proprietário se protege de autuações de vigilância sanitária e de responsabilização em caso de problemas de saúde dos ocupantes.</li>
  <li><strong>Conforto e produtividade:</strong> ar limpo e temperatura estável melhoram o ambiente de trabalho e de atendimento ao público.</li>
</ul>

<h2>Base legal: as três normas que sustentam o PMOC</h2>

<p>O PMOC não é uma boa prática opcional — é uma exigência legal construída sobre três pilares normativos. Conhecê-los é essencial para qualquer empresa de refrigeração que ofereça esse serviço.</p>

<h3>Lei nº 13.589/2018 — a lei do PMOC</h3>

<p>É a norma mais importante e a que dá o nome popular ao tema. A <strong>Lei Federal nº 13.589, de 4 de janeiro de 2018</strong>, tornou obrigatória a manutenção de instalações e equipamentos de sistemas de climatização em edificações de uso público e coletivo.</p>

<blockquote>
<p>A Lei nº 13.589/2018 determina, em síntese, que todos os edifícios de uso público e coletivo que possuam ambientes de ar interior climatizado artificialmente devem dispor de um Plano de Manutenção, Operação e Controle (PMOC) dos respectivos sistemas, executado por responsável técnico habilitado. (Paráfrase do texto legal — consulte a íntegra publicada no Diário Oficial da União.)</p>
</blockquote>

<h3>Portaria GM/MS nº 3.523/1998</h3>

<p>Anterior à lei, a <strong>Portaria do Ministério da Saúde nº 3.523/1998</strong> foi a primeira norma a exigir o PMOC para sistemas de climatização com capacidade acima de determinado porte, estabelecendo medidas básicas de limpeza, manutenção e controle da qualidade do ar para prevenir riscos à saúde dos ocupantes.</p>

<h3>Resolução ANVISA RE nº 9/2003</h3>

<p>A <strong>Resolução RE nº 9, de 16 de janeiro de 2003, da ANVISA</strong>, complementa o arcabouço definindo <strong>padrões referenciais de qualidade do ar interior</strong> em ambientes climatizados artificialmente de uso público e coletivo — como limites para contaminação microbiológica e recomendações de renovação de ar. É a referência técnica para os parâmetros que o PMOC deve monitorar.</p>

<p>Vale lembrar que, além dessas normas federais, podem existir <strong>regulamentações estaduais e municipais</strong> e exigências específicas da vigilância sanitária local. Sempre verifique as regras da sua região.</p>

<h2>Quem é obrigado a ter PMOC</h2>

<p>A obrigatoriedade recai sobre os <strong>edifícios de uso público e coletivo</strong> com ambientes climatizados artificialmente. Na prática, isso abrange uma lista ampla:</p>

<ol>
  <li>Hospitais, clínicas, laboratórios e demais estabelecimentos de saúde;</li>
  <li>Shoppings, supermercados e lojas de grande porte;</li>
  <li>Escolas, universidades e creches;</li>
  <li>Hotéis, restaurantes e casas de eventos;</li>
  <li>Aeroportos, rodoviárias e estações de transporte;</li>
  <li>Edifícios comerciais, escritórios e prédios públicos;</li>
  <li>Bancos, repartições e qualquer ambiente de uso coletivo com climatização central ou de grande capacidade.</li>
</ol>

<p>A residência unifamiliar (a casa de uma família) normalmente <strong>não</strong> está sujeita à obrigação. O foco da legislação são os ambientes onde muitas pessoas convivem e respiram o mesmo ar tratado artificialmente. Mesmo assim, manter um plano de manutenção em qualquer instalação é sempre recomendável.</p>

<h2>O que compõe o documento PMOC</h2>

<p>Um PMOC bem elaborado não é uma folha solta — é um conjunto organizado de informações. Veja os elementos que não podem faltar:</p>

<ul>
  <li><strong>Identificação do estabelecimento:</strong> razão social, endereço, atividade e responsável pela edificação.</li>
  <li><strong>Inventário dos equipamentos:</strong> relação de todos os aparelhos de climatização (splits, self-contained, chillers, fancoils, VRF), com tipo, capacidade, localização e identificação individual.</li>
  <li><strong>Descrição dos ambientes climatizados:</strong> áreas atendidas, ocupação e finalidade de cada espaço.</li>
  <li><strong>Cronograma de atividades:</strong> a tabela de tarefas com periodicidade (diária, mensal, trimestral, semestral, anual).</li>
  <li><strong>Procedimentos de operação e controle:</strong> como o sistema deve ser operado e quais parâmetros monitorar.</li>
  <li><strong>Responsável Técnico (RT):</strong> identificação do profissional habilitado, com registro no conselho de classe (ART/RRT/TRT, conforme a formação).</li>
  <li><strong>Registros de execução:</strong> o histórico das manutenções realizadas — a comprovação de que o plano saiu do papel.</li>
</ul>

<figure style="margin:2rem 0;text-align:center">
  <svg width="100%" viewBox="0 0 720 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ciclo do PMOC: Planejar, Executar, Registrar e Comprovar">
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L7,3 L0,6 Z" fill="#00C597"/>
      </marker>
    </defs>
    <rect x="14" y="64" width="150" height="72" rx="14" fill="#0f1c1a" stroke="#00C597" stroke-width="2"/>
    <text x="89" y="96" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#ffffff">Planejar</text>
    <text x="89" y="116" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#9ca3af">inventário + plano</text>

    <rect x="194" y="64" width="150" height="72" rx="14" fill="#0f1c1a" stroke="#00C597" stroke-width="2"/>
    <text x="269" y="96" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#ffffff">Executar</text>
    <text x="269" y="116" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#9ca3af">manutenção em campo</text>

    <rect x="374" y="64" width="150" height="72" rx="14" fill="#0f1c1a" stroke="#00C597" stroke-width="2"/>
    <text x="449" y="96" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#ffffff">Registrar</text>
    <text x="449" y="116" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#9ca3af">checklist + evidências</text>

    <rect x="554" y="64" width="150" height="72" rx="14" fill="#00C597"/>
    <text x="629" y="96" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#06302b">Comprovar</text>
    <text x="629" y="116" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#06302b">relatório + assinatura RT</text>

    <line x1="164" y1="100" x2="190" y2="100" stroke="#00C597" stroke-width="3" marker-end="url(#arrow)"/>
    <line x1="344" y1="100" x2="370" y2="100" stroke="#00C597" stroke-width="3" marker-end="url(#arrow)"/>
    <line x1="524" y1="100" x2="550" y2="100" stroke="#00C597" stroke-width="3" marker-end="url(#arrow)"/>
    <path d="M629 140 q0 40 -270 40 q-270 0 -270 -40" fill="none" stroke="#374151" stroke-width="2" stroke-dasharray="6 6" marker-end="url(#arrow)"/>
    <text x="359" y="195" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#6b7280">ciclo contínuo — repete a cada período</text>
  </svg>
  <figcaption style="color:#9ca3af;font-size:.85rem;margin-top:.5rem">O ciclo do PMOC: planejar, executar, registrar e comprovar — repetido continuamente conforme a periodicidade de cada atividade.</figcaption>
</figure>

<h2>Periodicidade da manutenção por componente</h2>

<p>Talvez a dúvida mais comum seja: "de quanto em quanto tempo cada tarefa precisa ser feita?". A frequência varia conforme o componente, o tipo de equipamento e o ambiente. A tabela abaixo resume as <strong>periodicidades típicas</strong> usadas como referência em planos de PMOC. Casos específicos (como hospitais e indústrias) podem exigir frequências mais rigorosas.</p>

<table>
  <thead>
    <tr>
      <th>Atividade / Componente</th>
      <th>Periodicidade típica</th>
      <th>Objetivo</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Limpeza dos filtros de ar</td><td>Mensal</td><td>Remover poeira e evitar proliferação microbiológica</td></tr>
    <tr><td>Verificação das bandejas de condensado</td><td>Mensal</td><td>Evitar água parada e mofo</td></tr>
    <tr><td>Limpeza do gabinete e serpentinas (evaporadora)</td><td>Trimestral</td><td>Manter troca térmica e higiene</td></tr>
    <tr><td>Limpeza da serpentina do condensador</td><td>Trimestral</td><td>Garantir dissipação de calor e eficiência</td></tr>
    <tr><td>Verificação de ruídos, vibração e fixação</td><td>Trimestral</td><td>Identificar desgastes mecânicos</td></tr>
    <tr><td>Medição de parâmetros elétricos e de pressão</td><td>Semestral</td><td>Detectar sobrecarga e vazamento de gás</td></tr>
    <tr><td>Limpeza de dutos e tomadas de ar externo</td><td>Anual</td><td>Renovação de ar e controle de contaminantes</td></tr>
    <tr><td>Análise da qualidade do ar interior (QAI)</td><td>Semestral / Anual</td><td>Verificar conformidade com a RE nº 9/2003</td></tr>
  </tbody>
</table>

<p><em>Importante:</em> esses valores são referências de mercado. O cronograma definitivo deve ser definido pelo Responsável Técnico conforme o porte, a criticidade do ambiente e as recomendações dos fabricantes.</p>

<h2>Rotinas: o que se faz em cada periodicidade</h2>

<p>Saber que existe uma "tarefa trimestral" é só metade da história. Na prática, cada periodicidade tem um <strong>conjunto característico de rotinas</strong>, e é o acúmulo delas ao longo do ano que mantém o sistema saudável. Veja, na ponta do lápis, o que tipicamente compõe cada nível de visita.</p>

<h3>Rotina mensal — higiene e inspeção visual</h3>

<p>É a visita mais frequente e a mais barata de executar, mas a que mais impacta a qualidade do ar no dia a dia. Concentra-se na <strong>limpeza dos filtros</strong> (lavagem ou troca, conforme o tipo), na <strong>verificação das bandejas de condensado</strong> (escoamento e ausência de água parada, que vira foco de mofo e bactérias) e em uma <strong>inspeção visual geral</strong>: gabinete, drenos, ruídos óbvios e funcionamento básico. Em ambientes críticos (hospitais, laboratórios), a periodicidade dos filtros pode ser ainda menor.</p>

<h3>Rotina trimestral — limpeza profunda dos componentes de troca térmica</h3>

<p>A cada três meses entram as tarefas que exigem mais tempo e ferramenta: <strong>limpeza das serpentinas da evaporadora e do condensador</strong>, higienização do gabinete, limpeza criteriosa das bandejas e drenos, e a <strong>verificação mecânica</strong> — ruídos, vibração, fixação de suportes e estado das hélices/ventiladores. É a manutenção que recupera a eficiência de troca de calor que a sujeira vai roubando ao longo do trimestre.</p>

<h3>Rotina semestral — medições e parâmetros</h3>

<p>De seis em seis meses o foco passa para os <strong>parâmetros mensuráveis</strong>: medições elétricas (tensão, corrente, consumo), verificação de pressões e carga de gás (indício precoce de vazamento), avaliação do desempenho térmico e, conforme o plano definido pelo RT, a <strong>análise da qualidade do ar interior (QAI)</strong> em referência à RE nº 9/2003. É a visita que detecta problemas antes que virem parada de equipamento.</p>

<h3>Rotina anual — revisão geral e limpeza de dutos</h3>

<p>Uma vez por ano faz-se a <strong>revisão completa</strong> do sistema: limpeza profunda de dutos e das tomadas de ar externo, conferência geral de toda a instalação, revisão de isolamentos e dampers, e a consolidação do estado de cada equipamento do inventário. É também o momento natural para <strong>revisar o próprio PMOC</strong> — atualizar inventário, ambientes e cronograma diante de qualquer mudança no edifício.</p>

<h2>Como as visitas se sobrepõem (e por que isso importa)</h2>

<p>Aqui está o ponto que mais confunde quem está montando um cronograma de PMOC: as periodicidades <strong>não são listas independentes</strong>. Elas se acumulam. Quando chega o mês de uma visita trimestral, o técnico também executa as tarefas mensais daquele mês. Na visita semestral, ele faz semestral <em>+</em> trimestral <em>+</em> mensal. E na anual, faz tudo de uma vez.</p>

<blockquote>
<p>Regra de ouro: <strong>a visita de maior periodicidade absorve as menores que caem no mesmo mês.</strong> Você nunca manda o técnico duas vezes no mesmo mês para fazer "o mensal" e depois "o trimestral" — é uma visita só, com o checklist somado.</p>
</blockquote>

<p>Isso tem duas consequências práticas. Primeiro, o <strong>esforço de cada visita varia ao longo do ano</strong>: a maioria dos meses é leve (só o mensal), alguns são médios (trimestral acumulado) e um ou dois são pesados (semestral e anual acumulados). Segundo, dimensionar a equipe e o tempo de cada atendimento depende de entender essa sobreposição — senão o mês da visita anual vira um gargalo inesperado.</p>

<p>O cronograma típico de 12 meses fica assim — o <strong>✅</strong> marca em quais meses cada periodicidade acontece:</p>

<table>
  <thead>
    <tr>
      <th>Mês</th>
      <th>Mensal</th>
      <th>Trimestral</th>
      <th>Semestral</th>
      <th>Anual</th>
      <th>O que a visita absorve</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>1</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>2</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>3</td><td>✅</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal + Trimestral</td></tr>
    <tr><td>4</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>5</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>6</td><td>✅</td><td>✅</td><td>✅</td><td style="color:#9ca3af">—</td><td>Mensal + Trimestral + Semestral</td></tr>
    <tr><td>7</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>8</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>9</td><td>✅</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal + Trimestral</td></tr>
    <tr><td>10</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>11</td><td>✅</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td style="color:#9ca3af">—</td><td>Mensal (leve)</td></tr>
    <tr><td>12</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>Tudo acumulado (visita pesada)</td></tr>
  </tbody>
</table>

<p>Repare na lógica: o <strong>mensal acontece nos 12 meses</strong>; o <strong>trimestral cai a cada 3 meses</strong> (3, 6, 9, 12); o <strong>semestral a cada 6</strong> (6 e 12); o <strong>anual uma vez</strong> (12). Nos meses em que coincidem, é uma única visita que executa o checklist somado. O mês 12, onde tudo se encontra, é a visita mais demorada do ciclo — e a que mais precisa de planejamento.</p>

<figure style="margin:2rem 0;text-align:center">
  <svg width="100%" viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Linha do tempo de 12 meses mostrando a sobreposição das visitas mensal, trimestral, semestral e anual">
    <!-- painel de fundo próprio: legível em tema claro e dark -->
    <rect x="0" y="0" width="720" height="360" rx="16" fill="#0f1c1a"/>

    <!-- cabeçalho com numeração dos meses -->
    <g font-family="sans-serif" font-size="11" fill="#9ca3af" text-anchor="middle">
      <text x="56" y="36">1</text><text x="112" y="36">2</text><text x="168" y="36">3</text>
      <text x="224" y="36">4</text><text x="280" y="36">5</text><text x="336" y="36">6</text>
      <text x="392" y="36">7</text><text x="448" y="36">8</text><text x="504" y="36">9</text>
      <text x="560" y="36">10</text><text x="616" y="36">11</text><text x="672" y="36">12</text>
    </g>
    <text x="20" y="36" font-family="sans-serif" font-size="10" fill="#6b7280" text-anchor="start" letter-spacing="1">MÊS</text>

    <!-- ===== MENSAL ===== label acima, pontos na linha abaixo ===== -->
    <text x="20" y="66" font-family="sans-serif" font-size="12" font-weight="700" fill="#00C597" text-anchor="start">Mensal — todos os meses</text>
    <line x1="56" y1="84" x2="672" y2="84" stroke="#1f3b35" stroke-width="2"/>
    <g fill="#00C597">
      <circle cx="56" cy="84" r="5"/><circle cx="112" cy="84" r="5"/><circle cx="168" cy="84" r="5"/>
      <circle cx="224" cy="84" r="5"/><circle cx="280" cy="84" r="5"/><circle cx="336" cy="84" r="5"/>
      <circle cx="392" cy="84" r="5"/><circle cx="448" cy="84" r="5"/><circle cx="504" cy="84" r="5"/>
      <circle cx="560" cy="84" r="5"/><circle cx="616" cy="84" r="5"/><circle cx="672" cy="84" r="5"/>
    </g>

    <!-- ===== TRIMESTRAL ===== -->
    <text x="20" y="146" font-family="sans-serif" font-size="12" font-weight="700" fill="#38bdf8" text-anchor="start">Trimestral — meses 3, 6, 9, 12</text>
    <line x1="56" y1="164" x2="672" y2="164" stroke="#22323f" stroke-width="2"/>
    <g fill="#38bdf8">
      <circle cx="168" cy="164" r="6"/><circle cx="336" cy="164" r="6"/><circle cx="504" cy="164" r="6"/><circle cx="672" cy="164" r="6"/>
    </g>

    <!-- ===== SEMESTRAL ===== -->
    <text x="20" y="226" font-family="sans-serif" font-size="12" font-weight="700" fill="#fbbf24" text-anchor="start">Semestral — meses 6 e 12</text>
    <line x1="56" y1="244" x2="672" y2="244" stroke="#3a3320" stroke-width="2"/>
    <g fill="#fbbf24">
      <circle cx="336" cy="244" r="7"/><circle cx="672" cy="244" r="7"/>
    </g>

    <!-- ===== ANUAL ===== -->
    <text x="20" y="306" font-family="sans-serif" font-size="12" font-weight="700" fill="#f87171" text-anchor="start">Anual — mês 12 (tudo se encontra aqui)</text>
    <line x1="56" y1="324" x2="672" y2="324" stroke="#3a2424" stroke-width="2"/>
    <circle cx="672" cy="324" r="8" fill="#f87171"/>

    <!-- guias verticais nas colunas de coincidência (mês 6 e 12) -->
    <line x1="336" y1="84" x2="336" y2="244" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 4" opacity="0.45"/>
    <line x1="672" y1="84" x2="672" y2="324" stroke="#f87171" stroke-width="1" stroke-dasharray="3 4" opacity="0.45"/>
  </svg>
  <figcaption style="color:#9ca3af;font-size:.85rem;margin-top:.5rem">As periodicidades se empilham: nos meses 6 e 12 as visitas coincidem e o técnico executa o checklist somado em um único atendimento. O mês 12 reúne mensal, trimestral, semestral e anual.</figcaption>
</figure>

<p>É justamente essa lógica de sobreposição que um <a href="/sistema-pmoc">software de PMOC</a> calcula sozinho: ao cadastrar as periodicidades de cada atividade, o sistema já agenda a visita certa em cada mês com o checklist correto acumulado — o técnico nunca recebe duas ordens para o mesmo período, e nenhuma tarefa "some" no mês cheio.</p>

<h2>Responsabilidades: proprietário, RT e empresa</h2>

<p>O PMOC envolve mais de um ator, e confundir os papéis é uma fonte clássica de problemas. Veja como as responsabilidades se dividem:</p>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
  <div>
    <h3>Proprietário / Responsável legal</h3>
    <ul>
      <li>Garantir a existência e a manutenção do PMOC;</li>
      <li>Contratar profissional ou empresa habilitada;</li>
      <li>Manter os registros disponíveis para fiscalização;</li>
      <li>Responder legalmente perante a vigilância sanitária;</li>
      <li>Assegurar recursos para a execução do plano.</li>
    </ul>
  </div>
  <div>
    <h3>Responsável Técnico (RT)</h3>
    <ul>
      <li>Elaborar e assinar o PMOC;</li>
      <li>Possuir registro no conselho de classe;</li>
      <li>Emitir a ART/RRT/TRT correspondente;</li>
      <li>Definir e validar o cronograma técnico;</li>
      <li>Responder tecnicamente pela qualidade do ar.</li>
    </ul>
  </div>
</div>

<p>A <strong>empresa de refrigeração</strong> contratada, por sua vez, executa as rotinas de manutenção em campo, registra as evidências e dá suporte ao RT. Em muitas operações, a empresa fornece o próprio RT como parte do serviço. É exatamente nesse ponto que ter um processo organizado — apoiado por um <a href="/sistema-para-refrigeracao">sistema para empresas de refrigeração</a> — separa quem entrega um PMOC profissional de quem improvisa em planilha.</p>

<h2>Passo a passo: como fazer um PMOC</h2>

<p>Implantar um PMOC do zero segue uma lógica clara. Resumimos em sete etapas:</p>

<ol>
  <li><strong>Levantamento de campo:</strong> inspecione o local e cadastre todos os equipamentos de climatização e os ambientes atendidos.</li>
  <li><strong>Diagnóstico inicial:</strong> avalie o estado de cada aparelho, identifique pendências e necessidades imediatas.</li>
  <li><strong>Elaboração do plano:</strong> o RT monta o cronograma de atividades com periodicidades, procedimentos e parâmetros a controlar.</li>
  <li><strong>Designação do Responsável Técnico:</strong> profissional habilitado assina o documento e emite a anotação de responsabilidade técnica.</li>
  <li><strong>Execução das manutenções:</strong> as equipes realizam as tarefas conforme o cronograma, em campo.</li>
  <li><strong>Registro e comprovação:</strong> cada atividade é documentada com checklist, fotos e data — gerando o histórico auditável.</li>
  <li><strong>Revisão periódica:</strong> o plano é revisado e mantido atualizado conforme mudanças nos equipamentos ou no uso do edifício.</li>
</ol>

<h2>Multas e riscos de não ter PMOC</h2>

<p>Ignorar o PMOC não é apenas uma falha técnica — é uma exposição legal e financeira concreta. As penalidades variam conforme a legislação aplicável e o órgão fiscalizador (vigilância sanitária estadual ou municipal), mas os tipos de risco são bem definidos:</p>

<table>
  <thead>
    <tr>
      <th>Risco</th>
      <th>Consequência possível</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Ausência do PMOC</td><td>Auto de infração e multa aplicada pela vigilância sanitária</td></tr>
    <tr><td>PMOC desatualizado ou sem registros</td><td>Notificação, prazo para regularização e possível autuação</td></tr>
    <tr><td>Manutenção não comprovada</td><td>Multa por descumprimento das normas de qualidade do ar</td></tr>
    <tr><td>Reincidência</td><td>Agravamento das multas e medidas adicionais</td></tr>
    <tr><td>Dano à saúde dos ocupantes</td><td>Responsabilização civil e até criminal do responsável</td></tr>
    <tr><td>Interdição do ambiente</td><td>Suspensão das atividades até regularização</td></tr>
  </tbody>
</table>

<p>Além das sanções formais, há o custo silencioso: equipamentos que falham antes da hora, energia desperdiçada e, no pior cenário, danos à reputação por problemas de saúde no ambiente. O PMOC, longe de ser um custo, é uma <strong>apólice de proteção</strong>.</p>

<h2>Quem fiscaliza o PMOC — e como funciona na prática</h2>

<p>O PMOC não fica "guardado para o caso de alguém pedir": ele existe justamente para ser apresentado quando a fiscalização chega. Entender <strong>quem fiscaliza</strong> e <strong>o que costuma ser pedido</strong> ajuda a empresa de refrigeração e o cliente a chegarem preparados em vez de correndo atrás de papel.</p>

<h3>Os órgãos envolvidos</h3>

<p>A fiscalização da qualidade do ar em ambientes climatizados é, na maioria dos casos, atribuição da <strong>vigilância sanitária</strong>, que atua em nível <strong>municipal e estadual</strong> conforme a organização de cada localidade. Como as competências sanitárias variam de cidade para cidade e de estado para estado, a regra prática é sempre <strong>verificar a legislação local</strong> além das normas federais. Em linhas gerais, podem estar envolvidos:</p>

<ul>
  <li><strong>Vigilância sanitária municipal e/ou estadual:</strong> é o órgão típico para a fiscalização da qualidade do ar interior e da existência e cumprimento do PMOC, com base nas normas de saúde aplicáveis.</li>
  <li><strong>ANVISA:</strong> atua como referência normativa nacional (é dela a RE nº 9/2003, que define os padrões de qualidade do ar interior). A fiscalização de campo em estabelecimentos costuma ser executada pelas vigilâncias locais, dentro da estrutura do sistema de vigilância sanitária.</li>
  <li><strong>Corpo de Bombeiros:</strong> em determinados contextos e legislações estaduais, aspectos de instalações prediais podem ser objeto de verificação — sempre conforme as exigências locais.</li>
  <li><strong>Fiscalização do trabalho / saúde ocupacional:</strong> quando há trabalhadores expostos, a qualidade do ambiente de trabalho pode ser observada sob a ótica de saúde e segurança ocupacional, em paralelo à questão sanitária.</li>
</ul>

<p><em>Observação importante:</em> as competências exatas de cada órgão dependem da legislação de cada município e estado. Este guia descreve o quadro geral; para o caso concreto, consulte a vigilância sanitária da sua região.</p>

<h3>O que a fiscalização costuma pedir</h3>

<p>Numa inspeção, três coisas concentram a atenção do fiscal — e a ausência de qualquer uma delas costuma gerar problema:</p>

<ol>
  <li><strong>O documento PMOC:</strong> o plano deve estar disponível no local, com o inventário dos equipamentos, a descrição dos ambientes e o cronograma de atividades.</li>
  <li><strong>Os registros de execução:</strong> mais do que ter o plano, é preciso <strong>comprovar que ele foi cumprido</strong> — checklists, datas, fotos e relatórios das manutenções realizadas. Plano sem comprovação é tratado como plano não executado.</li>
  <li><strong>A responsabilidade técnica:</strong> a identificação do Responsável Técnico habilitado e a respectiva anotação de responsabilidade técnica (ART/RRT/TRT), demonstrando que profissional legalmente capacitado assina o plano.</li>
</ol>

<blockquote>
<p>O erro clássico é ter um PMOC bonito na gaveta e nenhuma evidência de que as visitas aconteceram. Na fiscalização, <strong>a comprovação de execução pesa tanto quanto o documento</strong>. É por isso que o registro em campo (com data e foto) deixou de ser "zelo extra" e virou parte essencial do serviço.</p>
</blockquote>

<h3>O que costuma gerar autuação</h3>

<p>As situações que mais resultam em notificação ou auto de infração são previsíveis: <strong>ausência do PMOC</strong>; PMOC <strong>desatualizado</strong> em relação à instalação real (equipamentos a mais ou a menos do que o inventário); <strong>falta de registros</strong> que comprovem a execução das manutenções; ausência de Responsável Técnico identificado; e <strong>parâmetros de qualidade do ar</strong> fora dos limites de referência sem ação corretiva documentada. Em quase todos os casos, a raiz do problema é a mesma — falta de organização e de comprovação, não falta de competência técnica.</p>

<h2>Multas e penalidades em detalhe</h2>

<p>Quando a fiscalização identifica uma irregularidade, a resposta não é única: existe uma <strong>gradação de penalidades</strong>, e a faixa de valores depende da legislação aplicável. Vale um cuidado factual aqui: <strong>não existe um valor de multa único e nacional</strong> cravado em lei federal para o descumprimento do PMOC. As sanções e seus valores são definidos pela <strong>legislação sanitária aplicável</strong> — que pode ser estadual ou municipal — e variam conforme a gravidade, o porte do estabelecimento e a reincidência. Desconfie de qualquer fonte que afirme um número fixo "válido em todo o Brasil".</p>

<p>De forma geral, as penalidades sanitárias seguem uma escala de severidade. As mais comuns são:</p>

<table>
  <thead>
    <tr>
      <th>Penalidade</th>
      <th>Quando costuma ocorrer</th>
      <th>Efeito prático</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><strong>Advertência / notificação</strong></td><td>Primeira irregularidade de menor gravidade</td><td>Prazo para regularizar antes de sanção mais dura</td></tr>
    <tr><td><strong>Multa</strong></td><td>Descumprimento confirmado ou não regularização no prazo</td><td>Valor variável conforme a legislação local e a gravidade</td></tr>
    <tr><td><strong>Interdição</strong></td><td>Risco à saúde dos ocupantes ou reincidência grave</td><td>Suspensão parcial ou total das atividades até regularizar</td></tr>
    <tr><td><strong>Agravamento por reincidência</strong></td><td>Repetição da mesma infração</td><td>Multas majoradas e medidas adicionais</td></tr>
  </tbody>
</table>

<p>Mas reduzir o risco do PMOC a "tomar multa" é enxergar metade do problema. Os <strong>riscos não-financeiros</strong> costumam ser mais graves do que o boleto da autuação:</p>

<ul>
  <li><strong>Saúde dos ocupantes:</strong> sistemas mal mantidos estão associados à "síndrome do edifício doente" (cefaleias, irritação respiratória, alergias) e a riscos sérios como a proliferação da bactéria <em>Legionella</em>, causadora da legionelose. Em ambientes de saúde, o risco é ainda mais crítico.</li>
  <li><strong>Responsabilidade civil (e até criminal):</strong> se a má conservação do ar resultar em dano à saúde de terceiros, o proprietário e os responsáveis podem ser responsabilizados — uma exposição que vai muito além do valor da multa.</li>
  <li><strong>Perda de contrato e de reputação:</strong> para a empresa de refrigeração, não conseguir comprovar o PMOC numa fiscalização do cliente significa perder a conta — e, muitas vezes, a indicação para as próximas. Confiabilidade documental virou critério de contratação.</li>
  <li><strong>Custo operacional oculto:</strong> equipamentos negligenciados falham antes da hora e consomem mais energia, corroendo a margem mesmo sem nenhuma autuação envolvida.</li>
</ul>

<h2>Como um software de PMOC ajuda</h2>

<p>Fazer PMOC em planilha funciona até a segunda ou terceira unidade. Depois disso, o controle vira um pesadelo: cronogramas que ninguém lembra, fotos perdidas em grupos de mensagem, relatórios montados manualmente e o medo constante de não conseguir comprovar uma manutenção numa fiscalização.</p>

<p>Um <a href="/sistema-pmoc">software de PMOC como o da Dominex</a> resolve isso transformando o ciclo "planejar → executar → registrar → comprovar" em um fluxo automático e auditável:</p>

<ul>
  <li><strong>Inventário centralizado:</strong> todos os equipamentos e ambientes de cada contrato em um só lugar.</li>
  <li><strong>Cronograma automático:</strong> o sistema gera as visitas conforme a periodicidade de cada atividade, sem você precisar lembrar.</li>
  <li><strong>Checklist em campo:</strong> o técnico registra cada tarefa, com fotos e medições, direto pelo celular.</li>
  <li><strong>Relatório PMOC pronto:</strong> o documento profissional é gerado com a assinatura do Responsável Técnico, pronto para entregar ao cliente e à fiscalização.</li>
  <li><strong>Histórico auditável:</strong> tudo fica registrado e acessível, comprovando a execução a qualquer momento.</li>
</ul>

<p>O resultado: menos tempo montando papelada, mais contratos atendidos com a mesma equipe e a tranquilidade de ter a comprovação sempre à mão.</p>

<h2>Perguntas frequentes (FAQ)</h2>

<h3>O PMOC é realmente obrigatório?</h3>
<p>Sim. Para edifícios de uso público e coletivo com ambientes climatizados artificialmente, o PMOC é obrigatório por força da Lei nº 13.589/2018 e das normas complementares do Ministério da Saúde e da ANVISA.</p>

<h3>Quem pode assinar um PMOC?</h3>
<p>Somente um Responsável Técnico habilitado, com registro no conselho de classe correspondente à sua formação (engenheiro, técnico ou tecnólogo da área), emitindo a respectiva anotação de responsabilidade técnica (ART, RRT ou TRT).</p>

<h3>Qual a diferença entre PMOC e um contrato de manutenção comum?</h3>
<p>Um contrato de manutenção é um acordo comercial de prestação de serviço. O PMOC é o documento técnico-legal que define o plano de atividades, os responsáveis e os registros exigidos por lei. Um bom contrato de manutenção deve contemplar a execução e a comprovação do PMOC.</p>

<h3>Casa precisa de PMOC?</h3>
<p>Residências unifamiliares normalmente não estão sujeitas à obrigação legal. A exigência mira ambientes de uso coletivo. Ainda assim, manter um plano de manutenção é recomendável para qualquer instalação.</p>

<h3>Com que frequência o PMOC deve ser atualizado?</h3>
<p>O documento deve refletir a realidade da instalação. Sempre que houver mudança de equipamentos, ampliação ou alteração de uso, o PMOC deve ser revisado. As atividades de manutenção, por sua vez, seguem as periodicidades definidas no cronograma (mensal, trimestral, semestral, anual).</p>

<h3>O que a fiscalização costuma exigir?</h3>
<p>O documento PMOC disponível no local, a identificação do Responsável Técnico e, principalmente, os <strong>registros que comprovem a execução</strong> das manutenções previstas. Ter o plano sem comprovar que ele foi cumprido não basta.</p>

<h3>Quem fiscaliza o PMOC?</h3>
<p>Em geral, a vigilância sanitária — que atua em nível municipal e/ou estadual conforme a localidade — com a ANVISA como referência normativa nacional (RE nº 9/2003). Dependendo da legislação local, outros órgãos podem observar aspectos relacionados (como saúde ocupacional, quando há trabalhadores expostos). As competências exatas variam por município e estado, então sempre vale confirmar as regras da sua região.</p>

<h3>Qual o valor da multa por não ter PMOC?</h3>
<p>Não existe um valor único e nacional fixado em lei federal. As penalidades — que vão de advertência a multa e interdição — e seus valores são definidos pela legislação sanitária aplicável (estadual ou municipal) e variam conforme a gravidade, o porte do estabelecimento e a reincidência. Desconfie de fontes que cravam um número "válido em todo o Brasil".</p>

<h3>Preciso de uma visita por mês e outra por trimestre separadas?</h3>
<p>Não. As periodicidades se sobrepõem: a visita de maior periodicidade absorve as menores que caem no mesmo mês. No mês da visita trimestral você também faz as tarefas mensais; na anual, faz tudo de uma vez. É sempre uma visita só, com o checklist somado — nunca duas no mesmo mês.</p>

<h2>Conclusão</h2>

<p>O PMOC é, ao mesmo tempo, uma obrigação legal, uma ferramenta de saúde pública e uma boa prática de engenharia. Entender como ele funciona — do inventário à comprovação — é o que separa uma empresa de refrigeração que entrega valor de uma que só "vende manutenção".</p>

<p>Se a sua empresa quer profissionalizar a entrega de PMOC, ganhar escala e nunca mais perder uma comprovação numa fiscalização, conheça o <a href="/sistema-pmoc">sistema de PMOC da Dominex</a> e o nosso <a href="/sistema-para-refrigeracao">sistema completo para empresas de refrigeração</a>. Comece o teste grátis de 14 dias, sem cartão, e veja como transformar a obrigação do PMOC em diferencial competitivo.</p>
$html$,
    updated_at = now()
where slug = 'como-funciona-o-pmoc';
