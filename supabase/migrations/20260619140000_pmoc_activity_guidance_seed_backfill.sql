-- =============================================================================
-- PMOC: popular `guidance` (instrução "como fazer") nas 3 camadas do plano
-- Complementa 20260619130000 (que só criou a coluna). Aqui:
--   Passo 1 — seed das 149 instruções no catálogo global (pmoc_activity_catalog)
--   Passo 2 — backfill do plano (contract_plan_activities) via catalog_activity_id
--   Passo 3 — backfill dos itens da OS (service_order_activities) via plan_activity_id
--   Passo 4 — verificação (RAISE EXCEPTION se algum dos 149 ficar sem guidance)
--
-- Chave do UPDATE do catálogo é COMPOSTA (section + component + description) porque
-- há 8 títulos repetidos em sections/components diferentes. component nulo é tratado
-- com IS NOT DISTINCT FROM. Textos de description copiados do seed Fase 2
-- (20260617200000) — fonte da verdade dos acentos/parênteses.
--
-- guidance é só o complemento; o título continua em description. NÃO mexe em RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Passo 1 — Seed do catálogo
-- -----------------------------------------------------------------------------

-- CONDICIONADORES / filtros
UPDATE public.pmoc_activity_catalog SET guidance = 'Desligue o equipamento, remova o filtro pela frontal e lave em água corrente com sabão neutro; seque à sombra antes de recolocar. Troque se estiver rasgado ou ressecado.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'filtros' AND description = 'Limpar ou trocar o elemento filtrante';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o filtro removido, inspecione o suporte e a moldura procurando trincas, ferrugem e frestas por onde o ar passa sem ser filtrado. Anote qualquer abertura que comprometa a vedação.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'filtros' AND description = 'Verificar danos e corrosão do suporte e frestas';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se a moldura encaixa firme no alojamento, sem folga nem empeno. Reposicione até não haver frestas entre a moldura e o gabinete.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'filtros' AND description = 'Verificar o ajuste da moldura';

-- CONDICIONADORES / bandejas
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque se a bandeja está livre de sujeira e se a inclinação leva a água toda para o dreno. Despeje um pouco de água e confirme que escoa sem empoçar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'bandejas' AND description = 'Verificar obstrução e inclinação para drenagem';
UPDATE public.pmoc_activity_catalog SET guidance = 'Esvazie a bandeja e remova a camada viscosa (lodo/limo) esfregando com pano e sabão neutro; enxágue bem. Use luvas — o biofilme acumula bactérias.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'bandejas' AND description = 'Lavar e remover o biofilme';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione a bandeja seca procurando trincas, furos e pontos de ferrugem que possam vazar. Registre com foto qualquer dano encontrado.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'bandejas' AND description = 'Verificar danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o equipamento em operação, observe se há água pingando fora da bandeja ou marcas de gotejamento embaixo. Localize a origem antes de finalizar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'bandejas' AND description = 'Verificar vazamento';

-- CONDICIONADORES / evaporadores
UPDATE public.pmoc_activity_catalog SET guidance = 'Proteja a parte elétrica, aplique produto próprio de limpeza de serpentina e enxágue com pulverizador, sem dobrar as aletas. Direcione a água para a bandeja/dreno.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Lavar e remover o biofilme da serpentina';
UPDATE public.pmoc_activity_catalog SET guidance = 'Observe as aletas contra a luz procurando amassados, falhas e ferrugem. Desentorte aletas dobradas com pente próprio para liberar a passagem de ar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Verificar danos e corrosão do aletado';
UPDATE public.pmoc_activity_catalog SET guidance = 'Quando a limpeza simples não resolve, aplique desincrustante específico para serpentina conforme o rótulo e enxágue por completo, evitando contato com a parte elétrica.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Desencrustar a serpentina';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o equipamento desligado, remova a sujeira acumulada entre as pás da turbina (rolo) com escova e aspiração, sem desbalancear o conjunto.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Limpar a turbina';
UPDATE public.pmoc_activity_catalog SET guidance = 'Despeje água na bandeja e acompanhe o escoamento até a saída do dreno; se demorar ou empoçar, desobstrua a mangueira de dreno.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Verificar a drenagem da bandeja';
UPDATE public.pmoc_activity_catalog SET guidance = 'Após a limpeza, com a serpentina limpa, aplique o produto antibactericida de forma uniforme conforme o rótulo. Use luvas e máscara.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Aplicar antibactericida na serpentina';
UPDATE public.pmoc_activity_catalog SET guidance = 'Limpe a carcaça e as grelhas da unidade interna com pano úmido e sabão neutro, sem molhar componentes elétricos.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'evaporadores' AND description = 'Fazer a limpeza externa';

