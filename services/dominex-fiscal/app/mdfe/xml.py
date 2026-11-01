"""XML fiscal MDF-e. Não contém acesso à rede nem persistência."""

from __future__ import annotations

import base64
import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from importlib.resources import files
from pathlib import Path
from typing import Any
from ..config import VER_APLIC
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import Encoding
from cryptography.x509.oid import ObjectIdentifier
from lxml import etree

from ..sefaz.credencial import CredencialSefaz as CredencialFiscal

NS = "http://www.portalfiscal.inf.br/mdfe"
DS = "http://www.w3.org/2000/09/xmldsig#"
UF_CODIGOS = {
    "AC": "12",
    "AL": "27",
    "AP": "16",
    "AM": "13",
    "BA": "29",
    "CE": "23",
    "DF": "53",
    "ES": "32",
    "GO": "52",
    "MA": "21",
    "MT": "51",
    "MS": "50",
    "MG": "31",
    "PA": "15",
    "PB": "25",
    "PR": "41",
    "PE": "26",
    "PI": "22",
    "RJ": "33",
    "RN": "24",
    "RS": "43",
    "RO": "11",
    "RR": "14",
    "SC": "42",
    "SP": "35",
    "SE": "28",
    "TO": "17",
}


class ErroMdfeLocal(Exception):
    pass


def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _cpf_cnpj_valid(value: str) -> bool:
    if len(value) not in (11, 14) or value == value[0] * len(value):
        return False
    if len(value) == 11:
        weights = ((10, 9, 8, 7, 6, 5, 4, 3, 2), (11, 10, 9, 8, 7, 6, 5, 4, 3, 2))
    else:
        weights = (
            (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2),
            (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2),
        )
    digits = [int(x) for x in value]
    for index, weights_now in enumerate(weights):
        rest = sum(a * b for a, b in zip(digits[: len(weights_now)], weights_now)) % 11
        check = 0 if rest < 2 else 11 - rest
        if digits[len(weights_now)] != check:
            return False
    return True


def _nfe_key_valid(key: str) -> bool:
    return len(key) == 44 and key[20:22] == "55" and key[-1] == _dv(key[:-1])


def _text(value: Any, field: str, *, minimum: int = 1, maximum: int = 120) -> str:
    value = " ".join(str(value or "").split())
    if not minimum <= len(value) <= maximum:
        raise ErroMdfeLocal(
            f"{field} é obrigatório e deve ter entre {minimum} e {maximum} caracteres."
        )
    return value


def _number(value: Any, field: str, places: int) -> str:
    try:
        n = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ErroMdfeLocal(f"{field} inválido.") from None
    if not n.is_finite() or n < 0:
        raise ErroMdfeLocal(f"{field} não pode ser negativo.")
    return f"{n:.{places}f}"


def _add(parent, name: str, value: Any, **attrs):
    child = etree.SubElement(
        parent, etree.QName(NS, name), **{k: str(v) for k, v in attrs.items()}
    )
    child.text = value if isinstance(value, etree.CDATA) else str(value)
    return child


def _dv(key43: str) -> str:
    total, weight = 0, 2
    for char in reversed(key43):
        total += int(char) * weight
        weight = 2 if weight == 9 else weight + 1
    rest = total % 11
    return str(0 if rest in (0, 1) else 11 - rest)


def chave_acesso(
    manifest: dict[str, Any], fiscal: dict[str, Any], emitted_at: str, numeric_code: str
) -> str:
    cnpj = _digits(fiscal.get("cnpj"))
    if not _cpf_cnpj_valid(cnpj):
        raise ErroMdfeLocal("O CNPJ do emitente é obrigatório para gerar o MDF-e.")
    uf = str(fiscal.get("uf") or "").upper()
    if uf not in UF_CODIGOS:
        raise ErroMdfeLocal("A UF do emitente é inválida.")
    try:
        dt = datetime.fromisoformat(emitted_at.replace("Z", "+00:00")).astimezone(
            ZoneInfo("America/Sao_Paulo")
        )
    except ValueError:
        raise ErroMdfeLocal("A data de emissão do MDF-e é inválida.") from None
    serie = int(manifest.get("serie") or 0)
    number = int(manifest.get("mdfe_number") or 0)
    if (
        not 0 <= serie <= 999
        or not 1 <= number <= 999999999
        or not re.fullmatch(r"\d{8}", str(numeric_code))
    ):
        raise ErroMdfeLocal("Série, número ou código numérico do MDF-e inválidos.")
    raw = f"{UF_CODIGOS[uf]}{dt:%y%m}{cnpj}58{serie:03d}{number:09d}2{numeric_code}"
    return raw + _dv(raw)


