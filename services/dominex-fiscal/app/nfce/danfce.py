"""DANFE NFC-e 80 mm baseado exclusivamente no XML autorizado.

Segue o Manual de Especificações Técnicas do DANFE NFC-e/QR Code v6.0.
O documento não recebe dados soltos da tela: cada informação vem do nfeProc.
"""

from __future__ import annotations

import base64
import io
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import unquote, urlsplit

import qrcode
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fpdf import FPDF
from lxml import etree

from ..nfe.xml import DS, NS, ErroNfeLocal, validar_assinatura

PAPER_WIDTH_MM = 80
SIDE_MARGIN_MM = 3
QR_SIZE_MM = 32
MAX_PDF_BYTES = 2_000_000
MAX_CONTINUOUS_HEIGHT_MM = 5_000
PAGINATED_HEIGHT_MM = 300

PAYMENT_NAMES = {
    "01": "Dinheiro",
    "02": "Cheque",
    "03": "Cartão de crédito",
    "04": "Cartão de débito",
    "05": "Crédito da loja",
    "10": "Vale-alimentação",
    "11": "Vale-refeição",
    "12": "Vale-presente",
    "13": "Vale-combustível",
    "15": "Boleto bancário",
    "16": "Depósito bancário",
    "17": "PIX",
    "18": "Transferência bancária",
    "19": "Programa de fidelidade",
    "90": "Sem pagamento",
    "99": "Outros",
}


def _parse(raw: str) -> etree._Element:
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > 5_000_000:
        raise ErroNfeLocal("XML autorizado ausente ou acima do limite permitido.")
    try:
        root = etree.fromstring(
            raw.encode("utf-8"),
            etree.XMLParser(resolve_entities=False, no_network=True),
        )
    except (ValueError, etree.XMLSyntaxError):
        raise ErroNfeLocal("O XML autorizado da NFC-e está ilegível.") from None
    if root.getroottree().docinfo.doctype:
        raise ErroNfeLocal("O XML autorizado contém DTD não permitido.")
    if root.tag != f"{{{NS}}}nfeProc":
        raise ErroNfeLocal("Envie o XML processado e autorizado da NFC-e.")
    return root


def _one(node: etree._Element, path: str, *, required: bool = False) -> str:
    values = node.xpath(path, namespaces={"n": NS, "ds": DS})
    texts = [str(value).strip() for value in values if str(value).strip()]
    if len(texts) > 1:
        raise ErroNfeLocal("O XML autorizado possui informação fiscal ambígua.")
    if required and not texts:
        raise ErroNfeLocal("O XML autorizado está incompleto para gerar o DANFE NFC-e.")
    return texts[0] if texts else ""


def _money(raw: str | None) -> str:
    try:
        value = Decimal(str(raw or "0"))
    except InvalidOperation:
        raise ErroNfeLocal("O XML autorizado contém valor monetário inválido.") from None
    return f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _decimal(raw: str | None, field: str = "valor monetário") -> Decimal:
    try:
        value = Decimal(str(raw or "0"))
    except InvalidOperation:
        raise ErroNfeLocal(f"O XML autorizado contém {field} inválido.") from None
    if not value.is_finite():
        raise ErroNfeLocal(f"O XML autorizado contém {field} inválido.")
    return value


def _number(raw: str | None, places: int = 3) -> str:
    try:
        value = Decimal(str(raw or "0"))
    except InvalidOperation:
        raise ErroNfeLocal("O XML autorizado contém quantidade inválida.") from None
    text = f"{value:.{places}f}".rstrip("0").rstrip(".") or "0"
    return text.replace(".", ",")


