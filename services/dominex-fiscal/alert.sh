#!/usr/bin/env bash
# =============================================================================
# alert.sh — canal de alerta do dominex-fiscal
# =============================================================================
# Manda WhatsApp pro CEO usando a **Evolution API que já roda nesta mesma VPS**.
# Nenhum serviço novo, nenhuma assinatura, nenhum cartão: a infra do alerta já
# estava paga e de pé.
#
# ⚠️ REGRA DURA: NUNCA usar uma instância de TENANT (dominex_<company_id>) pra
# alerta interno. Aquele WhatsApp é do CLIENTE — mandar mensagem nossa a partir
# do número dele é invasivo e consome a sessão dele. Use uma instância própria
# (sugestão: `dominex_infra_alertas`, com um número da Dominex).
#
# Uso:
#   ./alert.sh <chave> <falha|recuperado> <mensagem...>
#     chave  = identificador estável do evento (ex.: fiscal-readyz). Serve pro
#              anti-spam e pra saber de quê a gente está se recuperando.
#
# Config em /etc/dominex-fiscal/alert.env (chmod 600, dono root) — ver RUNBOOK §6.
#
# Fallback: se o WhatsApp não estiver configurado ou falhar, o alerta ainda vai
# pro journald e pro arquivo de log. Perder o canal bonito não pode significar
# perder o registro do incidente.
# =============================================================================
set -uo pipefail

CHAVE="${1:-desconhecido}"
NIVEL="${2:-falha}"
shift 2 2>/dev/null || true
MENSAGEM="${*:-sem mensagem}"

ENV_FILE="${ALERT_ENV_FILE:-/etc/dominex-fiscal/alert.env}"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	set -a; source "$ENV_FILE"; set +a
fi

EVOLUTION_URL="${EVOLUTION_URL:-http://127.0.0.1:8080}"
ALERT_WA_INSTANCE="${ALERT_WA_INSTANCE:-}"
ALERT_WA_TO="${ALERT_WA_TO:-}"
EVOLUTION_API_KEY="${EVOLUTION_API_KEY:-}"
ALERT_COOLDOWN="${ALERT_COOLDOWN:-3600}"     # não repetir o MESMO alerta antes disso
ESTADO_DIR="${ALERT_STATE_DIR:-/var/lib/dominex-fiscal/alertas}"
LOG_FILE="${ALERT_LOG_FILE:-/var/log/dominex-fiscal/alertas.log}"

mkdir -p "$ESTADO_DIR" "$(dirname "$LOG_FILE")" 2>/dev/null || true

registrar() {
	local linha="[$(date '+%Y-%m-%d %H:%M:%S')] [$NIVEL] [$CHAVE] $*"
	echo "$linha" | tee -a "$LOG_FILE" >&2
	command -v logger >/dev/null && logger -t dominex-fiscal "$linha" || true
}

# ---- Anti-spam: 1 alerta por chave por ALERT_COOLDOWN; recuperação sempre passa ----
ESTADO_FILE="$ESTADO_DIR/$CHAVE"
AGORA="$(date +%s)"
ESTADO_ANTERIOR="ok"; TS_ANTERIOR=0
if [[ -f "$ESTADO_FILE" ]]; then
	read -r ESTADO_ANTERIOR TS_ANTERIOR < "$ESTADO_FILE" || true
	TS_ANTERIOR="${TS_ANTERIOR:-0}"
fi

DEVE_ENVIAR=1
if [[ "$NIVEL" == "falha" ]]; then
	if [[ "$ESTADO_ANTERIOR" == "falha" ]] && (( AGORA - TS_ANTERIOR < ALERT_COOLDOWN )); then
		DEVE_ENVIAR=0
		registrar "(silenciado pelo cooldown, ainda em falha) $MENSAGEM"
	fi
	echo "falha $AGORA" > "$ESTADO_FILE"
else
	if [[ "$ESTADO_ANTERIOR" != "falha" ]]; then
		DEVE_ENVIAR=0    # nunca esteve quebrado: não anunciar recuperação
	fi
	echo "ok $AGORA" > "$ESTADO_FILE"
fi

if (( DEVE_ENVIAR == 0 )); then
	exit 0
fi

# ---- Monta o texto (padrão de mensagem da casa: *negrito* com asterisco simples) ----
if [[ "$NIVEL" == "falha" ]]; then
	TITULO="🚨 *Dominex · Motor fiscal com problema*"
else
	TITULO="✅ *Dominex · Motor fiscal normalizado*"
fi
TEXTO="$TITULO

$MENSAGEM

Servidor: $(hostname)
Horário: $(date '+%d/%m/%Y %H:%M')
Evento: $CHAVE"

registrar "$MENSAGEM"

# ---- Envia pelo WhatsApp (Evolution local) ---------------------------------------
if [[ -z "$ALERT_WA_INSTANCE" || -z "$ALERT_WA_TO" || -z "$EVOLUTION_API_KEY" ]]; then
	registrar "WhatsApp não configurado (alert.env incompleto) — alerta ficou só no log"
	exit 0
fi

# python3 pra montar o JSON com escape correto (o texto tem quebra de linha e emoji).
CORPO="$(python3 - "$ALERT_WA_TO" "$TEXTO" <<'PY'
import json, sys
print(json.dumps({"number": sys.argv[1], "text": sys.argv[2]}))
PY
)"

RESPOSTA="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' \
	-X POST "$EVOLUTION_URL/message/sendText/$ALERT_WA_INSTANCE" \
	-H "apikey: $EVOLUTION_API_KEY" \
	-H "Content-Type: application/json" \
	-d "$CORPO" 2>/dev/null || echo "000")"

if [[ "$RESPOSTA" =~ ^2 ]]; then
	registrar "WhatsApp enviado (HTTP $RESPOSTA)"
else
	# ⚠️ Aqui mora o ponto cego: se a Evolution estiver fora, o alerta não sai.
	# Por isso o RUNBOOK §6.4 manda ter TAMBÉM um monitor de uptime EXTERNO
	# batendo em https://fiscal.dominex.app/healthz — ele cobre "a box inteira caiu".
	registrar "FALHA ao enviar WhatsApp (HTTP $RESPOSTA) — alerta ficou só no log"
fi
