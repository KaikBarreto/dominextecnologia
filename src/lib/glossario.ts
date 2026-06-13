/**
 * Glossário de termos técnicos usados na tela "Ferramentas do Técnico".
 * 100% estático/offline. PT-BR, linguagem direta pro técnico de campo.
 *
 * Renderizado em accordion pela aba "Início" (Inicio.tsx). Cada item tem
 * o termo (com abreviação/unidade), uma explicação curta e um exemplo prático.
 */

export interface TermoGlossario {
  /** Identificador estável (usado como value do AccordionItem). */
  id: string;
  /** Nome do termo + abreviação/unidade entre parênteses. */
  termo: string;
  /** Explicação clara do que é. */
  descricao: string;
  /** Exemplo prático de campo. */
  exemplo: string;
}

export const GLOSSARIO: TermoGlossario[] = [
  {
    id: 'btu',
    termo: 'BTU / BTU/h',
    descricao:
      'Unidade que mede a capacidade de refrigeração de um aparelho — quanto calor ele consegue remover do ambiente. Quanto maior o BTU, mais o ar-condicionado "gela". O "/h" indica por hora.',
    exemplo: 'Um quarto pequeno geralmente pede um aparelho de ~9.000 BTUs.',
  },
  {
    id: 'carga-termica',
    termo: 'Carga térmica',
    descricao:
      'É a quantidade de calor que precisa ser retirada de um ambiente para mantê-lo frio. Depende do tamanho do espaço, quantas pessoas circulam, equipamentos ligados, janelas e sol. Serve para escolher o aparelho certo.',
    exemplo:
      'Uma sala de 20 m² com 3 pessoas e um computador pode precisar de ~12.000 BTUs.',
  },
  {
    id: 'capacitor',
    termo: 'Capacitor (µF — microfarad)',
    descricao:
      'Componente que armazena energia e ajuda o motor (compressor ou ventilador) a dar a partida e a girar. Sua capacidade é medida em microfarad (µF). Capacitor errado ou estufado faz o aparelho não ligar ou desarmar.',
    exemplo: 'Um compressor de 18.000 BTUs costuma usar um capacitor de ~40 µF.',
  },
  {
    id: 'tensao-capacitor',
    termo: 'Tensão do capacitor (380v / 440v)',
    descricao:
      'É a tensão de isolamento que o capacitor suporta, NÃO a tensão da tomada. Um capacitor 440v pode ser usado no lugar de um 380v, mas nunca o contrário. Sempre use igual ou maior que o original.',
    exemplo:
      'Se o capacitor original é 440v, troque por outro 440v — não use um 380v.',
  },
  {
    id: 'amper',
    termo: 'Amper (A)',
    descricao:
      'Mede a corrente elétrica, ou seja, o quanto de energia está "passando" pelo fio naquele momento. Corrente acima do normal indica motor forçando, problema mecânico ou tensão errada.',
    exemplo: '1.844 W ÷ 220 V = 8,38 A de corrente.',
  },
  {
    id: 'watt',
    termo: 'Watt (W) / Quilowatt (kW)',
    descricao:
      'Mede a potência elétrica — quanta energia o aparelho consome ou produz. 1 kW (quilowatt) = 1.000 W. É o que aparece na conta de luz.',
    exemplo: 'Um split de 12.000 BTUs consome em torno de 1.100 W (1,1 kW).',
  },
  {
    id: 'hp',
    termo: 'HP (Horse Power / cv)',
    descricao:
      'Unidade de potência de motores, também chamada de "cavalo" (cv). Em energia, 1 HP ≈ 2.544 BTU/h. Na prática comercial da refrigeração, costuma-se associar 1 HP a cerca de 9.000 BTUs de capacidade.',
    exemplo: 'Um compressor de 1 HP equivale, na prática, a ~9.000 BTUs.',
  },
  {
    id: 'tr',
    termo: 'TR (Tonelada de Refrigeração)',
    descricao:
      'Unidade usada em aparelhos maiores (chillers, centrais). 1 TR = 12.000 BTU/h. Quanto mais TR, maior a capacidade de resfriamento.',
    exemplo: 'Uma central de 5 TR equivale a 60.000 BTU/h.',
  },
  {
    id: 'pressao',
    termo: 'Pressão (bar, psi, kPa, atm, mca)',
    descricao:
      'A pressão do gás no sistema é medida em várias unidades. As mais comuns no manômetro são bar e psi. 1 bar ≈ 14,5 psi ≈ 100 kPa ≈ 0,99 atm. Pressão fora do padrão indica falta ou excesso de gás.',
    exemplo: 'Uma leitura de 4 bar no manômetro equivale a cerca de 58 psi.',
  },
  {
    id: 'temperatura',
    termo: 'Temperatura (°C, °F, K)',
    descricao:
      'Celsius (°C) é o padrão no Brasil; Fahrenheit (°F) aparece em equipamentos importados; Kelvin (K) é usado em cálculos técnicos. Referência: 0 °C = 32 °F = 273,15 K.',
    exemplo: 'Uma temperatura de 25 °C corresponde a 77 °F.',
  },
  {
    id: 'comprimento',
    termo: 'Comprimento (mm, cm, m, pol, ft)',
    descricao:
      'Medidas de distância e bitola de tubos. Polegada (pol) e pé (ft) aparecem em tubulações e conexões importadas. Referência: 1 pol = 25,4 mm e 1 ft = 30,48 cm.',
    exemplo: 'Um tubo de 1/2 pol tem 12,7 mm de diâmetro.',
  },
  {
    id: 'pe-direito',
    termo: 'Pé-direito',
    descricao:
      'É a altura do chão até o teto do ambiente. Tetos altos (acima de 3 m) aumentam o volume de ar a resfriar e, por isso, pesam no cálculo da carga térmica.',
    exemplo:
      'Um salão com pé-direito de 4 m precisa de mais BTUs que outro de mesma área com 2,7 m.',
  },
  {
    id: 'evaporadora-condensadora',
    termo: 'Evaporadora / Condensadora',
    descricao:
      'O split tem duas unidades: a evaporadora é a parte interna (sopra o ar frio no ambiente) e a condensadora é a parte externa (dissipa o calor pra fora). Os códigos de erro costumam indicar em qual delas está o problema.',
    exemplo:
      'Um erro na placa da condensadora aponta falha na unidade externa, não na interna.',
  },
  {
    id: 'codigo-erro',
    termo: 'Código de erro',
    descricao:
      'Sequência de letras/números que o aparelho mostra no display ou pisca no LED quando detecta uma falha. Cada fabricante tem sua tabela. Serve pra identificar rápido a causa antes de abrir o equipamento.',
    exemplo:
      'O código "E1" em muitas marcas indica problema no sensor de temperatura ambiente.',
  },
];
