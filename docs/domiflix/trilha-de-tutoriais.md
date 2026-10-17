# 🎬 Domiflix — Trilha de Tutoriais

> Catálogo de **tutoriais** (uma aula longa e completa por área do sistema) para gravação e publicação no Domiflix.
> Validado contra o que **de fato existe hoje na tela do cliente final (tenant)** — inventário feito pelos 5 devs de domínio em 05/09/2026, versão do sistema `1.22.5`.
>
> **Formato**: **1 tutorial por área**, com capítulos marcados por tempo. O aluno assiste a área inteira de uma vez e usa os capítulos pra voltar num ponto específico.
>
> **Ordem da trilha**: em 20 aulas identificadas de T0 a T22 (com T1, T6 e T16 incorporadas a outras aulas), o cliente sai do zero e chega ao sistema rodando de verdade — cada tutorial só usa o que já foi ensinado antes.

---

## Convenções

- **Tutorial padrão**: 20 a 50 minutos, cobrindo **uma área inteira** do sistema (não uma tela, não um botão).
- **Capítulos**: todo tutorial tem blocos numerados com marcação de tempo, escritos na descrição do episódio no Domiflix. É isso que substitui os episódios curtos.
- **Estrutura fixa**: Abertura (30s) → Pré-requisito (15s) → Capítulos → Recap (1min) → Próximo (15s).
- **Modelagem no Domiflix**: cada tutorial é um **título do tipo `series`** com **1 temporada ("Tutorial completo")** e **1 episódio**. Isso deixa a porta aberta pra, no futuro, criar uma 2ª temporada de "Aulas rápidas" recortando o mesmo conteúdo sem refazer capa nem catálogo.
- ⚠️ = ponto sensível: mostre o erro de propósito e como sair dele.
- 🔒 = depende de módulo pago — deixe explícito no vídeo que o cliente pode não ver essa parte.
- 🚫 = **não prometer**: coisa que parece existir e não existe. Se prometer, o cliente abre o sistema e não acha.

---

## Sequência lógica de consumo

```
T0  Bem-vindo, configuração, identidade e assinatura
 → T2  Usuários, cargos e permissões
   → T3  Clientes e Equipamentos
     → T4  Serviços, tarefas e checklists
       → T5  Ordens de Serviço, Agenda, Equipes e Mapa ao Vivo
         → T7  O técnico em campo
           → T18 Área do Técnico — Refrigeração e Climatização
             → T8  Estoque, compras e inventário
             → T9  Orçamentos, Precificação e Proposta
               → T10 CRM: funil, leads e captação
                 → T11 Contratos e PMOC
                   → T12 Portal do Cliente e Portal do Contrato
                     → T13 Financeiro
                       → T19 Integração com Asaas, Assinaturas e Cobranças
                         → T20 Relatório Financeiro e DRE
                           → T14 Notas Fiscais (NFS-e e NF-e)
                             → T15 Funcionários: Financeiro do Funcionário e Ponto Eletrônico
                               → T22 Ferramentas de RH: DISC, Organograma, Fluxograma
                                 → T21 Integração com WhatsApp
                                   → T17 Dashboard, relatórios e exportações
```

**Por que essa ordem**: não dá pra abrir OS sem cliente, equipamento e tipo de serviço. Não dá pra montar orçamento sem catálogo de serviços. Contrato/PMOC depende de cliente + equipamento + checklist. Financeiro só faz sentido depois que existem OS e orçamentos gerando dinheiro. Cobranças, relatórios e fiscal vêm depois da base financeira. A integração com WhatsApp entra quando os principais eventos da operação já foram apresentados. O cliente pode pular o que não usa, mas vendo na ordem nada citado fica em aberto.

**Corte prático pra quem tem pressa**: T0 → T3 → T4 → T5 → T7. Com essas cinco aulas a empresa já está configurada, atendendo cliente e fechando OS.

---

## Divisão das gravações

### Kaik — 5 tutoriais · ~3h25

- **T0** — Introdução/Assinatura e Configurações/Instruções Iniciais
- **T14** — Notas Fiscais (NFS-e e NF-e)
- **T17** — Dashboard, relatórios e exportações
- **T19** — Integração com Asaas, Assinaturas e Cobranças
- **T21** — Integração com WhatsApp

### Maicon — 6 tutoriais · ~2h53

- **T2** — Usuários e Permissões (restrição por funcionário)
- **T15** — Funcionários, RH e Ponto Eletrônico
- **T10** — CRM/Kanban: leads, comercial, funil e acompanhamento de processos/projetos
- **T20** — Relatório Financeiro e DRE
- **T12** — Portal do Cliente, Portal do Contrato e dinâmica de QR Codes
- **T8** — Estoque: consumo na OS, locais, inventário, compras e histórico de materiais

### Matheus — 9 tutoriais · ~6h05

- **T3** — Clientes, Fornecedores e Equipamentos
- **T4** — Cadastros: Tipos de Serviço, Tipos de Tarefa e Checklists
- **T5** — Ordens de Serviço, Agenda, Equipes e Mapa ao Vivo
- **T7** — O técnico em campo: preenchimento de OS, pausa, finalização parcial, link público, PDF e consumo de estoque
- **T18** — Área do Técnico™: Refrigeração e Climatização
- **T9** — Orçamentos, Propostas e Precificação
- **T13** — Financeiro: receitas, despesas, movimentações e contas a pagar e receber
- **T11** — Contratos e PMOC
- **T22** — Ferramentas de RH: Perfil Comportamental (DISC), Organograma e Fluxograma

---

# 🎬 T0 — Bem-vindo, configuração, identidade e assinatura (Inspiração visual: *Interestelar*)

**Duração**: ~65min · **Pré-requisito**: nenhum · 🔒 **White Label** (parcial)
**Responsável**: Kaik

> A primeira aula deixa a empresa pronta para operar: apresenta a Dominex, configura identidade e preferências e explica plano, módulos, uso da conta e pagamento.

**Capítulos**
1. `00:00` O que a Dominex resolve — do chamado do cliente até o dinheiro na conta
2. `03:00` Tour pelo menu e os 3 públicos: gestor, técnico e cliente no link público
3. `08:00` Sidebar × barra superior × menu do celular e o vocabulário essencial
4. `13:00` Módulo contratado, cargo e por que uma tela pode não aparecer
5. `17:00` Aba **Empresa**: logo, dados cadastrais, contato e endereço
6. `22:00` O switch "mostrar em documentos" e o que sai no PDF e no relatório
7. `25:00` 🔒 **White Label**: logo full + ícone, cor, QR Code e cabeçalho do relatório
8. `30:00` Abas **Regional** e **Usabilidade**: idioma, moeda, fuso e preferências de operação
9. `36:00` **Origens**, **Atalhos** e **Aparência**
10. `40:00` **Integrações**, documentos legais e **Zona de Perigo**
11. `45:00` Tela **Assinatura**: status, plano atual, vencimento, valor e uso da conta
12. `49:00` **Gerenciar Meu Plano**: planos prontos, personalizado, módulos e usuários extras
13. `55:00` **Pagar Agora**: Pix, Boleto e Cartão; mensal × anual e histórico de pagamentos
14. `61:00` Onde pedir ajuda e como usar o Domiflix

- **Abertura**: "Nesta primeira aula você vai conhecer a Dominex, deixar a empresa com a sua identidade e entender o plano contratado."
- **Recap**: "Empresa configurada, identidade aplicada, preferências ajustadas e assinatura sob controle."
- **Próximo**: "Na próxima aula: quem entra no sistema e o que cada um pode fazer."

⚠️ Deixe claro logo no começo que **o menu muda conforme o plano e o cargo** — é a dúvida nº1 de quem assiste e não acha a tela.
⚠️ **Salvamento é automático** (com debounce) — mostre o selo "salvando / salvo" no topo. Não existe botão "Salvar" nessa tela.
⚠️ **Segmento é somente-leitura** — só a Dominex muda.
⚠️ **Cartão é sempre recorrente mensal** e não tem o desconto anual. Só Pix e Boleto pegam os 20%.
⚠️ O valor exibido considera preço promocional/personalizado — pode não bater com a tabela pública.
⚠️ Plano "Personalizado" não aparece pra compra direta no checkout.
⚠️ Nesta aula mostre apenas onde ficam as integrações. A conexão e as automações do WhatsApp são ensinadas com segurança no T21.
🚫 Não existe configuração do link de avaliação do Google dentro de Configurações — ele vive na configuração de NPS da OS (T5).

---

# 🎬 T2 — Usuários, cargos e permissões (Inspiração visual: *Missão Impossível*)

**Duração**: ~25min · **Pré-requisito**: T0
**Responsável**: Maicon

> Colocar a equipe dentro do sistema sem dar acesso demais. É aqui que o gestor decide o que o técnico vê, o que o financeiro vê e o que ninguém vê.

**Capítulos**
1. `00:00` Onde fica: Configurações → **Usuários e Permissões**
2. `02:00` Criar usuário: dados, foto, papel, senha e vínculo com o funcionário do RH
3. `06:00` O **editor de permissões** novo: busca, tela por tela, ações dentro de cada tela
4. `11:00` Chip **Acesso Total** e por que ele não quebra quando a gente lança tela nova
5. `13:00` Aba **Cargos**: criar preset, duplicar, aplicar num usuário e o que acontece ao desmarcar uma permissão
6. `17:00` Caso real: técnico que só usa o link de campo — ligar a ação-filha sem ligar a tela-mãe
7. `20:00` Ativar × desativar × excluir usuário, e a vaga do plano
8. `22:00` Limite de usuários do plano e como contratar mais

- **Abertura**: "Neste tutorial você vai colocar sua equipe no sistema dando pra cada um exatamente o acesso certo."
- **Recap**: "Usuários criados, cargos montados e ninguém enxergando o que não deve."
- **Próximo**: "No próximo tutorial: seus clientes e os equipamentos deles."

⚠️ Você **não consegue** desativar, excluir ou trocar o papel do **próprio usuário logado** — as ações somem na sua linha. Mostre isso pra ninguém achar que é bug.
⚠️ **Reativar** usuário fica bloqueado se a empresa já bateu o limite do plano.
⚠️ Permissão de **excluir lançamento financeiro** é separada e não vem ligada por padrão (novidade da 1.22.5).

---

# 🎬 T3 — Clientes e Equipamentos (Inspiração visual: *Sherlock*)

**Duração**: ~35min · **Pré-requisito**: T2
**Responsável**: Matheus

> A base de tudo. Sem cliente e sem equipamento não existe OS, orçamento, contrato nem PMOC.

