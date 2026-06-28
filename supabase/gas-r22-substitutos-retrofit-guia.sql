-- Post de blog: Gas R-22, substitutos, retrofit e o que mudou (guia tecnico completo)
-- Categoria: Refrigeração | slug: gas-r22-substitutos-retrofit-guia
-- Imagens em blog-images/posts/gas-r22-substitutos-retrofit-guia/ + cover em blog-images/covers/
-- Aplicar: npx supabase db query --linked < supabase/gas-r22-substitutos-retrofit-guia.sql

INSERT INTO blog_posts (
  title,
  slug,
  excerpt,
  meta_title,
  meta_description,
  author_name,
  category,
  tags,
  cover_image_url,
  status,
  published_at
)
VALUES (
  $html$Gás R-22: substitutos, retrofit e o que mudou (guia técnico completo)$html$,
  'gas-r22-substitutos-retrofit-guia',
  $html$O R-22 está saindo de circulação por causa do Protocolo de Montreal. Veja o cronograma de eliminação no Brasil, os substitutos drop-in certos (R-438A, R-422D, R-407C), por que o R-410A NÃO substitui o R-22 e o passo a passo do retrofit sem queimar o equipamento.$html$,
  $html$Substituto do gás R-22: retrofit, drop-in e o que mudou | Guia técnico$html$,
  $html$Qual gás substitui o R-22? Cronograma de eliminação no Brasil, substitutos drop-in (R-438A, R-422D, R-407C), por que o R-410A NÃO substitui o R-22 e o passo a passo do retrofit sem queimar o compressor.$html$,
  'Equipe Dominex',
  'Refrigeração',
  ARRAY['R-22','retrofit','refrigeração','substituto R-22','R-438A','R-410A','Protocolo de Montreal','ar-condicionado'],
  $html$https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/gas-r22-substitutos-retrofit-guia.jpg$html$,
  'published',
  now()
)
ON CONFLICT (slug) DO NOTHING;

UPDATE blog_posts
SET content = $html$
<p class="lead">O R-22 (também chamado de HCFC-22 ou freon R-22) foi o fluido refrigerante mais usado do mundo em ar-condicionado e refrigeração comercial por décadas. Hoje ele está em contagem regressiva. A produção e a importação caem ano a ano, o preço do cilindro sobe e, em algum momento, simplesmente não vai mais ter gás novo pra completar carga. Se você ainda tem máquina rodando a R-22, a pergunta não é mais "vou ter que migrar?", e sim "pra onde, quando e como fazer isso sem queimar o equipamento?".</p>

<p>Este guia responde tudo de cabo a rabo: por que o R-22 foi banido, até quando dá pra usar, quais são os substitutos <strong>drop-in</strong> que de fato funcionam, por que o R-410A é uma armadilha perigosa, e o passo a passo técnico do retrofit feito do jeito certo. Conteúdo escrito pra técnico de refrigeração e dono de empresa que precisa decidir com segurança, não no chute.</p>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/gas-r22-substitutos-retrofit-guia/condensadora.jpg" alt="Condensadora de ar-condicionado instalada na área externa, equipamento típico que ainda opera com gás R-22 e candidato a retrofit" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>Boa parte do parque instalado de ar-condicionado e refrigeração comercial ainda opera com R-22 e vai precisar de retrofit ou substituição.</figcaption>
</figure>

<h2 id="por-que-proibido">Por que o R-22 foi proibido</h2>

<p>O R-22 é um HCFC (hidroclorofluorcarbono). O problema dele é o cloro na molécula: quando o gás vaza e sobe pra estratosfera, o cloro destrói moléculas de ozônio. A camada de ozônio é o filtro natural que segura a radiação ultravioleta do Sol. Menos ozônio significa mais UV chegando à superfície, com impacto direto em saúde (câncer de pele, catarata) e nos ecossistemas.</p>

<p>Por isso, o R-22 entrou na lista de substâncias controladas pelo <strong>Protocolo de Montreal</strong>, o tratado internacional de 1987 que organiza a eliminação gradual (o chamado <em>phase-out</em>) das substâncias que destroem a camada de ozônio. O Brasil é signatário e cumpre o cronograma como país em desenvolvimento.</p>

