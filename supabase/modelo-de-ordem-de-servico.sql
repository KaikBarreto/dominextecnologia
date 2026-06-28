-- Post de blog: Modelo de ordem de servico (o que e, como fazer e modelo gratis pra baixar)
-- Categoria: Ordem de Servico | slug: modelo-de-ordem-de-servico
-- Imagens em blog-images/posts/modelo-de-ordem-de-servico/ + cover em blog-images/covers/
-- Recurso baixavel: blog-images/files/modelo-de-ordem-de-servico/ (xlsx) + Google Planilhas (placeholder)
-- Placeholders a trocar pelo Tech Lead: https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/modelo-de-ordem-de-servico-cover.svg (capa SVG) e https://docs.google.com/spreadsheets/d/10BaVJDcWaA2k26Gwu4q81mKPrVXcWNhF2r1Yj2dMXtw/copy (link Google Planilhas)
-- Aplicar: npx supabase db query --linked < supabase/modelo-de-ordem-de-servico.sql

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
  $html$Ordem de serviço: o que é, como fazer e modelo grátis pra baixar$html$,
  'modelo-de-ordem-de-servico',
  $html$Ordem de serviço é o documento que prova o que foi feito, organiza a equipe e garante o recebimento. Veja o que toda OS precisa ter, o passo a passo pra fazer, exemplos por segmento, os erros que custam caro e baixe um modelo de ordem de serviço grátis (Google Planilhas e Excel).$html$,
  $html$Ordem de serviço: o que é, como fazer e modelo grátis pra baixar$html$,
  $html$O que é ordem de serviço, o que colocar nela e como fazer passo a passo. Modelo de ordem de serviço grátis pra baixar (Google Planilhas e Excel), campos essenciais, exemplos por segmento e FAQ.$html$,
  'Equipe Dominex',
  'Ordem de Serviço',
  ARRAY['ordem de serviço','modelo de ordem de serviço','o que é ordem de serviço','como fazer ordem de serviço','OS','gestão de campo','prestador de serviço'],
  $html$https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/modelo-de-ordem-de-servico-cover.svg$html$,
  'published',
  now()
)
ON CONFLICT (slug) DO NOTHING;

UPDATE blog_posts
SET content = $html$
<p class="lead">Toda empresa que coloca técnico na rua vive a mesma cena: o serviço foi feito, mas ninguém sabe direito o que foi trocado, quanto ficou, se o cliente concordou ou se a peça entrou na conta. A ordem de serviço resolve isso. Ela é o documento que diz, preto no branco, o que foi combinado, o que foi executado, quanto custou e quem aprovou. Sem ela, você trabalha no escuro, esquece de cobrar e perde discussão com cliente.</p>

<p>Este guia é pra quem é dono ou gestor de empresa de serviço (não importa o ramo: ar-condicionado, elétrica, energia solar, internet, CFTV, dedetização, elevador, limpeza). Você vai entender o que é uma ordem de serviço, o que ela precisa ter, como montar a sua passo a passo, ver exemplos por tipo de serviço e baixar um <strong>modelo de ordem de serviço grátis</strong> (em Google Planilhas e em Excel) pra começar hoje mesmo. Linguagem direta, sem juridiquês.</p>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/modelo-de-ordem-de-servico/os-intro-v2-eletricista-painel.jpg" alt="Técnico de campo trabalhando em um painel elétrico durante uma ordem de serviço, usando parafusadeira sobre disjuntores e contatores" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>Todo atendimento na casa ou na empresa do cliente deveria sair com uma ordem de serviço preenchida. É ela que vira o histórico e a base da cobrança.</figcaption>
</figure>

<h2 id="o-que-e">O que é uma ordem de serviço?</h2>

<p>Ordem de serviço (a famosa "OS") é o documento que registra um atendimento do começo ao fim. Ela autoriza o serviço, descreve o que vai ser feito (ou foi feito), lista os materiais usados, mostra os valores e recebe a assinatura de quem executou e de quem recebeu. Em uma frase: <strong>a ordem de serviço é a prova de que o serviço aconteceu e do que foi combinado</strong>.</p>

