"""
Métricas de operação — DONO: 🖥️ Dev Infra.

Serve `GET /v1/infra/metricas` (ver `app/infra_routes.py`). Existe para responder
**"está quebrado?" sem SSH**, de dentro do painel Auctus.

-----------------------------------------------------------------------------
AS DUAS LEIS DESTE ARQUIVO
-----------------------------------------------------------------------------
1. **NADA DE SEGREDO SAI DAQUI.** Nem KEK, nem token, nem senha, nem material de
   certificado, nem conteúdo do `service.env`. O que sai é: contador, byte,
   booleano e versão de biblioteca. Texto livre vindo de fora (o retrato do
   host) passa por `_sanear()` antes de virar resposta.

2. **"DESTE SERVIÇO" NUNCA SE MISTURA COM "DA BOX".** A VPS é COMPARTILHADA:
   nela rodam a Evolution API (WhatsApp do **Dominex E do EcoSistema**), o
   `ecosistema-dfe` e este motor fiscal. Se a resposta jogasse a RAM da box
   dentro do bloco do serviço, a tela mentiria pro CEO — ele veria "o fiscal
   está comendo 3 GB" quando 2,8 GB são do WhatsApp do outro produto. Por isso
   o JSON tem `servico` (cgroup DESTE container) e `box` (VPS inteira), com
   `box.compartilhada = true` e um aviso em PT-BR dentro do próprio corpo.

-----------------------------------------------------------------------------
DE ONDE VEM CADA NÚMERO
-----------------------------------------------------------------------------
| Bloco     | Fonte                         | Frescor        |
|-----------|-------------------------------|----------------|
| `servico` | cgroup do container (v2)      | tempo real     |
| `box`     | `/proc/meminfo`, `/proc/loadavg`, `/proc/uptime`, `statvfs` | tempo real |
| `stacks`  | retrato JSON do coletor do host (`collect-box.sh`) | até 15 min |
| `fumaca`  | retrato JSON do `smoke-test.sh`                   | até 15 min |

⚠️ POR QUE `stacks` VEM DE ARQUIVO E NÃO DO DOCKER: para ver o consumo dos
OUTROS containers seria preciso montar `/var/run/docker.sock` aqui dentro — e o
socket do Docker é **equivalente a root no host**. Este é justamente o container
que manipula chave privada de cliente; dar-lhe root no host jogaria fora toda a
blindagem (`cap_drop: ALL`, `read_only`, usuário 10001). Então o host coleta e
deixa um JSON sem segredo num diretório montado **somente leitura**, e aqui só
se LÊ. Sem o coletor, o bloco degrada com motivo explícito — nunca inventa.

⚠️ `/proc/meminfo` e `/proc/uptime` dentro do container mostram o HOST (não há
lxcfs). É por isso que eles caem em `box` e nunca em `servico`.
"""

from __future__ import annotations

import json
import os
import platform
import re
import time
from datetime import datetime

from . import diagnostico
from .config import ConfiguracaoInvalida, get_config

#: Relógio de parede no import do módulo ≈ subida do processo. Uptime baixo em
#: leituras seguidas é a assinatura de restart-loop vista de dentro.
_INICIADO_EM = time.time()

MB = 1024 * 1024
GB = 1024 * 1024 * 1024
_CG = "/sys/fs/cgroup"

#: Diretório do retrato do host. Montado **:ro** pelo compose. Se não existir, o
#: serviço continua funcionando e a resposta diz que o coletor está ausente.
DIR_ESTADO = os.environ.get("FISCAL_ESTADO_DIR", "/var/lib/dominex-fiscal").rstrip("/")
ARQUIVO_BOX = "box.json"
ARQUIVO_FUMACA = "fumaca.json"

#: O coletor pega carona no timer de 15 min do smoke. Acima disto o retrato é
#: velho — e retrato velho apresentado como atual é pior que retrato nenhum.
IDADE_MAXIMA_S = 20 * 60
#: Teto de leitura do arquivo do host: nem um coletor com defeito enche a RAM.
TETO_ARQUIVO_BYTES = 256 * 1024

LIMITE_DISCO_PCT = float(os.environ.get("FISCAL_ALERTA_DISCO_PCT", "85"))
LIMITE_RAM_BOX_PCT = float(os.environ.get("FISCAL_ALERTA_RAM_BOX_PCT", "90"))
LIMITE_RAM_SERVICO_PCT = float(os.environ.get("FISCAL_ALERTA_RAM_SERVICO_PCT", "85"))