<blockquote>
  <p>O Protocolo de Montreal sobre Substâncias que Destroem a Camada de Ozônio é o tratado que estabelece o calendário de eliminação dos CFCs e HCFCs. No Brasil, o controle de importação e o cronograma de eliminação dos HCFCs são operados pelo Ibama.</p>
  <p><a href="https://www.gov.br/ibama/pt-br/assuntos/emissoes-e-residuos/emissoes/protocolo-de-montreal" target="_blank" rel="noopener">Ver fonte (Ibama) ↗</a></p>
</blockquote>

<h3>O cronograma oficial de eliminação no Brasil</h3>

<p>A eliminação dos HCFCs no Brasil é conduzida pelo Programa Brasileiro de Eliminação dos HCFCs (PBH), coordenado pelo Ministério do Meio Ambiente com execução pelo Ibama. A linha de base é a média de consumo dos anos de 2009 e 2010, e as reduções são calculadas sobre esse valor. Os marcos oficiais são:</p>

<table>
  <thead>
    <tr><th>Ano</th><th>Meta de redução do consumo de HCFC</th><th>O que significa na prática</th></tr>
  </thead>
  <tbody>
    <tr><td>2013</td><td>Congelamento na linha de base (média 2009-2010)</td><td>Consumo não pode mais crescer</td></tr>
    <tr><td>2015</td><td>Redução de 16,6%</td><td>Começa o corte efetivo</td></tr>
    <tr><td>2020</td><td>Redução de 39,3%</td><td>Oferta de R-22 já bem menor</td></tr>
    <tr><td>2021</td><td>Redução de 51,6%</td><td>Mais da metade eliminada</td></tr>
    <tr><td>2025</td><td>Redução de 67,5%</td><td>Cilindro escasso e mais caro</td></tr>
    <tr><td>2030</td><td>Redução de 97,5%</td><td>Praticamente zero gás novo</td></tr>
    <tr><td>2040</td><td>Eliminação total (100%)</td><td>Fim da linha do R-22</td></tr>
  </tbody>
</table>

<blockquote>
  <p>Pelo cronograma do PBH, a redução chega a 97,5% em 2030 e a eliminação total em 2040. Entre 2030 e 2040 fica permitida apenas uma cota residual destinada à manutenção de equipamentos já existentes, conforme as regras do Protocolo de Montreal para países em desenvolvimento.</p>
  <p><a href="https://www.protocolodemontreal.org.br/site/pbh/sobre-o-programa/eliminacao-dos-hcfcs-no-brasil/cronograma-e-estrategia" target="_blank" rel="noopener">Ver fonte (cronograma PBH) ↗</a></p>
</blockquote>

<p>Repare na curva: o salto de 67,5% (2025) para 97,5% (2030) é brutal. Na prática, a janela em que ainda dá pra encontrar R-22 com facilidade e a preço razoável está fechando agora, nesta década.</p>

<h2 id="na-pratica">O que isso significa na prática pra você</h2>

<p>Três dúvidas aparecem sempre. Vamos direto:</p>

<h3>Posso continuar usando minha máquina a R-22?</h3>
<p>Sim. Não existe obrigação de jogar fora um equipamento que funciona. O que foi cortado é a <strong>produção e a importação de gás novo</strong>, não o uso do que já está instalado. Sua câmara fria ou seu split a R-22 pode rodar normalmente enquanto a carga estiver completa e o equipamento saudável.</p>

<h3>Até quando vou achar gás pra completar carga?</h3>
<p>Essa é a parte desconfortável. Como a oferta cai todo ano (e despenca rumo a 2030), cada vazamento que exige recarga fica mais caro e mais difícil de resolver. Você ainda encontra R-22 hoje, inclusive gás recuperado e reciclado, mas a tendência é só piorar. Depende de gás novo para vazamentos recorrentes virou um plano com data pra dar errado.</p>

<h3>Vai encarecer?</h3>
<p>Já encareceu, e continua. Oferta caindo com demanda existente é a receita clássica de preço subindo. O cálculo muda: a cada visita pra recompletar R-22, parte do dinheiro está sendo enterrada num gás que vai sumir. Esse mesmo valor poderia estar amortizando um retrofit definitivo.</p>