def _predominant_product(
    invoices: list[dict[str, Any]],
) -> tuple[str, str | None, str | None] | None:
    """Extrai a descrição de maior valor do XML real; sem XML, não inventa produto."""
    best: tuple[Decimal, str, str | None, str | None] | None = None
    for invoice in invoices:
        xml = invoice.get("xml_content")
        if not isinstance(xml, str) or not xml.strip():
            continue
        try:
            root = etree.fromstring(
                xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
            )
        except (ValueError, etree.XMLSyntaxError):
            raise ErroMdfeLocal(
                "Uma NF-e vinculada tem XML inválido; confira a nota antes de emitir."
            ) from None
        for det in root.xpath("//*[local-name()='infNFe']/*[local-name()='det']"):
            prod = next((x for x in det if etree.QName(x).localname == "prod"), None)
            if prod is None:
                continue
            get = lambda n: next(
                (
                    str(x.text or "").strip()
                    for x in prod
                    if etree.QName(x).localname == n
                ),
                "",
            )
            desc, total = get("xProd"), get("vProd")
            if not desc:
                continue
            try:
                value = Decimal(total)
            except InvalidOperation:
                continue
            if best is None or value > best[0]:
                ean, ncm = get("cEAN"), get("NCM")
                best = (
                    value,
                    desc[:120],
                    ean if re.fullmatch(r"(?:SEM GTIN|\d{8}|\d{12,14})", ean) else None,
                    ncm if re.fullmatch(r"\d{2}|\d{8}", ncm) else None,
                )
    return None if best is None else (best[1], best[2], best[3])