**Capítulos**
1. `00:00` Tela **Clientes**: grade × lista, busca por nome/documento/razão social
2. `03:00` Cadastro — aba **Contato** (foto, tipo PF/PJ, telefones, e-mail, origem)
3. `07:00` Cadastro — aba **Fiscal**: buscar por CNPJ e o endereço se preencher sozinho
4. `11:00` **Origens de cliente**: montar o catálogo de "de onde veio esse cliente"
5. `13:00` **Formulários de captação**: gerar o link público de cadastro pra colocar na bio
6. `16:00` Detalhe do cliente: Geral, Equipamentos, Histórico, Tarefas, Contratos, Financeiro
7. `21:00` Contatos e "Responsável no Local" — WhatsApp direto de dentro do sistema
8. `23:00` Tela **Equipamentos**: cadastro, categorias e criar o cliente na hora, só com o nome
9. `27:00` **Campos customizados** de equipamento: criar, ordenar, marcar obrigatório e visível
10. `30:00` Detalhe do equipamento: **QR Code**, etiqueta configurável, anexos e histórico de OS

- **Abertura**: "Neste tutorial você vai montar a base de clientes e equipamentos que sustenta o resto do sistema."
- **Recap**: "Clientes cadastrados com dado fiscal certo, equipamentos etiquetados com QR e prontos pra receber OS."
- **Próximo**: "No próximo tutorial: o catálogo de serviços e os checklists."

⚠️ Digitar o **CNPJ sobrescreve** razão social, fantasia, e-mail, telefone e endereço já digitados (só respeita o campo "Nome" se já tiver conteúdo). Mostre isso.
⚠️ O formulário salva **rascunho automático** — se fechar sem querer, ele oferece retomar.
⚠️ Botões de QR ("Baixar PNG", "Abrir link", "Copiar link") ficam **desabilitados** se o cliente não tiver Portal do Cliente ativo. Explique o pré-requisito antes de clicar.
⚠️ **Campo customizado de equipamento é por empresa, não por categoria** — todo equipamento vê o mesmo catálogo de campos extras.
🚫 Cliente **não tem** anexos, campos customizados nem múltiplos endereços. É **um endereço por cliente**. Múltiplos ambientes só existem dentro de contrato PMOC.
🚫 Não existe importação/exportação em massa de clientes nem de equipamentos.

---

# 🎬 T4 — Serviços, tarefas e checklists (Inspiração visual: *Ratatouille*)

**Duração**: ~30min · **Pré-requisito**: T3
**Responsável**: Matheus

> O *mise en place* do sistema. Aqui você monta o cardápio de serviços da empresa e os formulários que o técnico vai preencher em campo.

**Capítulos**
1. `00:00` Onde fica: menu **Serviços** (`/servicos`) e as 3 abas
2. `01:30` Aba **Tipos de Serviço**: nome, cor, categoria, prefixo de numeração da OS
3. `05:00` O switch "exige equipamento" e o efeito dele lá na criação da OS
4. `07:00` Campos fiscais do serviço (código de serviço, NBS, cTribMun, alíquota ISS, item LC116) — por que preencher agora poupa dor no T14
5. `11:00` **Preço padrão** do serviço e como ele auto-preenche o orçamento
6. `13:00` Aba **Tipos de Tarefa** — as categorias da "Nova Tarefa" da Agenda
7. `15:00` Aba **Checklists**: criar template do zero × importar do **catálogo de modelos prontos**
8. `19:00` Editor de checklist: sim/não, conformidade, texto, número, medição PMOC, seleção, foto, assinatura
9. `24:00` Combinar tipos na mesma pergunta (ex.: sim/não **+** foto) e exigir câmera
10. `26:00` 🔒 Pergunta de **vídeo** (módulo pago, com limite de perguntas)
11. `28:00` Vincular checklist a tipos de serviço e desativar sem perder histórico

- **Abertura**: "Neste tutorial você vai montar o catálogo de serviços e os checklists que o técnico preenche em campo."
- **Recap**: "Tipos de serviço com preço e dado fiscal, e checklists prontos pra virar relatório."
- **Próximo**: "No próximo tutorial: a Ordem de Serviço, o coração da operação."

⚠️ Preencher os campos fiscais aqui é o que evita retrabalho na hora de emitir NFS-e.
⚠️ Desativar checklist **não exclui** — preserva as OS antigas que já usavam ele.
🚫 **Custo, mão de obra, materiais e BDI NÃO ficam nesta tela** — vivem dentro de **Orçamentos** (T9). Não junte as duas coisas na mesma explicação, confunde.
🚫 `/checklists` e `/questionarios` são endereços antigos que redirecionam. Grave sempre pelo caminho atual (Serviços → Checklists).

---

# 🎬 T5 — Ordens de Serviço, Agenda, Equipes e Mapa ao Vivo (Inspiração visual: *Mad Max: Estrada da Fúria*)

**Duração**: ~70min · **Pré-requisito**: T4 · 🔒 **módulo RH** (para Equipes)
**Responsável**: Matheus

> O coração da operação. Abrir, distribuir, agendar, acompanhar e fechar OS, com visão de relatório, NPS, equipes e localização em campo.

**Capítulos**
1. `00:00` Tela **Ordens de Serviço**: kanban × lista e os 4 indicadores do topo
2. `04:00` Criar OS — **Etapa 1**: cliente cadastrado × cliente avulso, e o tipo de serviço
3. `09:00` Criar OS — **Etapa 2**: equipamentos e checklists (e quando essa etapa nem aparece)
4. `14:00` Criar OS — **Etapa 3**: técnico e/ou equipe, data, duração, descrição
5. `19:00` **Recorrência** da OS (diária, semanal, quinzenal, mensal, anual, personalizada)
6. `22:00` Endereço de serviço diferente do endereço do cliente
7. `24:00` O toggle "gerar Pesquisa de Satisfação ao finalizar"
8. `26:00` Mover status arrastando, e o "+" no topo da coluna que já nasce com aquele status
9. `29:00` **Configurar Status**: criar status próprio, cor e ordem
10. `32:00` Filtros, busca e por que a busca ignora o filtro de período
11. `35:00` Abrir a OS no app do técnico sendo gestor, e **compartilhar o link** com o cliente
12. `38:00` Aba **Relatório**: leitura do dashboard de OS
13. `41:00` Aba **NPS**: promotores, neutros, detratores, critérios de estrela e comentário aberto
14. `45:00` Nota mínima + **convite pra avaliar no Google** e o tratamento de detratores
15. `48:00` Tela **Agenda**: visão Dia, Semana e Mês (e por que o celular abre em Dia)
16. `51:00` Criar pelo "+": **Nova OS** × **Nova Tarefa**
17. `54:00` Reagendar arrastando, legenda de cores e feriados
18. `57:00` **Ordens Pausadas** e a retomada aparecendo em duas datas
19. `60:00` **Equipes**: criar time com cor, ícone, foto e membros
20. `63:00` Escalar equipe inteira numa OS em vez de técnico individual
21. `65:00` **Mapa e Rastreamento**: cores dos marcadores e posição em tempo real
22. `68:00` Aba **Histórico**: eventos de localização por técnico e por data

- **Abertura**: "Neste tutorial você vai abrir, distribuir, agendar e acompanhar Ordens de Serviço, a equipe e os resultados da operação."
- **Recap**: "OS criada, agenda montada, equipe escalada, operação no mapa e indicadores de relatório e NPS acompanhados."
- **Próximo**: "No próximo tutorial: o lado do técnico, no celular, em campo."

⚠️ O formulário salva **rascunho** enquanto está aberto — mostre recuperando.
⚠️ Mudar a data de uma OS **recorrente ou de contrato** abre confirmação. Explique por quê.
⚠️ OS de contrato PMOC mostra aviso extra na edição — não é erro.
🚫 **Não existe toggle manual "exigir assinatura"** na criação de OS avulsa. Hoje isso só é ligado sozinho quando a OS nasce de contrato PMOC. Não prometa o botão.
⚠️ **Baixa de estoque ao concluir a OS depende do recurso estar ligado** (Configurações → Usabilidade → "Consumo de estoque na OS", desligado por padrão). Com ele ligado, o técnico lança o material usado durante o atendimento e a baixa é confirmada num resumo editável na finalização. Com ele desligado, concluir a OS não mexe em saldo físico. O vínculo material × tipo de serviço continua servindo só pra calcular custo em orçamento. Ver T5, T7 e T8.
⚠️ **Tarefa não é OS**: não aparece na tela de Ordens de Serviço, é compromisso separado.
⚠️ Arrastar na agenda **muda a data na hora, sem confirmação** (exceto OS recorrente/de contrato).
⚠️ O técnico só aparece no mapa se **deu permissão de localização** no celular **e** está com OS "a caminho" ou "em andamento".
⚠️ 🔒 A aba **Equipes** vive dentro de **Funcionários**, que exige o módulo RH — confirme antes de gravar se o cliente sem RH consegue montar equipe.
🚫 Não existe "líder de equipe" — é lista plana de membros.
🚫 Não existe tela separada de rastreamento; o histórico é aba do próprio Mapa.

---

# 🎬 T7 — O técnico em campo: preenchimento de OS, pausar OS, finalizar parcialmente, link público, PDF e consumo de estoque (Inspiração visual: *Perdido em Marte*)

**Duração**: ~35min · **Pré-requisito**: T5
**Responsável**: Matheus

> O tutorial que o técnico assiste: executar a OS pelo celular, registrar o atendimento e entregar o resultado ao cliente.

**Capítulos**
1. `00:00` Abrindo a OS no celular: o link, o endereço amigável e o que o técnico vê primeiro
2. `03:00` **A Caminho** → mapa em tela cheia com botão pra Waze e Google Maps
3. `06:00` **Check-in**: a OS vira "Em Andamento" e a localização é registrada
4. `09:00` Preenchendo checklist por equipamento: conformidade, medição, seleção e observação
5. `14:00` **Fotos e vídeo**: câmera, galeria e evidências do atendimento
6. `17:00` **Consumo de estoque**: lançar o material usado dentro da OS
7. `20:00` **Pausar** e retomar a OS — e como isso aparece na agenda do gestor
8. `23:00` **Assinatura** do técnico e do cliente
9. `25:00` **Finalizar parcialmente** uma visita de contrato e preservar o que ficou pendente
10. `28:00` Revisar o consumo de estoque e concluir a OS
11. `30:00` Copiar o **link público** e conferir a visão do cliente sem login
12. `33:00` Baixar e compartilhar o **PDF** do relatório da OS

- **Abertura**: "Neste tutorial você vai executar uma OS do começo ao fim pelo celular, registrar materiais e entregar o relatório ao cliente."
- **Recap**: "OS preenchida, pausada quando necessário, materiais consumidos, atendimento finalizado e relatório compartilhado."
- **Próximo**: "No próximo tutorial: a Área do Técnico para Refrigeração e Climatização."