<blockquote>
  <p><strong>Resumo honesto:</strong> não é proibido usar o que você tem, mas depender de R-22 pra novas cargas é apostar contra o calendário. Para máquinas com vazamento crônico ou que vão operar por muitos anos ainda, o retrofit (ou a troca) deixou de ser "se" e virou "quando".</p>
</blockquote>

<h2 id="substitutos">Substitutos drop-in do R-22: a tabela que importa</h2>

<p>Aqui o termo precisa ficar claro. Um substituto <strong>drop-in</strong> (ou retrofit) é um fluido projetado para entrar no lugar do R-22 <strong>no mesmo equipamento</strong>, com pressões de trabalho próximas, exigindo poucas alterações (ou nenhuma) no circuito. O objetivo é manter o compressor, o condensador, o evaporador e a tubulação que você já tem, trocando só o gás (e, em alguns casos, o óleo).</p>

<p>Os três substitutos mais usados no Brasil para R-22 são blends de HFC. Compare:</p>

<table>
  <thead>
    <tr><th>Substituto</th><th>Aplicação típica</th><th>Prós</th><th>Contras</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>R-438A</strong> (MO99)</td>
      <td>Ar-condicionado e refrigeração comercial em geral. O drop-in mais versátil.</td>
      <td>Pressões muito próximas das do R-22. Tolera óleo mineral, alquilbenzeno e POE (contém aditivos que ajudam o retorno de óleo). Troca de óleo muitas vezes dispensável.</td>
      <td>Tem glide (deslizamento de temperatura), exige carga só na fase líquida. Capacidade levemente menor que o R-22.</td>
    </tr>
    <tr>
      <td><strong>R-422D</strong></td>
      <td>Refrigeração de média e baixa temperatura (câmaras, expositores).</td>
      <td>Temperatura de descarga do compressor mais baixa que a do R-22, o que tende a prolongar a vida do compressor. Costuma rodar sem troca de óleo.</td>
      <td>COP (eficiência) menor que o do R-22, perde rendimento. Glide. Compatibilidade com óleo mineral é parcial, melhor garantir retorno de óleo.</td>
    </tr>
    <tr>
      <td><strong>R-407C</strong></td>
      <td>Ar-condicionado (split, central) e bombas de calor.</td>
      <td>Capacidade e eficiência próximas das do R-22 em climatização. Amplamente disponível.</td>
      <td><strong>Exige troca para óleo POE</strong> (não roda em óleo mineral). Glide alto, sensível a vazamento (vaza desbalanceado, precisa recarregar tudo).</td>
    </tr>
  </tbody>
</table>

<p>Uma observação técnica que costuma confundir: esses três blends têm <strong>glide</strong>, ou seja, evaporam e condensam ao longo de uma faixa de temperatura, não num ponto único. Isso muda como você lê superaquecimento e subresfriamento (use a temperatura de orvalho para SH e de bolha para SC) e obriga a carregar o cilindro pela fase líquida, nunca pela fase vapor, senão a composição da mistura se altera.</p>

<p>Os valores de pressão de saturação batem com o nosso catálogo técnico interno: a 40 °C de condensação, o R-438A trabalha por volta de 15,4 bar (lado líquido) e o R-407C por volta de 16,5 bar, ambos na mesma vizinhança dos cerca de 14,3 bar do R-22. É justamente essa proximidade que faz deles drop-in seguros. Guarde esse número, porque o próximo gás da lista vive em outro universo.</p>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/gas-r22-substitutos-retrofit-guia/manifold.jpg" alt="Técnico de refrigeração conectando o manifold de manômetros a um sistema para medir pressões de alta e baixa durante o serviço" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>Ler as pressões corretas no manifold é o que separa um retrofit seguro de um compressor queimado. Em blends com glide, use a curva certa (orvalho ou bolha).</figcaption>
</figure>

<h2 id="alerta-r410a">Alerta de segurança: R-410A NÃO substitui o R-22</h2>

