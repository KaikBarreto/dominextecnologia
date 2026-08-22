#!/usr/bin/env bash
# =============================================================================
# backup.sh — backup do estado da Evolution API (VPS compartilhada Dominex+EcoSistema)
# =============================================================================
# O que salva (é MINÚSCULO — dezenas de MB):
#   1. pg_dump do Postgres da Evolution (db/usuário "evolution") — instâncias/sessões.
#   2. tar do volume nomeado "evolution_instances" — creds/estado de sessão Baileys.
# O dado CRÍTICO de negócio NÃO mora aqui (está no Supabase, com backup próprio).
# Esta VPS só guarda estado de sessão → pior caso de perda = re-parear QR.
#
# Camadas de DR (regra 3-2-1):
#   - Hostinger weekly snapshot (grátis, fora do disco da VPS) — RPO 7 dias.
#   - ESTE script no cron diário (local) — restauração rápida do "oops" do dia.
#   - Push offsite plugável (R2/B2) — cobre catástrofe de conta Hostinger. Grátis no
#     nosso tamanho. DESLIGADO por padrão (OFFSITE_ENABLED=0).
#
# Segredos: NADA hardcoded. Lê de env ou de /etc/whatsapp-evolution/backup.env.
# Idempotente. set -euo pipefail. Rotação local (mantém os últimos N).
#
# Uso:
#   ./backup.sh                      # backup local só
#   OFFSITE_ENABLED=1 ./backup.sh    # local + push offsite (precisa rclone configurado)
#
# Cron (ver crontab sugerido no fim do arquivo).
# =============================================================================
set -euo pipefail

# ---- Config (env > arquivo de env > default). NUNCA colocar segredo aqui. --------
# Se existir, carrega variáveis do arquivo de env (chmod 600, dono deploy/root).
ENV_FILE="${BACKUP_ENV_FILE:-/etc/whatsapp-evolution/backup.env}"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	set -a; source "$ENV_FILE"; set +a
fi

# Diretório do docker-compose (pra resolver nomes de container/volume via projeto).
COMPOSE_DIR="${COMPOSE_DIR:-$HOME/whatsapp-evolution}"

# Nomes lógicos dos serviços no compose (não mudar sem alinhar o docker-compose.yml).
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${PG_USER:-evolution}"
PG_DB="${PG_DB:-evolution}"

# Nome do volume nomeado das instâncias. Docker prefixa com o nome do projeto compose
# (nome do diretório). Detectamos o volume real por sufixo mais abaixo.
INSTANCES_VOLUME_SUFFIX="${INSTANCES_VOLUME_SUFFIX:-evolution_instances}"

# Destino local e rotação.
BACKUP_DIR="${BACKUP_DIR:-/var/backups/whatsapp-evolution}"
KEEP_LAST="${KEEP_LAST:-14}"          # mantém os últimos N conjuntos de backup

# Offsite (S3-compatível: Cloudflare R2 ou Backblaze B2). Desligado por padrão.
OFFSITE_ENABLED="${OFFSITE_ENABLED:-0}"
# Nome do remote configurado no rclone (ex.: "r2" após `rclone config`).
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
# Bucket/prefixo destino. Ex.: whatsapp-evolution-backups/vps-br
OFFSITE_PATH="${OFFSITE_PATH:-whatsapp-evolution-backups}"

# -----------------------------------------------------------------------------
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERRO: $*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker não encontrado no PATH"
[[ -d "$COMPOSE_DIR" ]] || fail "COMPOSE_DIR não existe: $COMPOSE_DIR"

cd "$COMPOSE_DIR"

TS="$(date '+%Y%m%d-%H%M%S')"
WORK="$BACKUP_DIR/$TS"
mkdir -p "$WORK"

# ---- 1. pg_dump do Postgres da Evolution ------------------------------------------
# Roda dentro do container (não precisa de client pg no host). Formato custom (-Fc)
# comprime e permite restore seletivo com pg_restore.
PG_DUMP_FILE="$WORK/evolution-pg-$TS.dump"
log "pg_dump do banco '$PG_DB' (serviço '$PG_SERVICE')…"
docker compose exec -T "$PG_SERVICE" \
	pg_dump -U "$PG_USER" -d "$PG_DB" -Fc \
	> "$PG_DUMP_FILE"
