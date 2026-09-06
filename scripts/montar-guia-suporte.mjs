#!/usr/bin/env node
/**
 * Monta o "Guia Técnico" em PDF A4 vertical, a partir dos fragmentos
 * HTML em docs/guia-tecnico/secoes/T*.html.
 *
 * Estrutura:
 *   1. Capa (página escura, sangria total)
 *   2. Índice clicável (fundo branco)
 *   3. Para cada tutorial T0..T17:
 *        a. Capa de seção (página escura, sangria total, com os capítulos)
 *        b. Conteúdo (fundo branco)
 *
 * Uso:  node scripts/montar-guia-suporte.mjs
 *
 * Saída:
 *   docs/guia-tecnico/Guia-Tecnico-Dominex.pdf
 *   docs/guia-tecnico/guia.html
 *
 * Portado de EcoSistemaSaaS (scripts/montar-guia-suporte.mjs). Adaptações:
 * raiz docs/guia-tecnico, nome do PDF, grade de 18 seções (T0..T17) em 7 fases
 * (a Trilha Domiflix, não a Ecoflix) e identidade visual Dominex (verde
 * #00C597 sobre fundo #141414, no lugar do verde-sinal do EcoSistema).
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve("docs/guia-tecnico");
const SECOES = path.join(ROOT, "secoes");
const CAPS = JSON.parse(fs.readFileSync(path.join(ROOT, "grade/capitulos.json"), "utf8"));
const VERSAO = (fs.readFileSync("src/config/version.ts", "utf8").match(/["'](\d+\.\d+\.\d+)["']/) || [])[1] || "";

const ORDEM = Array.from({ length: 18 }, (_, i) => `T${i}`);

const FASES = [
  { n: "01", titulo: "Deixar o sistema de pé", ts: ["T0", "T1", "T2"] },
  { n: "02", titulo: "Os cadastros que sustentam tudo", ts: ["T3", "T4"] },
  { n: "03", titulo: "A operação rodando", ts: ["T5", "T6", "T7", "T8"] },
  { n: "04", titulo: "Vender", ts: ["T9", "T10"] },
  { n: "05", titulo: "Contratos, PMOC e o cliente", ts: ["T11", "T12"] },
  { n: "06", titulo: "O dinheiro e o fiscal", ts: ["T13", "T14"] },
  { n: "07", titulo: "Gente e crescimento", ts: ["T15", "T16", "T17"] },
];
const FASE_DE = {};
FASES.forEach((f) => f.ts.forEach((t) => (FASE_DE[t] = f)));

// ===========================================================================
//  ESTILO
//  Direção: manual técnico editorial. Capas em preto Dominex (#141414) com
//  numeral gigante fantasma e verde de marca (#00C597); miolo branco,
//  tipografia Montserrat (a mesma da marca, ver tailwind.config.ts
//  fontFamily.sans) pra texto e display — sem fonte externa nenhuma, nem pro
//  PDF nem pra página pública: os .woff2 ficam embutidos em docs/guia-tecnico/fonts/
//  e são referenciados por caminho relativo (mesma origem do @fontsource/montserrat
//  já usado pelo app; zero request pro Google Fonts). Rótulo/código usa a pilha
//  monoespaçada do SISTEMA (ui-monospace, SFMono-Regular, Menlo, Consolas),
//  também sem arquivo pra baixar.
//
//  --sinal-forte e --verde-tinta são o MESMO matiz de --sinal (#00C597, a cor
//  de marca), só escurecido (HSL 160°,100% em L=25%/20%) pra dar contraste de
//  leitura em texto sobre fundo branco: #00C597 puro sobre branco mede 2,23:1
//  (reprova WCAG AA); #007F55 mede 5,04:1 e #006644 mede 7,04:1 (ambos passam).
//  NÃO "corrigir" isso de volta pra --sinal em texto — a marca em si nunca
//  muda e continua #00C597 puro em todo destaque visual (fundo escuro, ícone,
//  barra), só não serve pra texto pequeno sobre branco.
// ===========================================================================
const FONTES = `
@font-face { font-family: "Montserrat"; font-style: normal; font-weight: 300; font-display: swap; src: url("fonts/montserrat-latin-300-normal.woff2") format("woff2"); }
@font-face { font-family: "Montserrat"; font-style: normal; font-weight: 400; font-display: swap; src: url("fonts/montserrat-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Montserrat"; font-style: normal; font-weight: 500; font-display: swap; src: url("fonts/montserrat-latin-500-normal.woff2") format("woff2"); }
@font-face { font-family: "Montserrat"; font-style: normal; font-weight: 600; font-display: swap; src: url("fonts/montserrat-latin-600-normal.woff2") format("woff2"); }
@font-face { font-family: "Montserrat"; font-style: normal; font-weight: 700; font-display: swap; src: url("fonts/montserrat-latin-700-normal.woff2") format("woff2"); }
@font-face { font-family: "Montserrat"; font-style: normal; font-weight: 800; font-display: swap; src: url("fonts/montserrat-latin-800-normal.woff2") format("woff2"); }
`;

const CSS = `
${FONTES}
@page { size: A4 portrait; margin: 17mm 15mm 17mm 15mm; }
/* páginas de sangria total (capa do documento e capa de seção) */
@page sangria { size: A4 portrait; margin: 0; }