<p>Pense nela como o "boletim" de cada visita. O orçamento é a promessa (o que vai custar), e a ordem de serviço é o registro do que de fato rolou. Cada OS recebe um número, fica guardada e, juntas, elas viram o histórico do cliente e o coração da operação da empresa.</p>

<h2 id="para-que-serve">Para que serve a ordem de serviço (e por que toda empresa precisa)?</h2>

<p>Não é papelada por papelada. A OS resolve quatro problemas que doem no bolso de qualquer prestador de serviço:</p>

<ul>
  <li><strong>Controle.</strong> Você sabe quantos atendimentos cada técnico fez, quais estão abertos, quais já foram concluídos e o que ainda falta cobrar. Sem OS, o dono vira refém da memória da equipe.</li>
  <li><strong>Comprovação.</strong> Deu discussão com o cliente ("não foi isso que combinamos", "essa peça eu não autorizei")? A ordem de serviço assinada é a sua defesa. Ela mostra o que foi acordado e o que foi entregue.</li>
  <li><strong>Organização e histórico.</strong> Da próxima vez que voltar naquele cliente, você abre o histórico e vê o que já foi feito, qual peça entrou, qual a garantia. Atendimento mais rápido e mais profissional.</li>
  <li><strong>Cobrança.</strong> Toda OS concluída é uma conta a receber. Quando o documento registra mão de obra, materiais e valores, fica fácil faturar na hora e difícil esquecer de cobrar. Serviço sem OS é serviço que some.</li>
</ul>

<blockquote>
  <p>O Sebrae orienta que a formalização do atendimento e o registro das demandas (com prazos, responsáveis e produtos a entregar) são a base do controle de qualquer prestação de serviço. A ordem de serviço é exatamente esse registro no dia a dia da empresa.</p>
  <p><a href="https://sebrae.com.br/sites/PortalSebrae" target="_blank" rel="noopener">Ver fonte (Sebrae) ↗</a></p>
</blockquote>

<h2 id="o-que-colocar">O que toda ordem de serviço precisa ter? (os campos essenciais)</h2>

<p>Essa é a dúvida número um de quem vai montar a primeira OS: "o que eu coloco na ordem de serviço?". Existe um conjunto de campos que não pode faltar, porque é o que transforma um papel solto em um documento que serve pra controlar, comprovar e cobrar. A tabela abaixo lista cada um e por que ele importa.</p>

<table>
  <thead>
    <tr><th>Campo</th><th>O que é</th><th>Por que não pode faltar</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Número da OS e data</strong></td><td>Um número único (1, 2, 3...) e a data de abertura.</td><td>É a identidade do documento. Sem número, você não localiza, não organiza e não consegue puxar o histórico depois.</td></tr>
    <tr><td><strong>Dados da sua empresa</strong></td><td>Nome, CNPJ, telefone, logo.</td><td>Profissionaliza o documento e identifica quem prestou o serviço. Importante pra garantia e pra cobrança.</td></tr>
    <tr><td><strong>Dados do cliente</strong></td><td>Nome, contato, endereço do atendimento.</td><td>Diz a quem o serviço pertence e onde foi feito. Base do cadastro e do histórico.</td></tr>
    <tr><td><strong>Descrição do problema / solicitação</strong></td><td>O que o cliente pediu ou qual o defeito relatado.</td><td>Registra a expectativa. Evita o clássico "mas eu chamei pra outra coisa".</td></tr>
    <tr><td><strong>Serviço executado</strong></td><td>O que de fato foi feito no atendimento.</td><td>É a comprovação do trabalho. Quanto mais claro, menos discussão depois.</td></tr>
    <tr><td><strong>Checklist / itens verificados</strong></td><td>Lista de pontos conferidos (medições, testes, leituras).</td><td>Padroniza a qualidade e prova que o técnico fez tudo, não só "deu uma olhada".</td></tr>
    <tr><td><strong>Materiais e peças</strong></td><td>O que foi usado, com quantidade e valor.</td><td>Sem isso, peça vira prejuízo. É o que separa o que você gastou do que vai cobrar.</td></tr>
    <tr><td><strong>Mão de obra e valores</strong></td><td>Valor do serviço, dos materiais e o total.</td><td>É a base do faturamento. O total tem que estar claro pra cobrar sem ruído.</td></tr>
    <tr><td><strong>Técnico responsável</strong></td><td>Quem executou o serviço.</td><td>Define responsabilidade e ajuda a medir a produtividade de cada um.</td></tr>
    <tr><td><strong>Fotos do antes e depois</strong></td><td>Imagens do equipamento, do local ou do defeito.</td><td>Vale mais que mil palavras numa discussão. Prova o estado em que você encontrou e em que deixou.</td></tr>
    <tr><td><strong>Assinatura do cliente</strong></td><td>Confirmação de quem recebeu o serviço.</td><td>É o fechamento. A assinatura transforma a OS em aceite formal do serviço prestado.</td></tr>
  </tbody>
