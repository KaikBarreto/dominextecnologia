# Philco — Ar-Condicionado (mercado BR)

> Pesquisa de dados públicos cruzando ≥2 fontes. Itens marcados com confiança.
> Nada inventado: o que não foi confirmado está em **LACUNAS**.
> Data da pesquisa: 2026-06-14.

**Legenda de confiança:** 🟢 Alta (fonte oficial Philco ou ≥2 fontes concordando) · 🟡 Média (1 e-commerce confiável) · 🔴 Baixa (blog/indireto)

---

## 1. Logo

| Item | Valor | Confiança |
|---|---|---|
| URL re-hospedável (Wikimedia) | `https://upload.wikimedia.org/wikipedia/commons/7/76/Philco_logo.svg` | 🟢 Alta |
| Licença | Domínio público (logo de formas/texto simples, abaixo do threshold de originalidade). **Atenção: marca registrada** — uso comercial pode exigir cuidado. | 🟢 Alta |
| Alternativa (PNG em várias resoluções) | logodownload.org/philco-logo (400×119 até 4096×1217) | 🟡 Média |

---

## 2. Modelos por TIPO

> Padrão de código Philco: `PAC` + BTU + sufixos. Letras comuns: `I`=Inverter, `Q`=Quente (quente+frio), `F`=Frio, `T`=Hi-Wall, `C`=Cassete, `P`=Piso-Teto, `J`=Janela. Sufixo `FM9`/`FM15`/`FM16` = geração/plataforma. Linha comercial Inverter é vendida como **"Eco Inverter"**.

### Split Hi-Wall (parede)

| Linha | Código | BTU | Ciclo | Gás | URL foto (CDN direto) | Confiança |
|---|---|---|---|---|---|---|
| Eco Inverter | PAC9000IFM15 | 9.000 | Frio | R-32 | null | 🟢 Alta (oficial + e-commerce) |
| Eco Inverter | PAC9000IQFM15 | 9.000 | Quente e Frio | R-32 | null | 🟢 Alta |
| Eco Inverter | PAC12000IFM15 | 12.000 | Frio | R-32 | null (ML bloqueia hotlink/scrape — ver LACUNAS) | 🟢 Alta |
| Inverter | PAC12FB | 12.000 | Frio | R-32 | `https://friopecas.vtexassets.com/arquivos/ids/245902/PAC12FB_00.jpg.jpg` | 🟢 Alta |
| Eco Inverter | PAC12QC | 12.000 | Quente e Frio | (R-32 provável) | null | 🟡 Média (1 fonte oficial) |
| Eco Inverter | PAC18000IFM15 | 18.000 | Frio | R-32 | null | 🟡 Média |
| Eco Inverter | PAC24000IQFM15 | 24.000 | Quente e Frio | R-32 | null | 🟢 Alta (oficial) |
| Eco Inverter | PAC30000IFM15 | 30.000 | Frio | R-32 | null | 🟡 Média (e-commerce Leveros) |
| Hi-Wall (on/off) | PAC12000TFM9 | 12.000 | Frio | (verificar) | null | 🟡 Média |

### Cassete (K7 / 4 vias)

| Linha | Código | BTU | Ciclo | Gás | URL foto (CDN direto) | Confiança |
|---|---|---|---|---|---|---|
| Eco Inverter | PAC24000ICFM9 | 24.000 | Frio | R-410A | `https://friopecas.vtexassets.com/arquivos/ids/224431/Philco-Cassete-Dez-2023.jpg` | 🟢 Alta |
| Eco Inverter | PAC55000ICFM16 | 55.000 | Frio | (verificar) | null | 🟡 Média |
| Eco Inverter | PAC60000ICFM16 | 55.000–60.000 | Frio | R-32 | null | 🟡 Média (Central Ar) |
| Inverter | PAC60000ICFM5 | 55.000 | Frio | (verificar) | null | 🟡 Média |

> ⚠️ Inconsistência de e-commerce: alguns títulos do PAC60000IC* anunciam "55.000 BTU/h" no corpo e "60000" no código. O número no código (`60000`) nem sempre bate com a capacidade real anunciada. Tratar BTU pela ficha, não pelo código.

### Piso-Teto

| Linha | Código | BTU | Ciclo | Gás | Tensão | URL foto (CDN direto) | Confiança |
|---|---|---|---|---|---|---|---|
| Eco Inverter | PAC60000IPFM15 | 60.000 | Frio | R-32 | 220V Mono | `https://refrigeracaovilanova.com/wp-content/uploads/2024/10/01-PAC60000IPFM15-1.jpg` | 🟢 Alta |
| On/Off | PAC60000PFM5 | 60.000 | Frio | (verificar) | 220V | null | 🟡 Média |
| On/Off | PAC60000PFM5N | 55.000 | Frio | (verificar) | 380V Tri | null | 🟡 Média |

