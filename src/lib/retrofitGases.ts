/**
 * Tabela de REFERÊNCIA de retrofit / troca de gás refrigerante.
 *
 * Não é um conversor numérico — é um guia consultivo, curado e estático, para o
 * técnico de campo decidir por qual gás substituir um refrigerante saindo de
 * linha (ex.: R-22) ou em phase-down (ex.: R-404A).
 *
 * ⚠️ DISTINÇÃO CRÍTICA (risco de campo):
 * - "drop-in" / retrofit = troca de gás no MESMO equipamento (compressor,
 *   trocadores e tubulação originais), normalmente exigindo só troca de óleo.
 * - "equipamento novo" = o gás trabalha em pressões/projeto incompatíveis com a
 *   máquina antiga; só pode ser usado em equipamento PROJETADO para ele.
 *
 * Os valores são CONSERVADORES. Quando não há número firme, o comportamento é
 * descrito qualitativamente em vez de cravar um valor. Sempre seguir a ficha
 * técnica do fabricante do gás e do compressor.
 *
 * 100% client-side / offline — apenas dados estáticos.
 */

/** Natureza da substituição — separa retrofit real de "equipamento novo". */
export type TipoSubstituicao = 'drop-in' | 'equipamento-novo';

/**
 * Nível de inflamabilidade do gás substituto (espelha a régua de refrigerantes).
 * - 'leve' = levemente inflamável (ASHRAE A2L, ex.: R-32) → fogo âmbar.
 * - 'alta' = altamente inflamável (ASHRAE A3, ex.: R-290) → fogo vermelho.
 */
export type NivelInflamavelRetrofit = 'leve' | 'alta';

/** Uma opção de substituição para um gás de saída. */
export interface OpcaoRetrofit {
  /** id do gás novo no catálogo de REFRIGERANTES (quando existir), p/ cor. */
  refrigeranteId?: string;
  /** Nome exibido do gás novo. */
  gasNovo: string;
  /** Cor do cilindro (hex). Espelha REFRIGERANTES quando o gás está lá. */
  cor: string;
  /** drop-in (retrofit no mesmo equipamento) vs equipamento novo/projetado. */
  tipo: TipoSubstituicao;
  /** Frase curta que classifica o tipo (exibida como selo). */
  tipoLabel: string;
  /** Óleo: o que o gás novo exige (ex.: "Mineral → POE"). */
  oleo: string;
  /** Comportamento de pressão frente ao gás de saída (qualitativo). */
  pressao: string;
  /** Cuidados de campo — bullets curtos, PT-BR. */
  cuidados: string[];
  /**
   * Nível de inflamabilidade do gás novo, quando aplicável (gera o ícone de
   * chama: âmbar p/ 'leve' A2L, vermelho p/ 'alta' A3). Ausente = não inflamável.
   */
  inflamavel?: NivelInflamavelRetrofit;
}

/** Um gás de saída e suas opções de substituição. */
export interface GasSaida {
  /** id no catálogo de REFRIGERANTES, p/ cor. */
  refrigeranteId: string;
  /** Nome do gás que está saindo. */
  nome: string;
  /** Cor do cilindro (hex). */
  cor: string;
  /** Contexto de uso típico (residencial, comercial leve, etc.). */
  contexto: string;
  /** Opções de substituição (drop-in primeiro, equipamento novo depois). */
  opcoes: OpcaoRetrofit[];
}

