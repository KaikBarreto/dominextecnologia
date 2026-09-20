// src/lib/ponto/kiosk.ts
// -----------------------------------------------------------------------------
// Decisões PURAS da lista do quiosque de ponto em grupo (tablet fixo na
// empresa, /ponto/empresa/:kioskSlug). Sem rede, sem React — só transformação
// de dados, testável isolado.
//
// Contrato congelado da edge `get_kiosk`: cada item de `employees` só tem
// `id`, `name`, `photo_url`, `status` e `absence_label`. NÃO existe `position`
// nem `has_pin` no payload hoje — os tipos abaixo refletem só o que a edge
// manda (nada de campo especulativo).
// -----------------------------------------------------------------------------

export type KioskStatus = "not_started" | "working" | "on_break" | "finished";

export type KioskRecognitionState =
  | "matching"
  | "ambiguous"
  | "not_recognized"
  | "unavailable"
  | null;

/**
 * A configuracao nasce opcional. Quando a empresa exige biometria, busca
 * manual so aparece como contingencia de indisponibilidade tecnica; rosto nao
 * reconhecido ou ambiguo deve repetir a leitura facial.
 */
export function canUseManualKioskSearch(
  faceRequired: boolean,
  recognitionState: KioskRecognitionState,
): boolean {
  return !faceRequired || recognitionState === "unavailable";
}

export interface KioskEmployee {
  id: string;
  name: string;
  photo_url: string | null;
  status: KioskStatus;
  /**
   * Rótulo da ausência lançada pra essa pessoa HOJE ("Férias", "Atestado",
   * "Folga"…) ou null. Vem pronto da edge, já traduzido, o tablet não conhece
   * os tipos crus do banco, só o texto que vai na etiqueta.
   *
   * É AVISO, não trava: quem está de férias continua na grade e continua
   * batendo ponto (quem volta pra cobrir um turno precisa registrar, e sumir
   * da grade viraria ligação pro dono).
   */
  absence_label: string | null;
}

/**
 * Rótulo e cores de cada status. As cores espelham as das ações na tela de
 * batida: entrada=verde, intervalo=âmbar, saída=concluído.
 *
 * São DUAS cores porque o cartão do quiosque mostra o status em dois lugares:
 * `bar` é a faixa cheia que cola a foto na etiqueta (o "LED" do crachá, lido
 * de longe pelo canto do olho) e `text` é o rótulo escrito. Fundo cheio pede
 * tom -500; texto sobre painel escuro pede o tom -400, que tem contraste
 * melhor.
 *
 * `not_started` é o ÚNICO apagado, de propósito: às 7h da manhã ele é o
 * estado do time inteiro, e uma barra cinza cheia em todo cartão virava
 * moldura, a coisa mais chamativa da tela era justamente a que não informa
 * nada. Discreto, a barra colorida passa a significar "alguma coisa já
 * aconteceu com essa pessoa hoje", que é a informação útil de relance.
 *
 * Os RÓTULOS não moram aqui (vêm de i18n, `t.kiosk.status`, já que a copy
 * precisa ser traduzida nos 4 idiomas) — só as cores, que são fixas.
 */
export const KIOSK_STATUS: Record<KioskStatus, { bar: string; text: string }> = {
  // `bg-white/[0.12]` entre colchetes, não `bg-white/12`: 12 não existe na
  // escala de opacidade do Tailwind (vai de 5 em 5 a partir do 10), e a
  // classe simplesmente não é gerada, a barra sai TRANSPARENTE.
  not_started: { bar: "bg-white/[0.12]", text: "text-white/55" },
  working: { bar: "bg-emerald-500", text: "text-emerald-400" },
  on_break: { bar: "bg-amber-500", text: "text-amber-400" },
  finished: { bar: "bg-sky-500", text: "text-sky-400" },
};

/**
 * Iniciais do avatar: primeiro + último nome ("Marcos Aurélio Ferreira" →
 * "MF").
 *
 * Numa lista de nomes completos no tablet, a inicial do SOBRENOME é o que
 * separa dois "Marcos", por isso primeiro+último, e não as duas primeiras
 * palavras.
 *
 * Nome vazio devolve "?" (nunca círculo em branco).
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Normaliza pra busca: minúsculas e sem acento. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Filtra por nome, ignorando acento e caixa. Busca vazia = tudo. */
export function filterKioskEmployees<T extends { name: string }>(
  employees: readonly T[],
  search: string,
): T[] {
  const term = normalize(search.trim());
  if (!term) return [...employees];
  return employees.filter((e) => normalize(e.name).includes(term));
}

// ─── Ordenação ───────────────────────────────────────────────────────────────

export type KioskSort = "name" | "pending";