</table>

<p>Não precisa de todos em toda OS, mas quanto mais campos você preenche, mais forte fica o documento. A regra é simples: <strong>se um campo te protege numa discussão ou te ajuda a cobrar, ele merece estar na sua ordem de serviço</strong>.</p>

<h2 id="anatomia">A anatomia de uma boa ordem de serviço</h2>

<p>Visualmente, uma OS bem montada se divide em blocos, de cima pra baixo. Olhe o diagrama abaixo: ele mostra a ordem natural em que a informação aparece, do cabeçalho até a assinatura. Esse é o esqueleto do modelo que você vai baixar mais adiante.</p>

<figure>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 620" role="img" aria-label="Anatomia de uma ordem de serviço, em forma de linha do tempo" style="width:100%;height:auto;border-radius:14px">
    <defs>
      <linearGradient id="abg" x1="0" y1="0" x2="720" y2="620" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0a3a2e"/>
        <stop offset="1" stop-color="#06231c"/>
      </linearGradient>
      <linearGradient id="anode" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#00C597"/>
        <stop offset="1" stop-color="#0f9e7e"/>
      </linearGradient>
    </defs>
    <rect width="720" height="620" rx="16" fill="url(#abg)"/>

    <text x="48" y="56" font-family="Montserrat, Arial, sans-serif" font-size="28" font-weight="800" fill="#ffffff">Anatomia de uma ordem de serviço</text>
    <text x="48" y="86" font-family="Montserrat, Arial, sans-serif" font-size="16" font-weight="500" fill="#a7c2ba">Os 7 blocos, na ordem em que aparecem no documento</text>

    <!-- linha do tempo -->
    <line x1="70" y1="140" x2="70" y2="548" stroke="#00C597" stroke-width="3" opacity="0.45"/>

    <!-- STEP 1 -->
    <g transform="translate(0,140)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">1</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Cabeçalho</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Empresa, logo, número da OS e data</text>
    </g>
    <!-- STEP 2 -->
    <g transform="translate(0,208)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">2</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Cliente</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Nome, contato e endereço do atendimento</text>
    </g>
    <!-- STEP 3 -->
    <g transform="translate(0,276)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">3</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Serviço</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Problema relatado e o que foi executado</text>
    </g>
    <!-- STEP 4 -->
    <g transform="translate(0,344)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">4</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Checklist</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Itens verificados, medições e testes</text>
    </g>
    <!-- STEP 5 -->
    <g transform="translate(0,412)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">5</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Materiais</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Peças usadas, quantidade e valor</text>
    </g>
    <!-- STEP 6 -->
    <g transform="translate(0,480)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">6</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Valores</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Mão de obra, materiais e total</text>
    </g>
    <!-- STEP 7 -->
    <g transform="translate(0,548)">
      <circle cx="70" cy="0" r="20" fill="url(#anode)"/>
      <text x="70" y="6" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">7</text>
      <text x="112" y="-3" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Assinatura</text>
      <text x="112" y="20" font-family="Montserrat, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7c2ba">Aceite do técnico e do cliente</text>
    </g>
  </svg>
  <figcaption>Sete blocos, sempre na mesma ordem. Quando o documento segue essa estrutura, qualquer pessoa da equipe preenche e qualquer cliente entende.</figcaption>
