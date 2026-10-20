/**
 * Régua única das microanimações do PDV.
 *
 * O movimento principal fica perto de 400 ms: perceptível o bastante para o
 * operador entender onde a linha entrou/saiu, mas abaixo do ponto em que a
 * interface começa a parecer lenta. Opacidade termina antes do deslocamento;
 * o destaque de cor permanece um pouco mais para confirmar a ação.
 */
export const PDV_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const PDV_CART_ITEM_MOTION = {
  layoutDuration: 0.38,
  enterDuration: 0.38,
  exitDuration: 0.32,
  opacityDuration: 0.24,
  scaleDuration: 0.32,
  highlightDuration: 0.72,
  enterOffset: 16,
  exitOffset: 28,
} as const;

export const PDV_HISTORY_ROW_MOTION = {
  layoutDuration: 0.38,
  enterDuration: 0.38,
  opacityDuration: 0.26,
  scaleDuration: 0.34,
  highlightDuration: 0.75,
  enterOffset: 16,
} as const;
