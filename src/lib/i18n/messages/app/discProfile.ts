// i18n do APP — domínio PERFIL COMPORTAMENTAL (DISC).
//
// REGRA: cobre a TELA PÚBLICA (typeform, sem login), os rótulos dos gráficos, o
// texto dos 28 itens Likert (por id), e os INSIGHTS por perfil (puros + combinados).
// Consumido por:
//   • lib/disc/questions.ts → items[id] (texto da afirmação)
//   • lib/disc/profiles.ts  → profiles[code].{nome, ...}
//   • telas/gráficos        → ui / scale / factors / disclaimer / charts
//
// IP: itens derivados de IPIP/ODAT (domínio público) + adjetivos genéricos.
// NUNCA copiar questionário/relatório de marca (DiSC®/Insights/TTI).
// Tradução SEMÂNTICA por termo de mercado de cada idioma (régua CEO), não literal:
//   D Dominância/Dominance/Dominancia/Dominance · I Influência/Influence/Influencia/Influence
//   S Estabilidade/Steadiness/Estabilidad/Stabilité · C Conformidade/Compliance/Conformidad/Conformité
// pt-br é a FONTE (byte-completa); en/es/fr caem no pt-br via deepMerge se faltar chave.
// Copy PT-BR sem travessão (—): usar vírgula.

