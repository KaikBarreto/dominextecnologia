#!/usr/bin/env bash
# =============================================================================
# smoke-test.sh — teste de fumaça do motor fiscal (tarefa C6 do plano NFS-e)
# =============================================================================
# POR QUE ISTO EXISTE (motivo concreto, não teórico):
# No spike de 02/09 a `nfelib` estava UMA VERSÃO DE ESQUEMA ATRÁS do servidor do
# governo — ela gerava um campo `nPedRegEvento` que o SefinNacional_1.6.0 já tinha
# removido (armadilha 6 do plano). Layout fiscal muda sem aviso e sem changelog.
# Sem este alarme, a gente descobre que quebrou pelo CLIENTE QUE NÃO CONSEGUIU
# FATURAR. Com ele, a gente descobre às 07:10 da manhã, por WhatsApp.
#
# DOIS MODOS:
#   --light  (padrão, a cada 15 min) — sem certificado nenhum:
#              container saudável · TLS válido · /healthz · /readyz?deep=1
#              (que inclui o AUTOTESTE DE ASSINATURA com chave descartável e o
#              teste de egresso pro governo) · disco · RAM.
#   --full   (1x/dia)                — o de cima MAIS uma emissão real em
#              HOMOLOGAÇÃO via POST /admin/smoke. É este que pega mudança de
#              layout do lado do GOVERNO. Devolve 501 enquanto o motor (C4) não
#              expuser `smoke_homologacao()` — e 501 NÃO é tratado como falha.
#
# ⚠️ De onde vem o certificado do modo --full: NÃO desta VPS. A §Custódia proíbe
# .pfx em disco persistente aqui. Ver RUNBOOK §6.3 — as duas opções (a preferida
# é a edge function agendada por pg_cron, que usa o mesmo caminho do cliente real).
#
# Uso:
#   ./smoke-test.sh            # light
#   ./smoke-test.sh --full     # light + emissão em homologação
#   ./smoke-test.sh --quiet    # não alerta, só imprime (pra rodar na mão)
# =============================================================================
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALERT="${ALERT_SCRIPT:-$AQUI/alert.sh}"

MODO="light"
QUIET=0
for arg in "$@"; do
	case "$arg" in
		--full)  MODO="full" ;;
		--light) MODO="light" ;;
		--quiet) QUIET=1 ;;
		*) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
	esac
done

ENV_FILE="${SMOKE_ENV_FILE:-/etc/dominex-fiscal/smoke.env}"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	set -a; source "$ENV_FILE"; set +a
fi

BASE_URL="${FISCAL_BASE_URL:-https://fiscal.dominex.app}"
CONTAINER="${FISCAL_CONTAINER:-dominex-fiscal}"
SERVICE_ENV="${FISCAL_SERVICE_ENV:-/etc/dominex-fiscal/service.env}"

# Lê o token do arquivo de segredo do serviço (mesma fonte que o container usa —
# não existe cópia paralela do segredo pra sair de sincronia).
ler_token() {
	[[ -r "$SERVICE_ENV" ]] || return 1
	local valor
	valor="$(grep -E '^[[:space:]]*FISCAL_SERVICE_TOKEN=' "$SERVICE_ENV" | head -n1 | cut -d= -f2-)"
	valor="${valor%\"}"; valor="${valor#\"}"
	valor="${valor%\'}"; valor="${valor#\'}"
	printf '%s' "$(echo "$valor" | tr -d '[:space:]')"
}
DISCO_MAX="${DISCO_MAX_PCT:-85}"
CERT_MIN_DIAS="${CERT_MIN_DIAS:-10}"

FALHAS=()
DETALHES=()

anotar()  { DETALHES+=("$*"); [[ $QUIET -eq 1 ]] && echo "  $*"; }
falhar()  { FALHAS+=("$*"); echo "✗ $*" >&2; }
passar()  { echo "✓ $*"; }

# ---- 1. Container vivo, saudável e sem restart-loop ------------------------------
if ! command -v docker >/dev/null; then
	falhar "docker não encontrado no PATH"
