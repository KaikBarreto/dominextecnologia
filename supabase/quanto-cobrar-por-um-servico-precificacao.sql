-- Post de blog: Quanto cobrar por um serviço (como calcular o preço da mão de obra), pilar generalista cross-nicho
-- Categoria: Gestão de Campo | slug: quanto-cobrar-por-um-servico-precificacao
-- Imagens em blog-images/posts/quanto-cobrar-por-um-servico-precificacao/ + cover em blog-images/covers/
-- Planilha distribuída de dois jeitos: cópia no Google Planilhas (https://docs.google.com/spreadsheets/d/12-JPF3Ki-C9xC4FCperSDNmBrAhialHnD-N_273EQw8/copy) + download .xlsx do bucket (blog-images/files/quanto-cobrar-por-um-servico-precificacao/planilha-precificacao-dominex-v2.xlsx)
-- Aplicar: npx supabase db query --linked < supabase/quanto-cobrar-por-um-servico-precificacao.sql

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
  $html$Quanto cobrar por um serviço: como calcular o preço da mão de obra (com planilha grátis)$html$,
  'quanto-cobrar-por-um-servico-precificacao',
  $html$Não sabe quanto cobrar pelo seu serviço? Aprenda a calcular o custo da hora-técnica, a montar o preço com lucro de verdade e as 3 formas de precificar (BDI, markup e margem de contribuição), com fórmula, exemplo numérico e planilha grátis pra baixar.$html$,
  $html$Quanto cobrar por um serviço: como calcular o preço da mão de obra | Guia + planilha grátis$html$,
  $html$Como precificar um serviço sem trabalhar de graça: custo da hora-técnica passo a passo, os 4 blocos do preço, BDI, markup e margem de contribuição (com fórmula e exemplo). Vale pra eletricista, refrigerista, instalador solar, CFTV e mais. Planilha grátis.$html$,
  'Equipe Dominex',
  'Gestão de Campo',
  ARRAY['quanto cobrar por um serviço','como precificar','custo hora','mão de obra','BDI','markup','margem de contribuição','formação de preço','prestador de serviço','planilha de precificação'],
  $html$https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/quanto-cobrar-por-um-servico-precificacao-cover.svg$html$,
  'published',
  now()
)
ON CONFLICT (slug) DO NOTHING;

UPDATE blog_posts
SET content = $html$
<p class="lead">Quase todo dono de empresa de serviço já passou por isso: o cliente pede um orçamento, você olha pro teto, faz uma conta de cabeça e solta um número. Às vezes ganha o trabalho e descobre no fim do mês que trabalhou de graça. Às vezes perde porque cobrou caro sem saber por quê. O problema não é falta de competência técnica, é que ninguém ensina o dono a formar preço. Este guia resolve isso de cabo a rabo: como calcular o custo da sua hora de trabalho, como montar o preço com lucro de verdade e quando usar cada uma das três formas de precificar (BDI, markup e margem de contribuição).</p>

<p>Vale pra qualquer serviço de campo: eletricista, instalador de ar-condicionado, técnico de CFTV, instalador de energia solar, dedetizador, provedor de internet, manutenção predial. A lógica é a mesma. Muda só o número que entra na conta. E no fim você baixa uma planilha gratuita que faz toda essa matemática pra você.</p>

<div style="margin:28px 0;padding:20px 22px;border:1px solid rgba(128,128,128,0.25);border-radius:14px;background:transparent">
  <p style="margin:0 0 6px;font-weight:700;font-size:18px;color:#00C597">📊 Baixe a planilha de precificação grátis</p>
  <p style="margin:0 0 14px">Calcula o custo da sua hora-técnica, aplica o BDI e a margem de contribuição automaticamente. Você digita o custo da mão de obra (de um técnico ou da equipe inteira) e os seus percentuais, e ela monta o preço, o valor à vista, a parcela e a margem. Já faz a conta do jeito certo, dividindo o custo pelo BDI, sem risco de você multiplicar errado.</p>
  <p style="margin:0 0 14px;font-size:14px">Copie no Google Planilhas (recomendado) ou baixe em Excel.</p>
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px">
    <a href="https://docs.google.com/spreadsheets/d/12-JPF3Ki-C9xC4FCperSDNmBrAhialHnD-N_273EQw8/copy" target="_blank" rel="noopener" style="background:#00C597;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Fazer uma cópia no Google Planilhas</a>
    <a href="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/files/quanto-cobrar-por-um-servico-precificacao/planilha-precificacao-dominex-v2.xlsx" target="_blank" rel="noopener" style="background:#0f9e7e;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Baixar em Excel (.xlsx)</a>
  </div>
</div>

<h2 id="como-calcular-preco">Como calcular o preço de um serviço?</h2>

<p>O preço de um serviço é a soma de quatro blocos: o custo direto (mão de obra e material daquele trabalho), as despesas fixas da sua empresa rateadas, os impostos sobre a nota, e o lucro que você quer ganhar. Quem esquece de qualquer um desses blocos cobra menos do que deveria e financia o próprio prejuízo sem perceber.</p>

<p>A frase resume tudo: <strong>preço não é o que o concorrente cobra, é o que cobre seus custos mais a margem que você quer</strong>. Olhar o concorrente serve pra saber se você está dentro do mercado, mas o ponto de partida sempre são os seus números. Vamos abrir os quatro blocos.</p>

