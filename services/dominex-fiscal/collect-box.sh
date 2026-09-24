#!/usr/bin/env bash
# =============================================================================
# collect-box.sh — retrato da VPS COMPARTILHADA para a aba Infra do painel
# =============================================================================
# POR QUE ISTO EXISTE (e por que não é o container que faz):
# A rota `GET /v1/infra/metricas` do `dominex-fiscal` consegue medir a si mesma
# (cgroup) e a box inteira (/proc/meminfo, /proc/uptime, statvfs). O que ela NÃO
# consegue é ver os OUTROS containers — Evolution API (WhatsApp do Dominex E do
# EcoSistema) e `ecosistema-dfe`. Para isso seria preciso montar
# `/var/run/docker.sock` dentro dele, e **o socket do Docker é equivalente a root
# no host**. Este é justamente o container que manipula chave privada de cliente:
# dar-lhe root no host jogaria fora `cap_drop: ALL`, `read_only`, usuário 10001 e
# todo o resto da blindagem.
#
# Então inverte-se o fluxo: o HOST coleta (aqui, como root, com docker à mão) e
# deixa um JSON **sem segredo nenhum** em /var/lib/dominex-fiscal/box.json, que o
# container monta SOMENTE LEITURA. O container lê; nunca escreve; nunca fala com
# o Docker.
#
# ⚠️ REGRA DURA: NUNCA usar `docker inspect <container>` sem `-f`. O inspect
# completo despeja o bloco `Env`, que contém FISCAL_SERVICE_TOKEN, FISCAL_KEKS e
# a EVOLUTION_API_KEY. Aqui só se pede campo por campo, e nenhum deles é Env.
#
# Uso:
#   sudo ./collect-box.sh            # escreve o retrato
#   sudo ./collect-box.sh --stdout   # imprime e não escreve (conferência)
#
# Quem chama: o `smoke-test.sh` no fim de cada passagem (a cada 15 min pelo
# timer). Se um dia quiser retrato mais fresco, é só criar um timer próprio de
# 1 min apontando pra cá — o script é idempotente e barato (~1 s).
# =============================================================================
set -uo pipefail

DESTINO_DIR="${FISCAL_ESTADO_DIR:-/var/lib/dominex-fiscal}"
DESTINO="$DESTINO_DIR/box.json"
SOMENTE_STDOUT=0
[[ "${1:-}" == "--stdout" ]] && SOMENTE_STDOUT=1

command -v docker >/dev/null || { echo "docker não encontrado" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 não encontrado" >&2; exit 1; }

# ---- 1. Inventário de containers (id, nome, projeto compose) -----------------
# Só campos nomeados. Nenhum `inspect` inteiro. Nenhum Env.
INVENTARIO="$(docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.project"}}' 2>/dev/null)"

# ---- 2. Estado por container ------------------------------------------------
ESTADOS=""
while IFS=$'\t' read -r ID NOME PROJETO; do
	[[ -z "${ID:-}" ]] && continue
	LINHA="$(docker inspect -f \
		'{{.State.Status}}	{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}	{{.RestartCount}}	{{.State.OOMKilled}}	{{.Created}}	{{.HostConfig.Memory}}' \
		"$ID" 2>/dev/null)" || LINHA=""
	ESTADOS+="${ID}	${NOME}	${PROJETO}	${LINHA}"$'\n'
done <<< "$INVENTARIO"

# ---- 3. Consumo ao vivo (só os que estão de pé) -----------------------------
# `docker stats --no-stream` custa ~1 s. Barato a cada 15 min.
CONSUMO="$(docker stats --no-stream --format '{{.ID}}\t{{.MemUsage}}\t{{.CPUPerc}}' 2>/dev/null || true)"

# ---- 4. Box -----------------------------------------------------------------
DISCO_PCT="$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')"

# ---- 5. Montagem do JSON ----------------------------------------------------
JSON="$(python3 - "$DISCO_PCT" <<PY
import json, re, sys
from datetime import datetime

disco = sys.argv[1]
estados_bruto = """$ESTADOS"""
consumo_bruto = """$CONSUMO"""

def para_mb(texto):
    """'412.3MiB' / '1.2GiB' / '512MB' → MB (float). Formato do docker stats."""
    m = re.match(r"([0-9.]+)\s*([KMG]i?B)", (texto or "").strip(), re.I)
    if not m:
        return None
    valor, unidade = float(m.group(1)), m.group(2).lower()
    fator = {"kib": 1/1024, "kb": 1/1000, "mib": 1.0, "mb": 1.0,
             "gib": 1024.0, "gb": 1000.0}.get(unidade)
    return None if fator is None else round(valor * fator, 1)

consumo = {}
for linha in consumo_bruto.splitlines():
    campos = linha.split("\t")
    if len(campos) < 3:
        continue
    ident, uso, cpu = campos[0].strip(), campos[1], campos[2]
    consumo[ident] = {
        "memMb": para_mb(uso.split("/")[0]),
        "cpuPct": (lambda t: float(t) if t else None)(cpu.replace("%", "").strip() or ""),
    }

containers = []
for linha in estados_bruto.splitlines():
    campos = linha.split("\t")
    if len(campos) < 9 or not campos[0].strip():
        continue
    ident, nome, projeto, estado, saude, reinicios, oom, criado, mem_limite = (
        c.strip() for c in campos[:9]
    )
    vivo = consumo.get(ident, {})
    try:
        limite_mb = round(int(mem_limite) / (1024 * 1024), 1) if int(mem_limite) > 0 else None
    except ValueError:
        limite_mb = None
    containers.append({
        # "stack" = projeto do docker compose (o diretório em ~/). É o que
        # separa "isto é do WhatsApp" de "isto é do fiscal" na tela.
        "stack": projeto or "avulso",
        "container": nome,
        "estado": estado,
        "saude": saude,
        "reinicios": int(reinicios) if reinicios.isdigit() else None,
        "oomUltimaParada": oom.lower() == "true",
        "criadoEm": criado[:19],
        "memMb": vivo.get("memMb"),
        "memLimiteMb": limite_mb,
        "cpuPct": vivo.get("cpuPct"),
    })

containers.sort(key=lambda c: (c["stack"], c["container"]))

print(json.dumps({
    "coletadoEm": datetime.now().astimezone().isoformat(timespec="seconds"),
    "discoUsadoPct": float(disco) if disco else None,
    "containers": containers,
}, ensure_ascii=False))
PY
)"

if [[ -z "$JSON" ]]; then
	echo "coleta falhou: JSON vazio" >&2
	exit 1
fi

if (( SOMENTE_STDOUT )); then
	echo "$JSON"
	exit 0
fi

# Escrita ATÔMICA: o container pode estar lendo neste exato instante. Escrever
# direto no destino entregaria JSON pela metade (e o leitor trata como ilegível).
mkdir -p "$DESTINO_DIR"
TEMP="$(mktemp "$DESTINO_DIR/.box.XXXXXX")"
printf '%s\n' "$JSON" > "$TEMP"
chmod 0644 "$TEMP"          # o container roda como uid 10001 e precisa LER
mv -f "$TEMP" "$DESTINO"
echo "retrato escrito em $DESTINO"