def montar_assinado(
    job: dict[str, Any], credencial: CredencialFiscal
) -> tuple[str, str]:
    job = dict(job)
    job["emitted_at"] = (
        datetime.fromisoformat(str(job["emitted_at"]).replace("Z", "+00:00"))
        .astimezone(ZoneInfo("America/Sao_Paulo"))
        .isoformat(timespec="seconds")
    )
    snapshot = job.get("snapshot") or {}
    m = snapshot.get("manifest") or {}
    f = snapshot.get("fiscal_config") or {}
    invoices = snapshot.get("invoices") or []
    if str(m.get("modal") or "1") != "1" or str(m.get("tipo_emitente") or "2") != "2":
        raise ErroMdfeLocal(
            "Este motor de contingência suporta somente transporte rodoviário de carga própria."
        )
    if not isinstance(invoices, list) or not invoices:
        raise ErroMdfeLocal("Vincule ao menos uma NF-e autorizada ao MDF-e.")
    cnpj = _digits(f.get("cnpj"))
    ie = _digits(f.get("inscricao_estadual"))
    cpf_driver = _digits(m.get("condutor_cpf"))
    required = [(cnpj, "CNPJ do emitente", 14), (cpf_driver, "CPF do condutor", 11)]
    for value, name, length in required:
        if len(value) != length or not _cpf_cnpj_valid(value):
            raise ErroMdfeLocal(f"{name} inválida.")
    if not 2 <= len(ie) <= 14:
        raise ErroMdfeLocal("Inscrição estadual do emitente inválida.")
    if not isinstance(credencial.chave, rsa.RSAPrivateKey):
        raise ErroMdfeLocal("O certificado não usa chave RSA compatível com MDF-e.")
    validar_certificado_emitente(cnpj, credencial)
    key = chave_acesso(
        m, f, str(job.get("emitted_at") or ""), str(job.get("numeric_code") or "")
    )
    uf_emit = str(f.get("uf") or "").upper()
    tp_amb = "1" if job.get("environment") == "production" else "2"
    root = etree.Element(etree.QName(NS, "MDFe"), nsmap={None: NS})
    inf = etree.SubElement(
        root, etree.QName(NS, "infMDFe"), Id="MDFe" + key, versao="3.00"
    )
    ide = etree.SubElement(inf, etree.QName(NS, "ide"))
    for name, value in (
        ("cUF", UF_CODIGOS[uf_emit]),
        ("tpAmb", tp_amb),
        ("tpEmit", str(m.get("tipo_emitente") or "2")),
        ("mod", "58"),
        ("serie", str(int(m.get("serie") or 0))),
        ("nMDF", str(int(m.get("mdfe_number") or 0))),
        ("cMDF", str(job["numeric_code"])),
        ("cDV", key[-1]),
        ("modal", "1"),
        ("dhEmi", str(job["emitted_at"])),
        ("tpEmis", "2"),
        ("procEmi", "0"),
        ("verProc", VER_APLIC),
        ("UFIni", str(m.get("uf_carregamento") or "").upper()),
        ("UFFim", str(m.get("uf_descarregamento") or "").upper()),
    ):
        _add(ide, name, value)
    carreg = etree.SubElement(ide, etree.QName(NS, "infMunCarrega"))
    _add(carreg, "cMunCarrega", _digits(m.get("codigo_ibge_carregamento")))
    _add(
        carreg,
        "xMunCarrega",
        _text(m.get("cidade_carregamento"), "Município de carregamento", maximum=60),
    )
    for uf in m.get("percurso_ufs") or []:
        _add(
            etree.SubElement(ide, etree.QName(NS, "infPercurso")),
            "UFPer",
            str(uf).upper(),
        )
    emit = etree.SubElement(inf, etree.QName(NS, "emit"))
    _add(emit, "CNPJ", cnpj)
    _add(emit, "IE", ie)
    _add(emit, "xNome", _text(f.get("razao_social"), "Razão social", maximum=60))
    if f.get("nome_fantasia"):
        _add(emit, "xFant", _text(f.get("nome_fantasia"), "Nome fantasia", maximum=60))
    addr = etree.SubElement(emit, etree.QName(NS, "enderEmit"))
    for name, val, fld, size in (
        ("xLgr", f.get("logradouro"), "Logradouro", 60),
        ("nro", f.get("numero"), "Número", 60),
        ("xBairro", f.get("bairro"), "Bairro", 60),
        (
            "cMun",
            f.get("codigo_ibge") or f.get("codigo_municipio_ibge"),
            "Código IBGE do emitente",
            7,
        ),
        ("xMun", f.get("cidade"), "Cidade do emitente", 60),
        ("CEP", f.get("cep"), "CEP", 8),
        ("UF", uf_emit, "UF", 2),
    ):
        text = _digits(val) if name in ("cMun", "CEP") else val
        _add(
            addr,
            name,
            _text(
                text,
                fld,
                minimum=size if name in ("cMun", "CEP", "UF") else 1,
                maximum=size,
            ),
        )
    modal = etree.SubElement(inf, etree.QName(NS, "infModal"), versaoModal="3.00")
    rodo = etree.SubElement(modal, etree.QName(NS, "rodo"))
    if m.get("rntrc") or m.get("ciot") or m.get("contratante_cpf_cnpj"):
        antt = etree.SubElement(rodo, etree.QName(NS, "infANTT"))
        if m.get("rntrc"):
            rntrc = _digits(m["rntrc"])
            if len(rntrc) != 8:
                raise ErroMdfeLocal("O RNTRC informado é inválido.")
            _add(antt, "RNTRC", rntrc)
        if m.get("ciot"):
            ciot, responsible = _digits(m["ciot"]), _digits(m.get("ciot_cpf_cnpj"))
            if len(ciot) != 12 or not _cpf_cnpj_valid(responsible):
                raise ErroMdfeLocal(
                    "CIOT exige código de 12 dígitos e CPF/CNPJ do responsável."
                )
            ciot_node = etree.SubElement(antt, etree.QName(NS, "infCIOT"))
            _add(ciot_node, "CIOT", ciot)
            _add(ciot_node, "CPF" if len(responsible) == 11 else "CNPJ", responsible)
        if m.get("contratante_cpf_cnpj"):
            contractor = _digits(m["contratante_cpf_cnpj"])
            if not _cpf_cnpj_valid(contractor):
                raise ErroMdfeLocal("O CPF/CNPJ do contratante é inválido.")
            contractor_node = etree.SubElement(antt, etree.QName(NS, "infContratante"))
            if m.get("contratante_nome"):
                _add(
                    contractor_node,
                    "xNome",
                    _text(
                        m["contratante_nome"],
                        "Nome do contratante",
                        minimum=2,
                        maximum=60,
                    ),
                )
            _add(
                contractor_node, "CPF" if len(contractor) == 11 else "CNPJ", contractor
            )
    veic = etree.SubElement(rodo, etree.QName(NS, "veicTracao"))
    plate = re.sub(r"[^A-Z0-9]", "", str(m.get("placa_veiculo") or "").upper())
    if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", plate):
        raise ErroMdfeLocal("A placa do veículo é obrigatória e inválida.")
    _add(veic, "placa", plate)
    _add(veic, "tara", str(int(m.get("tara_veiculo"))))
    if m.get("capacidade_kg") is not None:
        _add(veic, "capKG", str(int(m["capacidade_kg"])))
    if m.get("capacidade_m3") is not None:
        _add(veic, "capM3", str(int(m["capacidade_m3"])))
    driver = etree.SubElement(veic, etree.QName(NS, "condutor"))
    _add(driver, "xNome", _text(m.get("condutor_nome"), "Nome do condutor", maximum=60))
    _add(driver, "CPF", cpf_driver)
    _add(
        veic,
        "tpRod",
        _text(m.get("tipo_rodado"), "Tipo de rodado", minimum=2, maximum=2),
    )
    _add(
        veic,
        "tpCar",
        _text(m.get("tipo_carroceria"), "Tipo de carroceria", minimum=2, maximum=2),
    )
    _add(
        veic,
        "UF",
        _text(m.get("uf_veiculo"), "UF do veículo", minimum=2, maximum=2).upper(),
    )
    reboques = m.get("reboques") or []
    if not isinstance(reboques, list) or len(reboques) > 3:
        raise ErroMdfeLocal("A composição pode ter no máximo três reboques.")
    for position, trailer in enumerate(reboques, start=1):
        if not isinstance(trailer, dict):
            raise ErroMdfeLocal(f"O {position}º reboque está inválido.")
        trailer_plate = re.sub(
            r"[^A-Z0-9]", "", str(trailer.get("placa") or "").upper()
        )
        if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", trailer_plate):
            raise ErroMdfeLocal(f"A placa do {position}º reboque é inválida.")
        try:
            tara, capacity = (
                int(trailer.get("tara_kg")),
                int(trailer.get("capacidade_kg")),
            )
        except (TypeError, ValueError):
            raise ErroMdfeLocal(
                f"Tara e capacidade do {position}º reboque são obrigatórias."
            ) from None
        if not 0 <= tara <= 999999 or not 0 <= capacity <= 999999:
            raise ErroMdfeLocal(
                f"Tara ou capacidade do {position}º reboque é inválida."
            )
        trailer_node = etree.SubElement(rodo, etree.QName(NS, "veicReboque"))
        _add(trailer_node, "placa", trailer_plate)
        _add(trailer_node, "tara", tara)
        _add(trailer_node, "capKG", capacity)
        if trailer.get("capacidade_m3") is not None:
            capacity_m3 = int(trailer["capacidade_m3"])
            if not 0 <= capacity_m3 <= 999:
                raise ErroMdfeLocal(
                    f"A capacidade em m³ do {position}º reboque é inválida."
                )
            _add(trailer_node, "capM3", capacity_m3)
        _add(
            trailer_node,
            "tpCar",
            _text(
                trailer.get("tipo_carroceria"),
                f"Tipo de carroceria do {position}º reboque",
                minimum=2,
                maximum=2,
            ),
        )
        _add(
            trailer_node,
            "UF",
            _text(
                trailer.get("uf_licenciamento"),
                f"UF do {position}º reboque",
                minimum=2,
                maximum=2,
            ).upper(),
        )
    docs = etree.SubElement(inf, etree.QName(NS, "infDoc"))
    unload = etree.SubElement(docs, etree.QName(NS, "infMunDescarga"))
    _add(unload, "cMunDescarga", _digits(m.get("codigo_ibge_descarregamento")))
    _add(
        unload,
        "xMunDescarga",
        _text(
            m.get("cidade_descarregamento"), "Município de descarregamento", maximum=60
        ),
    )
    for invoice in invoices:
        nfe = _digits(invoice.get("nfe_key"))
        if not _nfe_key_valid(nfe):
            raise ErroMdfeLocal("Há NF-e vinculada sem chave de acesso válida.")
        _add(etree.SubElement(unload, etree.QName(NS, "infNFe")), "chNFe", nfe)
    extracted = _predominant_product(invoices)
    cargo_type = str(m.get("tipo_carga") or "")
    description = _text(
        m.get("descricao_produto_predominante") or (extracted[0] if extracted else ""),
        "Produto predominante",
        minimum=2,
        maximum=120,
    )
    ncm = _digits(
        m.get("ncm_produto_predominante") or (extracted[2] if extracted else "")
    )
    if cargo_type not in {f"{i:02d}" for i in range(1, 13)} or len(ncm) != 8:
        raise ErroMdfeLocal(
            "Tipo de carga (01 a 12) e NCM de 8 dígitos são obrigatórios para o produto predominante."
        )
    prod = etree.SubElement(inf, etree.QName(NS, "prodPred"))
    _add(prod, "tpCarga", cargo_type)
    _add(prod, "xProd", description)
    _add(prod, "NCM", ncm)
    if len(invoices) == 1:
        loading_cep, unloading_cep = (
            _digits(m.get("cep_carregamento")),
            _digits(m.get("cep_descarregamento")),
        )
        if len(loading_cep) != 8 or len(unloading_cep) != 8:
            raise ErroMdfeLocal(
                "CEP de carregamento e descarregamento são obrigatórios para MDF-e com uma única NF-e."
            )
        load = etree.SubElement(prod, etree.QName(NS, "infLotacao"))
        _add(
            etree.SubElement(load, etree.QName(NS, "infLocalCarrega")),
            "CEP",
            loading_cep,
        )
        _add(
            etree.SubElement(load, etree.QName(NS, "infLocalDescarrega")),
            "CEP",
            unloading_cep,
        )
    total = etree.SubElement(inf, etree.QName(NS, "tot"))
    _add(total, "qNFe", str(len(invoices)))
    _add(
        total, "vCarga", _number(m.get("valor_total_carga"), "Valor total da carga", 2)
    )
    _add(total, "cUnid", "01")
    _add(total, "qCarga", _number(m.get("peso_bruto_total"), "Peso bruto total", 4))
    if m.get("observacoes"):
        additional = etree.SubElement(inf, etree.QName(NS, "infAdic"))
        _add(additional, "infCpl", _text(m["observacoes"], "Observações", maximum=2000))
    if uf_emit in {"AM", "MS", "PE", "PR", "SC", "TO"}:
        source = snapshot.get("responsavel_tecnico") or f.get("responsavel_tecnico")
        if not isinstance(source, dict):
            raise ErroMdfeLocal(
                "A UF do emitente exige o cadastro do responsável técnico para o MDF-e."
            )
        resp = etree.SubElement(inf, etree.QName(NS, "infRespTec"))
        _add(resp, "CNPJ", _digits(source.get("cpfCnpj") or source.get("cnpj")))
        _add(resp, "xContato", _text(
            source.get("contato") or source.get("xContato"),
            "Contato do responsável técnico", maximum=60,
        ))
        _add(resp, "email", _text(source.get("email"), "E-mail do responsável técnico", maximum=60))
        _add(resp, "fone", _digits(source.get("telefone") or source.get("fone")))
    root = _signature(root, inf, credencial)
    qr_signature = base64.b64encode(
        credencial.chave.sign(key.encode("ascii"), padding.PKCS1v15(), hashes.SHA1())
    ).decode("ascii")
    qr = etree.Element(etree.QName(NS, "infMDFeSupl"))
    _add(
        qr,
        "qrCodMDFe",
        etree.CDATA(f"https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe={key}&tpAmb={tp_amb}&sign={qr_signature}"),
    )
    root.insert(1, qr)
    _reassinar_final(root, credencial)
    xml = etree.tostring(
        root, encoding="UTF-8", xml_declaration=True, pretty_print=False
    ).decode()
    validar_xsd(xml)
    return xml, key