<figure>
  <svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;border-radius:12px;background:#f7faf9">
    <text x="360" y="34" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#0f172a">Os 4 blocos do preço de um serviço</text>
    <!-- bloco 1 -->
    <rect x="30" y="70" width="150" height="150" rx="12" fill="#00C597"/>
    <text x="105" y="120" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#fff">Custo direto</text>
    <text x="105" y="145" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#eafffa">mão de obra</text>
    <text x="105" y="163" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#eafffa">+ material da OS</text>
    <text x="105" y="252" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">o que aquele</text>
    <text x="105" y="270" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">serviço consome</text>
    <!-- + -->
    <text x="200" y="155" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="#94a3b8">+</text>
    <!-- bloco 2 -->
    <rect x="220" y="70" width="150" height="150" rx="12" fill="#0d9488"/>
    <text x="295" y="128" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#fff">Despesa fixa</text>
    <text x="295" y="150" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#d6f5ef">rateada</text>
    <text x="295" y="252" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">aluguel, carro,</text>
    <text x="295" y="270" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">salário do escritório</text>
    <!-- + -->
    <text x="390" y="155" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="#94a3b8">+</text>
    <!-- bloco 3 -->
    <rect x="410" y="70" width="150" height="150" rx="12" fill="#475569"/>
    <text x="485" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#fff">Impostos</text>
    <text x="485" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#e2e8f0">ISS, Simples</text>
    <text x="485" y="252" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">o que sai</text>
    <text x="485" y="270" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">na nota fiscal</text>
    <!-- + -->
    <text x="580" y="155" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="#94a3b8">+</text>
    <!-- bloco 4 -->
    <rect x="600" y="70" width="90" height="150" rx="12" fill="#16a34a"/>
    <text x="645" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#fff">Lucro</text>
    <text x="645" y="252" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">o que você</text>
    <text x="645" y="270" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">quer ganhar</text>
  </svg>
  <figcaption>O preço justo cobre os quatro blocos. Tirar qualquer um deles é cobrar abaixo do custo sem perceber.</figcaption>
</figure>

<h3>Bloco 1: custo direto (mão de obra + material)</h3>
<p>É tudo que aquele serviço específico consome. O material aplicado (cabo, gás, fita, peça, sensor) e as horas de trabalho do técnico naquele atendimento. A parte de material é fácil, é o que você pagou no fornecedor. A parte da mão de obra é onde quase todo mundo erra, porque acha que o custo da hora é só o salário dividido pelas horas do mês. Não é. Mais adiante mostramos o cálculo correto do custo da hora-técnica.</p>

<h3>Bloco 2: despesa fixa rateada</h3>
<p>São os custos que você paga existindo, vendendo ou não: aluguel, energia do escritório, internet, salário de quem não vai a campo, contador, carro da empresa, ferramentas, software de gestão. Esse valor precisa estar embutido no preço de cada serviço, senão ele não se paga. O jeito de embutir é ratear: pega o total de despesa fixa do mês e divide pelas horas produtivas que a equipe entrega no mês.</p>

<h3>Bloco 3: impostos sobre a nota</h3>
<p>Quando você emite a nota fiscal de serviço (NFS-e), incide imposto. Para a maioria das pequenas empresas de serviço no Simples Nacional, a alíquota efetiva costuma ficar entre 6% e 18% conforme a faixa de faturamento e o anexo. Para o MEI, há um valor fixo mensal. O imposto sai de cima do preço de venda, então ele precisa estar dentro do preço, não pode ser descontado do seu lucro depois.</p>

<blockquote>
  <p>O ISS (Imposto Sobre Serviços) é o tributo municipal que incide sobre a prestação de serviços. A alíquota é definida por cada município, dentro do limite mínimo de 2% e máximo de 5% fixado em lei complementar federal.</p>
  <p><a href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm" target="_blank" rel="noopener">Ver fonte (LC 116/2003) ↗</a></p>
</blockquote>

<h3>Bloco 4: lucro</h3>
<p>O lucro é o que sobra pra você depois de cobrir custos, despesas e impostos. Não é "o que sobrar no fim do mês", é uma porcentagem que você decide e coloca dentro do preço de propósito. Sem essa linha, sua empresa só empata, e empatar não paga investimento, reserva, nem o seu pró-labore de verdade.</p>

<h2 id="custo-hora-tecnica">Como calcular o custo da hora-técnica passo a passo</h2>

<p>Antes de cobrar por hora, você precisa saber quanto a sua hora custa. Esse é o erro número um de quem precifica no chute: dividir o salário pelas 220 horas do mês e achar que aquilo é o custo. Não é, por dois motivos. Primeiro, o técnico custa muito mais que o salário (tem encargo, férias, 13º, FGTS). Segundo, ele não produz 220 horas, porque parte do tempo é deslocamento, almoço, café, retrabalho e ociosidade.</p>

<p>O cálculo correto tem quatro passos. Vamos com um exemplo de um técnico com salário de R$ 2.500.</p>

<table>
  <thead>
    <tr><th>Passo</th><th>O que entra</th><th>Exemplo</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>1. Salário base</strong></td><td>O que está na carteira</td><td>R$ 2.500</td></tr>
    <tr><td><strong>2. + Encargos</strong></td><td>FGTS, férias + 1/3, 13º, INSS patronal, provisões (de 60% a 80% sobre o salário no regime CLT)</td><td>+ R$ 1.750 (70%) = <strong>R$ 4.250/mês</strong></td></tr>
    <tr><td><strong>3. Horas produtivas reais</strong></td><td>Não são as 220h. Tire deslocamento, almoço, ociosidade. Reste em torno de 6h úteis por dia útil</td><td>≈ 132 horas/mês</td></tr>
    <tr><td><strong>4. Custo da hora-técnica</strong></td><td>Custo total ÷ horas produtivas</td><td>R$ 4.250 ÷ 132 = <strong>R$ 32,20/hora</strong></td></tr>
  </tbody>
</table>