:root {
  --breu:        #141414;
  --breu-2:      #1E1E1E;
  --sinal:       #00C597;
  --sinal-forte: #007F55;
  --verde-tinta: #006644;
  --tinta:       #101418;
  --grafite:     #5A6472;
  --linha:       #E2E7EA;
  --linha-forte: #C7D0D6;
  --papel-2:     #F5F8F7;
}

* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  font-family: "Montserrat", system-ui, sans-serif;
  font-size: 9.9pt;
  line-height: 1.58;
  color: var(--tinta);
  margin: 0;
  font-feature-settings: "kern" 1, "liga" 1;
  /* rede de segurança contra estouro horizontal: uma frase longa marcada como
     .ui (ou um token grande em code/.mono) que não coubesse na coluna faria o
     Chrome encolher o PDF INTEIRO pra não cortar essa única linha — e a
     redução (uniforme, ancorada no canto superior-esquerdo) tirava a sangria
     das capas escuras do canto inferior-direito, sem erro nenhum. Ver nota em
     .ui abaixo: a causa raiz de verdade mora lá; isto aqui é o cinto extra. */
  overflow-wrap: break-word;
}

/* ---------------------------------------------------------------------------
   PÁGINA DE SANGRIA TOTAL (capa do documento e capa de cada seção)
   As margens negativas cancelam a @page margin pra ocupar os 210x297mm.
--------------------------------------------------------------------------- */
.sangria {
  page: sangria;
  position: relative;
  width: 210mm;
  height: 297mm;
  margin: 0;
  padding: 24mm 20mm 20mm 20mm;
  background: var(--breu);
  color: #fff;
  overflow: hidden;
  break-after: page;
  display: flex;
  flex-direction: column;
}
/* atmosfera: brilho verde + malha técnica */
.sangria::before {
  content: "";
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 78% at 88% -8%, rgba(0,197,151,.24) 0%, rgba(0,197,151,0) 58%),
    radial-gradient(90% 60% at -10% 108%, rgba(0,127,85,.20) 0%, rgba(0,127,85,0) 60%);
}
.sangria::after {
  content: "";
  position: absolute; inset: 0; z-index: 0;
  background-image:
    repeating-linear-gradient(0deg,  rgba(255,255,255,.045) 0 .18mm, transparent .18mm 7mm),
    repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 .18mm, transparent .18mm 7mm);
  opacity: .4;
}
.sangria > * { position: relative; z-index: 2; }

/* numeral gigante fantasma */
.ghost {
  position: absolute; z-index: 1;
  right: -4mm; bottom: -30mm;
  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 800;
  font-size: 165mm;
  line-height: .78;
  letter-spacing: -.06em;
  color: rgba(255,255,255,.22);
  user-select: none;
}

.marca-dagua {
  position: absolute; z-index: 1;
  right: -46mm; bottom: -30mm; width: 200mm;
  opacity: .07;
}
.kicker {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 8pt; letter-spacing: .3em; text-transform: uppercase;
  color: var(--sinal);
}
.regua { height: .7mm; background: var(--sinal); width: 26mm; margin: 6mm 0; border-radius: 1mm; }

/* ------------------------------- CAPA ---------------------------------- */
.capa .topo { display: flex; justify-content: space-between; align-items: flex-start; }
.capa .marca img { height: 11mm; display: block; }
.capa-secao .marca img { height: 7mm; display: block; opacity: .9; }
.capa .meio { margin-top: auto; }
.capa h1 {
  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 800; font-size: 54pt; line-height: .96;
  letter-spacing: -.035em; margin: 0;
}
.capa h1 em { font-style: normal; color: var(--sinal); }
.capa .sub {
  font-size: 12.4pt; font-weight: 300; line-height: 1.5;
  max-width: 128mm; margin-top: 8mm; color: rgba(255,255,255,.82);
}
.capa .fichas { display: flex; gap: 4mm; margin-top: 12mm; flex-wrap: wrap; }
.capa .ficha {
  border: .5mm solid rgba(0,197,151,.42); border-radius: 2mm;
  padding: 3mm 5mm; min-width: 32mm;
}
.capa .ficha .n {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 800;
  font-size: 20pt; line-height: 1; color: var(--sinal);
}
.capa .ficha .l {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt;
  letter-spacing: .16em; text-transform: uppercase;
  color: rgba(255,255,255,.6); margin-top: 1.6mm;
}
.capa .base {
  margin-top: 14mm; padding-top: 5mm;
  border-top: .3mm solid rgba(255,255,255,.18);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 8pt;
  color: rgba(255,255,255,.55); line-height: 1.9;
}
.capa .base b { color: rgba(255,255,255,.9); font-weight: 500; }