#: Ocupantes conhecidos da box. Fica no código (e não só na cabeça de quem
#: opera) pra tela poder dizer QUEM divide o servidor.
OCUPANTES_DA_BOX = [
    "whatsapp-evolution — Evolution API (WhatsApp do Dominex E do EcoSistema)",
    "dominex-fiscal — este motor (NFS-e + DF-e)",
    "ecosistema-dfe — consulta de notas destinadas do EcoSistema (roda por cron)",
    "caddy + fail2ban + SO",
]

# =============================================================================
# Saneamento de texto vindo de fora
# =============================================================================
# O retrato do host carrega mensagens de falha do smoke test, que são texto
# livre. Elas são valiosas ("por que quebrou?") mas não podem virar um caminho
# de vazamento. Duas redações, ambas conservadoras.
_RE_CAMINHO_SEGREDO = re.compile(r"/etc/dominex-fiscal[\w./-]*")
_RE_BLOB = re.compile(r"\b[A-Za-z0-9+/=_-]{32,}\b")
_TETO_TEXTO = 400


def _sanear(valor: object) -> str:
    """Corta, tira caminho de segredo e apaga qualquer blob longo."""
    texto = str(valor)[:_TETO_TEXTO]
    texto = _RE_CAMINHO_SEGREDO.sub("<arquivo de segredo do host>", texto)
    return _RE_BLOB.sub("<redigido>", texto)


# =============================================================================
# Leitura crua de /proc e /sys (tudo tolerante a falta — nunca levanta)
# =============================================================================
def _texto(caminho: str, limite: int = 64 * 1024) -> str | None:
    try:
        with open(caminho, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read(limite)
    except OSError:
        return None


def _inteiro(caminho: str) -> int | None:
    bruto = (_texto(caminho, 64) or "").strip()
    if not bruto or bruto == "max":
        return None
    try:
        return int(bruto.split()[0])
    except (ValueError, IndexError):
        return None


def _pares(caminho: str) -> dict:
    """Arquivos do tipo `chave valor` por linha (memory.events, cpu.stat)."""
    saida: dict = {}
    for linha in (_texto(caminho) or "").splitlines():
        campos = linha.split()
        if len(campos) >= 2:
            try:
                saida[campos[0]] = int(campos[1])
            except ValueError:
                continue
    return saida


def _mb(bytes_: int | None) -> float | None:
    return None if bytes_ is None else round(bytes_ / MB, 1)


def _gb(bytes_: int | None) -> float | None:
    return None if bytes_ is None else round(bytes_ / GB, 2)


def _pct(parte: float | None, total: float | None) -> float | None:
    if parte is None or not total:
        return None
    return round(parte * 100.0 / total, 1)


def _limite_sensato(valor: int | None) -> int | None:
    """cgroup v1 grava "sem limite" como um inteiro gigante. Isso não é limite."""
    if valor is None or valor >= 2**62:
        return None
    return valor


def _cgroup_v2() -> bool:
    return os.path.exists(os.path.join(_CG, "cgroup.controllers"))


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch).astimezone().isoformat(timespec="seconds")


# =============================================================================
# Bloco `servico` — SÓ este container
# =============================================================================
def memoria_do_servico() -> dict:
    if _cgroup_v2():
        usado = _inteiro(f"{_CG}/memory.current")
        limite = _limite_sensato(_inteiro(f"{_CG}/memory.max"))
        pico = _inteiro(f"{_CG}/memory.peak")  # kernel ≥ 5.19; None nos antigos
        fonte = "cgroup-v2"
    else:
        base = f"{_CG}/memory"
        usado = _inteiro(f"{base}/memory.usage_in_bytes")
        limite = _limite_sensato(_inteiro(f"{base}/memory.limit_in_bytes"))
        pico = _inteiro(f"{base}/memory.max_usage_in_bytes")
        fonte = "cgroup-v1"

    if usado is None:
        return {"fonte": "indisponivel", "usadoMb": None, "limiteMb": None, "usoPct": None}

    return {
        "fonte": fonte,
        "usadoMb": _mb(usado),
        "limiteMb": _mb(limite),
        "picoMb": _mb(pico),
        "usoPct": _pct(usado, limite),
    }


