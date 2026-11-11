/* global self, clients */

const DEFAULT_ACTION = "/dashboard";
const DEFAULT_ICON = "/icons/notification-icon.svg";
const DEFAULT_BADGE = "/icons/icon-96x96.png";

function safeActionPath(value) {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_ACTION;
  }
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : DEFAULT_ACTION;
  } catch {
    return DEFAULT_ACTION;
  }
}

function readPayload(event) {
  if (!event.data) return {};
  try {
    const value = event.data.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const declarative =
    payload.web_push === 8030 &&
    payload.notification &&
    typeof payload.notification === "object"
      ? payload.notification
      : null;
  const notification = declarative || payload;
  const action = safeActionPath(notification.navigate || payload.action_url);
  const title =
    typeof notification.title === "string" && notification.title.trim()
      ? notification.title.trim().slice(0, 120)
      : "Nova notificação no Dominex";
  const body =
    typeof notification.body === "string" && notification.body.trim()
      ? notification.body.replace(/\s+/g, " ").trim().slice(0, 240)
      : "Abra o Dominex para ver os detalhes.";

  // O navegador/SO decide se a prévia aparece na tela bloqueada. O payload é
  // limitado, sem HTML, e só contém o resumo que o backend já persistiu.
  const options = {
    body,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag:
      typeof notification.tag === "string"
        ? notification.tag.slice(0, 120)
        : typeof payload.tag === "string"
          ? payload.tag.slice(0, 120)
          : undefined,
    renotify: payload.priority === "high",
    // `false` solicita explicitamente o som padrão. O navegador/SO ainda pode
    // silenciar por Foco, modo silencioso ou preferência do aparelho.
    silent: notification.silent === true,
    data: { action_url: action, notification_id: payload.notification_id || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = safeActionPath(event.notification.data?.action_url);
  const targetUrl = new URL(action, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(targetUrl);
      return existing.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});
