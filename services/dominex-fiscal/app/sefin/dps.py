"""Montagem da DPS (Declaração de Prestação de Serviço) — layout nacional 1.00.

As armadilhas 1, 2 e 3 do spike estão resolvidas AQUI e comentadas no ponto
exato. Não "limpar" esses comentários: cada um custou uma tentativa de emissão.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from nfelib.nfse.bindings.v1_0 import dps_v1_00 as dps_mod
from nfelib.nfse.bindings.v1_0 import tipos_complexos_v1_00 as tc
from nfelib.nfse.bindings.v1_0 import tipos_simples_v1_00 as ts

from ..config import VER_APLIC
from ..errors import DadosInvalidos
from ..schemas import EmitirRequest
from .serializacao import serializar

#: Fuso de Brasília. O layout exige data/hora com offset explícito.
FUSO_BR = timezone(timedelta(hours=-3))

#: Subitens da LC 116 que exigem o grupo `obra` (senão: E0370).
PREFIXOS_DE_OBRA = ("0702", "0705")


def _texto(valor) -> str:
    return (valor or "").strip() if isinstance(valor, str) else ""


def _digitos(valor) -> str:
    return re.sub(r"\D", "", _texto(valor))


def _decimal(valor, casas: int = 2) -> str:
    quantia = Decimal(str(valor)).quantize(Decimal(10) ** -casas, rounding=ROUND_HALF_UP)
    return f"{quantia:f}"


def _enum(classe, valor: str):
    """Converte string do contrato no enum da nfelib. Valor fora do domínio →
    None (campo simplesmente não vai ao XML) em vez de estourar."""
    try:
        return classe(valor)
    except ValueError:
        return None


def montar(req: EmitirRequest, agora: datetime | None = None) -> bytes:
    """Devolve a DPS serializada (ainda SEM assinatura)."""
    agora = agora or datetime.now(FUSO_BR)

    id_dps = _texto(req.dps.id)
    if len(id_dps) != 45:
        raise DadosInvalidos(
            "Não foi possível gerar o identificador da nota fiscal. "
            "Confira o CNPJ, a série e o município da empresa nas configurações fiscais."
        )

    cnpj_prestador = _digitos(req.prestador.inscricao_federal)
    if len(cnpj_prestador) not in (11, 14):
        raise DadosInvalidos("O CNPJ da empresa emissora está incompleto.")

    # -------------------------------------------------------------------------
    # PRESTADOR — armadilhas 2 e 3.
    # ⚠️ NÃO informar `xNome` (E0121), `end` (E0128) nem `IM` (E0120) quando o
    # prestador é o próprio emitente: o governo puxa tudo do cadastro nacional.
    # Mandar esses campos derruba a emissão inteira.
    # -------------------------------------------------------------------------
    reg_trib = tc.TcregTrib(
        opSimpNac=_enum(ts.TsopSimpNac, _texto(req.prestador.op_simp_nac)),
        regApTribSN=_enum(
            ts.TsregimeApuracaoSimpNac, _texto(req.prestador.reg_ap_trib_sn)
        ),
        regEspTrib=_enum(ts.TsregEspTrib, _texto(req.prestador.reg_esp_trib) or "0"),
    )
    prestador = tc.TcinfoPrestador(
        CNPJ=cnpj_prestador if len(cnpj_prestador) == 14 else None,
        CPF=cnpj_prestador if len(cnpj_prestador) == 11 else None,
        email=_texto(req.prestador.email) or None,
        regTrib=reg_trib,
    )

    # -------------------------------------------------------------------------
    # TOMADOR — aqui o endereço VAI (é dado do cliente, não do emitente).
    # -------------------------------------------------------------------------
    doc_tomador = _digitos(req.tomador.inscricao_federal)
    if len(doc_tomador) not in (11, 14):
        raise DadosInvalidos("O CPF/CNPJ do cliente está incompleto.")

    # ARMADILHA 7 — endereço do tomador é TUDO OU NADA.
    #
    # O XSD do layout nacional torna obrigatórios, dentro do bloco de endereço,
    # `endNac/cMun`, `endNac/CEP`, `xLgr`, `nro` e `xBairro`. Montar o bloco com
    # parte dos campos gera rejeição E1235 ("Falha no esquema XML do DF-e"), e a
    # mensagem do governo ENGANA: ele diz "elemento inválido 'CEP', esperado
    # 'cMun'", o que parece ordem trocada, mas na verdade é o `cMun` AUSENTE —
    # o serializador omite campo nulo e o CEP fica ocupando a posição dele.
    #
    # Foi o que aconteceu na 1ª emissão real pelo motor próprio: o cliente tinha
    # CEP e logradouro cadastrados, mas o código IBGE do município em branco.
    #
    # Endereço do tomador é OPCIONAL na DPS (o governo resolve pelo CNPJ). Então
    # quando o cadastro está incompleto, o certo é OMITIR o bloco inteiro em vez
    # de mandar pela metade e derrubar a nota do cliente.
    endereco = None
    end = req.tomador.endereco
    if end:
        municipio = _digitos(end.municipio_ibge)
        cep = _digitos(end.cep)
        logradouro = _texto(end.logradouro)
        numero = _texto(end.numero)
        bairro = _texto(end.bairro)
        if municipio and cep and logradouro and numero and bairro:
            endereco = tc.Tcendereco(
                endNac=tc.TcenderNac(cMun=municipio, CEP=cep),
                xLgr=logradouro,
                nro=numero,
                xCpl=_texto(end.complemento) or None,
                xBairro=bairro,
            )

    tomador = tc.TcinfoPessoa(
        CNPJ=doc_tomador if len(doc_tomador) == 14 else None,
        CPF=doc_tomador if len(doc_tomador) == 11 else None,
        xNome=_texto(req.tomador.razao_social) or None,
        end=endereco,
        email=_texto(req.tomador.email) or None,
    )

    # -------------------------------------------------------------------------
    # SERVIÇO — armadilha 1.
    # ⚠️ `cTribMun` (3 dígitos) é o código da PREFEITURA, complementar ao
    # `cTribNac` (6 dígitos): o município registra `14.01.01.001`. Sem ele, quem
    # administra o código rejeita com E0312 ("código não administrado pelo
    # município") — o erro que consumiu a primeira tentativa do spike.
    # -------------------------------------------------------------------------
    c_trib_nac = _digitos(req.servico.codigo_servico)
    if len(c_trib_nac) != 6:
        raise DadosInvalidos(
            "O código de tributação nacional do serviço deve ter 6 dígitos."
        )
    c_trib_mun = _digitos(req.servico.codigo_tributacao_municipal)
    if c_trib_mun and len(c_trib_mun) != 3:
        # Rede de segurança: a edge já valida. Mandar lixo para a prefeitura
        # devolve um erro indecifrável — melhor omitir.
        c_trib_mun = ""

    municipio_incidencia = (
        _digitos(req.servico.municipio_incidencia)
        or _digitos(req.dps.codigo_municipio_emissor)
    )

    obra = None
    if c_trib_nac[:4] in PREFIXOS_DE_OBRA and end is not None:
        obra = tc.TcinfoObra(
            end=tc.TcenderecoSimples(
                CEP=_digitos(end.cep) or None,
                xLgr=_texto(end.logradouro) or None,
                nro=_texto(end.numero) or None,
                xBairro=_texto(end.bairro) or None,
            )
        )

    servico = tc.Tcserv(
        locPrest=tc.TclocPrest(cLocPrestacao=municipio_incidencia or None),
        cServ=tc.Tccserv(
            cTribNac=c_trib_nac,
            cTribMun=c_trib_mun or None,
            xDescServ=_texto(req.servico.discriminacao) or "Prestação de serviços.",
            cNBS=_digitos(req.servico.codigo_nbs) or None,
        ),
        obra=obra,
    )

    # -------------------------------------------------------------------------
    # VALORES / TRIBUTAÇÃO
    # ⚠️ `pAliq` (alíquota) só entra quando a edge mandou. A supressão da E0625
    # ("não é permitido informar alíquota quando não há indicação de retenção")
    # é decidida no handler da edge, com o regime do prestador em mãos — aqui
    # NÃO se recalcula nem se chuta.
    # -------------------------------------------------------------------------
    v = req.valores
    if not (v.valor_servico > 0):
        raise DadosInvalidos("Informe um valor de serviço maior que zero.")

    trib_mun = tc.TctribMunicipal(
        tribISSQN=_enum(ts.TstribIssqn, _texto(v.trib_issqn) or "1"),
        pAliq=_decimal(v.aliquota_issqn) if v.aliquota_issqn is not None else None,
        # '1' = NÃO retido. O default do sistema já foi invertido uma vez
        # (correção de 2026-09-02) — não trocar sem ler o histórico.
        tpRetISSQN=_enum(ts.TstipoRetIssqn, _texto(v.tp_ret_issqn) or "1"),
    )

    tot_trib = None
    if v.percentual_total_tributos_sn is not None:
        tot_trib = tc.TctribTotal(pTotTribSN=_decimal(v.percentual_total_tributos_sn))

    valores = tc.TcinfoValores(
        vServPrest=tc.TcvservPrest(vServ=_decimal(v.valor_servico)),
        trib=tc.TcinfoTributacao(tribMun=trib_mun, totTrib=tot_trib),
    )

    inf = tc.TcinfDps(
        tpAmb=_enum(ts.TstipoAmbiente, str(req.ambiente)) or ts.TstipoAmbiente.VALUE_2,
        dhEmi=agora.replace(microsecond=0).isoformat(),
        verAplic=VER_APLIC,
        serie=_texto(req.dps.serie),
        nDPS=_texto(req.dps.numero),
        dCompet=_texto(req.dps.data_competencia) or agora.date().isoformat(),
        tpEmit=ts.TsemitenteDps.VALUE_1,  # 1 = o próprio prestador
        cLocEmi=_digitos(req.dps.codigo_municipio_emissor) or None,
        prest=prestador,
        toma=tomador,
        serv=servico,
        valores=valores,
        Id=id_dps,
    )
    return serializar(dps_mod.Dps(infDPS=inf, versao="1.00"))