</figure>

<h2 id="como-fazer">Como fazer uma ordem de serviço passo a passo</h2>

<p>Montar a sua OS é mais simples do que parece. Siga estes passos e você sai com um modelo reutilizável pra toda a equipe.</p>

<h3>1. Comece pelo cabeçalho com o número</h3>
<p>Coloque o nome e o logo da sua empresa, o CNPJ, o contato e, principalmente, um <strong>número de OS</strong>. Pode ser sequencial (0001, 0002...). Esse número é o que vai te permitir achar a ordem depois e nunca repetir. Adicione a data de abertura.</p>

<h3>2. Identifique o cliente e o local</h3>
<p>Nome, telefone e endereço do atendimento. Se for empresa, o nome do responsável que vai acompanhar. Esse bloco alimenta o seu cadastro de clientes e o histórico de cada um.</p>

<h3>3. Descreva o que foi pedido e o que foi feito</h3>
<p>Separe em dois campos: o <strong>problema relatado</strong> (o que o cliente falou) e o <strong>serviço executado</strong> (o que o técnico de fato fez). Essa separação evita 90% das discussões. Escreva claro, sem abreviação que só o técnico entende.</p>

<h3>4. Liste materiais e peças com valor</h3>
<p>Cada item usado, com quantidade e preço. Aqui é onde muita empresa perde dinheiro: peça que não foi anotada é peça que saiu do estoque e nunca foi cobrada. Some tudo.</p>

<h3>5. Feche os valores e o total</h3>
<p>Valor da mão de obra, soma dos materiais e o <strong>total</strong>. Deixe o total destacado. É o número que o cliente vai olhar e o que vira a sua conta a receber.</p>

<h3>6. Colha as assinaturas</h3>
<p>O técnico assina (responsabilidade) e o cliente assina (aceite). A assinatura do cliente é o "de acordo" que fecha a OS. Sem ela, o documento perde força numa eventual discussão.</p>

<blockquote>
  <p><strong>Dica de ouro:</strong> padronize. Crie UM modelo de ordem de serviço e use ele em todos os atendimentos. Quando cada técnico inventa o seu papel, você perde o controle. Modelo único = equipe alinhada e cliente vendo sempre o mesmo padrão profissional.</p>
</blockquote>

<h2 id="baixar-modelo-1">Baixe o modelo de ordem de serviço grátis</h2>

<p>Pra você não começar do zero, preparamos um <strong>modelo de ordem de serviço pronto e editável</strong>. Ele já vem com todos os campos essenciais que vimos acima, mais um checklist por tipo de serviço (preventiva e instalação) e uma aba "como usar". O total se calcula sozinho: você digita os materiais e a mão de obra, e a planilha soma. Serve tanto pra um técnico só quanto pra uma equipe inteira.</p>

<div style="margin:28px 0;padding:20px 22px;border:1px solid rgba(128,128,128,0.25);border-radius:14px;background:transparent">
  <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#00C597">Modelo de ordem de serviço Dominex (grátis)</p>
  <p style="margin:0">Editável, com checklist por tipo de serviço e total automático. Escolha o formato que você prefere usar:</p>
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px">
    <a href="https://docs.google.com/spreadsheets/d/10BaVJDcWaA2k26Gwu4q81mKPrVXcWNhF2r1Yj2dMXtw/copy" target="_blank" rel="noopener" style="background:#00C597;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Fazer uma cópia no Google Planilhas</a>
    <a href="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/files/modelo-de-ordem-de-servico/modelo-ordem-de-servico-dominex-v2.xlsx" target="_blank" rel="noopener" style="background:#0f9e7e;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Baixar em Excel (.xlsx)</a>
  </div>
