from __future__ import annotations

import base64
import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from zoneinfo import ZoneInfo

from lxml import etree

from ..config import VER_APLIC
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import Encoding
from cryptography.x509.oid import ObjectIdentifier

from ..sefaz.credencial import CredencialSefaz as CredencialFiscal

NS = "http://www.portalfiscal.inf.br/nfe"
DS = "http://www.w3.org/2000/09/xmldsig#"
UF_CODES = {
    "RO": "11", "AC": "12", "AM": "13", "RR": "14", "PA": "15", "AP": "16",
    "TO": "17", "MA": "21", "PI": "22", "CE": "23", "RN": "24", "PB": "25",
    "PE": "26", "AL": "27", "SE": "28", "BA": "29", "MG": "31", "ES": "32",
    "RJ": "33", "SP": "35", "PR": "41", "SC": "42", "RS": "43", "MS": "50",
    "MT": "51", "GO": "52", "DF": "53",
}


class ErroNfeLocal(Exception):
    """Snapshot impossível de representar com segurança no layout oficial."""


def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _text(value: Any, field: str, *, minimum: int = 1, maximum: int = 60) -> str:
    result = re.sub(r"\s+", " ", str(value or "")).strip()
    if not minimum <= len(result) <= maximum:
        raise ErroNfeLocal(f"{field} deve ter entre {minimum} e {maximum} caracteres.")
    return result


def _decimal(value: Any, field: str, places: int = 2) -> Decimal:
    try:
        number = Decimal(str(value if value is not None else 0))
    except (InvalidOperation, ValueError):
        raise ErroNfeLocal(f"{field} inválido.") from None
    if not number.is_finite() or number < 0:
        raise ErroNfeLocal(f"{field} não pode ser negativo.")
    quantum = Decimal(1).scaleb(-places)
    return number.quantize(quantum, rounding=ROUND_HALF_UP)


def _money(value: Any, field: str = "Valor") -> str:
    return f"{_decimal(value, field, 2):.2f}"


def _rate(value: Any, field: str = "Alíquota") -> str:
    return f"{_decimal(value, field, 4):.4f}"


def _quantity(value: Any, field: str = "Quantidade") -> str:
    return f"{_decimal(value, field, 4):.4f}"


def _unit_price(value: Any, field: str = "Valor unitário") -> str:
    result = _decimal(value, field, 10)
    return f"{result:.10f}".rstrip("0").rstrip(".")


def _add(parent: etree._Element, name: str, value: Any, **attributes: Any) -> etree._Element:
    node = etree.SubElement(
        parent,
        etree.QName(NS, name),
        **{key: str(val) for key, val in attributes.items()},
    )
    node.text = str(value)
    return node


def _dv(key43: str) -> str:
    total, weight = 0, 2
    for char in reversed(key43):
        total += int(char) * weight
        weight = 2 if weight == 9 else weight + 1
    remainder = total % 11
    return str(0 if remainder in (0, 1) else 11 - remainder)