### Multi-Split

Nenhuma linha Multi-Split Philco confirmada nas fontes consultadas. **Ver LACUNAS.**

### (Fora do escopo pedido, mas confirmados) Portátil / Janela

PAC12000QF5, PAC12000F5 (portátil 12k), PAC10FN/PAC10QN (portátil 10k), PAJ18FH (janela 18k frio). 🟢 Alta (site oficial).

---

## 3. Códigos de Erro

> ⚠️ Philco tem **várias plataformas** (FM, FM2, FM4, Inverter, modelo ITQFM9W) e os códigos **divergem entre elas**. Confirmar a placa/modelo antes de aplicar o diagnóstico. Antes de trocar componente: muitos erros são proteção automática — desligar da tomada, esperar 5 min, religar (repetir até 3×).

### Plataforma Inverter (genérica) — fonte: Auvo

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| F1 | Falha sensor temperatura unidade interna | Sensor interno defeituoso | Sensor danificado ou desconectado | Sensor (unidade interna) |
| F2 | Falha sensor temperatura unidade externa | Sensor externo defeituoso | Sensor danificado ou desconectado | Sensor (unidade externa) |
| F3 | Falha sensor evaporador (interna) | Sensor do evaporador não funciona | Sensor danificado | Evaporador (interna) |
| F4 | Falha sensor condensador (externa) | Sensor do condensador não funciona | Sensor danificado | Condensador (externa) |
| F5 | Falha sensor descarga do compressor | Sensor de descarga defeituoso | Sensor danificado | Compressor |

🟡 Média (1 fonte — Auvo). Padrão F1–F5 coerente com plataformas inverter.

### Plataforma FM4 — fonte: Auvo

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| F1 | Falha sensor temperatura ambiente | Mau funcionamento do sensor de ambiente | Sensor defeituoso/desconectado | Sensor temp. ambiente |
| F2 | Falha sensor serpentina interna | Problema no sensor da serpentina interna | Sensor danificado/leitura falha | Serpentina (interna) |
| F3 | Falha sensor serpentina externa | Problema no sensor da serpentina externa | Sensor danificado/leitura falha | Serpentina (externa) |

🟡 Média.

### Plataforma FM2 — fonte: Auvo

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E1 | Falha sensor temperatura ambiente | Sensor de ambiente com mau funcionamento | Sensor defeituoso/desconectado | Sensor temperatura |
| E2 | Falha sensor temperatura da serpentina | Problema na leitura da serpentina | Sensor danificado | Serpentina |
| E6 | Falha alimentação ventilador interno | Ventilador não recebe energia | Problema elétrico ou ventilador danificado | Ventilador (interna) |

🟡 Média.

### Plataforma FM — fonte: Auvo

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| F7 | Falha sensor temperatura ambiente | Sensor ambiental com mau funcionamento | Sensor defeituoso/desconectado | Sensor temperatura |
| F8 | Falha sensor serpentina interna | Problema no sensor da serpentina interna | Sensor danificado | Serpentina (interna) |
| F9 | Falha sensor serpentina externa | Problema no sensor da serpentina externa | Sensor danificado | Serpentina (externa) |

🟡 Média.

### Modelo ITQFM9W — fonte: arcondicionadotop

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E1 | Erro temperatura ambiente | Problema na temperatura ambiente | Ambiente muito quente/frio ou obstrução no sensor | Sensor de temperatura |
| E2 | Falha sensor do evaporador | Falha no sensor de temperatura do evaporador | Sensor sujo ou desconectado | Sensor evaporador |
| E3 | Anomalia na ventoinha | Anomalia na ventoinha do evaporador | Bloqueio ou dano físico | Ventoinha evaporador |
| E4 | Falha sensor do condensador | Falha no sensor de temperatura do condensador | Conexão deficiente ou sujeira | Sensor condensador |
| E5 | Problema no compressor | Problema relacionado ao compressor | Superaquecimento ou refrigeração inadequada | Compressor |
| E6 | Mau funcionamento motor externo | Mau funcionamento no motor do ventilador externo | Obstruções impedindo funcionamento | Motor ventilador externo |
| E7 | Erro sensor temperatura externa | Problema no sensor de temperatura ambiente externa | Posicionamento inadequado/obstruído | Sensor temp. externa |
| E8 | Falha placa eletrônica | Falha na placa eletrônica | Problema elétrico na placa | Placa eletrônica |
| E9 | Anomalia circuito elétrico | Anomalia no circuito elétrico | Fios soltos ou danificados | Circuito elétrico |
| E10 | Falha válvula de expansão | Falha na válvula de expansão termostática | Desgaste ou mau funcionamento | Válvula de expansão |