<p>Veja o tamanho do erro: o salário "por hora" ingênuo seria R$ 2.500 ÷ 220 = R$ 11,36. O custo real da hora é R$ 32,20, quase o triplo. Quem cobra com base nos R$ 11,36 está pagando pra trabalhar. E isso é só o <em>custo</em> da hora, ainda sem despesa fixa, imposto e lucro por cima. Por isso a próxima etapa é decidir qual método usar pra transformar custo em preço.</p>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/quanto-cobrar-por-um-servico-precificacao/eletricistas-belo-horizonte.jpg" alt="Equipe de eletricistas trabalhando em um poste de energia em Belo Horizonte, com caminhão e cesto aéreo, exemplo de prestador de serviço de campo no Brasil que precisa calcular o custo da hora-técnica" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>Seja eletricista, refrigerista ou instalador, a hora do técnico custa bem mais que o salário dividido pelo mês.</figcaption>
</figure>

<h2 id="tres-formas">As 3 formas de precificar: BDI, markup e margem de contribuição</h2>

<p>Existem três métodos clássicos pra transformar custo em preço de venda. Eles não competem entre si, cada um serve a uma situação. O markup é o do dia a dia (orçamento de serviço comum). O BDI é o de obra e instalação (empreitada). A margem de contribuição é a ferramenta de decisão (saber se vale a pena pegar o trabalho e qual o seu ponto de equilíbrio). Vamos abrir cada um com fórmula e exemplo, e no fim uma tabela diz quando usar qual.</p>

<figure>
  <svg viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;border-radius:12px;background:#f7faf9">
    <text x="360" y="34" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#0f172a">BDI x Markup x Margem de contribuição</text>
    <!-- col 1 -->
    <rect x="24" y="60" width="216" height="232" rx="12" fill="#fff" stroke="#00C597" stroke-width="2"/>
    <rect x="24" y="60" width="216" height="44" rx="12" fill="#00C597"/>
    <text x="132" y="88" text-anchor="middle" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#fff">MARKUP</text>
    <text x="132" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#0f172a">Multiplicador sobre o custo</text>
    <text x="132" y="178" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#475569">Serviço comum,</text>
    <text x="132" y="198" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#475569">orçamento do dia a dia</text>
    <text x="132" y="244" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">"qual preço cobrir</text>
    <text x="132" y="262" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">custo, despesa e lucro?"</text>
    <!-- col 2 -->
    <rect x="252" y="60" width="216" height="232" rx="12" fill="#fff" stroke="#0d9488" stroke-width="2"/>
    <rect x="252" y="60" width="216" height="44" rx="12" fill="#0d9488"/>
    <text x="360" y="88" text-anchor="middle" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#fff">BDI</text>
    <text x="360" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#0f172a">Custo ÷ fator</text>
    <text x="360" y="178" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#475569">Instalação, obra e</text>
    <text x="360" y="198" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#475569">proposta no sistema</text>
    <text x="360" y="244" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">"qual preço com imposto,</text>
    <text x="360" y="262" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">indiretos e lucro?"</text>
    <!-- col 3 -->
    <rect x="480" y="60" width="216" height="232" rx="12" fill="#fff" stroke="#475569" stroke-width="2"/>
    <rect x="480" y="60" width="216" height="44" rx="12" fill="#475569"/>
    <text x="588" y="88" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#fff">MARGEM DE CONTRIB.</text>
    <text x="588" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#0f172a">Preço − custos variáveis</text>
    <text x="588" y="178" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#475569">Decisão e</text>
    <text x="588" y="198" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#475569">ponto de equilíbrio</text>
    <text x="588" y="244" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">"vale a pena pegar?</text>
    <text x="588" y="262" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">a partir de quanto lucro?"</text>
  </svg>
  <figcaption>Três ferramentas, três perguntas diferentes. Bom prestador usa as três conforme o tipo de trabalho.</figcaption>
</figure>

<h3 id="markup">O que é markup e como calcular?</h3>
<p>O markup é um multiplicador que você aplica sobre o custo pra chegar no preço de venda já cobrindo despesas fixas, impostos e lucro de uma vez só. É o método mais usado no orçamento de serviço do dia a dia, porque é rápido: calcula o multiplicador uma vez e aplica em todo orçamento.</p>

<p>A fórmula do divisor do markup é:</p>

<blockquote>
  <p><strong>Markup = 1 ÷ [ 1 − (%despesas fixas + %impostos + %lucro) ]</strong></p>
  <p>Todos os percentuais sobre o preço de venda, em forma decimal.</p>
</blockquote>

<p>Exemplo. Suponha despesas fixas representando 20% do faturamento, impostos de 10% e lucro desejado de 15%:</p>

<table>
  <thead><tr><th>Item</th><th>%</th></tr></thead>
  <tbody>
    <tr><td>Despesas fixas</td><td>20%</td></tr>
    <tr><td>Impostos (Simples/ISS)</td><td>10%</td></tr>
    <tr><td>Lucro desejado</td><td>15%</td></tr>
    <tr><td><strong>Soma</strong></td><td><strong>45% (0,45)</strong></td></tr>
    <tr><td>1 − 0,45</td><td>0,55</td></tr>
    <tr><td><strong>Markup = 1 ÷ 0,55</strong></td><td><strong>≈ 1,82</strong></td></tr>
  </tbody>
</table>

<p>Pronto. Se o custo direto de um serviço (mão de obra + material) deu R$ 200, o preço de venda é R$ 200 × 1,82 = <strong>R$ 364</strong>. Esse preço já cobre as despesas fixas, os impostos da nota e os 15% de lucro. Repare que multiplicar o custo "por 2 no olho" daria R$ 400, e abaixo de 1,82 você estaria comendo o próprio lucro. É por isso que o multiplicador tem que vir de conta, não de hábito.</p>