⚠️ **Sinal de internet é obrigatório na hora de salvar.** O app guarda rascunho do formulário e avisa quando a conexão cai, mas checklist, mídia e check-in precisam de rede pra gravar.
🚫 **Não prometer "funciona offline / sincroniza depois".** Não existe fila de sincronização; as chamadas são sempre online.
⚠️ A mesma URL serve pro técnico, pro gestor e pro cliente — **sem login, ela vira modo cliente sozinha**. Cuidado ao gravar tela: mostre logado e deslogado.
⚠️ A baixa de estoque depende de **Configurações → Usabilidade → Consumo de estoque na OS**. Com o recurso desligado, concluir a OS não altera o saldo físico.
⚠️ Finalização parcial é própria das visitas vinculadas a contrato; não apresente como opção de toda OS avulsa.

---

# 🎬 T18 — Área do Técnico: Refrigeração e Climatização (Inspiração visual: *Apollo 13*)

**Duração**: ~30min · **Pré-requisito**: T7 · **série especial por segmento**
**Responsável**: Matheus

> Primeira aula da série Área do Técnico. Cada segmento terá uma aula própria; esta cobre exclusivamente Refrigeração e Climatização.

**Capítulos**
1. `00:00` Por que a Área do Técnico muda conforme o segmento da empresa
2. `02:00` Visão geral do hub e acesso às ferramentas dentro e fora da OS
3. `04:00` **Catálogo**: modelos, capacidades e códigos de erro
4. `07:00` **Carga Térmica**: dimensionar os BTUs do ambiente
5. `10:00` **Conversão** de pressão, temperatura, potência e medidas
6. `12:00` **Cálculo de Capacitor** pelo BTU e tensão
7. `14:00` **Cabo Elétrico**: bitola e disjuntor por distância e carga
8. `17:00` **Superaquecimento e sub-resfriamento** pela pressão e temperatura
9. `20:00` **Régua de Gases** e pressão de saturação
10. `22:00` **Retrofit de Gás** e opções de refrigerante substituto
11. `25:00` **Ciclo de Refrigeração** e consulta dos termos técnicos
12. `27:00` **Diluição de Produto** e histórico dos cálculos

- **Abertura**: "Nesta aula especial você vai usar a Área do Técnico de Refrigeração e Climatização como apoio prático no atendimento."
- **Recap**: "As ferramentas do segmento foram apresentadas com o momento certo de usar cada uma."
- **Próximo**: "No próximo tutorial: estoque, compras e inventário."

⚠️ Esta aula é **exclusiva de Refrigeração e Climatização**. Outros segmentos recebem aulas próprias conforme suas ferramentas forem publicadas.
⚠️ A lista disponível vem do segmento contratado pela empresa; ferramentas de outros segmentos podem aparecer apenas como prévia bloqueada.
⚠️ Área do Técnico não substitui o preenchimento da OS. Ela é uma caixa de ferramentas de apoio.

---

# 🎬 T8 — Estoque, compras e inventário (Inspiração visual: *Duna*)

**Duração**: ~43min · **Pré-requisito**: T7
**Responsável**: Maicon

> Controlar o que entra, o que sai e o que sumiu. Vale pra quem tem depósito e pra quem carrega peça na van.

**Capítulos**
1. `00:00` Tela **Estoque**: as 6 abas e pra que serve cada uma
2. `02:00` Cadastrar material: categoria/grupo, unidade, **estoque mínimo** e custo
3. `06:00` **Depósitos/locais**: criar, definir o que existe em cada um e transferir entre eles
4. `11:00` Restrição de acesso por depósito — quem vê o quê
5. `13:00` Aba **Histórico (Kardex)**: lendo a movimentação item a item
6. `16:00` Aba **Compras**: requisição ou compra direta, fornecedor e financeiro
7. `19:00` **Cotação** com vários fornecedores e escolha da vencedora
8. `23:00` **Importar XML da NF-e** e a compra montada sozinha
9. `26:00` Aba **Inventários**: contagem física passo a passo e o ajuste gerado no fechamento
10. `31:00` Aba **Posição**: saldo do estoque numa data passada
11. `35:00` Aba **Relatório**: histórico, média paga, projeção e exportação

- **Abertura**: "Neste tutorial você vai colocar seu estoque sob controle, do cadastro do material até a contagem física."
- **Recap**: "Materiais cadastrados, depósitos organizados, compras ligadas ao estoque e ao financeiro, inventário fechado e custos acompanhados no relatório."
- **Próximo**: "No próximo tutorial: orçamento, precificação e proposta."

⚠️ Alerta de estoque baixo depende do **estoque mínimo** preenchido no material.
⚠️ Um usuário pode não ver todos os depósitos — é permissão, não bug.
⚠️ A média paga do relatório é uma estimativa histórica ponderada por material. Não é custo médio contábil móvel do saldo atual.
⚠️ A compra direta só aparece para quem pode gerenciar estoque e financeiro, porque uma única confirmação atualiza os dois.
🚫 Vendas, lucro realizado e margem histórica só entram no relatório quando houver venda real do PDV. Saída de estoque não é tratada como venda.
⚠️ Por padrão, concluir OS não dá baixa no estoque. Se a empresa ligar **Consumo de estoque na OS** e o técnico anotar materiais, a baixa é confirmada no resumo exibido ao finalizar; mesmo se essa baixa falhar, a OS é finalizada e o consumo fica pendente para nova tentativa.

---

# 🎬 T9 — Orçamentos, Precificação e Proposta (Inspiração visual: *Mad Men*)

**Duração**: ~45min · **Pré-requisito**: T8
**Responsável**: Matheus

> Onde o serviço vira preço e o preço vira documento bonito na mão do cliente.

**Capítulos**
1. `00:00` Tela **Orçamentos**: os indicadores (em aberto, taxa de conversão, ticket médio)
2. `03:00` Wizard — **Etapa 1 Destinatário**: cliente cadastrado × prospect avulso
3. `07:00` **Etapa 2 Serviços**: puxando do catálogo e o preço padrão entrando sozinho
4. `11:00` **Etapa 3 Materiais**: itens de estoque no orçamento
5. `14:00` **Etapa 4 Desconto**: valor fixo × percentual, e o custo de brindes
6. `17:00` **Etapa 5 Revisão**: escolher template, validade, observações e termos
7. `20:00` 🔒 Aba **Custos do Serviço**: mão de obra e materiais por tipo de serviço
8. `24:00` 🔒 Aba **Custos Globais**: veículos, ferramentas, brindes, EPI
9. `27:00` 🔒 Aba **Precificação (BDI)**: impostos, administração, lucro, custo por km, desconto à vista e no cartão
10. `32:00` **Configurar Proposta**: os 4 templates (Clean, Aurora, Prisma, Vanguarda), cores, logo e seções
11. `36:00` Copiar o link público, mandar no WhatsApp e baixar o PDF
12. `39:00` A visão do cliente em `/proposta/:token` — aprovar ou rejeitar
13. `41:00` Contador de visualizações: quantas vezes o cliente abriu e quando
14. `43:00` **Aprovar** e o que isso lança no financeiro de uma vez só; **Converter em OS**

- **Abertura**: "Neste tutorial você vai montar um orçamento com preço certo e mandar uma proposta que fecha."
- **Recap**: "Orçamento montado com BDI, proposta enviada, cliente aprovou e virou OS."
- **Próximo**: "No próximo tutorial: o funil de vendas."

⚠️ **Copiar o link público promove o rascunho pra "enviado" automaticamente** — e é só a partir daí que os botões Aprovar/Rejeitar aparecem pro cliente.
⚠️ Aprovar internamente **já lança receita, custo de material e mão de obra no financeiro** de uma vez. E trava: não dá pra aprovar duas vezes.
⚠️ Converter em OS cria **uma OS avulsa** e **baixa o estoque dos materiais** do orçamento.
⚠️ 🔒 Custos Globais e Precificação exigem o módulo **Precificação Avançada**. A coluna de margem na lista também.
🚫 **Não existe "orçamento vira contrato"**. Contrato é sempre montado do zero (T11). Não prometa o botão.
🚫 Não existe assinatura eletrônica de proposta — a aprovação é um clique, sem assinatura formal.
🚫 Não existe lembrete automático de orçamento vencido.

---

# 🎬 T10 — CRM: funil, leads e captação (Inspiração visual: *Suits*)

**Duração**: ~30min · **Pré-requisito**: T9 · 🔒 **módulo CRM**
**Responsável**: Maicon

> Parar de perder oportunidade em conversa de WhatsApp. Todo lead num funil visível, com dono e próximo passo.

**Capítulos**
1. `00:00` Tela **CRM**: kanban × lista, e o empty-state "criar estágios padrão"
2. `03:00` Montar o **funil**: criar, renomear, reordenar e colorir estágios
3. `07:00` Marcar estágio como "ganho" e como "perdido" — e o que muda
4. `09:00` Criar oportunidade: título, cliente (ou criar na hora), vendedor, origem, valor, probabilidade, previsão
5. `14:00` Arrastar entre estágios e o **motivo da perda** obrigatório
6. `17:00` Detalhe do lead: ligar, WhatsApp, e-mail e registrar **interação** com próxima ação
7. `21:00` Filtros: origem, vendedor, faixa de valor, busca
8. `23:00` **Webhooks de captação**: criar, vincular a uma origem, copiar a URL e testar
9. `27:00` Rotina sugerida: revisão diária do funil em 5 minutos

- **Abertura**: "Neste tutorial você vai montar seu funil de vendas e parar de perder oportunidade."
- **Recap**: "Funil montado, leads entrando, interações registradas e nada mais se perdendo."
- **Próximo**: "No próximo tutorial: contratos e PMOC."

⚠️ 🔒 Sem o módulo CRM a tela nem aparece no menu.
⚠️ O filtro "Origem" usa uma **lista fixa**, que pode não bater com as origens customizadas que você criou no cadastro de cliente. Mostre e explique.
⚠️ Excluir lead usa a confirmação do navegador, diferente do resto do sistema.
⚠️ "Motivo da perda" é texto livre gravado nas observações — não é campo estruturado pra relatório.
🚫 O **formulário público de captação** do cadastro de cliente (T3) **não cria lead no CRM** — ele cria cliente. São dois caminhos diferentes.
🚫 A **avaliação DISC** é de funcionário (RH), não tem nada a ver com CRM.
🚫 Não existe importação de leads em massa nem distribuição automática por vendedor.

---

# 🎬 T11 — Contratos e PMOC (Inspiração visual: *Peaky Blinders*)