-- CONDICIONADORES / gabinetes
UPDATE public.pmoc_activity_catalog SET guidance = 'Limpe a parte externa do gabinete com pano úmido e sabão neutro, removendo poeira e gordura. Seque em seguida.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Lavar externamente';
UPDATE public.pmoc_activity_catalog SET guidance = 'Abra os painéis e limpe o interior do gabinete, removendo poeira e detritos, sem molhar a parte elétrica. Aspire o que não puder lavar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Lavar internamente';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione chapas e cantos do gabinete procurando amassados, trincas e ferrugem. Registre com foto pontos que precisem de reparo.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Verificar danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se as borrachas e gaxetas dos painéis estão íntegras e se fecham sem frestas. Substitua vedações ressecadas ou faltantes.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Verificar a vedação dos painéis';
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque se o revestimento interno (manta/isolante) está colado, sem desprendimento, umidade ou partes soltas que reduzam o isolamento.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Verificar o isolamento termoacústico';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o equipamento ligado, ouça ruídos anormais e sinta vibrações excessivas no gabinete. Reaperte fixações soltas que estejam causando o barulho.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Verificar ruídos e vibrações';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que a entrada de ar exterior está aberta e desobstruída, garantindo a troca de ar do ambiente. Limpe obstruções na tomada de ar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Verificar a renovação de ar';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acione os botões e chaves de comando e confirme que ligam/desligam corretamente, sem estarem soltos, travados ou danificados.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'gabinetes' AND description = 'Verificar as botoeiras';

-- CONDICIONADORES / condensadores
UPDATE public.pmoc_activity_catalog SET guidance = 'Proteja a parte elétrica e lave a serpentina da condensadora com produto próprio e jato controlado de dentro para fora, removendo poeira e folhas, sem dobrar as aletas.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'condensadores' AND description = 'Lavar e remover as incrustações da serpentina';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione aletas e estrutura da condensadora procurando amassados, falhas e ferrugem. Desentorte aletas dobradas com pente próprio.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'condensadores' AND description = 'Verificar danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os coxins/calços de borracha sob a unidade estão presentes, íntegros e nivelados, evitando vibração. Substitua os ressecados ou esmagados.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'condensadores' AND description = 'Verificar os calços de borracha';
UPDATE public.pmoc_activity_catalog SET guidance = 'Limpe a carcaça da unidade externa com pano úmido e remova folhas e detritos ao redor que prejudiquem a troca de calor.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'condensadores' AND description = 'Fazer a limpeza externa';

-- CONDICIONADORES / ventiladores
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o equipamento desligado, inspecione as pás e a hélice procurando acúmulo de sujeira, trincas e ferrugem. Limpe e registre danos.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'ventiladores' AND description = 'Verificar sujeira, danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se o ventilador está firme na base e se os amortecedores/coxins absorvem a vibração. Reaperte parafusos soltos e substitua amortecedores deteriorados.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'ventiladores' AND description = 'Verificar a fixação e os amortecedores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o ventilador girando, ouça ruídos nos mancais; se houver atrito ou rangido, lubrifique conforme a especificação do fabricante.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'ventiladores' AND description = 'Verificar ruído dos mancais e lubrificar';

-- CONDICIONADORES / motores_eletricos
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se o motor está firmemente fixado e se os amortecedores controlam a vibração. Reaperte a base e troque coxins gastos.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'motores_eletricos' AND description = 'Verificar a fixação e os amortecedores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a energia desligada, limpe a carcaça do motor e inspecione procurando trincas, ferrugem e fios ressecados. Registre danos.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'motores_eletricos' AND description = 'Limpar e verificar danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o fio terra está conectado e firme no ponto de aterramento do motor. Refaça a conexão se estiver solta ou oxidada.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'motores_eletricos' AND description = 'Verificar o aterramento';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a energia desligada e o capacitor descarregado, inspecione procurando estufamento, vazamento ou queima. Substitua qualquer capacitor com sinal de defeito.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'motores_eletricos' AND description = 'Verificar os capacitores';