<h3 id="bdi">O que é BDI e como calcular?</h3>
<p>BDI é a sigla de Benefícios e Despesas Indiretas. Em português simples: é tudo que tem que estar dentro do preço além do custo direto do serviço (impostos, despesas da empresa que não aparecem na conta da obra, e o seu lucro). É o método que o sistema da Dominex usa pra montar o preço de orçamentos e propostas, principalmente em instalação e obra. Se você instala ar-condicionado, monta usina solar, faz infraestrutura de rede ou reforma elétrica, o BDI é a sua linguagem.</p>

<p>Aqui vem o ponto que quase todo mundo entende errado, e que dá autoridade pro nosso método: <strong>no BDI você não soma a porcentagem ao custo, você divide o custo por um fator</strong>. É exatamente assim que o Dominex calcula. Veja a fórmula que o sistema usa, ela é mais simples do que parece:</p>

<blockquote>
  <p><strong>BDI = (100 − impostos% − administração% − lucro%) ÷ 100</strong></p>
  <p>O resultado é um fator (um número entre 0 e 1). Depois: <strong>Preço = Custo total ÷ BDI</strong>.</p>
</blockquote>

<p>Vamos a um exemplo. Suponha impostos de 10%, despesas de administração (os custos indiretos da empresa) de 12% e lucro desejado de 15%:</p>

<table>
  <thead><tr><th>Componente</th><th>%</th></tr></thead>
  <tbody>
    <tr><td>Impostos sobre a nota</td><td>10%</td></tr>
    <tr><td>Administração / custos indiretos</td><td>12%</td></tr>
    <tr><td>Lucro desejado</td><td>15%</td></tr>
    <tr><td><strong>Soma</strong></td><td><strong>37%</strong></td></tr>
    <tr><td>100 − 37</td><td>63</td></tr>
    <tr><td><strong>BDI = 63 ÷ 100</strong></td><td><strong>0,63</strong></td></tr>
  </tbody>
</table>

<p>Agora é só dividir o custo pelo fator. Se o custo total de um serviço deu R$ 100, o preço é R$ 100 ÷ 0,63 = <strong>R$ 158,73</strong>. Esse preço já cobre os 10% de imposto, os 12% de administração e os 15% de lucro, todos calculados sobre o preço de venda (que é o jeito certo, como explicamos mais abaixo na seção dos mitos).</p>

<h4>O que entra no "custo total"</h4>
<p>No método do Dominex, o custo total que vai pra dentro da divisão é a soma de três coisas:</p>
<ul>
  <li><strong>Mão de obra</strong> daquele serviço (lembrando do custo-hora real, não do salário cru).</li>
  <li><strong>Materiais</strong> aplicados (peças, gás, cabo, insumos).</li>
  <li><strong>Deslocamento</strong>, que é a distância em quilômetros vezes o seu custo por quilômetro (km × custo por km). Atendimento longe custa caro e tem que entrar na conta.</li>
</ul>

<h4>À vista e parcelado</h4>
<p>Depois de chegar no preço, o sistema ainda calcula as duas formas de pagamento:</p>
<ul>
  <li><strong>À vista:</strong> preço × (1 − desconto%). Com 6% de desconto, R$ 158,73 × 0,94 = <strong>R$ 149,21</strong>.</li>
  <li><strong>Parcelado:</strong> preço ÷ número de parcelas. Em 10 vezes, R$ 158,73 ÷ 10 = <strong>R$ 15,87 por parcela</strong>.</li>
</ul>

<p>Um detalhe pra quem já ouviu falar de BDI em construção civil: existe sim uma fórmula mais longa do BDI composto (usada em obra pública, referência do TCU) que multiplica vários fatores de risco, seguro e garantia. Mas o método prático que o Dominex usa, e que resolve a vida da grande maioria das empresas de serviço, é esse do divisor acima: rápido, claro e difícil de errar.</p>

<p>Boa notícia: você não precisa fazer essa conta na mão a cada orçamento. O sistema da Dominex já calcula o BDI dentro do módulo de orçamentos e propostas, com impostos, administração, lucro e deslocamento separados, e já entrega o preço final, o valor à vista e a parcela. É só montar a proposta direto no celular ou no computador.</p>

<h3 id="margem">Qual a diferença entre markup e margem de contribuição?</h3>
<p>Markup e margem de contribuição parecem a mesma coisa, mas respondem perguntas diferentes. O markup te diz <em>qual preço cobrar</em>. A margem de contribuição te diz <em>quanto sobra de cada venda pra pagar as despesas fixas e gerar lucro</em>, e a partir de quantos serviços por mês sua empresa começa a ganhar dinheiro (o ponto de equilíbrio). Markup é ferramenta de formação de preço; margem é ferramenta de decisão.</p>

<p>A fórmula é:</p>

<blockquote>
  <p><strong>Margem de contribuição = Preço de venda − Custos e despesas variáveis</strong></p>
  <p>Variáveis = o que só existe se a venda acontecer (material aplicado, comissão, imposto sobre aquela nota).</p>
</blockquote>

<p>Exemplo. Um serviço vendido por R$ 364, com custo variável (material + imposto + comissão) de R$ 150:</p>

<table>
  <thead><tr><th>Item</th><th>Valor</th></tr></thead>
  <tbody>
    <tr><td>Preço de venda</td><td>R$ 364</td></tr>
    <tr><td>(−) Custos e despesas variáveis</td><td>R$ 150</td></tr>
    <tr><td><strong>= Margem de contribuição</strong></td><td><strong>R$ 214 (59%)</strong></td></tr>
  </tbody>
</table>