<div style="border:2px solid #00C597;border-left:8px solid #00C597;border-radius:12px;padding:18px 20px;margin:24px 0;background:rgba(0,197,151,0.06)">
  <p style="margin-top:0"><strong style="color:#00897B">ATENÇÃO. Esta é a confusão mais perigosa do setor.</strong></p>
  <p style="margin-bottom:0">Colocar <strong>R-410A no lugar do R-22</strong> num equipamento projetado para R-22 é um erro grave. A pressão de trabalho do R-410A é muito mais alta. O equipamento não foi dimensionado para isso e pode falhar de forma violenta: compressor queimado, vazamentos, ruptura de componentes. <strong>R-410A não é drop-in. Não é retrofit. É um sistema diferente.</strong></p>
</div>

<p>Por que isso é tão crítico? Porque os nomes parecem "vizinhos" e muita gente troca um pelo outro sem olhar a pressão. Veja a diferença real, usando os valores de saturação do nosso próprio catálogo de gases:</p>

<table>
  <thead>
    <tr><th>Temperatura de condensação</th><th>R-22 (pressão)</th><th>R-410A (pressão)</th><th>Diferença</th></tr>
  </thead>
  <tbody>
    <tr><td>30 °C</td><td>10,9 bar (158 psi)</td><td>17,9 bar (260 psi)</td><td>+64%</td></tr>
    <tr><td>40 °C</td><td>14,3 bar (208 psi)</td><td>23,3 bar (337 psi)</td><td>+63%</td></tr>
    <tr><td>50 °C</td><td>18,4 bar (267 psi)</td><td>29,7 bar (431 psi)</td><td>+61%</td></tr>
    <tr><td>60 °C</td><td>23,3 bar (337 psi)</td><td>37,3 bar (541 psi)</td><td>+60%</td></tr>
  </tbody>
</table>

<p>O R-410A trabalha com cerca de <strong>60% a 64% mais pressão</strong> que o R-22 nas mesmas condições. Compressor, trocadores, válvulas e tubulação de uma máquina a R-22 não foram construídos para suportar isso de forma contínua. O resultado provável é falha mecânica, e no pior caso ruptura de componente sob pressão. O diagrama abaixo deixa a diferença visual.</p>

<figure>
  <svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de barras comparando a pressão de condensação do R-22 e do R-410A em quatro temperaturas, mostrando o R-410A cerca de 60% mais alto" style="width:100%;height:auto;background:#F8FAFC;border-radius:12px">
    <text x="360" y="32" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#0F172A">Pressão de condensação: R-22 vs R-410A</text>
    <text x="360" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#64748B">Mesma máquina, mesma temperatura. O R-410A vive 60% acima.</text>
    <line x1="70" y1="300" x2="700" y2="300" stroke="#CBD5E1" stroke-width="2"/>
    <line x1="70" y1="90" x2="70" y2="300" stroke="#CBD5E1" stroke-width="2"/>
    <!-- 30C -->
    <rect x="110" y="223" width="42" height="77" rx="4" fill="#94A3B8"/>
    <rect x="156" y="174" width="42" height="126" rx="4" fill="#00C597"/>
    <text x="154" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">30 °C</text>
    <text x="131" y="215" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#475569">10,9</text>
    <text x="177" y="166" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#00897B">17,9</text>
    <!-- 40C -->
    <rect x="260" y="195" width="42" height="105" rx="4" fill="#94A3B8"/>
    <rect x="306" y="129" width="42" height="171" rx="4" fill="#00C597"/>
    <text x="304" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">40 °C</text>
    <text x="281" y="187" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#475569">14,3</text>
    <text x="327" y="121" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#00897B">23,3</text>
    <!-- 50C -->
    <rect x="410" y="165" width="42" height="135" rx="4" fill="#94A3B8"/>
    <rect x="456" y="82" width="42" height="218" rx="4" fill="#00C597"/>
    <text x="454" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">50 °C</text>
    <text x="431" y="157" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#475569">18,4</text>
    <text x="477" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#00897B">29,7</text>
    <!-- 60C -->
    <rect x="560" y="129" width="42" height="171" rx="4" fill="#94A3B8"/>
    <rect x="606" y="26" width="42" height="274" rx="4" fill="#00C597"/>
    <text x="604" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">60 °C</text>
    <text x="581" y="121" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#475569">23,3</text>
    <text x="627" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#00897B">37,3</text>
    <!-- legenda -->
    <rect x="250" y="338" width="14" height="14" rx="3" fill="#94A3B8"/>
    <text x="270" y="350" font-family="Arial, sans-serif" font-size="12" fill="#475569">R-22 (bar)</text>
    <rect x="370" y="338" width="14" height="14" rx="3" fill="#00C597"/>
    <text x="390" y="350" font-family="Arial, sans-serif" font-size="12" fill="#475569">R-410A (bar)</text>
  </svg>
  <figcaption>Comparação de pressão de condensação (manométrica) com base nas tabelas de saturação do catálogo técnico Dominex. O R-410A opera num patamar de pressão para o qual uma máquina a R-22 não foi projetada.</figcaption>
