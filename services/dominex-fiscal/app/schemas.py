"""Contrato HTTP do microserviço (o que a edge manda e recebe).

Vocabulário do LAYOUT NACIONAL da NFS-e, em PT-BR — o mesmo da fronteira neutra
`_shared/nfse-provider.ts`. Nada de nome de fornecedor.

⚠️ Campo AUSENTE ≠ campo zero. Em documento fiscal, mandar `0` onde o layout
espera "não informado" muda o sentido da nota. Por isso quase tudo é Optional e
o montador só escreve no XML o que veio preenchido.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class Certificado(BaseModel):
    """Material custodiado, exatamente como vive no banco/Storage do tenant.

    Chega aqui a CADA requisição: a VPS não guarda acervo. A edge é quem lê o
    ciphertext do Storage e a DEK envelopada do banco.
    """

    model_config = ConfigDict(extra="ignore")

    pfx_cifrado_b64: str = Field(alias="pfxCifradoB64")
    dek_envelopada_b64: str = Field(alias="dekEnvelopadaB64")
    senha_cifrada_b64: str = Field(alias="senhaCifradaB64")
    nonce_b64: str = Field(default="", alias="nonceB64")
    algoritmo: str = Field(default="AES-256-GCM", alias="algoritmo")


class RequisicaoAutenticada(BaseModel):
    """Base de toda rota que precisa do certificado do cliente."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    empresa_id: str = Field(alias="empresaId")
    #: 1 = produção · 2 = homologação. SEMPRE do request, nunca chumbado.
    ambiente: int = Field(default=2, alias="ambiente")
    certificado: Certificado


class Endereco(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    municipio_ibge: Optional[str] = Field(default=None, alias="municipioIbge")
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None


class Prestador(BaseModel):
    """Emitente. ⚠️ xNome, endereço e Inscrição Municipal NÃO vão no XML.

    Armadilhas 2 e 3 do spike: quando o prestador é o próprio emitente, o
    governo puxa esses dados do cadastro. Mandar devolve E0121/E0128 (e E0120
    no caso da IM). Ver `sefin/dps.py`.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    tipo_inscricao: str = Field(default="2", alias="tipoInscricao")
    inscricao_federal: str = Field(alias="inscricaoFederal")
    email: Optional[str] = None
    #: '1' não optante · '2' MEI · '3' Simples (ME/EPP). Ausente = não enviar.
    op_simp_nac: Optional[str] = Field(default=None, alias="opSimpNac")
    #: Obrigatório quando opSimpNac='3'.
    reg_ap_trib_sn: Optional[str] = Field(default=None, alias="regApTribSN")
    #: Regime especial. '0' = nenhum.
    reg_esp_trib: Optional[str] = Field(default="0", alias="regEspTrib")


class Tomador(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    tipo_inscricao: str = Field(default="2", alias="tipoInscricao")
    inscricao_federal: str = Field(alias="inscricaoFederal")
    razao_social: str = Field(alias="razaoSocial")
    email: Optional[str] = None
    endereco: Optional[Endereco] = None


class Servico(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    #: cTribNac — 6 dígitos.
    codigo_servico: str = Field(alias="codigoServico")
    codigo_nbs: Optional[str] = Field(default=None, alias="codigoNbs")
    municipio_incidencia: Optional[str] = Field(default=None, alias="municipioIncidencia")
    discriminacao: str
    #: cTribMun — 3 dígitos. Armadilha 1 (E0312). Ausente = não enviar.
    codigo_tributacao_municipal: Optional[str] = Field(
        default=None, alias="codigoTributacaoMunicipal"
    )


class Valores(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    valor_servico: float = Field(alias="valorServico")
    aliquota_issqn: Optional[float] = Field(default=None, alias="aliquotaIssqn")
    #: '1' tributável · '2' exportação · '3' imunidade · '4' não incidência.
    trib_issqn: Optional[str] = Field(default=None, alias="tribIssqn")
    #: '1' NÃO retido · '2' retido pelo tomador · '3' pelo intermediário.
    tp_ret_issqn: Optional[str] = Field(default=None, alias="tpRetIssqn")
    valor_pis: Optional[float] = Field(default=None, alias="valorPis")
    valor_cofins: Optional[float] = Field(default=None, alias="valorCofins")
    valor_csll: Optional[float] = Field(default=None, alias="valorCsll")
    percentual_total_tributos_sn: Optional[float] = Field(
        default=None, alias="percentualTotalTributosSimplesNacional"
    )


class Dps(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    #: Id do layout nacional (45 caracteres), calculado pela edge.
    id: str
    serie: str
    numero: str
    data_competencia: str = Field(alias="dataCompetencia")
    codigo_municipio_emissor: str = Field(alias="codigoMunicipioEmissor")


class EmitirRequest(RequisicaoAutenticada):
    dps: Dps
    prestador: Prestador
    tomador: Tomador
    servico: Servico
    valores: Valores


class CancelarRequest(RequisicaoAutenticada):
    #: CNPJ/CPF de quem pede o cancelamento (o emitente). Só dígitos.
    cnpj_autor: str = Field(alias="cnpjAutor")
    #: Texto livre 15..255 exigido pelo layout.
    motivo: str
    #: cMotivo do evento 101101. '1' por padrão (erro na emissão).
    codigo_motivo: str = Field(default="1", alias="codigoMotivo")


class ConsultarRequest(RequisicaoAutenticada):
    pass


class DanfseRequest(RequisicaoAutenticada):
    """XML já guardado pelo tenant evita uma ida ao governo (e funciona mesmo
    com o ADN fora do ar). Ausente → consultamos pela chave."""

    xml: Optional[str] = None


class SelarCertificadoRequest(BaseModel):
    """Upload: a edge manda o .pfx EM CLARO uma única vez, por TLS, e recebe de
    volta só material cifrado. Ela nunca vê a DEK nem a KEK."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    empresa_id: str = Field(alias="empresaId")
    pfx_b64: str = Field(alias="pfxB64")
    senha: str


class Alerta(BaseModel):
    codigo: Optional[str] = None
    descricao: Optional[str] = None
    complemento: Optional[str] = None


class NfseResposta(BaseModel):
    """Resposta canônica de emitir/consultar/cancelar.

    `status` já sai no vocabulário PT-BR do Dominex (autorizada | cancelada |
    rejeitada) — a edge não precisa traduzir nada.
    """

    status: str
    chave_acesso: Optional[str] = Field(default=None, alias="chaveAcesso")
    numero: Optional[str] = None
    id_dps: Optional[str] = Field(default=None, alias="idDps")
    data_emissao: Optional[str] = Field(default=None, alias="dataEmissao")
    ambiente: Optional[int] = None
    xml: Optional[str] = None
    alertas: list[Alerta] = Field(default_factory=list)
    cancelada: bool = False
    detalhe: Optional[Any] = None

    model_config = ConfigDict(populate_by_name=True)