else
	ESTADO="$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "ausente")"
	SAUDE="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}' "$CONTAINER" 2>/dev/null || echo "?")"
	REINICIOS="$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo 0)"

	if [[ "$ESTADO" != "running" ]]; then
		falhar "container '$CONTAINER' não está rodando (status: $ESTADO)"
	elif [[ "$SAUDE" != "healthy" && "$SAUDE" != "sem-healthcheck" ]]; then
		falhar "container '$CONTAINER' com healthcheck '$SAUDE'"
	else
		passar "container $ESTADO/$SAUDE (restarts acumulados: $REINICIOS)"
	fi

	# Restart-loop: comparar com a leitura anterior. Subiu muito desde a última
	# passagem = está reiniciando em laço, mesmo que agora esteja "running".
	MARCA="/var/lib/dominex-fiscal/restart_count"
	mkdir -p "$(dirname "$MARCA")" 2>/dev/null || true
	ANTERIOR="$(cat "$MARCA" 2>/dev/null || echo "$REINICIOS")"
	if (( REINICIOS - ANTERIOR >= 3 )); then
		falhar "restart-loop: $((REINICIOS - ANTERIOR)) reinícios desde a última verificação"
	fi
	echo "$REINICIOS" > "$MARCA" 2>/dev/null || true
fi

# ---- 2. /healthz pelo caminho PÚBLICO (prova Caddy + TLS + DNS) ------------------
HTTP="$(curl -sS -m 15 -o /tmp/.smoke_health.$$ -w '%{http_code}' "$BASE_URL/healthz" 2>/dev/null || echo "000")"
if [[ "$HTTP" != "200" ]]; then
	falhar "GET $BASE_URL/healthz devolveu HTTP $HTTP (esperado 200)"
else
	passar "/healthz 200 pelo caminho público"
fi
rm -f "/tmp/.smoke_health.$$"

# ---- 3. 401 sem token (prova que a porta não está aberta) ------------------------
HTTP401="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$BASE_URL/readyz" 2>/dev/null || echo "000")"
if [[ "$HTTP401" != "401" ]]; then
	falhar "GET /readyz SEM token devolveu $HTTP401 — esperado 401. Autenticação pode estar desligada!"
else
	passar "/readyz sem token → 401 (autenticação ativa)"
fi

# ---- 4. /readyz?deep=1 com token -------------------------------------------------
TOKEN="$(ler_token || true)"
if [[ -z "$TOKEN" ]]; then
	falhar "não consigo ler FISCAL_SERVICE_TOKEN de $SERVICE_ENV (rode como root — ver RUNBOOK §6.1)"
else
	CORPO_FILE="/tmp/.smoke_ready.$$"
	HTTP="$(curl -sS -m 45 -o "$CORPO_FILE" -w '%{http_code}' \
		-H "Authorization: Bearer $TOKEN" "$BASE_URL/readyz?deep=1" 2>/dev/null || echo "000")"
	if [[ "$HTTP" != "200" ]]; then
		falhar "GET /readyz?deep=1 devolveu HTTP $HTTP"
	else
		RESUMO="$(python3 - "$CORPO_FILE" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("ERRO|nao consegui ler a resposta do /readyz: %s" % e); raise SystemExit
c = d.get("checks", {})
p = []

if not c.get("token", {}).get("ok"):
    p.append("token do servico nao configurado (FISCAL_SERVICE_TOKEN)")

k = c.get("kek", {})
if not k.get("ok"):
    p.append("KEK nao abre o que ela mesma fecha: %s" % k.get("erro", k))

# tmpfs: o `ok` do servico so garante permissao. A propriedade que a Custodia
# exige e RAM + noexec + nosuid — sem isso a chave privada do cliente tocaria
# disco (e o snapshot semanal da Hostinger). Conferimos explicitamente.
t = c.get("tmpfs", {})
if not t.get("ok"):
    p.append("tmpfs de custodia invalido: %s" % t)
if t.get("em_ram") is not True:
    p.append("DIRETORIO DE CUSTODIA NAO E tmpfs (%s) - chave privada tocaria DISCO. "
             "O container subiu sem o bloco `tmpfs:` do docker-compose.yml?" % t.get("dir"))
for opcao in ("noexec", "nosuid"):
    if t.get(opcao) is not True:
        p.append("tmpfs de custodia sem %s" % opcao)

a = c.get("assinatura", {})
if not a.get("ok"):
    p.append("AUTOTESTE DE ASSINATURA FALHOU (esteira de layout!): %s"
             % (a.get("problemas") or a.get("erro") or a))

e = c.get("egresso", {})
if not e.get("ok"):
    p.append("sem egresso pro Sefin (%s): %s" % (e.get("host"), e.get("erro", "?")))