</figure>

<p><strong>Conclusão direta:</strong> migrar para R-410A significa <strong>trocar o equipamento inteiro</strong> por um projetado para R-410A. Isso é substituição de máquina, não retrofit. Se a meta é aproveitar o que já existe, o caminho são os drop-in da tabela anterior (R-438A, R-422D, R-407C), nunca o R-410A.</p>

<h2 id="passo-a-passo">Passo a passo do retrofit feito do jeito certo</h2>

<p>Retrofit não é só "tirar um gás e botar outro". Feito errado, você queima o compressor que pretendia salvar. Feito certo, o equipamento ganha anos de vida com o gás novo. Este é o fluxo correto, na ordem:</p>

<figure>
  <svg viewBox="0 0 760 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fluxograma do processo de retrofit do R-22 em seis etapas: avaliar, recolher o gás antigo, trocar o óleo se preciso, fazer vácuo, carregar o gás novo na fase líquida e verificar superaquecimento e subresfriamento" style="width:100%;height:auto;background:#F8FAFC;border-radius:12px">
    <defs>
      <marker id="arr" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#00C597"/></marker>
    </defs>
    <text x="380" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0F172A">Fluxo do retrofit do R-22</text>
    <!-- nodes -->
    <g font-family="Arial, sans-serif">
      <circle cx="80" cy="110" r="34" fill="#00C597"/><text x="80" y="115" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">1</text>
      <text x="80" y="170" text-anchor="middle" font-size="12" fill="#334155">Avaliar a</text><text x="80" y="185" text-anchor="middle" font-size="12" fill="#334155">máquina</text>
      <line x1="116" y1="110" x2="158" y2="110" stroke="#00C597" stroke-width="3" marker-end="url(#arr)"/>

      <circle cx="200" cy="110" r="34" fill="#00C597"/><text x="200" y="115" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">2</text>
      <text x="200" y="170" text-anchor="middle" font-size="12" fill="#334155">Recolher o</text><text x="200" y="185" text-anchor="middle" font-size="12" fill="#334155">R-22 antigo</text>
      <line x1="236" y1="110" x2="278" y2="110" stroke="#00C597" stroke-width="3" marker-end="url(#arr)"/>

      <circle cx="320" cy="110" r="34" fill="#00C597"/><text x="320" y="115" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">3</text>
      <text x="320" y="170" text-anchor="middle" font-size="12" fill="#334155">Trocar o óleo</text><text x="320" y="185" text-anchor="middle" font-size="12" fill="#334155">se preciso</text>
      <line x1="356" y1="110" x2="398" y2="110" stroke="#00C597" stroke-width="3" marker-end="url(#arr)"/>

      <circle cx="440" cy="110" r="34" fill="#00C597"/><text x="440" y="115" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">4</text>
      <text x="440" y="170" text-anchor="middle" font-size="12" fill="#334155">Fazer</text><text x="440" y="185" text-anchor="middle" font-size="12" fill="#334155">vácuo</text>
      <line x1="476" y1="110" x2="518" y2="110" stroke="#00C597" stroke-width="3" marker-end="url(#arr)"/>

      <circle cx="560" cy="110" r="34" fill="#00C597"/><text x="560" y="115" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">5</text>
      <text x="560" y="170" text-anchor="middle" font-size="12" fill="#334155">Carregar o</text><text x="560" y="185" text-anchor="middle" font-size="12" fill="#334155">novo gás</text>
      <line x1="596" y1="110" x2="638" y2="110" stroke="#00C597" stroke-width="3" marker-end="url(#arr)"/>

      <circle cx="680" cy="110" r="34" fill="#00897B"/><text x="680" y="115" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">6</text>
      <text x="680" y="170" text-anchor="middle" font-size="12" fill="#334155">Verificar</text><text x="680" y="185" text-anchor="middle" font-size="12" fill="#334155">SH e SC</text>
    </g>
  </svg>
  <figcaption>O retrofit é um processo de seis etapas. Pular qualquer uma (principalmente o recolhimento e o vácuo) compromete o resultado.</figcaption>