def validar_certificado_emitente(cnpj: str, credencial: CredencialFiscal) -> None:
    now = datetime.now(timezone.utc)
    if (
        not credencial.certificado.not_valid_before_utc
        <= now
        <= credencial.certificado.not_valid_after_utc
    ):
        raise ErroMdfeLocal("O certificado digital está fora do período de validade.")
    candidates = [
        str(attr.value)
        for attr in credencial.certificado.subject
        if attr.oid.dotted_string in {"2.5.4.3", "2.5.4.5"}
    ]
    try:
        from cryptography import x509

        san = credencial.certificado.extensions.get_extension_for_class(
            x509.SubjectAlternativeName
        ).value
        cnpj_oid = ObjectIdentifier("2.16.76.1.3.3")
        candidates.extend(
            name.value.decode("latin1", "ignore")
            for name in san
            if getattr(name, "type_id", None) == cnpj_oid
            and isinstance(getattr(name, "value", None), bytes)
        )
    except Exception:
        pass
    if not any(cnpj in re.findall(r"\d{14}", candidate) for candidate in candidates):
        raise ErroMdfeLocal(
            "O certificado digital não pertence ao CNPJ do emitente selecionado."
        )


def montar_evento_assinado(job: dict[str, Any], credencial: CredencialFiscal) -> str:
    """Monta cancelamento/encerramento MDF-e v3.00 sem reutilizar namespace NF-e."""
    snapshot = job.get("snapshot") or {}
    manifest = snapshot.get("manifest") or {}
    fiscal = snapshot.get("fiscal_config") or {}
    key = _digits(job.get("key"))
    protocol = _digits(job.get("protocol"))
    cnpj = _digits(fiscal.get("cnpj"))
    if (len(key) != 44 or len(protocol) != 15 or not _cpf_cnpj_valid(cnpj)
        or key[6:20] != cnpj or key[20:22] != "58" or key[-1] != _dv(key[:-1])):
        raise ErroMdfeLocal(
            "MDF-e autorizado sem chave, protocolo ou emitente válido para o evento."
        )
    validar_certificado_emitente(cnpj, credencial)
    action = job.get("action")
    if action not in ("cancel", "enclose"):
        raise ErroMdfeLocal("Ação de evento MDF-e inválida.")
    try:
        event_at = datetime.fromisoformat(
            str(job.get("event_at") or "").replace("Z", "+00:00")
        )
    except ValueError:
        raise ErroMdfeLocal("A data do evento MDF-e é inválida.") from None
    if event_at.tzinfo is None:
        raise ErroMdfeLocal("A data do evento MDF-e precisa informar o fuso horário.")
    event_at = event_at.astimezone(ZoneInfo("America/Sao_Paulo"))
    code = "110111" if action == "cancel" else "110112"
    root = etree.Element(etree.QName(NS, "eventoMDFe"), nsmap={None: NS}, versao="3.00")
    event = etree.SubElement(root, etree.QName(NS, "infEvento"), Id=f"ID{code}{key}01")
    tp_amb = "1" if job.get("environment") == "production" else "2"
    for name, value in (
        ("cOrgao", key[:2]),
        ("tpAmb", tp_amb),
        ("CNPJ", cnpj),
        ("chMDFe", key),
        ("dhEvento", event_at.isoformat(timespec="seconds")),
        ("tpEvento", code),
        ("nSeqEvento", "1"),
    ):
        _add(event, name, value)
    detail = etree.SubElement(event, etree.QName(NS, "detEvento"), versaoEvento="3.00")
    if action == "cancel":
        reason = _text(
            job.get("event_reason"),
            "Justificativa do cancelamento",
            minimum=15,
            maximum=255,
        )
        data = etree.SubElement(detail, etree.QName(NS, "evCancMDFe"))
        _add(data, "descEvento", "Cancelamento")
        _add(data, "nProt", protocol)
        _add(data, "xJust", reason)
    else:
        uf = str(manifest.get("uf_descarregamento") or "").upper()
        city = _digits(manifest.get("codigo_ibge_descarregamento"))
        if uf not in UF_CODIGOS or len(city) != 7:
            raise ErroMdfeLocal(
                "UF e município reais de encerramento são obrigatórios para encerrar o MDF-e."
            )
        data = etree.SubElement(detail, etree.QName(NS, "evEncMDFe"))
        _add(data, "descEvento", "Encerramento")
        _add(data, "nProt", protocol)
        _add(data, "dtEnc", event_at.date().isoformat())
        _add(data, "cUF", UF_CODIGOS[uf])
        _add(data, "cMun", city)
    root = _signature(root, event, credencial)
    _reassinar_final(root, credencial)
    xml = etree.tostring(
        root, encoding="UTF-8", xml_declaration=True, pretty_print=False
    ).decode()
    base = files("nfelib.mdfe.schemas.v3_0")
    event_schema = etree.XMLSchema(
        etree.parse(str(base.joinpath("eventoMDFe_v3.00.xsd")))
    )
    specific = etree.XMLSchema(
        etree.parse(
            str(
                base.joinpath(
                    "evCancMDFe_v3.00.xsd"
                    if action == "cancel"
                    else "evEncMDFe_v3.00.xsd"
                )
            )
        )
    )
    if not event_schema.validate(
        etree.fromstring(xml.encode())
    ) or not specific.validate(data):
        raise ErroMdfeLocal(
            "O evento MDF-e não passou na validação do leiaute oficial."
        )
    return xml