if not d.get("ok") and not p:
    p.append("readyz reportou degradado: %s" % json.dumps(c, ensure_ascii=False)[:300])

v = c.get("versoes", {})
versoes = " ".join("%s=%s" % (n, v[n]) for n in ("nfelib", "signxml", "xsdata", "lxml") if n in v)
print(("ERRO|" + " . ".join(p)) if p else ("OK|" + versoes))
PY
)"
		if [[ "$RESUMO" == ERRO\|* ]]; then
			falhar "${RESUMO#ERRO|}"
		else
			passar "/readyz?deep=1 ok (${RESUMO#OK|})"
			anotar "${RESUMO#OK|}"
		fi
	fi
	rm -f "$CORPO_FILE"
fi

# ---- 5. Validade do certificado TLS ---------------------------------------------
HOST="${BASE_URL#https://}"; HOST="${HOST%%/*}"
FIM="$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
	| openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
if [[ -n "$FIM" ]]; then
	DIAS=$(( ( $(date -d "$FIM" +%s) - $(date +%s) ) / 86400 ))
	if (( DIAS < CERT_MIN_DIAS )); then
		falhar "certificado TLS de $HOST expira em $DIAS dia(s) — o Caddy deveria ter renovado. Confira se a porta 80 está aberta no ufw."
	else
		passar "TLS de $HOST válido por mais $DIAS dia(s)"
	fi
else
	falhar "não consegui ler o certificado TLS de $HOST"
fi

# ---- 6. Disco e memória da box (compartilhada com o WhatsApp dos 2 produtos) -----
USO="$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')"
if (( USO >= DISCO_MAX )); then
	falhar "disco / em ${USO}% (limite ${DISCO_MAX}%) — encher o disco derruba TAMBÉM a Evolution API (WhatsApp do Dominex e do EcoSistema)"
else
	passar "disco / em ${USO}%"
fi
anotar "RAM: $(free -m | awk 'NR==2{printf "%d/%d MB usados", $3, $2}')"

# ---- 7. Modo --full: emissão real em HOMOLOGAÇÃO ---------------------------------
if [[ "$MODO" == "full" && -n "$TOKEN" ]]; then
	CORPO_FILE="/tmp/.smoke_full.$$"
	HTTP="$(curl -sS -m 120 -o "$CORPO_FILE" -w '%{http_code}' -X POST \
		-H "Authorization: Bearer $TOKEN" -H "Content-Length: 0" \
		"$BASE_URL/admin/smoke" 2>/dev/null || echo "000")"
	SAIDA="$(head -c 600 "$CORPO_FILE" 2>/dev/null || true)"
	rm -f "$CORPO_FILE"

	if [[ "$HTTP" == "200" && "$SAIDA" == *'"nao_implementado"'* ]]; then
		# Esperado enquanto o C4 não entregou. Não é falha — mas fica registrado.
		passar "emissão em homologação: ainda não implementada pelo motor (C4) — modo raso cobrindo"
		anotar "⚠️ /admin/smoke ainda devolve 'nao_implementado'. Até o C4 entregar, mudança de layout DO LADO DO GOVERNO não é detectada."
	elif [[ "$HTTP" != "200" ]]; then
		falhar "emissão de fumaça em HOMOLOGAÇÃO falhou (HTTP $HTTP): $SAIDA"
	else
		passar "emissão de fumaça em homologação OK"
	fi
fi

# ---- Desfecho --------------------------------------------------------------------
if (( ${#FALHAS[@]} > 0 )); then
	MENSAGEM="$(printf '%s\n' "${FALHAS[@]}" | sed 's/^/• /')"
	if [[ -n "${DETALHES[*]:-}" ]]; then
		MENSAGEM="$MENSAGEM

$(printf '%s\n' "${DETALHES[@]}")"
	fi
	echo
	echo "RESULTADO: ${#FALHAS[@]} falha(s)."
	if (( QUIET == 0 )) && [[ -x "$ALERT" ]]; then
		"$ALERT" "fiscal-smoke-$MODO" falha "$MENSAGEM"
	fi
	exit 1
fi

echo
echo "RESULTADO: tudo certo ($MODO)."
if (( QUIET == 0 )) && [[ -x "$ALERT" ]]; then
	"$ALERT" "fiscal-smoke-$MODO" recuperado "Todas as verificações voltaram a passar."
fi
exit 0