<p>Esses R$ 214 são o que cada serviço "contribui" pra pagar as despesas fixas da empresa. Se a sua despesa fixa mensal é R$ 6.000, você precisa de R$ 6.000 ÷ R$ 214 ≈ <strong>28 serviços por mês só pra empatar</strong> (ponto de equilíbrio). Do 29º em diante, é lucro. Essa é a leitura que o markup sozinho não te dá, e é por isso que vale dominar os dois.</p>

<h3 id="quando-usar">Tabela comparativa: quando usar cada um</h3>

<table>
  <thead>
    <tr><th>Método</th><th>O que faz</th><th>Quando usar</th><th>Pergunta que responde</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Markup</strong></td>
      <td>Multiplica o custo pra chegar no preço já com despesa, imposto e lucro</td>
      <td>Orçamento de serviço do dia a dia (visita, manutenção, conserto, atendimento avulso)</td>
      <td>Qual preço cobrar agora?</td>
    </tr>
    <tr>
      <td><strong>BDI</strong></td>
      <td>Divide o custo total por um fator pra embutir imposto, indiretos e lucro de uma vez</td>
      <td>Instalação, obra e proposta montada no sistema (método que o Dominex usa)</td>
      <td>Qual preço já com imposto, indiretos e lucro?</td>
    </tr>
    <tr>
      <td><strong>Margem de contribuição</strong></td>
      <td>Mostra quanto cada venda contribui depois dos variáveis</td>
      <td>Decidir se vale pegar o trabalho, achar o ponto de equilíbrio, comparar serviços</td>
      <td>Vale a pena? A partir de quantos por mês eu lucro?</td>
    </tr>
  </tbody>
</table>

<div style="margin:28px 0;padding:20px 22px;border:1px solid rgba(128,128,128,0.25);border-radius:14px;background:transparent">
  <p style="margin:0 0 6px;font-weight:700;font-size:18px;color:#00C597">📊 Não quer fazer essa conta na mão?</p>
  <p style="margin:0 0 14px">A planilha de precificação grátis da Dominex já tem custo-hora, BDI e margem de contribuição prontos. Você preenche os seus números (inclusive o custo total da mão de obra quando o serviço é feito por mais de uma pessoa) e ela calcula o preço, o à vista, a parcela e a margem na hora, dividindo o custo pelo BDI do jeito certo. Os percentuais (impostos, despesas e lucro) entram como % do preço.</p>
  <p style="margin:0 0 14px;font-size:14px">Copie no Google Planilhas (recomendado) ou baixe em Excel.</p>
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px">
    <a href="https://docs.google.com/spreadsheets/d/12-JPF3Ki-C9xC4FCperSDNmBrAhialHnD-N_273EQw8/copy" target="_blank" rel="noopener" style="background:#00C597;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Fazer uma cópia no Google Planilhas</a>
    <a href="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/files/quanto-cobrar-por-um-servico-precificacao/planilha-precificacao-dominex-v2.xlsx" target="_blank" rel="noopener" style="background:#0f9e7e;color:#ffffff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Baixar em Excel (.xlsx)</a>
  </div>
</div>

<h2 id="mito-da-conta">O mito da conta: multiplicar não é o mesmo que dividir</h2>

<p>Aqui está o erro que faz mais dono de empresa trabalhar de graça sem perceber, e quase ninguém te conta. Tem uma diferença gigante entre <strong>multiplicar</strong> e <strong>dividir</strong> na hora de formar preço. Os dois dão números parecidos, mas um deles te dá lucro de verdade e o outro te dá um lucro só de fachada. Vamos com números bem redondos.</p>

<h3 id="markup-vs-margem">O erro dos 50%: markup não é margem</h3>

<p>Seu custo é R$ 100 e você quer "ganhar 50%". O que quase todo mundo faz é multiplicar por 1,5:</p>

<blockquote>
  <p>R$ 100 × 1,5 = <strong>R$ 150</strong>. "Pronto, 50% de lucro."</p>
</blockquote>

<p>Errado. Você não tem 50% de lucro. Seu lucro foi de R$ 50, mas a venda foi de R$ 150. E a margem (o lucro de verdade) se mede sobre o PREÇO, não sobre o custo. Então: R$ 50 ÷ R$ 150 = <strong>33%</strong>. Você achou que ganhava metade e ganhou um terço. Esses 17 pontos que sumiram é o que vira prejuízo no fim do mês.</p>

<p>Pra ter 50% de margem DE VERDADE, você não multiplica, você <strong>divide</strong>:</p>

<blockquote>
  <p>R$ 100 ÷ 0,5 = <strong>R$ 200</strong>. Agora sim: lucro de R$ 100 sobre uma venda de R$ 200 dá 100 ÷ 200 = 50%.</p>
</blockquote>

<p>A diferença entre os dois jeitos foi R$ 50 no mesmo serviço (R$ 150 contra R$ 200). Multiplicado por todos os orçamentos do ano, é dinheiro que some do seu bolso. A tabela abaixo mostra o tamanho da pegadinha: o quanto você ACHA que está ganhando (o markup que aplica) contra o quanto REALMENTE ganha (a margem que sobra):</p>

<table>
  <thead>
    <tr><th>Markup que você aplica</th><th>Conta</th><th>Margem que você realmente tem</th></tr>
  </thead>
  <tbody>
    <tr><td>+20% (×1,2)</td><td>R$ 100 → R$ 120, lucro R$ 20 ÷ 120</td><td><strong>17%</strong></td></tr>
    <tr><td>+30% (×1,3)</td><td>R$ 100 → R$ 130, lucro R$ 30 ÷ 130</td><td><strong>23%</strong></td></tr>
    <tr><td>+50% (×1,5)</td><td>R$ 100 → R$ 150, lucro R$ 50 ÷ 150</td><td><strong>33%</strong></td></tr>
    <tr><td>+100% (×2)</td><td>R$ 100 → R$ 200, lucro R$ 100 ÷ 200</td><td><strong>50%</strong></td></tr>
  </tbody>
