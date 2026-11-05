"""Transporte mTLS com a API Sefin Nacional.

Autenticação de transporte = o certificado A1 do PRÓPRIO cliente. O CNPJ também
precisa ter feito o primeiro acesso/credenciamento exigido pelo Painel do
Contribuinte; certificado válido sozinho não garante permissão de emissão.

⚠️ O `POST /nfse` é SÍNCRONO (201 já com a chave de acesso e a NFS-e). Não há
fila nem polling — e, por isso mesmo, **NÃO se faz retry automático de POST**:
reenviar uma DPS que talvez tenha sido aceita é como emitir nota duas vezes.
Só GET é retentado.
"""

from __future__ import annotations

from datetime import date
import logging
import time

import requests

from ..config import Config, base_adn, base_sefin, get_config
from ..custodia import ParDeChaves
from ..errors import (
    AcessoNegadoNoGoverno,
    DocumentoNaoEncontrado,
    DocumentoRejeitado,
    ServicoFiscalIndisponivel,
)
from ..rejections import traduzir_rejeicao

log = logging.getLogger("dominex-fiscal.sefin")

TENTATIVAS_GET = 3
ESPERA_ENTRE_TENTATIVAS = (0.8, 2.0)

INDISPONIVEL = (
    "O sistema da administração tributária está indisponível no momento. "
    "Tente novamente em alguns minutos."
)
CERTIFICADO_RECUSADO = (
    "O certificado digital da empresa não foi aceito pela administração "
    "tributária. Verifique se ele está válido e é o certificado do CNPJ emissor."
)


def _campo_sem_caixa(fonte: dict, nome: str):
    """Lê JSON do governo sem depender da capitalização das chaves."""
    alvo = nome.casefold()
    for chave, valor in fonte.items():
        if str(chave).casefold() == alvo:
            return valor
    return None


def _mensagens(corpo: dict) -> list[dict]:
    if not isinstance(corpo, dict):
        return []
    erros = _campo_sem_caixa(corpo, "erros")
    if isinstance(erros, list):
        return [e for e in erros if isinstance(e, dict)]
    erro = _campo_sem_caixa(corpo, "erro")
    if isinstance(erro, dict):
        return [erro]
    return []


def _texto_da_rejeicao(mensagens: list[dict]) -> tuple[str, str]:
    """(código, mensagem PT-BR) da primeira mensagem de processamento.

    A descrição do governo já vem em PT-BR e é ACIONÁVEL ("código não
    administrado pelo município"). Passamos adiante de propósito: esconder isso
    do usuário só transformaria um erro corrigível num mistério.
    """
    if not mensagens:
        return "", "A administração tributária recusou a nota fiscal."
    primeira = mensagens[0]
    codigo = str(_campo_sem_caixa(primeira, "codigo") or "").strip()
    partes = [
        str(
            _campo_sem_caixa(primeira, "descricao")
            or _campo_sem_caixa(primeira, "mensagem")
            or ""
        ).strip(),
        str(_campo_sem_caixa(primeira, "complemento") or "").strip(),
    ]
    detalhe = " ".join(p for p in partes if p).strip()
    if not detalhe:
        detalhe = "sem detalhamento"
    return codigo, f"A prefeitura recusou a nota fiscal: {detalhe}"