def oom_do_servico() -> dict:
    """Quantas vezes o kernel matou algo DENTRO deste cgroup.

    ⚠️ O contador zera quando o container é recriado. Ele responde "tomou OOM
    desde que subiu?"; o histórico entre reinícios vem do retrato do host
    (`stacks[].oomUltimaParada`), que lê o estado guardado pelo Docker.
    """
    caminho = f"{_CG}/memory.events" if _cgroup_v2() else f"{_CG}/memory/memory.oom_control"
    eventos = _pares(caminho)
    # v2: low/high/max/oom/oom_kill · v1: oom_kill_disable/under_oom/oom_kill
    mortes = eventos.get("oom_kill")
    return {
        "mortesDesdeQueSubiu": mortes,
        "aconteceu": None if mortes is None else bool(mortes),
        # Quantas vezes o cgroup ENCOSTOU no teto (mesmo sem matar ninguém). É o
        # aviso prévio: bate muito hoje, mata amanhã.
        "vezesQueBateuNoTeto": eventos.get("max"),
    }


def cpu_do_servico(uptime_s: float, nucleos: int | None) -> dict:
    if not _cgroup_v2():
        return {"fonte": "indisponivel"}
    stat = _pares(f"{_CG}/cpu.stat")
    usado_us = stat.get("usage_usec")
    usado_s = None if usado_us is None else round(usado_us / 1_000_000, 1)
    # Média desde a subida. Não é instantâneo de propósito: instantâneo exigiria
    # guardar amostra entre chamadas, e o valor instantâneo por container já vem
    # do coletor do host (docker stats).
    media = None
    if usado_s is not None and uptime_s > 0 and nucleos:
        media = round(usado_s * 100.0 / (uptime_s * nucleos), 2)
    return {
        "fonte": "cgroup-v2",
        "usoSegundos": usado_s,
        "mediaPctDesdeQueSubiu": media,
        "vezesEstrangulado": stat.get("nr_throttled"),
        "estranguladoSegundos": (
            None if stat.get("throttled_usec") is None
            else round(stat["throttled_usec"] / 1_000_000, 1)
        ),
    }


def processos_do_servico() -> dict:
    if not _cgroup_v2():
        return {"atual": None, "limite": None}
    return {
        "atual": _inteiro(f"{_CG}/pids.current"),
        "limite": _limite_sensato(_inteiro(f"{_CG}/pids.max")),
    }


def tmpfs_de_custodia() -> dict:
    """Ocupação e conformidade do tmpfs onde o PEM efêmero pode existir.

    ⚠️ O CAMINHO não entra na resposta de propósito. Quem precisa dele já está
    logado na VPS; quem está na tela só precisa saber se está conforme.
    """
    checagem = diagnostico.checar_tmpfs()
    saida = {
        "ok": bool(checagem.get("ok")),
        "emRam": checagem.get("em_ram"),
        "noexec": checagem.get("noexec"),
        "nosuid": checagem.get("nosuid"),
        "modoPrivado": checagem.get("modo") in ("0o700", "0o40700"),
        "gravavel": checagem.get("gravavel"),
    }
    try:
        vfs = os.statvfs(get_config().tmpfs_dir)
        total = vfs.f_blocks * vfs.f_frsize
        livre = vfs.f_bavail * vfs.f_frsize
        saida["tamanhoMb"] = _mb(total)
        saida["usadoMb"] = _mb(total - livre)
    except (OSError, ConfiguracaoInvalida):
        pass
    return saida


# =============================================================================
# Bloco `box` — a VPS INTEIRA (inclui o EcoSistema)
# =============================================================================
def _meminfo() -> dict:
    saida: dict = {}
    for linha in (_texto("/proc/meminfo") or "").splitlines():
        nome, _, resto = linha.partition(":")
        campos = resto.split()
        if campos:
            try:
                saida[nome.strip()] = int(campos[0]) * 1024  # vem em kB
            except ValueError:
                continue
    return saida


