"""Ensaios manuais do motor próprio, exclusivamente em homologação."""

from __future__ import annotations

import hashlib
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from .xml import ErroNfeLocal

HOMOLOGATION_NAME = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
HOMOLOGATION_SCENARIOS = (
    "chuto_entrada_propria_cst41",
    "chuto_entrada_propria_cst51",
    "chuto_saida_cst51_ibscbs",
    "chuto_entrada_propria_consumidor_final",
    "chuto_entrada_cpf_sp_pis_misto",
    "chuto_entrada_cpf_mg_interestadual",
    "chuto_saida_cpf_sp_cst00",
    "chuto_saida_multitens_desconto",
)

_CASE_SPECS: dict[str, dict[str, Any]] = {
    "chuto_entrada_propria_cst41": {
        "output": False, "destination": "own", "consumer_final": False,
        "cst": "41", "cfop": "1102", "pis": "07",
    },
    "chuto_entrada_propria_cst51": {
        "output": False, "destination": "own", "consumer_final": False,
        "cst": "51", "cfop": "1102", "pis": "07",
    },
    "chuto_saida_cst51_ibscbs": {
        "output": True, "destination": "own", "consumer_final": False,
        "cst": "51", "cfop": "5102", "pis": "07", "cash": True,
    },
    "chuto_entrada_propria_consumidor_final": {
        "output": False, "destination": "own", "consumer_final": True,
        "cst": "41", "cfop": "1102", "pis": "07",
    },
    "chuto_entrada_cpf_sp_pis_misto": {
        "output": False, "destination": "cpf_sp", "consumer_final": True,
        "cst": "41", "cfop": "1102",
        "items": (
            ("ALUMINIO", "76020000", 25, "98", 0),
            ("FERRO", "72041000", 10, "09", 0),
            ("PLASTICO", "39159000", 5, "06", 0),
        ),
    },
    "chuto_entrada_cpf_mg_interestadual": {
        "output": False, "destination": "cpf_mg", "consumer_final": True,
        "cst": "41", "cfop": "2102", "pis": "09",
    },
    "chuto_saida_cpf_sp_cst00": {
        "output": True, "destination": "cpf_sp", "consumer_final": True,
        "cst": "00", "cfop": "5102", "pis": "07", "cash": True,
    },
    "chuto_saida_multitens_desconto": {
        "output": True, "destination": "own", "consumer_final": False,
        "cst": "51", "cfop": "5102", "cash": True,
        "items": (
            ("ALUMINIO", "76020000", 10, "07", 0.01),
            ("FERRO", "72041000", 20, "07", 0.01),
            ("COBRE", "74040000", 15, "07", 0.01),
            ("PLASTICO", "39159000", 5, "07", 0.01),
            ("PAPEL", "47079000", 25, "07", 0.01),
            ("ELETRONICO", "85491100", 12, "07", 0.01),
        ),
    },
}


def _money(value: Any) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _destination(kind: str, fiscal: dict[str, Any], own_address: dict[str, Any]) -> dict[str, Any]:
    if kind == "own":
        return {
            "cpfCnpj": str(fiscal.get("cnpj") or ""), "razaoSocial": HOMOLOGATION_NAME,
            "indicadorInscricaoEstadual": 1,
            "inscricaoEstadual": str(fiscal.get("inscricao_estadual") or ""),
            "endereco": own_address,
        }
    # Os nomes cpf_sp/cpf_mg preservam a origem da matriz da Chuto, mas o
    # primeiro representa operacao interna e o segundo, interestadual. Projetar
    # a UF evita que a fixture dependa da localizacao do certificado piloto.
    issuer_uf = str(own_address.get("estado") or "").upper()
    interstate_address = (
        {
            "logradouro": "RUA DE HOMOLOGACAO", "numero": "100", "bairro": "CENTRO",
            "codigoCidade": "3106200", "descricaoCidade": "BELO HORIZONTE",
            "estado": "MG", "cep": "30140071",
        }
        if issuer_uf != "MG"
        else {
            "logradouro": "RUA DE HOMOLOGACAO", "numero": "100", "bairro": "CENTRO",
            "codigoCidade": "3550308", "descricaoCidade": "SAO PAULO",
            "estado": "SP", "cep": "01001000",
        }
    )
    address = own_address if kind == "cpf_sp" else interstate_address
    return {
        "cpfCnpj": "12345678909", "razaoSocial": HOMOLOGATION_NAME,
        "indicadorInscricaoEstadual": 9, "endereco": address,
    }