</div>

<h2 id="checklist">Checklist de execução: por que padronizar (e exemplos)</h2>

<p>O checklist é a parte da OS que garante a <strong>qualidade</strong> do serviço. Em vez de confiar na memória do técnico, você lista os pontos que SEMPRE precisam ser verificados. Resultado: serviço padronizado, menos retrabalho e prova de que tudo foi conferido. Dois exemplos por tipo de serviço:</p>

<table>
  <thead>
    <tr><th>Manutenção preventiva</th><th>Instalação</th></tr>
  </thead>
  <tbody>
    <tr><td>Limpeza dos componentes</td><td>Conferência do material recebido</td></tr>
    <tr><td>Medição / leitura de funcionamento</td><td>Posicionamento e fixação corretos</td></tr>
    <tr><td>Verificação de vazamentos / folgas</td><td>Ligações e conexões testadas</td></tr>
    <tr><td>Aperto de conexões</td><td>Teste de funcionamento completo</td></tr>
    <tr><td>Teste final e registro das medições</td><td>Orientação de uso ao cliente</td></tr>
  </tbody>
</table>

<p>Cada ramo adapta o checklist à sua realidade, mas a lógica é a mesma: transformar "fiz o de sempre" em uma lista objetiva que qualquer técnico segue igual. Isso é o que separa a empresa amadora da empresa que escala.</p>

<h2 id="papel-x-digital">Ordem de serviço no papel x ordem de serviço digital</h2>

<p>Dá pra fazer OS no papel, no Word, no Excel ou num app no celular. Funcionar, funciona. Mas cada formato tem um custo escondido. Veja a comparação honesta:</p>

<table>
  <thead>
    <tr><th>Critério</th><th>OS no papel / bloco</th><th>OS digital (app no celular)</th></tr>
  </thead>
  <tbody>
    <tr><td>Custo inicial</td><td>Baixo (só o bloco)</td><td>Assinatura mensal</td></tr>
    <tr><td>Letra ilegível / via que some</td><td>Acontece sempre</td><td>Nunca, fica tudo digitado</td></tr>
    <tr><td>Foto do antes e depois</td><td>Não tem</td><td>Tira na hora, anexa na OS</td></tr>
    <tr><td>Assinatura do cliente</td><td>No papel, depois some</td><td>Na tela do celular, guardada</td></tr>
    <tr><td>Chega no escritório</td><td>Quando o técnico volta (ou esquece)</td><td>Na hora, o gestor já vê</td></tr>
    <tr><td>Histórico do cliente</td><td>Procurar em pasta / gaveta</td><td>Pesquisa em segundos</td></tr>
    <tr><td>Virar cobrança</td><td>Redigitar tudo de novo</td><td>OS pronta já vira a conta</td></tr>
  </tbody>
</table>

<p>A planilha que você baixou aqui já é um salto enorme em relação ao papel. Mas quando a empresa cresce e tem vários técnicos na rua, o gargalo deixa de ser o documento e passa a ser o <strong>fluxo</strong>: a OS preenchida no campo que demora pra chegar no escritório, a foto que ficou no celular do técnico, a assinatura que sumiu. É aí que a ordem de serviço digital muda o jogo.</p>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/modelo-de-ordem-de-servico/eletricista-em-campo.jpg" alt="Eletricista trabalhando em campo em Araxá, Minas Gerais, exemplo de profissional que preenche ordem de serviço no celular durante o atendimento" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>No campo, o técnico abre a OS no próprio celular: registra o serviço, tira foto, soma os materiais e colhe a assinatura do cliente na tela, sem papel pra perder.</figcaption>
</figure>

<h2 id="dominex">A ordem de serviço no celular do técnico</h2>

<p>É exatamente esse fluxo que a <a href="/os-digital">ordem de serviço digital da Dominex</a> resolve. O app é instalável no celular do técnico (sem precisar baixar nada na loja) e leva a OS pra dentro do bolso de quem está no atendimento. Na prática:</p>