def metricas_da_box() -> dict:
    info = _meminfo()
    total = info.get("MemTotal")
    disponivel = info.get("MemAvailable")
    usado = None if (total is None or disponivel is None) else total - disponivel
    swap_total = info.get("SwapTotal")
    swap_livre = info.get("SwapFree")

    carga = (_texto("/proc/loadavg", 128) or "").split()
    nucleos = os.cpu_count()

    uptime_bruto = (_texto("/proc/uptime", 64) or "").split()
    uptime = None
    if uptime_bruto:
        try:
            uptime = int(float(uptime_bruto[0]))
        except ValueError:
            uptime = None

    disco: dict = {}
    try:
        # "/" aqui é o overlay do container, que fica SOBRE o disco da box —
        # o statvfs reporta o sistema de arquivos de baixo, que é o do host.
        vfs = os.statvfs("/")
        total_d = vfs.f_blocks * vfs.f_frsize
        livre_d = vfs.f_bavail * vfs.f_frsize
        disco = {
            "totalGb": _gb(total_d),
            "livreGb": _gb(livre_d),
            "usadoPct": _pct(total_d - livre_d, total_d),
            "fonte": "container (overlay sobre o disco da box)",
        }
    except OSError:
        disco = {"totalGb": None, "livreGb": None, "usadoPct": None, "fonte": "indisponivel"}

    def _float(indice: int) -> float | None:
        try:
            return float(carga[indice])
        except (IndexError, ValueError):
            return None

    carga1 = _float(0)
    return {
        # ⚠️ Estes dois campos são o antídoto contra a tela mentir. Não remover.
        "compartilhada": True,
        "aviso": (
            "Números da VPS INTEIRA, não do motor fiscal. Esta box é dividida "
            "com a Evolution API (WhatsApp do Dominex E do EcoSistema) e com o "
            "ecosistema-dfe. Para o consumo só deste serviço, olhe o bloco "
            "\"servico\"."
        ),
        "ocupantes": OCUPANTES_DA_BOX,
        "uptimeSegundos": uptime,
        "memoria": {
            "totalMb": _mb(total),
            "usadoMb": _mb(usado),
            "disponivelMb": _mb(disponivel),
            "usoPct": _pct(usado, total),
        },
        "swap": {"totalMb": _mb(swap_total), "usadoMb": _mb(
            None if (swap_total is None or swap_livre is None) else swap_total - swap_livre
        )},
        "cpu": {
            "nucleos": nucleos,
            "carga1": carga1,
            "carga5": _float(1),
            "carga15": _float(2),
            "cargaPorNucleo1": (
                None if (carga1 is None or not nucleos) else round(carga1 / nucleos, 2)
            ),
        },
        "disco": disco,
    }


# =============================================================================
# Retratos deixados pelo host (somente leitura)
# =============================================================================
_MOTIVO_SEM_COLETOR = (
    "coletor do host não instalado ou nunca executado — instale os timers do "
    "teste de fumaça (RUNBOOK §6.1) e monte {dir} como somente leitura no "
    "container (RUNBOOK §6.5)."
)


def _ler_retrato(nome: str) -> tuple[dict | None, str | None, int | None]:
    """→ (dados, motivo_da_ausencia, idade_em_segundos)."""
    caminho = os.path.join(DIR_ESTADO, nome)
    try:
        tamanho = os.path.getsize(caminho)
        modificado = os.path.getmtime(caminho)
    except OSError:
        return None, _MOTIVO_SEM_COLETOR.format(dir=DIR_ESTADO), None
    if tamanho > TETO_ARQUIVO_BYTES:
        return None, "retrato do host grande demais — ignorado por segurança.", None
    bruto = _texto(caminho, TETO_ARQUIVO_BYTES)
    if not bruto:
        return None, "retrato do host vazio.", None
    try:
        dados = json.loads(bruto)
    except (ValueError, TypeError):
        return None, "retrato do host ilegível (JSON inválido).", None
    if not isinstance(dados, dict):
        return None, "retrato do host com formato inesperado.", None
    return dados, None, int(max(0.0, time.time() - modificado))


#: Só estes campos saem do retrato. Lista fechada de propósito: mesmo que o
#: coletor passe a escrever algo a mais amanhã, nada novo vaza pela API sem
#: alguém abrir este arquivo e decidir.
_CAMPOS_STACK = (
    "stack",
    "container",
    "estado",
    "saude",
    "reinicios",
    "memMb",
    "memLimiteMb",
    "cpuPct",
    "oomUltimaParada",
    "criadoEm",
)