</figure>

<h3>1. Avalie o equipamento antes de tudo</h3>
<p>Não vale a pena fazer retrofit numa máquina no fim da vida. Verifique o estado do compressor, vazamentos crônicos, idade e eficiência. Se o equipamento já está ruim, o gás novo não vai consertar a mecânica. Defina qual blend é o certo para a aplicação (climatização, média ou baixa temperatura) consultando os dados do fabricante do fluido.</p>

<h3>2. Recolha o R-22 antigo de forma correta</h3>
<p>Liberar gás na atmosfera é crime ambiental e desperdício. Use uma recolhedora (máquina de recuperação) e um cilindro de recuperação para retirar todo o R-22 do sistema. Esse gás recolhido pode ser reciclado ou destinado corretamente. Nunca ventile para o ar.</p>

<h3>3. Troque o óleo, se a combinação exigir</h3>
<p>Aqui está o ponto que mais queima compressor. O óleo precisa retornar ao compressor junto com o refrigerante. A regra geral:</p>
<ul>
  <li><strong>R-407C:</strong> exige troca para <strong>óleo POE</strong> (polioléster). Ele não circula bem em óleo mineral. Pode ser necessário fazer mais de uma lavagem de óleo até o residual de mineral ficar baixo.</li>
  <li><strong>R-438A e R-422D:</strong> foram formulados com aditivos que melhoram o retorno do óleo mineral, então muitas vezes <strong>dispensam a troca de óleo</strong>. Ainda assim, em sistemas longos ou complexos, adicionar uma parcela de POE garante o retorno. Siga sempre a folha técnica do fabricante do gás.</li>
</ul>
<p>Óleo mineral preso no evaporador, sem retornar, é morte lenta de compressor. Quando houver dúvida, garanta o retorno de óleo.</p>

<h3>4. Faça vácuo no sistema</h3>
<p>Depois de recolher o gás e ajustar o óleo, puxe vácuo profundo com bomba de vácuo para retirar ar e umidade do circuito. Umidade dentro do sistema reage com o óleo e forma ácidos que corroem o compressor por dentro. Vácuo bem feito (acompanhado por vacuômetro, não no relógio do manifold) é inegociável.</p>

<h3>5. Carregue o novo gás pela fase líquida</h3>
<p>Os substitutos do R-22 são blends com glide. Se você carregar pela fase vapor, a composição da mistura muda e o desempenho vai pro brejo. <strong>Carregue sempre pela fase líquida</strong> (cilindro invertido ou com tubo pescador, com cuidado para não dar golpe de líquido no compressor). Pese a carga, não confie só na pressão.</p>

<h3>6. Verifique superaquecimento e subresfriamento</h3>
<p>Com a máquina rodando, confirme o superaquecimento (SH) e o subresfriamento (SC) dentro da faixa correta. Em blends com glide, lembre: SH é calculado contra a temperatura de <strong>orvalho</strong> e SC contra a de <strong>bolha</strong>. SH baixo demais é risco de líquido voltando ao compressor; SH alto demais é falta de carga. Ajuste fino até estabilizar.</p>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/gas-r22-substitutos-retrofit-guia/charging.jpg" alt="Dois técnicos de refrigeração realizando a carga de gás em um sistema, com cilindro e mangueiras conectadas, etapa final do retrofit" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>A carga pela fase líquida e a verificação de SH e SC fecham o retrofit. Pesar o gás é mais confiável do que carregar só pela pressão.</figcaption>
</figure>

<h2 id="faq">Perguntas frequentes sobre o R-22 e os substitutos</h2>

<h3>O R-22 está proibido?</h3>
<p>O uso de máquinas já instaladas não está proibido. O que está em eliminação gradual é a produção e a importação de gás novo, seguindo o cronograma do Protocolo de Montreal. No Brasil, a redução chega a 97,5% em 2030 e a eliminação total em 2040, com cota residual apenas para manutenção entre 2030 e 2040.</p>