def montar_evento_processado(signed_xml: str, key: str, response_xml: str) -> str:
    """Preserva o pedido assinado junto ao retorno vinculado do mesmo evento."""
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    try:
        event = etree.fromstring(signed_xml.encode(), parser)
        response = etree.fromstring(response_xml.encode(), parser)
    except (ValueError, etree.XMLSyntaxError):
        raise ErroMdfeLocal("O retorno do evento MDF-e está inválido.") from None
    if event.getroottree().docinfo.doctype or response.getroottree().docinfo.doctype:
        raise ErroMdfeLocal("O retorno do evento MDF-e está inválido.")
    request = event.find(f"{{{NS}}}infEvento")
    if event.tag != f"{{{NS}}}eventoMDFe" or request is None:
        raise ErroMdfeLocal("O pedido de evento MDF-e está incompleto.")
    field = lambda node, name: node.findtext(f"{{{NS}}}{name}")
    if field(request, "chMDFe") != key:
        raise ErroMdfeLocal("O evento não corresponde à chave do MDF-e.")
    matches = []
    for returned in response.iter(f"{{{NS}}}retEventoMDFe"):
        info = returned.find(f"{{{NS}}}infEvento")
        if info is None or any(field(info, name) != field(request, name)
                               for name in ("chMDFe", "tpEvento", "nSeqEvento", "tpAmb")):
            continue
        code, status = field(info, "tpEvento"), field(info, "cStat")
        if (code not in {"110111", "110112"} or status not in {"135", "136", "155"}
            or (status == "155" and code != "110111")
            or not re.fullmatch(r"\d{15}", field(info, "nProt") or "")):
            continue
        matches.append(returned)
    if len(matches) != 1:
        raise ErroMdfeLocal("A SEFAZ não confirmou o protocolo deste evento MDF-e.")
    proc = etree.Element(etree.QName(NS, "procEventoMDFe"), nsmap={None: NS}, versao="3.00")
    proc.append(event)
    proc.append(matches[0])
    schema = etree.XMLSchema(etree.parse(str(files("nfelib.mdfe.schemas.v3_0").joinpath("procEventoMDFe_v3.00.xsd"))))
    if not schema.validate(proc):
        raise ErroMdfeLocal("O evento processado MDF-e não passou no leiaute oficial.")
    return etree.tostring(proc, encoding="UTF-8", xml_declaration=True).decode()