**Duração**: ~45min · **Pré-requisito**: T10 · 🔒 **módulo Gestão de Contratos e PMOC**
**Responsável**: Matheus

> Receita recorrente e conformidade legal no mesmo lugar. É o tutorial mais denso da trilha.

**Capítulos**
1. `00:00` Onde fica o PMOC hoje: **não tem menu próprio**, é um tipo de contrato
2. `02:00` Tela **Contratos**: indicadores, filtros de status, saúde e tipo
3. `05:00` Wizard do contrato **comum** (5 etapas) × wizard **PMOC** (6 etapas)
4. `09:00` Etapa **Unidade** (só PMOC): ambientes e equipamentos por ambiente
5. `13:00` Etapa **Frequência**: mensal, bimestral, trimestral, semestral, anual, ou por dias
6. `17:00` Etapa **Equipe** e a revisão final — e as OS geradas de uma vez pro horizonte inteiro
7. `21:00` Detalhe do contrato: as abas de contrato comum × as abas extras de PMOC
8. `24:00` Aba **Cronograma** (PMOC): verde/laranja/vermelho e o PDF anual
9. `27:00` Aba **Documentos**: TRT, Certificado, Dossiê e Planilha — gerar, assinar e baixar
10. `32:00` **Responsáveis Técnicos**: cadastro, CFT/CREA, assinatura e carimbo (Configurações de Contrato)
11. `36:00` Aba **Financeiro** do contrato: cobrança única ou parcelada, marcar paga, aplicar em massa
12. `40:00` **Renovar** (+6 ou +12 meses) e o que a renovação gera; pausar e excluir com segurança

- **Abertura**: "Neste tutorial você vai montar contrato recorrente e deixar o PMOC em conformidade com a lei."
- **Recap**: "Contrato criado, visitas programadas, documentos assinados e cliente com portal próprio."
- **Próximo**: "No próximo tutorial: o Portal do Cliente e o Portal do Contrato."

⚠️ 🚫 **Não fale em "tela de PMOC" nem em item de menu PMOC** — não existe mais. O caminho é Contratos com filtro de tipo.
⚠️ 🚫 **Não prometa "robô que gera OS todo dia".** As visitas são geradas **de uma vez**, no momento de criar ou renovar o contrato, cobrindo todo o horizonte configurado.
⚠️ Os 4 documentos só saem certos se: empresa com nome/CNPJ, RT com nome + modalidade + registro, e cliente com documento e endereço. A tela lista as pendências com link — mostre isso resolvendo uma pendência ao vivo.
⚠️ **Cronograma e Histórico só existem em contrato PMOC.** Não prometa pra contrato comum.
⚠️ **Pausar/retomar só existe na lista**, não no detalhe.
⚠️ Excluir contrato preserva o que já foi pago, mas remove cobrança em aberto — leia o aviso do modal no vídeo.
🚫 Não existe assinatura eletrônica de contrato dentro do produto.

---

# 🎬 T12 — Portal do Cliente e Portal do Contrato (Inspiração visual: *Black Mirror*)

**Duração**: ~18min · **Pré-requisito**: T11 · 🔒 **módulos Portal do Cliente e Contratos/PMOC**
**Responsável**: Maicon

> Os dois acessos públicos do cliente: o portal geral para acompanhar o relacionamento com a empresa e o portal específico do contrato ou PMOC.

**Capítulos**
1. `00:00` O Portal do Cliente **já nasce criado** pra todo cliente — só falta torná-lo público
2. `03:00` Copiar o link, ligar o switch "Portal público" e testar como o cliente vê
3. `06:00` O que o cliente enxerga: OS, equipamentos, contratos e cobranças
4. `10:00` Cliente abrindo **chamado** pelo portal — e onde isso cai pra você (aba Chamados)
5. `13:00` O **QR Code do equipamento** levando direto pro portal filtrado naquele aparelho
6. `15:00` **Portal do Contrato/PMOC**: gerar, copiar e testar o link e o QR Code da unidade
7. `17:00` Diferença entre Portal do Cliente e Portal do Contrato — quando compartilhar cada um

- **Abertura**: "Neste tutorial você vai configurar os dois portais que conectam o cliente à sua operação e aos contratos."
- **Recap**: "Portal do Cliente publicado e Portal do Contrato pronto para compartilhar por link ou QR Code."
- **Próximo**: "No próximo tutorial: o financeiro."

⚠️ Portal com link correto mas **sem estar público** = acesso negado. É a pegadinha nº1 aqui.
⚠️ A aba **Chamados** no cadastro do cliente só existe com o módulo Portal ativo.
⚠️ A aba **Cobranças** faz parte do Financeiro completo desde o Essencial, mas exige a conta de recebimento ativa. O plano Exceção não possui o Financeiro.
⚠️ O link de contrato dentro do portal **abre outra página** (Portal PMOC da unidade), não abre dentro do portal.
🚫 Não existe login com senha pro cliente final nesse fluxo — o acesso é por link/token.
🚫 Não existe chat ou troca de mensagem no portal — o chamado é de mão única.

---

# 🎬 T13 — Financeiro (Inspiração visual: *Ozark*)

**Duração**: ~35min · **Pré-requisito**: T12
**Responsável**: Matheus

> A base do controle financeiro: contas, movimentações, cartões e compromissos a pagar ou receber.

**Capítulos**
1. `00:00` Os endereços do menu Financeiro e o que cada um responde
2. `02:00` **Movimentações**: criar a primeira conta bancária/caixa
3. `06:00` Lançar receita e despesa, marcar como pago, editar e excluir
4. `10:00` Extrato com "saldo após" e o ajuste manual de saldo
5. `13:00` **Transferência entre contas** — e por que ela nunca é receita nem despesa
6. `16:00` Cadastrar **cartão de crédito**: fechamento, vencimento e limite
7. `19:00` Compra **parcelada** no cartão: a prévia parcela a parcela e o mês de cada fatura
8. `23:00` **Pagar a fatura**: integral × parcial, e o limite voltando
9. `27:00` **Visão Geral**: cards de saldo, gráfico de fluxo de caixa e pizza por categoria
10. `31:00` **Categorias**: criar, colorir, ordenar e o grupo de DRE; as do sistema que não se mexe
11. `33:00` **Contas a Pagar/Receber**: recorrência, baixa e recebimento parcial

- **Abertura**: "Neste tutorial você vai colocar o movimento financeiro da empresa dentro do sistema e organizar o que entrou, saiu e ainda vai vencer."
- **Recap**: "Contas cadastradas, cartão sob controle e compromissos financeiros organizados."
- **Próximo**: "No próximo tutorial: integração com Asaas, assinaturas e cobranças."

⚠️ Pagar a fatura **integralmente** quita as compras. Pagamento **parcial não quita nenhuma** — mostre o aviso da tela.
⚠️ Transferência e pagamento de fatura **não entram** no faturamento nem na DRE. Não é erro.
⚠️ Recorrência de contas **já cria todas as parcelas de uma vez** (não é agendamento que dispara depois).
⚠️ Contas a Pagar/Receber fazem parte do Financeiro completo desde o Essencial. O plano Exceção não possui o grupo Financeiro.
⚠️ Excluir lançamento exige permissão específica (T2).
🚫 Não existe subcategoria/hierarquia — a lista de categorias é plana.
🚫 Não existe tela própria de BDI aqui (é dentro de Orçamentos, T9).

---

# 🎬 T19 — Integração com Asaas, Assinaturas e Cobranças (Inspiração visual: *Billions*)

**Duração**: ~40min · **Pré-requisito**: T13 · 🔒 **módulo Cobranças**
**Responsável**: Kaik

> Conectar a conta Asaas da empresa, cobrar uma vez ou de forma recorrente e acompanhar o pagamento até a baixa no Financeiro.

**Capítulos**
1. `00:00` O papel da Dominex e do Asaas no fluxo da cobrança
2. `03:00` Configurações → Integrações → **Asaas**: conectar a conta e validar a chave
3. `07:00` Taxas reais, métodos habilitados e atualização das condições da conta
4. `11:00` Conta de recebimento e lançamento automático no Financeiro
5. `14:00` Simulador: Pix, boleto, cartão, prazo e valor líquido
6. `18:00` Criar **cobrança avulsa**: cliente, vencimento, juros, multa e desconto
7. `23:00` Compartilhar o checkout e acompanhar pendente, pago, vencido ou cancelado
8. `27:00` Repasse de taxa e conciliação do valor líquido
9. `30:00` Criar **assinatura**: frequência, duração e formas de pagamento
10. `35:00` Acompanhar, editar e cancelar assinaturas com segurança
11. `38:00` Cobrança de contrato e orçamento: onde os fluxos se encontram

- **Abertura**: "Neste tutorial você vai conectar sua conta Asaas e transformar cobranças avulsas ou recorrentes em recebimentos acompanhados pela Dominex."
- **Recap**: "Asaas conectado, cobrança enviada, assinatura criada e baixa financeira acompanhada."
- **Próximo**: "No próximo tutorial: Relatório Financeiro e DRE."

⚠️ CPF ou CNPJ válido do cliente é obrigatório para criar a cobrança no Asaas.
⚠️ A confirmação visual do checkout não dá baixa sozinha; o status definitivo vem do webhook do Asaas.
⚠️ Mostre as taxas retornadas pela conta conectada. Nunca trate valor de referência como taxa garantida.
⚠️ Cancelar assinatura e revogar uma autorização de Pix Automático são ações relacionadas, mas não equivalentes.

---

# 🎬 T20 — Relatório Financeiro e DRE (Inspiração visual: *Margin Call*)

**Duração**: ~30min · **Pré-requisito**: T13
**Responsável**: Maicon

> Ler resultado, caixa e compromissos sem misturar faturamento, transferência e data de fatura.

**Capítulos**
1. `00:00` Relatórios → Visão Geral: filtros, indicadores e origem dos números
2. `04:00` **DRE**: receita, custos, despesas e resultado do período
3. `08:00` **Caixa × Competência** e o que muda em cada regime
4. `12:00` Compra no cartão: mês da compra, mês do pagamento e mês da fatura
5. `16:00` Assinaturas previstas e o cuidado com projeções
6. `19:00` **DFC**: entradas, saídas e variação do caixa
7. `22:00` Pacote para a contabilidade e conferência dos lançamentos
8. `25:00` Exportar CSV e gerar o PDF do relatório
9. `28:00` Checklist mensal de fechamento financeiro

- **Abertura**: "Neste tutorial você vai ler o resultado da empresa e entender por que caixa, competência e fatura mostram datas diferentes."
- **Recap**: "DRE interpretada, DFC conferida e relatório exportado com o filtro correto."
- **Próximo**: "No próximo tutorial: Notas Fiscais, NFS-e e NF-e."