def stacks_da_box() -> tuple[dict, float | None]:
    """→ (bloco `stacks`, disco do host em % — só se o retrato estiver fresco).

    O disco sai daqui de carona porque o `df /` do HOST é a medida autoritativa;
    o `statvfs` de dentro do container mede o overlay. São quase sempre o mesmo
    número, mas "quase sempre" não serve pra alarme de disco cheio.
    """
    dados, motivo, idade = _ler_retrato(ARQUIVO_BOX)
    if dados is None:
        return {"disponivel": False, "motivo": motivo, "itens": []}, None

    itens = []
    for bruto in (dados.get("containers") or [])[:50]:
        if not isinstance(bruto, dict):
            continue
        item = {}
        for campo in _CAMPOS_STACK:
            valor = bruto.get(campo)
            item[campo] = _sanear(valor) if isinstance(valor, str) else valor
        itens.append(item)

    fresco = idade is not None and idade <= IDADE_MAXIMA_S
    disco = dados.get("discoUsadoPct")
    bloco = {
        "disponivel": True,
        "coletadoEm": _sanear(dados.get("coletadoEm")) if dados.get("coletadoEm") else None,
        "idadeSegundos": idade,
        "atualizado": fresco,
        "itens": itens,
    }
    return bloco, (float(disco) if fresco and isinstance(disco, (int, float)) else None)


def fumaca() -> dict:
    """Último resultado do teste de fumaça — o canário de deriva do governo.

    Se vier `disponivel: false`, a tela DEVE mostrar aviso: significa que nada
    está vigiando mudança de layout do lado do governo automaticamente.
    """
    dados, motivo, idade = _ler_retrato(ARQUIVO_FUMACA)
    if dados is None:
        return {
            "disponivel": False,
            "motivo": motivo,
            "coberturaEmissao": False,
        }
    falhas = [_sanear(f) for f in (dados.get("falhas") or [])[:20]]
    return {
        "disponivel": True,
        "executadoEm": _sanear(dados.get("executadoEm")) if dados.get("executadoEm") else None,
        "idadeSegundos": idade,
        "atualizado": idade is not None and idade <= IDADE_MAXIMA_S,
        "modo": _sanear(dados.get("modo")) if dados.get("modo") else None,
        "resultado": _sanear(dados.get("resultado")) if dados.get("resultado") else None,
        "falhas": falhas,
        "detalhes": [_sanear(d) for d in (dados.get("detalhes") or [])[:20]],
        # False enquanto /admin/smoke devolver "nao_implementado": o teste raso
        # não prova emissão de verdade. Alarme honesto > alarme verde mentiroso.
        "coberturaEmissao": bool(dados.get("coberturaEmissao")),
    }


