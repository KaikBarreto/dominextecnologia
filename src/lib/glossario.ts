/**
 * Glossário de termos técnicos usados na tela "Área do Técnico™".
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
    termo: "BTU / BTU/h",
    descricao: "BTU mede energia térmica; BTU/h mede a capacidade de retirar ou fornecer calor por hora. A capacidade de refrigeração não é o consumo elétrico.",
    exemplo: "Um aparelho de 9.000 BTU/h pode retirar essa quantidade de calor por hora nas condições especificadas pelo fabricante.",
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
    termo: "Capacitor (µF — microfarad)",
    descricao: "Componente que armazena energia elétrica. Capacitores de partida e permanentes têm funções diferentes. A capacitância, a tolerância, a tensão e o tipo devem seguir a especificação do motor.",
    exemplo: "Se o manual pede 35 µF ±5%, use essa especificação. Os BTU/h do aparelho não determinam o capacitor.",
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
    termo: "Ampere (A)",
    descricao: "Mede a corrente elétrica, o fluxo de carga elétrica no circuito. Compare a medição com a placa e as condições de operação do equipamento.",
    exemplo: "Em uma carga resistiva ideal, 1.844 W ÷ 220 V ≈ 8,38 A. Para motores, o fator de potência também importa.",
  },
  {
    id: 'watt',
    termo: "Watt (W) / Quilowatt (kW)",
    descricao: "W e kW medem potência. A energia consumida ao longo do tempo é medida em kWh, unidade usada na conta de luz. Potência elétrica consumida e capacidade térmica são grandezas diferentes.",
    exemplo: "Uma carga constante de 1.000 W ligada por 2 horas consome 2 kWh.",
  },
  {
    id: 'hp',
    termo: 'HP (potência mecânica)',
    descricao:
      '1 HP mecânico equivale a aproximadamente 745,7 W ou 2.544,43 BTU/h; cv é outra unidade (cerca de 735,5 W). O HP comercial de ar-condicionado é uma referência aproximada de capacidade, diferente da potência mecânica e do consumo elétrico.',
    exemplo: 'Alguns aparelhos da classe comercial de 1 HP entregam cerca de 9.000 BTU/h. Confira a capacidade real na ficha do modelo.',
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
    termo: "Pressão (bar, psi, kPa, atm, mca)",
    descricao: "bar e psi são comuns no manômetro: 1 bar ≈ 14,5 psi = 100 kPa. A unidade não informa se a leitura é relativa à atmosfera ou absoluta. Pressão isolada não determina a carga de refrigerante.",
    exemplo: "4 bar ≈ 58 psi. Analise também temperatura, operação e manual do equipamento.",
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