-- CONDICIONADORES / compressores
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione o corpo do compressor e suas conexões procurando sujeira, óleo vazando, trincas e ferrugem. Limpe e registre o que encontrar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'compressores' AND description = 'Verificar sujeira, danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o aterramento do compressor está conectado e firme. Refaça a ligação se estiver solta ou corroída.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'compressores' AND description = 'Verificar o aterramento';
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque se o compressor está firme sobre os coxins e ouça ruídos anormais em operação. Reaperte fixações e troque amortecedores deteriorados.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'compressores' AND description = 'Verificar a fixação, os amortecedores e ruídos';

-- CONDICIONADORES / circuito_refrigerante
UPDATE public.pmoc_activity_catalog SET guidance = 'Percorra a tubulação de gás conferindo abraçadeiras firmes, ausência de amassados e pontos de ferrugem. Reaperte suportes soltos.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'circuito_refrigerante' AND description = 'Verificar a fixação, danos e corrosão da tubulação';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se a borracha isolante cobre toda a tubulação, sem trechos expostos, ressecados ou rasgados. Reponha o isolamento onde faltar.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'circuito_refrigerante' AND description = 'Verificar os isolamentos térmicos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione conexões e solda com detector eletrônico ou espuma detectora; bolhas indicam vazamento. Marque o ponto e registre antes de qualquer recarga.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'circuito_refrigerante' AND description = 'Verificar vazamento de gás';

-- CONDICIONADORES / circuito_eletrico
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se disjuntores, tomadas e plugues estão firmes, sem aquecimento, derretimento ou folga. Substitua peças com sinal de mau contato.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'circuito_eletrico' AND description = 'Verificar disjuntores, tomadas e plugs';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a energia desligada, reaperte os bornes e terminais elétricos no torque adequado. Refaça contatos oxidados ou frouxos.' WHERE section = 'condicionadores' AND component IS NOT DISTINCT FROM 'circuito_eletrico' AND description = 'Verificar o aperto dos contatos';