</table>

<p>Repare: pra ter 50% de margem você precisa DOBRAR o preço (markup de 100%), não somar 50%. Quem confunde os dois cobra sempre menos do que pensa que cobra.</p>

<h3 id="erro-bdi-somar-dividir">O erro do BDI: somar 32% não é o mesmo que dividir por 0,68</h3>

<p>O mesmo mito ataca o BDI, e aqui dói mais ainda. Digamos que o seu BDI deu 0,68. O que esse número quer dizer? Que impostos + despesas + lucro somam 32% do PREÇO de venda (porque 100% − 68% = 32%). O erro comum é pegar o custo e somar esses 32%:</p>

<blockquote>
  <p>R$ 100 × 1,32 = <strong>R$ 132</strong>. (errado)</p>
</blockquote>

<p>O certo é dividir:</p>

<blockquote>
  <p>R$ 100 ÷ 0,68 = <strong>R$ 147</strong>. (certo)</p>
</blockquote>

<p>São R$ 15 de diferença no mesmo serviço, e o R$ 132 deixa você no prejuízo. Por quê? Pense em quem cobra os 32%. O imposto da nota é cobrado sobre o valor da venda, não sobre o seu custo. A comissão do vendedor é sobre a venda. Esses percentuais incidem sobre o PREÇO, que é o número maior. Quando você multiplica (×1,32), você calcula os 32% sobre o custo, que é o número menor, e arrecada menos do que vai precisar pagar. Quando você divide (÷0,68), os 32% caem sobre o preço final, que é exatamente sobre o que eles serão cobrados. As contas batem.</p>

<p>Na prática: quem multiplica acha que embutiu o imposto e o lucro, mas embutiu uma versão encolhida deles. No fim, paga o imposto cheio do próprio bolso e descobre que o "lucro" planejado evaporou. É o jeito mais silencioso de trabalhar de graça.</p>

<div style="border-left:4px solid #00C597;background:rgba(0,197,151,0.06);border-radius:0 12px 12px 0;padding:18px 22px;margin:26px 0">
  <p style="margin:0;font-weight:600">Resumo pra não esquecer nunca mais: porcentagem de lucro, imposto e despesa que você planeja sobre a VENDA entra no preço DIVIDINDO o custo, nunca multiplicando. Multiplicar parece igual, mas sempre cobra menos do que você precisava.</p>
</div>

<p>A boa notícia é que você não precisa lembrar dessa regra na pressão do orçamento. A <a href="https://docs.google.com/spreadsheets/d/12-JPF3Ki-C9xC4FCperSDNmBrAhialHnD-N_273EQw8/copy" target="_blank" rel="noopener">planilha grátis de precificação</a> (copie no Google Planilhas ou baixe em <a href="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/files/quanto-cobrar-por-um-servico-precificacao/planilha-precificacao-dominex-v2.xlsx" target="_blank" rel="noopener">Excel</a>) e o sistema da Dominex já fazem a conta do jeito certo, dividindo o custo pelo BDI, sem risco de você errar e descobrir o prejuízo só no fim do mês.</p>

<h2 id="quanto-cobrar-por-hora">Quanto cobrar por hora de serviço?</h2>

<p>Essa é a dúvida mais digitada de todas, e a resposta direta é: pegue o custo da sua hora-técnica (que calculamos acima, R$ 32,20 no exemplo) e aplique o markup. Com o markup de 1,82 do exemplo anterior, a hora vendida fica R$ 32,20 × 1,82 ≈ <strong>R$ 58,60 por hora</strong>. Esse é o preço de hora que cobre custo, despesa fixa, imposto e lucro. Cobrar abaixo disso é decisão consciente de margem menor, não pode ser por desconhecimento.</p>

<p>Não existe "tabela nacional" de quanto cobrar por hora porque os números mudam por região, por nível técnico e pela estrutura de cada empresa. O que existe é o método: calcule o seu custo-hora, aplique o seu markup, compare com o mercado local pra checar se está dentro. Quem te der um número de hora sem perguntar os seus custos está chutando.</p>

<h2 id="por-segmento">Exemplos por segmento: eletricista, ar-condicionado, CFTV, solar, dedetização</h2>

<p>O método é o mesmo pra todos, muda o que entra na conta. Veja como cada tipo de prestador adapta:</p>

<ul>
  <li><strong>Eletricista:</strong> serviço comum (trocar disjuntor, instalar ponto) vai de markup sobre custo-hora + material. Já uma reforma elétrica completa de um prédio é obra, vai de BDI. O risco (NR-10) pode entrar como componente do BDI ou como adicional de periculosidade no custo da hora.</li>
  <li><strong>Instalador de ar-condicionado:</strong> uma visita de manutenção ou recarga de gás é markup. Uma instalação de VRF com infraestrutura é obra, vai de BDI. O gás e os insumos entram como custo variável (importante na margem de contribuição). Para empresas de climatização, vale conhecer o <a href="/sistema-para-refrigeracao">sistema para refrigeração da Dominex</a>, que organiza OS, equipamentos e orçamento num lugar só.</li>
  <li><strong>Técnico de CFTV / segurança eletrônica:</strong> manutenção e ronda são markup; o projeto de um sistema de câmeras com cabeamento é BDI. Câmeras, DVR e cabo são variáveis fortes, então a margem de contribuição é a sua melhor amiga pra saber se o projeto fecha.</li>
  <li><strong>Instalador de energia solar:</strong> a instalação do sistema fotovoltaico é obra clássica de BDI (estrutura, mão de obra especializada, risco de altura NR-35, prazo). A operação e manutenção (O&M) recorrente vai de markup.</li>
  <li><strong>Dedetização / controle de pragas:</strong> o atendimento avulso é markup; o contrato de manutenção mensal é precificado pela margem de contribuição (você quer saber quanto cada contrato contribui pra cobrir o fixo). Produtos químicos são o custo variável.</li>