/* --------------------------- CAPA DE SEÇÃO ----------------------------- */
.capa-secao .topo { display: flex; justify-content: space-between; align-items: baseline; }
.capa-secao .topo { align-items: center; }
.capa-secao .fase {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.6pt;
  letter-spacing: .22em; text-transform: uppercase; color: rgba(255,255,255,.5);
  margin-top: 10mm;
}
.capa-secao .cod {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600;
  font-size: 13pt; letter-spacing: .02em; color: var(--breu); background: var(--sinal);
  padding: 1.2mm 3.4mm; border-radius: 1.6mm; letter-spacing: -.01em;
}
.capa-secao .titulo-bloco { margin-top: auto; }
.capa-secao h1 {
  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 800; font-size: 34pt; line-height: 1.02;
  letter-spacing: -.03em; margin: 0; max-width: 152mm;
}
.capa-secao .resumo {
  font-size: 11.6pt; font-weight: 300; line-height: 1.5;
  color: rgba(255,255,255,.8); max-width: 138mm; margin-top: 6mm;
}
/* selo de módulo pago — metadado de SEÇÃO, gerado a partir de capitulos.json */
.capa-secao .selo-modulo {
  display: inline-block; margin-top: 4mm;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 8pt; font-weight: 600; letter-spacing: .02em;
  background: var(--sinal); color: var(--breu);
  padding: 1.4mm 3.2mm; border-radius: 1.6mm;
}
.capa-secao .indice-secao { margin-top: auto; }
.capa-secao .indice-secao .rot {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt;
  letter-spacing: .22em; text-transform: uppercase; color: var(--sinal);
  margin-bottom: 4mm;
}
.capa-secao ol.caps { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 9mm; }
.capa-secao ol.caps li {
  display: flex; gap: 3mm; align-items: baseline;
  padding: 1.5mm 0; border-top: .2mm solid rgba(255,255,255,.13);
  font-size: 8.8pt; line-height: 1.35; break-inside: avoid;
  color: rgba(255,255,255,.86);
}
.capa-secao ol.caps li .num {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt;
  color: var(--sinal); flex: 0 0 5mm;
}
.capa-secao .base {
  margin-top: 9mm; padding-top: 4mm;
  border-top: .3mm solid rgba(255,255,255,.18);
  display: flex; gap: 9mm; flex-wrap: wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.6pt;
  color: rgba(255,255,255,.5); letter-spacing: .05em;
}
.capa-secao .base b { color: var(--sinal); font-weight: 500; }

/* ------------------------------ ÍNDICE --------------------------------- */
.indice { break-after: page; }
.indice .kicker { color: var(--sinal-forte); }
.indice h2 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 800;
  font-size: 30pt; letter-spacing: -.03em; margin: 3mm 0 2mm 0; color: var(--tinta);
}
.indice .nota { font-size: 9.4pt; color: var(--grafite); margin: 0 0 8mm 0; max-width: 140mm; }
.indice .fase-bloco { margin-bottom: 5.5mm; break-inside: avoid; }
.indice .fase-cab {
  display: flex; align-items: baseline; gap: 3mm;
  background: var(--breu); color: #fff; padding: 1.8mm 3.5mm; border-radius: 1.6mm;
}
.indice .fase-cab .n {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.6pt; color: var(--sinal);
  letter-spacing: .12em;
}
.indice .fase-cab .t {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 700;
  font-size: 9.6pt; letter-spacing: .01em;
}
.indice ol { list-style: none; margin: 0; padding: 0; }
.indice a {
  display: flex; align-items: baseline; gap: 3mm;
  text-decoration: none; color: var(--tinta);
  padding: 2mm 3.5mm; border-bottom: .2mm solid var(--linha);
}
.indice a .cod {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600;
  flex: 0 0 11mm; font-size: 8.6pt; color: var(--sinal-forte);
}
.indice a .nome { flex: 1 1 auto; font-size: 10.2pt; font-weight: 500; }
.indice a .dur {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.6pt; color: var(--grafite);
  flex: 0 0 auto; margin-right: 3mm;
}
.indice a .pg {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 8.4pt;
  color: var(--grafite); flex: 0 0 9mm; text-align: right;
}