⚠️ Caixa = o que já entrou ou saiu. Competência = o mês do fato, pago ou não.
⚠️ Compra no cartão entra na DRE pelo mês da **compra** em Competência ou do **pagamento** em Caixa — nunca pelo mês da fatura.
⚠️ Transferência e pagamento de fatura são movimentos internos e não entram no faturamento nem na DRE.
⚠️ Antes de exportar, confira período, regime e filtros aplicados.

---

# 🎬 T14 — Notas Fiscais (NFS-e e NF-e) (Inspiração visual: *Better Call Saul*)

**Duração**: ~35min · **Pré-requisito**: T13 · 🔒 **módulo Emissão de Notas Fiscais**
**Responsável**: Kaik

> Emitir NFS-e e acompanhar notas de serviço ou produto recebidas contra o CNPJ da empresa.

**Capítulos**
1. `00:00` O que é NFS-e e por que a configuração vem antes de tudo
2. `02:00` Abrindo **Configurações** (é um modal, não outra tela) — passo **Empresa**
3. `05:00` Passo **Certificado**: subindo o A1 (.pfx), senha e o consentimento
4. `09:00` Passo **Impostos**: regime tributário, inscrição municipal, município (IBGE) e alíquota do ISS
5. `13:00` Passo **Serviços**: código de serviço padrão e NBS
6. `15:00` A **cota mensal** de emissão e onde ela aparece
7. `17:00` Emitir nota — stepper de 4 passos: Pessoas → Serviço → Valores → Emitir
8. `22:00` O caso do **Simples Nacional**: o percentual que precisa ser preenchido
9. `24:00` Nota autorizada: número, protocolo, chave de acesso; baixar **PDF (DANFSe)** e **XML**
10. `27:00` **Cancelar** nota com motivo, e reemitir depois (número novo)
11. `30:00` **Notas recebidas**: consultar NF-e e NFS-e emitidas contra o CNPJ
12. `33:00` Manifestar NF-e de produto e lançar a nota recebida como despesa

- **Abertura**: "Neste tutorial você vai configurar a parte fiscal, emitir NFS-e e acompanhar NF-e e NFS-e recebidas pela empresa."
- **Recap**: "Certificado no lugar, NFS-e emitida e notas recebidas conferidas."
- **Próximo**: "No próximo tutorial: sua equipe, o ponto e a folha."

⚠️ Sem certificado carregado, a tela volta pro estado guiado e **não emite**.
⚠️ **Município sem cobertura do padrão nacional bloqueia a emissão** mesmo com tudo certo. Confirme a cobertura do município antes de gravar com um exemplo real.
⚠️ Regime **Simples Nacional** exige o percentual de tributação na emissão, senão a nota é recusada.
⚠️ "Baixar PDF" só aparece pra nota **autorizada, com cancelamento pendente ou cancelada** — não aparece em rascunho nem em nota rejeitada.
⚠️ Reemitir depois de cancelar gera **número novo** — não reaproveita o número cancelado.
🚫 Configuração fiscal **não é página separada** — é modal aberto de dentro de Notas Fiscais.
🚫 A Dominex **não emite NF-e de produto** nesta tela. NF-e entra como nota recebida, com consulta e manifestação; a emissão disponível é NFS-e.

---

# 🎬 T15 — Funcionários: Financeiro do Funcionário e Ponto Eletrônico (Inspiração visual: *The Office*)

**Duração**: ~35min · **Pré-requisito**: T14 · 🔒 **módulo Funcionários / RH**
**Responsável**: Maicon

> Cadastro funcional, movimentações financeiras do funcionário, pagamento e controle de ponto eletrônico no mesmo fluxo.

**Capítulos**
1. `00:00` Tela **Funcionários**: cadastro, financeiro individual e ponto eletrônico
2. `02:00` Cadastro: dados, foto, chave PIX, admissão
3. `06:00` Remuneração: salário, custo mensal e os campos CLT (CBO, matrícula, dependentes, VT)
4. `10:00` Configuração de pagamento: frequência e dia do mês
5. `13:00` **Vincular acesso ao sistema**: criando o login do funcionário
6. `16:00` **Vale, falta e bônus** — o que vira despesa na hora e o que só entra na folha
7. `20:00` **Pagar funcionário**: modo informal × CLT (com holerite) e o desconto do vale
8. `24:00` **Ponto**: gerar o link público do funcionário e bater ponto pelo celular
9. `28:00` Aba **Ponto** do gestor: Hoje, Histórico, Relatório, Configurações (exigir selfie e localização)
10. `31:00` A **folha** aparecendo sozinha em Contas a Pagar e sendo quitada de lá

- **Abertura**: "Neste tutorial você vai cadastrar sua equipe, controlar o financeiro de cada funcionário e colocar o ponto eletrônico para funcionar."
- **Recap**: "Funcionários cadastrados, movimentações e pagamentos registrados, ponto eletrônico configurado e folha no financeiro."
- **Próximo**: "No próximo tutorial: Perfil Comportamental, Organograma e Fluxograma."

⚠️ **Vale gera despesa na hora. Bônus e falta não** — só entram no financeiro quando a folha é paga. Essa é a confusão nº1 aqui.
⚠️ Criar acesso exige e-mail preenchido e senha de no mínimo 6 caracteres.
⚠️ O holerite CLT abre em popup — pode ser bloqueado pelo navegador. Mostre desbloqueando.
⚠️ Selfie e localização no ponto só aparecem **se a empresa exigir** nas Configurações da aba Ponto.
🚫 **Não existe botão "Gerar Folha"** — a folha é gerada automaticamente e aparece em Contas a Pagar. Não procure o botão no vídeo.
🚫 Não existe tela separada de ponto pro gestor — é aba dentro de Funcionários.

---

# 🎬 T22 — Ferramentas de RH: Perfil Comportamental (DISC), Organograma, Fluxograma (Inspiração visual: *Severance*)

**Duração**: ~40min · **Pré-requisito**: T15 · 🔒 **módulo Funcionários / RH**
**Responsável**: Matheus

> Ferramentas para entender pessoas, desenhar a estrutura da empresa e documentar como o trabalho deve acontecer.

**Capítulos**
1. `00:00` Onde ficam as três ferramentas dentro de **Funcionários**
2. `02:00` **Perfil Comportamental (DISC)**: gerar o link individual e definir se o funcionário verá o resultado
3. `06:00` A experiência do funcionário respondendo a avaliação sem login
4. `10:00` Ler o perfil: fatores DISC, competências, perfil emocional, qualidades e pontos de atenção
5. `15:00` Histórico de avaliações, evolução e comparação entre dois funcionários
6. `19:00` Baixar o dossiê individual e o relatório comparativo em PDF
7. `22:00` **Organograma**: criar o quadro e adicionar funcionário, cargo manual e setor
8. `26:00` Conectar a hierarquia, organizar automaticamente, buscar, destacar setor e trabalhar em tela cheia
9. `30:00` Exportar o Organograma em PNG ou PDF
10. `32:00` **Fluxograma**: criar uma rotina com início, ação, decisão, subprocesso e fim
11. `35:00` Usar raias de responsáveis, conexões e organização automática
12. `37:00` Conferir problemas do fluxo e gerar o POP com o fluxograma incorporado
13. `39:00` Exportar, compartilhar e manter o processo atualizado

- **Abertura**: "Neste tutorial você vai transformar informação de pessoas, estrutura e processos em ferramentas práticas de RH."
- **Recap**: "Perfil comportamental analisado, organograma desenhado e processo documentado em fluxograma."
- **Próximo**: "No próximo tutorial: integração com WhatsApp."

⚠️ O link do DISC é individual e público; use somente dados fictícios ou uma conta-demo durante a gravação.
⚠️ A visibilidade do resultado para o funcionário depende da configuração escolhida ao gerar a avaliação.
⚠️ Organograma e Fluxograma salvam o desenho automaticamente; mostre o estado de salvamento antes de sair.
⚠️ O Fluxograma nasce com uma etapa inicial e a conferência aponta caminhos sem início, sem fim ou isolados.
⚠️ O POP é gerado a partir do Fluxograma cadastrado; desenho desatualizado gera documento desatualizado.

---

# 🎬 T21 — Integração com WhatsApp (Inspiração visual: *Mr. Robot*)

**Duração**: ~30min · **Pré-requisito**: T0 · 🔒 **módulo WhatsApp**
**Responsável**: Kaik

> Conectar o número da empresa, proteger a operação e ativar automações sem transformar o WhatsApp em disparo indiscriminado.

**Capítulos**
1. `00:00` Configurações → Integrações → **WhatsApp** e o que o módulo libera hoje
2. `03:00` Conexão por QR Code: preparar o número, aceitar o risco e iniciar o pareamento
3. `07:00` Ler o QR Code e acompanhar os estados de conexão
4. `10:00` Número ativo, reconexão e troca da conexão principal
5. `13:00` Proteção do número: horário, ritmo e limites de envio
6. `17:00` Ativar automações e escolher os eventos da Ordem de Serviço
7. `21:00` Conteúdo, modelos e autorização de contato por cliente
8. `24:00` Histórico operacional: enviado, falhou, bloqueado e nova tentativa
9. `27:00` Desconectar com segurança e quando refazer o pareamento

- **Abertura**: "Neste tutorial você vai conectar o WhatsApp da empresa e ativar automações com uma régua segura de envio."
- **Recap**: "Número conectado, proteção configurada, automações ativadas e histórico monitorado."
- **Próximo**: "No último tutorial: dashboard, relatórios e exportações."

⚠️ Atendimento e campanhas aparecem como prévias bloqueadas e continuam sendo etapas futuras. Não grave como funcionalidade disponível.
⚠️ Sem conexão ativa, as áreas de automação permanecem bloqueadas.
⚠️ Somente administradores, gestores ou usuários com permissão de configurações podem alterar as regras.
⚠️ Não use número pessoal ou principal sem explicar o risco operacional do pareamento por QR Code.

---

# 🎬 T17 — Dashboard, relatórios e exportações (Inspiração visual: *Moneyball*)

**Duração**: ~35min · **Pré-requisito**: T21
**Responsável**: Kaik

> Fechar a trilha lendo os números e sabendo onde encontrar, filtrar e exportar os principais relatórios da operação.