</ul>

<figure>
  <img src="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/posts/quanto-cobrar-por-um-servico-precificacao/instalacao-solar-ceara.jpg" alt="Instalação de painéis de energia solar fotovoltaica no litoral do Ceará, com coqueiros ao fundo, exemplo de serviço de campo precificado por BDI quando é obra ou empreitada" loading="lazy" style="width:100%;height:auto;border-radius:12px">
  <figcaption>Instalação de porte é obra: usa BDI. Manutenção avulsa é serviço do dia a dia: usa markup. O mesmo profissional usa os dois.</figcaption>
</figure>

<h2 id="erros-comuns">Erros comuns que derretem a sua margem</h2>

<p>Esses são os furos que fazem o dono trabalhar muito e não sobrar nada:</p>

<ul>
  <li><strong>Usar o salário "por hora" cru.</strong> Esquecer encargos e horas improdutivas faz você cobrar um terço do custo real, como vimos.</li>
  <li><strong>Não embutir as despesas fixas.</strong> Aluguel, carro e contador não se pagam sozinhos. Se não estão no preço, saem do seu bolso.</li>
  <li><strong>Esquecer o imposto da nota.</strong> O ISS e o Simples saem de cima do preço de venda, não do que você imaginou que era lucro.</li>
  <li><strong>Dar desconto sem saber a margem.</strong> "10% de desconto" parece pouco, mas se a sua margem era 15%, você acabou de doar dois terços do lucro daquela venda.</li>
  <li><strong>Cobrar igual ao concorrente.</strong> A estrutura de custo dele não é a sua. Copiar preço é copiar o prejuízo dele sem saber.</li>
  <li><strong>Não cobrar deslocamento.</strong> A hora de carro do técnico custa igual à hora de trabalho. Atendimento longe sem taxa de deslocamento queima margem.</li>
  <li><strong>Orçar de cabeça e não registrar.</strong> Sem histórico de quanto custou cada serviço, você nunca corrige o preço. Por isso vale orçar em sistema, com o número saindo do custo real.</li>
</ul>

<h2 id="organizar">Como tirar isso do papel no dia a dia</h2>

<p>Saber a teoria é metade do caminho. A outra metade é aplicar em todo orçamento sem voltar a chutar. É aí que um sistema de gestão ajuda: você cadastra o custo-hora e o markup uma vez, e cada proposta já sai com o preço certo, com BDI quando é instalação, e com o material puxado do estoque. O técnico fecha a ordem de serviço no celular em campo, com foto e assinatura, e o orçamento vira OS, que vira nota, sem retrabalho.</p>

<p>A Dominex junta orçamento, proposta com BDI, ordem de serviço no app do técnico, contratos de manutenção recorrente e o financeiro num lugar só. Para quem faz manutenção programada (climatização, elevador, dedetização, CFTV), o módulo de contratos e o <a href="/sistema-pmoc">sistema de PMOC</a> transformam serviço avulso em receita recorrente, que é o que dá previsibilidade pro seu caixa.</p>

<div style="border-radius:14px;padding:26px;margin:28px 0;background:#00C597;color:#fff;text-align:center">
  <p style="font-size:20px;font-weight:700;margin:0 0 8px">Pare de orçar no chute</p>
  <p style="margin:0 0 18px;opacity:0.95">Orçamento com markup e BDI, OS no celular do técnico e financeiro num lugar só. Teste grátis por 14 dias, sem cartão.</p>
  <a href="/cadastro" style="display:inline-block;background:#fff;color:#00897B;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">Começar teste grátis</a>
  <p style="margin:16px 0 0;font-size:14px;opacity:0.95">E não esqueça da planilha de precificação grátis: <a href="https://docs.google.com/spreadsheets/d/12-JPF3Ki-C9xC4FCperSDNmBrAhialHnD-N_273EQw8/copy" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">faça uma cópia no Google Planilhas</a> ou <a href="https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/files/quanto-cobrar-por-um-servico-precificacao/planilha-precificacao-dominex-v2.xlsx" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">baixe em Excel</a> pra começar a calcular hoje.</p>
</div>

<h2 id="faq">Perguntas frequentes sobre quanto cobrar por um serviço</h2>

<h3>Como calcular o preço de um serviço?</h3>
<p>Some quatro blocos: custo direto (mão de obra + material daquele serviço), despesa fixa rateada, impostos sobre a nota e o lucro desejado. Na prática, calcule o custo da hora-técnica, some o material, e aplique um markup pra cobrir despesa, imposto e lucro de uma vez. Para obra ou instalação de porte, use BDI no lugar do markup.</p>

<h3>O que é BDI e como calcular?</h3>
<p>BDI (Benefícios e Despesas Indiretas) é o que entra no preço além do custo direto: impostos, despesas indiretas da empresa e lucro. No método que o sistema da Dominex usa, o BDI é um fator: BDI = (100 − impostos% − administração% − lucro%) ÷ 100. Depois, Preço = Custo total ÷ BDI. Exemplo: impostos 10% + administração 12% + lucro 15% = 37%, então BDI = 0,63, e um custo de R$ 100 vira R$ 100 ÷ 0,63 = R$ 158,73. O custo total inclui mão de obra, materiais e deslocamento (km × custo por km).</p>