def montar_processado(signed_xml: str, key: str, protocol_xml: str | None) -> str:
    """Anexa o protMDFe original da SEFAZ; o XML assinado não é reescrito."""
    if not re.fullmatch(r"\d{44}", key) or not protocol_xml:
        raise ErroMdfeLocal("A autorização da SEFAZ não trouxe protocolo válido.")
    mdfe = etree.fromstring(signed_xml.encode())
    found = mdfe.find(f".//{{{NS}}}infMDFe")
    if found is None or found.get("Id") != "MDFe" + key:
        raise ErroMdfeLocal("A resposta da SEFAZ não corresponde ao MDF-e transmitido.")
    try:
        protocol = etree.fromstring(protocol_xml.encode())
    except etree.XMLSyntaxError:
        raise ErroMdfeLocal(
            "A SEFAZ devolveu um protocolo de autorização inválido."
        ) from None
    if etree.QName(protocol).localname != "protMDFe":
        raise ErroMdfeLocal("A SEFAZ não devolveu o protocolo MDF-e esperado.")
    if (
        protocol.findtext(f".//{{{NS}}}chMDFe") != key
        or not protocol.findtext(f".//{{{NS}}}nProt")
        or protocol.findtext(f".//{{{NS}}}cStat") != "100"
    ):
        raise ErroMdfeLocal("O protocolo retornado não autoriza este MDF-e.")
    proc = etree.Element(etree.QName(NS, "mdfeProc"), nsmap={None: NS}, versao="3.00")
    proc.append(mdfe)
    proc.append(protocol)
    return etree.tostring(
        proc, encoding="UTF-8", xml_declaration=True, pretty_print=False
    ).decode()