**Capítulos**
1. `00:00` **Dashboard**: os KPIs (OS abertas, pendentes, técnicos em campo, taxa de conclusão, faturamento, clientes ativos)
2. `05:00` Mapa ao vivo, fluxo de caixa e evolução de OS na tela inicial
3. `09:00` **Top Técnicos**, resumo por status, OS por tipo e **OS críticas**
4. `13:00` Filtros de período e como conferir a origem de cada indicador
5. `16:00` Relatórios operacionais de **OS e NPS**: visão consolidada e filtros
6. `20:00` Onde encontrar cada família de relatório e quando voltar ao T20 para a leitura financeira
7. `24:00` Relatórios de estoque: posição, inventário e contagem
8. `28:00` Relatórios de pessoas e comercial: ponto e atividade
9. `31:00` Exportações em **PDF, Excel e CSV** e **Exportar meus dados** da empresa

- **Abertura**: "Neste último tutorial você vai aprender a ler o dashboard, encontrar cada relatório e levar os dados para PDF, Excel ou CSV."
- **Recap**: "Você sabe de onde vêm os indicadores, onde consultar cada relatório e qual exportação usar."
- **Próximo**: "Fim da trilha. Volte em qualquer tutorial pelo capítulo que precisar."

⚠️ Faturamento e fluxo de caixa **excluem movimento interno** (transferência e pagamento de fatura). Explique pra ninguém achar que sumiu dinheiro.
⚠️ O mapa só plota técnico que já mandou o primeiro ponto de GPS.
⚠️ Antes de exportar, aplique os filtros de período e confira se o arquivo reflete exatamente a visão da tela.

---

# 📊 Resumo da trilha

| # | Tutorial | Responsável | Módulo pago | Duração |
|---|---|---|---|---|
| T0 | Bem-vindo, configuração, identidade e assinatura | Kaik | White Label (parcial) | 65min |
| T2 | Usuários, cargos e permissões | Maicon | — | 25min |
| T3 | Clientes e Equipamentos | Matheus | — | 35min |
| T4 | Serviços, tarefas e checklists | Matheus | Vídeo em checklist (parcial) | 30min |
| T5 | Ordens de Serviço, Agenda, Equipes e Mapa ao Vivo | Matheus | RH (Equipes) | 70min |
| T7 | O técnico em campo: preenchimento de OS, pausar OS, finalizar parcialmente, link público, PDF e consumo de estoque | Matheus | — | 35min |
| T18 | Área do Técnico: Refrigeração e Climatização | Matheus | Segmento específico | 30min |
| T8 | Estoque, compras e inventário | Maicon | — | 35min |
| T9 | Orçamentos, Precificação e Proposta | Matheus | Precificação Avançada (parcial) | 45min |
| T10 | CRM: funil, leads e captação | Maicon | **CRM** | 30min |
| T11 | Contratos e PMOC | Matheus | **Contratos e PMOC** | 45min |
| T12 | Portal do Cliente e Portal do Contrato | Maicon | **Portal do Cliente + Contratos/PMOC** | 18min |
| T13 | Financeiro | Matheus | — (incluso desde o Essencial) | 35min |
| T19 | Integração com Asaas, Assinaturas e Cobranças | Kaik | **Cobranças** | 40min |
| T20 | Relatório Financeiro e DRE | Maicon | — (incluso desde o Essencial) | 30min |
| T14 | Notas Fiscais (NFS-e e NF-e) | Kaik | **Emissão de Notas Fiscais** | 35min |
| T15 | Funcionários: Financeiro do Funcionário e Ponto Eletrônico | Maicon | **Funcionários / RH** | 35min |
| T22 | Ferramentas de RH: Perfil Comportamental (DISC), Organograma, Fluxograma | Matheus | **Funcionários / RH** | 40min |
| T21 | Integração com WhatsApp | Kaik | **WhatsApp** | 30min |
| T17 | Dashboard, relatórios e exportações | Kaik | — | 35min |
| | **TOTAL** | | | **~12h23min** |

**20 tutoriais.** Gravando 1 tutorial por dia (com preparo, gravação e revisão), são **~20 dias úteis** pra cobrir a trilha inteira.

**Ordem sugerida de gravação** (não é a ordem de exibição — é a de menor risco): T3 → T4 → T5 → T7 → T18 → T0 → T2 → T8 → T9 → T12 → T13 → T20 → T10 → T11 → T15 → T22 → T19 → T21 → T14 → T17. Comece pelo miolo operacional, que é o que já está estável, e deixe integrações e fiscal mais perto do fim, porque dependem de contas conectadas e dados reais de teste.

---

# 🎨 Padrão de arte das capas

## Formatos usados no Domiflix

| Peça | Onde aparece | Proporção | Tamanho |
|---|---|---|---|
| **Banner** | hero da home, fundo do card em destaque, busca | 16:9 horizontal | **1280 × 720 px** |
| **Thumbnail** | pôster vertical nos carrosséis, Minha Lista | 2:3 vertical | **400 × 600 px** |
| Miniatura de episódio | lista de episódios dentro do título | 16:9 horizontal | 640 × 360 px |
| Logo do título *(opcional)* | sobrepõe o texto na hero e na tela de pausa | PNG transparente | livre, largura ~800px |

> Gere **sempre as duas primeiras** (banner + thumbnail) pra cada tutorial. A miniatura de episódio pode ser um recorte do banner. A logo é opcional — só faça se quiser o nome estilizado por cima da hero.

## Direção de arte (vale pra todas as 20 capas)

Pra as 20 capas parecerem uma coleção só:

- **Paleta**: preto profundo `#141414` como base, **verde Dominex `#00C597`** como cor de luz/acento principal, e um toque frio de azul-aço nas sombras. Vermelho só como faísca pontual, nunca dominante.
- **Universo visual**: manutenção técnica e campo — ar-condicionado, casa de máquinas, telhado de galpão, van de serviço, prancheta digital, ferramenta, EPI, prédio comercial brasileiro. Nada de escritório genérico americano.
- **Estilo**: pôster cinematográfico realista, luz volumétrica, contraste alto, granulado sutil de filme, profundidade de campo.
- **Sem texto na imagem.** O nome do tutorial é escrito pela plataforma por cima. Pedir texto pro gerador quase sempre volta com letra torta.
- **Sem rosto reconhecível** e sem logo de marca real (evita problema de direito de imagem).
- **Composição**: no banner 16:9, deixe o **terço esquerdo mais limpo** (é onde o título e os botões aparecem na hero). No thumbnail 2:3, o assunto vai **centralizado, com respiro em cima**.

## Prompt base (cole antes de qualquer prompt específico, se preferir)

```
Pôster cinematográfico realista, sem nenhum texto ou letra na imagem, sem rostos
reconhecíveis, sem logotipos de marcas reais. Paleta: preto profundo #141414,
luz de acento verde-esmeralda #00C597, sombras em azul-aço. Iluminação
volumétrica dramática, alto contraste, granulado sutil de filme, profundidade
de campo. Universo: manutenção técnica e serviço de campo no Brasil.
```

---

# 🖼️ Prompts de capa, tutorial por tutorial

> Cada tutorial tem **tema** (a referência estética) + **prompt do banner (1280×720)** + **prompt do thumbnail (400×600)**. Cole direto no ChatGPT/DALL·E. Se o gerador não aceitar o tamanho exato, peça a proporção (16:9 / 2:3) e redimensione depois.

---

### T0 — Bem-vindo, configuração, identidade e assinatura · Tema: *Interestelar*
**Ideia**: a visão de cima e o painel de comando sendo configurado antes da viagem.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Plano amplo visto
de cima de uma cidade brasileira à noite, prédios comerciais com centenas de
condensadores de ar-condicionado nos telhados, linhas de luz verde-esmeralda
#00C597 conectando os prédios como uma constelação e painéis holográficos de
configuração e módulos no céu. Um técnico minúsculo de
costas, silhueta, no telhado do terço direito, olhando para a cidade. Terço
esquerdo limpo e escuro para sobreposição de título. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, alto contraste, granulado sutil de
filme, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Técnico de costas em silhueta no
centro, de pé na borda de um telhado, olhando uma cidade noturna que se abre
abaixo dele, com uma constelação de linhas verde-esmeralda #00C597 ligando os
prédios e blocos modulares de vidro flutuando ao redor. Respiro escuro na parte de cima. Base preto profundo #141414, sombras
azul-aço, luz volumétrica, granulado de filme, alto contraste, sem rostos, sem
logotipos.
```

---

### T2 — Usuários, cargos e permissões · Tema: *Missão Impossível*
**Ideia**: chaves, cofres e acesso concedido a quem deve.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Corredor escuro de
segurança com uma parede de portas de acesso, algumas destrancadas emitindo luz
verde-esmeralda #00C597 e outras fechadas em vermelho tênue. Feixes de laser
finos cruzando o ar. Silhueta de uma pessoa entrando por uma das portas
iluminadas no terço direito. Terço esquerdo limpo e escuro. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, alto contraste, granulado de filme,
sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Uma grade vertical de portas de
segurança empilhadas, poucas abertas com luz verde-esmeralda #00C597 vazando,
o restante fechado no escuro, feixes de laser finos atravessando o quadro,
silhueta pequena no centro-baixo. Respiro escuro no topo. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, granulado de filme, sem rostos,
sem logotipos.
```

---

### T3 — Clientes e Equipamentos · Tema: *Sherlock*
**Ideia**: o dossiê. Cada cliente e cada máquina com sua ficha e sua digital.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Mesa escura de
investigação vista de cima em ângulo, com fichas e fotografias de equipamentos
de ar-condicionado espalhadas, ligadas por fios de luz verde-esmeralda #00C597,
uma lupa e uma etiqueta com padrão de QR code abstrato em destaque. Terço
esquerdo mais vazio e escuro. Base preto profundo #141414, sombras azul-aço,
luz volumétrica lateral, alto contraste, granulado de filme, sem texto legível
nas fichas, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Mural vertical de investigação: fichas
de equipamentos e condensadores de ar-condicionado presos por alfinetes e
ligados por fios de luz verde-esmeralda #00C597, uma etiqueta com padrão de QR
code abstrato em primeiro plano no centro, respiro escuro no topo. Base preto
profundo #141414, sombras azul-aço, granulado de filme, alto contraste, sem
texto legível, sem rostos, sem logotipos.
```

---

### T4 — Serviços, tarefas e checklists · Tema: *Ratatouille*
**Ideia**: o *mise en place* — tudo preparado e alinhado antes do serviço começar.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Bancada escura
vista de cima com ferramentas de refrigeração, luvas e peças perfeitamente
alinhadas em fileiras, como um mise en place de cozinha profissional, cada
item com um leve halo verde-esmeralda #00C597, e uma prancheta digital vazia
ao lado com caixas de marcação luminosas. Terço esquerdo mais limpo. Base preto
profundo #141414, sombras azul-aço, luz volumétrica de cima, alto contraste,
granulado de filme, sem texto legível, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Composição vertical simétrica de
ferramentas técnicas e peças de refrigeração alinhadas em fileiras perfeitas
sobre fundo escuro, halo verde-esmeralda #00C597 em cada item, uma prancheta
digital com caixas de marcação luminosas no centro-baixo, respiro escuro no
topo. Base preto profundo #141414, sombras azul-aço, granulado de filme, sem
texto legível, sem rostos, sem logotipos.
```

