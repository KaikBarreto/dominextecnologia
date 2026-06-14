/**
 * Glossário de elétrica e instalação — termos aprendidos na ferramenta de
 * Cabo Elétrico (bitola, disjuntor, queda de tensão etc.).
 *
 * 100% estático/offline. PT-BR, linguagem direta pro técnico de campo.
 * Mesma forma de `TermoGlossario`; `exemplo` é opcional (alguns termos
 * normativos não precisam).
 */

export interface TermoEletrica {
  /** Identificador estável (usado como value do AccordionItem). */
  id: string;
  /** Nome do termo + abreviação/unidade entre parênteses. */
  termo: string;
  /** Explicação clara do que é. */
  descricao: string;
  /** Exemplo prático de campo (opcional). */
  exemplo?: string;
}

export const GLOSSARIO_ELETRICA: TermoEletrica[] = [
  {
    id: 'bitola',
    termo: 'Bitola do cabo (mm²)',
    descricao:
      'Seção (espessura) do fio de cobre. Quanto maior o mm², mais corrente o cabo conduz e menor a queda de tensão. Para ar-condicionado depende da corrente do aparelho e da distância até o quadro.',
    exemplo:
      'Um 12.000 BTU a 40 m costuma pedir 6 mm² em 220V ou 10 mm² em 110V.',
  },
  {
    id: 'disjuntor',
    termo: 'Disjuntor (curva C)',
    descricao:
      'Dispositivo que protege o circuito contra sobrecarga e curto-circuito. A curva C tolera o pico de partida do compressor sem desarmar. O número (ex.: C16) é a corrente nominal em amperes.',
    exemplo: 'C16 = desarma acima de ~16 A de forma sustentada.',
  },
  {
    id: 'monopolar-bipolar',
    termo: 'Monopolar e Bipolar',
    descricao:
      'Número de polos do disjuntor. 110V (1 fase) usa monopolar; 220V (2 fases) usa bipolar, que desliga as duas fases juntas — exigência da NBR 5410. Não substitua um bipolar por dois monopolares.',
  },
  {
    id: 'queda-tensao',
    termo: 'Queda de tensão',
    descricao:
      'Perda de tensão ao longo do cabo; cresce com a distância e a corrente. A NBR 5410 limita (até 4% em circuito terminal). Distância grande exige cabo mais grosso pra compensar.',
    exemplo: 'Por isso 40 m de distância já puxa a bitola pra cima.',
  },
  {
    id: 'ampacidade',
    termo: 'Ampacidade',
    descricao:
      'Corrente máxima que um cabo conduz com segurança sem superaquecer, conforme a bitola e o método de instalação (eletroduto, embutido etc.), pela NBR 5410.',
  },
  {
    id: 'corrente-projeto',
    termo: 'Corrente de projeto',
    descricao:
      'Corrente usada para dimensionar o circuito: a corrente nominal do equipamento multiplicada por um fator de segurança (1,25). É com ela que se escolhe o disjuntor e o cabo.',
  },
  {
    id: 'nbr-5410',
    termo: 'NBR 5410',
    descricao:
      'Norma brasileira de instalações elétricas de baixa tensão. É a base para escolher cabo, disjuntor e limites de queda de tensão — inclusive nesta ferramenta. Sempre confirme com a etiqueta do equipamento e um eletricista.',
  },
];