<h3>Qual o melhor substituto do R-22?</h3>
<p>Não existe um único melhor, depende da aplicação. Para ar-condicionado, o R-438A e o R-407C são os mais comuns (o R-438A costuma exigir menos mexida no óleo). Para refrigeração comercial de média e baixa temperatura, R-438A e R-422D são bastante usados. O R-438A (MO99) é o drop-in mais versátil porque tolera os três tipos de óleo e tem pressões muito próximas das do R-22.</p>

<h3>Posso colocar R-410A no lugar do R-22?</h3>
<p>Não. O R-410A trabalha com cerca de 60% mais pressão que o R-22 e o equipamento projetado para R-22 não foi dimensionado para isso. Usar R-410A numa máquina a R-22 pode queimar o compressor e romper componentes. Migrar para R-410A significa trocar o equipamento inteiro por um próprio para esse gás, não é retrofit.</p>

<h3>Retrofit vale a pena ou é melhor trocar a máquina?</h3>
<p>Se o equipamento está em bom estado mecânico e tem anos de vida pela frente, o retrofit costuma sair muito mais barato que trocar tudo. Se a máquina já está velha, ineficiente ou com vazamentos crônicos, o dinheiro do retrofit é melhor aplicado num equipamento novo (e mais eficiente). A avaliação técnica da etapa 1 é o que decide.</p>

<h3>Preciso trocar o óleo no retrofit?</h3>
<p>Depende do gás. O R-407C exige óleo POE. O R-438A e o R-422D foram formulados para conviver com óleo mineral e muitas vezes dispensam a troca, embora adicionar POE ajude o retorno de óleo em sistemas longos. Sempre consulte a folha técnica do fabricante do fluido.</p>

<h3>O gás recolhido do R-22 pode ser reaproveitado?</h3>
<p>Sim. O R-22 recolhido pode ser reciclado e reutilizado, o que é uma das poucas fontes que vão restar à medida que o gás novo some. Por isso o recolhimento correto (sem ventilar para a atmosfera) é importante também do ponto de vista econômico, além do ambiental.</p>

<h3>Existe risco de multa por liberar gás na atmosfera?</h3>
<p>Liberar fluido refrigerante na atmosfera caracteriza dano ambiental. O correto é recolher com máquina de recuperação e destinar adequadamente. Além de evitar problemas legais, você preserva um gás que está cada vez mais caro.</p>

<h2 id="conclusao">Conclusão: pare de apostar contra o calendário</h2>

<p>O R-22 teve seu tempo. O cronograma é claro: a oferta cai, o preço sobe e 2030 está logo ali. Para quem vive de manter equipamento funcionando, a leitura certa é planejar a migração antes de ela virar emergência. Avalie cada máquina, escolha o drop-in correto (R-438A, R-422D ou R-407C, nunca R-410A num sistema de R-22) e faça o retrofit com recolhimento, vácuo e verificação de SH e SC bem feitos.</p>

<p>E para organizar essa transição em escala (saber quais clientes ainda têm máquina a R-22, programar as visitas de retrofit, registrar qual gás foi usado em cada equipamento e acompanhar tudo pelo celular do técnico em campo), uma boa ferramenta de gestão faz a diferença. O <a href="/sistema-para-refrigeracao">sistema para empresas de refrigeração da Dominex</a> coloca ordens de serviço, equipamentos, histórico de gás e equipe num só lugar, com app instalável no celular do técnico.</p>

<div style="border-radius:14px;padding:26px;margin:28px 0;background:#00C597;color:#fff;text-align:center">
  <p style="font-size:20px;font-weight:700;margin:0 0 8px">Organize seus retrofits e a frota de equipamentos a R-22</p>
  <p style="margin:0 0 18px;opacity:0.95">Controle de OS, equipamentos e equipe no celular do técnico. Teste grátis por 14 dias, sem cartão.</p>
  <a href="/sistema-para-refrigeracao" style="display:inline-block;background:#fff;color:#00897B;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">Começar teste grátis</a>
</div>

