-- ============================================================================
-- SEED: primeiro artigo do blog Dominex — "Como funciona o PMOC"
-- Tabela: public.blog_posts (global, gerida pelo super_admin — sem company_id)
-- Idempotente: ON CONFLICT (slug) DO NOTHING.
-- O HTML longo do `content` usa dollar-quoting ($html$ ... $html$) pra evitar
-- escape de aspas. Demais campos com aspas usam dollar-quoting próprio.
-- ============================================================================

INSERT INTO public.blog_posts (
  title,
  slug,
  excerpt,
  content,
  category,
  tags,
  status,
  author_name,
  meta_title,
  meta_description,
  published_at
) VALUES (
  $title$Como funciona o PMOC: o guia completo do Plano de Manutenção de Ar-Condicionado$title$,
  'como-funciona-o-pmoc',
  $excerpt$Entenda como funciona o PMOC: o que é, base legal (Lei 13.589/2018), quem é obrigado, periodicidade da manutenção, responsabilidades, multas e como um software facilita.$excerpt$,
  $html$<p>Se você trabalha com climatização ou administra um prédio com ar-condicionado, mais cedo ou mais tarde vai esbarrar em uma sigla de quatro letras que mexe com obrigação legal, saúde pública e contrato de manutenção: <strong>PMOC</strong>. Apesar de ser exigido por lei há mais de duas décadas, ainda gera muita confusão — quem precisa ter, o que entra no documento, com que frequência fazer a manutenção e o que acontece se ele não existir.</p>

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

<h2>Conclusão</h2>

<p>O PMOC é, ao mesmo tempo, uma obrigação legal, uma ferramenta de saúde pública e uma boa prática de engenharia. Entender como ele funciona — do inventário à comprovação — é o que separa uma empresa de refrigeração que entrega valor de uma que só "vende manutenção".</p>

<p>Se a sua empresa quer profissionalizar a entrega de PMOC, ganhar escala e nunca mais perder uma comprovação numa fiscalização, conheça o <a href="/sistema-pmoc">sistema de PMOC da Dominex</a> e o nosso <a href="/sistema-para-refrigeracao">sistema completo para empresas de refrigeração</a>. Comece o teste grátis de 14 dias, sem cartão, e veja como transformar a obrigação do PMOC em diferencial competitivo.</p>$html$,
  'PMOC',
  ARRAY['PMOC','ar-condicionado','manutenção','Lei 13.589','refrigeração','climatização'],
  'published',
  'Equipe Dominex',
  $mt$Como funciona o PMOC | Guia completo do Plano de Manutenção de Ar-Condicionado$mt$,
  $md$Entenda como funciona o PMOC: o que é, quem é obrigado, base legal (Lei 13.589/2018), periodicidade da manutenção, responsabilidades, multas e como um software ajuda.$md$,
  now()
)
ON CONFLICT (slug) DO NOTHING;