<ul>
  <li>O gestor cria a OS no escritório e ela aparece no celular do técnico.</li>
  <li>No local, o técnico preenche o serviço, marca o checklist e lança os materiais.</li>
  <li>Tira <strong>foto do antes e depois</strong> direto na ordem.</li>
  <li>O cliente <strong>assina na tela</strong> do celular, e o aceite fica guardado.</li>
  <li>O total se calcula sozinho e a OS concluída já fica pronta pra virar cobrança.</li>
</ul>

<p>Tudo num lugar só, com o histórico de cada cliente a um toque de distância. E como a Dominex atende vários segmentos, o sistema se adapta ao seu ramo: tem versão pra <a href="/sistema-para-refrigeracao">empresas de refrigeração e climatização</a>, pra <a href="/sistema-para-eletricistas">eletricistas</a>, <a href="/sistema-para-energia-solar">energia solar</a>, <a href="/sistema-para-cftv">CFTV e segurança</a>, <a href="/sistema-para-provedores">provedores de internet</a>, <a href="/sistema-para-dedetizacao">dedetização</a> e mais. Quem trabalha com contratos de manutenção recorrente também conta com o módulo de <a href="/sistema-pmoc">PMOC e contratos</a>.</p>

<div style="border-radius:14px;padding:26px;margin:28px 0;background:#00C597;color:#fff;text-align:center">
  <p style="font-size:20px;font-weight:700;margin:0 0 8px">Pare de perder OS no papel</p>
  <p style="margin:0 0 18px;opacity:0.95">Ordem de serviço no celular do técnico: foto, checklist, assinatura e cobrança num lugar só. Teste grátis por 14 dias, sem cartão.</p>
  <a href="/os-digital" style="display:inline-block;background:#fff;color:#00897B;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">Começar teste grátis</a>
</div>

<h2 id="exemplos-segmento">Exemplos de ordem de serviço por segmento</h2>

<p>A estrutura da OS é a mesma pra todo mundo, mas o conteúdo muda conforme o ramo. Veja como cada segmento aproveita os mesmos campos:</p>

<table>
  <thead>
    <tr><th>Segmento</th><th>Serviço executado (exemplo)</th><th>Checklist típico</th><th>Materiais comuns</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Ar-condicionado</strong></td><td>Limpeza e recarga de gás de split</td><td>Pressões, vazamento, dreno, filtro</td><td>Gás, filtro, produto de limpeza</td></tr>
    <tr><td><strong>Elétrica</strong></td><td>Troca de disjuntor e revisão do quadro</td><td>Tensão, aterramento, aperto de bornes</td><td>Disjuntor, cabo, fita</td></tr>
    <tr><td><strong>Energia solar</strong></td><td>Manutenção de inversor e limpeza de painéis</td><td>Geração, conexões, strings</td><td>Conector MC4, produto de limpeza</td></tr>
    <tr><td><strong>Provedor de internet</strong></td><td>Instalação de ponto e configuração</td><td>Sinal, velocidade, fixação</td><td>Cabo, roteador, conector</td></tr>
    <tr><td><strong>CFTV / segurança</strong></td><td>Instalação de câmeras e DVR</td><td>Imagem, gravação, acesso remoto</td><td>Câmera, cabo, fonte</td></tr>
    <tr><td><strong>Dedetização</strong></td><td>Aplicação de controle de pragas</td><td>Pontos tratados, produto, dosagem</td><td>Produto químico, isca</td></tr>
  </tbody>
</table>

<p>Repare: muda o "o que foi feito", o checklist e as peças, mas os blocos da OS continuam idênticos. Por isso um bom modelo de ordem de serviço serve a qualquer empresa de campo, bastando adaptar o conteúdo.</p>

<h2 id="erros">Erros comuns na ordem de serviço que custam caro</h2>

<p>Esses são os deslizes que mais aparecem e que viram prejuízo direto:</p>