/**
 * Ordem de urgência do modo "pending". Às 8h da manhã, quem interessa é quem
 * AINDA NÃO bateu, esse vai pro topo. Depois quem está fora do posto (em
 * intervalo), depois quem já está trabalhando, e por último quem encerrou a
 * jornada e não tem mais nada a fazer no tablet hoje.
 */
const PENDING_RANK: Record<KioskStatus, number> = {
  not_started: 0,
  on_break: 1,
  working: 2,
  finished: 3,
};

/**
 * Ausência de hoje é o PRIMEIRO critério do modo "pending", antes do status.
 *
 * Sem isso, quem está de férias entra como `not_started`, o topo da lista, e
 * o crachá mais destacado do tablet às 8h da manhã seria justamente o de
 * quem não era pra estar lá. Quem tem férias/atestado/folga hoje vai pro
 * fim: dá pra achar e bater (o quiosque não bloqueia ninguém), só não disputa
 * a atenção com quem realmente falta bater.
 *
 * Dentro do grupo dos ausentes o status continua valendo como desempate, se
 * a pessoa de férias veio cobrir turno e bateu entrada, ela se ordena entre
 * os ausentes pela mesma régua.
 */
function pendingRankOf(e: { status: KioskStatus; absence_label?: string | null }): [number, number] {
  return [e.absence_label ? 1 : 0, PENDING_RANK[e.status]];
}

/**
 * Ordena a lista do quiosque. NÃO muta a entrada (devolve cópia), a lista vem
 * do estado do hook e ordenar no lugar embaralharia o cache entre renders.
 *
 * Comparação de nome sempre por `localeCompare` pt-BR: em comparação binária
 * "Antônia" cairia depois de "Bruno" (Ô = U+00D4), e num time brasileiro
 * metade da lista tem acento.
 */
export function sortKioskEmployees<
  T extends { name: string; status: KioskStatus; absence_label?: string | null },
>(employees: readonly T[], mode: KioskSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pt-BR");
  return [...employees].sort((a, b) => {
    if (mode === "pending") {
      const [absentA, statusA] = pendingRankOf(a);
      const [absentB, statusB] = pendingRankOf(b);
      if (absentA !== absentB) return absentA - absentB;
      if (statusA !== statusB) return statusA - statusB;
    }
    return byName(a, b);
  });
}

// ─── Cor do crachá sem foto ──────────────────────────────────────────────────

export interface KioskTileColor {
  /** Topo do degradê do quadrado. */
  from: string;
  /** Base do degradê, sempre mais escuro que `from`. */
  to: string;
}

/**
 * Paleta dos quadrados sem foto. Tons ESCUROS e saturados o bastante pra se
 * diferenciarem de longe: ardósia/azul-petróleo, verde-musgo, terracota
 * queimado, aço, ameixa e oliva. Nada de pastel, nada de neon, o crachá tem
 * que parecer chapa pintada, não etiqueta de papelaria.
 *
 * Curta de propósito (6): mais cores do que isso deixam de ser reconhecíveis
 * ("a azulzinha" só funciona se houver uma azul só) e começam a repetir tom.
 */
export const KIOSK_TILE_COLORS: readonly KioskTileColor[] = [
  { from: "#1e3a44", to: "#12242b" }, // azul-petróleo
  { from: "#2c3b21", to: "#1a2413" }, // verde-musgo
  { from: "#4a2a1d", to: "#2c1811" }, // terracota queimado
  { from: "#343b44", to: "#1f252b" }, // aço
  { from: "#3a2440", to: "#221527" }, // ameixa escuro
  { from: "#3e3a1d", to: "#262311" }, // oliva
];

/**
 * Cor do quadrado de quem não tem foto, determinística a partir do ID.
 *
 * A maioria das empresas começa SEM foto nenhuma cadastrada, então esse é o
 * crachá que elas veem todo dia: sem cor própria, o quadrado lê como caixa
 * vazia e ninguém se acha na grade. Com cor, a pessoa localiza a si mesma
 * pela COR + POSIÇÃO, de longe, mesmo sem foto.
 *
 * O hash sai do `id`, NUNCA do nome: corrigir a grafia de um nome ("Antonia"
 * → "Antônia") trocaria a cor do crachá de alguém que já decorou a própria, e
 * dois homônimos continuam distinguíveis.
 *
 * FNV-1a de 32 bits, barato, sem dependência, e mistura bem o suficiente pra
 * que dois UUIDs vizinhos (que diferem num caractere só) não caiam na mesma
 * cor.
 */
export function tileColorFor(id: string): KioskTileColor {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return KIOSK_TILE_COLORS[(hash >>> 0) % KIOSK_TILE_COLORS.length];
}