<h3>Por que dividir e não multiplicar na hora de cobrar?</h3>
<p>Porque imposto, comissão e lucro são cobrados sobre o preço de venda, não sobre o custo. Se você multiplica o custo (ex.: R$ 100 × 1,5 = R$ 150 querendo 50%), a margem real fica em só 33%, porque R$ 50 de lucro sobre R$ 150 de venda dá 33%. Pra ter 50% de margem de verdade você divide: R$ 100 ÷ 0,5 = R$ 200. Multiplicar sempre cobra menos do que você planejou e come o seu lucro sem você perceber.</p>

<h3>Qual a diferença entre markup e margem?</h3>
<p>Markup é o quanto você acrescenta sobre o custo; margem é o quanto sobra de lucro sobre o preço de venda. Não são iguais: um markup de 50% (×1,5) dá uma margem de só 33%, e um markup de 100% (×2) é que dá 50% de margem. Confundir os dois é o erro mais comum de quem precifica e a causa de cobrar abaixo do necessário.</p>

<h3>Qual a diferença entre markup e margem de contribuição?</h3>
<p>O markup é um multiplicador que define o preço de venda já cobrindo despesas, impostos e lucro. A margem de contribuição é o que sobra de cada venda depois dos custos variáveis, e serve pra decidir se vale pegar o trabalho e pra calcular o ponto de equilíbrio (quantos serviços por mês cobrem o fixo). Um forma preço, o outro apoia decisão.</p>

<h3>Quanto cobrar por hora de trabalho?</h3>
<p>Calcule o custo real da sua hora-técnica (salário + encargos, dividido pelas horas produtivas reais, não pelas 220h do mês) e aplique o seu markup. No exemplo deste guia, o custo-hora de R$ 32,20 com markup de 1,82 resulta em cerca de R$ 58,60 por hora. Não existe valor único nacional, existe o seu número saído dos seus custos.</p>

<h3>Qual a margem de lucro ideal pra prestador de serviço?</h3>
<p>Depende do segmento e da estrutura, mas uma margem de lucro líquido entre 10% e 20% é uma referência saudável para empresas de serviço. O importante é que o lucro seja uma linha definida dentro do preço, e não "o que sobrar". Margem muito baixa não cria reserva nem paga investimento; margem alta demais te tira do mercado.</p>

<h2 id="referencias">Referências</h2>
<ul>
  <li>Sebrae. <strong>Precificação de serviços e formação de preço</strong> (custo, markup, margem de contribuição e ponto de equilíbrio). <a href="https://sebrae.com.br/sites/PortalSebrae/artigos/como-precificar-servicos" target="_blank" rel="noopener">sebrae.com.br ↗</a></li>
  <li>Sebrae. <strong>Precificação, margem de lucro e ponto de equilíbrio</strong>. <a href="https://sebraepr.com.br/comunidade/artigo/precificacao,-margem-de-lucro-e-ponto-de-equilibrio-voce-domina-esses-conceitos" target="_blank" rel="noopener">sebraepr.com.br ↗</a></li>
  <li>Presidência da República. <strong>Lei Complementar nº 116/2003</strong> (ISS, lista de serviços, alíquota mínima 2% e máxima 5%). <a href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm" target="_blank" rel="noopener">planalto.gov.br ↗</a></li>
  <li>Receita Federal. <strong>Simples Nacional</strong> (anexos, faixas e alíquotas do prestador). <a href="https://www8.receita.fazenda.gov.br/SimplesNacional/" target="_blank" rel="noopener">receita.fazenda.gov.br ↗</a></li>
  <li>Portal do Empreendedor. <strong>MEI: tributação fixa mensal</strong>. <a href="https://www.gov.br/empresas-e-negocios/pt-br/empreendedor" target="_blank" rel="noopener">gov.br/empreendedor ↗</a></li>
  <li>Tribunal de Contas da União (TCU). <strong>Acórdão 2622/2013</strong> (faixas de referência de BDI por tipo de obra). <a href="https://portal.tcu.gov.br/inicio/" target="_blank" rel="noopener">portal.tcu.gov.br ↗</a></li>
</ul>

<h2 id="creditos">Créditos das imagens</h2>
<ul>
  <li>Eletricistas trabalhando em Belo Horizonte (MG), Brasil: foto de Andrevruas, via Wikimedia Commons, licença <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>. <a href="https://commons.wikimedia.org/wiki/File:Eletricistas.JPG" target="_blank" rel="noopener">Ver original ↗</a></li>
  <li>Instalação de energia solar fotovoltaica em Baleia (CE), Brasil: foto de Riosolar, via Wikimedia Commons, licença <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. <a href="https://commons.wikimedia.org/wiki/File:PV_installation_for_fish_cooling_in_Baleia_CE.jpg" target="_blank" rel="noopener">Ver original ↗</a></li>
</ul>
$html$,
excerpt = $html$Não sabe quanto cobrar pelo seu serviço? Aprenda a calcular o custo da hora-técnica, a montar o preço com lucro de verdade e as 3 formas de precificar (BDI, markup e margem de contribuição), com fórmula, exemplo numérico e planilha grátis pra baixar.$html$,
meta_title = $html$Quanto cobrar por um serviço: como calcular o preço da mão de obra | Guia + planilha grátis$html$,
meta_description = $html$Como precificar um serviço sem trabalhar de graça: custo da hora-técnica passo a passo, os 4 blocos do preço, BDI, markup e margem de contribuição (com fórmula e exemplo). Vale pra eletricista, refrigerista, instalador solar, CFTV e mais. Planilha grátis.$html$,
category = 'Gestão de Campo',
cover_image_url = $html$https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/blog-images/covers/quanto-cobrar-por-um-servico-precificacao-cover.svg$html$
WHERE slug = 'quanto-cobrar-por-um-servico-precificacao';