---

### T5 — Ordens de Serviço, Agenda, Equipes e Mapa ao Vivo · Tema: *Mad Max: Estrada da Fúria*
**Ideia**: o despacho. A frota saindo pela agenda e sendo acompanhada no mapa, tudo sob controle.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Pátio industrial
ao amanhecer, poeira no ar, uma fileira de vans de serviço técnico saindo em
formação, faróis cortando a névoa, trilhas de luz verde-esmeralda #00C597
marcando as rotas no chão. Câmera baixa e dramática. Terço esquerdo mais vazio
e escuro. Base preto profundo #141414, sombras azul-aço, luz volumétrica, alto
contraste, granulado de filme, sem placas legíveis, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Van de serviço técnico vista de frente
em contra-luz, poeira e névoa ao redor, faróis acesos, trilhas de luz verde-
esmeralda #00C597 subindo pelo chão em direção à câmera, respiro escuro no
topo. Base preto profundo #141414, sombras azul-aço, luz volumétrica, alto
contraste, granulado de filme, sem placas legíveis, sem rostos, sem logotipos.
```

---

### T7 — O técnico em campo · Tema: *Perdido em Marte*
**Ideia**: sozinho no local, resolvendo com o que tem na mão.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Técnico solitário
de uniforme e EPI, visto de costas, agachado sobre uma unidade condensadora no
telhado de um galpão ao entardecer, céu alaranjado desbotado ao fundo,
segurando um celular cuja tela ilumina o rosto em verde-esmeralda #00C597.
Ferramentas espalhadas ao redor. Terço esquerdo limpo e escuro. Base preto
profundo #141414, sombras azul-aço, luz volumétrica, alto contraste, granulado
de filme, sem rosto visível, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Enquadramento vertical de um técnico
de EPI visto de costas, ajoelhado ao lado de uma unidade condensadora num
telhado industrial, segurando um celular que emite luz verde-esmeralda #00C597
sobre ele, céu escuro e vasto ocupando o topo do quadro. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, alto contraste, granulado de filme,
sem rosto visível, sem logotipos.
```

---

### T18 — Área do Técnico: Refrigeração e Climatização · Tema: *Apollo 13*
**Ideia**: instrumentos precisos reunidos num painel técnico para resolver o problema em campo.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Bancada técnica
escura com manifold, termômetros, capacitor, cabos e cilindro de fluido
refrigerante organizados como instrumentos de uma missão, cada ferramenta
ligada por linhas finas de luz verde-esmeralda #00C597 a um painel abstrato.
Vapor frio e condensação no ar. Terço esquerdo limpo. Base preto profundo
#141414, sombras azul-aço, alto contraste, granulado de filme, sem números
legíveis, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Manifold de refrigeração centralizado,
cercado por termômetro, capacitor, cabo e régua de gases, todos conectados por
linhas de luz verde-esmeralda #00C597, vapor frio subindo e respiro escuro no
topo. Base preto profundo #141414, sombras azul-aço, alto contraste, granulado
de filme, sem números legíveis, sem rostos, sem logotipos.
```

---

### T8 — Estoque, compras e inventário · Tema: *Duna*
**Ideia**: o recurso escasso, contado e guardado.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Corredor imenso e
escuro de um almoxarifado, prateleiras altíssimas em perspectiva sumindo ao
fundo, feixes de luz verde-esmeralda #00C597 varrendo as caixas como um
escaneamento, poeira suspensa no ar. Escala monumental, câmera baixa. Terço
esquerdo mais vazio. Base preto profundo #141414, sombras azul-aço, luz
volumétrica, alto contraste, granulado de filme, sem etiquetas legíveis, sem
rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Prateleiras de almoxarifado
altíssimas em perspectiva vertical, subindo até o topo do quadro e sumindo no
escuro, um único feixe de luz verde-esmeralda #00C597 varrendo as caixas,
poeira suspensa. Escala monumental. Base preto profundo #141414, sombras
azul-aço, luz volumétrica, alto contraste, granulado de filme, sem etiquetas
legíveis, sem rostos, sem logotipos.
```

---

### T9 — Orçamentos, Precificação e Proposta · Tema: *Mad Men*
**Ideia**: a apresentação. O documento que convence.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Mesa de reunião
escura e elegante, um documento de proposta impresso no centro sob um facho de
luz quente, e acima dele páginas flutuando em camadas com molduras luminosas
verde-esmeralda #00C597, além de uma curva de preço subindo em luz. Estética
sofisticada, anos 60 modernizada. Terço esquerdo limpo. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, alto contraste, granulado de filme,
sem texto legível no documento, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Pilha vertical de páginas de proposta
flutuando em camadas com bordas luminosas verde-esmeralda #00C597 sobre uma
mesa escura elegante, facho de luz quente vindo de cima, curva de preço em luz
ao fundo, respiro escuro no topo. Base preto profundo #141414, sombras
azul-aço, granulado de filme, alto contraste, sem texto legível, sem rostos,
sem logotipos.
```

---

### T10 — CRM: funil, leads e captação · Tema: *Suits*
**Ideia**: o funil. Muita gente entra em cima, poucos fecham embaixo.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Estrutura de vidro
em forma de funil deitada em perspectiva num ambiente escuro, com partículas de
luz verde-esmeralda #00C597 entrando em grande quantidade por cima e saindo em
poucos pontos brilhantes na base, refletindo no chão polido. Silhueta de uma
pessoa de terno observando no terço direito. Terço esquerdo limpo. Base preto
profundo #141414, sombras azul-aço, luz volumétrica, alto contraste, granulado
de filme, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Funil de vidro visto de frente
ocupando o eixo vertical do quadro, partículas de luz verde-esmeralda #00C597
entrando densas pelo topo e saindo em poucos pontos brilhantes na base,
reflexo no chão polido escuro, respiro no topo. Base preto profundo #141414,
sombras azul-aço, luz volumétrica, granulado de filme, alto contraste, sem
rostos, sem logotipos.
```

---

### T11 — Contratos e PMOC · Tema: *Peaky Blinders*
**Ideia**: o acordo de longo prazo, selado e cumprido mês a mês.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Mesa de madeira
escura com um documento formal lacrado por um selo de cera brilhando em verde-
esmeralda #00C597, ao fundo uma grade de calendário anual em luz com doze
marcas acesas em sequência, fumaça baixa e névoa no ar, luz lateral dura.
Atmosfera austera e industrial britânica. Terço esquerdo limpo. Base preto
profundo #141414, sombras azul-aço, alto contraste, granulado de filme, sem
texto legível, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Documento formal vertical com selo de
cera brilhando em verde-esmeralda #00C597 no centro, atrás dele uma coluna de
doze marcas de calendário acesas em sequência subindo pelo quadro, névoa baixa,
luz lateral dura, respiro escuro no topo. Base preto profundo #141414, sombras
azul-aço, alto contraste, granulado de filme, sem texto legível, sem rostos,
sem logotipos.
```

---

### T12 — Portal do Cliente e Portal do Contrato · Tema: *Black Mirror*
**Ideia**: as duas telas do outro lado, conectando o cliente à operação e ao contrato.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Um celular
flutuando no escuro, visto de lado, com a tela emitindo luz verde-esmeralda
#00C597 que projeta no ar duas interfaces abstratas interligadas: uma visão
geral do cliente e uma visão de contrato com calendário e documentos. Reflexos limpos, superfície preta espelhada embaixo,
estética minimalista e fria. Terço esquerdo vazio e escuro. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, alto contraste, granulado sutil,
sem texto legível na tela, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Celular na vertical flutuando no
escuro no centro do quadro, tela emitindo luz verde-esmeralda #00C597 que
projeta duas interfaces abstratas interligadas, uma geral e outra com calendário e documentos, superfície preta
espelhada abaixo, estética minimalista e fria, respiro escuro no topo. Base
preto profundo #141414, sombras azul-aço, luz volumétrica, granulado sutil, sem
texto legível, sem rostos, sem logotipos.
```

---

### T13 — Financeiro · Tema: *Ozark*
**Ideia**: o fluxo do dinheiro, correndo por baixo de tudo.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Rio escuro visto
de cima à noite, mas a água é feita de linhas de luz verde-esmeralda #00C597
correndo e se dividindo em afluentes, atravessando uma paisagem industrial
silhuetada. Névoa fria sobre a água, atmosfera tensa. Terço esquerdo mais
escuro e vazio. Base preto profundo #141414, sombras azul-aço, luz volumétrica,
alto contraste, granulado de filme, sem texto, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Rio vertical de luz verde-esmeralda
#00C597 descendo pelo centro do quadro e se ramificando em afluentes, margens
industriais escuras silhuetadas dos dois lados, névoa fria, atmosfera tensa,
respiro escuro no topo. Base preto profundo #141414, sombras azul-aço, luz
volumétrica, alto contraste, granulado de filme, sem texto, sem rostos, sem
logotipos.
```

---

### T19 — Integração com Asaas, Assinaturas e Cobranças · Tema: *Billions*
**Ideia**: pagamentos únicos e recorrentes atravessando uma ponte digital segura.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Cofre digital
aberto no terço direito, recebendo três fluxos abstratos de pagamento — Pix,
boleto e cartão — enquanto anéis concêntricos sugerem recorrência. Linhas de
luz verde-esmeralda #00C597 conectam tudo sobre uma superfície preta
espelhada. Terço esquerdo escuro e limpo. Alto contraste, sombras azul-aço,
granulado sutil, sem marcas, sem números legíveis, sem rostos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Cofre digital central recebendo três
trilhas luminosas de pagamento e envolvido por anéis de recorrência em
verde-esmeralda #00C597, superfície preta espelhada, respiro escuro no topo.
Alto contraste, sombras azul-aço, granulado sutil, sem marcas, sem números
legíveis, sem rostos.
```

---