-- MEDIÇÕES (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o equipamento em regime, meça a tensão entre fases e a corrente em cada fase usando multímetro/alicate amperímetro. Anote os valores e compare com a faixa indicada.' WHERE section = 'medicoes' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir tensões e corrente';
UPDATE public.pmoc_activity_catalog SET guidance = 'Meça a velocidade/vazão do ar na grelha de insuflamento com anemômetro, em pontos representativos. Registre o valor e compare com a faixa indicada.' WHERE section = 'medicoes' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir vazões de ar';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o sistema em regime, meça com termômetro a temperatura do ar que sai (insuflamento), do ambiente e do retorno. Anote os três valores.' WHERE section = 'medicoes' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir temperatura de insuflamento, ambiente e retorno';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o equipamento em operação, meça a temperatura do ar/água na entrada e na saída da condensadora e registre a diferença entre os dois pontos.' WHERE section = 'medicoes' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir temperatura de entrada e saída do condensador';
UPDATE public.pmoc_activity_catalog SET guidance = 'Conecte o manifold no lado de alta com o equipamento em regime e leia a pressão. Anote o valor e compare com a faixa indicada.' WHERE section = 'medicoes' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir a pressão de alta';
UPDATE public.pmoc_activity_catalog SET guidance = 'Conecte o manifold no lado de baixa após o equipamento estabilizar e leia a pressão. Anote o valor e compare com a faixa indicada.' WHERE section = 'medicoes' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir a pressão de baixa';

-- DUTOS (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Remova poeira e sujeira da superfície externa dos dutos visíveis com pano e aspiração, sem danificar o isolamento.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a limpeza externa dos dutos aparentes';
UPDATE public.pmoc_activity_catalog SET guidance = 'Remova as grelhas e difusores, lave em água com sabão neutro, seque e recoloque. Limpe a poeira ao redor da abertura.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Limpar as grelhas e difusores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione o isolamento dos dutos na casa de máquinas e procure vazamentos de ar nas junções. Vede frestas e reponha isolamento danificado.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar isolamento e estanqueidade na casa de máquinas';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acesse o entreforro e confira o isolamento e a vedação das junções dos dutos. Sele pontos com escape de ar e reponha o isolamento solto.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar isolamento e estanqueidade no entreforro';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione as lonas flexíveis entre o equipamento e o duto procurando rasgos, ressecamento e folga. Substitua lonas danificadas.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar as lonas da conexão flexível';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os splitters (defletores internos) estão na posição correta e regulados para a distribuição de ar prevista. Ajuste o que estiver fora.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar splitters e regulagem';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acione as venezianas de alívio de sobrepressão e confirme que abrem e fecham livremente, sem travamento.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar as venezianas de sobrepressão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Ajuste os registros (dampers) dos dutos para equilibrar a vazão de ar entre os ambientes, conforme o projeto. Confira com medição de ar nas grelhas.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Regular as vazões';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione o interior e o entorno dos dutos procurando água acumulada, condensação ou manchas de umidade. Identifique e registre a origem.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar presença de água e umidade';
UPDATE public.pmoc_activity_catalog SET guidance = 'Percorra os dutos procurando amassados, furos, junções abertas e ferrugem. Registre com foto os pontos que precisam de reparo.' WHERE section = 'dutos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar danos e corrosões';

-- TOMADA DE AR EXTERIOR (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione a tomada de ar externa procurando acúmulo de sujeira, folhas, danos e ferrugem. Limpe e registre danos estruturais.' WHERE section = 'tomada_ar_exterior' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar sujeira, danos e corrosão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se há frestas entre o filtro e a moldura por onde o ar entra sem ser filtrado. Ajuste o encaixe até vedar.' WHERE section = 'tomada_ar_exterior' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar frestas nos filtros e na moldura';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o conjunto da tomada de ar está firmemente fixado, sem folga nem vibração. Reaperte parafusos e suportes soltos.' WHERE section = 'tomada_ar_exterior' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a fixação do conjunto';
UPDATE public.pmoc_activity_catalog SET guidance = 'Limpe o filtro da tomada de ar; se estiver saturado, danificado ou após no máximo 3 meses de uso, troque por um novo. Anote a data da troca.' WHERE section = 'tomada_ar_exterior' AND component IS NOT DISTINCT FROM NULL AND description = 'Limpar ou trocar filtros até obliteração (máx. 3 meses)';
UPDATE public.pmoc_activity_catalog SET guidance = 'Ajuste o registro da tomada de ar exterior para a vazão de renovação prevista no projeto e confirme com medição de ar.' WHERE section = 'tomada_ar_exterior' AND component IS NOT DISTINCT FROM NULL AND description = 'Regular a vazão';

-- CASA DE MÁQUINAS (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Varra e limpe o piso, as paredes e a área da casa de máquinas, removendo poeira e detritos. Mantenha o ambiente livre de sujeira.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Limpar a área, paredes e pisos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Verifique e registre qualquer material que não pertença à casa de máquinas (entulho, estoque indevido, lixo) e remova o que for possível.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Registrar ocorrências de materiais estranhos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira a vedação de portas e aberturas e ouça ruídos anormais dos equipamentos. Registre vazamentos de ar e barulhos fora do normal.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar estanqueidade e ruído';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acione todas as luminárias e confirme que iluminam corretamente. Substitua lâmpadas queimadas para garantir manutenção segura.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a iluminação';
UPDATE public.pmoc_activity_catalog SET guidance = 'Procure água empoçada no piso e confirme que os ralos escoam. Desobstrua ralos e identifique a origem de qualquer acúmulo.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar retenção de água no piso e ralos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque a posição e o funcionamento dos registros de vazão; confirme que abrem e fecham e estão na regulagem prevista.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os registros de vazão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione as paredes procurando pintura descascada, mofo e superfícies ásperas que soltam partículas. Registre trechos que precisem de repintura.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar pintura e aspereza das paredes';
UPDATE public.pmoc_activity_catalog SET guidance = 'Quando necessário, lixe, regularize e repinte as paredes e superfícies com tinta adequada, deixando lisas e laváveis.' WHERE section = 'casa_maquinas' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer pintura e regularização';

-- QUADROS ELÉTRICOS (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a energia desligada, remova poeira do quadro e dos componentes com pincel e aspiração (nunca pano úmido nos terminais energizados).' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Limpar quadros e componentes';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a energia desligada, confira se disjuntores, contatoras e terminais estão firmes no trilho e reaperte o que estiver solto.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar fixação de componentes e terminais';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione os contatos das contatoras procurando desgaste, queima e pontos pretos. Registre os que estiverem deteriorados.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os contatos das contatoras';
UPDATE public.pmoc_activity_catalog SET guidance = 'Quando os contatos estiverem gastos ou queimados, com a energia desligada, substitua por peças equivalentes às originais.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Substituir contatos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o sistema em carga, meça a temperatura de disjuntores, terminais e contatoras com termômetro infravermelho. Anote pontos quentes e compare com a faixa indicada.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a temperatura dos componentes';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione cabos e terminais procurando isolamento ressecado, escurecimento por calor e folga. Reaperte e registre os que precisam de troca.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar cabos e terminais';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a energia desligada, troque cabos com oxidação, isolamento danificado ou pontos de aquecimento por cabos de mesma bitola.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Substituir cabos oxidados';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os relés de sobrecarga estão ajustados conforme a corrente do motor e testam o disparo. Registre o valor ajustado.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os relés de sobrecarga';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acione e confirme que as luzes de sinalização e os alarmes do quadro funcionam. Substitua sinalizadores queimados.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar sinalização e alarme';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se o inversor está sem alarme/falha no display, com ventilação limpa e sem aquecimento anormal. Registre códigos de erro encontrados.' WHERE section = 'quadros_eletricos' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o inversor de frequência';

-- TESTES (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o motor desenergizado e desconectado, meça a resistência de isolamento com megômetro entre enrolamentos e carcaça. Anote o valor obtido.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Testar o isolamento dos motores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Simule a variação de temperatura e confirme que o termostato liga/desliga no ponto ajustado. Ajuste o setpoint conforme necessário.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar atuação e regulagem dos termostatos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os pressostatos de alta e baixa atuam nos limites previstos, protegendo o sistema. Teste o desarme e o rearme.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os pressostatos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o fluxostato detecta a presença e a falta de fluxo, liberando/bloqueando o sistema corretamente. Teste interrompendo o fluxo.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os fluxostatos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o compressor parado, confirme que o aquecedor de cárter está aquecendo a base, evitando óleo com refrigerante. Substitua se estiver frio.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os aquecedores de cárter';
UPDATE public.pmoc_activity_catalog SET guidance = 'Teste o desarme dos termostatos de segurança ao atingir o limite e confirme que protegem o equipamento. Registre o ponto de atuação.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os termostatos de segurança';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o umidostato responde à variação de umidade, acionando o controle no ponto ajustado. Ajuste o setpoint se necessário.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os umidostatos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Teste a atuação dos relés de sobrecarga e de tempo, confirmando que disparam e temporizam conforme o ajuste. Registre os valores.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar relés de sobrecarga e de tempo';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o controle de condensação (ventilador/pressão) atua mantendo a pressão de condensação estável. Observe a resposta em operação.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o controle de condensação';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o relé de sequência de fase impede a partida com fase invertida ou falta de fase. Teste simulando a condição.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os relés de sequência de fase';
UPDATE public.pmoc_activity_catalog SET guidance = 'Colete amostra do óleo do compressor e teste a acidez com kit próprio. Óleo ácido indica contaminação — registre o resultado.' WHERE section = 'testes' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a acidez do óleo';

-- TUBULAÇÃO HIDRÁULICA (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Manobre os registros de gaveta abrindo e fechando totalmente e confirme que vedam sem vazar nem travar. Lubrifique a haste se necessário.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os registros de gaveta';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acione os registros de globo conferindo a vedação e procure vazamentos na haste e nas conexões. Reaperte ou troque a gaxeta que vazar.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar registros de globo e vazamentos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Feche o registro, abra o filtro Y, retire e limpe a tela removendo detritos; recoloque e confira a vedação ao reabrir o fluxo.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os filtros angulares (Y)';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o fluxostato da linha hidráulica detecta a presença e a falta de fluxo de água. Teste interrompendo a circulação.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os fluxostatos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Percorra a tubulação procurando gotejamento, manchas de umidade e poças nas conexões. Marque os pontos de vazamento encontrados.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar vazamentos de água';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione a tubulação procurando ferrugem, bolhas na pintura e descascamento. Registre os trechos que precisam de tratamento.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar focos de corrosão e pintura';
UPDATE public.pmoc_activity_catalog SET guidance = 'Lixe os pontos de corrosão, aplique antiferrugem e repinte a tubulação com tinta adequada, mantendo o código de cores quando houver.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a pintura geral';
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque o isolamento térmico das linhas de água gelada procurando trechos expostos, úmidos ou com condensação. Reponha onde faltar.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o isolamento da água gelada';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione mangotes e juntas flexíveis procurando ressecamento, trincas, abaulamento e vazamento. Substitua os deteriorados.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar mangotes e juntas';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que os purgadores eliminam o ar/condensado da linha e não estão entupidos nem vazando. Desobstrua ou substitua se necessário.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os purgadores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que a válvula de retenção permite o fluxo num sentido e bloqueia o retorno. Verifique se não está travada nem com vazamento reverso.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar as válvulas de retenção';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os manômetros indicam pressão coerente e voltam a zero sem pressão. Substitua os com vidro embaçado, agulha presa ou leitura inconsistente.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os manômetros';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os termômetros indicam temperatura coerente com a operação. Substitua os danificados ou com leitura claramente errada.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os termômetros';
UPDATE public.pmoc_activity_catalog SET guidance = 'Abra a purga de desconcentração para eliminar água com excesso de sais/sólidos e reduzir a concentração do sistema, conforme orientação do tratamento.' WHERE section = 'tubulacao_hidraulica' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a purga de desconcentração';

-- TORRES DE RESFRIAMENTO (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Acione a válvula de admissão e confirme que abre, fecha e controla o nível de água sem vazar nem travar.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a válvula de admissão';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o termostato da torre aciona os ventiladores conforme a temperatura da água. Ajuste o setpoint se necessário.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o termostato';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira se os suportes dos ventiladores e motores estão firmes, sem trincas, folga ou corrosão. Reaperte fixações soltas.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o suporte de ventiladores e motores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o conjunto parado, gire o eixo manualmente sentindo folga e ruído nos mancais. Lubrifique e registre desgaste anormal.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar eixos e mancais';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione o ventilador e o redutor procurando folga, ruído e desalinhamento. Confirme giro livre e sem vibração excessiva.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o conjunto ventilador e redutor';
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque o nível e a aparência do óleo do redutor e procure vazamentos nas vedações. Complete ou registre a necessidade de troca.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar vazamentos e óleo no redutor';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira a tensão, o alinhamento e o estado das correias; substitua as ressecadas, trincadas ou folgadas. Ajuste a tensão conforme o fabricante.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar as correias';
UPDATE public.pmoc_activity_catalog SET guidance = 'Esvazie a torre e remova lodo, folhas e incrustações da bacia, do enchimento e da estrutura. Use luvas e proteção — há risco biológico.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a limpeza externa e interna';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o dreno escoa livremente e desobstrua se houver acúmulo de detritos. Teste o escoamento completo da bacia.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar dreno e desobstrução';
UPDATE public.pmoc_activity_catalog SET guidance = 'Abra a purga da bacia para descartar água com excesso de sólidos/sais e renovar parte da água, conforme orientação do tratamento.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a purga na bacia';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que a bomba dosadora de produtos químicos está dosando, sem entupimento nem vazamento. Cheque o nível do produto.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a bomba dosadora';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o conjunto parado, cheque folga e ruído nos rolamentos e mancais. Lubrifique e registre desgaste para programar a troca.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar rolamentos e mancais';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira o alinhamento entre motor e conjunto acionado; desalinhamento gera vibração e desgaste. Corrija e reaperte a base.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o alinhamento do motor';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que os bicos distribuem a água uniformemente sobre o enchimento, sem entupimento. Desobstrua os bicos bloqueados.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os bicos pulverizadores';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione o enchimento (colmeia) procurando incrustação, deformação e partes quebradas. Limpe e registre a necessidade de substituição.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o enchimento';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que a bóia mantém o nível de água correto na bacia, sem transbordar nem faltar. Ajuste ou substitua a bóia defeituosa.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o nível de água e a bóia';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione a estrutura procurando corrosão e pintura danificada. Aplique anticorrosivo e repinte os pontos afetados.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar anticorrosivo e pintura';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a torre em operação, ouça ruídos anormais e sinta vibrações excessivas no conjunto. Localize a origem e reaperte fixações.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar ruídos e vibrações';
UPDATE public.pmoc_activity_catalog SET guidance = 'Teste a chave-bóia acompanhando o nível: ela deve ligar/desligar a reposição nos pontos certos. Substitua se não comutar.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a chave-bóia';
UPDATE public.pmoc_activity_catalog SET guidance = 'Drene o óleo usado do redutor e reabasteça com óleo do tipo e quantidade especificados pelo fabricante. Descarte o óleo usado corretamente.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Trocar o óleo do redutor';
UPDATE public.pmoc_activity_catalog SET guidance = 'Aplique a graxa especificada nos rolamentos pelos pontos de lubrificação, na quantidade correta, sem excesso.' WHERE section = 'torres_resfriamento' AND component IS NOT DISTINCT FROM NULL AND description = 'Lubrificar os rolamentos';

-- BOMBAS DE ÁGUA (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Limpe a bomba e o conjunto removendo poeira, sujeira e respingos, sem molhar a parte elétrica. Mantenha a área ao redor limpa.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a limpeza geral';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que o dreno da bomba escoa livremente e não há acúmulo de água na base. Desobstrua se necessário.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o dreno';
UPDATE public.pmoc_activity_catalog SET guidance = 'Reaperte os parafusos da base e do acoplamento da bomba, garantindo fixação firme e sem vibração.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os parafusos de fixação';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a bomba em operação, sinta vibrações e ouça ruídos anormais. Localize a origem (cavitação, mancal, desalinhamento) e registre.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar vibrações e ruídos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Cheque gaxetas e selos mecânicos procurando vazamento na vedação do eixo. Ajuste, lubrifique ou registre a necessidade de troca.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar gaxetas e selos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confira o nível e a aparência do óleo do mancal/conjunto e complete se estiver baixo. Registre óleo escuro ou contaminado.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o nível de óleo';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione o acoplamento entre motor e bomba procurando folga, desgaste do elemento elástico e desalinhamento. Corrija o que encontrar.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o acoplamento';
UPDATE public.pmoc_activity_catalog SET guidance = 'Aplique a graxa especificada nos rolamentos pelos pontos de lubrificação, na quantidade correta, sem exagero.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Lubrificar os rolamentos';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com o motor desenergizado e desconectado, meça a resistência de isolamento com megômetro entre enrolamentos e carcaça. Anote o valor.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a resistência de isolamento do motor';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a bomba em regime, toque/meça a temperatura dos mancais; aquecimento excessivo indica falta de lubrificação ou desgaste. Registre.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o aquecimento dos mancais';
UPDATE public.pmoc_activity_catalog SET guidance = 'Abra e feche totalmente os registros da bomba para evitar travamento e confirme que vedam e operam livremente.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Manobrar os registros';
UPDATE public.pmoc_activity_catalog SET guidance = 'Lixe os pontos de corrosão, aplique antiferrugem e repinte o conjunto da bomba com tinta adequada.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a pintura do conjunto';
UPDATE public.pmoc_activity_catalog SET guidance = 'Com a bomba em regime, leia a pressão de sucção e de recalque nos manômetros e registre os valores; compare com a faixa indicada.' WHERE section = 'bombas_agua' AND component IS NOT DISTINCT FROM NULL AND description = 'Medir as pressões de água';

-- CAIXA DE EXPANSÃO (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Esvazie e limpe o interior da caixa removendo lodo e sedimentos; enxágue antes de reabastecer. Use luvas.' WHERE section = 'caixa_expansao' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a limpeza geral';
UPDATE public.pmoc_activity_catalog SET guidance = 'Manobre os registros da caixa abrindo e fechando e confirme que vedam e operam sem travar nem vazar.' WHERE section = 'caixa_expansao' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar os registros';
UPDATE public.pmoc_activity_catalog SET guidance = 'Acompanhe o nível e confirme que a bóia abre e fecha a entrada de água nos pontos corretos, sem transbordar. Ajuste ou substitua se falhar.' WHERE section = 'caixa_expansao' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a bóia';
UPDATE public.pmoc_activity_catalog SET guidance = 'Inspecione a caixa procurando trincas, vazamentos, corrosão e sujeira. Registre com foto qualquer dano estrutural.' WHERE section = 'caixa_expansao' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar o estado geral';
UPDATE public.pmoc_activity_catalog SET guidance = 'Confirme que a tampa fecha bem e veda contra entrada de sujeira, insetos e luz. Substitua a vedação ressecada ou faltante.' WHERE section = 'caixa_expansao' AND component IS NOT DISTINCT FROM NULL AND description = 'Verificar a vedação da tampa';

-- TRATAMENTO QUÍMICO (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Colete amostra de água em ponto representativo e analise os parâmetros (pH, condutividade, etc.) com kit/laboratório. Registre os resultados.' WHERE section = 'tratamento_quimico' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer coleta e análise';
UPDATE public.pmoc_activity_catalog SET guidance = 'Aplique os produtos de tratamento na bacia conforme a dosagem definida na análise. Use EPI e siga a ficha de segurança do produto.' WHERE section = 'tratamento_quimico' AND component IS NOT DISTINCT FROM NULL AND description = 'Aplicar produtos químicos na bacia';
UPDATE public.pmoc_activity_catalog SET guidance = 'Abra a purga para descartar parte da água e reduzir a concentração de sais/sólidos, conforme o plano de tratamento. Reponha água tratada.' WHERE section = 'tratamento_quimico' AND component IS NOT DISTINCT FROM NULL AND description = 'Fazer a purga de desconcentração';
UPDATE public.pmoc_activity_catalog SET guidance = 'Adicione o produto de tratamento ao circuito de água gelada na dosagem indicada na análise, protegendo a tubulação contra corrosão e incrustação.' WHERE section = 'tratamento_quimico' AND component IS NOT DISTINCT FROM NULL AND description = 'Aplicar tratamento na água gelada';

-- QUALIDADE DO AR (component NULL)
UPDATE public.pmoc_activity_catalog SET guidance = 'Realize a coleta de Qualidade do Ar Interior em pontos representativos com equipamentos calibrados (fungos, CO₂, aerodispersóides, temperatura, umidade e velocidade). Registre cada parâmetro e compare com os valores de referência.' WHERE section = 'qualidade_ar' AND component IS NOT DISTINCT FROM NULL AND description = 'Análise de QAI — fungos, CO₂, aerodispersóides, temperatura, umidade e velocidade';

-- -----------------------------------------------------------------------------
-- Passo 2 — Backfill do plano do contrato via catalog_activity_id
-- -----------------------------------------------------------------------------
UPDATE public.contract_plan_activities cpa
SET guidance = cat.guidance
FROM public.pmoc_activity_catalog cat
WHERE cpa.catalog_activity_id = cat.id
  AND cpa.guidance IS NULL
  AND cat.guidance IS NOT NULL;

-- Planos custom (sem catalog_activity_id): casa por chave composta contra o catálogo.
UPDATE public.contract_plan_activities cpa
SET guidance = cat.guidance
FROM public.pmoc_activity_catalog cat
WHERE cpa.catalog_activity_id IS NULL
  AND cpa.guidance IS NULL
  AND cat.guidance IS NOT NULL
  AND cpa.section = cat.section
  AND cpa.component IS NOT DISTINCT FROM cat.component
  AND cpa.description = cat.description;

-- -----------------------------------------------------------------------------
-- Passo 3 — Backfill dos itens da OS via plan_activity_id
-- -----------------------------------------------------------------------------
UPDATE public.service_order_activities soa
SET guidance = cpa.guidance
FROM public.contract_plan_activities cpa
WHERE soa.plan_activity_id = cpa.id
  AND soa.guidance IS NULL
  AND cpa.guidance IS NOT NULL;

-- Itens de OS sem plan_activity_id: casa por chave composta contra o catálogo.
UPDATE public.service_order_activities soa
SET guidance = cat.guidance
FROM public.pmoc_activity_catalog cat
WHERE soa.plan_activity_id IS NULL
  AND soa.guidance IS NULL
  AND cat.guidance IS NOT NULL
  AND soa.section = cat.section
  AND soa.component IS NOT DISTINCT FROM cat.component
  AND soa.description = cat.description;

-- -----------------------------------------------------------------------------
-- Passo 4 — Verificação: aborta se algum dos 149 ficou sem guidance
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_total   integer;
  v_filled  integer;
  v_null    integer;
  r         record;
BEGIN
  SELECT count(*) INTO v_total  FROM public.pmoc_activity_catalog;
  SELECT count(*) INTO v_filled FROM public.pmoc_activity_catalog WHERE guidance IS NOT NULL;
  SELECT count(*) INTO v_null   FROM public.pmoc_activity_catalog WHERE guidance IS NULL;

  RAISE NOTICE 'pmoc_activity_catalog: total=% com_guidance=% sem_guidance=%', v_total, v_filled, v_null;

  IF v_null > 0 THEN
    FOR r IN
      SELECT section, component, description
      FROM public.pmoc_activity_catalog
      WHERE guidance IS NULL
      ORDER BY section, sort_order
    LOOP
      RAISE WARNING 'SEM guidance: section=% component=% description=%', r.section, COALESCE(r.component,'(NULL)'), r.description;
    END LOOP;
    RAISE EXCEPTION 'Backfill abortado: % atividade(s) do catálogo sem guidance (esperado 0). Verifique divergência de texto no description.', v_null;
  END IF;
END $$;