<ul>
  <li><strong>Não numerar a OS.</strong> Sem número, você não acha o documento depois e não consegue organizar. Numere sempre.</li>
  <li><strong>Esquecer de anotar materiais.</strong> Peça que saiu do estoque e não entrou na OS é peça que você pagou e não cobrou. Lance tudo na hora.</li>
  <li><strong>Descrição vaga.</strong> "Feito o serviço" não comprova nada. Descreva o que foi feito de verdade.</li>
  <li><strong>Não colher a assinatura.</strong> Sem o aceite do cliente, a OS perde força em qualquer discussão.</li>
  <li><strong>Não tirar foto.</strong> Em garantia ou disputa, a foto do antes e depois é a prova que decide.</li>
  <li><strong>Cada técnico com um modelo.</strong> Padrão diferente em cada atendimento = caos no escritório. Use um modelo só.</li>
  <li><strong>OS que não vira cobrança.</strong> Serviço concluído que não gera conta a receber é dinheiro que evapora. Feche o ciclo: concluiu, cobrou.</li>
</ul>

<h2 id="faq">Perguntas frequentes sobre ordem de serviço</h2>

<h3>O que é uma ordem de serviço?</h3>
<p>É o documento que registra um atendimento do início ao fim: autoriza o serviço, descreve o que foi feito, lista materiais e valores e recebe a assinatura de quem executou e de quem recebeu. Em resumo, é a prova do que foi combinado e do que foi entregue, mais a base pra cobrança e pro histórico do cliente.</p>

<h3>O que deve constar em uma ordem de serviço?</h3>
<p>Os campos essenciais são: número e data, dados da sua empresa, dados do cliente, descrição do problema e do serviço executado, checklist de itens verificados, materiais e peças com valor, mão de obra e total, técnico responsável, fotos do antes e depois e a assinatura do cliente. Quanto mais completo, mais o documento te protege e ajuda a faturar.</p>

<h3>Ordem de serviço tem valor legal?</h3>
<p>A ordem de serviço não é uma nota fiscal, mas funciona como prova do que foi acordado e executado entre você e o cliente, principalmente quando está assinada por ambos. Em uma discussão sobre o que foi combinado, ela é um documento de comprovação importante. Atenção: a OS não substitui a emissão da nota fiscal de serviço (NFS-e), que é uma obrigação fiscal separada.</p>

<h3>Qual a diferença entre orçamento e ordem de serviço?</h3>
<p>O orçamento é a proposta, vem antes: ele estima o que o serviço vai custar pra o cliente decidir se aprova. A ordem de serviço vem depois, quando o serviço é autorizado e executado: ela registra o que de fato foi feito, os materiais usados e o valor final. Em resumo, o orçamento é a promessa e a OS é o registro do que aconteceu.</p>

<h3>Como fazer uma ordem de serviço simples?</h3>
<p>Comece com um modelo único contendo cabeçalho com número, dados do cliente, descrição do serviço, materiais com valor, total e espaço pra assinatura. Você pode usar o nosso modelo grátis (em Google Planilhas ou Excel) e ir adaptando os campos ao seu ramo. Conforme a empresa cresce, vale migrar pra uma ordem de serviço digital no celular do técnico.</p>

<h3>Posso fazer ordem de serviço no Word, Excel ou PDF?</h3>
<p>Pode. Word e Excel servem pra criar e imprimir o modelo, e o PDF é ótimo pra enviar uma via pronta ao cliente. A planilha em Excel tem a vantagem de somar os valores sozinha. A limitação aparece quando você tem vários técnicos na rua: aí o ideal é uma OS digital que o técnico preenche no campo e o escritório recebe na hora.</p>

<h2 id="conclusao">Conclusão: a OS é o documento que organiza (e fatura) o seu serviço</h2>

<p>A ordem de serviço é o documento mais importante de qualquer empresa de campo. Ela controla a operação, comprova o que foi feito, organiza o histórico e garante que todo serviço vire dinheiro no caixa. Não importa o seu ramo: o caminho é o mesmo. Padronize um modelo, preencha todos os campos essenciais e nunca deixe um atendimento sair sem OS.</p>