def _parse_emission_time(raw: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        raise ErroNfeLocal("Data de emissão inválida.") from None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
    return parsed.astimezone(ZoneInfo("America/Sao_Paulo"))


def _provider_context(provider_xml: str | None) -> tuple[str | None, str | None]:
    if not provider_xml:
        return None, None
    try:
        root = etree.fromstring(
            provider_xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
    except (ValueError, etree.XMLSyntaxError):
        raise ErroNfeLocal("O XML autorizado pelo provedor está ilegível.") from None
    ids = root.xpath("//*[local-name()='infNFe']/@Id")
    dates = root.xpath("//*[local-name()='infNFe']/*[local-name()='ide']/*[local-name()='dhEmi']/text()")
    key = str(ids[0]).removeprefix("NFe") if ids else None
    return (key if key and re.fullmatch(r"\d{44}", key) else None), (str(dates[0]) if dates else None)


def _access_key(
    payload: dict[str, Any], fiscal: dict[str, Any], emitted_at: datetime,
    payload_sha256: str, provider_key: str | None, *, model: str = "55",
) -> str:
    if provider_key:
        return provider_key
    uf = str(fiscal.get("uf") or "").upper()
    cnpj = _digits(fiscal.get("cnpj") or payload.get("emitente", {}).get("cpfCnpj"))
    if uf not in UF_CODES or len(cnpj) != 14:
        raise ErroNfeLocal("UF ou CNPJ do emitente inválido para gerar a chave.")
    try:
        series = int(payload.get("serie") or 0)
        number = int(payload.get("numero") or 0)
    except (TypeError, ValueError):
        raise ErroNfeLocal("Série ou número da NF-e inválido.") from None
    if not 0 <= series <= 999 or not 1 <= number <= 999_999_999:
        raise ErroNfeLocal("Série ou número da NF-e fora do limite oficial.")
    numeric = str(int(payload_sha256[:12], 16) % 100_000_000).zfill(8)
    if model not in {"55", "65"}:
        raise ErroNfeLocal("Modelo fiscal deve ser 55 ou 65.")
    try:
        emission_type = int(payload.get("tipoEmissao") or 1)
    except (TypeError, ValueError):
        raise ErroNfeLocal("Tipo de emissão inválido.") from None
    if emission_type not in ({1, 9} if model == "65" else {1}):
        raise ErroNfeLocal("Tipo de emissão ainda não suportado para este modelo.")
    raw = (
        f"{UF_CODES[uf]}{emitted_at:%y%m}{cnpj}{model}{series:03d}"
        f"{number:09d}{emission_type}{numeric}"
    )
    return raw + _dv(raw)


def _address(parent: etree._Element, data: dict[str, Any], prefix: str) -> None:
    address = data.get("endereco") or {}
    node = etree.SubElement(parent, etree.QName(NS, prefix))
    street = " ".join(
        part for part in (str(address.get("tipoLogradouro") or "").strip(),
                          str(address.get("logradouro") or "").strip()) if part
    )
    _add(node, "xLgr", _text(street, "Logradouro", maximum=60))
    _add(node, "nro", _text(address.get("numero") or "S/N", "Número", maximum=60))
    if address.get("complemento"):
        _add(node, "xCpl", _text(address["complemento"], "Complemento", maximum=60))
    _add(node, "xBairro", _text(address.get("bairro"), "Bairro", maximum=60))
    city_code = _digits(address.get("codigoCidade"))
    if len(city_code) != 7:
        raise ErroNfeLocal("Código IBGE do endereço deve ter 7 dígitos.")
    _add(node, "cMun", city_code)
    _add(node, "xMun", _text(address.get("descricaoCidade"), "Cidade", maximum=60))
    uf = str(address.get("estado") or "").upper()
    if uf not in UF_CODES and uf != "EX":
        raise ErroNfeLocal("UF do endereço inválida.")
    _add(node, "UF", uf)
    cep = _digits(address.get("cep"))
    if cep:
        if len(cep) != 8:
            raise ErroNfeLocal("CEP deve ter 8 dígitos.")
        _add(node, "CEP", cep)
    _add(node, "cPais", "1058")
    _add(node, "xPais", "Brasil")


def _emit(root: etree._Element, payload: dict[str, Any], fiscal: dict[str, Any]) -> None:
    data = payload.get("emitente") or {}
    node = etree.SubElement(root, etree.QName(NS, "emit"))
    cnpj = _digits(fiscal.get("cnpj") or data.get("cpfCnpj"))
    if len(cnpj) != 14:
        raise ErroNfeLocal("CNPJ do emitente inválido.")
    _add(node, "CNPJ", cnpj)
    _add(node, "xNome", _text(fiscal.get("razao_social"), "Razão social", maximum=60))
    if fiscal.get("nome_fantasia"):
        _add(node, "xFant", _text(fiscal["nome_fantasia"], "Nome fantasia", maximum=60))
    _address(node, {"endereco": {
        "logradouro": fiscal.get("logradouro"), "numero": fiscal.get("numero"),
        "complemento": fiscal.get("complemento"), "bairro": fiscal.get("bairro"),
        "codigoCidade": fiscal.get("codigo_ibge"), "descricaoCidade": fiscal.get("cidade"),
        "estado": fiscal.get("uf"), "cep": fiscal.get("cep"),
    }}, "enderEmit")
    ie = _digits(fiscal.get("inscricao_estadual") or data.get("inscricaoEstadual"))
    if not ie:
        raise ErroNfeLocal("Inscrição estadual do emitente ausente.")
    _add(node, "IE", ie)
    regime = str(fiscal.get("regime_tributario") or "").lower()
    crt = "1" if regime == "simples_nacional" or fiscal.get("is_simples_nacional") is True else "3"
    _add(node, "CRT", crt)


def _dest(root: etree._Element, payload: dict[str, Any], *, required: bool = True) -> None:
    data = payload.get("destinatario") or {}
    if not data and not required:
        return
    node = etree.SubElement(root, etree.QName(NS, "dest"))
    document = _digits(data.get("cpfCnpj"))
    if len(document) == 14:
        _add(node, "CNPJ", document)
    elif len(document) == 11:
        _add(node, "CPF", document)
    else:
        raise ErroNfeLocal("CPF/CNPJ do destinatário inválido.")
    _add(node, "xNome", _text(data.get("razaoSocial"), "Destinatário", minimum=2, maximum=60))
    _address(node, data, "enderDest")
    indicator = str(int(data.get("indicadorInscricaoEstadual") or 9))
    if indicator not in {"1", "2", "9"}:
        raise ErroNfeLocal("Indicador de IE do destinatário inválido.")
    _add(node, "indIEDest", indicator)
    ie = _digits(data.get("inscricaoEstadual"))
    if indicator == "1":
        if not ie:
            raise ErroNfeLocal("Destinatário contribuinte exige inscrição estadual.")
        _add(node, "IE", ie)
    if data.get("email"):
        _add(node, "email", _text(data["email"], "E-mail", maximum=60))


def _icms(parent: etree._Element, tax: dict[str, Any]) -> None:
    origin, cst = str(tax.get("origem") or "0"), str(tax.get("cst") or "")
    icms = etree.SubElement(parent, etree.QName(NS, "ICMS"))
    if len(cst) == 3:
        if cst not in {"102", "103", "300", "400"}:
            raise ErroNfeLocal(f"CSOSN {cst} ainda não suportado pelo motor direto.")
        group = etree.SubElement(icms, etree.QName(NS, "ICMSSN102"))
        _add(group, "orig", origin)
        _add(group, "CSOSN", cst)
        return
    if cst in {"40", "41", "50"}:
        group = etree.SubElement(icms, etree.QName(NS, "ICMS40"))
        _add(group, "orig", origin)
        _add(group, "CST", cst)
        return
    if cst not in {"00", "51", "90"}:
        raise ErroNfeLocal(f"CST ICMS {cst or '(vazio)'} ainda não suportado pelo motor direto.")
    group = etree.SubElement(icms, etree.QName(NS, f"ICMS{cst}"))
    _add(group, "orig", origin)
    _add(group, "CST", cst)
    base = tax.get("baseCalculo") or {}
    _add(group, "modBC", int(base.get("modalidadeDeterminacao") or 3))
    if cst in {"51", "90"}:
        _add(group, "pRedBC", _rate(base.get("percentualReducao") or 0))
    _add(group, "vBC", _money(base.get("valor") or 0, "Base de ICMS"))
    _add(group, "pICMS", _rate(tax.get("aliquota") or 0, "Alíquota ICMS"))
    if cst == "51":
        deferred = tax.get("diferimento") or {}
        operation_value = tax.get("valor") or 0
        _add(group, "vICMSOp", _money(operation_value, "ICMS da operação"))
        _add(group, "pDif", _rate(deferred.get("percentual") or 0, "Diferimento ICMS"))
        _add(group, "vICMSDif", _money(deferred.get("valor") or 0, "ICMS diferido"))
        _add(group, "vICMS", _money(deferred.get("valorIcmsDevido") or 0, "ICMS devido"))
    else:
        _add(group, "vICMS", _money(tax.get("valor") or 0, "ICMS"))


def _pis_cofins(parent: etree._Element, name: str, tax: dict[str, Any]) -> None:
    cst = str(tax.get("cst") or "")
    wrapper = etree.SubElement(parent, etree.QName(NS, name))
    if cst in {"04", "05", "06", "07", "08", "09"}:
        group = etree.SubElement(wrapper, etree.QName(NS, f"{name}NT"))
        _add(group, "CST", cst)
        return
    if cst in {"01", "02"}:
        group_name = f"{name}Aliq"
    elif cst == "03":
        group = etree.SubElement(wrapper, etree.QName(NS, f"{name}Qtde"))
        _add(group, "CST", cst)
        quantity = tax.get("quantidadeVendida")
        unit_rate = tax.get("aliquotaReais")
        if quantity is None or unit_rate is None:
            raise ErroNfeLocal(
                f"CST {name} 03 exige quantidadeVendida e aliquotaReais."
            )
        _add(group, "qBCProd", _quantity(quantity, f"Quantidade {name}"))
        _add(group, "vAliqProd", _rate(unit_rate, f"Alíquota em reais {name}"))
        _add(group, f"v{name}", _money(tax.get("valor") or 0))
        return
    elif cst in {
        "49", "50", "51", "52", "53", "54", "55", "56",
        "60", "61", "62", "63", "64", "65", "66", "67",
        "70", "71", "72", "73", "74", "75", "98", "99",
    }:
        group_name = f"{name}Outr"
    else:
        raise ErroNfeLocal(f"CST {name} {cst or '(vazio)'} ainda não suportado.")
    group = etree.SubElement(wrapper, etree.QName(NS, group_name))
    _add(group, "CST", cst)
    quantity = tax.get("quantidadeVendida")
    unit_rate = tax.get("aliquotaReais")
    if quantity is not None and unit_rate is not None:
        _add(group, "qBCProd", _quantity(quantity, f"Quantidade {name}"))
        _add(group, "vAliqProd", _rate(unit_rate, f"Alíquota em reais {name}"))
    else:
        _add(group, "vBC", _money((tax.get("baseCalculo") or {}).get("valor") or 0))
        _add(group, f"p{name}", _rate(tax.get("aliquota") or 0))
    _add(group, f"v{name}", _money(tax.get("valor") or 0))


def _ipi(parent: etree._Element, tax: dict[str, Any]) -> None:
    node = etree.SubElement(parent, etree.QName(NS, "IPI"))
    _add(node, "cEnq", str(tax.get("codigoEnquadramentoLegal") or "999"))
    cst = str(tax.get("cst") or "")
    if cst in {"01", "02", "03", "04", "05", "51", "52", "53", "54", "55"}:
        group = etree.SubElement(node, etree.QName(NS, "IPINT"))
        _add(group, "CST", cst)
        return
    group = etree.SubElement(node, etree.QName(NS, "IPITrib"))
    _add(group, "CST", cst)
    _add(group, "vBC", _money(tax.get("baseCalculo") or 0))
    _add(group, "pIPI", _rate(tax.get("aliquota") or 0))
    _add(group, "vIPI", _money(tax.get("valor") or 0))


def _ibscbs(parent: etree._Element, tax: dict[str, Any]) -> None:
    node = etree.SubElement(parent, etree.QName(NS, "IBSCBS"))
    _add(node, "CST", str(tax.get("cst") or ""))
    _add(node, "cClassTrib", str(tax.get("classificacao") or ""))
    group = etree.SubElement(node, etree.QName(NS, "gIBSCBS"))
    _add(group, "vBC", _money(tax.get("baseCalculo") or 0))
    for xml_name, key, rate_name, value_name in (
        ("gIBSUF", "uf", "pIBSUF", "vIBSUF"),
        ("gIBSMun", "municipio", "pIBSMun", "vIBSMun"),
    ):
        source = tax.get(key) or {}
        part = etree.SubElement(group, etree.QName(NS, xml_name))
        _add(part, rate_name, _rate(source.get("aliquota") or 0))
        if source.get("diferimento"):
            dif = etree.SubElement(part, etree.QName(NS, "gDif"))
            _add(dif, "pDif", _rate(source["diferimento"].get("percentual") or 0))
            _add(dif, "vDif", _money(source["diferimento"].get("valor") or 0))
        _add(part, value_name, _money(source.get("valor") or 0))
    _add(group, "vIBS", _money(tax.get("valorIbs") or 0))
    cbs_source = tax.get("cbs") or {}
    cbs = etree.SubElement(group, etree.QName(NS, "gCBS"))
    _add(cbs, "pCBS", _rate(cbs_source.get("aliquota") or 0))
    if cbs_source.get("diferimento"):
        dif = etree.SubElement(cbs, etree.QName(NS, "gDif"))
        _add(dif, "pDif", _rate(cbs_source["diferimento"].get("percentual") or 0))
        _add(dif, "vDif", _money(cbs_source["diferimento"].get("valor") or 0))
    _add(cbs, "vCBS", _money(cbs_source.get("valor") or 0))


def _allocated(total: Decimal, values: list[Decimal]) -> list[Decimal]:
    if total == 0:
        return [Decimal("0.00") for _ in values]
    base = sum(values)
    if base == 0:
        raise ErroNfeLocal("Não é possível ratear valores numa nota sem produtos.")
    parts: list[Decimal] = []
    used = Decimal("0.00")
    for index, value in enumerate(values):
        part = total - used if index == len(values) - 1 else (total * value / base).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        parts.append(part)
        used += part
    return parts


def _items(root: etree._Element, payload: dict[str, Any]) -> None:
    items = payload.get("itens") or []
    if not isinstance(items, list) or not items:
        raise ErroNfeLocal("A NF-e precisa ter ao menos um item.")
    product_values = [_decimal(item.get("valor"), "Valor do produto") for item in items]
    totals = payload.get("total") or {}
    freights = _allocated(_decimal(totals.get("valorFrete"), "Frete"), product_values)
    others = _allocated(_decimal(totals.get("outrasDespesasAcessorias"), "Outras despesas"), product_values)
    for index, item in enumerate(items, 1):
        det = etree.SubElement(root, etree.QName(NS, "det"), nItem=str(index))
        prod = etree.SubElement(det, etree.QName(NS, "prod"))
        _add(prod, "cProd", _text(item.get("codigo"), "Código do produto", maximum=60))
        _add(prod, "cEAN", "SEM GTIN")
        _add(prod, "xProd", _text(item.get("descricao"), "Descrição do produto", maximum=120))
        ncm = _digits(item.get("ncm"))
        if len(ncm) not in {2, 8}:
            raise ErroNfeLocal("NCM deve ter 2 ou 8 dígitos.")
        _add(prod, "NCM", ncm)
        if item.get("codigoBeneficioFiscal"):
            _add(prod, "cBenef", str(item["codigoBeneficioFiscal"]))
        cfop = _digits(item.get("cfop"))
        if len(cfop) != 4:
            raise ErroNfeLocal("CFOP deve ter 4 dígitos.")
        _add(prod, "CFOP", cfop)
        unit = item.get("unidade") or {}
        quantity = item.get("quantidade") or {}
        unit_value = item.get("valorUnitario") or {}
        _add(prod, "uCom", _text(unit.get("comercial"), "Unidade comercial", maximum=6))
        _add(prod, "qCom", _quantity(quantity.get("comercial")))
        _add(prod, "vUnCom", _unit_price(unit_value.get("comercial")))
        _add(prod, "vProd", _money(item.get("valor")))
        _add(prod, "cEANTrib", "SEM GTIN")
        _add(prod, "uTrib", _text(unit.get("tributavel"), "Unidade tributável", maximum=6))
        _add(prod, "qTrib", _quantity(quantity.get("tributavel")))
        _add(prod, "vUnTrib", _unit_price(unit_value.get("tributavel")))
        if freights[index - 1]:
            _add(prod, "vFrete", f"{freights[index - 1]:.2f}")
        if item.get("valorDesconto"):
            _add(prod, "vDesc", _money(item["valorDesconto"]))
        if others[index - 1]:
            _add(prod, "vOutro", f"{others[index - 1]:.2f}")
        _add(prod, "indTot", "1")
        if item.get("numeroCompra"):
            _add(prod, "xPed", str(item["numeroCompra"])[:15])
        if item.get("pedidoCompra") is not None:
            _add(prod, "nItemPed", int(item["pedidoCompra"]))
        if item.get("dfeReferenciado"):
            ref = etree.SubElement(det, etree.QName(NS, "DFeReferenciado"))
            _add(ref, "chaveAcesso", _digits(item["dfeReferenciado"].get("chaveAcesso")))
            _add(ref, "nItem", int(item["dfeReferenciado"].get("numero")))
        taxes = item.get("tributos") or {}
        tax_node = etree.SubElement(det, etree.QName(NS, "imposto"))
        if taxes.get("valorAproximadoTributos") is not None:
            _add(tax_node, "vTotTrib", _money(taxes["valorAproximadoTributos"]))
        _icms(tax_node, taxes.get("icms") or {})
        if taxes.get("ipi"):
            _ipi(tax_node, taxes["ipi"])
        _pis_cofins(tax_node, "PIS", taxes.get("pis") or {})
        _pis_cofins(tax_node, "COFINS", taxes.get("cofins") or {})
        if taxes.get("ibscbs"):
            _ibscbs(tax_node, taxes["ibscbs"])


def _totals(root: etree._Element, payload: dict[str, Any]) -> None:
    source = payload.get("total") or {}
    total = etree.SubElement(root, etree.QName(NS, "total"))
    icms = etree.SubElement(total, etree.QName(NS, "ICMSTot"))
    fields = (
        ("vBC", "baseCalculoIcms"), ("vICMS", "valorIcms"),
        ("vICMSDeson", None), ("vFCP", None), ("vBCST", None), ("vST", None),
        ("vFCPST", None), ("vFCPSTRet", None),
        ("vProd", "valorProdutosServicos"), ("vFrete", "valorFrete"),
        ("vSeg", None), ("vDesc", "valorDesconto"), ("vII", None),
        ("vIPI", "valorIpi"), ("vIPIDevol", None), ("vPIS", "valorPis"),
        ("vCOFINS", "valorCofins"), ("vOutro", "outrasDespesasAcessorias"),
        ("vNF", "valorNfe"),
    )
    for xml_name, key in fields:
        _add(icms, xml_name, _money(source.get(key) if key else 0))
    if source.get("valorAproximadoTributos") is not None:
        _add(icms, "vTotTrib", _money(source["valorAproximadoTributos"]))
    if source.get("baseCalculoIbsCbs") is not None:
        ibs = etree.SubElement(total, etree.QName(NS, "IBSCBSTot"))
        _add(ibs, "vBCIBSCBS", _money(source.get("baseCalculoIbsCbs")))
        gibs = etree.SubElement(ibs, etree.QName(NS, "gIBS"))
        for node_name, suffix in (("gIBSUF", "IbsUF"), ("gIBSMun", "IbsMunicipio")):
            part = etree.SubElement(gibs, etree.QName(NS, node_name))
            _add(part, "vDif", _money(source.get(f"valorDiferimento{suffix}") or 0))
            _add(part, "vDevTrib", _money(source.get(f"valorDevolucao{suffix}") or 0))
            _add(part, "vIBSUF" if suffix == "IbsUF" else "vIBSMun", _money(source.get(f"valor{suffix}") or 0))
        _add(gibs, "vIBS", _money(source.get("valorIbs") or 0))
        _add(gibs, "vCredPres", _money(source.get("valorIbsCreditoPresumido") or 0))
        _add(gibs, "vCredPresCondSus", _money(source.get("valorIbsCreditoPresumidoSuspensao") or 0))
        gcbs = etree.SubElement(ibs, etree.QName(NS, "gCBS"))
        _add(gcbs, "vDif", _money(source.get("valorCbsDiferimento") or 0))
        _add(gcbs, "vDevTrib", _money(source.get("valorCbsDevolucao") or 0))
        _add(gcbs, "vCBS", _money(source.get("valorCbs") or 0))
        _add(gcbs, "vCredPres", _money(source.get("valorCbsCreditoPresumido") or 0))
        _add(gcbs, "vCredPresCondSus", _money(source.get("valorCbsCreditoPresumidoSuspensao") or 0))
        _add(total, "vNFTot", _money(source.get("valorNfe") or 0))


def _transport(root: etree._Element, payload: dict[str, Any]) -> None:
    source = payload.get("transporte") or {}
    node = etree.SubElement(root, etree.QName(NS, "transp"))
    _add(node, "modFrete", int(source.get("modalidadeFrete") if source.get("modalidadeFrete") is not None else 9))
    if source.get("transportador"):
        data = source["transportador"]
        carrier = etree.SubElement(node, etree.QName(NS, "transporta"))
        if data.get("cnpj"):
            _add(carrier, "CNPJ", _digits(data["cnpj"]))
        elif data.get("cpf"):
            _add(carrier, "CPF", _digits(data["cpf"]))
        if data.get("nome"):
            _add(carrier, "xNome", data["nome"])
        if data.get("inscricaoEstadual"):
            _add(carrier, "IE", data["inscricaoEstadual"])
        address = data.get("endereco") or {}
        if address.get("logradouro"):
            _add(carrier, "xEnder", address["logradouro"])
        if address.get("descricaoCidade"):
            _add(carrier, "xMun", address["descricaoCidade"])
        if address.get("uf"):
            _add(carrier, "UF", address["uf"])
    if source.get("veiculo"):
        data = source["veiculo"]
        vehicle = etree.SubElement(node, etree.QName(NS, "veicTransp"))
        _add(vehicle, "placa", data.get("placa"))
        if data.get("uf") or data.get("estado"):
            _add(vehicle, "UF", data.get("uf") or data.get("estado"))
        if data.get("rntc"):
            _add(vehicle, "RNTC", data["rntc"])
    for data in source.get("volumes") or []:
        volume = etree.SubElement(node, etree.QName(NS, "vol"))
        if data.get("quantidade") is not None:
            _add(volume, "qVol", int(data["quantidade"]))
        if data.get("especie"):
            _add(volume, "esp", data["especie"])
        if data.get("marca"):
            _add(volume, "marca", data["marca"])
        if data.get("pesoLiquido") is not None:
            _add(volume, "pesoL", f"{_decimal(data['pesoLiquido'], 'Peso líquido', 3):.3f}")
        if data.get("pesoBruto") is not None:
            _add(volume, "pesoB", f"{_decimal(data['pesoBruto'], 'Peso bruto', 3):.3f}")


def _billing(root: etree._Element, payload: dict[str, Any]) -> None:
    if not payload.get("cobranca"):
        return
    source = payload["cobranca"]
    node = etree.SubElement(root, etree.QName(NS, "cobr"))
    invoice = etree.SubElement(node, etree.QName(NS, "fat"))
    _add(invoice, "nFat", source.get("numero"))
    _add(invoice, "vOrig", _money(source.get("valorTotal")))
    _add(invoice, "vDesc", _money(source.get("valorDesconto")))
    _add(invoice, "vLiq", _money(source.get("valorLiquido")))
    for part in source.get("parcelas") or []:
        dup = etree.SubElement(node, etree.QName(NS, "dup"))
        _add(dup, "nDup", part.get("numero"))
        _add(dup, "dVenc", part.get("dataVencimento"))
        _add(dup, "vDup", _money(part.get("valor")))


def _payments(root: etree._Element, payload: dict[str, Any]) -> None:
    node = etree.SubElement(root, etree.QName(NS, "pag"))
    payments = payload.get("pagamentos") or []
    if not payments:
        raise ErroNfeLocal("A NF-e precisa ter grupo de pagamento.")
    for source in payments:
        item = etree.SubElement(node, etree.QName(NS, "detPag"))
        _add(item, "indPag", "0" if source.get("aVista") is not False else "1")
        _add(item, "tPag", str(source.get("meio") or "90"))
        if source.get("descricaoMeio"):
            _add(item, "xPag", source["descricaoMeio"])
        _add(item, "vPag", _money(source.get("valor") or 0))
    if payload.get("troco") is not None:
        _add(node, "vTroco", _money(payload.get("troco"), "Troco"))


def _additional(root: etree._Element, payload: dict[str, Any]) -> None:
    if payload.get("informacoesComplementaresContribuinte") or payload.get("informacoesComplementares"):
        node = etree.SubElement(root, etree.QName(NS, "infAdic"))
        if payload.get("informacoesComplementaresContribuinte"):
            _add(node, "infAdFisco", payload["informacoesComplementaresContribuinte"])
        if payload.get("informacoesComplementares"):
            _add(node, "infCpl", payload["informacoesComplementares"])
    for source in payload.get("responsavelAutorizado") or []:
        node = etree.SubElement(root, etree.QName(NS, "autXML"))
        document = _digits(source.get("cpfCnpj"))
        _add(node, "CNPJ" if len(document) == 14 else "CPF", document)
    if payload.get("responsavelTecnico"):
        source = payload["responsavelTecnico"]
        node = etree.SubElement(root, etree.QName(NS, "infRespTec"))
        _add(node, "CNPJ", _digits(source.get("cpfCnpj") or source.get("cnpj")))
        _add(node, "xContato", source.get("contato") or source.get("xContato"))
        _add(node, "email", source.get("email"))
        _add(node, "fone", _digits(source.get("telefone") or source.get("fone")))


def montar_xml(
    job: dict[str, Any], provider_xml: str | None = None, *, model: str = "55"
) -> tuple[str, str]:
    payload = job.get("payload") or {}
    fiscal = job.get("fiscal_config") or {}
    invoice = job.get("invoice") or {}
    provider_key, provider_date = _provider_context(provider_xml)
    raw_date = provider_date or payload.get("dataEmissao") or invoice.get("issue_date")
    emitted_at = _parse_emission_time(raw_date)
    key = _access_key(
        payload,
        fiscal,
        emitted_at,
        str(job.get("payload_sha256") or "0" * 64),
        provider_key,
        model=model,
    )

    root = etree.Element(etree.QName(NS, "NFe"), nsmap={None: NS})
    inf = etree.SubElement(root, etree.QName(NS, "infNFe"), Id="NFe" + key, versao="4.00")
    ide = etree.SubElement(inf, etree.QName(NS, "ide"))
    uf = str(fiscal.get("uf") or "").upper()
    dest_uf = str((payload.get("destinatario") or {}).get("endereco", {}).get("estado") or uf).upper()
    destination = "3" if dest_uf == "EX" else ("2" if dest_uf != uf else "1")
    city_code = _digits(fiscal.get("codigo_ibge"))
    fields = (
        ("cUF", key[:2]), ("cNF", key[35:43]),
        ("natOp", _text(payload.get("natureza"), "Natureza da operação", maximum=60)),
        ("mod", model), ("serie", int(payload.get("serie") or 0)),
        ("nNF", int(payload.get("numero") or 0)),
        ("dhEmi", emitted_at.isoformat(timespec="seconds")),
        ("tpNF", "1" if payload.get("saida") is True else "0"),
        ("idDest", destination), ("cMunFG", city_code),
        ("tpImp", "4" if model == "65" else "1"),
        ("tpEmis", key[34]), ("cDV", key[-1]),
        ("tpAmb", "2" if invoice.get("environment") == "homologacao" else "1"),
        ("finNFe", int(payload.get("finalidade") or 1)),
        ("indFinal", "1" if payload.get("consumidorFinal") is True else "0"),
        ("indPres", int(payload.get("presencial") or 0)),
        ("procEmi", "0"), ("verProc", VER_APLIC),
    )
    if len(city_code) != 7:
        raise ErroNfeLocal("Código IBGE do emitente deve ter 7 dígitos.")
    for name, value in fields:
        _add(ide, name, value)
    for reference in (payload.get("notaReferenciada") or {}).get("nfe") or []:
        key_ref = _digits(reference.get("chave"))
        if len(key_ref) != 44:
            raise ErroNfeLocal("Chave de NF-e referenciada inválida.")
        node = etree.SubElement(ide, etree.QName(NS, "NFref"))
        _add(node, "refNFe", key_ref)
    _emit(inf, payload, fiscal)
    _dest(inf, payload, required=model == "55")
    _items(inf, payload)
    _totals(inf, payload)
    _transport(inf, payload)
    if model == "55":
        _billing(inf, payload)
    _payments(inf, payload)
    _additional(inf, payload)
    return etree.tostring(root, encoding="unicode", xml_declaration=False), key


def _validate_certificate_owner(cnpj: str, credential: CredencialFiscal) -> None:
    now = datetime.now(timezone.utc)
    certificate = credential.certificado
    if not certificate.not_valid_before_utc <= now <= certificate.not_valid_after_utc:
        raise ErroNfeLocal("O certificado digital está fora do período de validade.")
    candidates = [
        str(attribute.value)
        for attribute in certificate.subject
        if attribute.oid.dotted_string in {"2.5.4.3", "2.5.4.5"}
    ]
    try:
        san = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
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
        raise ErroNfeLocal("O certificado digital não pertence ao CNPJ do emitente selecionado.")


def assinar_xml(
    xml: str, credential: CredencialFiscal, cnpj: str, *, information_tag: str = "infNFe"
) -> str:
    patterns = {"infNFe": r"NFe[0-9]{44}", "infEvento": r"ID[0-9]{52}",
                "infInut": r"ID[0-9]{41}"}
    if information_tag not in patterns:
        raise ErroNfeLocal("Tipo de documento inválido para assinatura NF-e.")
    cnpj = _digits(cnpj)
    if len(cnpj) != 14:
        raise ErroNfeLocal("CNPJ do emitente inválido para assinatura.")
    if not isinstance(credential.chave, rsa.RSAPrivateKey):
        raise ErroNfeLocal("O certificado não usa chave RSA compatível com NF-e.")
    _validate_certificate_owner(cnpj, credential)
    try:
        root = etree.fromstring(xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError:
        raise ErroNfeLocal("O XML da NF-e está ilegível antes da assinatura.") from None
    nodes = root.findall(f".//{{{NS}}}{information_tag}")
    inf = nodes[0] if len(nodes) == 1 else None
    if inf is None or not re.fullmatch(patterns[information_tag], str(inf.get("Id") or "")):
        raise ErroNfeLocal("A NF-e não tem identificador válido para assinatura.")
    if root.findall(f".//{{{DS}}}Signature"):
        raise ErroNfeLocal("O documento já possui assinatura digital.")

    signature = etree.Element(
        etree.QName(DS, "Signature"), nsmap={None: DS},
    )
    signed_info = etree.SubElement(signature, etree.QName(DS, "SignedInfo"))
    etree.SubElement(signed_info, etree.QName(DS, "CanonicalizationMethod"),
                     Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315")
    etree.SubElement(signed_info, etree.QName(DS, "SignatureMethod"),
                     Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1")
    reference = etree.SubElement(
        signed_info, etree.QName(DS, "Reference"), URI="#" + str(inf.get("Id"))
    )
    transforms = etree.SubElement(reference, etree.QName(DS, "Transforms"))
    etree.SubElement(transforms, etree.QName(DS, "Transform"),
                     Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature")
    etree.SubElement(transforms, etree.QName(DS, "Transform"),
                     Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315")
    etree.SubElement(reference, etree.QName(DS, "DigestMethod"),
                     Algorithm="http://www.w3.org/2000/09/xmldsig#sha1")
    digest = etree.SubElement(reference, etree.QName(DS, "DigestValue"))
    signature_value = etree.SubElement(signature, etree.QName(DS, "SignatureValue"))
    key_info = etree.SubElement(signature, etree.QName(DS, "KeyInfo"))
    x509_data = etree.SubElement(key_info, etree.QName(DS, "X509Data"))
    etree.SubElement(x509_data, etree.QName(DS, "X509Certificate")).text = base64.b64encode(
        credential.certificado.public_bytes(Encoding.DER)
    ).decode()
    root.append(signature)

    # Mesma representação normalizada usada na manifestação já homologada.
    root = etree.fromstring(etree.tostring(root))
    inf = root.find(f".//{{{NS}}}{information_tag}")
    signed_info = root.find(f".//{{{DS}}}SignedInfo")
    digest = root.find(f".//{{{DS}}}DigestValue")
    signature_value = root.find(f".//{{{DS}}}SignatureValue")

    def canonicalize(node: etree._Element) -> bytes:
        from ..sefaz.manifestacao import _canonicalizar
        return _canonicalizar(node)

    digest.text = base64.b64encode(
        hashlib.sha1(canonicalize(inf)).digest()
    ).decode()
    signature_value.text = base64.b64encode(
        credential.chave.sign(
            canonicalize(signed_info),
            padding.PKCS1v15(), hashes.SHA1(),
        )
    ).decode()
    return etree.tostring(root, encoding="unicode", xml_declaration=False)


def validar_assinatura(xml: str, *, information_tag: str = "infNFe") -> list[str]:
    """Confere o digest do infNFe e a assinatura RSA contida no XML."""
    try:
        root = etree.fromstring(
            xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
    except etree.XMLSyntaxError:
        return ["XML ilegível."]
    nodes = root.findall(f".//{{{NS}}}{information_tag}")
    inf = nodes[0] if len(nodes) == 1 else None
    signature = root.find(f"{{{DS}}}Signature")
    if inf is None or signature is None:
        return ["Assinatura digital ausente."]
    signed_info = signature.find(f"{{{DS}}}SignedInfo")
    digest = signature.find(f".//{{{DS}}}DigestValue")
    signature_value = signature.find(f"{{{DS}}}SignatureValue")
    certificate_node = signature.find(f".//{{{DS}}}X509Certificate")
    reference = signature.find(f".//{{{DS}}}Reference")
    if any(node is None or not (node.text or "").strip() for node in (
        digest, signature_value, certificate_node
    )) or signed_info is None or reference is None:
        return ["Estrutura da assinatura digital incompleta."]
    if reference.get("URI") != "#" + str(inf.get("Id") or ""):
        return ["A assinatura referencia outra NF-e."]
    def canonicalize(node: etree._Element) -> bytes:
        from ..sefaz.manifestacao import _canonicalizar
        return _canonicalizar(node)

    try:
        expected_digest = base64.b64decode(str(digest.text), validate=True)
        actual_digest = hashlib.sha1(
            canonicalize(inf)
        ).digest()
        if expected_digest != actual_digest:
            return ["O conteúdo da NF-e foi alterado depois da assinatura."]
        certificate = x509.load_der_x509_certificate(
            base64.b64decode(str(certificate_node.text), validate=True)
        )
        certificate.public_key().verify(
            base64.b64decode(str(signature_value.text), validate=True),
            canonicalize(signed_info),
            padding.PKCS1v15(), hashes.SHA1(),
        )
    except (ValueError, TypeError, InvalidSignature):
        return ["Assinatura digital inválida."]
    return []


def validar_xsd(xml: str) -> list[str]:
    try:
        from nfelib.nfe.bindings.v4_0.nfe_v4_00 import Nfe
    except ImportError:
        raise ErroNfeLocal("A dependência nfelib não está instalada no serviço.") from None
    return [str(message)[:500] for message in Nfe.schema_validation(xml)]


def fingerprint(xml: str) -> str:
    parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=True)
    root = etree.fromstring(xml.encode(), parser)
    return hashlib.sha256(etree.tostring(root, method="c14n", exclusive=False)).hexdigest()