/* --------------------- ANTES DE COMEÇAR (vídeos) ----------------------- */
.abertura { break-after: page; }
.abertura h2 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 800;
  font-size: 28pt; letter-spacing: -.03em; margin: 3mm 0 4mm 0;
}
.abertura .destaque {
  background: var(--breu); color: #fff; border-radius: 2.4mm;
  padding: 6mm 7mm; margin: 5mm 0 6mm 0; position: relative; overflow: hidden;
}
.abertura .destaque::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(90% 120% at 108% -20%, rgba(0,197,151,.26) 0%, rgba(0,197,151,0) 62%);
}
.abertura .destaque > * { position: relative; z-index: 2; }
.abertura .destaque .rot {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt;
  letter-spacing: .22em; text-transform: uppercase; color: var(--sinal);
  margin-bottom: 3mm;
}
.abertura .destaque h3 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 700;
  font-size: 15pt; margin: 0 0 3mm 0; letter-spacing: -.02em; color: #fff;
}
.abertura .destaque p { color: rgba(255,255,255,.84); font-size: 10pt; margin-bottom: 3mm; }
.abertura .destaque .links { margin-top: 4mm; border-top: .3mm solid rgba(255,255,255,.2); padding-top: 4mm; }
.abertura .destaque .links a {
  display: block; color: var(--sinal); text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9pt; margin: 1.6mm 0;
}
.abertura .destaque .links span {
  color: rgba(255,255,255,.6); font-family: "Montserrat", system-ui, sans-serif;
  font-size: 8.6pt; display: block; margin-bottom: 2.5mm;
}
.abertura h3 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 600; font-size: 11pt;
  margin: 6mm 0 2mm 0; color: #1B2129;
}
.abertura .duas { display: flex; gap: 6mm; }
.abertura .duas > div { flex: 1; }
.abertura .legenda { display: flex; gap: 3mm; align-items: baseline; margin: 1.8mm 0; font-size: 9.2pt; }
.abertura .legenda .amostra { flex: 0 0 30mm; }

/* ----------------------------- CONTEÚDO -------------------------------- */
section.tutorial { }
section.tutorial > h1 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 800;
  font-size: 17pt; line-height: 1.14; letter-spacing: -.02em;
  margin: 0 0 4mm 0; padding-bottom: 2.5mm;
  border-bottom: .7mm solid var(--breu);
  color: var(--tinta);
}
section.tutorial > h1 .tcode {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; font-size: 9.4pt;
  background: var(--breu); color: var(--sinal);
  padding: .9mm 2.4mm; border-radius: 1.2mm; margin-right: 2.5mm; vertical-align: 1.5pt;
}

p.lead {
  font-size: 11pt; font-weight: 300; line-height: 1.5;
  color: #2A313A; margin: 0 0 4.5mm 0;
}

.meta {
  display: block; background: var(--papel-2);
  border-left: .8mm solid var(--sinal-forte);
  padding: 3mm 4mm; margin: 0 0 6mm 0;
  font-size: 8.8pt; color: #333C46; border-radius: 0 1.6mm 1.6mm 0;
}
.meta span { display: block; margin: .7mm 0; }
.meta b {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; font-size: 7.8pt;
  letter-spacing: .08em; text-transform: uppercase; color: var(--verde-tinta);
}

section.tutorial h2 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 700;
  font-size: 13pt; letter-spacing: -.015em;
  margin: 8mm 0 2.5mm 0; padding-bottom: 1.6mm;
  border-bottom: .2mm solid var(--linha-forte);
  break-after: avoid;
}
section.tutorial h2.suporte {
  color: #fff; background: var(--breu); border: 0;
  padding: 2.2mm 3.5mm; border-radius: 1.6mm; margin-top: 9mm;
}
section.tutorial h3 {
  font-family: "Montserrat", system-ui, sans-serif; font-weight: 600;
  font-size: 10.4pt; margin: 5mm 0 1.5mm 0; color: #1B2129;
  break-after: avoid;
}
section.tutorial h3::before {
  content: ""; display: inline-block; width: 2.4mm; height: 2.4mm;
  background: var(--sinal-forte); margin-right: 2mm; border-radius: .5mm;
  vertical-align: .3mm;
}
section.tutorial h4 { font-size: 9.9pt; font-weight: 600; margin: 3.5mm 0 1mm 0; color: #39424E; }

p { margin: 0 0 2.6mm 0; }
ul, ol { margin: 0 0 3mm 0; padding-left: 5.5mm; }
li { margin: 0 0 1.3mm 0; }
ul li::marker { color: var(--sinal-forte); }
ol li::marker { color: var(--sinal-forte); font-weight: 600; font-size: 9pt; }

code, .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 8.4pt;
  background: #EDF1F3; padding: .3mm 1.3mm; border-radius: .9mm; color: var(--verde-tinta);
}
.ui {
  font-weight: 600; font-size: 9.2pt;
  background: var(--breu); color: #fff;
  padding: .4mm 1.8mm; border-radius: 1mm;
  /* NÃO white-space:nowrap: por design isto marca nome literal de botão/campo
     (curto), mas na prática algumas seções citam mensagem inteira da tela
     ("Simulação. Não altera suas configurações de precificação.", "Em
     Configurações › Aparência › Estilo de Navegação (Desktop)"...). Com
     nowrap, uma frase dessas maior que a coluna não quebra — ela transborda
     a página, e o Chrome reage encolhendo o PDF INTEIRO (todas as 262
     páginas) pra não cortar essa única linha, o que tira a sangria das capas
     escuras do canto inferior-direito. overflow-wrap garante que o rótulo só
     quebra linha quando realmente não cabe; rótulo curto continua numa linha só. */
  overflow-wrap: anywhere;
}

