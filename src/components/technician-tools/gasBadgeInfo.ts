/**
 * Explicações curtas em PT-BR dos badges de tipo de gás (HFC, HCFC, CFC, HFO,
 * HC, Blend/Mistura, Natural, azeótropo/zeótropo) e classes de segurança ASHRAE
 * (A1, A2L, A2, A3, B1...). Usado nos badges do detalhe e do card do gás.
 *
 * O casamento é por PREFIXO/CONTAINS case-insensitive: "HFC-32" casa "HFC",
 * "Blend zeotrópico" casa "Blend". As classes de segurança são casadas de forma
 * exata (token), com prioridade pras mais específicas (A2L antes de A2).
 */

/** Normaliza pra comparação: maiúsculo, sem acento, sem espaços nas bordas. */
function norm(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Regras de tipo de gás, na ordem de checagem. A 1ª que casar (por `includes`)
 * vence. Ordem importa: termos mais específicos primeiro (HCFC antes de CFC,
 * HFO antes de HFC, AZEOTROPO/ZEOTROPO antes de BLEND).
 */
const TIPO_REGRAS: { match: string[]; explicacao: string }[] = [
  {
    match: ['HCFC'],
    explicacao:
      'Hidroclorofluorcarboneto: contém cloro, agride pouco o ozônio. Em eliminação pelo Protocolo de Montreal (ex.: R-22).',
  },
  {
    match: ['HFO'],
    explicacao:
      'Hidrofluorolefina: 4ª geração, efeito estufa baixíssimo, levemente inflamável (A2L). Ex.: R-1234yf.',
  },
  {
    match: ['HFC'],
    explicacao:
      'Hidrofluorcarboneto: não agride a camada de ozônio (ODP zero), mas tem efeito estufa (GWP). Geração atual, em redução gradual.',
  },
  {
    match: ['CFC'],
    explicacao:
      'Clorofluorcarboneto: contém cloro, agride muito a camada de ozônio. Proibido (ex.: R-12).',
  },
  {
    match: ['AZEOTROP'],
    explicacao: 'Mistura que se comporta como um gás puro (sem glide).',
  },
  {
    match: ['ZEOTROP'],
    explicacao: 'Mistura com glide; carregar pela fase líquida.',
  },
  {
    match: ['BLEND', 'MISTURA'],
    explicacao:
      'Mistura de dois ou mais gases (séries 400/500). Pode ter glide: variação de temperatura na mudança de fase — carregar pela fase líquida.',
  },
  {
    match: ['NATURAL'],
    explicacao:
      'Refrigerante natural (hidrocarbonetos, CO₂, amônia): baixo impacto ambiental.',
  },
  {
    // HC por último: token curto, só casa quando isolado (evita falso positivo
    // dentro de outras palavras).
    match: ['HC'],
    explicacao:
      'Hidrocarboneto: refrigerante natural (propano, isobutano). Efeito estufa baixíssimo, porém inflamável.',
  },
];

/** Classes de segurança ASHRAE — casamento exato por token (mais específica primeiro). */
const CLASSE_REGRAS: { match: string; explicacao: string }[] = [
  { match: 'A2L', explicacao: 'Classe A2L: baixa toxicidade, levemente inflamável.' },
  { match: 'A1', explicacao: 'Classe de segurança A1: baixa toxicidade e NÃO inflamável.' },
  { match: 'A2', explicacao: 'Classe A2: baixa toxicidade, inflamável.' },
  {
    match: 'A3',
    explicacao: 'Classe A3: baixa toxicidade, altamente inflamável (ex.: propano).',
  },
  { match: 'B1', explicacao: 'Classe B1: maior toxicidade, não inflamável.' },
];

/**
 * Devolve a explicação do badge (tipo OU classe de segurança), ou `null` se não
 * houver no mapa — nesse caso o badge fica sem tooltip, sem quebrar o layout.
 *
 * Tenta primeiro classe de segurança (token exato A2L/A1/...), depois tipo de
 * gás (contains). Para um badge que não casa nenhum, retorna null.
 */
export function explicacaoBadge(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = norm(texto);
  if (!t) return null;

  // Classe de segurança: A2L antes de A2 (já ordenado nas regras).
  for (const r of CLASSE_REGRAS) {
    if (t.includes(r.match) && classeCasaToken(t, r.match)) return r.explicacao;
  }

  // Tipo de gás (HFC, HCFC, ...).
  for (const r of TIPO_REGRAS) {
    for (const m of r.match) {
      if (m === 'HC') {
        // HC só casa como token isolado (palavra), pra não casar dentro de outras.
        if (/\bHC\b/.test(t)) return r.explicacao;
      } else if (t.includes(m)) {
        return r.explicacao;
      }
    }
  }

  return null;
}

/**
 * Garante que o token de classe (A2L/A1/...) casa de fato a classe e não um
 * pedaço maior. Ex.: pra "A2" não casar dentro de "A2L". Como as regras já vêm
 * com A2L antes de A2, a 1ª regra exata pega; aqui evitamos que "A2" responda
 * quando o texto é "A2L".
 */
function classeCasaToken(texto: string, token: string): boolean {
  if (token === 'A2' && /A2L/.test(texto)) return false;
  return true;
}
