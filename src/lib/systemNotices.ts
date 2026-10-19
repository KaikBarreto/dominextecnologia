/**
 * Avisos do sistema — lógica PURA de direcionamento e visibilidade.
 *
 * Isto aqui é a 2ª camada. A fronteira de segurança é a RLS de `admin_notices`
 * (policy `admin_notices_select_tenant`), que já recorta por empresa/usuário no
 * banco. Esta função ESPELHA essa policy no cliente para:
 *   - não depender de uma única camada (se alguém afrouxar a policy, o front
 *     ainda não mostra aviso de outro tenant);
 *   - resolver o que a RLS não sabe: dispensa por usuário e `scope` da tela.
 *
 * REGRA-LEI: aviso direcionado a UMA empresa não pode aparecer para ninguém
 * mais. Qualquer alteração aqui tem que manter os testes de vazamento verdes.
 */

export type NoticeVariant = 'info' | 'warning' | 'success' | 'destructive' | 'neutral';
export type NoticeScope = 'dashboard' | 'global';
export type NoticeAudience = 'all' | 'specific_companies' | 'specific_users';

/** Linha de `public.admin_notices`. */
export interface SystemNotice {
  id: string;
  title: string;
  message: string;
  variant: NoticeVariant;
  scope: NoticeScope;
  is_dismissible: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_audience: NoticeAudience;
  target_ids: string[] | null;
  action_label: string | null;
  action_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Linha de `public.admin_notice_dismissals` (sempre do próprio usuário). */
export interface NoticeDismissal {
  notice_id: string;
  dismissed_at: string;
}

export interface NoticeViewerContext {
  /** `auth.uid()` do usuário logado. */
  userId: string | null;
  /** Empresa do usuário (`profiles.company_id`). Null enquanto carrega. */
  companyId: string | null;
  /** Tela onde a faixa vai aparecer. */
  scope: NoticeScope;
  /** Dispensas do próprio usuário. */
  dismissals: NoticeDismissal[];
  /** Momento de referência (injetável pra teste). */
  now?: Date;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * O aviso está dentro da janela de vigência e ativo?
 * Data ausente = sem limite daquele lado (igual à policy).
 */
export function isNoticeLive(notice: SystemNotice, now: Date): boolean {
  if (!notice.is_active) return false;
  const starts = parseDate(notice.starts_at);
  if (starts && starts.getTime() > now.getTime()) return false;
  const ends = parseDate(notice.ends_at);
  if (ends && ends.getTime() < now.getTime()) return false;
  return true;
}

/**
 * O aviso é direcionado a este espectador?
 *
 * Espelho exato de `admin_notices_select_tenant`. FAIL CLOSED: alvo vazio,
 * empresa indefinida ou público desconhecido => não vê.
 */
export function isNoticeTargeted(
  notice: SystemNotice,
  viewer: Pick<NoticeViewerContext, 'userId' | 'companyId'>,
): boolean {
  const ids = notice.target_ids ?? [];
  switch (notice.target_audience) {
    case 'all':
      return true;
    case 'specific_companies':
      // Sem empresa resolvida não dá pra afirmar que é dela. Não mostra.
      return !!viewer.companyId && ids.includes(viewer.companyId);
    case 'specific_users':
      return !!viewer.userId && ids.includes(viewer.userId);
    default:
      // Valor novo que este build não conhece: não mostra (fail closed).
      return false;
  }
}

/**
 * Foi dispensado por este usuário E continua dispensado?
 *
 * Aviso editado depois da dispensa VOLTA a aparecer (`updated_at` >
 * `dismissed_at`) — é como o admin "republica" uma correção sem criar outro
 * aviso. Aviso não dispensável nunca conta como dispensado.
 */
export function isNoticeDismissed(notice: SystemNotice, dismissals: NoticeDismissal[]): boolean {
  if (!notice.is_dismissible) return false;
  const hit = dismissals.find((d) => d.notice_id === notice.id);
  if (!hit) return false;
  const dismissedAt = parseDate(hit.dismissed_at);
  const updatedAt = parseDate(notice.updated_at);
  if (!dismissedAt) return false;
  if (updatedAt && updatedAt.getTime() > dismissedAt.getTime()) return false;
  return true;
}

/**
 * Avisos que este espectador deve ver NESTA tela, mais recente primeiro.
 *
 * O casamento de escopo é por IGUALDADE, de propósito: quem desenha o escopo
 * `global` é o `AppLayout`, que envolve TODAS as telas, inclusive o painel
 * inicial. Se o painel inicial também aceitasse o `global`, o mesmo aviso
 * apareceria duas vezes empilhado ali.
 */
export function filterVisibleNotices(
  notices: SystemNotice[],
  viewer: NoticeViewerContext,
): SystemNotice[] {
  const now = viewer.now ?? new Date();
  return notices
    .filter((notice) => {
      if (!isNoticeLive(notice, now)) return false;
      if (!isNoticeTargeted(notice, viewer)) return false;
      if (isNoticeDismissed(notice, viewer.dismissals)) return false;
      return notice.scope === viewer.scope;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
