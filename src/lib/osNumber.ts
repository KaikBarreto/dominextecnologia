/**
 * Formatação do número da Ordem de Serviço (`service_orders.order_number`)
 * pra exibição na UI.
 *
 * Até aqui o frontend React preenchia o número com zeros à esquerda
 * (`OS #000123`), diferente do resto do sistema — as edge functions
 * (`supabase/functions/os-share`) e os PDFs de PMOC
 * (`cronograma-tabela.ts`) sempre imprimiram o número cru (`OS #123`). O
 * zero à esquerda não carrega informação nenhuma pro usuário (não é um
 * código fiscal, não tem tamanho fixo contratual) e só passa impressão de
 * "código de sistema". Decisão do CEO: remover em todo o frontend pra
 * alinhar com o que o backend já faz.
 *
 * `order_number` é `NOT NULL` na tabela, mas chega como
 * `number | string | null | undefined` em algumas telas (campo espelhado
 * em movimentação de estoque quando a OS de origem não existe mais, OS de
 * tarefa sem número, payload de RPC pública etc.) — por isso os helpers
 * aceitam os formatos e tratam ausência de forma explícita, em vez de
 * deixar `NaN`/`undefined` vazar pra tela.
 */

/**
 * Extrai só os dígitos do número da OS, sem zero à esquerda. `null` se o
 * valor estiver ausente ou não for um número válido.
 */
function rawOSDigits(orderNumber: number | string | null | undefined): string | null {
  if (orderNumber === null || orderNumber === undefined || orderNumber === '') return null;
  const n = typeof orderNumber === 'number' ? orderNumber : Number(orderNumber);
  if (!Number.isFinite(n)) return null;
  return String(Math.trunc(n));
}

/**
 * Formato padrão de exibição do número da OS: `#123` (sem zero à
 * esquerda). Número ausente vira `'—'` — mesmo símbolo que o resto do app
 * usa pra "sem dado" — em vez de um `#` solto ou `#undefined`.
 *
 * Uso típico: onde o `#` era digitado solto no JSX/template antes deste
 * sweep (ex. `#{String(os.order_number)...}`), ele sai do literal e passa
 * a vir pronto do helper: `{formatOSNumber(os.order_number)}`.
 */
export function formatOSNumber(orderNumber: number | string | null | undefined): string {
  const digits = rawOSDigits(orderNumber);
  return digits !== null ? `#${digits}` : '—';
}

/**
 * Só os dígitos do número da OS, sem `#` e sem zero à esquerda. Número
 * ausente vira `'—'`.
 *
 * Uso típico: quando o `#` (ou outro separador) já é montado por quem
 * chama — ex. `tv.osPrefix` já vem `'OS #'` pronto do i18n
 * (`ServiceOrderViewDialog.tsx`), ou um código composto tipo
 * `OS-2026-123` (`getOsCode` em `ServiceOrders.tsx`), que não leva `#`.
 */
export function formatOSNumberDigits(orderNumber: number | string | null | undefined): string {
  return rawOSDigits(orderNumber) ?? '—';
}