<p>Comece hoje baixando o nosso modelo grátis, em Google Planilhas ou Excel. E quando o papel (ou a planilha) começar a apertar porque a equipe cresceu, suba o nível levando a ordem de serviço pro celular do técnico, com foto, assinatura e cobrança num lugar só.</p>

<div style="margin:28px 0;padding:20px 22px;border:1px solid rgba(128,128,128,0.25);border-radius:14px;background:transparent">
  <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#00C597">Baixe o modelo de ordem de serviço grátis</p>
  <p style="margin:0">Modelo editável com checklist por tipo de serviço (preventiva e instalação), aba "como usar" e total automático. Para um técnico ou pra equipe inteira.</p>
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px">
    <a href="https://docs.google.com/spreadsheets/d/10BaVJDcWaA2k26Gwu4q81mKPrVXcWNhF2r1Yj2dMXtw/copy" target="_blank" rel="noopener" style="background:#00C597;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Fazer uma cópia no Google Planilhas</a>
    <a href="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/files/modelo-de-ordem-de-servico/modelo-ordem-de-servico-dominex-v2.xlsx" target="_blank" rel="noopener" style="background:#0f9e7e;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Baixar em Excel (.xlsx)</a>
  </div>
</div>

<h2 id="referencias">Referências</h2>
<ul>
  <li>Sebrae. <strong>Portal Sebrae</strong> (orientações de gestão e formalização de atendimento para pequenas empresas de serviço). <a href="https://sebrae.com.br/sites/PortalSebrae" target="_blank" rel="noopener">sebrae.com.br ↗</a></li>
  <li>Sebrae. <strong>Modelo de Ordem de Prestação de Serviços (OPS)</strong>, exemplo de documento oficial de prestação de serviço. <a href="https://sebrae.com.br/sites/PortalSebrae/canais_adicionais/sistemagestaofornecedores" target="_blank" rel="noopener">Sistema de Gestão de Fornecedores ↗</a></li>
  <li>Governo Federal. <strong>NFS-e Nacional</strong> (a ordem de serviço não substitui a nota fiscal de serviço). <a href="https://www.gov.br/nfse/pt-br" target="_blank" rel="noopener">gov.br/nfse ↗</a></li>
</ul>

<h2 id="creditos">Créditos das imagens</h2>
<ul>
  <li>Técnico em painel elétrico (abertura do conteúdo): foto de ranjeet ., via <a href="https://www.pexels.com/photo/a-man-is-working-on-an-electrical-panel-27928759/" target="_blank" rel="noopener">Pexels</a> (Pexels License, uso livre).</li>
  <li>Eletricista trabalhando em Araxá (MG): foto de Andrevruas, via Wikimedia Commons, licença <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>. <a href="https://commons.wikimedia.org/wiki/File:Eletricista_araxa.JPG" target="_blank" rel="noopener">Ver original ↗</a></li>
</ul>
$html$,
title = $html$Ordem de serviço: o que é, como fazer e modelo grátis pra baixar$html$,
excerpt = $html$Ordem de serviço é o documento que prova o que foi feito, organiza a equipe e garante o recebimento. Veja o que toda OS precisa ter, o passo a passo pra fazer, exemplos por segmento, os erros que custam caro e baixe um modelo de ordem de serviço grátis (Google Planilhas e Excel).$html$,
meta_title = $html$Ordem de serviço: o que é, como fazer e modelo grátis pra baixar$html$,
meta_description = $html$O que é ordem de serviço, o que colocar nela e como fazer passo a passo. Modelo de ordem de serviço grátis pra baixar (Google Planilhas e Excel), campos essenciais, exemplos por segmento e FAQ.$html$,
category = 'Ordem de Serviço',
cover_image_url = $html$https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/modelo-de-ordem-de-servico-cover.svg$html$
WHERE slug = 'modelo-de-ordem-de-servico';