def _signature(root, inf, credential: CredencialFiscal):
    sig = etree.Element(etree.QName(DS, "Signature"), nsmap={"ds": DS})
    si = etree.SubElement(sig, etree.QName(DS, "SignedInfo"))
    etree.SubElement(
        si,
        etree.QName(DS, "CanonicalizationMethod"),
        Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    etree.SubElement(
        si,
        etree.QName(DS, "SignatureMethod"),
        Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    )
    ref = etree.SubElement(si, etree.QName(DS, "Reference"), URI="#" + inf.get("Id"))
    trs = etree.SubElement(ref, etree.QName(DS, "Transforms"))
    etree.SubElement(
        trs,
        etree.QName(DS, "Transform"),
        Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature",
    )
    etree.SubElement(
        trs,
        etree.QName(DS, "Transform"),
        Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    etree.SubElement(
        ref,
        etree.QName(DS, "DigestMethod"),
        Algorithm="http://www.w3.org/2000/09/xmldsig#sha1",
    )
    digest = etree.SubElement(ref, etree.QName(DS, "DigestValue"))
    value = etree.SubElement(sig, etree.QName(DS, "SignatureValue"))
    ki = etree.SubElement(sig, etree.QName(DS, "KeyInfo"))
    xd = etree.SubElement(ki, etree.QName(DS, "X509Data"))
    etree.SubElement(xd, etree.QName(DS, "X509Certificate")).text = base64.b64encode(
        credential.certificado.public_bytes(Encoding.DER)
    ).decode()
    root.append(sig)
    return root


def _reassinar_final(root, credential: CredencialFiscal) -> None:
    inf = root.find(f".//{{{NS}}}infMDFe")
    if inf is None:
        inf = root.find(f".//{{{NS}}}infEvento")
    si = root.find(f".//{{{DS}}}SignedInfo")
    digest = root.find(f".//{{{DS}}}DigestValue")
    value = root.find(f".//{{{DS}}}SignatureValue")
    if inf is None or si is None or digest is None or value is None:
        raise ErroMdfeLocal("Assinatura XMLDSig incompleta.")
    # SignXML serializa e reparseia o payload da referência antes do C14N.
    # Repetir este passo evita deriva de namespace herdado no fragmento infMDFe.
    payload = etree.fromstring(etree.tostring(inf))
    digest.text = base64.b64encode(
        hashlib.sha1(
            etree.tostring(payload, method="c14n", exclusive=False, with_comments=False)
        ).digest()
    ).decode()
    value.text = base64.b64encode(
        credential.chave.sign(
            etree.tostring(si, method="c14n", exclusive=False, with_comments=False),
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
    ).decode()


def validar_xsd(xml: str) -> None:
    root = etree.fromstring(xml.encode())
    base = files("nfelib.mdfe.schemas.v3_0")
    # MDFe é tipo, não elemento global no schema principal; valida-se no envelope
    # oficial enviMDFe, sem alterar o XML que será transmitido no serviço síncrono.
    envelope = etree.Element(etree.QName(NS, "enviMDFe"), versao="3.00")
    _add(envelope, "idLote", "1")
    envelope.append(root)
    schema_file = Path(str(base.joinpath("enviMDFe_v3.00.xsd")))
    schema = etree.XMLSchema(etree.parse(str(schema_file)))
    if not schema.validate(envelope):
        raise ErroMdfeLocal("O XML MDF-e não passou na validação do leiaute oficial.")
    modal_file = Path(str(base.joinpath("mdfeModalRodoviario_v3.00.xsd")))
    modal_schema = etree.XMLSchema(etree.parse(str(modal_file)))
    rodo = root.find(f".//{{{NS}}}rodo")
    if rodo is None or not modal_schema.validate(rodo):
        raise ErroMdfeLocal("Os dados rodoviários não passaram no leiaute oficial.")