[[ -s "$PG_DUMP_FILE" ]] || fail "pg_dump gerou arquivo vazio — abortando"
log "pg_dump OK: $(du -h "$PG_DUMP_FILE" | cut -f1)"

# ---- 2. tar do volume nomeado evolution_instances --------------------------------
# Descobre o nome REAL do volume (docker prefixa com o nome do projeto compose).
REAL_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E "${INSTANCES_VOLUME_SUFFIX}$" | head -n1 || true)"
[[ -n "$REAL_VOLUME" ]] || fail "volume '*${INSTANCES_VOLUME_SUFFIX}' não encontrado (docker volume ls)"
log "arquivando volume '$REAL_VOLUME'…"

INSTANCES_TAR="$WORK/evolution-instances-$TS.tar.gz"
# Monta o volume read-only num container efêmero e tar pra stdout → arquivo no host.
docker run --rm \
	-v "$REAL_VOLUME":/data:ro \
	-v "$WORK":/backup \
	alpine:3.20 \
	tar czf "/backup/$(basename "$INSTANCES_TAR")" -C /data .
[[ -s "$INSTANCES_TAR" ]] || fail "tar do volume gerou arquivo vazio — abortando"
log "volume OK: $(du -h "$INSTANCES_TAR" | cut -f1)"

# ---- Manifesto (o que tem no conjunto, pra facilitar o restore) -------------------
cat > "$WORK/MANIFEST.txt" <<EOF
timestamp=$TS
pg_dump=$(basename "$PG_DUMP_FILE")
instances_tar=$(basename "$INSTANCES_TAR")
pg_service=$PG_SERVICE pg_db=$PG_DB pg_user=$PG_USER
volume=$REAL_VOLUME
host=$(hostname)
EOF
log "conjunto de backup pronto em: $WORK"

# ---- 3. Rotação local (mantém os últimos KEEP_LAST conjuntos) ---------------------
log "rotação local: mantendo os últimos $KEEP_LAST conjuntos…"
# Lista os diretórios de backup (nome = timestamp, ordenável), remove os excedentes.
mapfile -t SETS < <(find "$BACKUP_DIR" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort)
COUNT=${#SETS[@]}
if (( COUNT > KEEP_LAST )); then
	REMOVE=$(( COUNT - KEEP_LAST ))
	for ((i=0; i<REMOVE; i++)); do
		log "  removendo antigo: ${SETS[$i]}"
		rm -rf "${BACKUP_DIR:?}/${SETS[$i]}"
	done
fi

# ---- 4. Offsite plugável (R2/B2 via rclone) — desligado por padrão ----------------
if [[ "$OFFSITE_ENABLED" == "1" ]]; then
	command -v rclone >/dev/null || fail "OFFSITE_ENABLED=1 mas rclone não está instalado"
	DEST="${RCLONE_REMOTE}:${OFFSITE_PATH}/$TS"
	log "push offsite → $DEST"
	# Copia só o conjunto novo. --immutable evita reescrever. Sem apagar remoto aqui:
	# a rotação offsite pode ser feita por lifecycle rule do bucket (mais seguro).
	rclone copy "$WORK" "$DEST" --immutable --transfers 4
	log "offsite OK"
else
	log "offsite desligado (OFFSITE_ENABLED=0) — só backup local"
fi

log "backup concluído."

# =============================================================================
# CRON sugerido (rodar como o usuário dono do docker, ex.: deploy):
#   crontab -e
#   # backup diário da Evolution às 03:15 BR, log em arquivo:
#   15 3 * * * /home/deploy/whatsapp-evolution/backup.sh >> /var/log/whatsapp-evolution-backup.log 2>&1
#
# Pra ligar offsite no cron, sem expor segredo na linha do cron, use o env file:
#   /etc/whatsapp-evolution/backup.env  (chmod 600) contendo:
#     OFFSITE_ENABLED=1
#     RCLONE_REMOTE=r2
#     OFFSITE_PATH=whatsapp-evolution-backups/vps-br
#   e configure o rclone remote "r2" com `rclone config` (credenciais R2/B2 ficam
#   em ~/.config/rclone/rclone.conf, chmod 600 — NUNCA no git).
# =============================================================================