<h2 id="referencias">Referências</h2>
<ul>
  <li>Ibama. <strong>Protocolo de Montreal</strong>. Ministério do Meio Ambiente. <a href="https://www.gov.br/ibama/pt-br/assuntos/emissoes-e-residuos/emissoes/protocolo-de-montreal" target="_blank" rel="noopener">gov.br/ibama ↗</a></li>
  <li>Programa Brasileiro de Eliminação dos HCFCs (PBH). <strong>Eliminação dos HCFCs no Brasil: cronograma e estratégia</strong>. <a href="https://www.protocolodemontreal.org.br/site/pbh/sobre-o-programa/eliminacao-dos-hcfcs-no-brasil/cronograma-e-estrategia" target="_blank" rel="noopener">protocolodemontreal.org.br ↗</a></li>
  <li>Ministério do Meio Ambiente. <strong>Ações brasileiras para proteção da camada de ozônio / PBH</strong>. <a href="https://www.gov.br/mma/pt-br" target="_blank" rel="noopener">gov.br/mma ↗</a></li>
  <li>CETESB. <strong>Substitutos do R-22</strong> (documento técnico). <a href="https://cetesb.sp.gov.br/aguasinteriores/wp-content/uploads/sites/16/2014/03/gfra_hc.pdf" target="_blank" rel="noopener">cetesb.sp.gov.br ↗</a></li>
  <li>Danfoss. <strong>R-22 phase down</strong> (referência técnica de fabricante). <a href="https://www.danfoss.com/en-us/about-danfoss/our-businesses/cooling/refrigerants-and-energy-efficiency/hcfc-and-cfc-phase-out/r22-phase-down/" target="_blank" rel="noopener">danfoss.com ↗</a></li>
  <li>Opteon (Chemours). <strong>R-22 retrofit guidance</strong> (referência técnica de fabricante). <a href="https://www.opteon.com/en/support/r22-retrofit-refrigeration" target="_blank" rel="noopener">opteon.com ↗</a></li>
  <li>Dados de pressão de saturação (P×T) dos refrigerantes: catálogo técnico interno Dominex, validado contra tabelas NIST e fabricantes.</li>
</ul>

<h2 id="creditos">Créditos das imagens</h2>
<ul>
  <li>Condensadora de ar-condicionado: foto de Dinkun Chen, via Wikimedia Commons, licença <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. <a href="https://commons.wikimedia.org/wiki/File:DAIKIN_AIR_CONDITIONER_OUTDOOR_UNIT_(23).jpg" target="_blank" rel="noopener">Ver original ↗</a></li>
  <li>Técnico com manifold de manômetros: foto da U.S. Air Force (Senior Airman Grace Turpin), domínio público, via Wikimedia Commons. <a href="https://commons.wikimedia.org/wiki/File:332nd_Expeditionary_CE_Squadron_HVAC-R_operations_(9305714).jpg" target="_blank" rel="noopener">Ver original ↗</a></li>
  <li>Técnicos realizando carga de gás: foto da U.S. Air Force (Senior Airman Mark Colmenares), domínio público, via Wikimedia Commons. <a href="https://commons.wikimedia.org/wiki/File:Cool_under_pressure-_386th_ECES_HVAC_technicians_in_action_(9047740).jpg" target="_blank" rel="noopener">Ver original ↗</a></li>
</ul>
$html$,
excerpt = $html$O R-22 está saindo de circulação por causa do Protocolo de Montreal. Veja o cronograma de eliminação no Brasil, os substitutos drop-in certos (R-438A, R-422D, R-407C), por que o R-410A NÃO substitui o R-22 e o passo a passo do retrofit sem queimar o equipamento.$html$,
meta_title = $html$Substituto do gás R-22: retrofit, drop-in e o que mudou | Guia técnico$html$,
meta_description = $html$Qual gás substitui o R-22? Cronograma de eliminação no Brasil, substitutos drop-in (R-438A, R-422D, R-407C), por que o R-410A NÃO substitui o R-22 e o passo a passo do retrofit sem queimar o compressor.$html$,
category = 'Refrigeração',
cover_image_url = $html$https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/gas-r22-substitutos-retrofit-guia.jpg$html$
WHERE slug = 'gas-r22-substitutos-retrofit-guia';