# =============================================================================
# Montagem
# =============================================================================
def metricas() -> dict:
    avisos: list[str] = []
    agora = time.time()
    uptime_servico = max(0.0, agora - _INICIADO_EM)

    dados_stacks, disco_do_host = stacks_da_box()

    box = metricas_da_box()
    nucleos = box["cpu"]["nucleos"]
    if disco_do_host is not None:
        # Medida do host ganha da do overlay quando existe e está fresca.
        box["disco"]["usadoPct"] = disco_do_host
        box["disco"]["fonte"] = "coletor do host (df /)"

    memoria = memoria_do_servico()
    oom = oom_do_servico()
    tmpfs = tmpfs_de_custodia()
    kek = diagnostico.checar_kek()

    try:
        cfg = get_config()
        producao_bloqueada = cfg.producao_bloqueada
        keks_configuradas = len(cfg.keks)
        kek_atual = cfg.kek_atual_id
        config_ok = True
    except ConfiguracaoInvalida:
        producao_bloqueada = None
        keks_configuradas = 0
        kek_atual = None
        config_ok = False
        avisos.append("Serviço sem configuração válida (token/KEK). Ele está recusando tudo.")

    servico = {
        "nome": "dominex-fiscal",
        "papel": "motor fiscal próprio: NFS-e (Sefin Nacional) + DF-e (SEFAZ/ADN)",
        "versaoApp": os.environ.get("FISCAL_APP_VERSION", "1.0.0"),
        "imagem": os.environ.get("FISCAL_IMAGE", "dominex-fiscal:local"),
        "revisao": os.environ.get("FISCAL_BUILD_REF") or None,
        "python": platform.python_version(),
        "iniciadoEm": _iso(_INICIADO_EM),
        "uptimeSegundos": int(uptime_servico),
        "memoria": memoria,
        "cpu": cpu_do_servico(uptime_servico, nucleos),
        "processos": processos_do_servico(),
        "oom": oom,
        "tmpfsCustodia": tmpfs,
    }

    custodia = {
        "ok": bool(kek.get("ok")) and bool(tmpfs.get("ok")),
        "kekAbreOQueFecha": bool(kek.get("ok")),
        "keksConfiguradas": keks_configuradas,
        "kekAtualId": kek_atual,
        "tmpfsConforme": bool(tmpfs.get("ok")) and tmpfs.get("emRam") is not False,
        # Contrato de desenho, não medição: este serviço não guarda certificado.
        "acervoNestaVps": False,
    }

    governo = {
        "versoesBibliotecas": diagnostico.versoes(),
        "producaoBloqueada": producao_bloqueada,
    }

    dados_fumaca = fumaca()

    # ---- Vereditos ---------------------------------------------------------
    if not kek.get("ok"):
        avisos.append(
            "A KEK não está abrindo o que ela mesma fecha — nenhum certificado "
            "de cliente pode ser usado. Incidente."
        )
    if not tmpfs.get("ok"):
        avisos.append("O tmpfs de custódia não está conforme (permissão/gravação).")
    if tmpfs.get("emRam") is False:
        avisos.append(
            "O diretório de custódia NÃO é tmpfs: chave privada de cliente "
            "tocaria disco. O container subiu sem o bloco tmpfs do compose?"
        )
    if oom.get("aconteceu"):
        avisos.append(
            "O serviço já tomou OOM desde que subiu — o limite de 512 MB está "
            "sendo batido. Investigar antes de subir o teto."
        )
    if (memoria.get("usoPct") or 0) >= LIMITE_RAM_SERVICO_PCT:
        avisos.append(
            f"Memória do serviço em {memoria.get('usoPct')}% do limite do container."
        )
    if (box["memoria"].get("usoPct") or 0) >= LIMITE_RAM_BOX_PCT:
        avisos.append(
            f"RAM da VPS em {box['memoria'].get('usoPct')}% — é a box COMPARTILHADA; "
            "saturar derruba também o WhatsApp do Dominex e do EcoSistema."
        )
    if (box["disco"].get("usadoPct") or 0) >= LIMITE_DISCO_PCT:
        avisos.append(
            f"Disco da VPS em {box['disco'].get('usadoPct')}% — encher derruba "
            "todos os produtos desta box."
        )
    if not dados_fumaca.get("disponivel"):
        avisos.append(
            "Teste de fumaça sem retrato: nada está vigiando automaticamente "
            "mudança de layout do lado do governo (RUNBOOK §6.1)."
        )
    elif dados_fumaca.get("resultado") == "falha":
        avisos.append("Último teste de fumaça FALHOU — ver bloco \"fumaca\".")
    elif not dados_fumaca.get("atualizado"):
        avisos.append("Retrato do teste de fumaça está velho — o timer pode ter parado.")
    if dados_fumaca.get("disponivel") and not dados_fumaca.get("coberturaEmissao"):
        avisos.append(
            "Cobertura RASA: o smoke não emite nota de verdade em homologação "
            "(pendência C6b, RUNBOOK §6.3). Deriva do lado do governo só "
            "apareceria numa nota de cliente."
        )

    # `ok` é saúde TÉCNICA do serviço. Coletor ausente e cobertura rasa são
    # aviso, não vermelho: senão a tela fica permanentemente em alarme por uma
    # lacuna conhecida e o operador para de olhar.
    ok = bool(
        config_ok
        and custodia["ok"]
        and not oom.get("aconteceu")
        and (memoria.get("usoPct") is None or memoria["usoPct"] < LIMITE_RAM_SERVICO_PCT)
        and (box["disco"].get("usadoPct") is None or box["disco"]["usadoPct"] < LIMITE_DISCO_PCT)
        and (
            box["memoria"].get("usoPct") is None
            or box["memoria"]["usoPct"] < LIMITE_RAM_BOX_PCT
        )
    )

    return {
        "ok": ok,
        "status": "ok" if ok else "degradado",
        "geradoEm": _iso(agora),
        "avisos": avisos,
        "servico": servico,
        "box": box,
        "stacks": dados_stacks,
        "custodia": custodia,
        "fumaca": dados_fumaca,
        "governo": governo,
    }