def _item_taxes(cst: str, pis_cst: str, base: float, icms_rate: float) -> dict[str, Any]:
    icms: dict[str, Any] = {"origem": "0", "cst": cst}
    if cst in {"00", "51"}:
        operation_value = _money(base * icms_rate / 100)
        icms.update({
            "baseCalculo": {"modalidadeDeterminacao": 3, "percentualReducao": 0, "valor": base},
            "aliquota": icms_rate, "valor": operation_value,
        })
        if cst == "51":
            icms["diferimento"] = {
                "percentual": 100, "valor": operation_value, "valorIcmsDevido": 0,
            }
    pis: dict[str, Any] = {"cst": pis_cst}
    cofins: dict[str, Any] = {"cst": pis_cst}
    if pis_cst in {"49", "98", "99"}:
        pis.update({"baseCalculo": {"valor": 0}, "aliquota": 0, "valor": 0})
        cofins.update({"baseCalculo": {"valor": 0}, "aliquota": 0, "valor": 0})
    ibs_uf, cbs = _money(base * 0.001), _money(base * 0.009)
    return {
        "valorAproximadoTributos": 0, "icms": icms, "pis": pis, "cofins": cofins,
        "ibscbs": {
            "cst": "000", "classificacao": "000001", "baseCalculo": base,
            "uf": {"aliquota": 0.1, "valor": ibs_uf},
            "municipio": {"aliquota": 0, "valor": 0}, "valorIbs": ibs_uf,
            "cbs": {"aliquota": 0.9, "valor": cbs},
        },
    }