def _mask_document(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    return raw


def _date_time(raw: str) -> str:
    if not raw:
        return ""
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.strftime("%d/%m/%Y %H:%M:%S")
    except ValueError:
        return raw


@dataclass(frozen=True)
class DanfceData:
    key: str
    environment: str
    issuer_name: str
    issuer_document: str
    issuer_ie: str
    issuer_address: str
    number: str
    series: str
    issued_at: str
    protocol: str
    authorized_at: str
    qr_url: str
    access_url: str
    items: tuple[dict[str, str], ...]
    products_total: str
    discount: str
    additions: str
    payable: str
    taxes: str
    payments: tuple[dict[str, str], ...]
    change: str
    consumer: str
    fiscal_message: str
    customer_message: str
    contingency: bool


def _validate_qr(
    qr_url: str,
    key: str,
    environment: str,
    nfe: etree._Element,
    info: etree._Element,
) -> None:
    value = qr_url.strip()
    if not value.lower().startswith(("https://", "http://")):
        raise ErroNfeLocal("A NFC-e autorizada não possui URL segura de QR Code.")
    raw_query = urlsplit(value).query
    raw_parameter = raw_query[2:].split("&", 1)[0] if raw_query.startswith("p=") else ""
    # unquote preserva '+' literal (ao contrário de parse_qs/unquote_plus),
    # necessário para a assinatura Base64 exigida pelo XSD do QR v3 offline.
    query = unquote(raw_parameter)
    parts = query.split("|") if query else []
    if len(parts) < 3 or parts[0] != key or parts[1] not in {"2", "3"}:
        raise ErroNfeLocal("O QR Code não corresponde à chave da NFC-e autorizada.")
    if parts[2] != environment:
        raise ErroNfeLocal("O QR Code pertence a outro ambiente fiscal.")

    emission_type = _one(info, "./n:ide/n:tpEmis/text()") or "1"
    if parts[1] == "3" and emission_type == "1" and len(parts) != 3:
        raise ErroNfeLocal("O QR Code online v3 possui parâmetros indevidos.")
    if parts[1] != "3" or emission_type != "9":
        # Documentos legados v2 continuam imprimíveis; a validação do hash CSC
        # depende de segredo estadual que não faz parte do XML autorizado.
        return
    if len(parts) != 8:
        raise ErroNfeLocal("O QR Code offline v3 está incompleto.")

    issued_at = _one(info, "./n:ide/n:dhEmi/text()", required=True)
    day_match = re.match(r"^\d{4}-\d{2}-(\d{2})T", issued_at)
    total = _one(info, "./n:total/n:ICMSTot/n:vNF/text()", required=True)
    destination = info.find(f"{{{NS}}}dest")
    destination_type = ""
    destination_id = ""
    if destination is not None:
        for tag, kind in (("CNPJ", "1"), ("CPF", "2"), ("idEstrangeiro", "3")):
            candidate = _one(destination, f"./n:{tag}/text()")
            if candidate:
                destination_type, destination_id = kind, candidate
                break
    expected = (
        day_match.group(1) if day_match else "",
        total,
        destination_type,
        destination_id,
    )
    if tuple(parts[3:7]) != expected:
        raise ErroNfeLocal("O QR Code offline diverge dos dados da NFC-e autorizada.")

    certificate_text = _one(
        nfe,
        "./ds:Signature/ds:KeyInfo/ds:X509Data/ds:X509Certificate/text()",
        required=True,
    )
    try:
        certificate = x509.load_der_x509_certificate(
            base64.b64decode(certificate_text, validate=True)
        )
        public_key = certificate.public_key()
        if not isinstance(public_key, rsa.RSAPublicKey):
            raise ValueError("non-rsa")
        public_key.verify(
            base64.b64decode(parts[7], validate=True),
            "|".join(parts[:7]).encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
    except (ValueError, TypeError, InvalidSignature):
        raise ErroNfeLocal("A assinatura do QR Code offline é inválida.") from None


def parse_authorized_nfce(xml_processado: str) -> DanfceData:
    root = _parse(xml_processado)
    nfe_nodes = root.findall(f"{{{NS}}}NFe")
    protocol_nodes = root.findall(f"{{{NS}}}protNFe")
    if len(nfe_nodes) != 1 or len(protocol_nodes) != 1:
        raise ErroNfeLocal("O XML processado não comprova uma única NFC-e.")
    nfe, protocol = nfe_nodes[0], protocol_nodes[0]
    signature_errors = validar_assinatura(
        etree.tostring(nfe, encoding="unicode")
    )
    if signature_errors:
        raise ErroNfeLocal("; ".join(signature_errors[:3]))

    info = nfe.find(f"{{{NS}}}infNFe")
    inf_prot = protocol.find(f"{{{NS}}}infProt")
    if info is None or inf_prot is None:
        raise ErroNfeLocal("A prova oficial da NFC-e está incompleta.")
    key = str(info.get("Id") or "").removeprefix("NFe")
    if not re.fullmatch(r"\d{44}", key) or key[20:22] != "65":
        raise ErroNfeLocal("O documento enviado não é uma NFC-e modelo 65.")
    model = _one(info, "./n:ide/n:mod/text()", required=True)
    environment = _one(info, "./n:ide/n:tpAmb/text()", required=True)
    if model != "65" or environment not in {"1", "2"}:
        raise ErroNfeLocal("Modelo ou ambiente da NFC-e inválido.")
    if _one(inf_prot, "./n:cStat/text()", required=True) not in {"100", "150"}:
        raise ErroNfeLocal("O protocolo não comprova autorização da NFC-e.")
    if _one(inf_prot, "./n:chNFe/text()", required=True) != key:
        raise ErroNfeLocal("O protocolo pertence a outra NFC-e.")
    if _one(inf_prot, "./n:tpAmb/text()", required=True) != environment:
        raise ErroNfeLocal("O protocolo pertence a outro ambiente fiscal.")
    digest = _one(nfe, "./ds:Signature/ds:SignedInfo/ds:Reference/ds:DigestValue/text()", required=True)
    if _one(inf_prot, "./n:digVal/text()", required=True) != digest:
        raise ErroNfeLocal("O protocolo não corresponde à assinatura da NFC-e.")

    qr_url = _one(nfe, "./n:infNFeSupl/n:qrCode/text()", required=True)
    access_url = _one(nfe, "./n:infNFeSupl/n:urlChave/text()", required=True)
    _validate_qr(qr_url, key, environment, nfe, info)
    if not access_url.lower().startswith(("https://", "http://")):
        raise ErroNfeLocal("A URL de consulta por chave da NFC-e é inválida.")

    emit = info.find(f"{{{NS}}}emit")
    ide = info.find(f"{{{NS}}}ide")
    total = info.find(f"{{{NS}}}total/{{{NS}}}ICMSTot")
    pag = info.find(f"{{{NS}}}pag")
    if emit is None or ide is None or total is None:
        raise ErroNfeLocal("A NFC-e autorizada não tem os grupos obrigatórios.")

    address_parts = [
        _one(emit, "./n:enderEmit/n:xLgr/text()"),
        _one(emit, "./n:enderEmit/n:nro/text()"),
        _one(emit, "./n:enderEmit/n:xBairro/text()"),
        _one(emit, "./n:enderEmit/n:xMun/text()"),
        _one(emit, "./n:enderEmit/n:UF/text()"),
    ]
    items = []
    for det in info.findall(f"{{{NS}}}det"):
        prod = det.find(f"{{{NS}}}prod")
        if prod is None:
            continue
        items.append({
            "code": _one(prod, "./n:cProd/text()") or "-",
            "description": _one(prod, "./n:xProd/text()") or "-",
            "quantity": _number(_one(prod, "./n:qCom/text()"), 4),
            "unit": _one(prod, "./n:uCom/text()") or "-",
            "unit_value": _money(_one(prod, "./n:vUnCom/text()")),
            "total": _money(_one(prod, "./n:vProd/text()")),
        })
    if not items:
        raise ErroNfeLocal("A NFC-e autorizada não possui itens para impressão.")

    payments = []
    if pag is not None:
        for detail in pag.findall(f"{{{NS}}}detPag"):
            code = _one(detail, "./n:tPag/text()")
            payments.append({
                "name": _one(detail, "./n:xPag/text()") or PAYMENT_NAMES.get(code, "Outros"),
                "value": _money(_one(detail, "./n:vPag/text()")),
            })

    dest = info.find(f"{{{NS}}}dest")
    consumer = "CONSUMIDOR NÃO IDENTIFICADO"
    if dest is not None:
        document = _one(dest, "./n:CNPJ/text()") or _one(dest, "./n:CPF/text()")
        foreign = _one(dest, "./n:idEstrangeiro/text()")
        name = _one(dest, "./n:xNome/text()")
        identification = _mask_document(document) if document else foreign
        consumer = " - ".join(part for part in (identification, name) if part) or consumer

    def total_value(tag: str) -> str:
        return _money(_one(total, f"./n:{tag}/text()"))

    additions = sum(
        (_decimal(_one(total, f"./n:{tag}/text()")) for tag in ("vFrete", "vSeg", "vOutro")),
        Decimal("0"),
    )
    tp_emis = _one(ide, "./n:tpEmis/text()")
    taxes_raw = _one(total, "./n:vTotTrib/text()")
    return DanfceData(
        key=key,
        environment=environment,
        issuer_name=_one(emit, "./n:xNome/text()", required=True),
        issuer_document=_mask_document(_one(emit, "./n:CNPJ/text()") or _one(emit, "./n:CPF/text()")),
        issuer_ie=_one(emit, "./n:IE/text()"),
        issuer_address=" - ".join(part for part in address_parts if part),
        number=_one(ide, "./n:nNF/text()", required=True),
        series=_one(ide, "./n:serie/text()", required=True),
        issued_at=_date_time(_one(ide, "./n:dhEmi/text()", required=True)),
        protocol=_one(inf_prot, "./n:nProt/text()", required=True),
        authorized_at=_date_time(_one(inf_prot, "./n:dhRecbto/text()", required=True)),
        qr_url=qr_url,
        access_url=access_url,
        items=tuple(items),
        products_total=total_value("vProd"),
        discount=total_value("vDesc"),
        additions=_money(str(additions)),
        payable=total_value("vNF"),
        taxes=(
            _money(taxes_raw)
            if taxes_raw and _decimal(taxes_raw, "total de tributos") != Decimal("0")
            else "Não informado"
        ),
        payments=tuple(payments),
        change=_money(_one(pag, "./n:vTroco/text()")) if pag is not None and _one(pag, "./n:vTroco/text()") else "",
        consumer=consumer,
        fiscal_message=_one(info, "./n:infAdic/n:infAdFisco/text()"),
        customer_message=_one(info, "./n:infAdic/n:infCpl/text()"),
        contingency=tp_emis not in {"", "1"},
    )


class _DanfcePdf(FPDF):
    def __init__(self, height_mm: float, *, paginated: bool = False):
        super().__init__(orientation="P", unit="mm", format=(PAPER_WIDTH_MM, height_mm))
        self.set_margins(SIDE_MARGIN_MM, 3, SIDE_MARGIN_MM)
        self.set_auto_page_break(paginated, margin=3)
        self.set_title("DANFE NFC-e")

    def separator(self) -> None:
        self.ln(1)
        self.set_draw_color(80, 80, 80)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(1.4)

    def centered(self, text: str, *, size: float = 7, bold: bool = False, height: float = 3.2) -> None:
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B" if bold else "", size)
        self.multi_cell(0, height, text=text, align="C", new_x="LMARGIN", new_y="NEXT")

    def split_row(self, label: str, value: str, *, bold: bool = False) -> None:
        self.set_font("Helvetica", "B" if bold else "", 7)
        self.cell(49, 3.4, text=label)
        self.set_font("Helvetica", "B", 7)
        self.cell(25, 3.4, text=value, align="R", new_x="LMARGIN", new_y="NEXT")


def _render(data: DanfceData, height_mm: float, *, paginated: bool = False) -> _DanfcePdf:
    pdf = _DanfcePdf(height_mm, paginated=paginated)
    pdf.add_page()

    pdf.centered(data.issuer_name, size=9, bold=True, height=4)
    pdf.centered(f"CNPJ/CPF: {data.issuer_document}  IE: {data.issuer_ie}", size=6.5)
    pdf.centered(data.issuer_address, size=6.3)
    pdf.separator()
    pdf.centered("DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA", size=7, bold=True)
    if data.environment == "2":
        pdf.centered("EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", size=7, bold=True)
    if data.contingency:
        # Esta rota recebe nfeProc com protocolo autorizado. O texto “Pendente
        # de autorização” só cabe no DANFE offline anterior à transmissão e
        # seria falso depois da autorização comprovada abaixo.
        pdf.centered("EMITIDA EM CONTINGÊNCIA", size=7.5, bold=True)
    pdf.separator()

    pdf.set_font("Helvetica", "B", 5.8)
    pdf.cell(42, 3.2, text="CÓDIGO  DESCRIÇÃO")
    pdf.cell(32, 3.2, text="QTD x VL.UN. = TOTAL", align="R", new_x="LMARGIN", new_y="NEXT")
    for item in data.items:
        pdf.set_font("Helvetica", "B", 6.6)
        pdf.multi_cell(0, 3.1, text=f"{item['code']}  {item['description']}")
        pdf.set_font("Helvetica", "", 6.6)
        pdf.cell(
            0,
            3.1,
            text=f"{item['quantity']} {item['unit']} x {item['unit_value']} = {item['total']}",
            align="R",
            new_x="LMARGIN",
            new_y="NEXT",
        )
    pdf.separator()

    pdf.split_row("Qtde. total de itens", str(len(data.items)))
    pdf.split_row("Valor total R$", data.products_total)
    if data.discount != "0,00":
        pdf.split_row("Desconto R$", data.discount)
    if data.additions != "0,00":
        pdf.split_row("Acréscimos R$", data.additions)
    pdf.split_row("VALOR A PAGAR R$", data.payable, bold=True)
    for payment in data.payments:
        pdf.split_row(payment["name"], payment["value"])
    if data.change:
        pdf.split_row("Troco R$", data.change)
    pdf.split_row("Tributos aproximados R$", data.taxes)
    pdf.separator()

    pdf.centered("Consulte pela chave de acesso em", size=6.5)
    pdf.centered(data.access_url, size=6.1)
    pdf.centered(" ".join(data.key[index:index + 4] for index in range(0, 44, 4)), size=6.3, bold=True)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
    qr.add_data(data.qr_url.encode("utf-8"))
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    if paginated and pdf.will_page_break(QR_SIZE_MM + 14):
        pdf.add_page()
    qr_x = (PAPER_WIDTH_MM - QR_SIZE_MM) / 2
    pdf.image(buffer, x=qr_x, y=pdf.get_y() + 1, w=QR_SIZE_MM, h=QR_SIZE_MM)
    pdf.set_y(pdf.get_y() + QR_SIZE_MM + 2)

    pdf.centered(data.consumer, size=6.5, bold=True)
    pdf.centered(
        f"NFC-e nº {data.number}  Série {data.series}  {data.issued_at}",
        size=6.5,
    )
    pdf.centered(
        f"Protocolo de autorização: {data.protocol}\n{data.authorized_at}",
        size=6.2,
    )
    if data.fiscal_message:
        pdf.separator()
        pdf.centered(data.fiscal_message, size=6.2)
    if data.customer_message:
        pdf.separator()
        pdf.centered(data.customer_message, size=6.2)

    return pdf


def gerar_danfce(xml_processado: str) -> bytes:
    data = parse_authorized_nfce(xml_processado)
    # Bobina é contínua: a primeira passagem mede o conteúdo; a segunda gera
    # a página no tamanho exato, evitando avançar dezenas de milímetros em branco.
    probe = _render(data, MAX_CONTINUOUS_HEIGHT_MM)
    measured_height = probe.get_y() + 4
    if measured_height <= MAX_CONTINUOUS_HEIGHT_MM:
        pdf = _render(data, max(measured_height, 80))
    else:
        # O PDF 1.7 limita cada página a 200 polegadas. Uma NFC-e no limite do
        # schema (centenas de itens) vira múltiplas páginas térmicas em vez de
        # cortar conteúdo ou gerar uma página inválida.
        pdf = _render(data, PAGINATED_HEIGHT_MM, paginated=True)

    raw = pdf.output()
    result = bytes(raw)
    if len(result) < 1_000 or not result.startswith(b"%PDF-") or len(result) > MAX_PDF_BYTES:
        raise ErroNfeLocal("O DANFE NFC-e gerado é inválido ou excede 2 MB.")
    return result