🟡 Média (1 fonte). Conjunto E1–E10 mais completo, mas é de UM modelo específico.

> ⚠️ Conflito real entre fontes: para a mesma família "Inverter", Auvo lista F1–F5; o modelo ITQFM9W usa E1–E10; o caso real do Reclame Aqui cita erro **"EA"** (não mapeado em nenhuma tabela). Reforça: **validar pelo manual do modelo exato**.

---

## 4. Manuais (PDF oficiais — suporte.philco.com.br)

| Manual | URL | Confiança |
|---|---|---|
| Condicionadores de Ar Inverter (genérico) | `https://suporte.philco.com.br/sfc/servlet.shepherd/document/download/0692T00000Hb7ZmQAJ` | 🟢 Alta (domínio oficial) |
| Inverter Unificado | `https://suporte.philco.com.br/sfc/servlet.shepherd/document/download/0692E00000AXK5NQAX` | 🟢 Alta |
| PAC9000IFM9 / PAC12000IFM9 / PAC18000IFM9 / PAC24000IFM9 | `https://suporte.philco.com.br/sfc/servlet.shepherd/document/download/0692T00000Eb4H9QAJ` | 🟢 Alta |
| Manual unificado (mirror Leveros) PACFC | `https://www.leverosintegra.com.br/download/manuais/philco/manual-de-instrucoes-unificado-philco-PACFC.pdf` | 🟡 Média (mirror revenda) |
| Catálogo oficial Linha Ar Condicionado 2024 (PDF) | `https://sac.philco.com.br/catalogos/catalogophilco_arcon.pdf` | 🟢 Alta (oficial; PDF é baseado em imagem, não extraível por texto) |

> ⚠️ Links `servlet.shepherd/document/download/...` retornaram 404 em UM fetch isolado mas aparecem consistentemente nos resultados de busca como links oficiais ativos. Recomenda-se validar o download na hora do uso.

---

## 5. Fontes

- Philco oficial — climatização/ar-condicionado: https://www.philco.com.br/climatizacao/ar-condicionado
- Philco oficial — Split Inverter: https://comvoce.philco.com.br/ar-condicionado/inverter.html
- Philco oficial — catálogo 2024: https://sac.philco.com.br/catalogos/catalogophilco_arcon.pdf
- Philco oficial — suporte/manuais: https://suporte.philco.com.br
- Friopecas (e-commerce, fotos CDN VTEX): https://www.friopecas.com.br
- Refrigeração Vila Nova (e-commerce, fotos CDN): https://refrigeracaovilanova.com
- Central Ar / Leveros / WebContinental / Novalar / Casas Bahia (e-commerce, capacidades)
- Auvo (blog técnico, códigos de erro): https://www.blog.auvo.com/codigo-erro-philco
- arcondicionadotop (códigos de erro modelo ITQFM9W): https://arcondicionadotop.com/tabela-de-erros-ar-condicionado-philco/
- Wikimedia Commons (logo): https://commons.wikimedia.org/wiki/File:Philco_logo.svg
- logodownload.org (logo PNG): https://logodownload.org/philco-logo/

---

## 6. LACUNAS (não confirmado / a verificar)

1. **Fotos CDN da maioria dos modelos:** só PAC12FB (Hi-Wall), PAC24000ICFM9 (cassete) e PAC60000IPFM15 (piso-teto) têm URL direto de CDN. Mercado Livre (http2.mlstatic.com) retornou 403 a scrape/hotlink — não foi possível extrair URLs diretas de imagem do ML. Magalu/Casas Bahia não foram raspados. Demais modelos = `null`.
2. **Multi-Split:** nenhuma linha Multi-Split Philco confirmada. Verificar se Philco BR comercializa multi.
3. **Gás refrigerante por modelo:** Hi-Wall e piso-teto novos são R-32; o cassete PAC24000ICFM9 apareceu como **R-410A** (geração mais antiga). Confirmar gás caso a caso — não é uniforme na marca.
4. **Capacidade real vs. código** nos cassete/piso-teto (PAC60000IC*/PFM5*): código diz 60000 mas anúncios dizem 55.000 BTU/h. Confirmar pela ficha INMETRO.
5. **Códigos de erro:** tabelas vêm de blogs (confiança média) e divergem por plataforma; erro real "EA" (Reclame Aqui) não está mapeado. Faltou extrair a tabela oficial de erros de dentro dos PDFs de manual (são image-based). Idealmente cruzar com o manual do modelo específico do cliente.
6. **Catálogo oficial 2024:** PDF é baseado em imagem (Illustrator), não extraível por texto — modelos vieram de site oficial + e-commerce, não do catálogo em si.
7. **Sufixos de código (FM5/FM9/FM15/FM16):** significado exato (geração? família?) inferido, não confirmado por documentação Philco.
