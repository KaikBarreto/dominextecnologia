"""Construção pura dos eventos 110110/110111 e inutilização NF-e modelo 55.

Leiautes: pacotes oficiais de cancelamento/CC-e 1.00 e NF-e 4.00,
distribuídos no nfelib 3.2.0 já fixado pelo serviço. Nenhuma função faz IO fiscal.
"""

from __future__ import annotations

import re
import copy
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from lxml import etree

from ..sefaz.credencial import CredencialSefaz as CredencialFiscal
from .xml import NS, UF_CODES, ErroNfeLocal, _add, _dv, assinar_xml, validar_assinatura

EVENT_TYPES = {"cancellation": "110111", "correction": "110110"}
EVENT_VERSION = "1.00"
INVALIDATION_VERSION = "4.00"
CCE_CONDITIONS = (
    "A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, "
    "de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido "
    "na emissao de documento fiscal, desde que o erro nao esteja relacionado com: "
    "I - as variaveis que determinam o valor do imposto tais como: base de calculo, "
    "aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; "
    "II - a correcao de dados cadastrais que implique mudanca do remetente ou do "
    "destinatario; III - a data de emissao ou de saida."
)


def _number(value: int, field: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ErroNfeLocal(f"{field} fora do limite permitido.")
    return value


def _document(value: str, field: str, length: int) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{" + str(length) + "}", value):
        raise ErroNfeLocal(f"{field} inválido.")
    return value


def _text(value: str, field: str, maximum: int) -> str:
    result = re.sub(r"\s+", " ", str(value or "")).strip()
    if not 15 <= len(result) <= maximum or not re.fullmatch(r"[\x20-\xff]+", result):
        raise ErroNfeLocal(f"{field} deve ter entre 15 e {maximum} caracteres do padrão NF-e.")
    return result


def _context(uf: str, environment: str) -> tuple[str, str]:
    normalized = str(uf or "").upper()
    if normalized not in UF_CODES or environment not in {"production", "homologation"}:
        raise ErroNfeLocal("UF ou ambiente inválido para a operação NF-e.")
    return UF_CODES[normalized], "1" if environment == "production" else "2"


def validar_chave(
    key: str, uf: str, cnpj: str | None = None, *, model: str = "55"
) -> str:
    _document(key, "Chave NF-e", 44)
    if model not in {"55", "65"}:
        raise ErroNfeLocal("Modelo fiscal inválido para validar a chave.")
    if key[-1] != _dv(key[:43]) or key[:2] != UF_CODES.get(str(uf).upper()) or key[20:22] != model:
        raise ErroNfeLocal("Chave NF-e não corresponde à UF/modelo ou ao dígito verificador.")
    if cnpj is not None and key[6:20] != _document(cnpj, "CNPJ do emitente", 14):
        raise ErroNfeLocal("Chave NF-e não pertence ao emitente selecionado.")
    return key


def proxima_sequencia_cce(confirmed: list[int], *, pending: int | None = None) -> int:
    if pending is not None:
        raise ErroNfeLocal("Há CC-e pendente; reconcilie a mesma sequência antes de criar outra.")
    for sequence in confirmed:
        _number(sequence, "Sequência CC-e", 1, 20)
    ordered = sorted(set(confirmed))
    if ordered != list(range(1, len(ordered) + 1)):
        raise ErroNfeLocal("Histórico de CC-e incompleto; reconcilie as sequências existentes.")
    return _number(len(ordered) + 1, "Sequência CC-e", 1, 20)


def montar_evento(
    *, key: str, cnpj: str, uf: str, environment: str, kind: str, sequence: int,
    text: str, occurred_at: datetime, protocol: str | None = None,
    model: str = "55",
) -> tuple[str, str]:
    code, tp_amb = _context(uf, environment)
    validar_chave(key, uf, cnpj, model=model)
    if kind not in EVENT_TYPES:
        raise ErroNfeLocal("Tipo de evento NF-e não suportado.")
    if model == "65" and kind != "cancellation":
        raise ErroNfeLocal("NFC-e aceita apenas o evento de cancelamento neste motor.")
    _number(sequence, "Sequência do evento", 1, 1 if kind == "cancellation" else 20)
    if not isinstance(occurred_at, datetime) or occurred_at.utcoffset() is None:
        raise ErroNfeLocal("A data do evento precisa de fuso horário explícito.")
    detail = _text(text, "Justificativa" if kind == "cancellation" else "Correção", 255 if kind == "cancellation" else 1000)
    if kind == "cancellation":
        _document(protocol, "Protocolo de autorização", 15)
    elif protocol is not None:
        raise ErroNfeLocal("CC-e não recebe protocolo de autorização no detalhamento.")
    identity = f"ID{EVENT_TYPES[kind]}{key}{sequence:02d}"
    root = etree.Element(etree.QName(NS, "evento"), nsmap={None: NS}, versao=EVENT_VERSION)
    inf = etree.SubElement(root, etree.QName(NS, "infEvento"), Id=identity)
    for name, value in (
        ("cOrgao", code), ("tpAmb", tp_amb), ("CNPJ", cnpj), ("chNFe", key),
        ("dhEvento", occurred_at.isoformat(timespec="seconds")),
        ("tpEvento", EVENT_TYPES[kind]), ("nSeqEvento", sequence), ("verEvento", EVENT_VERSION),
    ):
        _add(inf, name, value)
    det = etree.SubElement(inf, etree.QName(NS, "detEvento"), versao=EVENT_VERSION)
    _add(det, "descEvento", "Cancelamento" if kind == "cancellation" else "Carta de Correcao")
    if kind == "cancellation":
        _add(det, "nProt", protocol)
        _add(det, "xJust", detail)
    else:
        _add(det, "xCorrecao", detail)
        _add(det, "xCondUso", CCE_CONDITIONS)
    return etree.tostring(root, encoding="unicode"), identity


def montar_inutilizacao(
    *, cnpj: str, uf: str, environment: str, year: int, series: int,
    first: int, last: int, justification: str,
) -> tuple[str, str]:
    code, tp_amb = _context(uf, environment)
    _document(cnpj, "CNPJ do emitente", 14)
    _number(year, "Ano completo", 2000, 2099)
    _number(series, "Série NF-e", 0, 889)
    _number(first, "Número inicial", 1, 999_999_999)
    _number(last, "Número final", first, min(first + 9999, 999_999_999))
    text = _text(justification, "Justificativa", 255)
    identity = f"ID{code}{year % 100:02d}{cnpj}55{series:03d}{first:09d}{last:09d}"
    root = etree.Element(etree.QName(NS, "inutNFe"), nsmap={None: NS}, versao=INVALIDATION_VERSION)
    inf = etree.SubElement(root, etree.QName(NS, "infInut"), Id=identity)
    for name, value in (
        ("tpAmb", tp_amb), ("xServ", "INUTILIZAR"), ("cUF", code), ("ano", f"{year % 100:02d}"),
        ("CNPJ", cnpj), ("mod", "55"), ("serie", series), ("nNFIni", first),
        ("nNFFin", last), ("xJust", text),
    ):
        _add(inf, name, value)
    return etree.tostring(root, encoding="unicode"), identity


@lru_cache(maxsize=8)
def _schema(kind: str, processed: bool = False) -> etree.XMLSchema:
    import nfelib
    files = {
        ("cancellation", False): "nfe_evento_cancel/schemas/v1_0/eventoCancNFe_v1.00.xsd",
        ("cancellation", True): "nfe_evento_cancel/schemas/v1_0/procEventoCancNFe_v1.00.xsd",
        ("correction", False): "nfe_evento_cce/schemas/v1_0/CCe_v1.00.xsd",
        ("correction", True): "nfe_evento_cce/schemas/v1_0/procCCeNFe_v1.00.xsd",
        ("invalidation", False): "nfe/schemas/v4_0/inutNFe_v4.00.xsd",
        ("invalidation", True): "nfe/schemas/v4_0/procInutNFe_v4.00.xsd",
    }
    if (kind, processed) not in files:
        raise ErroNfeLocal("Tipo de documento NF-e não suportado.")
    path = Path(nfelib.__path__[0]) / files[kind, processed]
    return etree.XMLSchema(etree.parse(str(path)))


def validar_documento(xml: str, kind: str, *, processed: bool = False) -> list[str]:
    try:
        root = etree.fromstring(xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
        if root.getroottree().docinfo.doctype:
            return ["Declarações DTD não são aceitas em documentos fiscais."]
        schema = _schema(kind, processed)
        if not schema.validate(root):
            # O texto do libxml inclui o valor fiscal rejeitado; não devolvê-lo em logs.
            return ["Documento inválido no schema oficial NF-e."]
    except (ValueError, etree.XMLSyntaxError):
        return ["Documento fiscal ilegível."]
    return []


def assinar_documento(xml: str, credential: CredencialFiscal, cnpj: str, kind: str) -> str:
    tag = "infInut" if kind == "invalidation" else "infEvento"
    try:
        root = etree.fromstring(xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
    except (ValueError, etree.XMLSyntaxError):
        raise ErroNfeLocal("Documento fiscal ilegível antes da assinatura.") from None
    if root.findtext(f"{{{NS}}}{tag}/{{{NS}}}CNPJ") != cnpj:
        raise ErroNfeLocal("O documento não pertence ao emitente selecionado para assinatura.")
    signed = assinar_xml(xml, credential, cnpj, information_tag=tag)
    errors = validar_documento(signed, kind) + validar_assinatura(signed, information_tag=tag)
    if errors:
        raise ErroNfeLocal("; ".join(errors))
    return signed


def validar_identidade(
    xml: str, kind: str, uf: str, environment: str, *, model: str = "55"
) -> None:
    """XSD verifica formato; o Id também precisa refletir os campos assinados."""
    code, tp_amb = _context(uf, environment)
    root = etree.fromstring(xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
    invalidation = kind == "invalidation"
    info = root.find(f"{{{NS}}}{'infInut' if invalidation else 'infEvento'}")
    if info is None or info.findtext(f"{{{NS}}}tpAmb") != tp_amb:
        raise ErroNfeLocal("Ambiente/identidade do documento diverge da rota fiscal.")
    if invalidation:
        try:
            _, identity = montar_inutilizacao(
                cnpj=info.findtext(f"{{{NS}}}CNPJ"), uf=uf, environment=environment,
                year=2000 + int(info.findtext(f"{{{NS}}}ano")),
                series=int(info.findtext(f"{{{NS}}}serie")),
                first=int(info.findtext(f"{{{NS}}}nNFIni")),
                last=int(info.findtext(f"{{{NS}}}nNFFin")),
                justification=info.findtext(f"{{{NS}}}xJust"),
            )
        except (ValueError, TypeError):
            raise ErroNfeLocal("Identidade da inutilização inválida.") from None
        if info.findtext(f"{{{NS}}}cUF") != code or info.findtext(f"{{{NS}}}mod") != "55":
            raise ErroNfeLocal("UF/modelo da inutilização diverge da rota fiscal.")
    else:
        key = validar_chave(
            info.findtext(f"{{{NS}}}chNFe"),
            uf,
            info.findtext(f"{{{NS}}}CNPJ"),
            model=model,
        )
        event_type = info.findtext(f"{{{NS}}}tpEvento")
        try:
            sequence = int(info.findtext(f"{{{NS}}}nSeqEvento"))
        except (ValueError, TypeError):
            raise ErroNfeLocal("Sequência do evento inválida.") from None
        _number(sequence, "Sequência do evento", 1, 1 if kind == "cancellation" else 20)
        if event_type != EVENT_TYPES.get(kind) or info.findtext(f"{{{NS}}}cOrgao") != code:
            raise ErroNfeLocal("Tipo/órgão do evento diverge da rota fiscal.")
        identity = f"ID{event_type}{key}{sequence:02d}"
    if info.get("Id") != identity:
        raise ErroNfeLocal("O identificador fiscal não corresponde aos campos do pedido.")


def montar_processado(signed: str, returned: str, kind: str) -> str:
    """Confronta a identidade fiscal completa antes de guardar prova conclusiva."""
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    try:
        request = etree.fromstring(signed.encode(), parser)
        response = etree.fromstring(returned.encode(), parser)
    except (ValueError, etree.XMLSyntaxError):
        raise ErroNfeLocal("XML processado ilegível.") from None
    invalidation = kind == "invalidation"
    info_tag = "infInut" if invalidation else "infEvento"
    if validar_documento(signed, kind) or validar_assinatura(signed, information_tag=info_tag):
        raise ErroNfeLocal("Pedido sem schema/assinatura válida para XML processado.")
    expected_root = "retInutNFe" if invalidation else "retEvento"
    if response.tag != f"{{{NS}}}{expected_root}":
        raise ErroNfeLocal("Tipo de retorno fiscal não corresponde ao pedido.")
    request_info = request.find(f"{{{NS}}}{info_tag}")
    response_info = response.find(f"{{{NS}}}{info_tag}")
    if request_info is None or response_info is None:
        raise ErroNfeLocal("Identidade fiscal ausente no XML processado.")
    fields = ("tpAmb", "cUF", "ano", "CNPJ", "mod", "serie", "nNFIni", "nNFFin") \
        if invalidation else ("tpAmb", "chNFe", "tpEvento", "nSeqEvento")
    for name in fields:
        expected = request_info.findtext(f"{{{NS}}}{name}")
        actual = response_info.findtext(f"{{{NS}}}{name}")
        if expected is None or actual is None or expected != actual:
            raise ErroNfeLocal("O retorno fiscal não corresponde à identidade do pedido.")
    status = response_info.findtext(f"{{{NS}}}cStat")
    accepted = {"102"} if invalidation else ({"135", "155"} if kind == "cancellation" else {"135"})
    if status not in accepted:
        raise ErroNfeLocal("O retorno não comprova conclusão da operação fiscal.")
    _document(response_info.findtext(f"{{{NS}}}nProt"), "Protocolo fiscal", 15)
    root = etree.Element(
        etree.QName(NS, "ProcInutNFe" if invalidation else "procEventoNFe"),
        nsmap={None: NS}, versao=INVALIDATION_VERSION if invalidation else EVENT_VERSION,
    )
    root.append(copy.deepcopy(request))
    root.append(copy.deepcopy(response))
    xml = etree.tostring(root, encoding="unicode")
    errors = validar_documento(xml, kind, processed=True)
    if errors:
        raise ErroNfeLocal("; ".join(errors))
    return xml