/* destaques */
.aviso, .perigo, .dica, .regra {
  padding: 3mm 3.8mm; margin: 3.5mm 0; border-radius: 1.8mm; font-size: 9.4pt;
  border-left: .9mm solid; break-inside: avoid; line-height: 1.5;
}
.aviso  { background: #FFF8E4; border-color: #C98A00; color: #4A3600; }
.perigo { background: #FDECEA; border-color: #C0281F; color: #4E1512; }
.dica   { background: #E9F9F0; border-color: var(--sinal-forte); color: #0C3E22; }
.regra  { background: #F1F4F6; border-color: #58616E; color: #262C34; }
.aviso::before, .perigo::before, .dica::before, .regra::before {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt; font-weight: 600;
  letter-spacing: .16em; text-transform: uppercase; display: block; margin-bottom: 1.2mm;
}
.aviso::before  { content: "Atenção";  color: #8A5F00; }
.perigo::before { content: "Cuidado";  color: #A3211A; }
.dica::before   { content: "Dica";     color: var(--verde-tinta); }
.regra::before  { content: "Regra do sistema"; color: #454E5A; }

/* tabelas */
table { width: 100%; border-collapse: collapse; margin: 3.5mm 0 4.5mm 0; font-size: 8.7pt; }
thead { display: table-header-group; }
th {
  background: var(--breu); color: #fff; text-align: left;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 500;
  font-size: 7.6pt; letter-spacing: .1em; text-transform: uppercase;
  padding: 2.2mm 2.6mm;
}
td { padding: 2.1mm 2.6mm; border-bottom: .2mm solid var(--linha); vertical-align: top; line-height: 1.45; }
tbody tr:nth-child(even) td { background: var(--papel-2); }
table.faq td:first-child { font-weight: 600; color: #1B2129; width: 30%; }
table.faq td:nth-child(2) { width: 23%; color: #5A6472; }
tr { break-inside: avoid; }

/* perguntas e respostas */
dl.qa { margin: 2mm 0 4mm 0; }
dl.qa dt {
  font-weight: 600; color: var(--verde-tinta); margin: 3.5mm 0 1mm 0; font-size: 9.9pt;
  break-after: avoid;
}
dl.qa dt::before {
  content: "P"; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7pt;
  background: var(--sinal-forte); color: #fff; padding: .3mm 1.4mm;
  border-radius: .8mm; margin-right: 2mm; vertical-align: .8mm;
}
dl.qa dd { margin: 0; padding-left: 6.5mm; border-left: .5mm solid #D9EDE2; font-size: 9.5pt; }

.glossario {
  margin: 7mm 0 0 0; padding: 3.2mm 4mm;
  background: var(--breu); color: rgba(255,255,255,.88);
  border-radius: 1.8mm; font-size: 9pt; break-inside: avoid;
}
.glossario b {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt; font-weight: 500;
  letter-spacing: .14em; text-transform: uppercase; color: var(--sinal);
  display: block; margin-bottom: 1.4mm;
}

/* imagens */
figure { margin: 4.5mm 0; break-inside: avoid; }
figure img {
  max-width: 100%; max-height: 112mm; object-fit: contain; display: block;
  border: .2mm solid var(--linha-forte); border-radius: 1.6mm;
}
figcaption {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 7.4pt; color: var(--grafite);
  margin-top: 1.8mm; letter-spacing: .04em;
}
figcaption::before { content: "▸ "; color: var(--sinal-forte); }

hr { border: 0; border-top: .2mm solid var(--linha); margin: 6mm 0; }
`;

// ===========================================================================

function lerSecoes() {
  const out = [];
  for (const t of ORDEM) {
    const f = path.join(SECOES, `${t}.html`);
    if (!fs.existsSync(f)) {
      console.warn(`⚠️  faltando: secoes/${t}.html`);
      continue;
    }
    let html = fs.readFileSync(f, "utf8").trim();
    html = html
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<head>[\s\S]*?<\/head>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/^[\s\S]*?<body[^>]*>/i, "")
      .replace(/<\/body>[\s\S]*$/i, "")
      .replace(/<\/?html[^>]*>/gi, "")
      .trim();
    // este PDF é um guia, não um vídeo: normaliza a linguagem herdada da trilha
    html = normalizarLinguagem(html);
    // usa a versão otimizada dos prints (jpg redimensionado) pra o PDF não inchar
    html = html.replace(/src="(?:\.\/)?img\/([^"]+?)\.(?:png|jpg|jpeg)"/gi, 'src="img-pdf/$1.jpg"');
    if (!/^<section/i.test(html)) html = `<section class="tutorial">${html}</section>`;
    html = html.replace(/<section([^>]*)>/i, () => `<section class="tutorial" id="${t.toLowerCase()}">`);
    // "Módulo pago" é metadado de SEÇÃO (capitulos.json), não texto que o autor
    // digita: injeta a linha no bloco .meta pra nunca depender de alguém lembrar.
    if (CAPS[t]?.modulo_pago) {
      html = html.replace(
        /(<div class="meta">)/,
        (m) => `${m}\n    <span><b>Módulo</b> Depende do módulo ${esc(CAPS[t].modulo_pago)}</span>`
      );
    }
    out.push({ code: t, meta: CAPS[t] || {}, html });
  }
  return out;
}

// A grade do Domiflix fala em "tutorial" porque lá é vídeo. Aqui é documento.
const TROCAS = [
  [/\bNeste tutorial\b/g, "Nesta seção"],
  [/\bneste tutorial\b/g, "nesta seção"],
  [/\bNesse tutorial\b/g, "Nesta seção"],
  [/\bnesse tutorial\b/g, "nesta seção"],
  [/\bEste tutorial\b/g, "Esta seção"],
  [/\beste tutorial\b/g, "esta seção"],
  [/\bDeste tutorial\b/g, "Desta seção"],
  [/\bdeste tutorial\b/g, "desta seção"],
  [/\bO tutorial\b/g, "A seção"],
  [/\bo tutorial\b/g, "a seção"],
  [/\bdo tutorial\b/g, "da seção"],
  [/\bao tutorial\b/g, "à seção"],
  [/\bno tutorial\b/g, "na seção"],
  [/\bum tutorial\b/g, "uma seção"],
  [/\bnos tutoriais\b/g, "nas seções"],
  [/\bdos tutoriais\b/g, "das seções"],
  [/\bos tutoriais\b/g, "as seções"],
  [/\btutorial anterior\b/g, "seção anterior"],
  [/\bpróximo tutorial\b/g, "próxima seção"],
  [/\bVocê vai assistir\b/g, "Você vai ver"],
  [/\bneste vídeo\b/gi, "nesta seção"],
  [/\bo primeiro tutorial( da trilha)?\b/g, "a primeira seção do guia"],
  [/\bo último tutorial( da trilha)?\b/g, "a última seção do guia"],
  [/\bprimeiro tutorial\b/g, "primeira seção"],
  [/\búltimo tutorial\b/g, "última seção"],
  [/\btutorial da trilha\b/g, "seção do guia"],
  [/\btutoriais da trilha\b/g, "seções do guia"],
  [/\btutorial mais importante\b/g, "seção mais importante"],
  [/\bassistiu a este tutorial\b/g, "leu esta seção"],
];
function normalizarLinguagem(html) {
  return TROCAS.reduce((acc, [de, para]) => acc.replace(de, para), html);
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function capaSecao(s) {
  const m = s.meta;
  const fase = FASE_DE[s.code];
  const num = s.code.replace("T", "").padStart(2, "0");
  const caps = (m.capitulos || [])
    .map((c, i) => `<li><span class="num">${String(i + 1).padStart(2, "0")}</span><span>${esc(normalizarLinguagem(c.nome))}</span></li>`)
    .join("");
  // metadado de SEÇÃO (não de capítulo): 5 dos 18 tutoriais dependem de módulo
  // pago (T10 CRM, T11 Contratos e PMOC, T12 Portal do Cliente, T14 NFS-e,
  // T15 Funcionários/RH). É a dúvida nº1 de quem lê e não acha a tela — por
  // isso o selo sai automático da grade (capitulos.json), nunca escrito à mão
  // por seção.
  const selo = m.modulo_pago
    ? `<div class="selo-modulo">🔒 Depende do módulo ${esc(m.modulo_pago)}</div>`
    : "";
  return `
<div class="sangria capa-secao" id="${s.code.toLowerCase()}-capa">
  <div class="ghost">${num}</div>
  <div class="topo">
    <div class="marca"><img src="marca/logo-horizontal.png" alt="Dominex"></div>
    <div class="cod">${s.code}</div>
  </div>
  <div class="fase">Fase ${fase ? fase.n : "—"} · ${esc(fase ? fase.titulo : "")}</div>
  <div class="titulo-bloco">
    <h1>${esc(m.titulo || s.code)}</h1>
    ${selo}
    ${m.resumo ? `<div class="resumo">${esc(normalizarLinguagem(m.resumo))}</div>` : ""}
  </div>
  <div class="indice-secao">
    ${caps ? `<div class="rot">Nesta seção</div><ol class="caps">${caps}</ol>` : ""}
    <div class="base">
      ${m.duracao ? `<span><b>Vídeo na trilha</b> ${esc(m.duracao)}</span>` : ""}
      ${m.prereq ? `<span><b>Pré-requisito</b> ${esc(m.prereq)}</span>` : ""}
      ${m.capitulos?.length ? `<span><b>Capítulos</b> ${m.capitulos.length}</span>` : ""}
      ${m.modulo_pago ? `<span><b>Módulo</b> ${esc(m.modulo_pago)}</span>` : ""}
    </div>
  </div>
</div>`;
}

function montarIndice(secoes, paginas) {
  const by = Object.fromEntries(secoes.map((s) => [s.code, s]));
  let out = "";
  for (const f of FASES) {
    const ts = f.ts.filter((t) => by[t]);
    if (!ts.length) continue;
    out += `<div class="fase-bloco">
      <div class="fase-cab"><span class="n">FASE ${f.n}</span><span class="t">${esc(f.titulo)}</span></div>
      <ol>`;
    for (const t of ts) {
      const m = by[t].meta;
      out += `<li><a href="#${t.toLowerCase()}-capa">
        <span class="cod">${t}</span>
        <span class="nome">${esc(m.titulo || t)}</span>
        <span class="dur">${esc(m.duracao || "")}</span>
        <span class="pg">${paginas?.[t] ?? ""}</span>
      </a></li>`;
    }
    out += `</ol></div>`;
  }
  return out;
}

function montarHtml(secoes, paginas) {
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const totalCaps = secoes.reduce((a, s) => a + (s.meta.capitulos?.length || 0), 0);
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Guia Técnico — Dominex</title>
<style>${CSS}</style>
</head><body>

<div class="sangria capa">
  <img class="marca-dagua" src="marca/logo-symbol.png" alt="">
  <div class="topo">
    <div class="marca"><img src="marca/logo-horizontal.png" alt="Dominex"></div>
    <div class="kicker">Base de conhecimento · Suporte</div>
  </div>
  <div class="meio">
    <div class="kicker">Manual completo do produto</div>
    <div class="regua"></div>
    <h1>Guia <em>Técnico</em></h1>
    <div class="sub">Como funciona cada função do sistema, tela por tela, na ordem da Trilha Domiflix. Escrito para responder cliente.</div>
    <div class="fichas">
      <div class="ficha"><div class="n">${secoes.length}</div><div class="l">Seções</div></div>
      <div class="ficha"><div class="n">${totalCaps}</div><div class="l">Capítulos</div></div>
      <div class="ficha"><div class="n">07</div><div class="l">Fases</div></div>
    </div>
    <div class="base">
      <b>Versão do sistema</b> ${VERSAO ? "v" + VERSAO : "—"}<br>
      <b>Gerado em</b> ${hoje}<br>
      <b>Fonte da verdade</b> código da Dominex + grade oficial da Trilha Domiflix<br>
      Documento interno.
    </div>
  </div>
</div>

<div class="indice">
  <div class="kicker">Sumário</div>
  <h2>Índice</h2>
  <p class="nota">Clique em qualquer linha para pular direto à seção. A ordem é a mesma da Trilha Domiflix: cada seção só usa o que já foi explicado antes.</p>
  ${montarIndice(secoes, paginas)}
</div>

<div class="abertura">
  <div class="kicker" style="color:#007F55">Antes de começar</div>
  <h2>Leia junto com os vídeos</h2>
  <p class="lead">Este guia é a versão escrita da Trilha Domiflix, o curso em vídeo da Dominex. Os dois foram feitos pra andar juntos: o vídeo mostra o ritmo da operação acontecendo na tela, o guia guarda o detalhe exato que ninguém decora.</p>

  <div class="destaque">
    <div class="rot">Trilha Domiflix · curso em vídeo</div>
    <h3>Assista antes de precisar</h3>
    <p>São ${secoes.length} aulas longas, uma por área do sistema, com capítulos marcados por tempo. Quem assiste na ordem entende <b>por que</b> o sistema pede cada coisa, e para de tratar sintoma. Quem só lê o guia resolve o chamado da vez, mas erra o próximo.</p>
    <p>Para o suporte a regra é simples: quando o cliente pergunta <b>"como eu faço"</b>, mande o vídeo. Quando ele pergunta <b>"por que deu esse erro"</b>, responda pelo guia.</p>
    <div class="links">
      <span>Dentro do sistema, no menu do seu perfil, opção <b>Tutoriais | Domiflix</b>:</span>
      <a href="https://www.dominex.app/domiflix">www.dominex.app/domiflix</a>
      <span style="margin-top:3mm">Grade completa da trilha, com os capítulos de cada aula:</span>
      <a href="https://www.dominex.app/trilha-domiflix">www.dominex.app/trilha-domiflix</a>
    </div>
  </div>

  <div class="duas">
    <div>
      <h3>Como este guia é organizado</h3>
      <p>Uma seção por aula da trilha, na mesma ordem e com os mesmos capítulos. Cada seção traz:</p>
      <ul>
        <li><b>Onde fica</b>, o caminho exato no menu e o endereço da tela.</li>
        <li><b>Passo a passo</b> de cada operação.</li>
        <li><b>Regras que o sistema aplica</b>, incluindo o que ele não deixa fazer.</li>
        <li><b>Suporte: problemas comuns</b>, a frase que o cliente manda, a causa provável e o que responder.</li>
        <li><b>Perguntas frequentes</b> e as palavras que o cliente usa pra falar daquilo.</li>
      </ul>
      <p>A ordem importa: cada seção só usa o que já foi explicado antes.</p>
    </div>
    <div>
      <h3>Como ler as marcações</h3>
      <div class="legenda"><span class="amostra"><span class="ui">Finalizar</span></span> <span>nome literal de um botão ou campo da tela</span></div>
      <div class="legenda"><span class="amostra"><code>/agenda</code></span> <span>endereço da tela no navegador</span></div>
      <div class="regra">o sistema se comporta assim por regra, não é opção do usuário</div>
      <div class="dica">atalho ou caminho mais curto</div>
      <div class="aviso">ponto que costuma gerar chamado</div>
      <div class="perigo">operação sem volta</div>
    </div>
  </div>

  <div class="glossario"><b>Fonte da verdade</b> Este guia foi escrito a partir do código da Dominex, não de memória. Onde a tela e a Central de Ajuda divergiam, valeu o que o sistema faz hoje. Se algo aqui não bater com a tela do cliente, o sistema mudou: avise o time pra regerar o guia.</div>
</div>

${secoes.map((s) => capaSecao(s) + "\n" + s.html).join("\n\n")}

</body></html>`;
}

async function renderizar(html, saida) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("file://" + ROOT + "/");
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: saida,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  await browser.close();
}

// De onde vem o número do índice: do DESTINO REAL DO LINK que o Chrome gravou no
// PDF, não de procurar o título no texto. Procurar por texto errava quando a capa
// da seção extraía fora de ordem e o match caía na página de conteúdo (1 a mais),
// e aí o número impresso não batia com o lugar pra onde o clique levava.
function descobrirPaginas(pdf, secoes) {
  const script = `
import json, sys
import fitz
doc = fitz.open(sys.argv[1])
paginas = {}
for p in doc:
    for l in p.get_links():
        nd = l.get("nameddest") or ""
        if nd.endswith("-capa") and l.get("page", -1) >= 0:
            code = nd[:-5].upper()
            if code not in paginas:
                paginas[code] = l["page"] + 1
print(json.dumps(paginas))
`;
  try {
    const out = execFileSync("python3", ["-c", script, pdf], { encoding: "utf8" });
    const m = JSON.parse(out.trim().split("\n").pop());
    return Object.keys(m).length ? m : null;
  } catch (e) {
    console.warn("Não deu pra numerar o índice:", String(e).slice(0, 200));
    return null;
  }
}

// Conferência final: o número impresso no índice PRECISA bater com a página pra
// onde o link leva. Se divergir, o leitor clica e cai no lugar errado.
function conferirIndice(pdf, paginas) {
  const script = `
import json, sys
import fitz
doc = fitz.open(sys.argv[1])
esperado = json.loads(sys.argv[2])
real = {}
for p in doc:
    for l in p.get_links():
        nd = l.get("nameddest") or ""
        if nd.endswith("-capa") and l.get("page", -1) >= 0:
            code = nd[:-5].upper()
            if code not in real:
                real[code] = l["page"] + 1
ruins = {k: [v, real.get(k)] for k, v in esperado.items() if real.get(k) != v}
print(json.dumps({"conferidas": len(esperado), "divergentes": ruins}))
`;
  try {
    const out = execFileSync("python3", ["-c", script, pdf, JSON.stringify(paginas)], { encoding: "utf8" });
    return JSON.parse(out.trim().split("\n").pop());
  } catch (e) {
    return { erro: String(e).slice(0, 160) };
  }
}

(async () => {
  const secoes = lerSecoes();
  if (!secoes.length) {
    console.error("Nenhuma seção em docs/guia-tecnico/secoes/");
    process.exit(1);
  }
  console.log(`Montando ${secoes.length} seções: ${secoes.map((s) => s.code).join(", ")}`);

  const saidaPdf = path.join(ROOT, "Guia-Tecnico-Dominex.pdf");
  const saidaHtml = path.join(ROOT, "guia.html");

  let html = montarHtml(secoes, null);
  fs.writeFileSync(saidaHtml, html);
  await renderizar(html, saidaPdf);

  const paginas = descobrirPaginas(saidaPdf, secoes);
  if (paginas) {
    html = montarHtml(secoes, paginas);
    fs.writeFileSync(saidaHtml, html);
    await renderizar(html, saidaPdf);
    const conf = conferirIndice(saidaPdf, paginas);
    if (conf.erro) {
      console.warn("Conferência do índice falhou:", conf.erro);
    } else if (Object.keys(conf.divergentes).length) {
      console.error(`❌ ÍNDICE FURADO: ${Object.keys(conf.divergentes).length} seções com número diferente do destino do link`);
      console.error(JSON.stringify(conf.divergentes));
      process.exitCode = 1;
    } else {
      console.log(`Índice numerado e conferido: ${conf.conferidas}/${secoes.length} seções, número impresso = destino do link.`);
    }
  }

  // versão em texto (markdown) — é o formato que o agente de IA ingere melhor
  try {
    const md = execFileSync("python3", ["scripts/guia-para-markdown.py", saidaHtml], { encoding: "utf8" }).trim();
    console.log(md);
  } catch (e) {
    console.warn("Exportação markdown falhou:", String(e).slice(0, 200));
  }

  // pós-processo: rodapé só no miolo, marcadores, metadados e compressão
  try {
    console.log(execFileSync("python3", ["scripts/finalizar-guia.py", saidaPdf], { encoding: "utf8" }).trim());
  } catch (e) {
    console.warn("Pós-processamento falhou:", String(e).slice(0, 200));
  }

  console.log(`\n✅ ${saidaPdf} (${Math.round(fs.statSync(saidaPdf).size / 1024)} kb)`);
})();