class SefinClient:
    def __init__(
        self,
        ambiente: int,
        certificado: ParDeChaves,
        cfg: Config | None = None,
    ) -> None:
        self.cfg = cfg or get_config()
        self.ambiente = 1 if ambiente == 1 else 2
        # ⚠️ Servidor ainda não liberado para produção: recusar é obrigatório.
        # Redirecionar a produção para homologação em silêncio faria o cliente
        # acreditar que emitiu uma nota que não existe.
        if self.ambiente == 1 and self.cfg.producao_bloqueada:
            raise ServicoFiscalIndisponivel(
                "A emissão fiscal em produção ainda não está liberada neste "
                "servidor. Fale com o suporte."
            )
        self.base = base_sefin(self.ambiente, self.cfg)
        self._cert = (certificado.cert_pem, certificado.key_pem)

    # -- transporte -----------------------------------------------------------

    def _chamar_em_base(
        self,
        metodo: str,
        base: str,
        caminho: str,
        **kwargs,
    ) -> requests.Response:
        url = f"{base.rstrip('/')}{caminho}"
        tentativas = TENTATIVAS_GET if metodo == "GET" else 1
        ultimo_erro: Exception | None = None

        for tentativa in range(tentativas):
            try:
                resposta = requests.request(
                    metodo,
                    url,
                    cert=self._cert,
                    verify=self.cfg.verificar_tls,
                    timeout=self.cfg.timeout_segundos,
                    **kwargs,
                )
            except requests.exceptions.SSLError as exc:
                # Handshake mTLS recusado = problema do certificado do cliente.
                raise AcessoNegadoNoGoverno(
                    CERTIFICADO_RECUSADO, detalhe=type(exc).__name__
                ) from None
            except requests.exceptions.RequestException as exc:
                ultimo_erro = exc
            else:
                if metodo == "GET" and resposta.status_code >= 500 and tentativa + 1 < tentativas:
                    time.sleep(ESPERA_ENTRE_TENTATIVAS[tentativa])
                    continue
                return resposta

            if tentativa + 1 < tentativas:
                time.sleep(ESPERA_ENTRE_TENTATIVAS[tentativa])

        raise ServicoFiscalIndisponivel(
            INDISPONIVEL, detalhe=type(ultimo_erro).__name__ if ultimo_erro else "timeout"
        )

    def _chamar(self, metodo: str, caminho: str, **kwargs) -> requests.Response:
        return self._chamar_em_base(metodo, self.base, caminho, **kwargs)

    @staticmethod
    def _corpo(resposta: requests.Response) -> dict:
        try:
            corpo = resposta.json()
        except ValueError:
            return {}
        return corpo if isinstance(corpo, dict) else {}

    def _avaliar(self, resposta: requests.Response, *, contexto: str) -> dict:
        corpo = self._corpo(resposta)
        codigo = resposta.status_code

        if 200 <= codigo < 300:
            return corpo

        if codigo in (401, 403):
            raise AcessoNegadoNoGoverno(CERTIFICADO_RECUSADO, detalhe=contexto)
        if codigo == 404:
            raise DocumentoNaoEncontrado(
                "Nota fiscal não encontrada na administração tributária.",
                detalhe=contexto,
            )
        if codigo >= 500:
            raise ServicoFiscalIndisponivel(INDISPONIVEL, detalhe=f"{contexto}:{codigo}")

        mensagens = _mensagens(corpo)
        cod_erro, texto = _texto_da_rejeicao(mensagens)
        # Log técnico completo fica no servidor; o usuário só vê `texto`.
        log.warning(
            "sefin rejeitou %s: http=%s codigo=%s mensagens=%s",
            contexto,
            codigo,
            cod_erro,
            mensagens,
        )
        orientacao = traduzir_rejeicao(
            "nfse_nacional",
            cod_erro,
            texto,
            operacao=contexto,
        )
        raise DocumentoRejeitado(
            texto,
            codigo=cod_erro or "documento_rejeitado",
            detalhe=mensagens,
            orientacao=orientacao,
        )

    # -- operações ------------------------------------------------------------

    def consultar_convenio(
        self,
        municipio_ibge: str,
        *,
        op_simp_nac: str | None = None,
        data_competencia: str | None = None,
    ) -> dict:
        """Confirma no ADN se o município aderiu ao Ambiente Nacional.

        A API de parametrização exige o mesmo mTLS da emissão. Um HTTP 200 não
        basta: somente ``aderenteAmbienteNacional == 1`` libera o tenant.
        ``0`` confirma ausência; ``-1`` é estado não informado e falha fechado.
        """
        base = f"{base_adn(self.ambiente).rstrip('/')}/parametrizacao"
        resposta = self._chamar_em_base(
            "GET",
            base,
            f"/{municipio_ibge}/convenio",
            headers={"Accept": "application/json"},
        )

        if resposta.status_code == 404:
            return {
                "municipioIbge": municipio_ibge,
                "podeEmitir": False,
                "fonte": "adn_parametrizacao",
                "motivo": "municipio_sem_parametrizacao",
            }

        corpo = self._avaliar(resposta, contexto="parametrizacao_municipal")
        parametros = corpo.get("parametrosConvenio")
        ambiente_nacional = (
            parametros.get("aderenteAmbienteNacional")
            if isinstance(parametros, dict)
            else None
        )
        emissor_nacional = (
            parametros.get("aderenteEmissorNacional")
            if isinstance(parametros, dict)
            else None
        )
        habilitacao_rfb = (
            parametros.get("situacaoEmissaoPadraoContribuintesRFB")
            if isinstance(parametros, dict)
            else None
        )

        # Resolução CGSN 191/2026: desde 01/11/2026, ME/EPP optante pelo
        # Simples emite obrigatoriamente pela Sefin Nacional (Web ou API),
        # mesmo quando o município mantém emissor próprio. O parâmetro
        # municipal é genérico e pode continuar 0; regime + competência são a
        # porta federal específica do contribuinte. O POST da DPS ainda valida
        # o enquadramento nas bases RFB/Simples e é a autoridade definitiva.
        try:
            competencia = date.fromisoformat(str(data_competencia))
        except (TypeError, ValueError):
            competencia = None
        simples_nacional_obrigatorio = op_simp_nac == "3" and (
            competencia is not None and competencia >= date(2026, 11, 1)
        )

        # Município no ADN + uma das portas oficiais de emissão:
        # adesão ao Emissor Nacional ou habilitação-padrão dos contribuintes
        # RFB, além da obrigatoriedade federal específica de ME/EPP.
        pode_emitir = ambiente_nacional == 1 and (
            emissor_nacional == 1
            or habilitacao_rfb == 1
            or simples_nacional_obrigatorio
        )
        valores_conclusivos = all(
            valor in (0, 1)
            for valor in (ambiente_nacional, emissor_nacional, habilitacao_rfb)
        )
        if not pode_emitir and not valores_conclusivos:
            raise ServicoFiscalIndisponivel(
                "Não conseguimos confirmar a liberação do município agora. "
                "Tente novamente em alguns minutos.",
                codigo="cobertura_indisponivel",
                detalhe="aderencia_nao_informada",
            )

        return {
            "municipioIbge": municipio_ibge,
            "podeEmitir": pode_emitir,
            "fonte": "adn_parametrizacao",
            "motivo": (
                "emissor_nacional_habilitado"
                if emissor_nacional == 1
                else "contribuinte_rfb_habilitado"
                if habilitacao_rfb == 1
                else "simples_nacional_obrigatorio"
                if simples_nacional_obrigatorio
                else "emissor_nacional_nao_habilitado"
            ),
        }

    def emitir(self, dps_gzip_b64: str) -> dict:
        resposta = self._chamar("POST", "/nfse", json={"dpsXmlGZipB64": dps_gzip_b64})
        return self._avaliar(resposta, contexto="emissao")

    def consultar(self, chave: str) -> dict:
        resposta = self._chamar("GET", f"/nfse/{chave}")
        return self._avaliar(resposta, contexto="consulta")

    def registrar_evento(self, chave: str, evento_gzip_b64: str) -> dict:
        resposta = self._chamar(
            "POST",
            f"/nfse/{chave}/eventos",
            json={"pedidoRegistroEventoXmlGZipB64": evento_gzip_b64},
        )
        return self._avaliar(resposta, contexto="evento")

    def consultar_evento(self, chave: str, tipo_evento: str, sequencial: int = 1) -> dict | None:
        """`None` quando não existe evento desse tipo (404 é resposta normal aqui)."""
        resposta = self._chamar("GET", f"/nfse/{chave}/eventos/{tipo_evento}/{sequencial}")
        if resposta.status_code == 404:
            return None
        try:
            return self._avaliar(resposta, contexto="consulta_evento")
        except DocumentoNaoEncontrado:
            return None