export const discProfile = {
  // ═══════════════════════════════════════════════════════════════════════════
  // pt-br — FONTE DA VERDADE
  // ═══════════════════════════════════════════════════════════════════════════
  'pt-br': {
    // ── Tela pública (typeform) ──────────────────────────────────────────────
    ui: {
      introTitle: 'Teste de Perfil Comportamental (DISC)',
      introLead:
        'Leva cerca de 5 minutos. Responda pensando no seu dia a dia.',
      introStart: 'Começar',
      back: 'Voltar',
      next: 'Avançar',
      submit: 'Enviar respostas',
      submitting: 'Enviando...',
      progress: 'Pergunta {current} de {total}',
      thanksTitle: 'Obrigado!',
      thanksLead:
        'Suas respostas foram registradas. A equipe de RH receberá o seu perfil.',
      alreadyDoneTitle: 'Respostas já enviadas',
      alreadyDoneLead:
        'Este questionário já foi respondido. Fale com o RH se precisar refazer.',
      loadError: 'Não foi possível carregar o questionário. Tente novamente.',
      resultTitle: 'Seu perfil comportamental',
      greeting: 'Olá, {name}!',
      assessmentDisclaimer:
        'Responda com sinceridade: não marque como você gostaria de ser ou o que acha que é o "certo", e sim o que é mais parecido com você de verdade.',
      instructionsTitle: 'Como funciona',
      instructionsHowto:
        'São 28 afirmações sobre o seu jeito de agir. Leva cerca de 5 minutos.',
      instructionsDrag:
        'Arraste a barra: direita se tem tudo a ver com você, esquerda se não tem nada a ver, centro se é neutro.',
      instructionsHonest:
        'Não existe resposta certa ou errada, nem perfil melhor ou pior. Responda pensando no que é mais parecido com você de verdade.',
      aboutProfileTitle: 'Sobre o seu perfil',
    },

    // ── Escala Likert 1–5 ────────────────────────────────────────────────────
    scale: {
      1: 'Nada a ver comigo',
      2: 'Discordo em parte',
      3: 'Neutro',
      4: 'Concordo em parte',
      5: 'Tudo a ver comigo',
      lowAnchor: 'Nada a ver comigo',
      highAnchor: 'Tudo a ver comigo',
    },

    // ── Fatores (rótulos dos eixos e gráficos) ───────────────────────────────
    factors: {
      D: {
        name: 'Dominância',
        short: 'D',
        tagline: 'Foco em resultado e ação',
        description:
          'Mede o quanto a pessoa assume o comando, decide rápido e vai atrás do resultado, mesmo correndo risco. Um D alto gosta de desafio, confronto direto e de estar no controle.',
        example:
          'Costuma ser associado a Steve Jobs, pela visão forte, a decisão rápida e a obsessão pelo resultado.',
      },
      I: {
        name: 'Influência',
        short: 'I',
        tagline: 'Foco em pessoas e energia',
        description:
          'Mede o quanto a pessoa se conecta, entusiasma e convence os outros. Um I alto traz energia para o grupo, gosta de gente e movimenta o ambiente com otimismo.',
        example:
          'Costuma ser associado a Oprah Winfrey, pelo carisma, a conexão com as pessoas e o poder de engajar quem está por perto.',
      },
      S: {
        name: 'Estabilidade',
        short: 'S',
        tagline: 'Foco em harmonia e constância',
        description:
          'Mede o quanto a pessoa preza pela constância, pela harmonia e pela previsibilidade. Um S alto é paciente, leal, ótimo ouvinte e sustenta o time no longo prazo.',
        example:
          'Costuma ser associado a Warren Buffett, pela paciência, a constância e a visão de longo prazo.',
      },
      C: {
        name: 'Conformidade',
        short: 'C',
        tagline: 'Foco em qualidade e critério',
        description:
          'Mede o quanto a pessoa se guia por dados, regras e padrão de qualidade. Um C alto analisa com calma, cuida do detalhe e decide com base em fatos, não no impulso.',
        example:
          'Costuma ser associado a Bill Gates, pela análise, o método e o rigor técnico apoiado em dados.',
      },
    },

    // ── Rótulos dos gráficos ─────────────────────────────────────────────────
    charts: {
      barTitle: 'Gráfico DISC',
      radarTitle: 'Competências Comportamentais',
      wheelTitle: 'Roda de estilo',
      average: 'Média',
      wheelCenter: 'Adaptável',
      wheelEdge: 'Marcante',
      score: 'Escore',
    },

    // ── Atributos do mapa de atributos (8 dimensões do radar) ───────────────
    attributes: {
      proactivity: 'Proatividade',
      resultsFocus: 'Foco em resultados',
      leadership: 'Liderança',
      communication: 'Comunicação',
      teamwork: 'Trabalho em equipe',
      patience: 'Paciência',
      discipline: 'Disciplina',
      attentionToDetail: 'Atenção a detalhes',
    },

    // ── Competências Comportamentais (16 dimensões do novo radar) ───────────
    competencies: {
      competitiveness: 'Competitividade',
      agility: 'Agilidade',
      confidence: 'Confiança',
      energy: 'Energia',
      flexibility: 'Flexibilidade',
      influence: 'Influência',
      creativity: 'Criatividade',
      consistency: 'Consistência',
      communication: 'Comunicação',
      empathy: 'Empatia',
      planning: 'Planejamento',
      patience: 'Paciência',
      analysis: 'Análise',
      judgment: 'Critério',
      security: 'Segurança',
      discipline: 'Disciplina',
    },

    // ── Seções de insight (títulos dos blocos do relatório) ──────────────────
    sections: {
      qualidades: 'Qualidades',
      pontosDeAtencao: 'Pontos de atenção',
      comoLiderar: 'Como liderar e comunicar',
      oQueEvitar: 'O que evitar',
      comunicacaoIdeal: 'Comunicação ideal',
      ondeBrilha: 'Onde brilha',
      sobEstresse: 'Sob estresse',
      profileHeading: 'Perfil {code}',
    },

    disclaimer:
      'Esta é uma ferramenta de autoconhecimento e comunicação de equipe. Não é um teste clínico nem um diagnóstico. Nenhum perfil é melhor ou pior que outro.',

    // ── Texto dos 48 itens (por id) ──────────────────────────────────────────
    items: {
      d1: 'Gosto de assumir o comando das situações.',
      d2: 'Pressiono para que as coisas aconteçam no ritmo que quero.',
      d3: 'Vou direto ao ponto, mesmo que soe duro.',
      d4: 'Gosto de competir e de vencer.',
      d5: 'Tomo decisões rápido, mesmo correndo algum risco.',
      d6: 'Prefiro ceder a entrar em confronto.',
      d7: 'Tenho dificuldade de dizer não.',
      d8: 'Assumo riscos para alcançar um objetivo.',
      d9: 'Gosto de desafios difíceis.',
      d10: 'Falo o que penso, sem rodeios.',
      d11: 'Prefiro que outra pessoa tome as decisões difíceis.',
      d12: 'Foco no resultado mesmo sob pressão.',
      i1: 'Faço amizade com pessoas novas com facilidade.',
      i2: 'Gosto de ser o centro das atenções.',
      i3: 'Sou entusiasmado e contagio as pessoas ao meu redor.',
      i4: 'Prefiro conversar e trocar ideias a trabalhar sozinho.',
      i5: 'Mantenho o otimismo mesmo diante de problemas.',
      i6: 'Num grupo grande, prefiro ficar mais quieto.',
      i7: 'Falo pouco sobre mim mesmo.',
      i8: 'Gosto de conhecer gente nova.',
      i9: 'Convenço as pessoas com facilidade.',
      i10: 'Trago bom humor para o ambiente.',
      i11: 'Prefiro trabalhar sozinho a trabalhar em grupo.',
      i12: 'Me empolgo com ideias novas.',
      s1: 'Tenho paciência com processos demorados.',
      s2: 'Prefiro rotina e previsibilidade a surpresas.',
      s3: 'Ouço com atenção antes de me posicionar.',
      s4: 'Evito conflitos para manter a harmonia do grupo.',
      s5: 'Sou leal e constante com quem confio.',
      s6: 'Gosto quando os planos mudam de repente.',
      s7: 'Fico impaciente quando as coisas demoram.',
      s8: 'Mantenho a calma em situações tensas.',
      s9: 'Ajudo os colegas quando precisam.',
      s10: 'Prefiro um ambiente estável e sem surpresas.',
      s11: 'Gosto de assumir riscos e mudanças.',
      s12: 'Sou o primeiro a acalmar um conflito.',
      c1: 'Reparo em detalhes que a maioria não percebe.',
      c2: 'Gosto de tudo organizado e em ordem.',
      c3: 'Confiro o meu trabalho mais de uma vez.',
      c4: 'Prefiro seguir regras e procedimentos claros.',
      c5: 'Analiso os dados com calma antes de decidir.',
      c6: 'Costumo decidir no impulso, sem muita análise.',
      c7: 'Não me incomodo com pequenos erros.',
      c8: 'Sigo checklists e procedimentos à risca.',
      c9: 'Reviso o trabalho para evitar erros.',
      c10: 'Prefiro qualidade a velocidade.',
      c11: 'Não me importo muito com detalhes.',
      c12: 'Baseio minhas decisões em fatos e números.',
      d13: 'Gosto de assumir o comando e conduzir as pessoas nas situações.',
      d14: 'Tomo decisões rápidas, muitas vezes sozinho.',
      i13: 'Sou animado e me solto fácil quando estou com outras pessoas.',
      i14: 'Convenço e engajo as pessoas com facilidade.',
      s13: 'Escuto com atenção e me coloco no lugar do outro.',
      s14: 'Prefiro seguir planos com calma e constância até o fim.',
      c13: 'Capricho nos detalhes e gosto de tempo para entregar com precisão.',
      c14: 'Sigo procedimentos bem definidos para manter o controle.',
    },

    // ── Insights por perfil ──────────────────────────────────────────────────
    profiles: {
      D: {
        nome: 'O Executor',
        biografia:
          'Você é do tipo que assume o comando sem esperar autorização. Onde os outros veem um problema difícil, você vê um alvo, e vai atrás dele com uma pressa que contagia e às vezes assusta. Decide rápido, fala direto e prefere um erro corrigível a ficar parado esperando a certeza perfeita. Num time, você costuma ser o motor: quando a energia cai, é você que puxa todo mundo de volta para o resultado.\n\nA sua força é justamente essa coragem de decidir e a disposição para o confronto que a maioria evita. Mas o mesmo traço que destrava também atropela: no impulso de entregar, você pode passar por cima das pessoas, cortar quem está falando e tratar a lentidão dos outros como má vontade. Nem sempre é, e reconhecer isso é o que separa um chefe temido de um líder respeitado.\n\nVocê rende mais quando tem uma meta clara, autonomia sobre o caminho e um adversário à altura. O cuidado é lembrar que resultado que queima a equipe no meio não se sustenta. Aprender a perguntar antes de mandar, e a ouvir antes de decidir, multiplica a sua já natural capacidade de fazer as coisas acontecerem.',
        qualidades: [
          'Assume o comando de uma situação travada sem esperar que peçam, e destrava o grupo',
          'Decide rápido mesmo com informação incompleta, evitando que o time fique parado esperando',
          'Fala o que precisa ser dito de forma direta, sem rodeios que atrasam a conversa',
          'Não recua diante de confronto ou de meta difícil, encara o desafio de frente',
          'Mantém o foco no resultado mesmo quando a pressão sobe e os outros começam a titubear',
        ],
        pontosDeAtencao: [
          'No afã de entregar, atropela quem está ao lado e deixa a equipe desmotivada',
          'Corta a fala dos outros e decide antes de ouvir o time todo',
          'Trata processos e cuidados necessários como perda de tempo',
          'Impaciência com o ritmo alheio vira aspereza e desgasta relações',
          'Assume risco demais por confiar só no próprio instinto, sem checar o dado',
        ],
        comoLiderar: [
          'Dê metas claras e deixe a pessoa livre para escolher o "como"',
          'Cobre pelo resultado, não pelo caminho, e evite a microgerência que ela detesta',
          'Seja objetivo e vá direto ao ponto, sem introdução longa',
          'Ofereça desafios reais e reconhecimento por entregas difíceis vencidas',
          'Aponte o impacto nas pessoas de forma factual, para ela enxergar o custo humano da pressa',
        ],
        oQueEvitar: ['Ambiguidade', 'Decisão lenta', 'Rodeios', 'Microgerência'],
        comunicacaoIdeal:
          'Direta e objetiva, com prazo e meta logo na frente. Vá ao ponto, traga a decisão a ser tomada e evite a introdução longa que faz a pessoa desligar.',
        ondeBrilha: [
          'Liderança de projeto com prazo apertado e meta agressiva',
          'Negociações duras em que é preciso segurar a posição',
          'Momentos de crise, quando a maioria congela e alguém precisa decidir',
          'Abertura de frente nova, do zero, sem processo pronto',
          'Viradas de operação que exigem cortar o que não funciona rápido',
        ],
        sobEstresse:
          'Fica mais controlador e ríspido, tenta retomar o comando de tudo e passa por cima de quem estiver no caminho. A pressa vira impaciência aberta.',
      },
      I: {
        nome: 'O Comunicador',
        biografia:
          'Você é do tipo que ilumina o ambiente ao chegar. Faz amizade com facilidade, puxa conversa com quem acabou de conhecer e transforma um grupo quieto num time animado em poucos minutos. As suas ideias vêm em rajadas, e o seu entusiasmo é genuíno o bastante para contagiar até os mais céticos. Quando é preciso vender uma ideia, engajar gente ou reacender a moral de uma equipe cansada, poucos fazem isso tão bem quanto você.\n\nA sua força é essa capacidade rara de conectar e mobilizar pessoas. O outro lado é que, no calor da empolgação, você começa muita coisa e termina pouca, foge do detalhe chato e às vezes promete mais do que consegue cumprir só para agradar. O reconhecimento te move tanto que uma crítica seca pode te derrubar mais do que deveria, e o isolamento te esvazia rápido.\n\nVocê rende mais em ambientes com gente, movimento e visibilidade, e trabalha melhor ao lado de alguém organizado que segure o detalhe que você deixa passar. O cuidado é aprender a fechar o que abre e a separar o entusiasmo do compromisso: uma promessa cumprida vale mais do que dez discursos animados. Dosar a energia com foco transforma o seu carisma em resultado real.',
        qualidades: [
          'Constrói relação com quase qualquer pessoa em minutos e abre portas para o time',
          'Contagia a equipe com entusiasmo genuíno e reacende a moral quando ela cai',
          'Gera ideias novas em rajada e enxerga possibilidades que os outros não veem',
          'Convence e engaja com naturalidade, vendendo uma ideia internamente com facilidade',
          'Traz leveza e bom humor que tornam o ambiente agradável de trabalhar',
        ],
        pontosDeAtencao: [
          'Começa muitos projetos ao mesmo tempo e termina poucos',
          'Foge do detalhe e do trabalho árido, deixando lacunas que aparecem depois',
          'Promete mais do que consegue entregar para agradar no momento',
          'Dispersa a atenção com facilidade e perde o foco da semana',
          'Sofre demais com crítica seca e busca aprovação de forma que atrapalha a decisão',
        ],
        comoLiderar: [
          'Dê reconhecimento público pelas entregas, é o que mais motiva essa pessoa',
          'Pareie com alguém organizado que cuide do detalhe e do acompanhamento',
          'Ajude a manter o foco em poucas prioridades por vez',
          'Traga crítica sempre junto de reconhecimento, nunca só a correção',
          'Aterrisse as promessas dela em prazos e entregas concretas',
        ],
        oQueEvitar: [
          'Excesso de regras e detalhe',
          'Crítica sem reconhecimento',
          'Isolamento',
        ],
        comunicacaoIdeal:
          'Calorosa e com espaço para falar, valorizando as ideias da pessoa. Comece pelo reconhecimento antes de cobrar, porque ela trava quando sente frieza logo de cara.',
        ondeBrilha: [
          'Vendas e atendimento, onde a relação abre a conversa',
          'Relacionamento com cliente e parceiros no longo prazo',
          'Marketing, eventos e lançamentos que pedem energia',
          'Integração de time novo e melhora do clima',
          'Apresentações em que é preciso encantar e convencer a plateia',
        ],
        sobEstresse:
          'Fala demais, busca aprovação e se dispersa ainda mais. Sofre quando fica isolado e pode prometer o impossível só para aliviar a tensão do momento.',
      },
      S: {
        nome: 'O Apoiador',
        biografia:
          'Você é do tipo que sustenta o time por dentro, sem precisar aparecer. Tem paciência com o que demora, lealdade com quem confia e uma calma que acalma os outros nos momentos tensos. Enquanto os holofotes vão para quem grita mais alto, é o seu cuidado silencioso com o clima e com as pessoas que segura a operação de pé, especialmente nas fases difíceis.\n\nA sua força está na constância e na escuta: você ouve de verdade antes de se posicionar, ajuda o colega que precisa e entrega com uma regularidade em que a liderança pode confiar de olhos fechados. O outro lado é que, para preservar a harmonia, você evita o conflito mesmo quando ele é necessário, guarda insatisfações caladas até virarem desgaste e resiste a mudanças bruscas que caem de surpresa.\n\nVocê rende mais num ambiente estável, com aviso prévio das mudanças e com o seu papel reconhecido. O cuidado é aprender a falar o desconforto na hora, em vez de engolir, e a bancar a decisão difícil quando ela for sua. Dizer o que pensa, mesmo correndo o risco de um pequeno atrito, protege a relação a longo prazo muito mais do que o silêncio.',
        qualidades: [
          'Mantém a calma e acalma os outros em situações tensas, estabilizando o grupo',
          'Ouve com atenção de verdade antes de se posicionar, e as pessoas se sentem acolhidas',
          'É leal e constante com quem confia, entregando com regularidade previsível',
          'Cuida do clima e ajuda o colega em dificuldade sem esperar pedirem',
          'Sustenta rotinas longas sem perder o padrão, ideal para funções de continuidade',
        ],
        pontosDeAtencao: [
          'Evita o conflito mesmo quando ele é necessário, deixando problemas crescerem',
          'Guarda insatisfações caladas até que virem desgaste ou mágoa',
          'Resiste a mudanças bruscas e demora para aderir ao novo',
          'Se sobrecarrega em silêncio, sem pedir ajuda a tempo',
          'Demora a decidir quando a escolha exige bancar algo impopular',
        ],
        comoLiderar: [
          'Avise mudanças com antecedência, ela entrega muito mais quando não é pega de surpresa',
          'Inclua nas decisões e pergunte a opinião antes de fechar',
          'Valorize a lealdade e a constância, que costumam passar despercebidas',
          'Crie espaço seguro para ela dizer o que está incomodando',
          'Dê apoio explícito quando precisar bancar uma decisão difícil',
        ],
        oQueEvitar: [
          'Mudança brusca sem aviso',
          'Cobrança em público',
          'Pressa',
          'Confronto direto',
        ],
        comunicacaoIdeal:
          'Calma e próxima, mostrando como a mudança ajuda o time e garantindo que a pessoa se sinta ouvida. Baixe o tom, dê tempo e pergunte a opinião antes de decidir.',
        ondeBrilha: [
          'Suporte e atendimento que exigem paciência e escuta',
          'RH e pós-venda, mantendo o vínculo no longo prazo',
          'Funções de continuidade em que a constância vale mais que a velocidade',
          'Estabilização de um time desgastado ou em conflito',
          'Rotinas críticas que não podem oscilar de um dia para o outro',
        ],
        sobEstresse:
          'Recua e busca segurança, o conflito o paralisa. Absorve a tensão de todos calado e guarda a insatisfação em vez de colocar o problema na mesa.',
      },
      C: {
        nome: 'O Analista',
        biografia:
          'Você é do tipo que repara no detalhe que a maioria deixa passar. Antes de decidir, junta os dados, confere mais de uma vez e só assina embaixo quando o que entrega está no padrão que você mesmo cobra, que costuma ser alto. Onde os outros improvisam, você tem método, e é justamente esse rigor que faz o time confiar que o que passou pelas suas mãos está certo.\n\nA sua força é a qualidade e a profundidade: você é especialista no que faz, eleva a régua de tudo que toca e é confiável nas entregas críticas que não podem falhar. O outro lado é que o perfeccionismo pode travar a entrega em busca de uma certeza que nunca chega, o trato às vezes soa frio e a crítica, dura demais, tanto com os outros quanto consigo. Pressa sem aviso te desestabiliza mais do que a maioria imagina.\n\nVocê rende mais com critérios claros, dados confiáveis e tempo para fazer bem feito. O cuidado é combinar antes o que é "bom o suficiente" e aceitar que, em certos momentos, entregar no prazo vale mais do que perseguir o perfeito. Trazer o reconhecimento junto da correção, e um pouco de calor humano ao contato, faz o seu rigor render sem afastar as pessoas.',
        qualidades: [
          'Repara em detalhes e riscos que a maioria não percebe, evitando erros caros',
          'Decide com base em fatos e dados, não no impulso, e sustenta a escolha',
          'Confere o próprio trabalho antes de soltar, com índice de erro baixíssimo',
          'Eleva o padrão de qualidade de tudo que passa pelas suas mãos',
          'É especialista confiável no que faz, referência técnica para o time',
        ],
        pontosDeAtencao: [
          'O perfeccionismo trava a entrega em busca de uma certeza que não chega',
          'O trato mais frio pode afastar as pessoas e soar distante',
          'A crítica sai dura demais, consigo mesmo e com os outros',
          'Pressa e prazo apertado sem aviso o desestabilizam',
          'Pode se perder no detalhe mínimo enquanto o prazo geral aperta',
        ],
        comoLiderar: [
          'Dê critérios e dados claros, ela decide melhor quando o terreno está mapeado',
          'Permita trabalho independente e respeite a autonomia técnica',
          'Traga feedback específico e gentil, não vago nem duro',
          'Combine antes o que é "bom o suficiente" para evitar a paralisia',
          'Avise prazos com antecedência, o susto de última hora a trava',
        ],
        oQueEvitar: [
          'Instrução vaga',
          'Prazo apertado sem aviso',
          'Crítica dura',
          'Improviso',
        ],
        comunicacaoIdeal:
          'Baseada em fatos, de preferência por escrito, com contexto e antecedência. Traga o dado que sustenta o pedido e dê tempo para a pessoa processar antes de exigir a decisão.',
        ondeBrilha: [
          'Análise e controle de qualidade que não toleram erro',
          'Financeiro, processos e auditoria, onde o critério é tudo',
          'Documentação técnica e normas que exigem precisão',
          'Tarefas críticas em que uma falha custa caro',
          'Revisão e conferência do trabalho dos outros',
        ],
        sobEstresse:
          'Busca mais dados e regras e paralisa por medo de errar. Fecha-se no detalhe, endurece a crítica e rejeita qualquer atalho que não esteja comprovado.',
      },
      DI: {
        nome: 'O Impulsionador',
        biografia:
          'Você é do tipo que junta a ambição de quem quer resultado com o carisma de quem sabe arrastar gente. Define a meta, sobe no palco e mobiliza a equipe numa velocidade que poucos acompanham. Onde falta ânimo, você põe energia; onde falta rumo, você aponta a direção. É um perfil feito para viradas, lançamentos e ambientes dinâmicos em que é preciso decidir rápido e engajar ao mesmo tempo.\n\nA sua força é essa rara combinação de foco no resultado com poder de influência: você não só sabe onde quer chegar, como consegue fazer o time querer chegar junto. O outro lado é que você atropela e dispersa ao mesmo tempo, promete além do que o time consegue entregar e perde a paciência com o detalhe que sustenta a promessa. No entusiasmo, é fácil assumir mais frentes do que dá para fechar.\n\nVocê rende mais com palco, meta ambiciosa e visibilidade, ao lado de alguém que cuide do detalhe que você deixa passar. O cuidado é aterrissar a empolgação em compromissos realistas e cobrar de si o foco no que já foi prometido, antes de abrir a próxima frente. Menos ideias soltas e mais apostas fechadas transformam o seu impulso em resultado que dura.',
        qualidades: [
          'Define a meta e mobiliza o time por trás dela numa velocidade rara',
          'Combina foco no resultado com poder de engajar e vender a ideia',
          'Traz energia que reacende a moral e faz a operação andar rápido',
          'Comunica direto, mas com calor, sem soar frio como um D puro',
          'Encara viradas e lançamentos com coragem e entusiasmo ao mesmo tempo',
        ],
        pontosDeAtencao: [
          'Atropela as pessoas e dispersa a atenção ao mesmo tempo',
          'Promete além do que o time consegue entregar no prazo',
          'Perde a paciência com o detalhe que sustenta a própria promessa',
          'Assume mais frentes do que consegue fechar, no calor da empolgação',
          'Acelera tanto que deixa a equipe sem fôlego para acompanhar',
        ],
        comoLiderar: [
          'Dê palco e metas ambiciosas, é onde essa pessoa se acende',
          'Pareie com quem cuida do detalhe e do acompanhamento',
          'Cobre foco no que já foi prometido antes de abrir nova frente',
          'Aterrisse as promessas em prazos e entregas realistas',
          'Reconheça publicamente as viradas vencidas',
        ],
        oQueEvitar: ['Rotina', 'Lentidão', 'Ambiente sem visibilidade'],
        comunicacaoIdeal:
          'Objetiva e animada, com meta ambiciosa e reconhecimento no caminho. Traga o desafio grande logo de cara e mostre a visibilidade que a entrega gera.',
        ondeBrilha: [
          'Ambientes dinâmicos com visibilidade e meta agressiva',
          'Liderança comercial e times de vendas',
          'Lançamentos e campanhas que pedem energia e rumo',
          'Viradas de operação com prazo curto',
          'Mobilização de equipe desanimada em torno de um objetivo',
        ],
        sobEstresse:
          'Acelera demais e assume mais do que consegue entregar. Fala mais alto, empurra mais forte e ignora os sinais de que o time já não acompanha o ritmo.',
      },
      ID: {
        nome: 'O Persuasor',
        biografia:
          'Você é do tipo que primeiro encanta e depois empurra. Chega cheio de energia social, ganha as pessoas na conversa e, uma vez conquistado o grupo, usa essa influência para criar movimento e fazer as coisas acontecerem. É um perfil de alto impacto, feito para vender, apresentar e captar, em situações onde convencer vale tanto quanto entregar.\n\nA sua força é a capacidade de mobilizar rápido: você abre portas com o carisma e as atravessa com a assertividade. O outro lado é que, no entusiasmo de convencer, você promete além do que entrega, foge do detalhe e às vezes soa exagerado, insistindo na persuasão mesmo quando os sinais dizem que é hora de recuar. O reconhecimento te move, e sem ele a energia esvazia.\n\nVocê rende mais em ambientes com gente, movimento e metas de impacto, longe da rotina estática e do trabalho solitário. O cuidado é ancorar as promessas em prazos concretos e ler o momento de parar de empurrar. Saber a hora de recuar, e cumprir o que prometeu no calor da conversa, transforma o seu talento de convencer em confiança de longo prazo.',
        qualidades: [
          'Ganha o grupo na conversa e depois usa a relação para gerar movimento',
          'Convence com alta energia social e cria momentum onde havia inércia',
          'Abre portas com o carisma e as atravessa com assertividade',
          'É forte em vendas de impacto e apresentações que precisam empolgar',
          'Reacende a energia do ambiente e puxa as pessoas para a ação',
        ],
        pontosDeAtencao: [
          'Promete além do que consegue entregar no calor da conversa',
          'Foge do detalhe que sustenta a promessa feita',
          'Pode soar exagerado e perder credibilidade com perfis mais céticos',
          'Insiste na persuasão mesmo quando é hora de recuar',
          'Esvazia quando falta reconhecimento e movimento',
        ],
        comoLiderar: [
          'Reconheça em público, é o combustível principal dessa pessoa',
          'Aterrisse as promessas em prazos e entregas concretas',
          'Dê metas de impacto e visibilidade, evite a rotina que a apaga',
          'Ajude a ler o momento de parar de empurrar',
          'Pareie com quem sustente o detalhe que ela deixa passar',
        ],
        oQueEvitar: ['Ambiente estático', 'Excesso de regras', 'Trabalho solitário'],
        comunicacaoIdeal:
          'Calorosa e direta, com espaço pra convencer e uma meta clara no fim. Reconheça primeiro, depois traga o desafio de impacto que a mobiliza.',
        ondeBrilha: [
          'Vendas de impacto em que convencer é metade do jogo',
          'Apresentações e pitches que precisam empolgar a plateia',
          'Captação e prospecção que exigem abrir portas',
          'Mobilização rápida de um grupo em torno de uma ideia',
          'Reativação de clientes ou parceiros esfriados',
        ],
        sobEstresse:
          'Insiste na persuasão e ignora sinais de que é hora de recuar. Fala mais, promete mais e empurra mais forte, mesmo quando o grupo já não está comprando.',
      },
      DC: {
        nome: 'O Desafiador',
        biografia:
          'Você é do tipo que quer o resultado, mas não a qualquer custo: quer o resultado no padrão certo. Combina a assertividade de quem decide rápido com o rigor de quem não solta nada abaixo do nível. Onde um perfil só cobra prazo e outro só cobra qualidade, você cobra os dois, e é justamente essa exigência dupla que faz o seu trabalho ser referência.\n\nA sua força é entregar resultado com padrão alto ao mesmo tempo, algo raro num perfil só: você tem a coragem de agir e o critério de agir certo. O outro lado é que essa mesma exigência vira dureza. Você cobra demais, tem pouca paciência com o erro e, quando algo sai abaixo do que você considera aceitável, quer refazer tudo até ficar perfeito, mesmo quando o prazo não permite.\n\nVocê rende mais em projetos exigentes, gestão técnica e situações onde resultado e qualidade não podem ser negociados um pelo outro. O cuidado é reconhecer que nem todo detalhe justifica travar a entrega, e que a equipe rende mais com reconhecimento do que só com cobrança. Combinar antes o que é inegociável e o que pode ceder pelo prazo evita que a sua exigência trave o que deveria destravar.',
        qualidades: [
          'Cobra resultado e qualidade ao mesmo tempo, elevando o nível da entrega',
          'Une a coragem de agir com o critério de agir certo',
          'Mantém padrão alto e não solta nada abaixo do nível aceitável',
          'É estratégico e exigente, pensando no resultado e no risco juntos',
          'Freia erros evitáveis antes que virem prejuízo',
        ],
        pontosDeAtencao: [
          'Cobra demais e tem pouca paciência com o erro do outro',
          'Quer refazer tudo até a perfeição, mesmo sem prazo para isso',
          'Duro e perfeccionista ao mesmo tempo, desgasta a equipe',
          'Pode travar a entrega por não aceitar o "bom o suficiente"',
          'O trato direto demais soa como frieza sob pressão',
        ],
        comoLiderar: [
          'Traga metas claras e critérios objetivos, ela decide melhor com padrão definido',
          'Respeite a autonomia técnica e o padrão alto que ela sustenta',
          'Reconheça a qualidade entregue, não só cobre a próxima',
          'Combine antes o que é inegociável e o que cede pelo prazo',
          'Aponte de forma factual quando a exigência está travando a entrega',
        ],
        oQueEvitar: ['Ambiguidade', 'Baixo padrão', 'Improviso'],
        comunicacaoIdeal:
          'Direta e fundamentada, com dados e um resultado claro na frente. Traga o critério objetivo e o padrão esperado, sem ambiguidade que ela não tolera.',
        ondeBrilha: [
          'Projetos exigentes que precisam de resultado com qualidade',
          'Gestão técnica em que o padrão não pode cair',
          'Situações que exigem decisão rápida sem abrir mão do critério',
          'Controle de qualidade com prazo apertado',
          'Frentes que travariam por falta de rigor ou de coragem',
        ],
        sobEstresse:
          'Fica crítico e controlador, quer refazer tudo até ficar perfeito. Endurece o trato, cobra ainda mais e trava a entrega em busca do padrão ideal.',
      },
      CD: {
        nome: 'O Realizador',
        biografia:
          'Você é do tipo que decide, mas só depois de olhar o dado. Primeiro analisa, junta os fatos e forma um critério; então age com firmeza, sem hesitar. Onde uns decidem no instinto e outros travam na análise, você combina os dois lados: tem o rigor de quem confere e a decisão de quem executa. É um perfil feito para decisão técnica, controle e situações em que errar custa caro.\n\nA sua força é essa firmeza fundamentada: você não age no escuro nem paralisa esperando a certeza absoluta. Executa com rigor e sustenta a decisão nos números. O outro lado é que você pode ser frio e impaciente com o "achismo" alheio, travar por excesso de análise quando o dado não fecha e ter um trato direto demais, que soa duro para quem esperava mais tato.\n\nVocê rende mais com dados confiáveis, autonomia para decidir por critério e sem pressão emocional em cima. O cuidado é lembrar que nem toda decisão espera o dado perfeito, e que as pessoas ao redor precisam de um pouco mais de calor do que de precisão. Aceitar agir com informação incompleta em certos momentos, e suavizar o contato, faz o seu rigor render sem afastar o time.',
        qualidades: [
          'Analisa o dado e depois age com firmeza, sem hesitar na decisão',
          'Combina o rigor de quem confere com a decisão de quem executa',
          'Sustenta a escolha em fatos e números, não em impulso',
          'Executa com rigor tarefas que não toleram erro',
          'Traz critério para decisões de risco, reduzindo o erro impulsivo',
        ],
        pontosDeAtencao: [
          'Frio e impaciente com o "achismo" dos outros',
          'Pode travar por excesso de análise quando o dado não fecha',
          'O trato direto demais soa duro para quem esperava mais tato',
          'Rejeita o que não está comprovado, mesmo sob prazo apertado',
          'Fecha-se nos números e perde a leitura das pessoas',
        ],
        comoLiderar: [
          'Traga dados confiáveis, ela decide melhor com a informação na mão',
          'Deixe decidir com base em critério, sem pressão emocional',
          'Evite cobrar decisão no grito, o dado ruim a trava mais que a pressa',
          'Dê autonomia técnica e reconheça a solidez da análise',
          'Peça que traga a conclusão antes do detalhamento, para agilizar',
        ],
        oQueEvitar: ['Decisão emocional', 'Dado ruim', 'Falta de critério'],
        comunicacaoIdeal:
          'Objetiva e baseada em fatos, com números que sustentem a decisão. Traga a conclusão e os dados que a apoiam, sem apelo emocional que ela desconsidera.',
        ondeBrilha: [
          'Finanças e engenharia, onde o número manda',
          'Decisão técnica que exige critério firme',
          'Controle e auditoria que não podem falhar',
          'Escolhas de risco em que é preciso agir certo, não só rápido',
          'Diagnóstico de problema com base em dados',
        ],
        sobEstresse:
          'Fecha-se nos dados e endurece, rejeita o que não for comprovado. Fica ainda mais frio e impaciente, e trava decisões urgentes esperando a certeza que não vem.',
      },
      IS: {
        nome: 'O Colaborador',
        biografia:
          'Você é do tipo que faz o time se sentir em casa. Caloroso e empático, você conecta as pessoas, cria um clima leve e percebe quando alguém não está bem antes mesmo de falarem. Onde há tensão, você suaviza; onde há distância, você aproxima. É o tipo de presença que faz as pessoas quererem trabalhar juntas e se sentirem seguras para pedir ajuda.\n\nA sua força é o cuidado genuíno com as pessoas e a capacidade de manter o grupo unido no longo prazo. Você abre a porta com simpatia e mantém o vínculo com constância, uma combinação forte em atendimento e em qualquer função que dependa de relação. O outro lado é que, para preservar a harmonia, você evita o conflito e a cobrança, custa a tomar a decisão impopular e adia o que é difícil, absorvendo a tensão de todos em vez de resolvê-la.\n\nVocê rende mais em times harmônicos, com ambiente estável e amistoso, e com apoio explícito quando a decisão dura precisar ser sua. O cuidado é aprender que evitar o confronto necessário só adia o problema e sobrecarrega você. Falar o difícil com o seu jeito acolhedor, sem engolir a tensão, protege tanto a relação quanto a sua própria energia.',
        qualidades: [
          'Percebe quando alguém não está bem antes de falarem e acolhe',
          'Conecta as pessoas e cria um clima leve em que o time quer trabalhar',
          'Mantém o vínculo com clientes e colegas no longo prazo',
          'Suaviza tensões e aproxima quem está distante',
          'Faz o grupo se sentir seguro para falar e pedir ajuda',
        ],
        pontosDeAtencao: [
          'Evita o conflito e a cobrança para preservar a harmonia',
          'Custa a tomar a decisão impopular e adia o que é difícil',
          'Absorve a tensão de todos em vez de resolvê-la',
          'Guarda o próprio desconforto para não gerar atrito',
          'Pode se sobrecarregar por cuidar de todos menos de si',
        ],
        comoLiderar: [
          'Valorize o cuidado dela com as pessoas, que sustenta o clima do time',
          'Apoie de forma explícita nas decisões difíceis e impopulares',
          'Dê um ambiente estável e amistoso onde ela rende mais',
          'Incentive-a a falar o desconforto cedo, antes de virar mágoa',
          'Evite deixá-la sozinha diante de um confronto que ela evitaria',
        ],
        oQueEvitar: ['Tensão constante', 'Decisões impopulares sem apoio', 'Frieza'],
        comunicacaoIdeal:
          'Amigável e acolhedora, reconhecendo o esforço de manter o grupo unido. Traga o difícil com cuidado e deixe claro que o vínculo está preservado.',
        ondeBrilha: [
          'Times harmônicos que dependem de relação e confiança',
          'Atendimento e sucesso do cliente no longo prazo',
          'Facilitação e integração de novas pessoas',
          'Ambientes que precisam de clima leve para render',
          'Ponte entre áreas ou pessoas em atrito',
        ],
        sobEstresse:
          'Absorve a tensão de todos e evita o confronto que resolveria. Se cala, adia o difícil e se sobrecarrega guardando o próprio desconforto.',
      },
      SI: {
        nome: 'O Facilitador',
        biografia:
          'Você é do tipo que costura o grupo por dentro. Constante e gentil, faz ponte entre pessoas que não se entendem, media atritos com calma e constrói a coesão que segura um time junto. Onde falta diálogo, você abre o canal; onde há ruído, você traduz. É uma presença que raramente aparece no palco, mas sem a qual o palco desmontaria.\n\nA sua força é essa capacidade de gerar coesão e ler o clima do grupo antes que o problema estoure. Você é o mediador amigável em quem todos confiam. O outro lado é que, por não gostar de fricção, você adia o confronto necessário, resiste a mudanças rápidas e guarda a própria insatisfação em vez de colocá-la na mesa, deixando que o desconforto se acumule em silêncio.\n\nVocê rende mais com aviso prévio das mudanças, com o seu papel de ponte reconhecido e num clima que não seja hostil. O cuidado é aprender que mediar não é engolir: colocar a própria insatisfação na conversa, e encarar o atrito quando ele for necessário, fortalece a coesão que você tanto preza, em vez de enfraquecê-la.',
        qualidades: [
          'Faz ponte entre pessoas que não se entendem e reduz o atrito',
          'Lê o clima do grupo antes que o problema estoure',
          'Constrói coesão e mantém o time junto no dia a dia',
          'Media conflitos com calma e é o mediador em quem todos confiam',
          'É constante e gentil, uma presença estável para o grupo',
        ],
        pontosDeAtencao: [
          'Adia o confronto necessário para não gerar fricção',
          'Resiste a mudanças rápidas e demora a aderir',
          'Guarda a própria insatisfação em vez de colocá-la na mesa',
          'Deixa o desconforto se acumular em silêncio',
          'Pode mediar tanto o dos outros que esquece o próprio incômodo',
        ],
        comoLiderar: [
          'Avise mudanças cedo, ela precisa de tempo para digerir e adaptar',
          'Peça a leitura do grupo, ela enxerga o clima antes dos outros',
          'Reconheça o papel de ponte, que costuma passar despercebido',
          'Incentive-a a colocar a própria insatisfação na conversa',
          'Evite clima hostil e cobrança pública, que a fazem se recolher',
        ],
        oQueEvitar: ['Mudança rápida', 'Clima hostil', 'Cobrança pública'],
        comunicacaoIdeal:
          'Próxima e calma, mostrando o impacto positivo no grupo. Dê tempo, avise as mudanças cedo e reconheça o papel de ponte que ela cumpre.',
        ondeBrilha: [
          'Coesão de equipe e manutenção do clima',
          'Mediação de conflitos entre pessoas ou áreas',
          'Onboarding e integração de novos membros',
          'Ponte entre times que não se comunicam bem',
          'Ambientes de longo prazo que dependem de relação estável',
        ],
        sobEstresse:
          'Recolhe-se e evita a fricção, mesmo quando ela é necessária. Guarda a insatisfação, adia a conversa difícil e deixa o incômodo crescer calado.',
      },
      SC: {
        nome: 'O Metódico',
        biografia:
          'Você é do tipo em que a liderança confia para as coisas não falharem. Segue o processo, respeita o procedimento e entrega com uma constância que quase não varia de um dia para o outro. Onde outros improvisam, você tem método; onde outros se atrapalham na correria, você mantém o padrão. É um perfil feito para rotinas de precisão que não toleram surpresa.\n\nA sua força é a confiabilidade: baixo índice de erro, cuidado com o detalhe e respeito às regras que sustentam a operação. Quem trabalha com você sabe que o combinado vai ser cumprido do jeito certo. O outro lado é que essa mesma solidez vira rigidez. Você resiste a mudanças, mesmo às necessárias, é lento para adaptar e pode se agarrar ao procedimento a ponto de travar diante do imprevisto.\n\nVocê rende mais com processo claro, ambiente estável e mudanças avisadas com antecedência e explicadas no porquê. O cuidado é aprender que nem toda mudança é ameaça, e que às vezes o procedimento precisa ceder à realidade. Entender a razão por trás do novo, e dar a si mesmo permissão para adaptar, faz a sua confiabilidade acompanhar o ritmo do negócio em vez de travá-lo.',
        qualidades: [
          'Segue o processo e mantém o padrão mesmo na correria',
          'Entrega com constância que quase não varia de um dia para o outro',
          'Tem baixo índice de erro e cuida do detalhe que sustenta a operação',
          'Respeita regras e procedimentos, dando previsibilidade ao time',
          'É confiável para rotinas de precisão que não toleram surpresa',
        ],
        pontosDeAtencao: [
          'Resiste a mudanças, mesmo às necessárias',
          'É lento para adaptar quando o cenário muda',
          'Pode se agarrar ao procedimento a ponto de travar no imprevisto',
          'Rígido e avesso a risco, evita o que sai da rotina conhecida',
          'Se acomoda numa rotina que já não serve, por conforto',
        ],
        comoLiderar: [
          'Dê processo claro e estável, é onde essa pessoa rende mais',
          'Explique o porquê da mudança, não só o que muda',
          'Respeite o ritmo cuidadoso, sem pressa de última hora',
          'Avise mudanças com antecedência e dê tempo de adaptação',
          'Mostre com dado que a mudança traz ganho real, para vencer a resistência',
        ],
        oQueEvitar: ['Mudança brusca', 'Ambiguidade', 'Pressa sem aviso'],
        comunicacaoIdeal:
          'Clara e estruturada, com passo a passo e antecedência. Explique o porquê da mudança e dê tempo para a pessoa absorver antes de cobrar o novo.',
        ondeBrilha: [
          'Rotinas de precisão bem-feitas que não podem oscilar',
          'Processos e operações que dependem de padrão constante',
          'Controle de qualidade e conferência',
          'Funções que exigem seguir procedimento à risca',
          'Ambientes estáveis onde a confiabilidade vale mais que a velocidade',
        ],
        sobEstresse:
          'Agarra-se ao procedimento e trava diante do imprevisto. Resiste ainda mais à mudança e se refugia na rotina conhecida para se sentir seguro.',
      },
      CS: {
        nome: 'O Perfeccionista',
        biografia:
          'Você é do tipo que entrega qualidade com cuidado, sem alarde. Minucioso e cooperativo, você sustenta um padrão alto de forma discreta, sem precisar aparecer, e é confiável dentro de uma equipe onde o detalhe importa. Onde outros passam batido, você confere; onde outros aceitam o razoável, você caprichem no acabamento. É a garantia silenciosa de que o trabalho vai sair bem-feito.\n\nA sua força é a precisão aliada ao cuidado com as pessoas: você entrega no padrão sem gerar atrito, revisando e conferindo com uma dedicação em que o time confia. O outro lado é que o excesso de zelo pode travar você, delegar é difícil porque parece que ninguém fará no seu nível, e uma reviravolta súbita te desestabiliza mais do que a maioria imagina.\n\nVocê rende mais com critérios claros, tempo para fazer bem-feito e expectativas realistas, longe de prazos impossíveis. O cuidado é combinar antes o que é "bom o suficiente" e aceitar que refazer sem parar em busca do perfeito só atrasa o que já estava pronto. Confiar no critério dos colegas para delegar, e dar-se permissão para entregar no ponto certo, libera o seu cuidado para render sem travar.',
        qualidades: [
          'Sustenta um padrão alto de forma discreta, sem precisar aparecer',
          'Entrega qualidade sem gerar atrito com o time em volta',
          'Revisa e confere com dedicação em que os colegas confiam',
          'É minucioso e cooperativo ao mesmo tempo, raro de encontrar',
          'Pega falhas de detalhe que passariam despercebidas por outros',
        ],
        pontosDeAtencao: [
          'Trava por excesso de zelo em busca do acabamento perfeito',
          'Custa a delegar porque parece que ninguém fará no seu nível',
          'Sofre com reviravolta súbita e prazo irreal',
          'Refaz sem parar e atrasa o que já estava pronto',
          'Pode absorver tarefa demais por não confiar no trabalho alheio',
        ],
        comoLiderar: [
          'Defina critérios de "bom o suficiente" para evitar a paralisia',
          'Dê tempo e contexto, o susto de última hora a desestabiliza',
          'Reconheça o cuidado, que costuma ser silencioso',
          'Incentive a delegar, mostrando que pode confiar no critério do colega',
          'Traga prazos realistas, não expectativas vagas nem impossíveis',
        ],
        oQueEvitar: ['Reviravolta súbita', 'Expectativa vaga', 'Prazo irreal'],
        comunicacaoIdeal:
          'Detalhada e respeitosa, com critérios e prazos realistas. Combine o que é "bom o suficiente" e evite a reviravolta de última hora que a trava.',
        ondeBrilha: [
          'Precisão dentro de uma equipe, sem atrito',
          'Revisão e conferência do trabalho antes de soltar',
          'Documentação e controle que exigem cuidado',
          'Tarefas que pedem padrão alto e discrição',
          'Processos críticos em que a checagem dupla evita prejuízo',
        ],
        sobEstresse:
          'Refaz sem parar em busca do perfeito e atrasa a entrega. Trava por zelo, custa ainda mais a delegar e se sobrecarrega tentando garantir tudo sozinho.',
      },
      DS: {
        nome: 'O Planejador',
        biografia:
          'Você é do tipo que decide com firmeza e depois sustenta a decisão até o fim. Combina o impulso de quem gosta de comandar com o método de quem executa o plano com constância. Onde uns começam e abandonam, você começa e termina; onde uns mudam de rota a cada vento, você segue firme no rumo traçado. É um perfil feito para execução planejada e metas de médio prazo.\n\nA sua força é essa junção de decisão com constância: você define o plano, banca a escolha e entrega sem largar no meio do caminho. A liderança confia em você para levar algo do início ao fim. O outro lado é que, uma vez decidido, você pode ficar teimoso, custa a mudar de rota mesmo quando o cenário já mudou, e cobra de si mesmo com uma dureza que às vezes pesa.\n\nVocê rende mais com o plano alinhado no começo, autonomia para executar e razões claras quando um ajuste for necessário. O cuidado é lembrar que insistir no plano original quando a realidade virou é rigidez, não constância. Abrir espaço para rever a rota diante de fatos novos, e aliviar a própria cobrança, faz a sua firmeza render sem virar teimosia.',
        qualidades: [
          'Decide com firmeza e sustenta a escolha até o fim, sem largar no meio',
          'Combina o impulso de comandar com o método de executar o plano',
          'Segue firme no rumo traçado, sem mudar de rota a cada vento',
          'Leva algo do início ao fim, reduzindo projetos abandonados',
          'Dá o impulso inicial e sustenta a constância em rotinas longas',
        ],
        pontosDeAtencao: [
          'Fica teimoso uma vez que decide e custa a mudar de rota',
          'Insiste no plano original mesmo quando o cenário já mudou',
          'Cobra de si mesmo com uma dureza que pesa',
          'Resiste a ajustes que não vêm com motivo claro',
          'Confunde constância com rigidez em cenários que exigem flexibilidade',
        ],
        comoLiderar: [
          'Alinhe o plano no começo, ela executa melhor com o rumo claro',
          'Traga fatos concretos para justificar ajustes de rota',
          'Respeite a constância e a entrega até o fim',
          'Ajude a rever a rota diante de fatos novos, sem soar como capricho',
          'Reconheça a firmeza, mas aponte quando ela vira teimosia',
        ],
        oQueEvitar: ['Rigidez consigo mesmo', 'Mudança sem motivo claro', 'Improviso'],
        comunicacaoIdeal:
          'Objetiva e planejada, com metas firmes e razões para qualquer ajuste. Traga o fato que justifica a mudança de rota, senão ela lê como capricho.',
        ondeBrilha: [
          'Execução planejada do início ao fim',
          'Metas de médio prazo que exigem constância',
          'Operação estável que não pode ser abandonada no meio',
          'Projetos que precisam de decisão firme e acompanhamento',
          'Rotinas longas que dependem de impulso inicial e constância',
        ],
        sobEstresse:
          'Insiste no plano original mesmo quando o cenário já mudou. Fica mais teimoso, resiste ao ajuste e se cobra ainda mais duro pelo desvio.',
      },
      IC: {
        nome: 'O Consultor',
        biografia:
          'Você é do tipo que junta o charme de quem se conecta com o rigor de quem entrega certo. Sociável e preciso, você explica o complexo de um jeito que as pessoas entendem e sustenta o que diz com dados que se comprovam. Onde um perfil só encanta e outro só aprofunda, você faz os dois: ganha a plateia e prova o ponto. É um perfil feito para consultoria, treinamento e para vender ou explicar algo técnico.\n\nA sua força é essa rara união entre relação e técnica: você abre a porta com simpatia e sustenta a credibilidade com o conteúdo correto. A criatividade somada ao senso crítico gera soluções que também passam no teste da qualidade. O outro lado é que você sofre no trabalho técnico solitário, oscila entre falar e revisar sem fechar nenhum dos dois, e pode se dispersar no detalhe quando deveria concluir.\n\nVocê rende mais com interação, um bom problema técnico para resolver e reconhecimento pela clareza da sua explicação, longe do isolamento longo e da tarefa monótona. O cuidado é não deixar a conversa engolir o rigor, nem o rigor matar a fluidez: dosar os dois é o seu ponto de equilíbrio. Encontrar o meio-termo entre encantar e comprovar transforma o seu talento duplo em consultoria que convence e sustenta.',
        qualidades: [
          'Explica o complexo de um jeito que as pessoas entendem',
          'Une o charme de quem se conecta com o rigor de quem entrega certo',
          'Sustenta a credibilidade com dados, não só com simpatia',
          'Gera soluções criativas que também passam no teste da qualidade',
          'É forte em vender ou explicar algo técnico para um público',
        ],
        pontosDeAtencao: [
          'Sofre no trabalho técnico solitário e sem interação',
          'Oscila entre falar e revisar sem fechar nenhum dos dois',
          'Pode se dispersar no detalhe quando deveria concluir',
          'Recebe crítica técnica como se fosse pessoal e desanima',
          'A espontaneidade às vezes atropela a precisão que ela mesma preza',
        ],
        comoLiderar: [
          'Dê interação e um bom problema técnico para resolver',
          'Reconheça a clareza da explicação, é o que a valoriza',
          'Evite isolamento longo e tarefa monótona, que a apagam',
          'Traga crítica técnica com reconhecimento, não só correção',
          'Ajude a fechar entre o falar e o revisar, sem oscilar sem fim',
        ],
        oQueEvitar: ['Isolamento sem interação', 'Tarefa monótona', 'Falta de contexto'],
        comunicacaoIdeal:
          'Amigável e precisa, com espaço pra dialogar e dados pra sustentar. Traga o problema técnico e reconheça a clareza da explicação que ela oferece.',
        ondeBrilha: [
          'Explicar ou vender algo técnico para um público',
          'Consultoria que une relação com conteúdo correto',
          'Treinamento e capacitação que exigem clareza',
          'Apresentação técnica em que é preciso encantar e provar',
          'Ponte entre a área técnica e o cliente ou a diretoria',
        ],
        sobEstresse:
          'Fala muito para aliviar a tensão e perde o rigor do detalhe. Oscila entre conversar e revisar sem fechar, e recebe a crítica técnica como se fosse pessoal.',
      },
    },

    // ── Relações entre pares de perfis primários ─────────────────────────────
    // Chave = par canônico D<I<S<C (ver src/lib/disc/relationships.ts).
    // Cada combo descreve a dinâmica quando os dois fatores primários se encontram.
    relationships: {
      DD: {
        friction: [
          'Em reuniões, os dois competem para ter a palavra final, e uma decisão simples vira queda de braço que trava a equipe.',
          'Nenhum dos dois recua numa discussão, então divergências pequenas escalam para confronto direto na frente do time.',
          'Cada um assume a mesma frente sem combinar antes, e o resultado é retrabalho e ordens contraditórias para os subordinados.',
          'O ego elevado faz com que admitir erro pareça derrota, então falhas ficam sem correção porque ninguém cede.',
          'A pressa dos dois por resultado atropela o alinhamento, e a equipe recebe metas mudadas no meio do caminho.',
        ],
        synergy: [
          'Quando o escopo está dividido, os dois decidem rápido e destravam projetos que travariam com perfis mais cautelosos.',
          'A ambição compartilhada puxa metas arrojadas para cima, e um serve de referência de energia e ritmo para o outro.',
          'Sob pressão ou em crise, nenhum dos dois congela, e juntos seguram a operação quando tudo está pegando fogo.',
          'Cobram entrega um do outro no mesmo nível, então o padrão de resultado da dupla fica alto sem precisar de supervisão externa.',
          'Em negociações duras, formam uma frente firme que dificilmente é dobrada pelo outro lado.',
        ],
        communication:
          'Combine antes quem lidera cada frente e formalize por escrito, para que a reunião não vire disputa pela palavra final. Cada um deve entrar na conversa disposto a ceder em pelo menos um ponto, tratando divergência como dado, não como afronta pessoal. Feedback entre os dois funciona melhor a sós e direto, sem plateia que transforme o assunto em queda de braço. Definam um critério objetivo de decisão (número, prazo, meta) para desempatar sem que vire questão de ego.',
      },
      DI: {
        friction: [
          'O D cobra prazo e entrega fechada, enquanto o I chega cheio de ideias soltas, e o D passa a enxergá-lo como disperso e pouco confiável.',
          'O I sente o D frio e ríspido, e depois de alguns cortes secos começa a evitar levar assuntos e a esconder problemas.',
          'O ritmo acelerado do D atropela a necessidade do I de conversar e ser reconhecido, esvaziando a energia que ele traria para o time.',
          'O I promete mais do que consegue cumprir para agradar, e o D se irrita quando a entrega não bate com o discurso animado.',
          'Em reunião, o I alonga com histórias e o D corta na metade, e nenhum dos dois sai sentindo que foi ouvido.',
        ],
        synergy: [
          'O D puxa o resultado e define a meta, o I engaja as pessoas e vende a ideia, uma dupla forte para lançamentos e viradas de operação.',
          'O I suaviza o impacto do D nas pessoas, traduzindo cobranças duras numa linguagem que o time aceita sem desmotivar.',
          'Juntos cobrem os dois lados que quase nenhum perfil sozinho entrega: foco em resultado e capacidade de influenciar e mobilizar.',
          'O D dá foco e prazo ao entusiasmo do I, transformando muita ideia solta em poucas apostas realmente executadas.',
          'Em momentos de baixa moral, o D define o rumo e o I reacende a energia, e a equipe volta a andar rápido.',
        ],
        communication:
          'O D deve começar com uma frase de reconhecimento antes de cobrar, porque o I trava quando sente frieza logo de cara. O I precisa chegar às conversas com foco e um prazo concreto, cortando a introdução longa que faz o D desligar. Combinem que ideias novas do I entram numa lista para depois, e não no meio de uma decisão que já estava fechada. Em reunião, o D conduz a meta e o I conduz o engajamento, cada um respeitando o espaço do outro em vez de disputar o comando.',
      },
      DS: {
        friction: [
          'O D quer mudar tudo agora e o S precisa de tempo e aviso, então mudanças caem de surpresa e o S se sente atropelado.',
          'O S protege a estabilidade e o ritmo do time, e o D lê isso como lentidão ou resistência de propósito.',
          'Sob pressão, o D fica mais ríspido e o S se fecha, guardando insatisfações que só aparecem quando já viraram desgaste.',
          'O D decide sozinho e comunica pronto, enquanto o S esperava ser consultado, e a confiança entre os dois vai corroendo.',
          'O D mede valor por resultado rápido e o S por consistência e relação, então cada um acha que o outro cuida da coisa errada.',
        ],
        synergy: [
          'O D lidera e decide, o S estabiliza e executa com constância, uma dupla que combina velocidade de decisão com entrega firme até o fim.',
          'O S cuida das relações e do clima que o D costuma negligenciar, segurando o time que a pressão do D poderia desgastar.',
          'Quando o D define o rumo, o S garante que o plano seja seguido sem abandono no meio, reduzindo projetos começados e não terminados.',
          'O S traz ao D uma leitura realista de como a mudança afeta as pessoas, evitando decisões rápidas que quebram a operação.',
          'Em rotinas longas, o D dá o impulso inicial e o S sustenta a constância, mantendo o resultado sem depender de novos empurrões.',
        ],
        communication:
          'O D deve dar contexto e avisar mudanças com antecedência, porque o S entrega muito mais quando não é pego de surpresa. O S precisa se posicionar em voz alta na hora, em vez de concordar por fora e guardar a discordância. Nas conversas, o D ganha se desacelerar o tom e perguntar a opinião do S antes de fechar a decisão. Dividam papéis com clareza: o D assume as decisões e o ritmo, o S assume a execução constante e o cuidado com o time, sem um invadir o terreno do outro.',
      },
      DC: {
        friction: [
          'O D quer decidir rápido e o C precisa de dados e tempo para analisar, então o D lê o C como travador e o C lê o D como afobado.',
          'O C aponta riscos e detalhes que faltam, e o D interpreta como resistência ou excesso de burocracia no meio da entrega.',
          'Os dois são exigentes, mas cobram coisas opostas, o D cobra resultado no prazo e o C cobra qualidade sem falha, e o time fica no fogo cruzado.',
          'Quando o prazo aperta, o D quer entregar como está e o C se recusa a soltar algo que considera abaixo do padrão, e a tensão sobe.',
          'O D decide pelo instinto e o C pelo dado, então cada um desconfia do método do outro e a decisão empaca em desconfiança mútua.',
        ],
        synergy: [
          'O D puxa o resultado e o C garante a qualidade, uma dupla forte para projetos que precisam entregar rápido e com padrão alto ao mesmo tempo.',
          'O C freia o D nos erros evitáveis antes que virem prejuízo, funcionando como controle de qualidade sem travar a entrega.',
          'O D dá ao C um senso de urgência e prazo, evitando que a análise se estenda sem fim atrás da certeza perfeita.',
          'Em decisões de risco, o D traz a coragem de agir e o C traz o critério para agir certo, reduzindo tanto a paralisia quanto o erro impulsivo.',
          'Juntos elevam o nível do que o time entrega: velocidade do D com o rigor técnico do C, algo raro num perfil só.',
        ],
        communication:
          'O D deve trazer os dados que tem e dar ao C um tempo mínimo para processar antes de exigir a decisão, senão o C trava por insegurança. O C precisa começar pelo essencial e pela conclusão, deixando o detalhamento para depois, para o D não perder o fio nem a paciência. Combinem antes o que é inegociável em qualidade e o que pode ceder pelo prazo, para o embate não acontecer em cima da hora. Nas reuniões, o D conduz meta e prazo, o C conduz critério e risco, e a decisão final considera os dois lados em vez de um vencer o outro.',
      },
      II: {
        friction: [
          'Os dois falam muito e executam pouco, a lista de ideias cresce a cada reunião enquanto a entrega concreta encolhe.',
          'Ambos querem o palco, então disputam a atenção do grupo e reuniões viram competição de quem fala mais em vez de decisão.',
          'Prazo e detalhe ficam em segundo plano para os dois, e tarefas importantes atrasam porque nenhum assumiu o trabalho chato.',
          'Como os dois evitam a parte árida, ninguém acompanha número nem checklist, e problemas só aparecem quando já estouraram.',
          'No calor do entusiasmo, os dois prometem mais do que o time consegue entregar, e a conta chega depois em frustração.',
        ],
        synergy: [
          'A energia da dupla é altíssima, e juntos criam um ambiente animado que motiva e contagia o resto do time.',
          'Criatividade e networking em dobro fazem ideias e conexões fluírem, ótimo para campanhas, eventos e lançamentos.',
          'Quando precisam vender uma ideia internamente, os dois somam poder de influência e a proposta ganha o grupo rápido.',
          'Em momentos de moral baixa, a dupla reacende o ânimo da equipe e devolve leveza a um clima pesado.',
          'A troca constante de ideias entre os dois gera soluções criativas que perfis mais fechados dificilmente chegariam.',
        ],
        communication:
          'Definam logo no início quem executa o quê e registrem por escrito, porque a boa intenção dos dois some sem responsável claro. Combinem prazos reais e um momento fixo para revisar o que de fato saiu do papel, senão tudo vira conversa animada sem entrega. Vale trazer alguém organizado para o time, ou revezar quem assume a parte chata a cada projeto. Aproveitem a energia para celebrar as conquistas juntos, mas separem o momento de comemorar do momento de decidir, para a reunião não virar só festa.',
      },
      IS: {
        friction: [
          'O ritmo acelerado e as mudanças constantes do I sobrecarregam o S, que precisa de previsibilidade para render bem.',
          'O I se frustra com o tempo que o S leva para aderir a uma novidade, e passa a empurrar mudanças que o S ainda não digeriu.',
          'O S guarda insatisfações para não gerar atrito, e o I, distraído pela própria energia, nunca percebe que algo está errado.',
          'O I muda de assunto e de prioridade o tempo todo, e o S se sente inseguro sem saber qual é o foco real da semana.',
          'Quando o clima esquenta, o I quer resolver conversando alto e rápido, e o S se retrai, e a conversa não acontece.',
        ],
        synergy: [
          'O I energiza e conecta as pessoas, o S apoia e estabiliza, juntos formam um time caloroso, colaborativo e agradável de trabalhar.',
          'O S dá constância à energia do I, transformando entusiasmo passageiro em relações e rotinas que duram.',
          'O S cuida em silêncio dos detalhes e do acompanhamento que o I deixa de lado, cobrindo o ponto fraco do parceiro.',
          'Nas relações com clientes e equipe, o I abre a porta e o S mantém o vínculo no longo prazo, uma combinação forte em atendimento.',
          'O clima de confiança que os dois criam faz o time se sentir seguro para falar e pedir ajuda.',
        ],
        communication:
          'O I deve desacelerar e avisar mudanças com antecedência, dando ao S tempo para se preparar em vez de reagir na correria. O S precisa falar abertamente das preocupações assim que surgem, em vez de guardar até virar mágoa. Combinem uma prioridade clara por período, para o S não se perder na troca constante de foco do I. Nas conversas difíceis, o I ganha se baixar o tom e ouvir mais, e o S ganha se disser o que pensa mesmo correndo o risco de um pequeno atrito.',
      },
      IC: {
        friction: [
          'A espontaneidade do I bate de frente com a precisão do C, e o que para um é agilidade para o outro é desleixo.',
          'O C acha o I desorganizado e superficial, o I acha o C rígido e sem graça, e cada um subestima a contribuição do outro.',
          'O I quer começar já e ajustar no caminho, o C quer planejar tudo antes, e a diferença de ritmo gera atrito no arranque de qualquer tarefa.',
          'O C aponta erros e inconsistências, e o I, que se move por reconhecimento, recebe isso como crítica pessoal e desanima.',
          'Em reunião, o I traz visão e o C traz ressalvas, e sem mediação a conversa oscila entre otimismo solto e ceticismo travador.',
        ],
        synergy: [
          'O I traz ideia, energia e relação, o C traz rigor, qualidade e profundidade, um equilíbrio raro entre encantar e entregar bem feito.',
          'O C aterra as ideias do I em algo concreto e executável, transformando entusiasmo em plano de verdade.',
          'Juntos são ótimos para explicar e vender assuntos técnicos, o I dá o charme e a clareza, o C garante que o conteúdo esteja correto.',
          'O I abre portas e conquista as pessoas, o C sustenta a credibilidade com dados, uma dupla convincente e confiável ao mesmo tempo.',
          'A criatividade do I somada ao senso crítico do C gera soluções inovadoras que também passam no teste da qualidade.',
        ],
        communication:
          'O I deve levar fatos e evidências ao C, porque só entusiasmo não convence quem decide por dado. O C precisa se abrir a ideias novas sem exigir perfeição já no primeiro rascunho, e cuidar para que a crítica venha com reconhecimento, não só como correção. Combinem um momento para divergir livremente e outro para fechar com rigor, separando o brainstorm da revisão. Dividam papéis na apresentação: o I conduz a relação e a narrativa, o C garante a exatidão do conteúdo, buscando sempre o meio-termo entre encantar e comprovar.',
      },
      SS: {
        friction: [
          'Os dois evitam conflito e deixam problemas se acumularem sem dizer nada, até que o pequeno atrito vira um desgaste grande.',
          'Decisões ficam lentas ou adiadas indefinidamente, porque nenhum dos dois quer bancar a escolha difícil e assumir o risco.',
          'Ambos resistem a mudanças, mesmo às necessárias, e a dupla se acomoda numa rotina que já não serve ao time.',
          'Insatisfações ficam guardadas dos dois lados, e o clima aparentemente tranquilo esconde ressentimentos que ninguém verbaliza.',
          'Sem alguém puxando o ritmo, prazos escorregam de forma silenciosa porque cobrar o outro parece quebrar a harmonia.',
        ],
        synergy: [
          'A harmonia, a lealdade e a cooperação entre os dois são genuínas, e o time sente um ambiente estável e sem panelinha.',
          'A dupla sustenta a operação no longo prazo, dando ao time uma base de estabilidade que segura a rotina mesmo em fases difíceis.',
          'Criam um ambiente seguro onde todos se sentem ouvidos, o que faz as pessoas ao redor abrirem problemas mais cedo.',
          'Trabalham com paciência e constância, ideais para funções de continuidade, suporte e cuidado com pessoas.',
          'A lealdade mútua torna a dupla extremamente confiável em momentos que exigem discrição e apoio silencioso.',
        ],
        communication:
          'Combinem que ser honesto sobre um problema não é agredir, para que os dois consigam falar o desconforto mesmo sem gostar do momento. Definam quem puxa cada decisão e um prazo para bater o martelo, senão a escolha fica rodando sem fim. Marquem uma conversa periódica só para colocar na mesa o que está incomodando, criando um espaço seguro para o que ninguém diria no corredor. Diante de uma mudança necessária, escrevam juntos o porquê e os ganhos, para vencer a resistência natural dos dois com argumento, não com pressão.',
      },
      SC: {
        friction: [
          'Os dois são cautelosos e avessos a risco, e juntos podem travar diante de qualquer decisão que envolva incerteza.',
          'O excesso de análise antes de mudar qualquer coisa faz a dupla adiar movimentos que o negócio precisa fazer logo.',
          'O S quer harmonia e o C quer precisão, e às vezes o apego do C ao processo passa por cima do cuidado do S com as pessoas.',
          'Nenhum dos dois gosta de confronto, então divergências sobre o método ficam sem ser resolvidas e se arrastam.',
          'A dupla se sente confortável demais na rotina conhecida, e resiste a inovações mesmo quando elas trariam ganho claro.',
        ],
        synergy: [
          'O trabalho da dupla é confiável, minucioso e de qualidade consistente, com pouquíssima variação de um dia para o outro.',
          'O baixo índice de erro e o respeito às regras fazem deles um dos pares mais estáveis para rotinas de precisão.',
          'O S mantém o clima e o C mantém o padrão, e juntos entregam qualidade sem gerar atrito com o time em volta.',
          'São a dupla certa para processos críticos que não podem falhar, porque os dois checam antes de soltar.',
          'A combinação de cuidado com pessoas e cuidado com o detalhe cria uma operação previsível em que a liderança pode confiar.',
        ],
        communication:
          'Trabalhem com processos e critérios claros e definidos por escrito, porque os dois se sentem seguros quando o caminho está mapeado. Avisem mudanças com antecedência e deem tempo de adaptação, evitando o susto que trava o S e a análise sem fim que trava o C. Combinem antes um prazo para encerrar a análise e agir, para a cautela dos dois não virar paralisia. Incentivem-se mutuamente a se posicionar quando algo estiver errado, tratando a divergência sobre o método como parte do trabalho, não como conflito pessoal.',
      },
      CC: {
        friction: [
          'O perfeccionismo dos dois leva à paralisia por análise, e a dupla adia a entrega em busca de uma certeza que nunca chega.',
          'Ambos tendem a criticar demais, e a revisão mútua vira um vaivém de apontamentos que gera tensão e desgasta a relação.',
          'Nenhum dos dois avança sem o nível de certeza que o outro também não considera suficiente, e o projeto empaca em checagens infinitas.',
          'Como os dois valorizam o detalhe, discussões técnicas se estendem sobre pontos mínimos enquanto o prazo geral aperta.',
          'Sob pressão, os dois se fecham ainda mais no dado e endurecem, rejeitando qualquer atalho e travando decisões urgentes.',
        ],
        synergy: [
          'A precisão, a qualidade e a profundidade técnica da dupla são excepcionais, e o padrão de entrega fica acima da média do mercado.',
          'O padrão elevado dos dois puxa para cima o nível de tudo que passa pelas mãos deles, elevando a régua do time inteiro.',
          'São confiáveis para tarefas críticas que não toleram erro, porque um revisa o outro e nada sai sem checagem dupla.',
          'Juntos produzem documentação, análises e controles impecáveis, uma base sólida em que o resto da empresa pode confiar.',
          'A troca entre dois olhares rigorosos costuma pegar falhas que passariam despercebidas por qualquer perfil sozinho.',
        ],
        communication:
          'Combinem antes de começar o que é bom o suficiente e qual o critério de pronto, para não perseguirem uma perfeição que trava a entrega. Definam prazos firmes e um ponto em que a análise se encerra e a decisão é tomada, mesmo sem certeza total. Ao revisar o trabalho um do outro, equilibrem a crítica com o reconhecimento do que ficou bom, evitando o desgaste do apontamento constante. Dividam responsabilidades para não checarem a mesma coisa duas vezes, confiando no critério do parceiro em vez de refazer tudo por conta própria.',
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // en — English (semantic / market terms)
  // ═══════════════════════════════════════════════════════════════════════════
  en: {
    ui: {
      introTitle: 'Behavioral Profile Test (DISC)',
      introLead:
        'It takes about 5 minutes. Answer thinking about your day to day.',
      introStart: 'Start',
      back: 'Back',
      next: 'Next',
      submit: 'Submit answers',
      submitting: 'Submitting...',
      progress: 'Question {current} of {total}',
      thanksTitle: 'Thank you!',
      thanksLead:
        'Your answers have been recorded. The HR team will receive your profile.',
      alreadyDoneTitle: 'Answers already submitted',
      alreadyDoneLead:
        'This questionnaire has already been answered. Talk to HR if you need to redo it.',
      loadError: 'We could not load the questionnaire. Please try again.',
      resultTitle: 'Your behavioral profile',
      greeting: 'Hi, {name}!',
      assessmentDisclaimer:
        'Answer honestly: mark what truly resembles you, not what you wish you were or what you think is the "correct" response.',
      instructionsTitle: 'How it works',
      instructionsHowto:
        'There are 28 statements about the way you act. It takes about 5 minutes.',
      instructionsDrag:
        'Drag the bar: right if it is exactly like you, left if it is not like you at all, center if it is neutral.',
      instructionsHonest:
        'There are no right or wrong answers, and no profile is better or worse. Answer thinking about what truly resembles you.',
      aboutProfileTitle: 'About your profile',
    },
    scale: {
      1: 'Not like me at all',
      2: 'Somewhat disagree',
      3: 'Neutral',
      4: 'Somewhat agree',
      5: 'Exactly like me',
      lowAnchor: 'Not like me at all',
      highAnchor: 'Exactly like me',
    },
    factors: {
      D: {
        name: 'Dominance',
        short: 'D',
        tagline: 'Focus on results and action',
        description:
          'Measures how much a person takes charge, decides fast, and chases the result even at some risk. A high D enjoys challenge, direct confrontation, and being in control.',
        example:
          'Often associated with Steve Jobs, for his strong vision, fast decisions, and obsession with the result.',
      },
      I: {
        name: 'Influence',
        short: 'I',
        tagline: 'Focus on people and energy',
        description:
          'Measures how much a person connects with, inspires, and persuades others. A high I brings energy to the group, enjoys people, and lifts the mood with optimism.',
        example:
          'Often associated with Oprah Winfrey, for her charisma, connection with people, and power to engage those around her.',
      },
      S: {
        name: 'Steadiness',
        short: 'S',
        tagline: 'Focus on harmony and consistency',
        description:
          'Measures how much a person values consistency, harmony, and predictability. A high S is patient, loyal, a great listener, and sustains the team over the long run.',
        example:
          'Often associated with Warren Buffett, for his patience, consistency, and long-term view.',
      },
      C: {
        name: 'Compliance',
        short: 'C',
        tagline: 'Focus on quality and standards',
        description:
          'Measures how much a person is guided by data, rules, and a quality standard. A high C analyzes calmly, minds the detail, and decides on facts rather than impulse.',
        example:
          'Often associated with Bill Gates, for his analysis, method, and technical rigor grounded in data.',
      },
    },
    charts: {
      barTitle: 'DISC graph',
      radarTitle: 'Behavioral Competencies',
      wheelTitle: 'Style wheel',
      average: 'Average',
      wheelCenter: 'Adaptable',
      wheelEdge: 'Pronounced',
      score: 'Score',
    },
    attributes: {
      proactivity: 'Proactivity',
      resultsFocus: 'Results focus',
      leadership: 'Leadership',
      communication: 'Communication',
      teamwork: 'Teamwork',
      patience: 'Patience',
      discipline: 'Discipline',
      attentionToDetail: 'Attention to detail',
    },
    competencies: {
      competitiveness: 'Competitiveness',
      agility: 'Agility',
      confidence: 'Confidence',
      energy: 'Energy',
      flexibility: 'Flexibility',
      influence: 'Influence',
      creativity: 'Creativity',
      consistency: 'Consistency',
      communication: 'Communication',
      empathy: 'Empathy',
      planning: 'Planning',
      patience: 'Patience',
      analysis: 'Analysis',
      judgment: 'Judgment',
      security: 'Security',
      discipline: 'Discipline',
    },
    sections: {
      qualidades: 'Strengths',
      pontosDeAtencao: 'Watch-outs',
      comoLiderar: 'How to lead and communicate',
      oQueEvitar: 'What to avoid',
      comunicacaoIdeal: 'Ideal communication',
      ondeBrilha: 'Where they shine',
      sobEstresse: 'Under stress',
      profileHeading: 'Profile {code}',
    },
    disclaimer:
      'This is a tool for self-awareness and team communication. It is not a clinical test or a diagnosis. No profile is better or worse than another.',
    items: {
      d1: 'I like to take charge of situations.',
      d2: 'I push to make things happen at the pace I want.',
      d3: 'I get straight to the point, even if it sounds harsh.',
      d4: 'I like to compete and to win.',
      d5: 'I make decisions quickly, even taking some risk.',
      d6: 'I would rather give in than get into a confrontation.',
      d7: 'I find it hard to say no.',
      d8: 'I take risks to reach a goal.',
      d9: 'I enjoy difficult challenges.',
      d10: 'I say what I think, without beating around the bush.',
      d11: 'I prefer someone else to make the tough decisions.',
      d12: 'I stay focused on results even under pressure.',
      i1: 'I make friends with new people easily.',
      i2: 'I like being the center of attention.',
      i3: 'I am enthusiastic and my energy rubs off on people around me.',
      i4: 'I would rather talk and share ideas than work alone.',
      i5: 'I stay optimistic even when facing problems.',
      i6: 'In a large group, I tend to stay quiet.',
      i7: 'I say little about myself.',
      i8: 'I enjoy meeting new people.',
      i9: 'I find it easy to persuade others.',
      i10: 'I bring good energy and humor to the team.',
      i11: 'I prefer working alone over working in a group.',
      i12: 'I get excited about new ideas.',
      s1: 'I am patient with slow processes.',
      s2: 'I prefer routine and predictability over surprises.',
      s3: 'I listen carefully before taking a stand.',
      s4: 'I avoid conflict to keep the group in harmony.',
      s5: 'I am loyal and steady with those I trust.',
      s6: 'I like it when plans change suddenly.',
      s7: 'I get impatient when things take too long.',
      s8: 'I stay calm in tense situations.',
      s9: 'I help colleagues when they need it.',
      s10: 'I prefer a stable environment without surprises.',
      s11: 'I enjoy taking risks and embracing change.',
      s12: 'I am usually the first to calm things down during a conflict.',
      c1: 'I notice details that most people miss.',
      c2: 'I like everything organized and in order.',
      c3: 'I check my work more than once.',
      c4: 'I prefer to follow clear rules and procedures.',
      c5: 'I analyze the data calmly before deciding.',
      c6: 'I tend to decide on impulse, without much analysis.',
      c7: 'Small mistakes do not bother me.',
      c8: 'I follow checklists and procedures to the letter.',
      c9: 'I review my work to avoid mistakes.',
      c10: 'I prefer quality over speed.',
      c11: 'I do not care much about details.',
      c12: 'I base my decisions on facts and numbers.',
      d13: 'I like to take charge and lead people through situations.',
      d14: 'I make quick decisions, often on my own.',
      i13: 'I am lively and open up easily when I am around other people.',
      i14: 'I convince and engage people with ease.',
      s13: 'I listen carefully and put myself in others shoes.',
      s14: 'I prefer to follow plans calmly and steadily to the end.',
      c13: 'I take pride in the details and like time to deliver with precision.',
      c14: 'I follow well-defined procedures to stay in control.',
    },
    profiles: {
      D: {
        nome: 'The Driver',
        biografia:
          'You are the type who takes charge without waiting to be told. Where others see a hard problem, you see a target, and you go after it with an urgency that is contagious and sometimes intimidating. You decide fast, speak plainly, and would rather make a fixable mistake than sit still waiting for perfect certainty. On a team, you are usually the engine: when energy drops, you are the one who pulls everyone back toward the result.\n\nYour strength is exactly that courage to decide and the willingness to face the confrontation most people avoid. But the same trait that unblocks also runs people over: in the rush to deliver, you can talk over others and treat their slowness as bad will. It often is not, and recognizing that is what separates a feared boss from a respected leader.\n\nYou perform best with a clear goal, autonomy over the path, and a worthy challenge. The care is to remember that a result that burns out the team midway does not hold. Learning to ask before ordering, and to listen before deciding, multiplies your already natural ability to make things happen.',
        qualidades: [
          'Takes charge of a stuck situation without being asked, and unblocks the group',
          'Decides fast even with incomplete information, keeping the team from stalling',
          'Says what needs to be said directly, without delays that drag the conversation',
          'Does not back down from confrontation or a hard goal, facing the challenge head-on',
          'Keeps focus on the result even as pressure rises and others start to waver',
        ],
        pontosDeAtencao: [
          'In the rush to deliver, runs over those nearby and leaves the team demotivated',
          'Cuts others off and decides before hearing the whole team',
          'Treats necessary processes and safeguards as a waste of time',
          'Impatience with others’ pace turns into harshness and wears down relationships',
          'Takes too much risk trusting only instinct, without checking the data',
        ],
        comoLiderar: [
          'Give clear goals and leave the person free to choose the "how"',
          'Hold them to the result, not the path, and avoid the micromanagement they hate',
          'Be objective and get to the point, with no long intro',
          'Offer real challenges and recognition for hard wins delivered',
          'Point out the human impact factually, so they see the cost of the rush',
        ],
        oQueEvitar: ['Ambiguity', 'Slow decisions', 'Beating around the bush', 'Micromanagement'],
        comunicacaoIdeal:
          'Direct and objective, with the deadline and goal up front. Get to the point, bring the decision to be made, and skip the long intro that makes them tune out.',
        ondeBrilha: [
          'Leading a project with a tight deadline and an aggressive goal',
          'Tough negotiations where you must hold your position',
          'Crisis moments, when most freeze and someone must decide',
          'Opening a new front from scratch, with no ready-made process',
          'Operational turnarounds that require cutting what does not work fast',
        ],
        sobEstresse:
          'Becomes more controlling and blunt, tries to regain command of everything and runs over whoever is in the way. The rush turns into open impatience.',
      },
      I: {
        nome: 'The Communicator',
        biografia:
          'You are the type who lights up the room on arrival. You make friends easily, strike up conversation with people you just met, and turn a quiet group into a lively team in minutes. Your ideas come in bursts, and your enthusiasm is genuine enough to rub off even on the most skeptical. When it is time to sell an idea, engage people, or reignite the morale of a tired team, few do it as well as you.\n\nYour strength is that rare ability to connect with and mobilize people. The flip side is that, in the heat of excitement, you start many things and finish few, dodge the tedious detail, and sometimes promise more than you can deliver just to please. Recognition drives you so much that a curt criticism can knock you down more than it should, and isolation drains you fast.\n\nYou perform best in settings with people, movement, and visibility, and work better alongside someone organized who catches the detail you let slip. The care is to learn to close what you open and to separate enthusiasm from commitment: a kept promise is worth more than ten lively speeches. Balancing energy with focus turns your charisma into real results.',
        qualidades: [
          'Builds rapport with almost anyone in minutes and opens doors for the team',
          'Fires up the team with genuine enthusiasm and reignites morale when it drops',
          'Generates new ideas in bursts and sees possibilities others miss',
          'Convinces and engages naturally, selling an idea internally with ease',
          'Brings lightness and good humor that make the environment pleasant to work in',
        ],
        pontosDeAtencao: [
          'Starts many projects at once and finishes few',
          'Dodges the detail and dry work, leaving gaps that surface later',
          'Promises more than they can deliver to please in the moment',
          'Loses focus easily and misses the priority of the week',
          'Suffers too much from curt criticism and seeks approval in ways that hinder the decision',
        ],
        comoLiderar: [
          'Give public recognition for deliveries, it is what motivates this person most',
          'Pair with someone organized who handles the detail and follow-through',
          'Help keep focus on a few priorities at a time',
          'Always bring criticism together with recognition, never just the correction',
          'Ground their promises into concrete deadlines and deliverables',
        ],
        oQueEvitar: ['Too many rules and detail', 'Criticism without recognition', 'Isolation'],
        comunicacaoIdeal:
          'Warm and with room to talk, valuing the person’s ideas. Open with recognition before pushing, because they shut down when met with coldness up front.',
        ondeBrilha: [
          'Sales and service, where the relationship opens the conversation',
          'Relationships with clients and partners over the long term',
          'Marketing, events, and launches that call for energy',
          'Integrating a new team and improving the mood',
          'Presentations where you must charm and convince the audience',
        ],
        sobEstresse:
          'Talks too much, seeks approval, and scatters even further. Suffers when isolated and may promise the impossible just to ease the tension of the moment.',
      },
      S: {
        nome: 'The Supporter',
        biografia:
          'You are the type who holds the team together from the inside, without needing to be seen. You are patient with what takes time, loyal to those you trust, and carry a calm that settles others in tense moments. While the spotlight goes to whoever shouts loudest, it is your quiet care for the mood and the people that keeps the operation standing, especially in hard phases.\n\nYour strength lies in consistency and listening: you truly listen before taking a stand, help the colleague who needs it, and deliver with a steadiness leadership can trust blindly. The flip side is that, to preserve harmony, you avoid conflict even when it is needed, hold dissatisfactions in silence until they become wear and tear, and resist abrupt changes that land by surprise.\n\nYou perform best in a stable environment, with advance notice of changes and your role recognized. The care is to learn to voice discomfort on the spot instead of swallowing it, and to own the hard decision when it is yours. Saying what you think, even at the risk of small friction, protects the relationship far more in the long run than silence does.',
        qualidades: [
          'Stays calm and settles others in tense situations, stabilizing the group',
          'Truly listens before taking a stand, and people feel welcomed',
          'Is loyal and steady with those they trust, delivering with predictable regularity',
          'Cares for the mood and helps a struggling colleague without being asked',
          'Sustains long routines without losing the standard, ideal for continuity roles',
        ],
        pontosDeAtencao: [
          'Avoids conflict even when it is needed, letting problems grow',
          'Holds dissatisfactions in silence until they become wear or resentment',
          'Resists abrupt changes and is slow to buy into the new',
          'Overloads in silence, without asking for help in time',
          'Slow to decide when the choice means owning something unpopular',
        ],
        comoLiderar: [
          'Announce changes ahead of time, they deliver far more when not caught by surprise',
          'Include them in decisions and ask their opinion before closing',
          'Value the loyalty and consistency that often go unnoticed',
          'Create a safe space for them to say what is bothering them',
          'Give explicit support when they need to own a hard decision',
        ],
        oQueEvitar: ['Abrupt change without notice', 'Public pressure', 'Rushing', 'Direct confrontation'],
        comunicacaoIdeal:
          'Calm and close, showing how the change helps the team and making sure they feel heard. Lower the tone, give time, and ask their opinion before deciding.',
        ondeBrilha: [
          'Support and service that require patience and listening',
          'HR and after-sales, keeping the bond alive long term',
          'Continuity roles where consistency matters more than speed',
          'Stabilizing a worn-down or conflicted team',
          'Critical routines that cannot swing from one day to the next',
        ],
        sobEstresse:
          'Withdraws and seeks safety, conflict paralyzes them. Absorbs everyone’s tension in silence and holds dissatisfaction instead of putting the problem on the table.',
      },
      C: {
        nome: 'The Analyst',
        biografia:
          'You are the type who notices the detail most people miss. Before deciding, you gather the data, check it more than once, and only sign off when what you deliver meets the standard you set for yourself, which tends to be high. Where others improvise, you have method, and it is exactly that rigor that makes the team trust that what passed through your hands is right.\n\nYour strength is quality and depth: you are an expert at what you do, you raise the bar on everything you touch, and you are reliable on the critical deliveries that cannot fail. The flip side is that perfectionism can stall delivery in pursuit of a certainty that never arrives, your manner can come across as cold, and your criticism, too harsh, both with others and with yourself. Rushing without notice destabilizes you more than most imagine.\n\nYou perform best with clear criteria, reliable data, and time to do it well. The care is to agree in advance on what is "good enough" and to accept that, at certain moments, delivering on time is worth more than chasing perfect. Bringing recognition alongside correction, and a little warmth to your contact, lets your rigor deliver without pushing people away.',
        qualidades: [
          'Notices details and risks most people miss, avoiding costly mistakes',
          'Decides on facts and data, not impulse, and stands by the choice',
          'Checks their own work before releasing it, with a very low error rate',
          'Raises the quality standard of everything that passes through their hands',
          'Is a reliable expert at what they do, a technical reference for the team',
        ],
        pontosDeAtencao: [
          'Perfectionism stalls delivery in pursuit of a certainty that never comes',
          'The cooler manner can push people away and come across as distant',
          'Criticism comes out too harsh, with themselves and with others',
          'Rushing and a tight deadline without notice destabilize them',
          'May get lost in the tiniest detail while the overall deadline tightens',
        ],
        comoLiderar: [
          'Give clear criteria and data, they decide better when the ground is mapped',
          'Allow independent work and respect the technical autonomy',
          'Bring specific, gentle feedback, not vague or harsh',
          'Agree in advance on what is "good enough" to avoid paralysis',
          'Announce deadlines ahead of time, the last-minute shock stalls them',
        ],
        oQueEvitar: ['Vague instructions', 'Tight deadlines without notice', 'Harsh criticism', 'Improvisation'],
        comunicacaoIdeal:
          'Fact based, preferably in writing, with context and advance notice. Bring the data that backs the request and give time to process before demanding the decision.',
        ondeBrilha: [
          'Analysis and quality control that tolerate no error',
          'Finance, processes, and audit, where criteria are everything',
          'Technical documentation and standards that demand precision',
          'Critical tasks where a single flaw costs dearly',
          'Reviewing and checking others’ work',
        ],
        sobEstresse:
          'Seeks more data and rules and freezes for fear of getting it wrong. Closes in on the detail, hardens the criticism, and rejects any shortcut that is not proven.',
      },
      DI: {
        nome: 'The Motivator',
        biografia:
          'You are the type who blends the ambition of someone who wants results with the charisma of someone who knows how to carry people along. You set the goal, take the stage, and mobilize the team at a speed few can match. Where drive is missing, you bring energy; where direction is missing, you point the way. It is a profile built for turnarounds, launches, and dynamic settings where you must decide fast and engage at the same time.\n\nYour strength is that rare combination of focus on results with power to influence: you not only know where you want to go, you make the team want to get there with you. The flip side is that you run over and scatter at the same time, promise more than the team can deliver, and lose patience with the detail that backs up the promise. In the excitement, it is easy to take on more fronts than you can close.\n\nYou perform best with a stage, an ambitious goal, and visibility, alongside someone who handles the detail you let slip. The care is to ground the excitement in realistic commitments and to hold yourself to focus on what was already promised before opening the next front. Fewer loose ideas and more closed bets turn your drive into results that last.',
        qualidades: [
          'Sets the goal and mobilizes the team behind it at a rare speed',
          'Combines focus on results with the power to engage and sell the idea',
          'Brings energy that reignites morale and gets the operation moving fast',
          'Communicates directly, but with warmth, without sounding cold like a pure D',
          'Takes on turnarounds and launches with courage and enthusiasm at once',
        ],
        pontosDeAtencao: [
          'Runs over people and scatters attention at the same time',
          'Promises more than the team can deliver on deadline',
          'Loses patience with the detail that backs up their own promise',
          'Takes on more fronts than they can close, in the heat of excitement',
          'Speeds up so much they leave the team without breath to keep up',
        ],
        comoLiderar: [
          'Give a stage and ambitious goals, it is where this person comes alive',
          'Pair with someone who handles the detail and follow-through',
          'Hold focus on what was already promised before opening a new front',
          'Ground the promises into realistic deadlines and deliverables',
          'Recognize the turnarounds won, publicly',
        ],
        oQueEvitar: ['Routine', 'Slowness', 'Low-visibility environments'],
        comunicacaoIdeal:
          'Objective and lively, with an ambitious goal and recognition along the way. Bring the big challenge up front and show the visibility the delivery creates.',
        ondeBrilha: [
          'Dynamic, high-visibility settings with an aggressive goal',
          'Sales leadership and sales teams',
          'Launches and campaigns that call for energy and direction',
          'Operational turnarounds on a short deadline',
          'Rallying a discouraged team around an objective',
        ],
        sobEstresse:
          'Speeds up too much and takes on more than they can deliver. Talks louder, pushes harder, and ignores the signs that the team can no longer keep pace.',
      },
      ID: {
        nome: 'The Persuader',
        biografia:
          'You are the type who charms first and pushes after. You arrive full of social energy, win people over in conversation, and then use that influence to create momentum and make things happen. It is a high-impact profile, built to sell, present, and win business, in situations where convincing counts as much as delivering.\n\nYour strength is the ability to mobilize fast: you open doors with charisma and walk through them with assertiveness. The flip side is that, in the excitement of convincing, you promise more than you deliver, dodge the detail, and sometimes sound over the top, insisting on persuasion even when the signals say it is time to step back. Recognition drives you, and without it your energy drains.\n\nYou perform best in settings with people, movement, and impact goals, away from static routine and solitary work. The care is to anchor your promises in concrete deadlines and to read the moment to stop pushing. Knowing when to back off, and keeping what you promised in the heat of the conversation, turns your talent for convincing into long-term trust.',
        qualidades: [
          'Wins the group over in conversation, then uses the relationship to create movement',
          'Convinces with high social energy and builds momentum where there was inertia',
          'Opens doors with charisma and walks through them with assertiveness',
          'Is strong in high-impact sales and presentations that must excite',
          'Reignites the energy of the room and pulls people toward action',
        ],
        pontosDeAtencao: [
          'Promises more than they can deliver in the heat of the conversation',
          'Dodges the detail that backs up the promise made',
          'May sound over the top and lose credibility with more skeptical profiles',
          'Insists on persuasion even when it is time to step back',
          'Drains when recognition and movement are missing',
        ],
        comoLiderar: [
          'Recognize publicly, it is this person’s main fuel',
          'Ground the promises into concrete deadlines and deliverables',
          'Give impact goals and visibility, avoid the routine that dims them',
          'Help them read the moment to stop pushing',
          'Pair with someone who sustains the detail they let slip',
        ],
        oQueEvitar: ['Static environments', 'Too many rules', 'Solitary work'],
        comunicacaoIdeal:
          'Warm and direct, with room to persuade and a clear goal at the end. Recognize first, then bring the impact challenge that mobilizes them.',
        ondeBrilha: [
          'High-impact sales where convincing is half the game',
          'Presentations and pitches that must excite the audience',
          'Fundraising and prospecting that require opening doors',
          'Rallying a group fast around an idea',
          'Reactivating cooled-off clients or partners',
        ],
        sobEstresse:
          'Keeps persuading and ignores signs that it is time to step back. Talks more, promises more, and pushes harder, even when the group is no longer buying.',
      },
      DC: {
        nome: 'The Challenger',
        biografia:
          'You are the type who wants the result, but not at any cost: you want the result at the right standard. You combine the assertiveness of someone who decides fast with the rigor of someone who releases nothing below the bar. Where one profile only chases the deadline and another only chases quality, you chase both, and it is exactly that double demand that makes your work a reference.\n\nYour strength is delivering results at a high standard at the same time, something rare in a single profile: you have the courage to act and the criteria to act right. The flip side is that the same demand turns into harshness. You demand too much, have little patience with mistakes, and when something comes out below what you consider acceptable, you want to redo it all until perfect, even when the deadline will not allow it.\n\nYou perform best on demanding projects, technical management, and situations where results and quality cannot be traded off against each other. The care is to recognize that not every detail justifies stalling delivery, and that the team performs better with recognition than with pressure alone. Agreeing in advance on what is non-negotiable and what can give way for the deadline keeps your demand from stalling what it should unblock.',
        qualidades: [
          'Chases results and quality at the same time, raising the delivery level',
          'Unites the courage to act with the criteria to act right',
          'Keeps a high standard and releases nothing below the acceptable bar',
          'Is strategic and demanding, weighing the result and the risk together',
          'Catches avoidable mistakes before they turn into losses',
        ],
        pontosDeAtencao: [
          'Demands too much and has little patience with others’ mistakes',
          'Wants to redo everything to perfection, even with no time for it',
          'Tough and perfectionist at once, wears the team down',
          'May stall delivery by not accepting "good enough"',
          'The too-direct manner comes across as coldness under pressure',
        ],
        comoLiderar: [
          'Bring clear goals and objective criteria, they decide better with a defined standard',
          'Respect the technical autonomy and the high standard they hold',
          'Recognize the quality delivered, do not only demand the next one',
          'Agree in advance on what is non-negotiable and what gives for the deadline',
          'Point out factually when the demand is stalling delivery',
        ],
        oQueEvitar: ['Ambiguity', 'Low standards', 'Improvisation'],
        comunicacaoIdeal:
          'Direct and well-founded, with data and a clear result up front. Bring the objective criteria and the expected standard, with no ambiguity they will not tolerate.',
        ondeBrilha: [
          'Demanding projects that need results with quality',
          'Technical management where the standard cannot drop',
          'Situations that require a fast decision without giving up criteria',
          'Quality control on a tight deadline',
          'Fronts that would stall for lack of rigor or of courage',
        ],
        sobEstresse:
          'Becomes critical and controlling, wants to redo everything until perfect. Hardens the manner, demands even more, and stalls delivery chasing the ideal standard.',
      },
      CD: {
        nome: 'The Achiever',
        biografia:
          'You are the type who decides, but only after looking at the data. First you analyze, gather the facts, and form a criterion; then you act firmly, without hesitating. Where some decide on instinct and others stall in analysis, you combine both sides: you have the rigor of someone who checks and the decisiveness of someone who executes. It is a profile built for technical decisions, control, and situations where a mistake costs dearly.\n\nYour strength is that grounded firmness: you do not act in the dark nor freeze waiting for absolute certainty. You execute with rigor and back the decision with numbers. The flip side is that you can be cold and impatient with others’ guesswork, stall from over-analysis when the data does not add up, and carry a too-direct manner that comes across as harsh to those expecting more tact.\n\nYou perform best with reliable data, autonomy to decide by criteria, and no emotional pressure on top. The care is to remember that not every decision waits for perfect data, and that the people around you need a little more warmth than precision. Accepting to act on incomplete information at certain moments, and softening your contact, lets your rigor deliver without pushing the team away.',
        qualidades: [
          'Analyzes the data and then acts firmly, without hesitating on the decision',
          'Combines the rigor of someone who checks with the decisiveness of someone who executes',
          'Backs the choice with facts and numbers, not impulse',
          'Executes with rigor tasks that tolerate no error',
          'Brings criteria to risky decisions, reducing impulsive error',
        ],
        pontosDeAtencao: [
          'Cold and impatient with others’ guesswork',
          'May stall from over-analysis when the data does not add up',
          'The too-direct manner comes across as harsh to those expecting tact',
          'Rejects what is unproven, even under a tight deadline',
          'Closes in on the numbers and loses the read of people',
        ],
        comoLiderar: [
          'Bring reliable data, they decide better with the information at hand',
          'Let them decide on criteria, with no emotional pressure',
          'Avoid demanding a decision at high volume, bad data stalls them more than the rush',
          'Give technical autonomy and recognize the solidity of the analysis',
          'Ask them to bring the conclusion before the detail, to speed things up',
        ],
        oQueEvitar: ['Emotional decisions', 'Bad data', 'Lack of criteria'],
        comunicacaoIdeal:
          'Objective and fact based, with numbers that back the decision. Bring the conclusion and the supporting data, with no emotional appeal they will disregard.',
        ondeBrilha: [
          'Finance and engineering, where the number rules',
          'Technical decisions that require firm criteria',
          'Control and audit that cannot fail',
          'Risky choices where you must act right, not just fast',
          'Diagnosing a problem based on data',
        ],
        sobEstresse:
          'Closes off into the data and hardens, rejecting anything unproven. Grows even colder and more impatient, and stalls urgent decisions waiting for certainty that never comes.',
      },
      IS: {
        nome: 'The Collaborator',
        biografia:
          'You are the type who makes the team feel at home. Warm and empathetic, you connect people, create a light mood, and sense when someone is not okay before they even say it. Where there is tension, you soften it; where there is distance, you close it. It is the kind of presence that makes people want to work together and feel safe to ask for help.\n\nYour strength is genuine care for people and the ability to keep the group together over the long term. You open the door with friendliness and keep the bond alive with consistency, a strong combination in service and in any role that depends on relationships. The flip side is that, to preserve harmony, you avoid conflict and accountability, struggle to make the unpopular decision, and put off the hard stuff, absorbing everyone’s tension instead of resolving it.\n\nYou perform best on harmonious teams, in a stable, friendly environment, and with explicit support when the hard decision must be yours. The care is to learn that avoiding the needed confrontation only delays the problem and overloads you. Voicing the hard thing in your welcoming way, without swallowing the tension, protects both the relationship and your own energy.',
        qualidades: [
          'Senses when someone is not okay before they say it, and welcomes them',
          'Connects people and creates a light mood the team wants to work in',
          'Keeps the bond with clients and colleagues alive over the long term',
          'Softens tensions and closes the distance with whoever is far off',
          'Makes the group feel safe to speak up and ask for help',
        ],
        pontosDeAtencao: [
          'Avoids conflict and accountability to preserve harmony',
          'Struggles to make the unpopular decision and puts off the hard stuff',
          'Absorbs everyone’s tension instead of resolving it',
          'Holds their own discomfort in to avoid friction',
          'May overload by caring for everyone but themselves',
        ],
        comoLiderar: [
          'Value their care for people, which sustains the team’s mood',
          'Give explicit support on hard, unpopular decisions',
          'Provide a stable, friendly environment where they perform best',
          'Encourage them to voice discomfort early, before it turns into resentment',
          'Avoid leaving them alone facing a confrontation they would avoid',
        ],
        oQueEvitar: ['Constant tension', 'Unpopular decisions without support', 'Coldness'],
        comunicacaoIdeal:
          'Friendly and welcoming, recognizing the effort to keep the group together. Bring the hard thing with care and make clear the bond is preserved.',
        ondeBrilha: [
          'Harmonious teams that depend on relationships and trust',
          'Customer service and success over the long term',
          'Facilitation and integrating new people',
          'Environments that need a light mood to perform',
          'Bridging areas or people in friction',
        ],
        sobEstresse:
          'Absorbs everyone’s tension and avoids the confrontation that would solve it. Goes quiet, puts off the hard thing, and overloads by holding their own discomfort in.',
      },
      SI: {
        nome: 'The Facilitator',
        biografia:
          'You are the type who stitches the group together from the inside. Steady and gentle, you bridge people who do not understand each other, mediate friction calmly, and build the cohesion that holds a team together. Where dialogue is missing, you open the channel; where there is noise, you translate. It is a presence that rarely takes the stage, but without which the stage would fall apart.\n\nYour strength is that ability to create cohesion and read the mood of the group before a problem blows up. You are the friendly mediator everyone trusts. The flip side is that, disliking friction, you put off the needed confrontation, resist fast change, and hold your own dissatisfaction in instead of putting it on the table, letting the discomfort pile up in silence.\n\nYou perform best with advance notice of changes, your bridging role recognized, and a mood that is not hostile. The care is to learn that mediating is not swallowing: putting your own dissatisfaction into the conversation, and facing friction when it is needed, strengthens the cohesion you value so much, rather than weakening it.',
        qualidades: [
          'Bridges people who do not understand each other and reduces friction',
          'Reads the group’s mood before a problem blows up',
          'Builds cohesion and keeps the team together day to day',
          'Mediates conflicts calmly and is the mediator everyone trusts',
          'Is steady and gentle, a stable presence for the group',
        ],
        pontosDeAtencao: [
          'Puts off the needed confrontation to avoid friction',
          'Resists fast change and is slow to buy in',
          'Holds their own dissatisfaction in instead of putting it on the table',
          'Lets discomfort pile up in silence',
          'May mediate others’ issues so much they forget their own',
        ],
        comoLiderar: [
          'Announce changes early, they need time to digest and adapt',
          'Ask for the group’s read, they see the mood before others',
          'Recognize the bridging role, which often goes unnoticed',
          'Encourage them to put their own dissatisfaction into the conversation',
          'Avoid a hostile mood and public pressure, which make them withdraw',
        ],
        oQueEvitar: ['Fast change', 'Hostile mood', 'Public pressure'],
        comunicacaoIdeal:
          'Close and calm, showing the positive impact on the group. Give time, announce changes early, and recognize the bridging role they fulfill.',
        ondeBrilha: [
          'Team cohesion and keeping the mood healthy',
          'Mediating conflicts between people or areas',
          'Onboarding and integrating new members',
          'Bridging teams that do not communicate well',
          'Long-term settings that depend on stable relationships',
        ],
        sobEstresse:
          'Withdraws and avoids friction, even when it is needed. Holds dissatisfaction in, puts off the hard conversation, and lets discomfort grow in silence.',
      },
      SC: {
        nome: 'The Methodical',
        biografia:
          'You are the type leadership trusts to keep things from failing. You follow the process, respect the procedure, and deliver with a consistency that barely varies from one day to the next. Where others improvise, you have method; where others fumble in the rush, you keep the standard. It is a profile built for precision routines that tolerate no surprise.\n\nYour strength is reliability: a low error rate, care for detail, and respect for the rules that hold the operation together. Whoever works with you knows the agreement will be kept, the right way. The flip side is that the same solidity turns into rigidity. You resist change, even the necessary kind, are slow to adapt, and can cling to the procedure to the point of freezing in the face of the unexpected.\n\nYou perform best with a clear process, a stable environment, and changes announced in advance and explained in their why. The care is to learn that not every change is a threat, and that sometimes the procedure must give way to reality. Understanding the reason behind the new, and giving yourself permission to adapt, lets your reliability keep pace with the business instead of stalling it.',
        qualidades: [
          'Follows the process and keeps the standard even in the rush',
          'Delivers with a consistency that barely varies from one day to the next',
          'Has a very low error rate and minds the detail that holds the operation',
          'Respects rules and procedures, giving the team predictability',
          'Is reliable for precision routines that tolerate no surprise',
        ],
        pontosDeAtencao: [
          'Resists change, even the necessary kind',
          'Is slow to adapt when the scenario shifts',
          'May cling to the procedure to the point of freezing at the unexpected',
          'Rigid and risk-averse, avoids what leaves the familiar routine',
          'Settles into a routine that no longer serves, out of comfort',
        ],
        comoLiderar: [
          'Give a clear, stable process, it is where this person performs best',
          'Explain the why of the change, not just what changes',
          'Respect the careful pace, with no last-minute rush',
          'Announce changes ahead of time and give adaptation time',
          'Show with data that the change brings real gain, to overcome resistance',
        ],
        oQueEvitar: ['Abrupt change', 'Ambiguity', 'Rushing without notice'],
        comunicacaoIdeal:
          'Clear and structured, with a step-by-step and advance notice. Explain the why of the change and give time to absorb it before demanding the new.',
        ondeBrilha: [
          'Well-run precision routines that cannot swing',
          'Processes and operations that depend on a constant standard',
          'Quality control and checking',
          'Roles that require following the procedure to the letter',
          'Stable environments where reliability matters more than speed',
        ],
        sobEstresse:
          'Clings to the procedure and freezes in the face of the unexpected. Resists change even more and retreats into the familiar routine to feel safe.',
      },
      CS: {
        nome: 'The Perfectionist',
        biografia:
          'You are the type who delivers quality with care, without fanfare. Thorough and cooperative, you sustain a high standard quietly, without needing to be seen, and you are reliable within a team where the detail matters. Where others let things slide, you check; where others accept the passable, you polish the finish. You are the silent guarantee that the work will come out well done.\n\nYour strength is precision paired with care for people: you deliver at standard without creating friction, reviewing and checking with a dedication the team trusts. The flip side is that excess diligence can stall you, delegating is hard because it feels like no one will do it at your level, and a sudden turnaround destabilizes you more than most imagine.\n\nYou perform best with clear criteria, time to do it well, and realistic expectations, away from impossible deadlines. The care is to agree in advance on what is "good enough" and to accept that reworking endlessly in pursuit of perfect only delays what was already done. Trusting colleagues’ judgment enough to delegate, and giving yourself permission to deliver at the right point, frees your care to perform without stalling.',
        qualidades: [
          'Sustains a high standard quietly, without needing to be seen',
          'Delivers quality without creating friction with the surrounding team',
          'Reviews and checks with a dedication colleagues trust',
          'Is thorough and cooperative at once, a rare combination',
          'Catches detail flaws that would slip past others',
        ],
        pontosDeAtencao: [
          'Stalls from excess diligence chasing the perfect finish',
          'Struggles to delegate because it feels no one will do it at their level',
          'Suffers with sudden turnarounds and unrealistic deadlines',
          'Reworks endlessly and delays what was already done',
          'May take on too much by not trusting others’ work',
        ],
        comoLiderar: [
          'Define "good enough" criteria to avoid paralysis',
          'Give time and context, the last-minute shock destabilizes them',
          'Recognize the care, which tends to be silent',
          'Encourage delegating, showing they can trust a colleague’s judgment',
          'Bring realistic deadlines, not vague or impossible expectations',
        ],
        oQueEvitar: ['Sudden turnarounds', 'Vague expectations', 'Unrealistic deadlines'],
        comunicacaoIdeal:
          'Detailed and respectful, with realistic criteria and deadlines. Agree on what is "good enough" and avoid the last-minute turnaround that stalls them.',
        ondeBrilha: [
          'Precision within a team, without friction',
          'Reviewing and checking the work before it ships',
          'Documentation and controls that demand care',
          'Tasks that call for a high standard and discretion',
          'Critical processes where the double check prevents losses',
        ],
        sobEstresse:
          'Reworks endlessly chasing perfect and delays delivery. Stalls from diligence, struggles even more to delegate, and overloads trying to guarantee everything alone.',
      },
      DS: {
        nome: 'The Planner',
        biografia:
          'You are the type who decides firmly and then sustains the decision to the end. You combine the drive of someone who likes to command with the method of someone who executes the plan with consistency. Where some start and abandon, you start and finish; where some change course with every gust, you hold firm on the set direction. It is a profile built for planned execution and mid-term goals.\n\nYour strength is that blend of decisiveness with consistency: you set the plan, own the choice, and deliver without dropping it midway. Leadership trusts you to take something from start to finish. The flip side is that, once decided, you can turn stubborn, are slow to change course even when the scenario already has, and hold yourself to account with a harshness that sometimes weighs.\n\nYou perform best with the plan aligned up front, autonomy to execute, and clear reasons when an adjustment is needed. The care is to remember that insisting on the original plan when reality has turned is rigidity, not consistency. Making room to review the route in light of new facts, and easing your own demand, lets your firmness deliver without turning into stubbornness.',
        qualidades: [
          'Decides firmly and sustains the choice to the end, without dropping it midway',
          'Combines the drive to command with the method to execute the plan',
          'Holds firm on the set direction, without changing course with every gust',
          'Takes something from start to finish, cutting down abandoned projects',
          'Provides the initial push and sustains consistency in long routines',
        ],
        pontosDeAtencao: [
          'Turns stubborn once decided and is slow to change course',
          'Sticks to the original plan even when the scenario has changed',
          'Holds themselves to account with a harshness that weighs',
          'Resists adjustments that do not come with a clear reason',
          'Confuses consistency with rigidity in scenarios that call for flexibility',
        ],
        comoLiderar: [
          'Align the plan up front, they execute better with the direction clear',
          'Bring concrete facts to justify route changes',
          'Respect the consistency and the delivery to the end',
          'Help review the route in light of new facts, without sounding like a whim',
          'Recognize the firmness, but point out when it turns into stubbornness',
        ],
        oQueEvitar: ['Rigidity with self', 'Change without a clear reason', 'Improvisation'],
        comunicacaoIdeal:
          'Objective and planned, with firm goals and reasons for any change. Bring the fact that justifies the route change, or they read it as a whim.',
        ondeBrilha: [
          'Planned execution from start to finish',
          'Mid-term goals that require consistency',
          'Stable operations that cannot be abandoned midway',
          'Projects that need a firm decision and follow-through',
          'Long routines that depend on an initial push and consistency',
        ],
        sobEstresse:
          'Sticks to the original plan even when the scenario has changed. Turns more stubborn, resists the adjustment, and holds themselves to account even harder for the deviation.',
      },
      IC: {
        nome: 'The Consultant',
        biografia:
          'You are the type who joins the charm of someone who connects with the rigor of someone who delivers it right. Sociable and precise, you explain the complex in a way people understand and back what you say with data that holds up. Where one profile only charms and another only goes deep, you do both: you win the audience and prove the point. It is a profile built for consulting, training, and for selling or explaining something technical.\n\nYour strength is that rare union of relationship and technique: you open the door with friendliness and sustain credibility with correct content. Creativity paired with a critical eye produces solutions that also pass the quality test. The flip side is that you suffer in solitary technical work, swing between talking and reviewing without closing either, and may get lost in detail when you should conclude.\n\nYou perform best with interaction, a good technical problem to solve, and recognition for the clarity of your explanation, away from long isolation and monotonous tasks. The care is not to let the conversation swallow the rigor, nor the rigor kill the flow: balancing the two is your point of equilibrium. Finding the middle ground between charming and proving turns your double talent into consulting that convinces and holds up.',
        qualidades: [
          'Explains the complex in a way people understand',
          'Unites the charm of someone who connects with the rigor of someone who delivers right',
          'Sustains credibility with data, not just friendliness',
          'Generates creative solutions that also pass the quality test',
          'Is strong at selling or explaining something technical to an audience',
        ],
        pontosDeAtencao: [
          'Suffers in solitary technical work with no interaction',
          'Swings between talking and reviewing without closing either',
          'May get lost in detail when they should conclude',
          'Takes technical criticism as if it were personal and loses heart',
          'Spontaneity sometimes runs over the precision they themselves value',
        ],
        comoLiderar: [
          'Give interaction and a good technical problem to solve',
          'Recognize the clarity of the explanation, it is what they value',
          'Avoid long isolation and monotonous tasks, which dim them',
          'Bring technical criticism with recognition, not just correction',
          'Help them close between talking and reviewing, without endless swinging',
        ],
        oQueEvitar: ['Isolation without interaction', 'Monotonous tasks', 'Lack of context'],
        comunicacaoIdeal:
          'Friendly and precise, with room to dialogue and data to back it up. Bring the technical problem and recognize the clarity of the explanation they offer.',
        ondeBrilha: [
          'Explaining or selling something technical to an audience',
          'Consulting that unites relationship with correct content',
          'Training and coaching that demand clarity',
          'Technical presentations where you must charm and prove',
          'Bridging the technical area and the client or leadership',
        ],
        sobEstresse:
          'Talks a lot to ease tension and loses the rigor of detail. Swings between talking and reviewing without closing, and takes technical criticism as if it were personal.',
      },
    },

    // ── Relationships between pairs of primary profiles ──────────────────────
    relationships: {
      DD: {
        friction: [
          `In meetings, both compete for the last word, and a simple decision turns into an arm-wrestle that stalls the team.`,
          `Neither one backs down in an argument, so small disagreements escalate into direct confrontation in front of the team.`,
          `Each one takes on the same workstream without aligning first, and the result is rework and contradictory orders to their reports.`,
          `Their high ego makes admitting a mistake feel like defeat, so failures go uncorrected because nobody gives in.`,
          `Their shared rush for results runs over alignment, and the team ends up with goals that change midway.`,
        ],
        synergy: [
          `When the scope is divided, both decide fast and unblock projects that would stall with more cautious profiles.`,
          `Shared ambition pulls bold targets upward, and each becomes a benchmark of energy and pace for the other.`,
          `Under pressure or in a crisis, neither one freezes, and together they hold the operation when everything is on fire.`,
          `They hold each other to the same delivery bar, so the pair keeps a high results standard without outside supervision.`,
          `In tough negotiations, they form a firm front that the other side can rarely bend.`,
        ],
        communication:
          `Agree in advance who leads each workstream and put it in writing, so the meeting does not become a fight for the last word. Each should enter the conversation willing to concede at least one point, treating disagreement as data, not a personal attack. Feedback between the two works best one-on-one and direct, with no audience that turns it into a power struggle. Set an objective decision criterion (a number, a deadline, a goal) to break ties without it becoming about ego.`,
      },
      DI: {
        friction: [
          `D demands deadlines and finished work, while I shows up full of loose ideas, so D starts seeing I as scattered and unreliable.`,
          `I feels D is cold and blunt, and after a few curt cut-offs starts avoiding raising issues and hiding problems.`,
          `D's fast pace runs over I's need to talk and be recognized, draining the energy I would otherwise bring to the team.`,
          `I promises more than they can deliver to please, and D gets irritated when the delivery does not match the upbeat pitch.`,
          `In meetings, I stretches things out with stories and D cuts in halfway, and neither leaves feeling heard.`,
        ],
        synergy: [
          `D drives the result and sets the goal, I engages people and sells the idea, a strong duo for launches and operational turnarounds.`,
          `I softens D's impact on people, translating hard demands into language the team accepts without losing motivation.`,
          `Together they cover the two sides almost no single profile delivers: focus on results and the ability to influence and mobilize.`,
          `D gives focus and a deadline to I's enthusiasm, turning many loose ideas into a few genuinely executed bets.`,
          `In low-morale moments, D sets the direction and I reignites the energy, and the team gets moving fast again.`,
        ],
        communication:
          `D should open with a line of recognition before pushing, because I shuts down when met with coldness up front. I needs to come to conversations with focus and a concrete deadline, cutting the long intro that makes D tune out. Agree that I's new ideas go into a list for later, not into the middle of a decision that was already settled. In meetings, D drives the goal and I drives the engagement, each respecting the other's space instead of fighting for command.`,
      },
      DS: {
        friction: [
          `D wants to change everything now and S needs time and notice, so changes land as a surprise and S feels run over.`,
          `S protects the team's stability and pace, and D reads that as slowness or deliberate resistance.`,
          `Under pressure, D gets blunter and S shuts down, storing up frustrations that only surface once they have become wear and tear.`,
          `D decides alone and communicates the finished call, while S expected to be consulted, and trust between them erodes.`,
          `D measures value by fast results and S by consistency and relationships, so each thinks the other cares about the wrong thing.`,
        ],
        synergy: [
          `D leads and decides, S steadies and executes consistently, a pair that combines decision speed with firm delivery through to the end.`,
          `S looks after the relationships and mood D tends to overlook, protecting the team that D's pressure could otherwise wear down.`,
          `Once D sets the direction, S makes sure the plan is followed without being abandoned midway, cutting down half-finished projects.`,
          `S gives D a realistic read of how change affects people, avoiding fast decisions that break the operation.`,
          `In long routines, D provides the initial push and S sustains the consistency, keeping results going without needing fresh nudges.`,
        ],
        communication:
          `D should give context and flag changes in advance, because S delivers far more when not caught by surprise. S needs to speak up on the spot instead of agreeing on the surface and keeping the disagreement inside. In conversations, D benefits from slowing the tone and asking S's opinion before closing the decision. Split roles clearly: D owns the decisions and the pace, S owns steady execution and care for the team, with neither one invading the other's turf.`,
      },
      DC: {
        friction: [
          `D wants to decide fast and C needs data and time to analyze, so D reads C as a bottleneck and C reads D as reckless.`,
          `C flags risks and missing details, and D interprets it as resistance or excess bureaucracy in the middle of delivery.`,
          `Both are demanding but pull in opposite directions, D pushes for results on time and C pushes for flawless quality, and the team is caught in the crossfire.`,
          `When the deadline tightens, D wants to ship it as is and C refuses to release something below standard, and tension rises.`,
          `D decides by instinct and C by data, so each distrusts the other's method and the decision gets stuck in mutual suspicion.`,
        ],
        synergy: [
          `D drives the result and C ensures the quality, a strong pair for projects that must ship fast and to a high standard at the same time.`,
          `C catches D's avoidable mistakes before they become losses, acting as quality control without stalling delivery.`,
          `D gives C a sense of urgency and a deadline, keeping the analysis from stretching on endlessly in pursuit of perfect certainty.`,
          `In risky decisions, D brings the courage to act and C brings the criteria to act right, reducing both paralysis and impulsive error.`,
          `Together they raise the team's bar: D's speed with C's technical rigor, something rare in a single profile.`,
        ],
        communication:
          `D should bring the data they have and give C a minimum window to process before demanding the decision, or C freezes out of insecurity. C needs to lead with the essentials and the conclusion, leaving the detail for later, so D does not lose the thread or their patience. Agree in advance what is non-negotiable on quality and what can give way for the deadline, so the clash does not happen at the last minute. In meetings, D drives goal and deadline, C drives criteria and risk, and the final decision weighs both sides instead of one winning over the other.`,
      },
      II: {
        friction: [
          `Both talk a lot and execute little, the idea list grows with every meeting while concrete delivery shrinks.`,
          `Both want the stage, so they compete for the group's attention and meetings turn into a contest of who speaks more instead of a decision.`,
          `Deadlines and details fall to the bottom for both, and important tasks slip because neither took on the tedious work.`,
          `Since both dodge the dry part, nobody tracks numbers or checklists, and problems only surface once they have blown up.`,
          `In the heat of enthusiasm, both promise more than the team can deliver, and the bill arrives later as frustration.`,
        ],
        synergy: [
          `The pair's energy is very high, and together they create a lively environment that motivates and rubs off on the rest of the team.`,
          `Double the creativity and networking makes ideas and connections flow, great for campaigns, events, and launches.`,
          `When they need to sell an idea internally, the two combine their influence and the proposal wins over the group fast.`,
          `In low-morale moments, the pair reignites the team's spirit and brings lightness back to a heavy mood.`,
          `The constant exchange of ideas between them produces creative solutions that more reserved profiles would rarely reach.`,
        ],
        communication:
          `Define early who executes what and put it in writing, because the good intentions of both fade without a clear owner. Agree on real deadlines and a fixed moment to review what actually got done, or it all becomes lively talk with no delivery. It helps to bring someone organized onto the team, or to take turns owning the tedious part each project. Use the energy to celebrate wins together, but separate the moment to celebrate from the moment to decide, so the meeting does not become just a party.`,
      },
      IS: {
        friction: [
          `I's fast pace and constant changes overload S, who needs predictability to perform well.`,
          `I gets frustrated with how long S takes to buy into something new, and starts pushing changes S has not yet digested.`,
          `S holds back frustrations to avoid friction, and I, distracted by their own energy, never notices something is wrong.`,
          `I switches topics and priorities all the time, and S feels insecure without knowing the real focus of the week.`,
          `When things heat up, I wants to resolve it by talking loud and fast, and S retreats, so the conversation never happens.`,
        ],
        synergy: [
          `I energizes and connects people, S supports and steadies, and together they form a warm, collaborative team that is pleasant to work in.`,
          `S gives consistency to I's energy, turning fleeting enthusiasm into relationships and routines that last.`,
          `S quietly handles the details and follow-through I leaves aside, covering the partner's weak spot.`,
          `With clients and the team, I opens the door and S keeps the bond alive long term, a strong combination in service roles.`,
          `The atmosphere of trust the two create makes the team feel safe to speak up and ask for help.`,
        ],
        communication:
          `I should slow down and flag changes in advance, giving S time to prepare instead of reacting in a rush. S needs to voice concerns openly as soon as they arise, instead of holding them until they turn into resentment. Agree on one clear priority per period, so S is not lost in I's constant shift of focus. In hard conversations, I benefits from lowering the tone and listening more, and S benefits from saying what they think even at the risk of a little friction.`,
      },
      IC: {
        friction: [
          `I's spontaneity clashes head-on with C's precision, and what looks like agility to one looks like sloppiness to the other.`,
          `C finds I disorganized and superficial, I finds C rigid and dull, and each underestimates the other's contribution.`,
          `I wants to start now and adjust along the way, C wants to plan everything first, and the pace gap causes friction at the start of any task.`,
          `C points out mistakes and inconsistencies, and I, who runs on recognition, takes it as personal criticism and loses heart.`,
          `In meetings, I brings vision and C brings caveats, and without mediation the conversation swings between loose optimism and stalling skepticism.`,
        ],
        synergy: [
          `I brings ideas, energy, and relationships, C brings rigor, quality, and depth, a rare balance between charming people and delivering well.`,
          `C grounds I's ideas into something concrete and doable, turning enthusiasm into a real plan.`,
          `Together they are great at explaining and selling technical topics, I brings the charm and clarity, C ensures the content is correct.`,
          `I opens doors and wins people over, C sustains credibility with data, a duo that is both convincing and trustworthy.`,
          `I's creativity combined with C's critical eye produces innovative solutions that also pass the quality test.`,
        ],
        communication:
          `I should bring facts and evidence to C, because enthusiasm alone does not convince someone who decides by data. C needs to open up to new ideas without demanding perfection in the first draft, and make sure criticism comes with recognition, not just correction. Agree on a moment to diverge freely and another to close with rigor, separating the brainstorm from the review. Split roles in a presentation: I drives the relationship and the narrative, C ensures the accuracy of the content, always seeking the middle ground between charming and proving.`,
      },
      SS: {
        friction: [
          `Both avoid conflict and let problems pile up unsaid, until a small friction becomes major wear and tear.`,
          `Decisions turn slow or get postponed indefinitely, because neither wants to own the hard call and take on the risk.`,
          `Both resist change, even the necessary kind, and the pair settles into a routine that no longer serves the team.`,
          `Frustrations stay bottled up on both sides, and the seemingly calm mood hides resentments no one puts into words.`,
          `With no one setting the pace, deadlines slip quietly because pushing the other feels like breaking the harmony.`,
        ],
        synergy: [
          `The harmony, loyalty, and cooperation between them are genuine, and the team feels a stable environment with no cliques.`,
          `The pair sustains the operation long term, giving the team a base of stability that holds the routine even through hard phases.`,
          `They create a safe environment where everyone feels heard, which makes the people around them raise problems sooner.`,
          `They work with patience and consistency, ideal for continuity, support, and people-care roles.`,
          `Their mutual loyalty makes the pair extremely reliable in moments that call for discretion and quiet support.`,
        ],
        communication:
          `Agree that being honest about a problem is not an attack, so both can voice discomfort even without enjoying the moment. Define who drives each decision and a deadline to make the call, or the choice keeps circling with no end. Schedule a regular conversation just to put on the table what is bothering them, creating a safe space for what no one would say in the hallway. Facing a necessary change, write down together the why and the gains, to overcome the natural resistance of both with argument rather than pressure.`,
      },
      SC: {
        friction: [
          `Both are cautious and risk-averse, and together they can freeze in the face of any decision involving uncertainty.`,
          `Over-analysis before changing anything makes the pair postpone moves the business needs to make soon.`,
          `S wants harmony and C wants precision, and at times C's attachment to the process overrides S's care for people.`,
          `Neither one likes confrontation, so disagreements about method go unresolved and drag on.`,
          `The pair gets too comfortable in the familiar routine and resists innovations even when they would bring clear gains.`,
        ],
        synergy: [
          `The pair's work is reliable, thorough, and consistently high quality, with very little variation from one day to the next.`,
          `The low error rate and respect for rules make them one of the most stable pairs for precision-driven routines.`,
          `S keeps the mood and C keeps the standard, and together they deliver quality without creating friction with the surrounding team.`,
          `They are the right pair for critical processes that cannot fail, because both check before releasing.`,
          `The blend of care for people and care for detail creates a predictable operation leadership can rely on.`,
        ],
        communication:
          `Work with clear processes and criteria set in writing, because both feel secure when the path is mapped out. Flag changes in advance and allow adaptation time, avoiding the shock that freezes S and the endless analysis that freezes C. Agree in advance on a deadline to close the analysis and act, so the caution of both does not turn into paralysis. Encourage each other to speak up when something is wrong, treating disagreement about method as part of the work, not as personal conflict.`,
      },
      CC: {
        friction: [
          `The perfectionism of both leads to analysis paralysis, and the pair delays delivery in pursuit of a certainty that never arrives.`,
          `Both tend to over-criticize, and mutual review turns into a back-and-forth of remarks that creates tension and wears the relationship down.`,
          `Neither moves forward without a level of certainty the other also does not consider sufficient, and the project stalls in endless checks.`,
          `Since both value detail, technical discussions stretch over tiny points while the overall deadline tightens.`,
          `Under pressure, both close in on the data even more and harden, rejecting any shortcut and stalling urgent decisions.`,
        ],
        synergy: [
          `The pair's precision, quality, and technical depth are exceptional, and the delivery standard sits above the market average.`,
          `Their high standard pulls up the level of everything that passes through their hands, raising the bar for the whole team.`,
          `They are reliable for critical tasks that tolerate no error, because one reviews the other and nothing ships without a double check.`,
          `Together they produce impeccable documentation, analyses, and controls, a solid base the rest of the company can rely on.`,
          `The exchange between two rigorous eyes usually catches flaws that any single profile would miss.`,
        ],
        communication:
          `Agree before starting on what is good enough and the definition of done, so you do not chase a perfection that stalls delivery. Set firm deadlines and a point at which analysis ends and the decision is made, even without total certainty. When reviewing each other's work, balance criticism with recognition of what turned out well, avoiding the wear of constant remarks. Split responsibilities so you do not check the same thing twice, trusting the partner's judgment instead of redoing everything on your own.`,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // es — Español (términos de mercado)
  // ═══════════════════════════════════════════════════════════════════════════
  es: {
    ui: {
      introTitle: 'Test de Perfil de Comportamiento (DISC)',
      introLead:
        'Toma unos 5 minutos. Responde pensando en tu día a día.',
      introStart: 'Comenzar',
      back: 'Volver',
      next: 'Siguiente',
      submit: 'Enviar respuestas',
      submitting: 'Enviando...',
      progress: 'Pregunta {current} de {total}',
      thanksTitle: '¡Gracias!',
      thanksLead:
        'Tus respuestas fueron registradas. El equipo de RR. HH. recibirá tu perfil.',
      alreadyDoneTitle: 'Respuestas ya enviadas',
      alreadyDoneLead:
        'Este cuestionario ya fue respondido. Habla con RR. HH. si necesitas rehacerlo.',
      loadError: 'No pudimos cargar el cuestionario. Inténtalo de nuevo.',
      resultTitle: 'Tu perfil de comportamiento',
      greeting: '¡Hola, {name}!',
      assessmentDisclaimer:
        'Responde con sinceridad: no marques lo que te gustaría ser o lo que crees que es lo "correcto", sino lo que más se parece a ti de verdad.',
      instructionsTitle: 'Cómo funciona',
      instructionsHowto:
        'Son 28 afirmaciones sobre tu forma de actuar. Toma unos 5 minutos.',
      instructionsDrag:
        'Arrastra la barra: a la derecha si tiene todo que ver contigo, a la izquierda si no tiene nada que ver, al centro si es neutral.',
      instructionsHonest:
        'No hay respuesta correcta ni incorrecta, ni perfil mejor ni peor. Responde pensando en lo que más se parece a ti de verdad.',
      aboutProfileTitle: 'Sobre tu perfil',
    },
    scale: {
      1: 'Nada que ver conmigo',
      2: 'Algo en desacuerdo',
      3: 'Neutral',
      4: 'Algo de acuerdo',
      5: 'Totalmente como yo',
      lowAnchor: 'Nada que ver conmigo',
      highAnchor: 'Totalmente como yo',
    },
    factors: {
      D: {
        name: 'Dominancia',
        short: 'D',
        tagline: 'Enfoque en resultados y acción',
        description:
          'Mide cuánto la persona toma el mando, decide rápido y va tras el resultado, aun corriendo riesgo. Un D alto disfruta el desafío, la confrontación directa y estar al control.',
        example:
          'Suele asociarse con Steve Jobs, por su visión firme, sus decisiones rápidas y su obsesión con el resultado.',
      },
      I: {
        name: 'Influencia',
        short: 'I',
        tagline: 'Enfoque en personas y energía',
        description:
          'Mide cuánto la persona conecta, entusiasma y convence a los demás. Un I alto aporta energía al grupo, disfruta la gente y anima el ambiente con optimismo.',
        example:
          'Suele asociarse con Oprah Winfrey, por su carisma, su conexión con las personas y su poder para involucrar a quienes la rodean.',
      },
      S: {
        name: 'Estabilidad',
        short: 'S',
        tagline: 'Enfoque en armonía y constancia',
        description:
          'Mide cuánto la persona valora la constancia, la armonía y la previsibilidad. Un S alto es paciente, leal, excelente oyente y sostiene al equipo a largo plazo.',
        example:
          'Suele asociarse con Warren Buffett, por su paciencia, su constancia y su visión de largo plazo.',
      },
      C: {
        name: 'Conformidad',
        short: 'C',
        tagline: 'Enfoque en calidad y criterio',
        description:
          'Mide cuánto la persona se guía por datos, reglas y un estándar de calidad. Un C alto analiza con calma, cuida el detalle y decide sobre hechos, no por impulso.',
        example:
          'Suele asociarse con Bill Gates, por su análisis, su método y su rigor técnico apoyado en datos.',
      },
    },
    charts: {
      barTitle: 'Gráfico DISC',
      radarTitle: 'Competencias Comportamentales',
      wheelTitle: 'Rueda de estilo',
      average: 'Promedio',
      wheelCenter: 'Adaptable',
      wheelEdge: 'Marcado',
      score: 'Puntaje',
    },
    attributes: {
      proactivity: 'Proactividad',
      resultsFocus: 'Enfoque en resultados',
      leadership: 'Liderazgo',
      communication: 'Comunicación',
      teamwork: 'Trabajo en equipo',
      patience: 'Paciencia',
      discipline: 'Disciplina',
      attentionToDetail: 'Atención al detalle',
    },
    competencies: {
      competitiveness: 'Competitividad',
      agility: 'Agilidad',
      confidence: 'Confianza',
      energy: 'Energía',
      flexibility: 'Flexibilidad',
      influence: 'Influencia',
      creativity: 'Creatividad',
      consistency: 'Consistencia',
      communication: 'Comunicación',
      empathy: 'Empatía',
      planning: 'Planificación',
      patience: 'Paciencia',
      analysis: 'Análisis',
      judgment: 'Criterio',
      security: 'Seguridad',
      discipline: 'Disciplina',
    },
    sections: {
      qualidades: 'Fortalezas',
      pontosDeAtencao: 'Puntos de atención',
      comoLiderar: 'Cómo liderar y comunicar',
      oQueEvitar: 'Qué evitar',
      comunicacaoIdeal: 'Comunicación ideal',
      ondeBrilha: 'Dónde brilla',
      sobEstresse: 'Bajo estrés',
      profileHeading: 'Perfil {code}',
    },
    disclaimer:
      'Esta es una herramienta de autoconocimiento y comunicación de equipo. No es una prueba clínica ni un diagnóstico. Ningún perfil es mejor o peor que otro.',
    items: {
      d1: 'Me gusta tomar el mando de las situaciones.',
      d2: 'Presiono para que las cosas ocurran al ritmo que quiero.',
      d3: 'Voy directo al grano, aunque suene duro.',
      d4: 'Me gusta competir y ganar.',
      d5: 'Tomo decisiones rápido, aun corriendo algún riesgo.',
      d6: 'Prefiero ceder antes que entrar en un enfrentamiento.',
      d7: 'Me cuesta decir que no.',
      d8: 'Asumo riesgos para alcanzar un objetivo.',
      d9: 'Disfruto los desafíos difíciles.',
      d10: 'Digo lo que pienso, sin rodeos.',
      d11: 'Prefiero que otra persona tome las decisiones difíciles.',
      d12: 'Me concentro en el resultado incluso bajo presión.',
      i1: 'Hago amistad con gente nueva con facilidad.',
      i2: 'Me gusta ser el centro de atención.',
      i3: 'Soy entusiasta y contagio a la gente a mi alrededor.',
      i4: 'Prefiero conversar e intercambiar ideas a trabajar solo.',
      i5: 'Mantengo el optimismo aun frente a los problemas.',
      i6: 'En un grupo grande, prefiero quedarme más callado.',
      i7: 'Hablo poco de mí mismo.',
      i8: 'Disfruto conocer gente nueva.',
      i9: 'Convenzo a las personas con facilidad.',
      i10: 'Aporto buen humor al ambiente de trabajo.',
      i11: 'Prefiero trabajar solo antes que en grupo.',
      i12: 'Me entusiasmo con las ideas nuevas.',
      s1: 'Tengo paciencia con los procesos lentos.',
      s2: 'Prefiero la rutina y la previsibilidad a las sorpresas.',
      s3: 'Escucho con atención antes de posicionarme.',
      s4: 'Evito los conflictos para mantener la armonía del grupo.',
      s5: 'Soy leal y constante con quienes confío.',
      s6: 'Me gusta cuando los planes cambian de repente.',
      s7: 'Me impaciento cuando las cosas tardan.',
      s8: 'Mantengo la calma en situaciones tensas.',
      s9: 'Ayudo a los compañeros cuando lo necesitan.',
      s10: 'Prefiero un entorno estable y sin sorpresas.',
      s11: 'Me gusta asumir riesgos y afrontar cambios.',
      s12: 'Suelo ser el primero en calmar un conflicto.',
      c1: 'Noto detalles que la mayoría no percibe.',
      c2: 'Me gusta todo organizado y en orden.',
      c3: 'Reviso mi trabajo más de una vez.',
      c4: 'Prefiero seguir reglas y procedimientos claros.',
      c5: 'Analizo los datos con calma antes de decidir.',
      c6: 'Suelo decidir por impulso, sin mucho análisis.',
      c7: 'No me molestan los pequeños errores.',
      c8: 'Sigo listas de verificación y procedimientos al pie de la letra.',
      c9: 'Reviso el trabajo para evitar errores.',
      c10: 'Prefiero la calidad a la velocidad.',
      c11: 'No me importan mucho los detalles.',
      c12: 'Baso mis decisiones en hechos y datos.',
      d13: 'Me gusta tomar el mando y guiar a las personas en las situaciones.',
      d14: 'Tomo decisiones rápidas, muchas veces solo.',
      i13: 'Soy animado y me suelto fácilmente cuando estoy con otras personas.',
      i14: 'Convenzo e involucro a las personas con facilidad.',
      s13: 'Escucho con atención y me pongo en el lugar del otro.',
      s14: 'Prefiero seguir los planes con calma y constancia hasta el final.',
      c13: 'Me esmero en los detalles y me gusta tener tiempo para entregar con precisión.',
      c14: 'Sigo procedimientos bien definidos para mantener el control.',
    },
    profiles: {
      D: {
        nome: 'El Ejecutor',
        biografia:
          'Eres del tipo que toma el mando sin esperar autorización. Donde otros ven un problema difícil, tú ves un objetivo, y vas tras él con una prisa que contagia y a veces asusta. Decides rápido, hablas directo y prefieres un error corregible a quedarte parado esperando la certeza perfecta. En un equipo, sueles ser el motor: cuando la energía baja, eres tú quien lleva a todos de vuelta al resultado.\n\nTu fuerza es justamente esa valentía para decidir y la disposición a enfrentar la confrontación que la mayoría evita. Pero el mismo rasgo que destraba también atropella: en el afán de entregar, puedes pasar por encima de las personas y tratar la lentitud ajena como mala voluntad. No siempre lo es, y reconocerlo es lo que separa a un jefe temido de un líder respetado.\n\nRindes más con una meta clara, autonomía sobre el camino y un desafío a tu altura. El cuidado es recordar que un resultado que quema al equipo a mitad de camino no se sostiene. Aprender a preguntar antes de mandar, y a escuchar antes de decidir, multiplica tu ya natural capacidad de hacer que las cosas pasen.',
        qualidades: [
          'Toma el mando de una situación trabada sin que se lo pidan, y destraba al grupo',
          'Decide rápido aun con información incompleta, evitando que el equipo se detenga',
          'Dice lo que hay que decir de forma directa, sin rodeos que retrasan la conversación',
          'No retrocede ante la confrontación ni ante una meta difícil, encara el desafío de frente',
          'Mantiene el foco en el resultado aun cuando la presión sube y los demás titubean',
        ],
        pontosDeAtencao: [
          'En el afán de entregar, atropella a quien está al lado y deja al equipo desmotivado',
          'Corta la palabra de los demás y decide antes de escuchar a todo el equipo',
          'Trata los procesos y cuidados necesarios como pérdida de tiempo',
          'La impaciencia con el ritmo ajeno se vuelve aspereza y desgasta relaciones',
          'Asume demasiado riesgo confiando solo en su instinto, sin verificar el dato',
        ],
        comoLiderar: [
          'Da metas claras y deja a la persona libre para elegir el "cómo"',
          'Exige por el resultado, no por el camino, y evita la microgestión que detesta',
          'Sé objetivo y ve al grano, sin introducción larga',
          'Ofrece desafíos reales y reconocimiento por entregas difíciles logradas',
          'Señala el impacto en las personas de forma factual, para que vea el costo de la prisa',
        ],
        oQueEvitar: ['Ambigüedad', 'Decisión lenta', 'Rodeos', 'Microgestión'],
        comunicacaoIdeal:
          'Directa y objetiva, con el plazo y la meta por delante. Ve al grano, trae la decisión a tomar y evita la introducción larga que lo desconecta.',
        ondeBrilha: [
          'Liderar un proyecto con plazo ajustado y meta agresiva',
          'Negociaciones duras en las que hay que sostener la posición',
          'Momentos de crisis, cuando la mayoría se congela y alguien debe decidir',
          'Abrir un frente nuevo, desde cero, sin proceso listo',
          'Cambios de rumbo que exigen cortar rápido lo que no funciona',
        ],
        sobEstresse:
          'Se vuelve más controlador y cortante, intenta retomar el mando de todo y pasa por encima de quien esté en el camino. La prisa se vuelve impaciencia abierta.',
      },
      I: {
        nome: 'El Comunicador',
        biografia:
          'Eres del tipo que ilumina el ambiente al llegar. Haces amistad con facilidad, entablas conversación con quien acabas de conocer y transformas un grupo callado en un equipo animado en pocos minutos. Tus ideas vienen en ráfagas, y tu entusiasmo es lo bastante genuino para contagiar hasta a los más escépticos. Cuando hay que vender una idea, involucrar a la gente o reavivar la moral de un equipo cansado, pocos lo hacen tan bien como tú.\n\nTu fuerza es esa capacidad rara de conectar y movilizar a las personas. El otro lado es que, en el calor de la emoción, empiezas mucho y terminas poco, huyes del detalle tedioso y a veces prometes más de lo que puedes cumplir solo por agradar. El reconocimiento te mueve tanto que una crítica seca puede tumbarte más de lo debido, y el aislamiento te vacía rápido.\n\nRindes más en entornos con gente, movimiento y visibilidad, y trabajas mejor junto a alguien organizado que cuide el detalle que dejas pasar. El cuidado es aprender a cerrar lo que abres y a separar el entusiasmo del compromiso: una promesa cumplida vale más que diez discursos animados. Dosificar la energía con foco convierte tu carisma en resultado real.',
        qualidades: [
          'Construye vínculo con casi cualquier persona en minutos y abre puertas al equipo',
          'Contagia al equipo con entusiasmo genuino y reaviva la moral cuando cae',
          'Genera ideas nuevas en ráfaga y ve posibilidades que otros no ven',
          'Convence e involucra con naturalidad, vendiendo una idea internamente con facilidad',
          'Aporta ligereza y buen humor que hacen el ambiente agradable para trabajar',
        ],
        pontosDeAtencao: [
          'Empieza muchos proyectos a la vez y termina pocos',
          'Huye del detalle y del trabajo árido, dejando huecos que aparecen después',
          'Promete más de lo que puede entregar por agradar en el momento',
          'Dispersa la atención con facilidad y pierde el foco de la semana',
          'Sufre demasiado con la crítica seca y busca aprobación de un modo que estorba la decisión',
        ],
        comoLiderar: [
          'Da reconocimiento público por las entregas, es lo que más motiva a esta persona',
          'Empareja con alguien organizado que cuide el detalle y el seguimiento',
          'Ayuda a mantener el foco en pocas prioridades por vez',
          'Trae la crítica siempre junto al reconocimiento, nunca solo la corrección',
          'Aterriza sus promesas en plazos y entregas concretas',
        ],
        oQueEvitar: ['Exceso de reglas y detalle', 'Crítica sin reconocimiento', 'Aislamiento'],
        comunicacaoIdeal:
          'Cálida y con espacio para hablar, valorando las ideas de la persona. Empieza por el reconocimiento antes de exigir, porque se traba cuando siente frialdad de entrada.',
        ondeBrilha: [
          'Ventas y atención, donde el vínculo abre la conversación',
          'Relación con clientes y socios a largo plazo',
          'Marketing, eventos y lanzamientos que piden energía',
          'Integración de un equipo nuevo y mejora del clima',
          'Presentaciones en las que hay que encantar y convencer al público',
        ],
        sobEstresse:
          'Habla de más, busca aprobación y se dispersa aún más. Sufre cuando se aísla y puede prometer lo imposible solo para aliviar la tensión del momento.',
      },
      S: {
        nome: 'El Apoyador',
        biografia:
          'Eres del tipo que sostiene al equipo por dentro, sin necesidad de aparecer. Tienes paciencia con lo que demora, lealtad con quien confía y una calma que tranquiliza a los demás en los momentos tensos. Mientras los reflectores van hacia quien grita más fuerte, es tu cuidado silencioso del clima y de las personas lo que mantiene la operación en pie, sobre todo en las fases difíciles.\n\nTu fuerza está en la constancia y en la escucha: escuchas de verdad antes de posicionarte, ayudas al colega que lo necesita y entregas con una regularidad en la que el liderazgo puede confiar a ciegas. El otro lado es que, para preservar la armonía, evitas el conflicto aun cuando es necesario, guardas insatisfacciones calladas hasta que se vuelven desgaste y te resistes a cambios bruscos que caen de sorpresa.\n\nRindes más en un entorno estable, con aviso previo de los cambios y con tu papel reconocido. El cuidado es aprender a decir el malestar en el momento, en vez de tragarlo, y a bancar la decisión difícil cuando sea tuya. Decir lo que piensas, aun corriendo el riesgo de un pequeño roce, protege la relación a largo plazo mucho más que el silencio.',
        qualidades: [
          'Mantiene la calma y tranquiliza a los demás en situaciones tensas, estabilizando al grupo',
          'Escucha de verdad antes de posicionarse, y las personas se sienten acogidas',
          'Es leal y constante con quien confía, entregando con regularidad previsible',
          'Cuida el clima y ayuda al colega en dificultad sin esperar que se lo pidan',
          'Sostiene rutinas largas sin perder el estándar, ideal para funciones de continuidad',
        ],
        pontosDeAtencao: [
          'Evita el conflicto aun cuando es necesario, dejando crecer los problemas',
          'Guarda insatisfacciones calladas hasta que se vuelven desgaste o rencor',
          'Se resiste a cambios bruscos y tarda en adherir a lo nuevo',
          'Se sobrecarga en silencio, sin pedir ayuda a tiempo',
          'Tarda en decidir cuando la elección exige bancar algo impopular',
        ],
        comoLiderar: [
          'Avisa los cambios con antelación, entrega mucho más cuando no lo agarran de sorpresa',
          'Inclúyelo en las decisiones y pregunta su opinión antes de cerrar',
          'Valora la lealtad y la constancia, que suelen pasar desapercibidas',
          'Crea un espacio seguro para que diga lo que le está incomodando',
          'Da apoyo explícito cuando deba bancar una decisión difícil',
        ],
        oQueEvitar: ['Cambio brusco sin aviso', 'Reproche en público', 'Prisa', 'Enfrentamiento directo'],
        comunicacaoIdeal:
          'Calmada y cercana, mostrando cómo el cambio ayuda al equipo y asegurando que se sienta escuchado. Baja el tono, da tiempo y pregunta su opinión antes de decidir.',
        ondeBrilha: [
          'Soporte y atención que exigen paciencia y escucha',
          'RR. HH. y posventa, manteniendo el vínculo a largo plazo',
          'Funciones de continuidad donde la constancia vale más que la velocidad',
          'Estabilización de un equipo desgastado o en conflicto',
          'Rutinas críticas que no pueden oscilar de un día para otro',
        ],
        sobEstresse:
          'Se repliega y busca seguridad, el conflicto lo paraliza. Absorbe la tensión de todos en silencio y guarda la insatisfacción en vez de poner el problema sobre la mesa.',
      },
      C: {
        nome: 'El Analista',
        biografia:
          'Eres del tipo que repara en el detalle que la mayoría deja pasar. Antes de decidir, reúnes los datos, verificas más de una vez y solo firmas cuando lo que entregas cumple el estándar que tú mismo exiges, que suele ser alto. Donde otros improvisan, tú tienes método, y es justamente ese rigor lo que hace que el equipo confíe en que lo que pasó por tus manos está bien.\n\nTu fuerza es la calidad y la profundidad: eres especialista en lo tuyo, elevas la vara de todo lo que tocas y eres confiable en las entregas críticas que no pueden fallar. El otro lado es que el perfeccionismo puede trabar la entrega buscando una certeza que nunca llega, el trato a veces suena frío y la crítica, demasiado dura, tanto con los demás como contigo. La prisa sin aviso te desestabiliza más de lo que la mayoría imagina.\n\nRindes más con criterios claros, datos confiables y tiempo para hacerlo bien. El cuidado es acordar antes qué es "suficientemente bueno" y aceptar que, en ciertos momentos, entregar a tiempo vale más que perseguir lo perfecto. Traer el reconocimiento junto a la corrección, y un poco de calidez al trato, hace que tu rigor rinda sin alejar a las personas.',
        qualidades: [
          'Repara en detalles y riesgos que la mayoría no percibe, evitando errores caros',
          'Decide sobre hechos y datos, no por impulso, y sostiene la elección',
          'Verifica su propio trabajo antes de soltarlo, con un índice de error bajísimo',
          'Eleva el estándar de calidad de todo lo que pasa por sus manos',
          'Es un especialista confiable en lo suyo, referencia técnica para el equipo',
        ],
        pontosDeAtencao: [
          'El perfeccionismo traba la entrega buscando una certeza que no llega',
          'El trato más frío puede alejar a las personas y sonar distante',
          'La crítica sale demasiado dura, consigo mismo y con los demás',
          'La prisa y el plazo ajustado sin aviso lo desestabilizan',
          'Puede perderse en el detalle mínimo mientras el plazo general aprieta',
        ],
        comoLiderar: [
          'Da criterios y datos claros, decide mejor cuando el terreno está mapeado',
          'Permite el trabajo independiente y respeta la autonomía técnica',
          'Trae feedback específico y amable, no vago ni duro',
          'Acuerda antes qué es "suficientemente bueno" para evitar la parálisis',
          'Avisa los plazos con antelación, el susto de último momento lo traba',
        ],
        oQueEvitar: ['Instrucción vaga', 'Plazo ajustado sin aviso', 'Crítica dura', 'Improvisación'],
        comunicacaoIdeal:
          'Basada en hechos, de preferencia por escrito, con contexto y antelación. Trae el dato que sostiene el pedido y da tiempo de procesar antes de exigir la decisión.',
        ondeBrilha: [
          'Análisis y control de calidad que no toleran error',
          'Finanzas, procesos y auditoría, donde el criterio lo es todo',
          'Documentación técnica y normas que exigen precisión',
          'Tareas críticas donde una sola falla cuesta caro',
          'Revisión y verificación del trabajo de los demás',
        ],
        sobEstresse:
          'Busca más datos y reglas y se paraliza por miedo a equivocarse. Se encierra en el detalle, endurece la crítica y rechaza cualquier atajo que no esté comprobado.',
      },
      DI: {
        nome: 'El Impulsor',
        biografia:
          'Eres del tipo que junta la ambición de quien quiere resultado con el carisma de quien sabe arrastrar gente. Defines la meta, subes al escenario y movilizas al equipo a una velocidad que pocos siguen. Donde falta ánimo, pones energía; donde falta rumbo, señalas la dirección. Es un perfil hecho para giros, lanzamientos y ambientes dinámicos donde hay que decidir rápido e involucrar al mismo tiempo.\n\nTu fuerza es esa rara combinación de foco en el resultado con poder de influencia: no solo sabes a dónde quieres llegar, sino que logras que el equipo quiera llegar contigo. El otro lado es que atropellas y te dispersas a la vez, prometes más de lo que el equipo puede entregar y pierdes la paciencia con el detalle que sostiene la promesa. En el entusiasmo, es fácil asumir más frentes de los que puedes cerrar.\n\nRindes más con escenario, meta ambiciosa y visibilidad, junto a alguien que cuide el detalle que dejas pasar. El cuidado es aterrizar la emoción en compromisos realistas y exigirte foco en lo ya prometido antes de abrir el siguiente frente. Menos ideas sueltas y más apuestas cerradas convierten tu impulso en resultado que dura.',
        qualidades: [
          'Define la meta y moviliza al equipo detrás de ella a una velocidad rara',
          'Combina el foco en el resultado con el poder de involucrar y vender la idea',
          'Aporta energía que reaviva la moral y hace que la operación avance rápido',
          'Comunica directo, pero con calidez, sin sonar frío como un D puro',
          'Encara giros y lanzamientos con valentía y entusiasmo a la vez',
        ],
        pontosDeAtencao: [
          'Atropella a las personas y dispersa la atención al mismo tiempo',
          'Promete más de lo que el equipo puede entregar en el plazo',
          'Pierde la paciencia con el detalle que sostiene su propia promesa',
          'Asume más frentes de los que puede cerrar, en el calor del entusiasmo',
          'Acelera tanto que deja al equipo sin aliento para seguir',
        ],
        comoLiderar: [
          'Da escenario y metas ambiciosas, es donde esta persona se enciende',
          'Empareja con quien cuida el detalle y el seguimiento',
          'Exige foco en lo ya prometido antes de abrir un nuevo frente',
          'Aterriza las promesas en plazos y entregas realistas',
          'Reconoce públicamente los giros logrados',
        ],
        oQueEvitar: ['Rutina', 'Lentitud', 'Ambiente sin visibilidad'],
        comunicacaoIdeal:
          'Objetiva y animada, con una meta ambiciosa y reconocimiento en el camino. Trae el desafío grande de entrada y muestra la visibilidad que genera la entrega.',
        ondeBrilha: [
          'Ambientes dinámicos con visibilidad y meta agresiva',
          'Liderazgo comercial y equipos de ventas',
          'Lanzamientos y campañas que piden energía y rumbo',
          'Giros de operación con plazo corto',
          'Movilización de un equipo desanimado en torno a un objetivo',
        ],
        sobEstresse:
          'Acelera de más y asume más de lo que puede entregar. Habla más fuerte, empuja con más fuerza e ignora las señales de que el equipo ya no sigue el ritmo.',
      },
      ID: {
        nome: 'El Persuasor',
        biografia:
          'Eres del tipo que primero encanta y después empuja. Llegas lleno de energía social, ganas a las personas en la conversación y, una vez conquistado el grupo, usas esa influencia para crear movimiento y hacer que las cosas pasen. Es un perfil de alto impacto, hecho para vender, presentar y captar, en situaciones donde convencer vale tanto como entregar.\n\nTu fuerza es la capacidad de movilizar rápido: abres puertas con el carisma y las atraviesas con la asertividad. El otro lado es que, en el entusiasmo de convencer, prometes más de lo que entregas, huyes del detalle y a veces suenas exagerado, insistiendo en la persuasión aun cuando las señales dicen que es hora de replegarse. El reconocimiento te mueve, y sin él la energía se vacía.\n\nRindes más en ambientes con gente, movimiento y metas de impacto, lejos de la rutina estática y del trabajo solitario. El cuidado es anclar las promesas en plazos concretos y leer el momento de dejar de empujar. Saber cuándo replegarte, y cumplir lo que prometiste en el calor de la conversación, convierte tu talento para convencer en confianza de largo plazo.',
        qualidades: [
          'Gana al grupo en la conversación y luego usa la relación para generar movimiento',
          'Convence con alta energía social y crea impulso donde había inercia',
          'Abre puertas con el carisma y las atraviesa con asertividad',
          'Es fuerte en ventas de impacto y presentaciones que deben entusiasmar',
          'Reaviva la energía del ambiente y empuja a las personas a la acción',
        ],
        pontosDeAtencao: [
          'Promete más de lo que puede entregar en el calor de la conversación',
          'Huye del detalle que sostiene la promesa hecha',
          'Puede sonar exagerado y perder credibilidad con perfiles más escépticos',
          'Insiste en la persuasión aun cuando es hora de replegarse',
          'Se vacía cuando faltan el reconocimiento y el movimiento',
        ],
        comoLiderar: [
          'Reconoce en público, es el combustible principal de esta persona',
          'Aterriza las promesas en plazos y entregas concretas',
          'Da metas de impacto y visibilidad, evita la rutina que lo apaga',
          'Ayúdalo a leer el momento de dejar de empujar',
          'Empareja con quien sostenga el detalle que deja pasar',
        ],
        oQueEvitar: ['Ambiente estático', 'Exceso de reglas', 'Trabajo solitario'],
        comunicacaoIdeal:
          'Cálida y directa, con espacio para convencer y una meta clara al final. Reconoce primero, luego trae el desafío de impacto que lo moviliza.',
        ondeBrilha: [
          'Ventas de impacto donde convencer es la mitad del juego',
          'Presentaciones y pitches que deben entusiasmar al público',
          'Captación y prospección que exigen abrir puertas',
          'Movilización rápida de un grupo en torno a una idea',
          'Reactivación de clientes o socios enfriados',
        ],
        sobEstresse:
          'Insiste en persuadir e ignora las señales de que es hora de replegarse. Habla más, promete más y empuja con más fuerza, aun cuando el grupo ya no está comprando.',
      },
      DC: {
        nome: 'El Retador',
        biografia:
          'Eres del tipo que quiere el resultado, pero no a cualquier costo: quiere el resultado en el estándar correcto. Combinas la asertividad de quien decide rápido con el rigor de quien no suelta nada por debajo del nivel. Donde un perfil solo exige el plazo y otro solo la calidad, tú exiges los dos, y es justamente esa exigencia doble lo que hace que tu trabajo sea una referencia.\n\nTu fuerza es entregar resultado con estándar alto al mismo tiempo, algo raro en un solo perfil: tienes la valentía de actuar y el criterio de actuar bien. El otro lado es que esa misma exigencia se vuelve dureza. Exiges demasiado, tienes poca paciencia con el error y, cuando algo sale por debajo de lo que consideras aceptable, quieres rehacer todo hasta que quede perfecto, aun cuando el plazo no lo permite.\n\nRindes más en proyectos exigentes, gestión técnica y situaciones donde resultado y calidad no pueden negociarse uno por el otro. El cuidado es reconocer que no todo detalle justifica trabar la entrega, y que el equipo rinde más con reconocimiento que solo con exigencia. Acordar antes qué es innegociable y qué puede ceder por el plazo evita que tu exigencia trabe lo que debería destrabar.',
        qualidades: [
          'Exige resultado y calidad al mismo tiempo, elevando el nivel de la entrega',
          'Une la valentía de actuar con el criterio de actuar bien',
          'Mantiene un estándar alto y no suelta nada por debajo del nivel aceptable',
          'Es estratégico y exigente, pensando el resultado y el riesgo juntos',
          'Frena errores evitables antes de que se vuelvan pérdida',
        ],
        pontosDeAtencao: [
          'Exige demasiado y tiene poca paciencia con el error del otro',
          'Quiere rehacer todo hasta la perfección, aun sin plazo para ello',
          'Duro y perfeccionista a la vez, desgasta al equipo',
          'Puede trabar la entrega por no aceptar el "suficientemente bueno"',
          'El trato demasiado directo suena a frialdad bajo presión',
        ],
        comoLiderar: [
          'Trae metas claras y criterios objetivos, decide mejor con un estándar definido',
          'Respeta la autonomía técnica y el estándar alto que sostiene',
          'Reconoce la calidad entregada, no solo exijas la próxima',
          'Acuerda antes qué es innegociable y qué cede por el plazo',
          'Señala de forma factual cuando la exigencia está trabando la entrega',
        ],
        oQueEvitar: ['Ambigüedad', 'Bajo estándar', 'Improvisación'],
        comunicacaoIdeal:
          'Directa y fundamentada, con datos y un resultado claro por delante. Trae el criterio objetivo y el estándar esperado, sin la ambigüedad que no tolera.',
        ondeBrilha: [
          'Proyectos exigentes que necesitan resultado con calidad',
          'Gestión técnica donde el estándar no puede caer',
          'Situaciones que exigen decisión rápida sin renunciar al criterio',
          'Control de calidad con plazo ajustado',
          'Frentes que se trabarían por falta de rigor o de valentía',
        ],
        sobEstresse:
          'Se vuelve crítico y controlador, quiere rehacer todo hasta que quede perfecto. Endurece el trato, exige aún más y traba la entrega buscando el estándar ideal.',
      },
      CD: {
        nome: 'El Realizador',
        biografia:
          'Eres del tipo que decide, pero solo después de mirar el dato. Primero analizas, reúnes los hechos y formas un criterio; entonces actúas con firmeza, sin dudar. Donde unos deciden por instinto y otros se traban en el análisis, tú combinas ambos lados: tienes el rigor de quien verifica y la decisión de quien ejecuta. Es un perfil hecho para la decisión técnica, el control y las situaciones donde equivocarse cuesta caro.\n\nTu fuerza es esa firmeza fundamentada: no actúas a ciegas ni te paralizas esperando la certeza absoluta. Ejecutas con rigor y sostienes la decisión en los números. El otro lado es que puedes ser frío e impaciente con la "suposición" ajena, trabarte por exceso de análisis cuando el dato no cierra y tener un trato demasiado directo, que suena duro para quien esperaba más tacto.\n\nRindes más con datos confiables, autonomía para decidir por criterio y sin presión emocional encima. El cuidado es recordar que no toda decisión espera el dato perfecto, y que las personas a tu alrededor necesitan un poco más de calidez que de precisión. Aceptar actuar con información incompleta en ciertos momentos, y suavizar el trato, hace que tu rigor rinda sin alejar al equipo.',
        qualidades: [
          'Analiza el dato y luego actúa con firmeza, sin dudar en la decisión',
          'Combina el rigor de quien verifica con la decisión de quien ejecuta',
          'Sostiene la elección en hechos y números, no en el impulso',
          'Ejecuta con rigor tareas que no toleran error',
          'Aporta criterio a decisiones de riesgo, reduciendo el error impulsivo',
        ],
        pontosDeAtencao: [
          'Frío e impaciente con la "suposición" de los demás',
          'Puede trabarse por exceso de análisis cuando el dato no cierra',
          'El trato demasiado directo suena duro para quien esperaba tacto',
          'Rechaza lo que no está comprobado, aun bajo un plazo ajustado',
          'Se encierra en los números y pierde la lectura de las personas',
        ],
        comoLiderar: [
          'Trae datos confiables, decide mejor con la información en la mano',
          'Déjalo decidir con criterio, sin presión emocional',
          'Evita exigir la decisión a los gritos, el dato malo lo traba más que la prisa',
          'Da autonomía técnica y reconoce la solidez del análisis',
          'Pídele que traiga la conclusión antes del detalle, para agilizar',
        ],
        oQueEvitar: ['Decisión emocional', 'Datos malos', 'Falta de criterio'],
        comunicacaoIdeal:
          'Objetiva y basada en hechos, con números que sostengan la decisión. Trae la conclusión y los datos que la apoyan, sin apelación emocional que descarta.',
        ondeBrilha: [
          'Finanzas e ingeniería, donde manda el número',
          'Decisión técnica que exige criterio firme',
          'Control y auditoría que no pueden fallar',
          'Elecciones de riesgo donde hay que actuar bien, no solo rápido',
          'Diagnóstico de un problema con base en datos',
        ],
        sobEstresse:
          'Se encierra en los datos y se endurece, rechaza lo que no esté comprobado. Se vuelve aún más frío e impaciente, y traba decisiones urgentes esperando la certeza que no llega.',
      },
      IS: {
        nome: 'El Colaborador',
        biografia:
          'Eres del tipo que hace que el equipo se sienta en casa. Cálido y empático, conectas a las personas, creas un clima ligero y percibes cuándo alguien no está bien antes de que lo diga. Donde hay tensión, la suavizas; donde hay distancia, la acortas. Es el tipo de presencia que hace que las personas quieran trabajar juntas y se sientan seguras para pedir ayuda.\n\nTu fuerza es el cuidado genuino de las personas y la capacidad de mantener al grupo unido a largo plazo. Abres la puerta con simpatía y mantienes el vínculo con constancia, una combinación fuerte en atención y en cualquier función que dependa de la relación. El otro lado es que, para preservar la armonía, evitas el conflicto y la exigencia, te cuesta la decisión impopular y pospones lo difícil, absorbiendo la tensión de todos en vez de resolverla.\n\nRindes más en equipos armónicos, con un entorno estable y amable, y con apoyo explícito cuando la decisión dura deba ser tuya. El cuidado es aprender que evitar la confrontación necesaria solo pospone el problema y te sobrecarga. Decir lo difícil con tu modo acogedor, sin tragar la tensión, protege tanto la relación como tu propia energía.',
        qualidades: [
          'Percibe cuándo alguien no está bien antes de que lo diga, y lo acoge',
          'Conecta a las personas y crea un clima ligero en el que el equipo quiere trabajar',
          'Mantiene el vínculo con clientes y colegas a largo plazo',
          'Suaviza tensiones y acorta la distancia con quien está lejos',
          'Hace que el grupo se sienta seguro para hablar y pedir ayuda',
        ],
        pontosDeAtencao: [
          'Evita el conflicto y la exigencia para preservar la armonía',
          'Le cuesta la decisión impopular y pospone lo difícil',
          'Absorbe la tensión de todos en vez de resolverla',
          'Guarda su propio malestar para no generar roce',
          'Puede sobrecargarse por cuidar a todos menos a sí mismo',
        ],
        comoLiderar: [
          'Valora su cuidado de las personas, que sostiene el clima del equipo',
          'Apóyalo de forma explícita en las decisiones difíciles e impopulares',
          'Da un entorno estable y amable donde rinde más',
          'Anímalo a decir el malestar temprano, antes de que se vuelva rencor',
          'Evita dejarlo solo ante una confrontación que evitaría',
        ],
        oQueEvitar: ['Tensión constante', 'Decisiones impopulares sin apoyo', 'Frialdad'],
        comunicacaoIdeal:
          'Amistosa y acogedora, reconociendo el esfuerzo de mantener al grupo unido. Trae lo difícil con cuidado y deja claro que el vínculo está preservado.',
        ondeBrilha: [
          'Equipos armónicos que dependen de la relación y la confianza',
          'Atención y éxito del cliente a largo plazo',
          'Facilitación e integración de nuevas personas',
          'Ambientes que necesitan un clima ligero para rendir',
          'Puente entre áreas o personas en roce',
        ],
        sobEstresse:
          'Absorbe la tensión de todos y evita el enfrentamiento que la resolvería. Se calla, pospone lo difícil y se sobrecarga guardando su propio malestar.',
      },
      SI: {
        nome: 'El Facilitador',
        biografia:
          'Eres del tipo que cose al grupo por dentro. Constante y amable, tiendes puentes entre personas que no se entienden, medias los roces con calma y construyes la cohesión que mantiene a un equipo unido. Donde falta diálogo, abres el canal; donde hay ruido, traduces. Es una presencia que rara vez aparece en el escenario, pero sin la cual el escenario se caería.\n\nTu fuerza es esa capacidad de generar cohesión y leer el clima del grupo antes de que el problema estalle. Eres el mediador amistoso en quien todos confían. El otro lado es que, por no gustarte la fricción, pospones la confrontación necesaria, te resistes a los cambios rápidos y guardas tu propia insatisfacción en vez de ponerla sobre la mesa, dejando que el malestar se acumule en silencio.\n\nRindes más con aviso previo de los cambios, con tu papel de puente reconocido y en un clima que no sea hostil. El cuidado es aprender que mediar no es tragar: poner tu propia insatisfacción en la conversación, y encarar el roce cuando sea necesario, fortalece la cohesión que tanto valoras, en vez de debilitarla.',
        qualidades: [
          'Tiende puentes entre personas que no se entienden y reduce el roce',
          'Lee el clima del grupo antes de que el problema estalle',
          'Construye cohesión y mantiene al equipo unido en el día a día',
          'Media conflictos con calma y es el mediador en quien todos confían',
          'Es constante y amable, una presencia estable para el grupo',
        ],
        pontosDeAtencao: [
          'Pospone la confrontación necesaria para no generar fricción',
          'Se resiste a los cambios rápidos y tarda en adherir',
          'Guarda su propia insatisfacción en vez de ponerla sobre la mesa',
          'Deja que el malestar se acumule en silencio',
          'Puede mediar tanto lo de los demás que olvida su propio incómodo',
        ],
        comoLiderar: [
          'Avisa los cambios temprano, necesita tiempo para digerir y adaptarse',
          'Pide la lectura del grupo, ve el clima antes que los demás',
          'Reconoce el papel de puente, que suele pasar desapercibido',
          'Anímalo a poner su propia insatisfacción en la conversación',
          'Evita el clima hostil y el reproche en público, que lo hacen recogerse',
        ],
        oQueEvitar: ['Cambio rápido', 'Clima hostil', 'Reproche en público'],
        comunicacaoIdeal:
          'Cercana y calmada, mostrando el impacto positivo en el grupo. Da tiempo, avisa los cambios temprano y reconoce el papel de puente que cumple.',
        ondeBrilha: [
          'Cohesión de equipo y mantenimiento del clima',
          'Mediación de conflictos entre personas o áreas',
          'Integración y acompañamiento de nuevos miembros',
          'Puente entre equipos que no se comunican bien',
          'Ambientes de largo plazo que dependen de relaciones estables',
        ],
        sobEstresse:
          'Se recoge y evita la fricción, aun cuando es necesaria. Guarda la insatisfacción, pospone la conversación difícil y deja que el malestar crezca en silencio.',
      },
      SC: {
        nome: 'El Metódico',
        biografia:
          'Eres del tipo en quien el liderazgo confía para que las cosas no fallen. Sigues el proceso, respetas el procedimiento y entregas con una constancia que casi no varía de un día para otro. Donde otros improvisan, tú tienes método; donde otros se enredan en la corrida, tú mantienes el estándar. Es un perfil hecho para rutinas de precisión que no toleran sorpresa.\n\nTu fuerza es la confiabilidad: bajo índice de error, cuidado del detalle y respeto a las reglas que sostienen la operación. Quien trabaja contigo sabe que lo acordado se cumplirá del modo correcto. El otro lado es que esa misma solidez se vuelve rigidez. Te resistes al cambio, aun al necesario, eres lento para adaptarte y puedes aferrarte al procedimiento al punto de trabarte ante lo imprevisto.\n\nRindes más con un proceso claro, un ambiente estable y cambios avisados con antelación y explicados en su porqué. El cuidado es aprender que no todo cambio es una amenaza, y que a veces el procedimiento debe ceder a la realidad. Entender la razón detrás de lo nuevo, y darte permiso para adaptarte, hace que tu confiabilidad siga el ritmo del negocio en vez de trabarlo.',
        qualidades: [
          'Sigue el proceso y mantiene el estándar aun en la corrida',
          'Entrega con una constancia que casi no varía de un día para otro',
          'Tiene un índice de error bajísimo y cuida el detalle que sostiene la operación',
          'Respeta reglas y procedimientos, dando previsibilidad al equipo',
          'Es confiable para rutinas de precisión que no toleran sorpresa',
        ],
        pontosDeAtencao: [
          'Se resiste al cambio, aun al necesario',
          'Es lento para adaptarse cuando el escenario cambia',
          'Puede aferrarse al procedimiento al punto de trabarse ante lo imprevisto',
          'Rígido y averso al riesgo, evita lo que sale de la rutina conocida',
          'Se acomoda en una rutina que ya no sirve, por comodidad',
        ],
        comoLiderar: [
          'Da un proceso claro y estable, es donde esta persona rinde más',
          'Explica el porqué del cambio, no solo lo que cambia',
          'Respeta el ritmo cuidadoso, sin prisa de último momento',
          'Avisa los cambios con antelación y da tiempo de adaptación',
          'Muestra con dato que el cambio trae ganancia real, para vencer la resistencia',
        ],
        oQueEvitar: ['Cambio brusco', 'Ambigüedad', 'Prisa sin aviso'],
        comunicacaoIdeal:
          'Clara y estructurada, con un paso a paso y antelación. Explica el porqué del cambio y da tiempo para absorberlo antes de exigir lo nuevo.',
        ondeBrilha: [
          'Rutinas de precisión bien hechas que no pueden oscilar',
          'Procesos y operaciones que dependen de un estándar constante',
          'Control de calidad y verificación',
          'Funciones que exigen seguir el procedimiento al pie de la letra',
          'Ambientes estables donde la confiabilidad vale más que la velocidad',
        ],
        sobEstresse:
          'Se aferra al procedimiento y se traba ante lo imprevisto. Se resiste aún más al cambio y se refugia en la rutina conocida para sentirse seguro.',
      },
      CS: {
        nome: 'El Perfeccionista',
        biografia:
          'Eres del tipo que entrega calidad con cuidado, sin alarde. Minucioso y cooperativo, sostienes un estándar alto de forma discreta, sin necesidad de aparecer, y eres confiable dentro de un equipo donde el detalle importa. Donde otros pasan por alto, tú verificas; donde otros aceptan lo razonable, tú cuidas el acabado. Eres la garantía silenciosa de que el trabajo saldrá bien hecho.\n\nTu fuerza es la precisión aliada al cuidado de las personas: entregas en el estándar sin generar roce, revisando y verificando con una dedicación en la que el equipo confía. El otro lado es que el exceso de celo puede trabarte, delegar es difícil porque parece que nadie lo hará a tu nivel, y un giro súbito te desestabiliza más de lo que la mayoría imagina.\n\nRindes más con criterios claros, tiempo para hacerlo bien y expectativas realistas, lejos de plazos imposibles. El cuidado es acordar antes qué es "suficientemente bueno" y aceptar que rehacer sin parar buscando lo perfecto solo atrasa lo que ya estaba listo. Confiar en el criterio de los colegas para delegar, y darte permiso para entregar en el punto justo, libera tu cuidado para rendir sin trabar.',
        qualidades: [
          'Sostiene un estándar alto de forma discreta, sin necesidad de aparecer',
          'Entrega calidad sin generar roce con el equipo alrededor',
          'Revisa y verifica con una dedicación en la que los colegas confían',
          'Es minucioso y cooperativo a la vez, algo raro de encontrar',
          'Detecta fallas de detalle que se les escaparían a otros',
        ],
        pontosDeAtencao: [
          'Se traba por exceso de celo buscando el acabado perfecto',
          'Le cuesta delegar porque parece que nadie lo hará a su nivel',
          'Sufre con el giro súbito y el plazo irreal',
          'Rehace sin parar y atrasa lo que ya estaba listo',
          'Puede asumir demasiado por no confiar en el trabajo ajeno',
        ],
        comoLiderar: [
          'Define criterios de "suficientemente bueno" para evitar la parálisis',
          'Da tiempo y contexto, el susto de último momento lo desestabiliza',
          'Reconoce el cuidado, que suele ser silencioso',
          'Anímalo a delegar, mostrando que puede confiar en el criterio del colega',
          'Trae plazos realistas, no expectativas vagas ni imposibles',
        ],
        oQueEvitar: ['Giro súbito', 'Expectativa vaga', 'Plazo irreal'],
        comunicacaoIdeal:
          'Detallada y respetuosa, con criterios y plazos realistas. Acuerda qué es "suficientemente bueno" y evita el giro de último momento que lo traba.',
        ondeBrilha: [
          'Precisión dentro de un equipo, sin roce',
          'Revisión y verificación del trabajo antes de soltarlo',
          'Documentación y control que exigen cuidado',
          'Tareas que piden estándar alto y discreción',
          'Procesos críticos donde la doble verificación evita pérdidas',
        ],
        sobEstresse:
          'Rehace sin parar buscando lo perfecto y atrasa la entrega. Se traba por celo, le cuesta aún más delegar y se sobrecarga tratando de garantizar todo solo.',
      },
      DS: {
        nome: 'El Planificador',
        biografia:
          'Eres del tipo que decide con firmeza y luego sostiene la decisión hasta el final. Combinas el impulso de quien gusta de comandar con el método de quien ejecuta el plan con constancia. Donde unos empiezan y abandonan, tú empiezas y terminas; donde unos cambian de ruta con cada viento, tú sigues firme en el rumbo trazado. Es un perfil hecho para la ejecución planificada y las metas de mediano plazo.\n\nTu fuerza es esa unión de decisión con constancia: defines el plan, bancas la elección y entregas sin soltar a mitad de camino. El liderazgo confía en ti para llevar algo de principio a fin. El otro lado es que, una vez decidido, puedes ponerte terco, te cuesta cambiar de ruta aun cuando el escenario ya cambió, y te exiges con una dureza que a veces pesa.\n\nRindes más con el plan alineado al comienzo, autonomía para ejecutar y razones claras cuando un ajuste sea necesario. El cuidado es recordar que insistir en el plan original cuando la realidad giró es rigidez, no constancia. Abrir espacio para revisar la ruta ante hechos nuevos, y aliviar tu propia exigencia, hace que tu firmeza rinda sin volverse terquedad.',
        qualidades: [
          'Decide con firmeza y sostiene la elección hasta el final, sin soltar a mitad de camino',
          'Combina el impulso de comandar con el método de ejecutar el plan',
          'Sigue firme en el rumbo trazado, sin cambiar de ruta con cada viento',
          'Lleva algo de principio a fin, reduciendo proyectos abandonados',
          'Da el impulso inicial y sostiene la constancia en rutinas largas',
        ],
        pontosDeAtencao: [
          'Se pone terco una vez que decide y le cuesta cambiar de ruta',
          'Insiste en el plan original aun cuando el escenario ya cambió',
          'Se exige con una dureza que pesa',
          'Se resiste a ajustes que no vienen con un motivo claro',
          'Confunde constancia con rigidez en escenarios que exigen flexibilidad',
        ],
        comoLiderar: [
          'Alinea el plan al comienzo, ejecuta mejor con el rumbo claro',
          'Trae hechos concretos para justificar ajustes de ruta',
          'Respeta la constancia y la entrega hasta el final',
          'Ayúdalo a revisar la ruta ante hechos nuevos, sin que suene a capricho',
          'Reconoce la firmeza, pero señala cuando se vuelve terquedad',
        ],
        oQueEvitar: ['Rigidez consigo mismo', 'Cambio sin motivo claro', 'Improvisación'],
        comunicacaoIdeal:
          'Objetiva y planificada, con metas firmes y razones para cualquier ajuste. Trae el hecho que justifica el cambio de ruta, o lo leerá como capricho.',
        ondeBrilha: [
          'Ejecución planificada de principio a fin',
          'Metas de mediano plazo que exigen constancia',
          'Operación estable que no puede abandonarse a mitad de camino',
          'Proyectos que necesitan decisión firme y seguimiento',
          'Rutinas largas que dependen de un impulso inicial y de constancia',
        ],
        sobEstresse:
          'Insiste en el plan original aun cuando el escenario ya cambió. Se pone más terco, se resiste al ajuste y se exige aún más duro por el desvío.',
      },
      IC: {
        nome: 'El Consultor',
        biografia:
          'Eres del tipo que junta el encanto de quien conecta con el rigor de quien entrega bien. Sociable y preciso, explicas lo complejo de un modo que las personas entienden y sostienes lo que dices con datos que se comprueban. Donde un perfil solo encanta y otro solo profundiza, tú haces los dos: ganas al público y demuestras el punto. Es un perfil hecho para la consultoría, la capacitación y para vender o explicar algo técnico.\n\nTu fuerza es esa rara unión entre relación y técnica: abres la puerta con simpatía y sostienes la credibilidad con el contenido correcto. La creatividad sumada al sentido crítico genera soluciones que también pasan la prueba de la calidad. El otro lado es que sufres en el trabajo técnico solitario, oscilas entre hablar y revisar sin cerrar ninguno de los dos, y puedes dispersarte en el detalle cuando deberías concluir.\n\nRindes más con interacción, un buen problema técnico para resolver y reconocimiento por la claridad de tu explicación, lejos del aislamiento largo y de la tarea monótona. El cuidado es no dejar que la conversación se trague el rigor, ni que el rigor mate la fluidez: dosificar los dos es tu punto de equilibrio. Encontrar el término medio entre encantar y demostrar convierte tu talento doble en consultoría que convence y se sostiene.',
        qualidades: [
          'Explica lo complejo de un modo que las personas entienden',
          'Une el encanto de quien conecta con el rigor de quien entrega bien',
          'Sostiene la credibilidad con datos, no solo con simpatía',
          'Genera soluciones creativas que también pasan la prueba de la calidad',
          'Es fuerte para vender o explicar algo técnico a un público',
        ],
        pontosDeAtencao: [
          'Sufre en el trabajo técnico solitario y sin interacción',
          'Oscila entre hablar y revisar sin cerrar ninguno de los dos',
          'Puede dispersarse en el detalle cuando debería concluir',
          'Recibe la crítica técnica como si fuera personal y se desanima',
          'La espontaneidad a veces atropella la precisión que él mismo valora',
        ],
        comoLiderar: [
          'Da interacción y un buen problema técnico para resolver',
          'Reconoce la claridad de la explicación, es lo que valora',
          'Evita el aislamiento largo y la tarea monótona, que lo apagan',
          'Trae la crítica técnica con reconocimiento, no solo corrección',
          'Ayúdalo a cerrar entre hablar y revisar, sin oscilar sin fin',
        ],
        oQueEvitar: ['Aislamiento sin interacción', 'Tarea monótona', 'Falta de contexto'],
        comunicacaoIdeal:
          'Amistosa y precisa, con espacio para dialogar y datos para sostener. Trae el problema técnico y reconoce la claridad de la explicación que ofrece.',
        ondeBrilha: [
          'Explicar o vender algo técnico a un público',
          'Consultoría que une la relación con el contenido correcto',
          'Capacitación y formación que exigen claridad',
          'Presentación técnica en la que hay que encantar y demostrar',
          'Puente entre el área técnica y el cliente o la dirección',
        ],
        sobEstresse:
          'Habla mucho para aliviar la tensión y pierde el rigor del detalle. Oscila entre conversar y revisar sin cerrar, y recibe la crítica técnica como si fuera personal.',
      },
    },

    // ── Relaciones entre pares de perfiles primarios ──────────────────────────
    relationships: {
      DD: {
        friction: [
          'En las reuniones, los dos compiten por tener la última palabra, y una decisión simple se vuelve un pulso que traba al equipo.',
          'Ninguno cede en una discusión, así que las diferencias pequeñas escalan a confrontación directa delante del equipo.',
          'Cada uno asume el mismo frente sin acordarlo antes, y el resultado es retrabajo y órdenes contradictorias para los subordinados.',
          'El ego elevado hace que admitir un error parezca una derrota, así que las fallas quedan sin corregir porque nadie cede.',
          'La prisa de ambos por el resultado atropella la alineación, y el equipo recibe metas que cambian a mitad de camino.',
        ],
        synergy: [
          'Cuando el alcance está dividido, los dos deciden rápido y destraban proyectos que se frenarían con perfiles más cautelosos.',
          'La ambición compartida eleva las metas atrevidas, y cada uno sirve de referencia de energía y ritmo para el otro.',
          'Bajo presión o en una crisis, ninguno se paraliza, y juntos sostienen la operación cuando todo está en llamas.',
          'Se exigen mutuamente el mismo nivel de entrega, así que el estándar de resultado del dúo se mantiene alto sin supervisión externa.',
          'En negociaciones duras, forman un frente firme que la otra parte difícilmente logra doblar.',
        ],
        communication:
          'Acuerden de antemano quién lidera cada frente y déjenlo por escrito, para que la reunión no se vuelva una pelea por la última palabra. Cada uno debe entrar a la conversación dispuesto a ceder al menos un punto, tratando la diferencia como un dato y no como una ofensa personal. El feedback entre los dos funciona mejor a solas y directo, sin público que lo convierta en un pulso de poder. Definan un criterio objetivo de decisión (un número, un plazo, una meta) para desempatar sin que sea cuestión de ego.',
      },
      DI: {
        friction: [
          'D exige plazo y entrega cerrada, mientras que I llega lleno de ideas sueltas, y D empieza a verlo como disperso y poco confiable.',
          'I siente a D frío y cortante, y tras algunos cortes secos empieza a evitar plantear temas y a esconder problemas.',
          'El ritmo acelerado del D atropella la necesidad del I de conversar y ser reconocido, vaciando la energía que aportaría al equipo.',
          'I promete más de lo que puede cumplir para agradar, y D se irrita cuando la entrega no coincide con el discurso animado.',
          'En la reunión, I se extiende con historias y D lo corta a la mitad, y ninguno sale sintiéndose escuchado.',
        ],
        synergy: [
          'D impulsa el resultado y define la meta, I conecta a las personas y vende la idea, un dúo fuerte para lanzamientos y giros de operación.',
          'I suaviza el impacto del D en las personas, traduciendo las exigencias duras a un lenguaje que el equipo acepta sin desmotivarse.',
          'Juntos cubren los dos lados que casi ningún perfil solo entrega: foco en el resultado y capacidad de influir y movilizar.',
          'D da foco y plazo al entusiasmo del I, transformando muchas ideas sueltas en pocas apuestas realmente ejecutadas.',
          'En momentos de moral baja, D marca el rumbo y I reaviva la energía, y el equipo vuelve a andar rápido.',
        ],
        communication:
          'D debe empezar con una frase de reconocimiento antes de exigir, porque I se bloquea cuando percibe frialdad de entrada. I necesita llegar a las conversaciones con foco y un plazo concreto, cortando la introducción larga que hace que D se desconecte. Acuerden que las ideas nuevas del I van a una lista para después, y no en medio de una decisión que ya estaba cerrada. En la reunión, D conduce la meta e I conduce el engagement, cada uno respetando el espacio del otro en lugar de disputar el mando.',
      },
      DS: {
        friction: [
          'D quiere cambiar todo ya y S necesita tiempo y aviso, así que los cambios caen de sorpresa y S se siente atropellado.',
          'S protege la estabilidad y el ritmo del equipo, y D lo lee como lentitud o resistencia a propósito.',
          'Bajo presión, D se pone más cortante y S se cierra, guardando insatisfacciones que solo aparecen cuando ya se volvieron desgaste.',
          'D decide solo y comunica la decisión ya tomada, mientras S esperaba ser consultado, y la confianza entre ambos se erosiona.',
          'D mide el valor por el resultado rápido y S por la constancia y la relación, así que cada uno cree que el otro cuida lo equivocado.',
        ],
        synergy: [
          'D lidera y decide, S estabiliza y ejecuta con constancia, un dúo que combina velocidad de decisión con entrega firme hasta el final.',
          'S cuida las relaciones y el clima que D suele descuidar, protegiendo al equipo que la presión del D podría desgastar.',
          'Cuando D define el rumbo, S garantiza que el plan se siga sin abandono a mitad de camino, reduciendo los proyectos empezados y no terminados.',
          'S le da al D una lectura realista de cómo el cambio afecta a las personas, evitando decisiones rápidas que rompen la operación.',
          'En rutinas largas, D da el impulso inicial y S sostiene la constancia, manteniendo el resultado sin depender de nuevos empujones.',
        ],
        communication:
          'D debe dar contexto y avisar los cambios con antelación, porque S entrega mucho más cuando no lo toman por sorpresa. S necesita posicionarse en voz alta en el momento, en lugar de aceptar por fuera y guardar el desacuerdo. En las conversaciones, D gana si baja el ritmo del tono y pregunta la opinión del S antes de cerrar la decisión. Repartan los roles con claridad: D asume las decisiones y el ritmo, S asume la ejecución constante y el cuidado del equipo, sin que uno invada el terreno del otro.',
      },
      DC: {
        friction: [
          'D quiere decidir rápido y C necesita datos y tiempo para analizar, así que D lee al C como un freno y C lee al D como imprudente.',
          'C señala riesgos y detalles que faltan, y D lo interpreta como resistencia o exceso de burocracia en plena entrega.',
          'Los dos son exigentes pero en sentidos opuestos, D exige resultado a tiempo y C exige calidad sin fallas, y el equipo queda en el fuego cruzado.',
          'Cuando el plazo aprieta, D quiere entregar tal como está y C se niega a soltar algo por debajo del estándar, y la tensión sube.',
          'D decide por instinto y C por el dato, así que cada uno desconfía del método del otro y la decisión se atasca en la desconfianza mutua.',
        ],
        synergy: [
          'D impulsa el resultado y C garantiza la calidad, un dúo fuerte para proyectos que deben entregar rápido y con estándar alto a la vez.',
          'C frena al D en los errores evitables antes de que se vuelvan pérdida, funcionando como control de calidad sin trabar la entrega.',
          'D le da al C un sentido de urgencia y un plazo, evitando que el análisis se extienda sin fin tras la certeza perfecta.',
          'En decisiones de riesgo, D aporta el coraje de actuar y C aporta el criterio para actuar bien, reduciendo tanto la parálisis como el error impulsivo.',
          'Juntos elevan el nivel de lo que el equipo entrega: la velocidad del D con el rigor técnico del C, algo raro en un solo perfil.',
        ],
        communication:
          'D debe traer los datos que tiene y darle al C un tiempo mínimo para procesar antes de exigir la decisión, o el C se bloquea por inseguridad. C necesita empezar por lo esencial y la conclusión, dejando el detalle para después, para que D no pierda el hilo ni la paciencia. Acuerden de antemano qué es innegociable en calidad y qué puede ceder por el plazo, para que el choque no ocurra sobre la hora. En las reuniones, D conduce meta y plazo, C conduce criterio y riesgo, y la decisión final pondera ambos lados en lugar de que uno venza al otro.',
      },
      II: {
        friction: [
          'Los dos hablan mucho y ejecutan poco, la lista de ideas crece en cada reunión mientras la entrega concreta se encoge.',
          'Ambos quieren el escenario, así que compiten por la atención del grupo y las reuniones se vuelven un concurso de quién habla más en vez de una decisión.',
          'Los plazos y los detalles quedan en segundo plano para los dos, y tareas importantes se atrasan porque ninguno asumió el trabajo tedioso.',
          'Como los dos esquivan la parte árida, nadie sigue números ni checklists, y los problemas solo aparecen cuando ya estallaron.',
          'En el calor del entusiasmo, ambos prometen más de lo que el equipo puede entregar, y la cuenta llega después en forma de frustración.',
        ],
        synergy: [
          'La energía del dúo es altísima, y juntos crean un ambiente animado que motiva y contagia al resto del equipo.',
          'El doble de creatividad y networking hace que las ideas y las conexiones fluyan, ideal para campañas, eventos y lanzamientos.',
          'Cuando necesitan vender una idea internamente, los dos suman su poder de influencia y la propuesta gana al grupo rápido.',
          'En momentos de moral baja, el dúo reaviva el ánimo del equipo y devuelve la ligereza a un clima pesado.',
          'El intercambio constante de ideas entre ellos genera soluciones creativas a las que perfiles más cerrados difícilmente llegarían.',
        ],
        communication:
          'Definan desde el inicio quién ejecuta qué y déjenlo por escrito, porque la buena intención de ambos se desvanece sin un responsable claro. Acuerden plazos reales y un momento fijo para revisar lo que de verdad se hizo, o todo se vuelve conversación animada sin entrega. Conviene sumar a alguien organizado al equipo, o turnarse para asumir la parte tediosa en cada proyecto. Aprovechen la energía para celebrar los logros juntos, pero separen el momento de celebrar del momento de decidir, para que la reunión no sea solo fiesta.',
      },
      IS: {
        friction: [
          'El ritmo acelerado y los cambios constantes del I sobrecargan al S, que necesita previsibilidad para rendir bien.',
          'I se frustra con el tiempo que tarda S en sumarse a una novedad, y empieza a empujar cambios que S aún no ha digerido.',
          'S guarda las insatisfacciones para no generar roce, y I, distraído por su propia energía, nunca percibe que algo anda mal.',
          'I cambia de tema y de prioridad todo el tiempo, y S se siente inseguro sin saber cuál es el foco real de la semana.',
          'Cuando el clima se calienta, I quiere resolver hablando fuerte y rápido, y S se retrae, y la conversación no ocurre.',
        ],
        synergy: [
          'I energiza y conecta a las personas, S apoya y estabiliza, juntos forman un equipo cálido, colaborativo y agradable para trabajar.',
          'S le da constancia a la energía del I, transformando el entusiasmo pasajero en relaciones y rutinas que duran.',
          'S cuida en silencio los detalles y el seguimiento que I deja de lado, cubriendo el punto débil del compañero.',
          'En las relaciones con clientes y equipo, I abre la puerta y S mantiene el vínculo a largo plazo, una combinación fuerte en atención.',
          'El clima de confianza que ambos crean hace que el equipo se sienta seguro para hablar y pedir ayuda.',
        ],
        communication:
          'I debe desacelerar y avisar los cambios con antelación, dándole a S tiempo para prepararse en lugar de reaccionar a las corridas. S necesita hablar abiertamente de sus preocupaciones apenas surgen, en lugar de guardarlas hasta que se vuelvan rencor. Acuerden una prioridad clara por período, para que S no se pierda en el cambio constante de foco del I. En las conversaciones difíciles, I gana si baja el tono y escucha más, y S gana si dice lo que piensa aun a riesgo de un pequeño roce.',
      },
      IC: {
        friction: [
          'La espontaneidad del I choca de frente con la precisión del C, y lo que para uno es agilidad para el otro es descuido.',
          'C considera al I desorganizado y superficial, I considera al C rígido y aburrido, y cada uno subestima el aporte del otro.',
          'I quiere empezar ya y ajustar sobre la marcha, C quiere planear todo antes, y la diferencia de ritmo genera roce al arranque de cualquier tarea.',
          'C señala errores e inconsistencias, e I, que se mueve por reconocimiento, lo recibe como crítica personal y se desanima.',
          'En la reunión, I aporta visión y C aporta reparos, y sin mediación la conversación oscila entre el optimismo suelto y el escepticismo que traba.',
        ],
        synergy: [
          'I aporta idea, energía y relación, C aporta rigor, calidad y profundidad, un equilibrio raro entre encantar y entregar bien hecho.',
          'C aterriza las ideas del I en algo concreto y ejecutable, transformando el entusiasmo en un plan de verdad.',
          'Juntos son excelentes para explicar y vender temas técnicos, I aporta el encanto y la claridad, C garantiza que el contenido sea correcto.',
          'I abre puertas y conquista a las personas, C sostiene la credibilidad con datos, un dúo convincente y confiable a la vez.',
          'La creatividad del I sumada al ojo crítico del C genera soluciones innovadoras que además pasan la prueba de la calidad.',
        ],
        communication:
          'I debe llevar hechos y evidencias al C, porque solo el entusiasmo no convence a quien decide por el dato. C necesita abrirse a ideas nuevas sin exigir perfección en el primer borrador, y cuidar que la crítica venga con reconocimiento, no solo como corrección. Acuerden un momento para divergir libremente y otro para cerrar con rigor, separando el brainstorm de la revisión. Repartan los roles en la presentación: I conduce la relación y la narrativa, C garantiza la exactitud del contenido, buscando siempre el punto medio entre encantar y demostrar.',
      },
      SS: {
        friction: [
          'Los dos evitan el conflicto y dejan que los problemas se acumulen sin decir nada, hasta que el pequeño roce se vuelve un gran desgaste.',
          'Las decisiones se vuelven lentas o se aplazan indefinidamente, porque ninguno quiere hacerse cargo de la decisión difícil y asumir el riesgo.',
          'Ambos resisten el cambio, incluso el necesario, y el dúo se acomoda en una rutina que ya no le sirve al equipo.',
          'Las insatisfacciones quedan guardadas por ambos lados, y el clima aparentemente tranquilo esconde rencores que nadie verbaliza.',
          'Sin alguien que marque el ritmo, los plazos se escurren en silencio porque exigirle al otro parece romper la armonía.',
        ],
        synergy: [
          'La armonía, la lealtad y la cooperación entre ambos son genuinas, y el equipo siente un ambiente estable y sin roscas.',
          'El dúo sostiene la operación a largo plazo, dándole al equipo una base de estabilidad que aguanta la rutina incluso en fases difíciles.',
          'Crean un ambiente seguro donde todos se sienten escuchados, lo que hace que la gente a su alrededor plantee los problemas más temprano.',
          'Trabajan con paciencia y constancia, ideales para funciones de continuidad, soporte y cuidado de las personas.',
          'La lealtad mutua vuelve al dúo extremadamente confiable en momentos que exigen discreción y apoyo silencioso.',
        ],
        communication:
          'Acuerden que ser honesto sobre un problema no es una agresión, para que ambos puedan expresar la incomodidad aunque no disfruten el momento. Definan quién impulsa cada decisión y un plazo para dar el veredicto, o la elección se queda dando vueltas sin fin. Agenden una conversación periódica solo para poner sobre la mesa lo que incomoda, creando un espacio seguro para lo que nadie diría en el pasillo. Ante un cambio necesario, escriban juntos el porqué y las ganancias, para vencer la resistencia natural de ambos con argumento y no con presión.',
      },
      SC: {
        friction: [
          'Los dos son cautelosos y reacios al riesgo, y juntos pueden trabarse ante cualquier decisión que implique incertidumbre.',
          'El exceso de análisis antes de cambiar cualquier cosa hace que el dúo aplace movimientos que el negocio necesita hacer pronto.',
          'S busca armonía y C busca precisión, y a veces el apego del C al proceso pasa por encima del cuidado del S por las personas.',
          'A ninguno le gusta el enfrentamiento, así que las diferencias sobre el método quedan sin resolver y se arrastran.',
          'El dúo se siente demasiado cómodo en la rutina conocida y resiste las innovaciones incluso cuando traerían una ganancia clara.',
        ],
        synergy: [
          'El trabajo del dúo es confiable, minucioso y de calidad consistente, con muy poca variación de un día al otro.',
          'El bajo índice de error y el respeto por las reglas los convierten en uno de los pares más estables para rutinas de precisión.',
          'S mantiene el clima y C mantiene el estándar, y juntos entregan calidad sin generar roce con el equipo alrededor.',
          'Son el dúo indicado para procesos críticos que no pueden fallar, porque ambos verifican antes de soltar.',
          'La combinación de cuidado por las personas y cuidado por el detalle crea una operación previsible en la que el liderazgo puede confiar.',
        ],
        communication:
          'Trabajen con procesos y criterios claros y definidos por escrito, porque ambos se sienten seguros cuando el camino está mapeado. Avisen los cambios con antelación y den tiempo de adaptación, evitando el susto que traba al S y el análisis sin fin que traba al C. Acuerden de antemano un plazo para cerrar el análisis y actuar, para que la cautela de ambos no se vuelva parálisis. Anímense mutuamente a posicionarse cuando algo esté mal, tratando la diferencia sobre el método como parte del trabajo y no como un conflicto personal.',
      },
      CC: {
        friction: [
          'El perfeccionismo de los dos lleva a la parálisis por análisis, y el dúo demora la entrega en busca de una certeza que nunca llega.',
          'Ambos tienden a criticar en exceso, y la revisión mutua se vuelve un vaivén de observaciones que genera tensión y desgasta la relación.',
          'Ninguno avanza sin el nivel de certeza que el otro tampoco considera suficiente, y el proyecto se atasca en verificaciones interminables.',
          'Como ambos valoran el detalle, las discusiones técnicas se extienden sobre puntos mínimos mientras el plazo general aprieta.',
          'Bajo presión, ambos se cierran aún más en el dato y se endurecen, rechazando cualquier atajo y trabando decisiones urgentes.',
        ],
        synergy: [
          'La precisión, la calidad y la profundidad técnica del dúo son excepcionales, y el estándar de entrega queda por encima del promedio del mercado.',
          'El estándar elevado de ambos eleva el nivel de todo lo que pasa por sus manos, subiendo la vara del equipo entero.',
          'Son confiables para tareas críticas que no toleran errores, porque uno revisa al otro y nada sale sin doble verificación.',
          'Juntos producen documentación, análisis y controles impecables, una base sólida en la que el resto de la empresa puede confiar.',
          'El intercambio entre dos miradas rigurosas suele detectar fallas que a cualquier perfil solo se le pasarían.',
        ],
        communication:
          'Acuerden antes de empezar qué es suficientemente bueno y cuál es el criterio de terminado, para no perseguir una perfección que traba la entrega. Fijen plazos firmes y un punto en el que el análisis se cierra y se toma la decisión, aun sin certeza total. Al revisar el trabajo del otro, equilibren la crítica con el reconocimiento de lo que quedó bien, evitando el desgaste de la observación constante. Repartan responsabilidades para no verificar lo mismo dos veces, confiando en el criterio del compañero en lugar de rehacer todo por cuenta propia.',
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // fr — Français (termes de marché). Apóstrofo em backtick quando dentro de string com aspas simples.
  // ═══════════════════════════════════════════════════════════════════════════
  fr: {
    ui: {
      introTitle: `Test de Profil Comportemental (DISC)`,      introLead:
        `Cela prend environ 5 minutes. Répondez en pensant à votre quotidien.`,      introStart: `Commencer`,      back: `Retour`,      next: `Suivant`,      submit: `Envoyer les réponses`,      submitting: `Envoi...`,      progress: `Question {current} sur {total}`,      thanksTitle: `Merci !`,      thanksLead:
        `Vos réponses ont été enregistrées. L’équipe RH recevra votre profil.`,      alreadyDoneTitle: `Réponses déjà envoyées`,      alreadyDoneLead:
        `Ce questionnaire a déjà été rempli. Contactez les RH si vous devez le refaire.`,      loadError: `Impossible de charger le questionnaire. Veuillez réessayer.`,      resultTitle: `Votre profil comportemental`,      greeting: `Bonjour, {name} !`,      assessmentDisclaimer:
        `Répondez avec sincérité : choisissez ce qui vous ressemble vraiment, pas ce que vous aimeriez être ou ce que vous pensez être la "bonne" réponse.`,
      instructionsTitle: `Comment ça marche`,
      instructionsHowto: `Ce sont 28 affirmations sur votre façon d'agir. Cela prend environ 5 minutes.`,
      instructionsDrag: `Faites glisser la barre : à droite si c'est tout à fait vous, à gauche si ce n'est pas du tout vous, au centre si c'est neutre.`,
      instructionsHonest: `Il n'existe pas de bonne ou de mauvaise réponse, ni de profil meilleur ou moins bon. Répondez en pensant à ce qui vous ressemble vraiment.`,
      aboutProfileTitle: `À propos de votre profil`,
    },
    scale: {
      1: `Pas du tout moi`,
      2: `Plutôt pas d'accord`,
      3: 'Neutre',
      4: `Plutôt d'accord`,
      5: `Tout à fait moi`,
      lowAnchor: `Pas du tout moi`,
      highAnchor: `Tout à fait moi`,
    },
    factors: {
      D: {
        name: 'Dominance',
        short: 'D',
        tagline: `Axé sur le résultat et l’action`,
        description: `Mesure à quel point la personne prend les commandes, décide vite et vise le résultat, même en prenant un risque. Un D élevé aime le défi, la confrontation directe et le contrôle.`,
        example: `Souvent associé à Steve Jobs, pour sa vision forte, ses décisions rapides et son obsession du résultat.`,
      },
      I: {
        name: 'Influence',
        short: 'I',
        tagline: `Axé sur les personnes et l’énergie`,
        description: `Mesure à quel point la personne connecte, enthousiasme et convainc les autres. Un I élevé apporte de l’énergie au groupe, aime les gens et anime l’ambiance avec optimisme.`,
        example: `Souvent associée à Oprah Winfrey, pour son charisme, sa connexion avec les gens et sa capacité à mobiliser son entourage.`,
      },
      S: {
        name: 'Stabilité',
        short: 'S',
        tagline: `Axé sur l’harmonie et la constance`,
        description: `Mesure à quel point la personne valorise la constance, l’harmonie et la prévisibilité. Un S élevé est patient, loyal, excellent écoutant et soutient l’équipe sur la durée.`,
        example: `Souvent associé à Warren Buffett, pour sa patience, sa constance et sa vision de long terme.`,
      },
      C: {
        name: 'Conformité',
        short: 'C',
        tagline: `Axé sur la qualité et le critère`,
        description: `Mesure à quel point la personne se guide par les données, les règles et un standard de qualité. Un C élevé analyse calmement, soigne le détail et décide sur des faits, pas sur l’impulsion.`,
        example: `Souvent associé à Bill Gates, pour son analyse, sa méthode et sa rigueur technique fondée sur les données.`,
      },
    },
    charts: {
      barTitle: 'Graphique DISC',
      radarTitle: 'Compétences Comportementales',
      wheelTitle: 'Roue de style',
      average: 'Moyenne',
      wheelCenter: 'Adaptable',
      wheelEdge: 'Marqué',
      score: 'Score',
    },
    attributes: {
      proactivity: 'Proactivité',
      resultsFocus: 'Focus résultats',
      leadership: 'Leadership',
      communication: 'Communication',
      teamwork: 'Travail d`équipe',
      patience: 'Patience',
      discipline: 'Discipline',
      attentionToDetail: 'Souci du détail',
    },
    competencies: {
      competitiveness: 'Compétitivité',
      agility: 'Agilité',
      confidence: 'Confiance',
      energy: 'Énergie',
      flexibility: 'Flexibilité',
      influence: 'Influence',
      creativity: 'Créativité',
      consistency: 'Cohérence',
      communication: 'Communication',
      empathy: 'Empathie',
      planning: 'Planification',
      patience: 'Patience',
      analysis: 'Analyse',
      judgment: 'Jugement',
      security: 'Sécurité',
      discipline: 'Discipline',
    },
    sections: {
      qualidades: 'Forces',
      pontosDeAtencao: 'Points de vigilance',
      comoLiderar: 'Comment diriger et communiquer',
      oQueEvitar: 'Ce qu’il faut éviter',
      comunicacaoIdeal: 'Communication idéale',
      ondeBrilha: 'Là où il brille',
      sobEstresse: 'Sous stress',
      profileHeading: 'Profil {code}',
    },
    disclaimer:
      'Ceci est un outil de connaissance de soi et de communication d’équipe. Ce n’est ni un test clinique ni un diagnostic. Aucun profil n’est meilleur ou pire qu’un autre.',
    items: {
      d1: `J’aime prendre les commandes des situations.`,      d2: `Je pousse pour que les choses avancent au rythme que je veux.`,      d3: `Je vais droit au but, même si cela paraît dur.`,      d4: `J’aime la compétition et gagner.`,      d5: `Je décide vite, même en prenant un certain risque.`,      d6: `Je préfère céder plutôt que d’entrer en confrontation.`,      d7: `J’ai du mal à dire non.`,      d8: `Je prends des risques pour atteindre un objectif.`,      d9: `J’apprécie les défis difficiles.`,      d10: `Je dis ce que je pense, sans détours.`,      d11: `Je préfère que quelqu’un d’autre prenne les décisions difficiles.`,      d12: `Je reste concentré sur le résultat même sous pression.`,      i1: `Je me fais facilement de nouveaux amis.`,      i2: `J’aime être au centre de l’attention.`,      i3: `Je suis enthousiaste et je communique mon énergie aux autres.`,      i4: `Je préfère échanger des idées plutôt que travailler seul.`,      i5: `Je reste optimiste même face aux problèmes.`,      i6: `Dans un grand groupe, je préfère rester discret.`,      i7: `Je parle peu de moi.`,      i8: `J’aime faire la connaissance de nouvelles personnes.`,      i9: `Je convaincs facilement les autres.`,      i10: `J’apporte de la bonne humeur dans l’environnement de travail.`,      i11: `Je préfère travailler seul plutôt qu’en groupe.`,      i12: `Je m’enthousiasme pour les nouvelles idées.`,      s1: `J’ai de la patience avec les processus lents.`,      s2: `Je préfère la routine et la prévisibilité aux surprises.`,      s3: `J’écoute attentivement avant de me positionner.`,      s4: `J’évite les conflits pour préserver l’harmonie du groupe.`,      s5: `Je suis loyal et constant envers ceux en qui j’ai confiance.`,      s6: `J’aime quand les plans changent soudainement.`,      s7: `Je m’impatiente quand les choses traînent.`,      s8: `Je reste calme dans les situations tendues.`,      s9: `J’aide mes collègues quand ils en ont besoin.`,      s10: `Je préfère un environnement stable et sans surprises.`,      s11: `J’aime prendre des risques et m’adapter au changement.`,      s12: `Je suis généralement le premier à apaiser un conflit.`,      c1: `Je remarque des détails que la plupart ne voient pas.`,      c2: `J’aime que tout soit organisé et en ordre.`,      c3: `Je vérifie mon travail plus d’une fois.`,      c4: `Je préfère suivre des règles et des procédures claires.`,      c5: `J’analyse les données calmement avant de décider.`,      c6: `J’ai tendance à décider sur un coup de tête, sans trop analyser.`,      c7: `Les petites erreurs ne me dérangent pas.`,      c8: `Je suis les listes de contrôle et les procédures à la lettre.`,      c9: `Je relis mon travail pour éviter les erreurs.`,      c10: `Je préfère la qualité à la rapidité.`,      c11: `Je ne me soucie guère des détails.`,      c12: `Je fonde mes décisions sur des faits et des chiffres.`,
      d13: `J’aime prendre les commandes et guider les gens dans les situations.`,
      d14: `Je prends des décisions rapidement, souvent seul.`,
      i13: `Je suis animé et je me détends facilement en compagnie des autres.`,
      i14: `Je convaincs et j’implique les gens avec facilité.`,
      s13: `J’écoute attentivement et je me mets à la place de l’autre.`,
      s14: `Je préfère suivre les plans calmement et avec constance jusqu’au bout.`,
      c13: `Je soigne les détails et j’aime avoir le temps de livrer avec précision.`,
      c14: `Je suis des procédures bien définies pour garder le contrôle.`,
    },
    profiles: {
      D: {
        nome: `L'Exécuteur`,
        biografia:
          `Vous êtes du genre à prendre les commandes sans attendre qu'on vous y autorise. Là où d'autres voient un problème difficile, vous voyez un objectif, et vous foncez avec une hâte qui entraîne et qui, parfois, effraie. Vous décidez vite, vous parlez franc et vous préférez une erreur rattrapable à l'attente immobile de la certitude parfaite. Dans une équipe, vous êtes souvent le moteur : quand l'énergie retombe, c'est vous qui ramenez tout le monde vers le résultat.\n\nVotre force, c'est justement ce courage de décider et cette disposition à affronter la confrontation que la plupart évitent. Mais le trait qui débloque écrase aussi : dans l'empressement à livrer, vous pouvez passer par-dessus les personnes et prendre la lenteur des autres pour de la mauvaise volonté. Ce n'en est pas toujours, et le reconnaître sépare le chef que l'on craint du leader que l'on respecte.\n\nVous donnez le meilleur avec un objectif clair, de l'autonomie sur le chemin et un défi à votre hauteur. Le point de vigilance, c'est de vous rappeler qu'un résultat qui épuise l'équipe à mi-parcours ne tient pas. Apprendre à demander avant d'ordonner, et à écouter avant de décider, démultiplie votre capacité déjà naturelle à faire avancer les choses.`,
        qualidades: [
          `Prend les commandes d'une situation bloquée sans qu'on le lui demande, et débloque le groupe`,
          `Décide vite même avec une information incomplète, évitant que l'équipe ne s'arrête`,
          `Dit ce qu'il faut dire de façon directe, sans détours qui retardent la conversation`,
          `Ne recule ni devant la confrontation ni devant un objectif difficile, aborde le défi de front`,
          `Garde le cap sur le résultat même quand la pression monte et que les autres hésitent`,
        ],
        pontosDeAtencao: [
          `Dans l'empressement à livrer, il bouscule celui qui est à côté et laisse l'équipe démotivée`,
          `Coupe la parole aux autres et décide avant d'avoir écouté toute l'équipe`,
          `Traite les processus et les précautions nécessaires comme une perte de temps`,
          `L'impatience avec le rythme des autres devient de la sécheresse et use les relations`,
          `Prend trop de risques en se fiant à son seul instinct, sans vérifier la donnée`,
        ],
        comoLiderar: [
          `Donnez des objectifs clairs et laissez la personne libre de choisir le "comment"`,
          `Exigez sur le résultat, pas sur le chemin, et évitez la micro-gestion qu'il déteste`,
          `Soyez concis et allez à l'essentiel, sans longue introduction`,
          `Offrez de vrais défis et de la reconnaissance pour les livraisons difficiles réussies`,
          `Pointez l'impact sur les personnes de façon factuelle, pour qu'il voie le coût de la hâte`,
        ],
        oQueEvitar: ['Ambiguïté', 'Décision lente', 'Détours', 'Micro-gestion'],
        comunicacaoIdeal:
          `Directe et objective, avec le délai et l'objectif en avant. Allez à l'essentiel, apportez la décision à prendre et évitez la longue introduction qui le fait décrocher.`,
        ondeBrilha: [
          `Diriger un projet au délai serré et à l'objectif agressif`,
          `Négociations dures où il faut tenir sa position`,
          `Moments de crise, quand la plupart se figent et que quelqu'un doit décider`,
          `Ouvrir un front nouveau, à partir de zéro, sans processus tout prêt`,
          `Virages qui exigent de couper vite ce qui ne fonctionne pas`,
        ],
        sobEstresse:
          `Devient plus contrôlant et sec, cherche à reprendre la main sur tout et passe par-dessus quiconque se trouve sur son chemin. La hâte se change en impatience ouverte.`,
      },
      I: {
        nome: 'Le Communicant',
        biografia:
          `Vous êtes du genre à illuminer une pièce en y entrant. Vous vous liez d'amitié facilement, vous engagez la conversation avec quelqu'un que vous venez de rencontrer et vous transformez un groupe silencieux en équipe animée en quelques minutes. Vos idées arrivent en rafales, et votre enthousiasme est assez sincère pour contaminer même les plus sceptiques. Quand il faut vendre une idée, embarquer les gens ou raviver le moral d'une équipe fatiguée, peu le font aussi bien que vous.\n\nVotre force, c'est cette capacité rare de connecter et de mobiliser les personnes. Le revers, c'est que, dans le feu de l'émotion, vous commencez beaucoup et terminez peu, vous fuyez le détail fastidieux et parfois vous promettez plus que vous ne pouvez tenir juste pour faire plaisir. La reconnaissance vous meut tant qu'une critique sèche peut vous faire chuter plus que de raison, et l'isolement vous vide vite.\n\nVous donnez le meilleur dans les environnements avec du monde, du mouvement et de la visibilité, et vous travaillez mieux aux côtés de quelqu'un d'organisé qui gère le détail que vous laissez filer. Le point de vigilance, c'est d'apprendre à clore ce que vous ouvrez et à séparer l'enthousiasme de l'engagement : une promesse tenue vaut mieux que dix discours enflammés. Doser l'énergie avec du focus transforme votre charisme en résultat réel.`,
        qualidades: [
          `Crée un lien avec presque n'importe qui en quelques minutes et ouvre des portes à l'équipe`,
          `Contamine l'équipe d'un enthousiasme sincère et ravive le moral quand il retombe`,
          `Génère des idées nouvelles en rafale et voit des possibilités que les autres ne voient pas`,
          `Convainc et embarque avec naturel, vendant une idée en interne avec facilité`,
          `Apporte de la légèreté et de la bonne humeur qui rendent l'ambiance agréable`,
        ],
        pontosDeAtencao: [
          `Commence beaucoup de projets à la fois et en termine peu`,
          `Fuit le détail et le travail aride, laissant des trous qui ressortent plus tard`,
          `Promet plus qu'il ne peut livrer pour plaire sur le moment`,
          `Disperse son attention facilement et perd le focus de la semaine`,
          `Souffre trop de la critique sèche et cherche l'approbation d'une façon qui gêne la décision`,
        ],
        comoLiderar: [
          `Donnez de la reconnaissance publique pour les livraisons, c'est ce qui motive le plus cette personne`,
          `Associez-le à quelqu'un d'organisé qui gère le détail et le suivi`,
          `Aidez-le à garder le cap sur quelques priorités à la fois`,
          `Apportez toujours la critique avec la reconnaissance, jamais la seule correction`,
          `Ancrez ses promesses dans des délais et des livraisons concrètes`,
        ],
        oQueEvitar: ['Trop de règles et de détail', 'Critique sans reconnaissance', 'Isolement'],
        comunicacaoIdeal:
          `Chaleureuse et avec de l'espace pour parler, valorisant les idées de la personne. Commencez par la reconnaissance avant d'exiger, car il se ferme quand il sent de la froideur d'entrée.`,
        ondeBrilha: [
          `Vente et service, où le lien ouvre la conversation`,
          `Relation avec les clients et les partenaires sur le long terme`,
          `Marketing, événements et lancements qui demandent de l'énergie`,
          `Intégration d'une nouvelle équipe et amélioration du climat`,
          `Présentations où il faut séduire et convaincre le public`,
        ],
        sobEstresse:
          `Parle trop, cherche l'approbation et se disperse encore plus. Souffre quand il s'isole et peut promettre l'impossible juste pour relâcher la tension du moment.`,
      },
      S: {
        nome: 'Le Soutien',
        biografia:
          `Vous êtes du genre à soutenir l'équipe de l'intérieur, sans avoir besoin de paraître. Vous avez de la patience avec ce qui traîne, de la loyauté envers celui qui vous fait confiance et un calme qui apaise les autres dans les moments tendus. Pendant que les projecteurs vont vers celui qui crie le plus fort, c'est votre soin discret du climat et des personnes qui maintient l'opération debout, surtout dans les phases difficiles.\n\nVotre force tient dans la constance et l'écoute : vous écoutez vraiment avant de vous positionner, vous aidez le collègue qui en a besoin et vous livrez avec une régularité sur laquelle la direction peut compter les yeux fermés. Le revers, c'est que, pour préserver l'harmonie, vous évitez le conflit même quand il est nécessaire, vous gardez des insatisfactions muettes jusqu'à ce qu'elles deviennent usure, et vous résistez aux changements brusques qui tombent par surprise.\n\nVous donnez le meilleur dans un environnement stable, avec des changements annoncés à l'avance et votre rôle reconnu. Le point de vigilance, c'est d'apprendre à dire le malaise sur le moment, au lieu de l'avaler, et à assumer la décision difficile quand elle vous revient. Dire ce que vous pensez, même au risque d'un petit accroc, protège la relation sur le long terme bien plus que le silence.`,
        qualidades: [
          `Garde son calme et apaise les autres dans les situations tendues, stabilisant le groupe`,
          `Écoute vraiment avant de se positionner, et les personnes se sentent accueillies`,
          `Est loyal et constant envers celui qui lui fait confiance, livrant avec une régularité prévisible`,
          `Prend soin du climat et aide le collègue en difficulté sans attendre qu'on le lui demande`,
          `Tient des routines longues sans perdre le standard, idéal pour les fonctions de continuité`,
        ],
        pontosDeAtencao: [
          `Évite le conflit même quand il est nécessaire, laissant les problèmes grossir`,
          `Garde des insatisfactions muettes jusqu'à ce qu'elles deviennent usure ou rancoeur`,
          `Résiste aux changements brusques et tarde à adhérer à la nouveauté`,
          `Se surcharge en silence, sans demander de l'aide à temps`,
          `Tarde à décider quand le choix exige d'assumer quelque chose d'impopulaire`,
        ],
        comoLiderar: [
          `Annoncez les changements à l'avance, il livre bien plus quand il n'est pas pris par surprise`,
          `Incluez-le dans les décisions et demandez son avis avant de trancher`,
          `Valorisez la loyauté et la constance, qui passent souvent inaperçues`,
          `Créez un espace sûr pour qu'il dise ce qui le dérange`,
          `Donnez un soutien explicite quand il doit assumer une décision difficile`,
        ],
        oQueEvitar: ['Changement brusque sans préavis', 'Reproche en public', 'Précipitation', 'Confrontation directe'],
        comunicacaoIdeal:
          `Calme et proche, montrant comment le changement aide l'équipe et en s'assurant qu'il se sente écouté. Baissez le ton, laissez du temps et demandez son avis avant de décider.`,
        ondeBrilha: [
          `Support et service qui exigent patience et écoute`,
          `RH et après-vente, en entretenant le lien sur le long terme`,
          `Fonctions de continuité où la constance vaut plus que la vitesse`,
          `Stabilisation d'une équipe usée ou en conflit`,
          `Routines critiques qui ne peuvent pas osciller d'un jour à l'autre`,
        ],
        sobEstresse:
          `Se replie et cherche la sécurité, le conflit le paralyse. Absorbe la tension de tous en silence et garde son insatisfaction au lieu de mettre le problème sur la table.`,
      },
      C: {
        nome: `L'Analyste`,
        biografia:
          `Vous êtes du genre à remarquer le détail que la plupart laissent passer. Avant de décider, vous rassemblez les données, vous vérifiez plus d'une fois et vous ne signez que lorsque ce que vous livrez atteint le standard que vous exigez vous-même, et il est souvent élevé. Là où d'autres improvisent, vous avez une méthode, et c'est justement cette rigueur qui fait que l'équipe a confiance que ce qui est passé entre vos mains est bien fait.\n\nVotre force, c'est la qualité et la profondeur : vous êtes expert de votre domaine, vous élevez le niveau de tout ce que vous touchez et vous êtes fiable sur les livraisons critiques qui ne peuvent pas échouer. Le revers, c'est que le perfectionnisme peut bloquer la livraison en quête d'une certitude qui n'arrive jamais, le contact peut sembler froid et la critique, trop dure, envers les autres comme envers vous-même. La précipitation sans préavis vous déstabilise plus que la plupart ne l'imaginent.\n\nVous donnez le meilleur avec des critères clairs, des données fiables et du temps pour bien faire. Le point de vigilance, c'est de convenir à l'avance de ce qui est "assez bon" et d'accepter qu'à certains moments, livrer à temps vaut mieux que courir après le parfait. Apporter la reconnaissance avec la correction, et un peu de chaleur au contact, fait que votre rigueur rend sans éloigner les personnes.`,
        qualidades: [
          `Remarque des détails et des risques que la plupart ne perçoivent pas, évitant des erreurs coûteuses`,
          `Décide sur des faits et des données, pas sur une impulsion, et tient son choix`,
          `Vérifie son propre travail avant de le lâcher, avec un taux d'erreur très bas`,
          `Élève le standard de qualité de tout ce qui passe entre ses mains`,
          `Est un expert fiable dans son domaine, référence technique pour l'équipe`,
        ],
        pontosDeAtencao: [
          `Le perfectionnisme bloque la livraison en quête d'une certitude qui n'arrive pas`,
          `Le contact plus froid peut éloigner les personnes et sembler distant`,
          `La critique sort trop dure, envers lui-même comme envers les autres`,
          `La précipitation et le délai serré sans préavis le déstabilisent`,
          `Peut se perdre dans le détail minime pendant que le délai global se resserre`,
        ],
        comoLiderar: [
          `Donnez des critères et des données clairs, il décide mieux quand le terrain est balisé`,
          `Permettez le travail indépendant et respectez l'autonomie technique`,
          `Apportez un feedback précis et bienveillant, ni vague ni dur`,
          `Convenez à l'avance de ce qui est "assez bon" pour éviter la paralysie`,
          `Annoncez les délais à l'avance, le choc de dernière minute le bloque`,
        ],
        oQueEvitar: ['Consigne vague', 'Délai serré sans préavis', 'Critique dure', 'Improvisation'],
        comunicacaoIdeal:
          `Basée sur les faits, de préférence à l'écrit, avec contexte et anticipation. Apportez la donnée qui appuie la demande et laissez le temps de traiter avant d'exiger la décision.`,
        ondeBrilha: [
          `Analyse et contrôle qualité qui ne tolèrent pas l'erreur`,
          `Finance, processus et audit, où le critère fait tout`,
          `Documentation technique et normes qui exigent de la précision`,
          `Tâches critiques où une seule faille coûte cher`,
          `Revue et vérification du travail des autres`,
        ],
        sobEstresse:
          `Cherche plus de données et de règles et se fige par peur de se tromper. S'enferme dans le détail, durcit la critique et rejette tout raccourci non éprouvé.`,
      },
      DI: {
        nome: 'Le Moteur',
        biografia:
          `Vous êtes du genre à réunir l'ambition de celui qui veut le résultat et le charisme de celui qui sait entraîner les gens. Vous fixez l'objectif, vous montez sur scène et vous mobilisez l'équipe à une vitesse que peu suivent. Là où l'entrain manque, vous mettez de l'énergie ; là où le cap manque, vous montrez la direction. C'est un profil fait pour les virages, les lancements et les environnements dynamiques où il faut décider vite et embarquer en même temps.\n\nVotre force, c'est cette combinaison rare de focus sur le résultat et de pouvoir d'influence : non seulement vous savez où vous voulez arriver, mais vous faites en sorte que l'équipe veuille y arriver avec vous. Le revers, c'est que vous bousculez et vous vous dispersez à la fois, vous promettez plus que l'équipe ne peut livrer et vous perdez patience avec le détail qui soutient la promesse. Dans l'enthousiasme, il est facile de prendre plus de fronts que vous ne pouvez en clore.\n\nVous donnez le meilleur avec une scène, un objectif ambitieux et de la visibilité, aux côtés de quelqu'un qui gère le détail que vous laissez filer. Le point de vigilance, c'est d'ancrer l'émotion dans des engagements réalistes et d'exiger de vous-même du focus sur ce qui est déjà promis avant d'ouvrir le front suivant. Moins d'idées éparses et plus de paris tenus transforment votre élan en résultat qui dure.`,
        qualidades: [
          `Fixe l'objectif et mobilise l'équipe derrière lui à une vitesse rare`,
          `Combine le focus sur le résultat avec le pouvoir d'embarquer et de vendre l'idée`,
          `Apporte une énergie qui ravive le moral et fait avancer l'opération vite`,
          `Communique direct, mais avec chaleur, sans sonner froid comme un D pur`,
          `Aborde les virages et les lancements avec courage et enthousiasme à la fois`,
        ],
        pontosDeAtencao: [
          `Bouscule les personnes et disperse son attention en même temps`,
          `Promet plus que l'équipe ne peut livrer dans le délai`,
          `Perd patience avec le détail qui soutient sa propre promesse`,
          `Prend plus de fronts qu'il ne peut en clore, dans le feu de l'enthousiasme`,
          `Accélère tant qu'il laisse l'équipe à bout de souffle pour suivre`,
        ],
        comoLiderar: [
          `Donnez une scène et des objectifs ambitieux, c'est là que cette personne s'enflamme`,
          `Associez-le à quelqu'un qui gère le détail et le suivi`,
          `Exigez le focus sur ce qui est déjà promis avant d'ouvrir un nouveau front`,
          `Ancrez les promesses dans des délais et des livraisons réalistes`,
          `Reconnaissez publiquement les virages réussis`,
        ],
        oQueEvitar: ['Routine', 'Lenteur', 'Environnement sans visibilité'],
        comunicacaoIdeal:
          `Objective et animée, avec un objectif ambitieux et de la reconnaissance en chemin. Apportez le grand défi d'entrée et montrez la visibilité que génère la livraison.`,
        ondeBrilha: [
          `Environnements dynamiques avec visibilité et objectif agressif`,
          `Leadership commercial et équipes de vente`,
          `Lancements et campagnes qui demandent énergie et cap`,
          `Virages d'opération à court délai`,
          `Mobilisation d'une équipe démoralisée autour d'un objectif`,
        ],
        sobEstresse:
          `Accélère trop et prend plus qu'il ne peut livrer. Parle plus fort, pousse plus fort et ignore les signes que l'équipe ne suit plus le rythme.`,
      },
      ID: {
        nome: 'Le Persuadeur',
        biografia:
          `Vous êtes du genre à séduire d'abord et à pousser ensuite. Vous arrivez plein d'énergie sociale, vous gagnez les personnes dans la conversation et, une fois le groupe conquis, vous utilisez cette influence pour créer du mouvement et faire avancer les choses. C'est un profil à fort impact, fait pour vendre, présenter et prospecter, dans des situations où convaincre vaut autant que livrer.\n\nVotre force, c'est la capacité de mobiliser vite : vous ouvrez les portes avec le charisme et vous les franchissez avec l'assertivité. Le revers, c'est que, dans l'enthousiasme de convaincre, vous promettez plus que vous ne livrez, vous fuyez le détail et parfois vous sonnez exagéré, insistant dans la persuasion même quand les signaux disent qu'il est temps de lâcher. La reconnaissance vous meut, et sans elle l'énergie se vide.\n\nVous donnez le meilleur dans les environnements avec du monde, du mouvement et des objectifs à impact, loin de la routine statique et du travail solitaire. Le point de vigilance, c'est d'ancrer les promesses dans des délais concrets et de lire le moment où il faut arrêter de pousser. Savoir quand lâcher, et tenir ce que vous avez promis dans le feu de la conversation, transforme votre talent à convaincre en confiance de long terme.`,
        qualidades: [
          `Gagne le groupe dans la conversation puis utilise la relation pour créer du mouvement`,
          `Convainc avec une haute énergie sociale et crée de l'élan là où il y avait de l'inertie`,
          `Ouvre les portes avec le charisme et les franchit avec l'assertivité`,
          `Est fort en vente à impact et en présentations qui doivent enthousiasmer`,
          `Ravive l'énergie de l'ambiance et pousse les personnes à l'action`,
        ],
        pontosDeAtencao: [
          `Promet plus qu'il ne peut livrer dans le feu de la conversation`,
          `Fuit le détail qui soutient la promesse faite`,
          `Peut sonner exagéré et perdre en crédibilité avec les profils plus sceptiques`,
          `Insiste dans la persuasion même quand il est temps de lâcher`,
          `Se vide quand la reconnaissance et le mouvement manquent`,
        ],
        comoLiderar: [
          `Reconnaissez en public, c'est le carburant principal de cette personne`,
          `Ancrez les promesses dans des délais et des livraisons concrètes`,
          `Donnez des objectifs à impact et de la visibilité, évitez la routine qui l'éteint`,
          `Aidez-le à lire le moment où il faut arrêter de pousser`,
          `Associez-le à quelqu'un qui soutient le détail qu'il laisse filer`,
        ],
        oQueEvitar: ['Environnement statique', 'Trop de règles', 'Travail solitaire'],
        comunicacaoIdeal:
          `Chaleureuse et directe, avec de l'espace pour convaincre et un objectif clair à la fin. Reconnaissez d'abord, puis apportez le défi à impact qui le mobilise.`,
        ondeBrilha: [
          `Vente à fort impact où convaincre est la moitié du jeu`,
          `Présentations et pitchs qui doivent enthousiasmer le public`,
          `Prospection et acquisition qui exigent d'ouvrir des portes`,
          `Mobilisation rapide d'un groupe autour d'une idée`,
          `Réactivation de clients ou de partenaires refroidis`,
        ],
        sobEstresse:
          `Insiste à persuader et ignore les signes qu'il est temps de lâcher. Parle plus, promet plus et pousse plus fort, même quand le groupe n'achète déjà plus.`,
      },
      DC: {
        nome: 'Le Challengeur',
        biografia:
          `Vous êtes du genre à vouloir le résultat, mais pas à n'importe quel prix : vous voulez le résultat au bon standard. Vous combinez l'assertivité de celui qui décide vite avec la rigueur de celui qui ne lâche rien en dessous du niveau. Là où un profil n'exige que le délai et un autre que la qualité, vous exigez les deux, et c'est justement cette double exigence qui fait de votre travail une référence.\n\nVotre force, c'est de livrer un résultat au haut standard en même temps, chose rare dans un seul profil : vous avez le courage d'agir et le critère d'agir bien. Le revers, c'est que cette même exigence devient dureté. Vous exigez trop, vous avez peu de patience avec l'erreur et, quand quelque chose sort en dessous de ce que vous jugez acceptable, vous voulez tout refaire jusqu'à la perfection, même quand le délai ne le permet pas.\n\nVous donnez le meilleur dans les projets exigeants, la gestion technique et les situations où résultat et qualité ne peuvent pas se négocier l'un contre l'autre. Le point de vigilance, c'est de reconnaître que tout détail ne justifie pas de bloquer la livraison, et que l'équipe rend plus avec de la reconnaissance qu'avec la seule exigence. Convenir à l'avance de ce qui est non négociable et de ce qui peut céder pour le délai évite que votre exigence ne bloque ce qu'elle devrait débloquer.`,
        qualidades: [
          `Exige résultat et qualité en même temps, élevant le niveau de la livraison`,
          `Unit le courage d'agir au critère d'agir bien`,
          `Tient un standard élevé et ne lâche rien en dessous du niveau acceptable`,
          `Est stratégique et exigeant, pensant le résultat et le risque ensemble`,
          `Freine les erreurs évitables avant qu'elles ne deviennent une perte`,
        ],
        pontosDeAtencao: [
          `Exige trop et a peu de patience avec l'erreur de l'autre`,
          `Veut tout refaire jusqu'à la perfection, même sans délai pour cela`,
          `Dur et perfectionniste à la fois, il use l'équipe`,
          `Peut bloquer la livraison faute d'accepter l'"assez bon"`,
          `Le contact trop direct sonne comme de la froideur sous pression`,
        ],
        comoLiderar: [
          `Apportez des objectifs clairs et des critères objectifs, il décide mieux avec un standard défini`,
          `Respectez l'autonomie technique et le standard élevé qu'il tient`,
          `Reconnaissez la qualité livrée, n'exigez pas seulement la suivante`,
          `Convenez à l'avance de ce qui est non négociable et de ce qui cède pour le délai`,
          `Pointez de façon factuelle quand l'exigence est en train de bloquer la livraison`,
        ],
        oQueEvitar: ['Ambiguïté', 'Bas standard', 'Improvisation'],
        comunicacaoIdeal:
          `Directe et étayée, avec des données et un résultat clair en avant. Apportez le critère objectif et le standard attendu, sans l'ambiguïté qu'il ne tolère pas.`,
        ondeBrilha: [
          `Projets exigeants qui ont besoin de résultat avec qualité`,
          `Gestion technique où le standard ne peut pas baisser`,
          `Situations qui exigent une décision rapide sans renoncer au critère`,
          `Contrôle qualité au délai serré`,
          `Fronts qui se bloqueraient faute de rigueur ou de courage`,
        ],
        sobEstresse:
          `Devient critique et contrôlant, veut tout refaire jusqu'à la perfection. Durcit le contact, exige encore plus et bloque la livraison en quête du standard idéal.`,
      },
      CD: {
        nome: 'Le Réalisateur',
        biografia:
          `Vous êtes du genre à décider, mais seulement après avoir regardé la donnée. D'abord vous analysez, vous rassemblez les faits et vous vous forgez un critère ; ensuite vous agissez avec fermeté, sans hésiter. Là où certains décident à l'instinct et d'autres se bloquent dans l'analyse, vous combinez les deux : vous avez la rigueur de celui qui vérifie et la décision de celui qui exécute. C'est un profil fait pour la décision technique, le contrôle et les situations où se tromper coûte cher.\n\nVotre force, c'est cette fermeté étayée : vous n'agissez pas à l'aveugle et vous ne vous paralysez pas à attendre la certitude absolue. Vous exécutez avec rigueur et vous appuyez la décision sur les chiffres. Le revers, c'est que vous pouvez être froid et impatient avec la "supposition" des autres, vous bloquer par excès d'analyse quand la donnée ne colle pas et avoir un contact trop direct, qui sonne dur pour celui qui attendait plus de tact.\n\nVous donnez le meilleur avec des données fiables, de l'autonomie pour décider sur critère et sans pression émotionnelle sur les épaules. Le point de vigilance, c'est de vous rappeler que toute décision n'attend pas la donnée parfaite, et que les personnes autour de vous ont besoin d'un peu plus de chaleur que de précision. Accepter d'agir avec une information incomplète à certains moments, et adoucir le contact, fait que votre rigueur rend sans éloigner l'équipe.`,
        qualidades: [
          `Analyse la donnée puis agit avec fermeté, sans hésiter dans la décision`,
          `Combine la rigueur de celui qui vérifie avec la décision de celui qui exécute`,
          `Appuie son choix sur des faits et des chiffres, pas sur l'impulsion`,
          `Exécute avec rigueur des tâches qui ne tolèrent pas l'erreur`,
          `Apporte du critère aux décisions à risque, réduisant l'erreur impulsive`,
        ],
        pontosDeAtencao: [
          `Froid et impatient avec la "supposition" des autres`,
          `Peut se bloquer par excès d'analyse quand la donnée ne colle pas`,
          `Le contact trop direct sonne dur pour celui qui attendait du tact`,
          `Rejette ce qui n'est pas prouvé, même sous un délai serré`,
          `S'enferme dans les chiffres et perd la lecture des personnes`,
        ],
        comoLiderar: [
          `Apportez des données fiables, il décide mieux avec l'information en main`,
          `Laissez-le décider sur critère, sans pression émotionnelle`,
          `Évitez d'exiger la décision en haussant le ton, la mauvaise donnée le bloque plus que la hâte`,
          `Donnez de l'autonomie technique et reconnaissez la solidité de l'analyse`,
          `Demandez-lui d'apporter la conclusion avant le détail, pour gagner du temps`,
        ],
        oQueEvitar: ['Décision émotionnelle', 'Mauvaises données', 'Manque de critère'],
        comunicacaoIdeal:
          `Objective et factuelle, avec des chiffres qui appuient la décision. Apportez la conclusion et les données qui la soutiennent, sans appel émotionnel qu'il écarte.`,
        ondeBrilha: [
          `Finance et ingénierie, où le chiffre commande`,
          `Décision technique qui exige un critère ferme`,
          `Contrôle et audit qui ne peuvent pas échouer`,
          `Choix à risque où il faut agir bien, pas seulement vite`,
          `Diagnostic d'un problème sur la base de données`,
        ],
        sobEstresse:
          `S'enferme dans les données et se durcit, rejette ce qui n'est pas prouvé. Devient encore plus froid et impatient, et bloque des décisions urgentes en attendant la certitude qui n'arrive pas.`,
      },
      IS: {
        nome: 'Le Collaborateur',
        biografia:
          `Vous êtes du genre à faire que l'équipe se sente chez elle. Chaleureux et empathique, vous connectez les personnes, vous créez une ambiance légère et vous percevez quand quelqu'un ne va pas avant même qu'il le dise. Là où il y a de la tension, vous l'adoucissez ; là où il y a de la distance, vous la raccourcissez. C'est le genre de présence qui donne aux gens l'envie de travailler ensemble et le sentiment d'être en sécurité pour demander de l'aide.\n\nVotre force, c'est le soin sincère des personnes et la capacité à garder le groupe uni sur le long terme. Vous ouvrez la porte avec de la sympathie et vous entretenez le lien avec constance, une combinaison forte dans le service et dans toute fonction qui dépend de la relation. Le revers, c'est que, pour préserver l'harmonie, vous évitez le conflit et l'exigence, vous peinez sur la décision impopulaire et vous repoussez le difficile, absorbant la tension de tous au lieu de la résoudre.\n\nVous donnez le meilleur dans les équipes harmonieuses, avec un environnement stable et amical, et un soutien explicite quand la décision dure doit vous revenir. Le point de vigilance, c'est d'apprendre qu'éviter la confrontation nécessaire ne fait que repousser le problème et vous surcharger. Dire le difficile à votre façon accueillante, sans avaler la tension, protège à la fois la relation et votre propre énergie.`,
        qualidades: [
          `Perçoit quand quelqu'un ne va pas avant même qu'il le dise, et l'accueille`,
          `Connecte les personnes et crée une ambiance légère où l'équipe a envie de travailler`,
          `Entretient le lien avec les clients et les collègues sur le long terme`,
          `Adoucit les tensions et raccourcit la distance avec celui qui est loin`,
          `Fait que le groupe se sente en sécurité pour parler et demander de l'aide`,
        ],
        pontosDeAtencao: [
          `Évite le conflit et l'exigence pour préserver l'harmonie`,
          `Peine sur la décision impopulaire et repousse le difficile`,
          `Absorbe la tension de tous au lieu de la résoudre`,
          `Garde son propre malaise pour ne pas créer de friction`,
          `Peut se surcharger en prenant soin de tous sauf de lui-même`,
        ],
        comoLiderar: [
          `Valorisez son soin des personnes, qui soutient le climat de l'équipe`,
          `Soutenez-le explicitement dans les décisions difficiles et impopulaires`,
          `Donnez un cadre stable et amical où il rend le plus`,
          `Encouragez-le à dire le malaise tôt, avant qu'il ne tourne au ressentiment`,
          `Évitez de le laisser seul face à une confrontation qu'il éviterait`,
        ],
        oQueEvitar: ['Tension constante', 'Décisions impopulaires sans soutien', 'Froideur'],
        comunicacaoIdeal:
          `Amicale et accueillante, reconnaissant l'effort de garder le groupe uni. Apportez le difficile avec soin et faites comprendre que le lien est préservé.`,
        ondeBrilha: [
          `Équipes harmonieuses qui dépendent de la relation et de la confiance`,
          `Service et succès client sur le long terme`,
          `Facilitation et intégration de nouvelles personnes`,
          `Environnements qui ont besoin d'un climat léger pour rendre`,
          `Pont entre des services ou des personnes en friction`,
        ],
        sobEstresse:
          `Absorbe la tension de tous et évite la confrontation qui la résoudrait. Se tait, repousse le difficile et se surcharge en gardant son propre malaise.`,
      },
      SI: {
        nome: 'Le Facilitateur',
        biografia:
          `Vous êtes du genre à coudre le groupe de l'intérieur. Constant et doux, vous tendez des ponts entre des personnes qui ne se comprennent pas, vous apaisez les frictions avec calme et vous construisez la cohésion qui maintient une équipe unie. Là où le dialogue manque, vous ouvrez le canal ; là où il y a du bruit, vous traduisez. C'est une présence qui apparaît rarement sur scène, mais sans laquelle la scène s'effondrerait.\n\nVotre force, c'est cette capacité à créer de la cohésion et à lire le climat du groupe avant que le problème n'éclate. Vous êtes le médiateur amical en qui tous ont confiance. Le revers, c'est que, par aversion pour la friction, vous repoussez la confrontation nécessaire, vous résistez aux changements rapides et vous gardez votre propre insatisfaction au lieu de la mettre sur la table, laissant le malaise s'accumuler en silence.\n\nVous donnez le meilleur avec des changements annoncés à l'avance, votre rôle de pont reconnu et un climat qui n'est pas hostile. Le point de vigilance, c'est d'apprendre que médier n'est pas avaler : mettre votre propre insatisfaction dans la conversation, et affronter la friction quand c'est nécessaire, renforce la cohésion que vous valorisez tant, au lieu de l'affaiblir.`,
        qualidades: [
          `Tend des ponts entre des personnes qui ne se comprennent pas et réduit la friction`,
          `Lit le climat du groupe avant que le problème n'éclate`,
          `Construit la cohésion et garde l'équipe unie au quotidien`,
          `Médie les conflits avec calme et est le médiateur en qui tous ont confiance`,
          `Est constant et doux, une présence stable pour le groupe`,
        ],
        pontosDeAtencao: [
          `Repousse la confrontation nécessaire pour éviter la friction`,
          `Résiste aux changements rapides et tarde à adhérer`,
          `Garde sa propre insatisfaction au lieu de la mettre sur la table`,
          `Laisse le malaise s'accumuler en silence`,
          `Peut tant médier celui des autres qu'il oublie son propre inconfort`,
        ],
        comoLiderar: [
          `Annoncez les changements tôt, il a besoin de temps pour digérer et s'adapter`,
          `Demandez sa lecture du groupe, il voit le climat avant les autres`,
          `Reconnaissez le rôle de pont, qui passe souvent inaperçu`,
          `Encouragez-le à mettre sa propre insatisfaction dans la conversation`,
          `Évitez le climat hostile et le reproche en public, qui le font se recroqueviller`,
        ],
        oQueEvitar: ['Changement rapide', 'Ambiance hostile', 'Reproche en public'],
        comunicacaoIdeal:
          `Proche et calme, montrant l'impact positif sur le groupe. Laissez du temps, annoncez les changements tôt et reconnaissez le rôle de pont qu'il tient.`,
        ondeBrilha: [
          `Cohésion d'équipe et maintien du climat`,
          `Médiation de conflits entre personnes ou services`,
          `Intégration et accompagnement de nouveaux membres`,
          `Pont entre des équipes qui ne communiquent pas bien`,
          `Environnements de long terme qui dépendent de relations stables`,
        ],
        sobEstresse:
          `Se recroqueville et évite la friction, même quand elle est nécessaire. Garde l'insatisfaction, repousse la conversation difficile et laisse le malaise grandir en silence.`,
      },
      SC: {
        nome: 'Le Méthodique',
        biografia:
          `Vous êtes du genre en qui la direction a confiance pour que les choses n'échouent pas. Vous suivez le processus, vous respectez la procédure et vous livrez avec une constance qui ne varie presque pas d'un jour à l'autre. Là où d'autres improvisent, vous avez une méthode ; là où d'autres s'emmêlent dans la précipitation, vous tenez le standard. C'est un profil fait pour les routines de précision qui ne tolèrent pas la surprise.\n\nVotre force, c'est la fiabilité : faible taux d'erreur, soin du détail et respect des règles qui soutiennent l'opération. Qui travaille avec vous sait que ce qui est convenu sera fait de la bonne manière. Le revers, c'est que cette même solidité devient rigidité. Vous résistez au changement, même nécessaire, vous êtes lent à vous adapter et vous pouvez vous accrocher à la procédure au point de vous figer face à l'imprévu.\n\nVous donnez le meilleur avec un processus clair, un environnement stable et des changements annoncés à l'avance et expliqués dans leur pourquoi. Le point de vigilance, c'est d'apprendre que tout changement n'est pas une menace, et que parfois la procédure doit céder à la réalité. Comprendre la raison derrière la nouveauté, et vous donner la permission de vous adapter, fait que votre fiabilité suit le rythme du business au lieu de le bloquer.`,
        qualidades: [
          `Suit le processus et tient le standard même dans la précipitation`,
          `Livre avec une constance qui ne varie presque pas d'un jour à l'autre`,
          `A un taux d'erreur très bas et soigne le détail qui soutient l'opération`,
          `Respecte les règles et les procédures, donnant de la prévisibilité à l'équipe`,
          `Est fiable pour les routines de précision qui ne tolèrent pas la surprise`,
        ],
        pontosDeAtencao: [
          `Résiste au changement, même nécessaire`,
          `Est lent à s'adapter quand le contexte change`,
          `Peut s'accrocher à la procédure au point de se figer face à l'imprévu`,
          `Rigide et averse au risque, évite ce qui sort de la routine connue`,
          `S'installe dans une routine qui ne sert plus, par confort`,
        ],
        comoLiderar: [
          `Donnez un processus clair et stable, c'est là que cette personne rend le plus`,
          `Expliquez le pourquoi du changement, pas seulement ce qui change`,
          `Respectez le rythme soigneux, sans hâte de dernière minute`,
          `Annoncez les changements à l'avance et laissez du temps d'adaptation`,
          `Montrez par la donnée que le changement apporte un vrai gain, pour vaincre la résistance`,
        ],
        oQueEvitar: ['Changement brusque', 'Ambiguïté', 'Précipitation sans préavis'],
        comunicacaoIdeal:
          `Claire et structurée, avec un pas à pas et de l'anticipation. Expliquez le pourquoi du changement et laissez le temps de l'absorber avant d'exiger la nouveauté.`,
        ondeBrilha: [
          `Routines de précision bien faites qui ne peuvent pas osciller`,
          `Processus et opérations qui dépendent d'un standard constant`,
          `Contrôle qualité et vérification`,
          `Fonctions qui exigent de suivre la procédure à la lettre`,
          `Environnements stables où la fiabilité vaut plus que la vitesse`,
        ],
        sobEstresse:
          `S'accroche à la procédure et se fige face à l'imprévu. Résiste encore plus au changement et se réfugie dans la routine connue pour se sentir en sécurité.`,
      },
      CS: {
        nome: 'Le Perfectionniste',
        biografia:
          `Vous êtes du genre à livrer de la qualité avec soin, sans esbroufe. Minutieux et coopératif, vous tenez un standard élevé de façon discrète, sans avoir besoin de paraître, et vous êtes fiable au sein d'une équipe où le détail compte. Là où d'autres passent au-dessus, vous vérifiez ; là où d'autres se contentent du raisonnable, vous soignez la finition. Vous êtes la garantie silencieuse que le travail sortira bien fait.\n\nVotre force, c'est la précision alliée au soin des personnes : vous livrez au standard sans créer de friction, en relisant et en vérifiant avec un dévouement en qui l'équipe a confiance. Le revers, c'est que l'excès de zèle peut vous bloquer, déléguer est difficile parce qu'il vous semble que personne ne le fera à votre niveau, et un revirement soudain vous déstabilise plus que la plupart ne l'imaginent.\n\nVous donnez le meilleur avec des critères clairs, du temps pour bien faire et des attentes réalistes, loin des délais impossibles. Le point de vigilance, c'est de convenir à l'avance de ce qui est "assez bon" et d'accepter que refaire sans fin en quête du parfait ne fait que retarder ce qui était déjà prêt. Faire confiance au jugement des collègues pour déléguer, et vous donner la permission de livrer au bon point, libère votre soin pour rendre sans bloquer.`,
        qualidades: [
          `Tient un standard élevé de façon discrète, sans avoir besoin de paraître`,
          `Livre de la qualité sans créer de friction avec l'équipe autour`,
          `Relit et vérifie avec un dévouement en qui les collègues ont confiance`,
          `Est minutieux et coopératif à la fois, chose rare à trouver`,
          `Repère des failles de détail qui échapperaient à d'autres`,
        ],
        pontosDeAtencao: [
          `Se bloque par excès de zèle en quête de la finition parfaite`,
          `Peine à déléguer parce qu'il lui semble que personne ne le fera à son niveau`,
          `Souffre du revirement soudain et du délai irréaliste`,
          `Refait sans fin et retarde ce qui était déjà prêt`,
          `Peut trop prendre sur lui faute de confiance dans le travail des autres`,
        ],
        comoLiderar: [
          `Définissez des critères de "assez bon" pour éviter la paralysie`,
          `Donnez du temps et du contexte, le choc de dernière minute le déstabilise`,
          `Reconnaissez le soin, qui est souvent silencieux`,
          `Encouragez-le à déléguer, en montrant qu'il peut faire confiance au jugement du collègue`,
          `Apportez des délais réalistes, pas des attentes vagues ni impossibles`,
        ],
        oQueEvitar: ['Revirement soudain', 'Attente vague', 'Délai irréaliste'],
        comunicacaoIdeal:
          `Détaillée et respectueuse, avec des critères et des délais réalistes. Convenez de ce qui est "assez bon" et évitez le revirement de dernière minute qui le bloque.`,
        ondeBrilha: [
          `Précision au sein d'une équipe, sans friction`,
          `Revue et vérification du travail avant de le lâcher`,
          `Documentation et contrôle qui exigent du soin`,
          `Tâches qui demandent un standard élevé et de la discrétion`,
          `Processus critiques où la double vérification évite les pertes`,
        ],
        sobEstresse:
          `Refait sans fin en quête du parfait et retarde la livraison. Se bloque par zèle, peine encore plus à déléguer et se surcharge en essayant de tout garantir seul.`,
      },
      DS: {
        nome: 'Le Planificateur',
        biografia:
          `Vous êtes du genre à décider avec fermeté puis à tenir la décision jusqu'au bout. Vous combinez l'élan de celui qui aime commander avec la méthode de celui qui exécute le plan avec constance. Là où certains commencent et abandonnent, vous commencez et vous terminez ; là où certains changent de route à chaque vent, vous restez ferme sur le cap tracé. C'est un profil fait pour l'exécution planifiée et les objectifs à moyen terme.\n\nVotre force, c'est cette union de la décision et de la constance : vous définissez le plan, vous assumez le choix et vous livrez sans lâcher à mi-chemin. La direction vous fait confiance pour mener quelque chose du début à la fin. Le revers, c'est qu'une fois décidé, vous pouvez devenir têtu, vous peinez à changer de route même quand le contexte a déjà changé, et vous vous exigez avec une dureté qui pèse parfois.\n\nVous donnez le meilleur avec le plan aligné au départ, de l'autonomie pour exécuter et des raisons claires quand un ajustement s'impose. Le point de vigilance, c'est de vous rappeler qu'insister sur le plan initial quand la réalité a tourné, c'est de la rigidité, pas de la constance. Ouvrir un espace pour revoir la route face à des faits nouveaux, et alléger votre propre exigence, fait que votre fermeté rend sans devenir de l'entêtement.`,
        qualidades: [
          `Décide avec fermeté et tient le choix jusqu'au bout, sans lâcher à mi-chemin`,
          `Combine l'élan de commander avec la méthode d'exécuter le plan`,
          `Reste ferme sur le cap tracé, sans changer de route à chaque vent`,
          `Mène quelque chose du début à la fin, réduisant les projets abandonnés`,
          `Donne l'impulsion initiale et soutient la constance dans les routines longues`,
        ],
        pontosDeAtencao: [
          `Devient têtu une fois décidé et peine à changer de route`,
          `Insiste sur le plan initial même quand le contexte a déjà changé`,
          `S'exige avec une dureté qui pèse`,
          `Résiste aux ajustements qui n'arrivent pas avec une raison claire`,
          `Confond constance et rigidité dans les contextes qui exigent de la souplesse`,
        ],
        comoLiderar: [
          `Alignez le plan au départ, il exécute mieux avec le cap clair`,
          `Apportez des faits concrets pour justifier les ajustements de route`,
          `Respectez la constance et la livraison jusqu'au bout`,
          `Aidez-le à revoir la route face à des faits nouveaux, sans que cela sonne comme un caprice`,
          `Reconnaissez la fermeté, mais pointez quand elle devient de l'entêtement`,
        ],
        oQueEvitar: ['Rigidité envers soi-même', 'Changement sans raison claire', 'Improvisation'],
        comunicacaoIdeal:
          `Objective et planifiée, avec des objectifs fermes et des raisons pour tout ajustement. Apportez le fait qui justifie le changement de route, sinon il le lira comme un caprice.`,
        ondeBrilha: [
          `Exécution planifiée du début à la fin`,
          `Objectifs à moyen terme qui exigent de la constance`,
          `Opération stable qui ne peut pas être abandonnée à mi-chemin`,
          `Projets qui ont besoin d'une décision ferme et d'un suivi`,
          `Routines longues qui dépendent d'une impulsion initiale et de constance`,
        ],
        sobEstresse:
          `Insiste sur le plan initial même quand le contexte a déjà changé. Devient plus têtu, résiste à l'ajustement et s'exige encore plus dur pour l'écart.`,
      },
      IC: {
        nome: 'Le Consultant',
        biografia:
          `Vous êtes du genre à réunir le charme de celui qui connecte et la rigueur de celui qui livre du bien fait. Sociable et précis, vous expliquez le complexe d'une manière que les personnes comprennent et vous appuyez ce que vous dites sur des données qui se vérifient. Là où un profil ne fait que séduire et un autre ne fait qu'approfondir, vous faites les deux : vous gagnez le public et vous démontrez le point. C'est un profil fait pour le conseil, la formation et pour vendre ou expliquer quelque chose de technique.\n\nVotre force, c'est cette union rare entre relation et technique : vous ouvrez la porte avec de la sympathie et vous tenez la crédibilité avec le bon contenu. La créativité ajoutée au sens critique génère des solutions qui passent aussi le test de la qualité. Le revers, c'est que vous souffrez dans le travail technique solitaire, vous oscillez entre parler et vérifier sans clore ni l'un ni l'autre, et vous pouvez vous disperser dans le détail quand vous devriez conclure.\n\nVous donnez le meilleur avec de l'interaction, un bon problème technique à résoudre et de la reconnaissance pour la clarté de votre explication, loin de l'isolement long et de la tâche monotone. Le point de vigilance, c'est de ne pas laisser la conversation avaler la rigueur, ni la rigueur tuer la fluidité : doser les deux est votre point d'équilibre. Trouver le juste milieu entre séduire et démontrer transforme votre double talent en conseil qui convainc et qui tient.`,
        qualidades: [
          `Explique le complexe d'une manière que les personnes comprennent`,
          `Unit le charme de celui qui connecte à la rigueur de celui qui livre du bien fait`,
          `Tient la crédibilité avec des données, pas seulement avec de la sympathie`,
          `Génère des solutions créatives qui passent aussi le test de la qualité`,
          `Est fort pour vendre ou expliquer quelque chose de technique à un public`,
        ],
        pontosDeAtencao: [
          `Souffre dans le travail technique solitaire et sans interaction`,
          `Oscille entre parler et vérifier sans clore ni l'un ni l'autre`,
          `Peut se disperser dans le détail quand il devrait conclure`,
          `Reçoit la critique technique comme si elle était personnelle et se décourage`,
          `La spontanéité bouscule parfois la précision qu'il valorise lui-même`,
        ],
        comoLiderar: [
          `Donnez de l'interaction et un bon problème technique à résoudre`,
          `Reconnaissez la clarté de l'explication, c'est ce qu'il valorise`,
          `Évitez l'isolement long et la tâche monotone, qui l'éteignent`,
          `Apportez la critique technique avec reconnaissance, pas seulement la correction`,
          `Aidez-le à clore entre parler et vérifier, sans osciller sans fin`,
        ],
        oQueEvitar: ['Isolement sans interaction', 'Tâche monotone', 'Manque de contexte'],
        comunicacaoIdeal:
          `Amicale et précise, avec de l'espace pour dialoguer et des données pour appuyer. Apportez le problème technique et reconnaissez la clarté de l'explication qu'il offre.`,
        ondeBrilha: [
          `Expliquer ou vendre quelque chose de technique à un public`,
          `Conseil qui unit la relation au bon contenu`,
          `Formation et transmission qui exigent de la clarté`,
          `Présentation technique où il faut séduire et démontrer`,
          `Pont entre le pôle technique et le client ou la direction`,
        ],
        sobEstresse:
          `Parle beaucoup pour apaiser la tension et perd la rigueur du détail. Oscille entre discuter et vérifier sans clore, et reçoit la critique technique comme si elle était personnelle.`,
      },
    },

    // ── Relations entre paires de profils primaires ──────────────────────────
    relationships: {
      DD: {
        friction: [
          `En réunion, les deux rivalisent pour avoir le dernier mot, et une décision simple devient un bras de fer qui bloque l'équipe.`,
          `Aucun des deux ne recule dans une discussion, alors les petits désaccords dégénèrent en confrontation directe devant l'équipe.`,
          `Chacun prend le même front sans s'être concerté avant, et le résultat, c'est du retravail et des ordres contradictoires pour les subordonnés.`,
          `L'ego élevé fait que reconnaître une erreur ressemble à une défaite, alors les failles restent sans correction parce que personne ne cède.`,
          `La hâte des deux pour le résultat bouscule l'alignement, et l'équipe reçoit des objectifs qui changent en cours de route.`,
        ],
        synergy: [
          `Quand le périmètre est réparti, les deux décident vite et débloquent des projets qui se bloqueraient avec des profils plus prudents.`,
          `L'ambition partagée tire les objectifs audacieux vers le haut, et chacun sert de référence d'énergie et de rythme pour l'autre.`,
          `Sous pression ou en crise, aucun des deux ne se fige, et ensemble ils tiennent l'opération quand tout est en feu.`,
          `Ils s'exigent mutuellement le même niveau de livraison, alors le standard de résultat du duo reste élevé sans supervision externe.`,
          `Dans les négociations difficiles, ils forment un front ferme que l'autre partie parvient difficilement à faire plier.`,
        ],
        communication:
          `Convenez à l'avance de qui dirige chaque front et mettez-le par écrit, pour que la réunion ne devienne pas une lutte pour le dernier mot. Chacun doit entrer dans la conversation prêt à céder sur au moins un point, en traitant le désaccord comme une donnée et non comme une attaque personnelle. Le feedback entre les deux fonctionne mieux en tête-à-tête et direct, sans public qui le transforme en bras de fer. Fixez un critère de décision objectif (un chiffre, un délai, un objectif) pour départager sans que ce soit une question d'ego.`,
      },
      DI: {
        friction: [
          `D exige des délais et un travail abouti, tandis que I arrive plein d'idées éparses, et D commence à le voir comme dispersé et peu fiable.`,
          `I trouve D froid et cassant, et après quelques coupures sèches il se met à éviter d'aborder des sujets et à cacher les problèmes.`,
          `Le rythme rapide du D bouscule le besoin du I de parler et d'être reconnu, vidant l'énergie qu'il apporterait à l'équipe.`,
          `I promet plus qu'il ne peut tenir pour plaire, et D s'agace quand la livraison ne correspond pas au discours enthousiaste.`,
          `En réunion, I s'étale en anecdotes et D le coupe à mi-chemin, et aucun des deux ne repart en se sentant écouté.`,
        ],
        synergy: [
          `D tire le résultat et fixe l'objectif, I engage les personnes et vend l'idée, un duo fort pour les lancements et les virages d'opération.`,
          `I adoucit l'impact du D sur les personnes, en traduisant les exigences dures dans un langage que l'équipe accepte sans se démotiver.`,
          `Ensemble, ils couvrent les deux facettes que presque aucun profil seul ne livre : le focus sur le résultat et la capacité d'influencer et de mobiliser.`,
          `D donne du focus et un délai à l'enthousiasme du I, transformant beaucoup d'idées éparses en quelques paris réellement exécutés.`,
          `Dans les moments de moral bas, D fixe le cap et I ravive l'énergie, et l'équipe se remet à avancer vite.`,
        ],
        communication:
          `D devrait commencer par une phrase de reconnaissance avant de pousser, parce que I se ferme quand il perçoit de la froideur d'entrée. I doit arriver aux conversations avec du focus et un délai concret, en coupant la longue introduction qui fait décrocher D. Convenez que les idées nouvelles du I vont dans une liste pour plus tard, et non au milieu d'une décision déjà arrêtée. En réunion, D mène l'objectif et I mène l'engagement, chacun respectant l'espace de l'autre au lieu de se disputer le commandement.`,
      },
      DS: {
        friction: [
          `D veut tout changer maintenant et S a besoin de temps et de préavis, alors les changements tombent par surprise et S se sent bousculé.`,
          `S protège la stabilité et le rythme de l'équipe, et D lit cela comme de la lenteur ou une résistance délibérée.`,
          `Sous pression, D devient plus cassant et S se referme, gardant des insatisfactions qui ne surgissent que devenues usure.`,
          `D décide seul et communique la décision toute faite, alors que S s'attendait à être consulté, et la confiance entre eux s'érode.`,
          `D mesure la valeur par le résultat rapide et S par la constance et la relation, alors chacun pense que l'autre prend soin de la mauvaise chose.`,
        ],
        synergy: [
          `D dirige et décide, S stabilise et exécute avec constance, un duo qui allie la rapidité de décision à une livraison ferme jusqu'au bout.`,
          `S prend soin des relations et du climat que D tend à négliger, protégeant l'équipe que la pression du D pourrait user.`,
          `Une fois que D fixe le cap, S veille à ce que le plan soit suivi sans abandon en cours de route, réduisant les projets commencés et non terminés.`,
          `S donne à D une lecture réaliste de l'effet du changement sur les personnes, évitant les décisions rapides qui cassent l'opération.`,
          `Dans les routines longues, D donne l'impulsion initiale et S soutient la constance, maintenant le résultat sans dépendre de nouveaux coups de pouce.`,
        ],
        communication:
          `D devrait donner du contexte et signaler les changements à l'avance, parce que S livre bien plus quand il n'est pas pris par surprise. S doit se positionner à voix haute sur le moment, au lieu d'accepter en façade et de garder son désaccord. Dans les conversations, D gagne à ralentir le ton et à demander l'avis de S avant de clore la décision. Répartissez les rôles clairement : D assume les décisions et le rythme, S assume l'exécution constante et le soin de l'équipe, sans que l'un empiète sur le terrain de l'autre.`,
      },
      DC: {
        friction: [
          `D veut décider vite et C a besoin de données et de temps pour analyser, alors D voit C comme un frein et C voit D comme imprudent.`,
          `C signale des risques et des détails manquants, et D l'interprète comme de la résistance ou un excès de bureaucratie en pleine livraison.`,
          `Les deux sont exigeants mais en sens opposés, D exige un résultat dans les temps et C exige une qualité sans faille, et l'équipe se retrouve entre deux feux.`,
          `Quand le délai se resserre, D veut livrer tel quel et C refuse de lâcher quelque chose en dessous du standard, et la tension monte.`,
          `D décide à l'instinct et C par la donnée, alors chacun se méfie de la méthode de l'autre et la décision s'enlise dans la méfiance mutuelle.`,
        ],
        synergy: [
          `D tire le résultat et C assure la qualité, un duo fort pour les projets qui doivent livrer vite et à un haut standard en même temps.`,
          `C freine D sur les erreurs évitables avant qu'elles ne deviennent une perte, faisant office de contrôle qualité sans bloquer la livraison.`,
          `D donne à C un sens de l'urgence et un délai, évitant que l'analyse ne s'étire sans fin à la recherche de la certitude parfaite.`,
          `Dans les décisions à risque, D apporte le courage d'agir et C apporte le critère pour agir juste, réduisant à la fois la paralysie et l'erreur impulsive.`,
          `Ensemble, ils élèvent le niveau de ce que l'équipe livre : la vitesse du D avec la rigueur technique du C, chose rare dans un seul profil.`,
        ],
        communication:
          `D devrait apporter les données dont il dispose et laisser à C un minimum de temps pour traiter avant d'exiger la décision, sinon C se fige par insécurité. C doit commencer par l'essentiel et la conclusion, en laissant le détail pour après, pour que D ne perde ni le fil ni sa patience. Convenez à l'avance de ce qui est non négociable en qualité et de ce qui peut céder pour le délai, pour que le choc n'arrive pas à la dernière minute. En réunion, D mène l'objectif et le délai, C mène le critère et le risque, et la décision finale pèse les deux côtés au lieu que l'un l'emporte sur l'autre.`,
      },
      II: {
        friction: [
          `Les deux parlent beaucoup et exécutent peu, la liste d'idées grandit à chaque réunion pendant que la livraison concrète diminue.`,
          `Les deux veulent la scène, alors ils se disputent l'attention du groupe et les réunions deviennent un concours de qui parle le plus au lieu d'une décision.`,
          `Les délais et les détails passent au second plan pour les deux, et des tâches importantes prennent du retard parce qu'aucun n'a pris le travail ingrat.`,
          `Comme les deux esquivent la partie aride, personne ne suit les chiffres ni les checklists, et les problèmes ne surgissent qu'une fois éclatés.`,
          `Dans la chaleur de l'enthousiasme, les deux promettent plus que ce que l'équipe peut livrer, et l'addition arrive ensuite sous forme de frustration.`,
        ],
        synergy: [
          `L'énergie du duo est très élevée, et ensemble ils créent un environnement animé qui motive et déteint sur le reste de l'équipe.`,
          `Le double de créativité et de networking fait circuler les idées et les connexions, idéal pour les campagnes, les événements et les lancements.`,
          `Quand ils doivent vendre une idée en interne, les deux additionnent leur pouvoir d'influence et la proposition rallie le groupe rapidement.`,
          `Dans les moments de moral bas, le duo ravive le moral de l'équipe et rend de la légèreté à un climat pesant.`,
          `L'échange constant d'idées entre eux génère des solutions créatives que des profils plus fermés atteindraient difficilement.`,
        ],
        communication:
          `Définissez dès le départ qui exécute quoi et mettez-le par écrit, parce que la bonne intention des deux s'évapore sans responsable clair. Convenez de vrais délais et d'un moment fixe pour revoir ce qui a réellement été fait, sinon tout devient une conversation animée sans livraison. Il est utile d'ajouter quelqu'un d'organisé à l'équipe, ou d'alterner qui prend la partie ingrate à chaque projet. Profitez de l'énergie pour célébrer les victoires ensemble, mais séparez le moment de célébrer du moment de décider, pour que la réunion ne devienne pas qu'une fête.`,
      },
      IS: {
        friction: [
          `Le rythme rapide et les changements constants du I surchargent le S, qui a besoin de prévisibilité pour bien performer.`,
          `I se frustre du temps que met S à adhérer à une nouveauté, et se met à pousser des changements que S n'a pas encore digérés.`,
          `S garde ses insatisfactions pour éviter les frictions, et I, distrait par sa propre énergie, ne perçoit jamais que quelque chose ne va pas.`,
          `I change de sujet et de priorité tout le temps, et S se sent en insécurité sans savoir quel est le vrai focus de la semaine.`,
          `Quand le climat s'échauffe, I veut régler en parlant fort et vite, et S se retire, alors la conversation n'a jamais lieu.`,
        ],
        synergy: [
          `I énergise et connecte les personnes, S soutient et stabilise, et ensemble ils forment une équipe chaleureuse, collaborative et agréable où travailler.`,
          `S donne de la constance à l'énergie du I, transformant l'enthousiasme passager en relations et routines qui durent.`,
          `S gère en silence les détails et le suivi que I laisse de côté, couvrant le point faible du partenaire.`,
          `Avec les clients et l'équipe, I ouvre la porte et S entretient le lien sur le long terme, une combinaison forte dans les rôles de service.`,
          `Le climat de confiance que les deux créent fait que l'équipe se sent libre de s'exprimer et de demander de l'aide.`,
        ],
        communication:
          `I devrait ralentir et signaler les changements à l'avance, en donnant à S le temps de se préparer au lieu de réagir dans la précipitation. S doit exprimer ses préoccupations ouvertement dès qu'elles surgissent, au lieu de les garder jusqu'à ce qu'elles tournent au ressentiment. Convenez d'une priorité claire par période, pour que S ne se perde pas dans le changement constant de focus du I. Dans les conversations difficiles, I gagne à baisser le ton et à écouter davantage, et S gagne à dire ce qu'il pense, même au risque d'une petite friction.`,
      },
      IC: {
        friction: [
          `La spontanéité du I se heurte de plein fouet à la précision du C, et ce qui est de l'agilité pour l'un est du laisser-aller pour l'autre.`,
          `C trouve I désorganisé et superficiel, I trouve C rigide et ennuyeux, et chacun sous-estime l'apport de l'autre.`,
          `I veut commencer tout de suite et ajuster en chemin, C veut tout planifier avant, et l'écart de rythme crée des frictions au démarrage de toute tâche.`,
          `C pointe les erreurs et les incohérences, et I, qui carbure à la reconnaissance, le reçoit comme une critique personnelle et se décourage.`,
          `En réunion, I apporte la vision et C apporte les réserves, et sans médiation la conversation oscille entre optimisme débridé et scepticisme bloquant.`,
        ],
        synergy: [
          `I apporte l'idée, l'énergie et la relation, C apporte la rigueur, la qualité et la profondeur, un équilibre rare entre séduire et livrer du bien fait.`,
          `C ancre les idées du I dans quelque chose de concret et réalisable, transformant l'enthousiasme en un vrai plan.`,
          `Ensemble, ils excellent à expliquer et à vendre des sujets techniques, I apporte le charme et la clarté, C garantit que le contenu est correct.`,
          `I ouvre les portes et conquiert les personnes, C soutient la crédibilité par les données, un duo à la fois convaincant et fiable.`,
          `La créativité du I alliée à l'oeil critique du C produit des solutions innovantes qui passent aussi le test de la qualité.`,
        ],
        communication:
          `I devrait apporter des faits et des preuves à C, parce que l'enthousiasme seul ne convainc pas quelqu'un qui décide par la donnée. C doit s'ouvrir aux idées nouvelles sans exiger la perfection dès le premier brouillon, et veiller à ce que la critique s'accompagne de reconnaissance, et pas seulement de correction. Convenez d'un moment pour diverger librement et d'un autre pour clore avec rigueur, en séparant le brainstorm de la relecture. Répartissez les rôles en présentation : I mène la relation et le récit, C garantit l'exactitude du contenu, en cherchant toujours le juste milieu entre séduire et démontrer.`,
      },
      SS: {
        friction: [
          `Les deux évitent le conflit et laissent les problèmes s'accumuler sans rien dire, jusqu'à ce que la petite friction devienne une grande usure.`,
          `Les décisions deviennent lentes ou sont reportées indéfiniment, parce qu'aucun ne veut assumer le choix difficile et en prendre le risque.`,
          `Les deux résistent au changement, même nécessaire, et le duo s'installe dans une routine qui ne sert plus l'équipe.`,
          `Les insatisfactions restent enfouies des deux côtés, et le climat en apparence calme cache des rancoeurs que personne ne verbalise.`,
          `Sans personne pour donner le rythme, les délais glissent en silence parce qu'exiger de l'autre semble rompre l'harmonie.`,
        ],
        synergy: [
          `L'harmonie, la loyauté et la coopération entre eux sont sincères, et l'équipe ressent un environnement stable et sans clans.`,
          `Le duo soutient l'opération sur le long terme, donnant à l'équipe une base de stabilité qui tient la routine même dans les phases difficiles.`,
          `Ils créent un environnement sûr où chacun se sent écouté, ce qui pousse les gens autour d'eux à remonter les problèmes plus tôt.`,
          `Ils travaillent avec patience et constance, idéaux pour les rôles de continuité, de support et de soin des personnes.`,
          `Leur loyauté mutuelle rend le duo extrêmement fiable dans les moments qui exigent discrétion et soutien silencieux.`,
        ],
        communication:
          `Convenez qu'être honnête sur un problème n'est pas une agression, pour que les deux puissent exprimer leur gêne même sans apprécier le moment. Définissez qui mène chaque décision et un délai pour trancher, sinon le choix tourne en rond sans fin. Planifiez une conversation régulière juste pour mettre sur la table ce qui dérange, en créant un espace sûr pour ce que personne ne dirait dans le couloir. Face à un changement nécessaire, écrivez ensemble le pourquoi et les gains, pour vaincre la résistance naturelle des deux par l'argument plutôt que par la pression.`,
      },
      SC: {
        friction: [
          `Les deux sont prudents et averses au risque, et ensemble ils peuvent se figer devant toute décision comportant de l'incertitude.`,
          `L'excès d'analyse avant de changer quoi que ce soit fait que le duo repousse des mouvements que l'entreprise doit faire bientôt.`,
          `S cherche l'harmonie et C cherche la précision, et parfois l'attachement du C au processus passe au-dessus du soin du S pour les personnes.`,
          `Aucun des deux n'aime la confrontation, alors les désaccords sur la méthode restent sans solution et s'éternisent.`,
          `Le duo se sent trop à l'aise dans la routine connue et résiste aux innovations même quand elles apporteraient un gain clair.`,
        ],
        synergy: [
          `Le travail du duo est fiable, minutieux et d'une qualité constante, avec très peu de variation d'un jour à l'autre.`,
          `Le faible taux d'erreur et le respect des règles en font l'un des duos les plus stables pour les routines de précision.`,
          `S maintient le climat et C maintient le standard, et ensemble ils livrent de la qualité sans créer de frictions avec l'équipe autour.`,
          `Ils sont le duo idéal pour les processus critiques qui ne peuvent pas échouer, parce que les deux vérifient avant de lâcher.`,
          `L'alliance du soin pour les personnes et du soin pour le détail crée une opération prévisible sur laquelle la direction peut compter.`,
        ],
        communication:
          `Travaillez avec des processus et des critères clairs et définis par écrit, parce que les deux se sentent en sécurité quand le chemin est balisé. Signalez les changements à l'avance et laissez du temps d'adaptation, en évitant le choc qui fige S et l'analyse sans fin qui fige C. Convenez à l'avance d'un délai pour clore l'analyse et agir, pour que la prudence des deux ne devienne pas de la paralysie. Encouragez-vous mutuellement à vous positionner quand quelque chose ne va pas, en traitant le désaccord sur la méthode comme une partie du travail et non comme un conflit personnel.`,
      },
      CC: {
        friction: [
          `Le perfectionnisme des deux mène à la paralysie par l'analyse, et le duo retarde la livraison en quête d'une certitude qui n'arrive jamais.`,
          `Les deux ont tendance à trop critiquer, et la relecture mutuelle devient un va-et-vient de remarques qui crée de la tension et use la relation.`,
          `Aucun n'avance sans le niveau de certitude que l'autre non plus ne juge suffisant, et le projet s'enlise dans des vérifications sans fin.`,
          `Comme les deux valorisent le détail, les discussions techniques s'étirent sur des points minimes pendant que le délai global se resserre.`,
          `Sous pression, les deux se referment encore plus sur la donnée et se durcissent, rejetant tout raccourci et bloquant les décisions urgentes.`,
        ],
        synergy: [
          `La précision, la qualité et la profondeur technique du duo sont exceptionnelles, et le standard de livraison se situe au-dessus de la moyenne du marché.`,
          `Leur standard élevé tire vers le haut le niveau de tout ce qui passe entre leurs mains, relevant la barre de toute l'équipe.`,
          `Ils sont fiables pour les tâches critiques qui ne tolèrent aucune erreur, parce que l'un relit l'autre et rien ne part sans double vérification.`,
          `Ensemble, ils produisent une documentation, des analyses et des contrôles impeccables, une base solide sur laquelle le reste de l'entreprise peut compter.`,
          `L'échange entre deux regards rigoureux repère souvent des failles qu'un profil seul laisserait passer.`,
        ],
        communication:
          `Convenez avant de commencer de ce qui est assez bon et du critère de fini, pour ne pas courir après une perfection qui bloque la livraison. Fixez des délais fermes et un point où l'analyse s'arrête et la décision se prend, même sans certitude totale. En relisant le travail de l'autre, équilibrez la critique avec la reconnaissance de ce qui est réussi, pour éviter l'usure de la remarque constante. Répartissez les responsabilités pour ne pas vérifier deux fois la même chose, en faisant confiance au jugement du partenaire au lieu de tout refaire soi-même.`,
      },
    },
  },
};