### T20 — Relatório Financeiro e DRE · Tema: *Margin Call*
**Ideia**: o resultado da empresa revelado numa mesa de análise antes da decisão.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Mesa escura de
análise com folhas financeiras abstratas, gráficos de resultado e uma linha
dividindo caixa e competência, iluminados por um único monitor em
verde-esmeralda #00C597. Atmosfera noturna, tensa e precisa. Terço esquerdo
limpo, base preto profundo #141414, sombras azul-aço, granulado de filme, sem
números legíveis, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Pilha de relatórios financeiros sobre
mesa preta, atravessada por uma linha luminosa que separa caixa e competência,
gráfico de resultado abstrato aceso em verde-esmeralda #00C597 ao fundo,
respiro escuro no topo. Sombras azul-aço, alto contraste, sem números legíveis,
sem rostos, sem logotipos.
```

---

### T14 — Notas Fiscais (NFS-e e NF-e) · Tema: *Better Call Saul*
**Ideia**: o carimbo oficial. Burocracia levada a sério.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Mesa de cartório
escura vista de lado, um documento oficial sob um facho de luz duro, um carimbo
metálico prestes a descer, e ao redor pequenos elementos abstratos de
certificado digital e chave criptográfica brilhando em verde-esmeralda #00C597.
Estética retrô-burocrática, persianas projetando listras de luz. Terço esquerdo
limpo. Base preto profundo #141414, sombras azul-aço, alto contraste, granulado
de filme, sem texto legível, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Carimbo metálico em close descendo
sobre um documento oficial no centro do quadro, listras de luz de persiana
cortando a cena na diagonal, elementos abstratos de chave criptográfica
brilhando em verde-esmeralda #00C597 ao redor, respiro escuro no topo. Base
preto profundo #141414, sombras azul-aço, alto contraste, granulado de filme,
sem texto legível, sem rostos, sem logotipos.
```

---

### T15 — Funcionários: Financeiro do Funcionário e Ponto Eletrônico · Tema: *The Office*
**Ideia**: o time. Cadastro, horário e movimentações financeiras — o lado humano do sistema.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Vestiário de
empresa de serviço técnico ao amanhecer, fileira de armários metálicos com
uniformes pendurados, capacetes e EPIs alinhados, um relógio de ponto na parede
emitindo luz verde-esmeralda #00C597, luz suave entrando por uma janela alta.
Atmosfera calorosa e cotidiana, sem ninguém em cena. Terço esquerdo mais vazio.
Base preto profundo #141414, sombras azul-aço, luz volumétrica, granulado de
filme, sem texto legível, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Composição vertical de um armário de
vestiário aberto com uniforme técnico pendurado, capacete e EPI, e acima dele
um relógio de ponto na parede emitindo luz verde-esmeralda #00C597, luz suave
lateral, respiro escuro no topo, sem ninguém em cena. Base preto profundo
#141414, sombras azul-aço, luz volumétrica, granulado de filme, sem texto
legível, sem rostos, sem logotipos.
```

---

### T22 — Ferramentas de RH: Perfil Comportamental (DISC), Organograma, Fluxograma · Tema: *Severance*
**Ideia**: pessoas, estrutura e processos alinhados em um sistema visual controlado.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Sala escura de
planejamento de RH com três camadas holográficas flutuando no terço direito:
um radar comportamental dividido em quatro quadrantes, uma hierarquia de cartões
e um fluxograma conectado por setas. Todos os elementos ligados por linhas de
luz verde-esmeralda #00C597, estética precisa e minimalista, terço esquerdo
limpo. Base preto profundo #141414, sombras azul-aço, alto contraste, luz
volumétrica, sem números legíveis, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Composição central em três níveis: um
radar comportamental abstrato no topo, uma pequena árvore hierárquica no meio e
um fluxograma com decisão e setas na base, todos conectados por um feixe de luz
verde-esmeralda #00C597. Ambiente de planejamento escuro, preciso e
minimalista, respiro no topo. Base preto profundo #141414, sombras azul-aço,
alto contraste, granulado sutil, sem números legíveis, sem rostos, sem
logotipos.
```

---

### T21 — Integração com WhatsApp · Tema: *Mr. Robot*
**Ideia**: um canal conectado com proteção, automação e histórico visível.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Smartphone no
terço direito conectado por um feixe verde-esmeralda #00C597 a uma central
operacional abstrata, com pequenos pulsos representando mensagens e um escudo
translúcido protegendo o fluxo. Ambiente técnico escuro, cabos e luzes de
status ao fundo, terço esquerdo limpo. Base preto profundo #141414, sombras
azul-aço, alto contraste, sem texto legível, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Smartphone central emitindo pulsos de
mensagem em verde-esmeralda #00C597 dentro de um escudo translúcido, cabos e
luzes técnicas ao fundo, respiro escuro no topo. Base preto profundo #141414,
sombras azul-aço, alto contraste, granulado sutil, sem texto legível, sem
rostos, sem logotipos.
```

---

### T17 — Dashboard, relatórios e exportações · Tema: *Moneyball*
**Ideia**: parar de achar, começar a medir e levar os dados adiante.

**Banner 16:9 (1280×720)**
```
Pôster cinematográfico horizontal 16:9, 1280x720, sem texto. Sala escura com
uma parede inteira de painéis de dados abstratos — gráficos de barra, linhas
ascendentes e mostradores circulares — todos brilhando em verde-esmeralda
#00C597, e uma cadeira vazia de costas em primeiro plano no terço direito.
Silêncio, foco, atmosfera analítica. Terço esquerdo mais escuro e limpo. Base
preto profundo #141414, sombras azul-aço, luz volumétrica, alto contraste,
granulado de filme, sem números legíveis, sem rostos, sem logotipos.
```

**Thumbnail 2:3 (400×600)**
```
Pôster vertical 2:3, 400x600, sem texto. Parede vertical de painéis de dados
abstratos empilhados — barras, linhas ascendentes e mostradores circulares —
brilhando em verde-esmeralda #00C597, com o encosto de uma cadeira vazia
silhuetado na base do quadro, respiro escuro no topo. Atmosfera analítica e
silenciosa. Base preto profundo #141414, sombras azul-aço, luz volumétrica,
alto contraste, granulado de filme, sem números legíveis, sem rostos, sem
logotipos.
```

---

# ❌ O que ficou de fora da trilha (e por quê)

## Telas que existem no código mas estão mortas — **nunca gravar**
| Tela | O que fazer |
|---|---|
| `Teams.tsx` (`/equipes`) | Redireciona. Grave por **Funcionários → aba Equipes**. |
| `Checklists.tsx` (`/checklists`) | Redireciona. Grave por **Serviços → aba Checklists**. |
| `TechnicianTracking.tsx` | Não roteada. Use **Mapa e Rastreamento → aba Histórico**. |
| `PMOC.tsx` (`/pmoc`) | Redireciona pra `/contratos?tipo=pmoc`. Não existe menu PMOC. |
| `FiscalSettings.tsx` | Redireciona. A configuração fiscal é **modal** dentro de Notas Fiscais. |
| `Tutorials.tsx` (`/tutoriais`) | Redireciona pro `/domiflix`. |
| `ResponsibleTechnicians.tsx` | Redireciona. Vive em **Configurações de Contrato → aba Responsáveis Técnicos**. |

## Funcionalidades desligadas hoje
| Item | Situação |
|---|---|
| Atendimento e Campanhas no WhatsApp | As abas aparecem como prévia bloqueada e ainda são etapas futuras. Não gravar como disponíveis. |
| Banner "Instalar Dominex" (PWA) | O componente existe mas **não está montado** no app — não há prompt de instalação visível. Não gravar aula de "instalar como app" sem confirmar. |

## Coisas que parecem existir e não existem
- Conversão **Orçamento → Contrato** (contrato é sempre manual).
- Toggle manual de "exigir assinatura" na criação de OS.
- Baixa automática de estoque ao concluir OS **sem habilitar e preencher o consumo de estoque**.
- Fila de sincronização **offline** de verdade no app do técnico.
- Botão "Gerar Folha".
- Subcategoria/hierarquia de categoria financeira.
- Tela dedicada de BDI.
- Anexos, campos customizados ou múltiplos endereços no cadastro de cliente.
- "Líder de equipe".
- Importação em massa de clientes, equipamentos ou leads.
- Assinatura eletrônica de proposta ou de contrato.
- Login com senha para o cliente final no Portal.
- Login social (Google/Microsoft).

## Só do painel da Dominex (não é do cliente — não entra na trilha)
Painel master (`/admin/*`): gestão de empresas, vendedores, health score, cobranças da carteira, blog, monitoramento de banco e a **curadoria do próprio Domiflix**.

---

# ⚠️ Pendências de validação antes de gravar

Abra o sistema e confirme cada ponto abaixo. Se algum voltar diferente, o capítulo correspondente muda ou sai.

1. **T7 — a frase sobre offline.** O app usa sempre rede pra salvar; não existe fila de sincronização. **Definir com o Tech Lead a frase exata** que pode ser dita sobre "trabalhar em campo com sinal ruim" antes de gravar qualquer coisa.
2. ~~**T5/T8 — baixa de estoque.**~~ **RESOLVIDO em 06/09/2026 (v1.23.0/1.23.1).** Existem DOIS caminhos independentes de baixa: (a) conversão de orçamento em OS e ajustes/inventário, que sempre valeram; e (b) o consumo lançado dentro da própria OS, confirmado no resumo da finalização, que depende do recurso "Consumo de estoque na OS" (Configurações → Usabilidade, desligado por padrão). O Guia Técnico já foi corrigido em T5, T7, T8 e T9.
3. **T5 — assinatura obrigatória.** Confirmar se existe algum ponto do fluxo (fora de contrato PMOC) onde o gestor liga a exigência de assinatura.
4. **T5 — Equipes sem módulo RH.** Confirmar se empresa sem o módulo Funcionários consegue criar/editar equipe, já que a aba vive dentro de `/funcionarios`.
5. **T21 — WhatsApp.** Confirmar conexão por QR Code numa conta-demo e quais eventos de automação estão liberados na data da gravação.
6. **T0 — instalar como app.** Confirmar se o banner de instalação foi religado antes de prometer o passo a passo.
7. **T3 — excluir categoria de equipamento com equipamentos vinculados.** Confirmar o comportamento na tela antes de mostrar.
8. **T14 — município de exemplo.** Confirmar cobertura do município que for usado na gravação, senão a emissão trava na frente da câmera.
9. **T4 — abas "Tipos de Tarefa" e "Checklists".** Conferir os nomes exatos das abas na tela no dia da gravação.

---

# 📋 Padrão de gravação

- Sempre começar mostrando **onde está no menu** (orientação espacial) antes de entrar na tela.
- Usar conta-demo com **dados reais e plausíveis** — nome de cliente de verdade do ramo, não "Cliente Teste 123".
- **Zoom** em campos críticos (CNPJ, valores, alíquota, chave de acesso).
- Mostrar o **erro de propósito** em todo item marcado ⚠️, e como sair dele.
- Sempre dizer, ao entrar num item 🔒, que ele **depende do plano contratado**.
- Gravar em **desktop** por padrão; T7 (técnico em campo) é gravado **no celular**.
