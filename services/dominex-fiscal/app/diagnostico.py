"""Autodiagnóstico do serviço (`/readyz` e `/admin/smoke`).

Existe por causa do risco R2 do plano: **a biblioteca fiscal fica atrás do
servidor do governo**. A `nfelib` já estava desatualizada no primeiro dia
(armadilha 6). Sem um canário, a gente só descobre que o layout mudou quando o
cliente não consegue faturar.

⚠️ NENHUM certificado de cliente é usado aqui. O autoteste de assinatura gera um
par efêmero próprio, na memória do processo.
"""

from __future__ import annotations

import os
import secrets
import socket
import stat
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from urllib.parse import urlparse

from .config import get_config


def versoes() -> dict:
    from importlib import metadata

    saida = {}
    for pacote in ("nfelib", "signxml", "xsdata", "lxml", "cryptography", "requests"):
        try:
            saida[pacote] = metadata.version(pacote)
        except Exception:
            saida[pacote] = "?"
    return saida


@lru_cache(maxsize=1)
def _par_efemero() -> tuple:
    """Chave/cert autoassinados, só para provar que a assinatura funciona."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "dominex-fiscal-selfcheck")])
    agora = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(nome)
        .issuer_name(nome)
        .public_key(chave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - timedelta(days=1))
        .not_valid_after(agora + timedelta(days=1))
        .sign(chave, hashes.SHA256())
    )
    return (
        chave.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ),
        cert.public_bytes(serialization.Encoding.PEM),
    )


def checar_kek() -> dict:
    """Prova que a KEK abre o que ela mesma fecha (cifra→decifra completo)."""
    try:
        cfg = get_config()
        from .custodia import abrir, selar

        empresa = "00000000-0000-4000-8000-000000000000"
        envelope = selar(b"pfx-de-mentira", "senha", empresa, cfg)
        pfx, senha = abrir(envelope, empresa, cfg)
        ok = pfx == b"pfx-de-mentira" and senha == "senha"
        return {"ok": ok, "keks": len(cfg.keks), "atual": cfg.kek_atual_id}
    except Exception as exc:
        return {"ok": False, "erro": type(exc).__name__}


def checar_tmpfs() -> dict:
    """O diretório do material efêmero precisa existir, ser gravável e privado."""
    cfg = get_config()
    caminho = cfg.tmpfs_dir
    resultado = {"ok": False, "dir": caminho}
    try:
        os.makedirs(caminho, mode=0o700, exist_ok=True)
        modo = stat.S_IMODE(os.stat(caminho).st_mode)
        resultado["modo"] = oct(modo)
        teste = os.path.join(caminho, f"selfcheck-{secrets.token_hex(6)}")
        fd = os.open(teste, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(fd, b"x")
        os.close(fd)
        os.remove(teste)
        resultado["gravavel"] = True
        # tmpfs de verdade? Em disco persistente isso vira achado de auditoria.
        em_ram = False
        try:
            with open("/proc/mounts", "r", encoding="utf-8") as fh:
                em_ram = any(
                    linha.split()[1] == caminho and linha.split()[2] == "tmpfs"
                    for linha in fh
                    if len(linha.split()) > 2
                )
        except OSError:
            em_ram = None  # fora do Linux (dev local) — não dá para saber
        resultado["em_ram"] = em_ram

        # ⚠️ Acrescentado pela Infra (C1): não basta ser tmpfs — precisa estar
        # montado com noexec/nosuid. Se alguém subir o container sem o bloco
        # `tmpfs:` do compose (ou afrouxar as opções), o PEM do cliente passa a
        # viver num diretório mais permissivo do que o desenho prevê. Preferimos
        # descobrir no /readyz do que numa auditoria.
        opcoes = None
        try:
            with open("/proc/mounts", "r", encoding="utf-8") as fh:
                for linha in fh:
                    campos = linha.split()
                    if len(campos) > 3 and campos[1] == caminho:
                        opcoes = campos[3].split(",")
                        break
        except OSError:
            opcoes = None
        if opcoes is not None:
            resultado["noexec"] = "noexec" in opcoes
            resultado["nosuid"] = "nosuid" in opcoes

        resultado["ok"] = bool(resultado["gravavel"]) and modo & 0o077 == 0
    except Exception as exc:
        resultado["erro"] = type(exc).__name__
    return resultado


def checar_assinatura() -> dict:
    """Monta uma DPS de mentira, assina e confere as armadilhas 1, 2, 3, 4 e 6.

    É o canário de esteira de layout: quando a biblioteca subir de versão e
    mudar o comportamento, isto quebra no `/readyz` — e não na nota do cliente.
    """
    try:
        from lxml import etree

        from .schemas import EmitirRequest
        from .sefin.assinatura import XMLDSIG, assinar
        from .sefin.dps import montar
        from .sefin.evento import montar_cancelamento

        pedido = EmitirRequest.model_validate(_PEDIDO_DE_MENTIRA)
        xml = montar(pedido)
        chave, cert = _par_efemero()
        assinado = assinar(xml, chave, cert)

        raiz = etree.fromstring(assinado)
        ns = {"n": "http://www.sped.fazenda.gov.br/nfse"}
        problemas = []
        if not raiz.xpath("//n:cServ/n:cTribMun", namespaces=ns):
            problemas.append("cTribMun ausente (armadilha 1)")
        if raiz.xpath("//n:prest/n:xNome", namespaces=ns):
            problemas.append("prest/xNome presente (armadilha 2)")
        if raiz.xpath("//n:prest/n:end", namespaces=ns):
            problemas.append("prest/end presente (armadilha 3)")
        assinaturas = raiz.xpath("//*[local-name()='Signature']")
        if not assinaturas:
            problemas.append("XML sem assinatura")
        else:
            for elemento in assinaturas[0].iter():
                if isinstance(elemento.tag, str) and elemento.tag.startswith("{" + XMLDSIG):
                    if elemento.prefix is not None:
                        problemas.append("assinatura com prefixo de namespace (armadilha 4)")
                        break
            uris = raiz.xpath("//*[local-name()='Reference']/@URI")
            if uris != ["#" + pedido.dps.id]:
                problemas.append("referência da assinatura não aponta para o infDPS")

        evento = montar_cancelamento(
            chave="3" * 50,
            cnpj_autor="34901457000199",
            motivo="Autoteste do servico fiscal.",
        )
        if b"nPedRegEvento" in evento:
            problemas.append("nPedRegEvento presente (armadilha 6)")
        ide = etree.fromstring(evento).xpath("//n:infPedReg/@Id", namespaces=ns)
        if not ide or len(ide[0][3:]) != 56:
            problemas.append("Id do evento fora do formato de 56 dígitos (armadilha 5)")

        return {"ok": not problemas, "problemas": problemas}
    except Exception as exc:
        return {"ok": False, "erro": f"{type(exc).__name__}: {exc}"}


def checar_egresso() -> dict:
    """Prova que a VPS alcança o governo (TCP + TLS), sem emitir nada."""
    cfg = get_config()
    alvo = urlparse(cfg.base_homologacao)
    host = alvo.hostname or ""
    try:
        with socket.create_connection((host, 443), timeout=8):
            return {"ok": True, "host": host}
    except OSError as exc:
        return {"ok": False, "host": host, "erro": type(exc).__name__}


def readyz(profundo: bool = False) -> dict:
    cfg_ok = True
    try:
        get_config()
    except Exception:
        cfg_ok = False

    checks = {
        "token": {"ok": cfg_ok},
        "kek": checar_kek(),
        "tmpfs": checar_tmpfs(),
        "versoes": versoes(),
    }
    if profundo:
        checks["assinatura"] = checar_assinatura()
        checks["egresso"] = checar_egresso()

    ok = all(
        v.get("ok", True)
        for k, v in checks.items()
        if isinstance(v, dict) and k != "versoes"
    )
    return {"ok": ok, "checks": checks}


#: Dados fictícios (CNPJ de teste, sem correspondência real) só para o autoteste.
_PEDIDO_DE_MENTIRA = {
    "empresaId": "00000000-0000-4000-8000-000000000000",
    "ambiente": 2,
    "certificado": {
        "pfxCifradoB64": "x",
        "dekEnvelopadaB64": "x",
        "senhaCifradaB64": "x",
        "nonceB64": "",
    },
    "dps": {
        "id": "DPS" + "3304557" + "2" + "34901457000199" + "00001" + "000000000000001",
        "serie": "00001",
        "numero": "1",
        "dataCompetencia": "2026-01-01",
        "codigoMunicipioEmissor": "3304557",
    },
    "prestador": {
        "tipoInscricao": "2",
        "inscricaoFederal": "34901457000199",
        "opSimpNac": "3",
        "regApTribSN": "1",
    },
    "tomador": {
        "tipoInscricao": "2",
        "inscricaoFederal": "66730202000105",
        "razaoSocial": "AUTOTESTE",
    },
    "servico": {
        "codigoServico": "140101",
        "codigoNbs": "120016000",
        "municipioIncidencia": "3304557",
        "discriminacao": "Autoteste do servico fiscal.",
        "codigoTributacaoMunicipal": "001",
    },
    "valores": {"valorServico": 1.0, "tribIssqn": "1", "tpRetIssqn": "1"},
}