export const RETROFIT_GASES: GasSaida[] = [
  {
    refrigeranteId: 'R-22',
    nome: 'R-22',
    cor: '#7AC74F',
    contexto: 'Residencial e comercial leve (splits, condensadoras antigas)',
    opcoes: [
      {
        refrigeranteId: 'R-407C',
        gasNovo: 'R-407C',
        cor: '#8B5E3C',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Mineral → POE (troca obrigatória)',
        pressao: 'Pressões próximas às do R-22; capacidade um pouco menor.',
        cuidados: [
          'Tem glide: SEMPRE carregar pela fase líquida do cilindro.',
          'Trocar o óleo mineral por POE — gás novo não circula bem com óleo antigo.',
          'Recolher e pesar a carga; não topar carga pela pressão.',
          'Trocar filtro secador.',
        ],
      },
      {
        refrigeranteId: 'R-422D',
        gasNovo: 'R-422D',
        cor: '#A0522D',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Tolera óleo mineral existente (verificar ficha do gás)',
        pressao: 'Pressões próximas às do R-22; leve perda de capacidade.',
        cuidados: [
          'Tem glide: carregar pela fase líquida.',
          'Pensado para minimizar troca de óleo — confirmar compatibilidade na ficha.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
        ],
      },
      {
        refrigeranteId: 'R-438A',
        gasNovo: 'R-438A (MO99)',
        cor: '#B5651D',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Tolera óleo mineral existente (substituto direto do R-22)',
        pressao: 'Comportamento e pressões próximos aos do R-22.',
        cuidados: [
          'Tem glide: carregar pela fase líquida.',
          'Substituto pensado para minimizar intervenção no óleo — seguir ficha.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
        ],
      },
    ],
  },
  {
    refrigeranteId: 'R-404A',
    nome: 'R-404A',
    cor: '#F97316',
    contexto: 'Refrigeração comercial (câmaras, balcões, baixa e média temperatura)',
    opcoes: [
      {
        refrigeranteId: 'R-407A',
        gasNovo: 'R-407A',
        cor: '#6B8E23',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'POE (mesma família do R-404A; confirmar na ficha)',
        pressao: 'Pressões próximas às do R-404A; menor temperatura de descarga.',
        cuidados: [
          'Tem glide: carregar SEMPRE pela fase líquida.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Verificar óleo POE existente e trocar filtro secador.',
          'Reavaliar superaquecimento/subresfriamento após a troca.',
        ],
      },
      {
        refrigeranteId: 'R-448A',
        gasNovo: 'R-448A',
        cor: '#4F7942',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'POE (confirmar compatibilidade na ficha do gás)',
        pressao: 'Pressões próximas às do R-404A; melhor eficiência, menor GWP.',
        cuidados: [
          'Tem glide (maior que o do R-404A): carregar pela fase líquida.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador e conferir óleo POE.',
          'Reavaliar regulagem da válvula de expansão.',
        ],
      },
      {
        refrigeranteId: 'R-449A',
        gasNovo: 'R-449A',
        cor: '#558B2F',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'POE (confirmar compatibilidade na ficha do gás)',
        pressao: 'Pressões próximas às do R-404A; substituto de menor GWP.',
        cuidados: [
          'Tem glide: carregar pela fase líquida.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador e conferir óleo POE.',
          'Reavaliar superaquecimento/subresfriamento após a troca.',
        ],
      },
    ],
  },
  {
    refrigeranteId: 'R-12',
    nome: 'R-12',
    cor: '#CFD4DA',
    contexto: 'Refrigeração antiga: geladeiras, balcões, automotivo legado (CFC fora de produção)',
    opcoes: [
      {
        refrigeranteId: 'R-134a',
        gasNovo: 'R-134a',
        cor: '#56B4E9',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Mineral → POE (troca obrigatória)',
        pressao: 'Pressões próximas/levemente menores que o R-12; capacidade similar.',
        cuidados: [
          'Trocar o óleo mineral por POE — gás novo não circula bem com óleo antigo.',
          'Recolher e pesar a carga; não topar carga pela pressão.',
          'Trocar filtro secador.',
        ],
      },
      {
        gasNovo: 'R-401A (MP39)',
        cor: '#B5651D',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Alquilbenzeno (tolera resíduo mineral)',
        pressao: 'Comportamento próximo ao do R-12.',
        cuidados: [
          'Tem glide leve: carregar pela fase líquida do cilindro.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
        ],
      },
      {
        gasNovo: 'R-409A (FX56)',
        cor: '#A0522D',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Tolera óleo mineral existente (confirmar ficha)',
        pressao: 'Pressões próximas às do R-12.',
        cuidados: [
          'Tem glide: carregar pela fase líquida.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
        ],
      },
    ],
  },
  {
    refrigeranteId: 'R-502',
    nome: 'R-502',
    cor: '#B19CD9',
    contexto: 'Refrigeração comercial de baixa temperatura legada (azeótropo CFC, fora de produção)',
    opcoes: [
      {
        refrigeranteId: 'R-404A',
        gasNovo: 'R-404A',
        cor: '#F97316',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'POE (confirmar compatibilidade)',
        pressao: 'Substituto clássico do R-502; pressões e capacidade próximas.',
        cuidados: [
          'Tem glide leve: carregar pela fase líquida do cilindro.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
          'Reavaliar superaquecimento/subresfriamento após a troca.',
        ],
      },
      {
        gasNovo: 'R-402A (HP80)',
        cor: '#A0522D',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'POE/alquilbenzeno (confirmar ficha)',
        pressao: 'Pressões próximas às do R-502.',
        cuidados: [
          'Tem glide: carregar pela fase líquida.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
        ],
      },
      {
        gasNovo: 'R-408A (FX10)',
        cor: '#B5651D',
        tipo: 'drop-in',
        tipoLabel: 'Drop-in (retrofit no mesmo equipamento)',
        oleo: 'Tolera óleo mineral/alquilbenzeno (confirmar ficha)',
        pressao: 'Comportamento próximo ao do R-502.',
        cuidados: [
          'Tem glide: carregar pela fase líquida.',
          'Recolher e pesar a carga; não topar pela pressão.',
          'Trocar filtro secador.',
        ],
      },
    ],
  },
];