def _fixture(run: dict[str, Any]) -> dict[str, Any]:
    fiscal = run.get("fiscal_config") or {}
    scenario = str(run.get("scenario") or "")
    cnpj = str(fiscal.get("cnpj") or "")
    ie = str(fiscal.get("inscricao_estadual") or "")
    uf = str(fiscal.get("uf") or "").upper()
    address = {
        "logradouro": fiscal.get("logradouro"), "numero": fiscal.get("numero") or "S/N",
        "complemento": fiscal.get("complemento"), "bairro": fiscal.get("bairro"),
        "codigoCidade": fiscal.get("codigo_ibge"), "descricaoCidade": fiscal.get("cidade"),
        "estado": uf, "cep": fiscal.get("cep"),
    }
    spec = _CASE_SPECS.get(scenario)
    if not spec:
        raise ErroNfeLocal("Cenário de homologação desconhecido.")
    simple = str(fiscal.get("regime_tributario") or "").lower() == "simples_nacional" \
        or fiscal.get("is_simples_nacional") is True
    if simple and str(spec["cst"]) not in {"400"}:
        raise ErroNfeLocal(
            "Os cenários da Chutô exigem um emitente CRT 3 no piloto de homologação."
        )
    output, cst = bool(spec["output"]), str(spec["cst"])
    icms_rate = 18.0
    item_specs = spec.get("items") or (("FERRO", "72044900", 25, spec.get("pis", "07"), 0),)
    items: list[dict[str, Any]] = []
    product_total = discount_total = icms_base = icms_value = 0.0
    ibs_base = ibs_uf_total = cbs_total = 0.0
    for index, (label, ncm, gross, pis_cst, discount) in enumerate(item_specs, 1):
        gross, discount = _money(gross), _money(discount)
        base = _money(gross - discount)
        taxes = _item_taxes(cst, str(pis_cst), base, icms_rate)
        item = {
            "codigo": f"HOMOLOG-{index:02d}",
            "descricao": f"SUCATA DE {label} PARA HOMOLOGACAO",
            "ncm": ncm, "cfop": str(spec["cfop"]),
            "unidade": {"comercial": "KG", "tributavel": "KG"},
            "quantidade": {"comercial": 10, "tributavel": 10},
            "valorUnitario": {"comercial": gross / 10, "tributavel": gross / 10},
            "valor": gross, "tributos": taxes,
        }
        if discount:
            item["valorDesconto"] = discount
        items.append(item)
        product_total = _money(product_total + gross)
        discount_total = _money(discount_total + discount)
        if cst in {"00", "51"}:
            icms_base = _money(icms_base + base)
            if cst == "00":
                icms_value = _money(icms_value + taxes["icms"]["valor"])
        ibs_base = _money(ibs_base + base)
        ibs_uf_total = _money(ibs_uf_total + taxes["ibscbs"]["valorIbs"])
        cbs_total = _money(cbs_total + taxes["ibscbs"]["cbs"]["valor"])
    invoice_total = _money(product_total - discount_total)
    totals: dict[str, Any] = {
        "baseCalculoIcms": icms_base, "valorIcms": icms_value,
        "valorProdutosServicos": product_total,
        "valorFrete": 0, "valorDesconto": discount_total, "outrasDespesasAcessorias": 0,
        "valorPis": 0, "valorCofins": 0, "valorIpi": 0,
        "valorNfe": invoice_total, "valorAproximadoTributos": 0,
        "baseCalculoIbsCbs": ibs_base,
        "valorDiferimentoIbsUF": 0, "valorDevolucaoIbsUF": 0,
        "valorIbsUF": ibs_uf_total, "valorDiferimentoIbsMunicipio": 0,
        "valorDevolucaoIbsMunicipio": 0, "valorIbsMunicipio": 0,
        "valorIbs": ibs_uf_total, "valorIbsCreditoPresumido": 0,
        "valorIbsCreditoPresumidoSuspensao": 0, "valorCbs": cbs_total,
        "valorCbsDiferimento": 0, "valorCbsDevolucao": 0,
        "valorCbsCreditoPresumido": 0, "valorCbsCreditoPresumidoSuspensao": 0,
    }

    payload = {
        "idIntegracao": str(run["id"]),
        "numero": int(run["invoice_number"]), "serie": int(run["serie"]),
        "dataEmissao": str(run["issued_at"]),
        "presencial": 0, "consumidorFinal": bool(spec["consumer_final"]),
        "natureza": "VENDA DE SUCATA" if output else "COMPRA DE SUCATA",
        "saida": output, "finalidade": 1,
        "emitente": {"cpfCnpj": cnpj, "inscricaoEstadual": ie},
        "destinatario": _destination(str(spec["destination"]), fiscal, address),
        "itens": items,
        "total": totals,
        "pagamentos": [{
            "aVista": True, "meio": "01" if spec.get("cash") else "90",
            "valor": invoice_total if spec.get("cash") else 0,
        }],
        "transporte": {"modalidadeFrete": 9},
        "informacoesComplementares": (
            "DOCUMENTO DE TESTE EM HOMOLOGACAO, SEM VALOR FISCAL. "
            "CENARIO SINTETICO BASEADO NO FLUXO DE RECICLAGEM."
        ),
    }
    return {
        "payload_sha256": hashlib.sha256(str(run["id"]).encode()).hexdigest(),
        "invoice": {
            "environment": "homologacao", "issue_date": run["issued_at"],
            "invoice_type": "saida" if output else "entrada", "status": "pendente",
        },
        "fiscal_config": fiscal,
        "payload": payload,
    }
