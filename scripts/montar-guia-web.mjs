#!/usr/bin/env node
/**
 * Gera a versão web pública do Guia Técnico em public/guia-tecnico/.
 *
 * Mesma fonte do PDF (docs/guia-tecnico/secoes/T*.html), layout adaptado pra
 * leitura em tela: índice fixo na lateral, cabeçalho escuro por seção e botão
 * flutuante pra baixar o PDF.
 *
 * Rota pública (sem login): /guia-tecnico
 *
 * Uso:  node scripts/montar-guia-web.mjs
 *
 * Portado de EcoSistemaSaaS (scripts/montar-guia-web.mjs). Adaptado pra raiz
 * docs/guia-tecnico, grade de 18 seções (T0..T17) em 7 fases da Trilha
 * Domiflix, identidade visual Dominex e PDF servido pelo Supabase Storage do
 * projeto byqldosixshhuiuarszp (publicado por scripts/publicar-pdf-guia.mjs).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve("docs/guia-tecnico");
const SECOES = path.join(ROOT, "secoes");
const DEST = path.resolve("public/guia-tecnico");
const CAPS = JSON.parse(fs.readFileSync(path.join(ROOT, "grade/capitulos.json"), "utf8"));
const VERSAO = (fs.readFileSync("src/config/version.ts", "utf8").match(/["'](\d+\.\d+\.\d+)["']/) || [])[1] || "";
const PDF_URL = "https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/guia-tecnico/Guia-Tecnico-Dominex.pdf";
const DIM_ARQ = path.join(ROOT, "img-otim/_dimensoes.json");
const DIMENSOES = fs.existsSync(DIM_ARQ) ? JSON.parse(fs.readFileSync(DIM_ARQ, "utf8")) : {};

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

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// mesma normalização de linguagem do PDF (a grade fala em "tutorial", aqui é guia)
const TROCAS = [
  [/\bNeste tutorial\b/g, "Nesta seção"], [/\bneste tutorial\b/g, "nesta seção"],
  [/\bNesse tutorial\b/g, "Nesta seção"], [/\bnesse tutorial\b/g, "nesta seção"],
  [/\bEste tutorial\b/g, "Esta seção"], [/\beste tutorial\b/g, "esta seção"],
  [/\bDeste tutorial\b/g, "Desta seção"], [/\bdeste tutorial\b/g, "desta seção"],
  [/\bo primeiro tutorial( da trilha)?\b/g, "a primeira seção do guia"],
  [/\bo último tutorial( da trilha)?\b/g, "a última seção do guia"],
  [/\bprimeiro tutorial\b/g, "primeira seção"], [/\búltimo tutorial\b/g, "última seção"],
  [/\btutorial da trilha\b/g, "seção do guia"], [/\btutoriais da trilha\b/g, "seções do guia"],
  [/\bO tutorial\b/g, "A seção"], [/\bo tutorial\b/g, "a seção"],
  [/\bdo tutorial\b/g, "da seção"], [/\bao tutorial\b/g, "à seção"],
  [/\bno tutorial\b/g, "na seção"], [/\bum tutorial\b/g, "uma seção"],
  [/\bnos tutoriais\b/g, "nas seções"], [/\bdos tutoriais\b/g, "das seções"],
  [/\bos tutoriais\b/g, "as seções"], [/\btutorial anterior\b/g, "seção anterior"],
  [/\bpróximo tutorial\b/g, "próxima seção"], [/\btutorial mais importante\b/g, "seção mais importante"],
  [/\bneste vídeo\b/gi, "nesta seção"],
];
const normalizar = (h) => TROCAS.reduce((a, [de, para]) => a.replace(de, para), h);

function lerSecoes() {
  const out = [];
  for (const t of ORDEM) {
    const f = path.join(SECOES, `${t}.html`);
    if (!fs.existsSync(f)) continue;
    let html = fs.readFileSync(f, "utf8").trim();
    html = html
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<head>[\s\S]*?<\/head>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/^[\s\S]*?<body[^>]*>/i, "")
      .replace(/<\/body>[\s\S]*$/i, "")
      .replace(/<\/?html[^>]*>/gi, "")
      // página pública: nada de anotação interna de revisão
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    html = normalizar(html);
    // a página é pública: a coluna é escrita pro atendente, aqui vira linguagem de cliente
    html = html.replace(/>\s*O que responder\s*\/\s*fazer\s*</gi, ">Como resolver<");
    html = html.replace(/>\s*O que responder\s*</gi, ">Como resolver<");
    html = html.replace(/src="(?:\.\/)?img\/([^"]+?)\.(?:png|jpg|jpeg)"/gi, 'src="img/$1.jpg"');
    // reserva o espaço da imagem e adia o download do que está fora da tela
    html = html.replace(/<img ([^>]*?)src="img\/([^"]+?)\.jpg"([^>]*)>/gi, (m, antes, nome, depois) => {
      const d = DIMENSOES[`${nome}.jpg`];
      const tam = d ? ` width="${d[0]}" height="${d[1]}"` : "";
      return `<img ${antes}src="img/${nome}.jpg"${depois} loading="lazy" decoding="async"${tam}>`;
    });
    // o h1 da seção vira o cabeçalho escuro; tiramos do corpo
    html = html.replace(/<section[^>]*>/i, "").replace(/<\/section>\s*$/i, "");
    html = html.replace(/<h1[\s\S]*?<\/h1>/i, "");
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

// Montserrat local (mesma fonte da marca, ver tailwind.config.ts fontFamily.sans),
// self-hosted em fonts/ — zero request pro Google Fonts na página pública. Rótulo/
// código usa a pilha monoespaçada do SISTEMA (sem arquivo pra baixar).
//
// --sinal-forte e --verde-tinta são o MESMO matiz de --sinal (#00C597), só
// escurecido pra dar contraste de leitura em texto sobre fundo branco: #00C597
// puro sobre branco mede 2,23:1 (reprova WCAG AA); #007F55 mede 5,04:1 e
// #006644 mede 7,04:1 (ambos passam). Não trocar de volta pra --sinal em texto.
const FONTES = `
@font-face{font-family:"Montserrat";font-style:normal;font-weight:300;font-display:swap;src:url("fonts/montserrat-latin-300-normal.woff2") format("woff2")}
@font-face{font-family:"Montserrat";font-style:normal;font-weight:400;font-display:swap;src:url("fonts/montserrat-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"Montserrat";font-style:normal;font-weight:500;font-display:swap;src:url("fonts/montserrat-latin-500-normal.woff2") format("woff2")}
@font-face{font-family:"Montserrat";font-style:normal;font-weight:600;font-display:swap;src:url("fonts/montserrat-latin-600-normal.woff2") format("woff2")}
@font-face{font-family:"Montserrat";font-style:normal;font-weight:700;font-display:swap;src:url("fonts/montserrat-latin-700-normal.woff2") format("woff2")}
@font-face{font-family:"Montserrat";font-style:normal;font-weight:800;font-display:swap;src:url("fonts/montserrat-latin-800-normal.woff2") format("woff2")}
`;

// REGRA QUE VALE PRA SEMPRE NESTE ARQUIVO: este CSS é UMA STRING ÚNICA E LONGA,
// não uma cascata de arquivos/imports — então a ordem em que as regras aparecem
// AQUI DENTRO é a ordem real da cascata do navegador. Uma regra dentro de
// @media só sobrescreve a regra base se vier DEPOIS dela no texto; especifi-
// cidade igual + ordem errada = a regra de baixo (a base) vence sempre, e o
// override não aparece em nenhum grep porque ele EXISTE, só nunca é aplicado.
// Já aconteceu aqui (override de .ui num @media lá em cima, base .ui bem
// depois — o override nunca valeu nada). Ao adicionar @media, cole-o LOGO
// APÓS a regra base que ele sobrescreve, nunca antes.
const CSS = `
${FONTES}
:root{
  --breu:#141414; --sinal:#00C597; --sinal-forte:#007F55; --verde-tinta:#006644;
  --tinta:#101418; --grafite:#5A6472; --linha:#E2E7EA; --linha-forte:#C7D0D6; --papel-2:#F5F8F7;
  --largura:min(860px, 100%);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth; scroll-padding-top:24px}
body{margin:0;font-family:"Montserrat",system-ui,sans-serif;font-size:16px;line-height:1.65;color:var(--tinta);background:#fff;-webkit-font-smoothing:antialiased}
a{color:var(--sinal-forte)}
img{max-width:100%;height:auto}

/* ---------------- hero ---------------- */
.hero{position:relative;background:var(--breu);color:#fff;overflow:hidden;padding:56px 24px 64px}
.hero::before{content:"";position:absolute;inset:0;background:
  radial-gradient(120% 78% at 88% -8%, rgba(0,197,151,.24) 0%, rgba(0,197,151,0) 58%),
  radial-gradient(90% 60% at -10% 108%, rgba(0,127,85,.20) 0%, rgba(0,127,85,0) 60%)}
.hero::after{content:"";position:absolute;inset:0;opacity:.4;background-image:
  repeating-linear-gradient(0deg,rgba(255,255,255,.045) 0 1px,transparent 1px 26px),
  repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 1px,transparent 1px 26px)}
.hero > *{position:relative;z-index:2}
.hero .wrap{max-width:1180px;margin:0 auto}
.hero img.logo{height:38px;display:block}
.hero .kicker{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--sinal);margin:40px 0 12px}
.hero h1{font-family:"Montserrat",system-ui,sans-serif;font-weight:800;font-size:clamp(38px,7vw,72px);line-height:.98;letter-spacing:-.035em;margin:0}
.hero h1 em{font-style:normal;color:var(--sinal)}
.hero p.sub{font-size:clamp(16px,2.2vw,20px);font-weight:300;color:rgba(255,255,255,.84);max-width:640px;margin:20px 0 0}
.hero .fichas{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}
.hero .ficha{border:1.5px solid rgba(0,197,151,.42);border-radius:10px;padding:12px 20px;min-width:120px}
.hero .ficha .n{font-family:"Montserrat",system-ui,sans-serif;font-weight:800;font-size:26px;color:var(--sinal);line-height:1}
.hero .ficha .l{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-top:6px}
.hero .meta-doc{margin-top:34px;padding-top:18px;border-top:1px solid rgba(255,255,255,.18);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:rgba(255,255,255,.55);line-height:2}
.hero .meta-doc b{color:rgba(255,255,255,.9);font-weight:500}

/* ---------------- layout ---------------- */
.layout{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:270px 1fr;gap:48px;padding:0 24px 120px;align-items:start}
@media (max-width:960px){.layout{grid-template-columns:1fr;gap:0}}

nav.sumario{position:sticky;top:0;max-height:100vh;overflow-y:auto;padding:36px 0 40px;--modo-barra:0}
/* linha 2 da barra mobile (select "Ir para" + botão "Sumário") só existe
   visualmente no celular; no desktop o sumário inteiro já fica sempre visível
   na coluna lateral, então esses controles ficam escondidos (não removidos:
   o <select> populado no servidor continua no DOM, só oculto). */
nav.sumario .barra-mobile-linha2{display:none}
/* documento gigante (o guia do EcoSistema tem 639.692px de altura; o da
   Dominex é da mesma ordem) — no celular a barra fixa com busca + salto por
   tema É o mecanismo principal de navegação, não enfeite. Por isso ela some
   só a LISTA longa (.sumario-corpo) atrás de um toggle; busca e select ficam
   sempre visíveis na tira fixa. */
@media (max-width:960px){
  nav.sumario{
    position:sticky; top:0; z-index:40; --modo-barra:1;
    max-height:none; overflow:visible; min-width:0;
    background:#fff; border-bottom:1px solid var(--linha);
    margin:0 -24px 24px; padding:12px 24px;
  }
  nav.sumario .busca{margin-bottom:10px}
  nav.sumario .barra-mobile-linha2{display:flex; align-items:center; gap:8px}
  nav.sumario #pular{
    flex:1; min-width:0; font:inherit; font-size:13px; padding:8px 10px;
    border:1.5px solid var(--linha-forte); border-radius:8px; background:#fff; color:var(--tinta);
  }
  nav.sumario #sumario-toggle{
    display:flex; align-items:center; gap:6px; white-space:nowrap;
    border:1.5px solid var(--linha-forte); border-radius:8px; background:#fff; color:var(--tinta);
    font:inherit; font-size:13px; font-weight:600; padding:8px 12px; cursor:pointer;
  }
  nav.sumario #sumario-toggle .seta{width:12px;height:12px;stroke:var(--grafite);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s ease}
  nav.sumario.aberto #sumario-toggle .seta{transform:rotate(180deg)}
  /* .sumario-corpo (h2 "Sumário" + lista completa) some por padrão no celular
     e vira painel flutuante ancorado na barra quando .aberto — SÓ ela rola
     internamente (max-height+overflow-y), nunca o nav.sumario inteiro, que é
     só a tira fixa fina. position:absolute tira do fluxo, então abrir/fechar
     não empurra o conteúdo da página. */
  nav.sumario .sumario-corpo{
    display:none; position:absolute; left:0; right:0; top:100%;
    background:#fff; border-bottom:1px solid var(--linha); box-shadow:0 14px 28px rgba(20,20,20,.14);
    max-height:70vh; overflow-y:auto; padding:16px 24px 20px;
  }
  nav.sumario.aberto .sumario-corpo{display:block}
}
/* ---------------- busca ---------------- */
.busca{position:relative;margin-bottom:16px}
.busca input{width:100%;padding:10px 34px 10px 32px;font-family:inherit;font-size:14px;
  border:1.5px solid var(--linha-forte);border-radius:8px;background:#fff;color:var(--tinta);outline:none}
.busca input:focus{border-color:var(--sinal-forte);box-shadow:0 0 0 3px rgba(0,127,85,.12)}
.busca input::placeholder{color:#9AA3AD}
/* ancorados na ALTURA DO CAMPO (20px), não em 50% do bloco: a lista de
   resultados cresce embaixo e levaria a lupa e o "×" pro meio da tela. */
.busca .icone-busca{position:absolute;left:10px;top:20px;transform:translateY(-50%);width:15px;height:15px;
  stroke:var(--grafite);fill:none;stroke-width:2;pointer-events:none}
.busca .limpar{position:absolute;right:8px;top:20px;transform:translateY(-50%);border:0;background:transparent;
  color:var(--grafite);font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;display:none}
.busca .limpar.visivel{display:block}
.busca .conta{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--grafite);margin-top:8px;min-height:13px}
nav.sumario a.oculto,nav.sumario .fase.oculto{display:none}
mark{background:#FFF0A8;color:inherit;padding:0 1px;border-radius:2px}
.sem-resultado{font-size:13px;color:var(--grafite);padding:10px 0;line-height:1.5}

nav.sumario h2{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--grafite);margin:0 0 14px}
nav.sumario .fase{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--tinta);font-weight:600;border-top:2px solid var(--breu);padding:10px 0 4px;margin:22px 0 2px;display:block}
nav.sumario .fase:first-of-type{margin-top:0}
nav.sumario a{display:flex;gap:8px;text-decoration:none;color:var(--tinta);font-size:14px;padding:5px 0;border-bottom:1px solid #F0F3F5;line-height:1.35}
nav.sumario a:hover{color:var(--sinal-forte)}
nav.sumario a .c{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--sinal-forte);flex:0 0 30px;padding-top:2px}
nav.sumario a.ativo{color:var(--sinal-forte);font-weight:600}

main{min-width:0;padding-top:36px}

/* ---------------- abertura ---------------- */
.abertura{margin-bottom:56px}
.abertura h2{font-family:"Montserrat",system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-.03em;margin:8px 0 14px}
.abertura .destaque{background:var(--breu);color:#fff;border-radius:14px;padding:28px 30px;margin:24px 0 28px;position:relative;overflow:hidden}
.abertura .destaque::after{content:"";position:absolute;inset:0;background:radial-gradient(90% 120% at 108% -20%, rgba(0,197,151,.26) 0%, rgba(0,197,151,0) 62%)}
.abertura .destaque > *{position:relative;z-index:2}
.abertura .destaque .rot{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--sinal);margin-bottom:12px}
.abertura .destaque h3{font-family:"Montserrat",system-ui,sans-serif;font-weight:700;font-size:24px;margin:0 0 12px;color:#fff}
.abertura .destaque p{color:rgba(255,255,255,.84);margin:0 0 12px}
.abertura .destaque .links{margin-top:18px;border-top:1px solid rgba(255,255,255,.2);padding-top:16px}
.abertura .destaque .links a{display:inline-block;color:var(--breu);background:var(--sinal);text-decoration:none;font-weight:600;font-size:15px;padding:10px 18px;border-radius:8px;margin:6px 8px 6px 0}
.abertura .destaque .links a.vazado{background:transparent;color:var(--sinal);border:1.5px solid rgba(0,197,151,.5)}
.abertura .destaque .links span{color:rgba(255,255,255,.6);font-size:14px;display:block;margin-bottom:6px}

/* ---------------- seções ---------------- */
section.tutorial{margin:0 0 72px;scroll-margin-top:16px}
.cab{background:var(--breu);color:#fff;border-radius:14px;padding:28px 30px;position:relative;overflow:hidden;margin-bottom:26px}
.cab::before{content:"";position:absolute;inset:0;background:radial-gradient(100% 130% at 105% -25%, rgba(0,197,151,.22) 0%, rgba(0,197,151,0) 60%)}
.cab .ghost{position:absolute;right:-10px;bottom:-52px;font-family:"Montserrat",system-ui,sans-serif;font-weight:800;font-size:160px;line-height:.78;color:rgba(255,255,255,.07);z-index:1}
.cab > *{position:relative;z-index:2}
.cab .fase{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.55)}
.cab .cod{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;font-size:14px;background:var(--sinal);color:var(--breu);padding:3px 10px;border-radius:6px;margin-bottom:12px}
.cab h2{font-family:"Montserrat",system-ui,sans-serif;font-weight:800;font-size:clamp(26px,4vw,38px);letter-spacing:-.03em;margin:10px 0 0;line-height:1.05}
.cab .resumo{color:rgba(255,255,255,.8);font-weight:300;font-size:17px;margin-top:12px;max-width:640px}
/* selo de módulo pago — metadado de SEÇÃO, gerado a partir de capitulos.json */
.cab .selo-modulo{display:inline-block;margin-top:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;letter-spacing:.02em;background:var(--sinal);color:var(--breu);padding:4px 10px;border-radius:6px}
.cab .base{margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,.18);display:flex;gap:26px;flex-wrap:wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:rgba(255,255,255,.5)}
.cab .base b{color:var(--sinal);font-weight:500}

p.lead{font-size:18px;font-weight:300;color:#2A313A;margin:0 0 18px}
.meta{background:var(--papel-2);border-left:4px solid var(--sinal-forte);padding:14px 18px;margin:0 0 26px;font-size:14px;border-radius:0 8px 8px 0}
.meta span{display:block;margin:3px 0}
.meta b{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--verde-tinta)}

section.tutorial h2:not(.cab h2){font-family:"Montserrat",system-ui,sans-serif;font-weight:700;font-size:23px;letter-spacing:-.02em;margin:40px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--linha-forte)}
section.tutorial h2.suporte{color:#fff;background:var(--breu);border:0;padding:12px 18px;border-radius:8px;margin-top:44px}
section.tutorial h3{font-weight:600;font-size:17px;margin:24px 0 8px}
section.tutorial h3::before{content:"";display:inline-block;width:8px;height:8px;background:var(--sinal-forte);margin-right:9px;border-radius:2px}
section.tutorial h4{font-weight:600;font-size:16px;margin:18px 0 6px;color:#39424E}
ul,ol{padding-left:22px}
li{margin:0 0 6px}
li::marker{color:var(--sinal-forte)}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;background:#EDF1F3;padding:2px 5px;border-radius:4px;color:var(--verde-tinta);overflow-wrap:anywhere}
/* .ui é usada tanto pro nome literal curto de um botão ("Finalizar") quanto,
   por erro de quem escreve a seção, pra frase inteira copiada do código — o
   CONTRATO.md define a classe só pro primeiro caso, mas o gerador não pode
   depender de todo autor usar certo. overflow-wrap:anywhere só quebra QUANDO
   NÃO CABE: nome curto continua numa linha só (cabe em qualquer tela), frase
   longa quebra. Por isso não tem nowrap nem @media aqui — comportamento certo
   no desktop e no celular ao mesmo tempo, sem depender de ordem de cascata.
   (.ui é display:inline; max-width não faz nada em caixa inline, por isso
   nem tentamos usar isso pra conter a largura.) */
.ui{font-weight:600;font-size:.92em;background:var(--breu);color:#fff;padding:2px 7px;border-radius:5px;white-space:normal;overflow-wrap:anywhere}
.aviso,.perigo,.dica,.regra{padding:14px 18px;margin:18px 0;border-radius:10px;border-left:4px solid;font-size:15px}
.aviso{background:#FFF8E4;border-color:#C98A00;color:#4A3600}
.perigo{background:#FDECEA;border-color:#C0281F;color:#4E1512}
.dica{background:#E9F9F0;border-color:var(--sinal-forte);color:#0C3E22}
.regra{background:#F1F4F6;border-color:#58616E;color:#262C34}
.aviso::before,.perigo::before,.dica::before,.regra::before{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:6px}
.aviso::before{content:"Atenção";color:#8A5F00}
.perigo::before{content:"Cuidado";color:#A3211A}
.dica::before{content:"Dica";color:var(--verde-tinta)}
.regra::before{content:"Regra do sistema";color:#454E5A}
.tabela-rolagem{overflow-x:auto;margin:18px 0}
table{width:100%;border-collapse:collapse;font-size:14.5px;min-width:520px}
th{background:var(--breu);color:#fff;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:500;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:11px 13px}
td{padding:11px 13px;border-bottom:1px solid var(--linha);vertical-align:top}
tbody tr:nth-child(even) td{background:var(--papel-2)}
table.faq td:first-child{font-weight:600;width:28%}
table.faq td:nth-child(2){width:24%;color:var(--grafite)}
dl.qa dt{font-weight:600;color:var(--verde-tinta);margin:20px 0 4px;font-size:17px}
dl.qa dt::before{content:"P";font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;background:var(--sinal-forte);color:#fff;padding:2px 6px;border-radius:4px;margin-right:9px;vertical-align:2px}
dl.qa dd{margin:0;padding-left:20px;border-left:2px solid #D9EDE2}
.glossario{margin:34px 0 0;padding:16px 20px;background:var(--breu);color:rgba(255,255,255,.88);border-radius:10px;font-size:15px}
.glossario b{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--sinal);display:block;margin-bottom:6px}
figure{margin:26px 0}
figure img{border:1px solid var(--linha-forte);border-radius:10px;display:block}
figcaption{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--grafite);margin-top:8px}
figcaption::before{content:"▸ ";color:var(--sinal-forte)}
figure img{cursor:zoom-in}

/* ---------------- lupa (imagem em tela cheia) ---------------- */
.lupa{position:fixed;inset:0;z-index:200;background:rgba(20,20,20,.94);display:none;
  align-items:center;justify-content:center;padding:40px 24px 88px;backdrop-filter:blur(3px)}
.lupa.aberta{display:flex}
.lupa img{max-width:100%;max-height:100%;object-fit:contain;border-radius:10px;
  box-shadow:0 30px 90px rgba(0,0,0,.6);cursor:zoom-out}
.lupa .legenda{position:absolute;left:0;right:0;bottom:26px;text-align:center;color:rgba(255,255,255,.75);
  font-size:14px;padding:0 60px;line-height:1.5}
.lupa .fechar{position:absolute;top:18px;right:22px;width:42px;height:42px;border-radius:999px;
  border:1.5px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;
  font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lupa .fechar:hover{background:rgba(255,255,255,.14)}

/* ---------------- botão flutuante ---------------- */
.baixar{position:fixed;right:24px;bottom:24px;z-index:50;display:inline-flex;align-items:center;gap:10px;
  background:var(--breu);color:#fff;text-decoration:none;font-weight:600;font-size:15px;
  padding:14px 22px;border-radius:999px;box-shadow:0 10px 30px rgba(20,20,20,.32);
  border:1.5px solid rgba(0,197,151,.35);transition:transform .15s ease, box-shadow .15s ease}
.baixar:hover{transform:translateY(-2px);box-shadow:0 14px 38px rgba(20,20,20,.4)}
.baixar svg{width:18px;height:18px;stroke:var(--sinal);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.baixar .peso{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:rgba(255,255,255,.5)}
@media (max-width:600px){.baixar{right:14px;bottom:14px;padding:12px 18px;font-size:14px}.baixar .peso{display:none}}

footer.rodape{background:var(--breu);color:rgba(255,255,255,.6);padding:40px 24px;font-size:14px}
footer.rodape .wrap{max-width:1180px;margin:0 auto;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
footer.rodape a{color:var(--sinal);text-decoration:none}
`;

function cabecalhoSecao(s) {
  const m = s.meta;
  const fase = FASE_DE[s.code];
  const num = s.code.replace("T", "").padStart(2, "0");
  // metadado de SEÇÃO (não de capítulo): 5 dos 18 tutoriais dependem de módulo
  // pago. Sai automático da grade (capitulos.json) — dúvida nº1 de quem lê e
  // não acha a tela, não pode depender de alguém lembrar de escrever.
  const selo = m.modulo_pago
    ? `<div class="selo-modulo">🔒 Depende do módulo ${esc(m.modulo_pago)}</div>`
    : "";
  return `<div class="cab">
    <div class="ghost">${num}</div>
    <div class="fase">Fase ${fase ? fase.n : "—"} · ${esc(fase ? fase.titulo : "")}</div>
    <div class="cod" style="margin-top:10px">${s.code}</div>
    <h2>${esc(m.titulo || s.code)}</h2>
    ${selo}
    ${m.resumo ? `<div class="resumo">${esc(normalizar(m.resumo))}</div>` : ""}
    <div class="base">
      ${m.duracao ? `<span><b>Vídeo na trilha</b> ${esc(m.duracao)}</span>` : ""}
      ${m.prereq ? `<span><b>Pré-requisito</b> ${esc(m.prereq)}</span>` : ""}
      ${m.capitulos?.length ? `<span><b>Capítulos</b> ${m.capitulos.length}</span>` : ""}
      ${m.modulo_pago ? `<span><b>Módulo</b> ${esc(m.modulo_pago)}</span>` : ""}
    </div>
  </div>`;
}

function main() {
  const secoes = lerSecoes();
  if (!secoes.length) {
    console.error("Nenhuma seção encontrada.");
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });

  // ativos
  fs.mkdirSync(path.join(DEST, "img"), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "img-otim"))) {
    if (f.startsWith("_")) continue;
    fs.copyFileSync(path.join(ROOT, "img-otim", f), path.join(DEST, "img", f));
  }
  fs.copyFileSync(path.join(ROOT, "marca/logo-horizontal.png"), path.join(DEST, "logo.png"));
  // Montserrat self-hosted (mesma fonte já usada pelo app via @fontsource) —
  // copiada pra dentro da página pública, zero request pro Google Fonts.
  fs.mkdirSync(path.join(DEST, "fonts"), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "fonts"))) {
    fs.copyFileSync(path.join(ROOT, "fonts", f), path.join(DEST, "fonts", f));
  }
  // O PDF NÃO entra no repositório: regerado por inteiro a cada release, viraria
  // uma cópia nova no histórico do git toda vez. Ele mora no Storage e a página
  // só aponta pra lá. Publicar com: node scripts/publicar-pdf-guia.mjs
  const pdfOrigem = path.join(ROOT, "Guia-Tecnico-Dominex.pdf");
  let pesoPdf = "";
  if (fs.existsSync(pdfOrigem)) {
    pesoPdf = `${(fs.statSync(pdfOrigem).size / 1024 / 1024).toFixed(1)} MB`;
  } else {
    console.warn("⚠️  PDF não encontrado — o botão de baixar vai apontar pro Storage mesmo assim.");
  }
  // se sobrou cópia antiga dentro do public, remove (senão vai pro commit sem querer)
  const pdfNoPublic = path.join(DEST, "Guia-Tecnico-Dominex.pdf");
  if (fs.existsSync(pdfNoPublic)) fs.unlinkSync(pdfNoPublic);

  // regera os chunks antes de publicar, pra o que está na rota bater com as seções
  try {
    console.log(execFileSync("python3", ["scripts/gerar-chunks-guia.py"], { encoding: "utf8" }).trim());
  } catch (e) {
    console.warn("Geração de chunks falhou:", String(e).slice(0, 200));
  }

  // artefatos legíveis por máquina: markdown, chunks de RAG e índice.
  // Ficam na mesma rota pública pra qualquer ferramenta de IA conseguir puxar.
  const extras = [
    ["Guia-Tecnico-Dominex.md", "guia.md"],
    ["Guia-Tecnico-chunks.jsonl", "chunks.jsonl"],
    ["Guia-Tecnico-index.json", "index.json"],
  ];
  for (const [origem, destino] of extras) {
    const o = path.join(ROOT, origem);
    if (fs.existsSync(o)) fs.copyFileSync(o, path.join(DEST, destino));
  }

  const totalCaps = secoes.reduce((a, s) => a + (s.meta.capitulos?.length || 0), 0);
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const by = Object.fromEntries(secoes.map((s) => [s.code, s]));

  let sumario = "";
  // <select id="pular"> é o salto rápido de tema no celular (a barra sticky é
  // o mecanismo PRINCIPAL de navegação lá, não enfeite: documento gigante,
  // ~640 mil px de altura no EcoSistema, mesma ordem de grandeza aqui).
  // Populado no servidor (agrupado por fase, igual o sumário) — sem JS extra
  // pra montar opção nenhuma.
  let opcoesPular = `<option value="">Ir para…</option>`;
  for (const f of FASES) {
    const ts = f.ts.filter((t) => by[t]);
    if (!ts.length) continue;
    sumario += `<span class="fase">Fase ${f.n} · ${esc(f.titulo)}</span>`;
    opcoesPular += `<optgroup label="Fase ${f.n} · ${esc(f.titulo)}">`;
    for (const t of ts) {
      sumario += `<a href="#${t.toLowerCase()}"><span class="c">${t}</span><span>${esc(by[t].meta.titulo || t)}</span></a>`;
      opcoesPular += `<option value="${t.toLowerCase()}">${esc(t)} · ${esc(by[t].meta.titulo || t)}</option>`;
    }
    opcoesPular += `</optgroup>`;
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guia Técnico — Dominex</title>
<meta name="description" content="Manual completo da Dominex: como funciona cada função do sistema de gestão para empresas de serviço técnico em campo (refrigeração, elétrica, energia solar, CFTV, elevadores), tela por tela.">
<meta property="og:title" content="Guia Técnico — Dominex">
<meta property="og:description" content="Manual completo do sistema, seção por seção, na ordem da Trilha Domiflix.">
<meta property="og:type" content="article">
<link rel="canonical" href="https://www.dominex.app/guia-tecnico">
<style>${CSS}</style>
</head>
<body>

<header class="hero">
  <div class="wrap">
    <img class="logo" src="logo.png" alt="Dominex">
    <div class="kicker">Manual completo do produto</div>
    <h1>Guia <em>Técnico</em></h1>
    <p class="sub">Como funciona cada função do sistema, tela por tela, na ordem da Trilha Domiflix.</p>
    <div class="fichas">
      <div class="ficha"><div class="n">${secoes.length}</div><div class="l">Seções</div></div>
      <div class="ficha"><div class="n">${totalCaps}</div><div class="l">Capítulos</div></div>
      <div class="ficha"><div class="n">07</div><div class="l">Fases</div></div>
    </div>
    <div class="meta-doc">
      <b>Versão do sistema</b> ${VERSAO ? "v" + VERSAO : "—"} &nbsp;·&nbsp; <b>Atualizado em</b> ${hoje}
    </div>
  </div>
</header>

<div class="layout">
  <nav class="sumario">
    <div class="busca">
      <svg class="icone-busca" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
      <input type="search" id="busca" placeholder="Buscar no guia…" autocomplete="off" aria-label="Buscar no guia">
      <button class="limpar" type="button" aria-label="Limpar busca">&times;</button>
      <div class="conta" id="busca-conta"></div>
    </div>
    <div class="barra-mobile-linha2">
      <select id="pular" aria-label="Ir direto para uma seção">${opcoesPular}</select>
      <button id="sumario-toggle" type="button" aria-expanded="false" aria-controls="sumario-corpo">
        Sumário
        <svg class="seta" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
    <div class="sumario-corpo" id="sumario-corpo">
      <h2>Sumário</h2>
      ${sumario}
    </div>
  </nav>

  <main>
    <div class="abertura">
      <div class="kicker" style="color:#007F55;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.28em;text-transform:uppercase">Antes de começar</div>
      <h2>Leia junto com os vídeos</h2>
      <p class="lead">Este guia é a versão escrita da Trilha Domiflix, o curso em vídeo da Dominex. Os dois foram feitos pra andar juntos: o vídeo mostra o ritmo da operação acontecendo na tela, o guia guarda o detalhe exato que ninguém decora.</p>

      <div class="destaque">
        <div class="rot">Trilha Domiflix · curso em vídeo</div>
        <h3>Assista antes de precisar</h3>
        <p>São aulas longas, uma por área do sistema, com capítulos marcados por tempo. Quem assiste na ordem entende <b>por que</b> o sistema pede cada coisa, e para de tratar sintoma. Quem só lê o guia resolve o problema da vez, mas erra o próximo.</p>
        <p>Regra prática: quando a dúvida é <b>"como eu faço"</b>, o vídeo resolve mais rápido. Quando a dúvida é <b>"por que deu esse erro"</b>, a resposta está aqui no guia.</p>
        <div class="links">
          <span>Dentro do sistema, no menu do seu perfil, opção <b>Tutoriais | Domiflix</b>:</span>
          <a href="https://www.dominex.app/domiflix">Assistir aos tutoriais</a>
          <a class="vazado" href="https://www.dominex.app/trilha-domiflix">Ver a grade completa da trilha</a>
        </div>
      </div>

      <h3>Como este guia é organizado</h3>
      <p>Uma seção por aula da trilha, na mesma ordem e com os mesmos capítulos. Cada seção traz onde fica a tela, o passo a passo, as regras que o sistema aplica, os problemas mais comuns com a causa provável, perguntas frequentes e as palavras que se usa no dia a dia pra falar daquilo.</p>
      <p>A ordem importa: cada seção só usa o que já foi explicado antes.</p>
    </div>

    ${secoes.map((s) => `<section class="tutorial" id="${s.code.toLowerCase()}">${cabecalhoSecao(s)}${s.html}</section>`).join("\n")}
  </main>
</div>

<footer class="rodape">
  <div class="wrap">
    <div>Dominex · Guia Técnico &nbsp;·&nbsp; atualizado em ${hoje}</div>
    <div><a href="https://www.dominex.app">www.dominex.app</a></div>
  </div>
</footer>

<div class="lupa" id="lupa" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
  <button class="fechar" type="button" aria-label="Fechar">&times;</button>
  <img alt="">
  <div class="legenda"></div>
</div>

<a class="baixar" href="${PDF_URL}" download>
  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Baixar o PDF ${pesoPdf ? `<span class="peso">${pesoPdf}</span>` : ""}
</a>

<script>
// ---------------- busca ----------------
// Índice montado uma vez. Duas camadas: TÍTULO (capítulo, pergunta do FAQ, sintoma
// da tabela de problemas) e CORPO (parágrafo, item de lista, célula). Título pesa
// mais no resultado, mas o corpo entra porque o cliente digita a frase que ele leu
// na tela, não o nome do capítulo.
(function () {
  var campo = document.getElementById('busca');
  var conta = document.getElementById('busca-conta');
  var limpar = document.querySelector('.busca .limpar');
  var sumario = document.querySelector('nav.sumario');
  if (!campo) return;

  var chave = function (t) {
    return (t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  };

  var itens = [];
  var vistos = {};
  document.querySelectorAll('section.tutorial').forEach(function (sec) {
    var cod = sec.id.toUpperCase();
    var titulo = ((sec.querySelector('.cab h2') || {}).textContent || cod).trim();
    function add(el, peso) {
      var txt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (txt.length < 4 || txt.length > 320) return;
      var k = chave(txt);
      var dedupe = cod + '|' + k.slice(0, 80);
      if (vistos[dedupe]) return;
      vistos[dedupe] = 1;
      if (!el.id) el.id = cod.toLowerCase() + '-b' + itens.length;
      itens.push({ id: el.id, cod: cod, secao: titulo, texto: txt, k: k, peso: peso });
    }
    sec.querySelectorAll('h2, h3, dl.qa dt, table.faq tbody tr td:first-child').forEach(function (el) { add(el, 2); });
    sec.querySelectorAll('p, li, dd, td, figcaption').forEach(function (el) {
      if (el.querySelector('p, li, table')) return;   // só o nó folha
      add(el, 1);
    });
  });

  var caixa = document.createElement('div');
  caixa.className = 'resultados';
  campo.parentNode.appendChild(caixa);

  var estilo = document.createElement('style');
  // nav.sumario a é display:flex; sem subir a especificidade, cada <mark> vira
  // item de flex e o resultado sai picotado em colunas.
  estilo.textContent = 'nav.sumario .resultados{margin-top:10px;max-height:56vh;overflow-y:auto}' +
    'nav.sumario .resultados a{display:block;text-decoration:none;color:var(--tinta);padding:8px;border-radius:6px;font-size:13px;line-height:1.45;border-bottom:1px solid #F0F3F5;gap:0}' +
    'nav.sumario .resultados a:hover{background:var(--papel-2)}' +
    'nav.sumario .resultados a .onde{display:block;flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--sinal-forte);margin-bottom:3px}' +
    'nav.sumario .resultados mark{display:inline;padding:0 1px}' +
    '.piscar{animation:piscar 1.8s ease-out 1}' +
    '@keyframes piscar{0%,40%{background:#FFF0A8}100%{background:transparent}}';
  document.head.appendChild(estilo);

  var alvosSumario = null;
  function mostrarSumario(v) {
    if (!alvosSumario) alvosSumario = sumario.querySelectorAll('.fase, ol, h2');
    alvosSumario.forEach(function (n) { n.style.display = v ? '' : 'none'; });
  }

  function escapar(t) { return t.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  // Recorta em volta da primeira palavra achada e destaca todas.
  // Destaque por POSIÇÃO, não por regex sobre HTML: o texto normalizado tem o
  // mesmo comprimento do original (tirar acento não muda a contagem), então os
  // índices batem e não há risco de quebrar a marcação.
  function trecho(texto, tokens) {
    var k = chave(texto);
    var pos = [];
    tokens.forEach(function (t) {
      var i = k.indexOf(t);
      while (i >= 0) { pos.push([i, i + t.length]); i = k.indexOf(t, i + t.length); }
    });
    if (!pos.length) return escapar(texto.slice(0, 170));
    pos.sort(function (a, b) { return a[0] - b[0]; });
    var faixas = [pos[0]];
    for (var i = 1; i < pos.length; i++) {
      var ult = faixas[faixas.length - 1];
      if (pos[i][0] <= ult[1]) ult[1] = Math.max(ult[1], pos[i][1]);
      else faixas.push(pos[i]);
    }
    var ini = Math.max(0, faixas[0][0] - 45);
    var fim = Math.min(texto.length, ini + 170);
    var html = '', cursor = ini;
    faixas.forEach(function (f) {
      if (f[1] <= ini || f[0] >= fim) return;
      var a = Math.max(f[0], ini), b = Math.min(f[1], fim);
      html += escapar(texto.slice(cursor, a)) + '<mark>' + escapar(texto.slice(a, b)) + '</mark>';
      cursor = b;
    });
    html += escapar(texto.slice(cursor, fim));
    return (ini > 0 ? '… ' : '') + html + (fim < texto.length ? ' …' : '');
  }

  var timer;
  function buscar() {
    var bruto = campo.value.trim();
    limpar.classList.toggle('visivel', bruto.length > 0);
    var tokens = chave(bruto).split(/\\s+/).filter(function (t) { return t.length >= 2; });
    if (!tokens.length) {
      caixa.innerHTML = ''; conta.textContent = ''; mostrarSumario(true); return;
    }
    var achados = [];
    for (var i = 0; i < itens.length; i++) {
      var x = itens[i], ok = true;
      for (var j = 0; j < tokens.length; j++) { if (x.k.indexOf(tokens[j]) < 0) { ok = false; break; } }
      if (!ok) continue;
      // frase inteira junta vale mais; título vale mais que corpo
      var score = x.peso * 10 + (x.k.indexOf(chave(bruto)) >= 0 ? 5 : 0) + (x.k.indexOf(tokens[0]) < 40 ? 2 : 0);
      achados.push({ x: x, score: score });
    }
    achados.sort(function (a, b) { return b.score - a.score; });
    mostrarSumario(false);
    var n = achados.length;
    conta.textContent = n + (n === 1 ? ' resultado' : ' resultados') + (n > 40 ? ' · mostrando 40' : '');
    if (!n) {
      caixa.innerHTML = '<div class="sem-resultado">Nada encontrado. Tente uma palavra do dia a dia, como "checklist", "PMOC" ou "assinatura obrigatória".</div>';
      return;
    }
    caixa.innerHTML = achados.slice(0, 40).map(function (r) {
      return '<a href="#' + r.x.id + '" data-id="' + r.x.id + '"><span class="onde">' + r.x.cod + ' · ' + escapar(r.x.secao) + '</span>' + trecho(r.x.texto, tokens) + '</a>';
    }).join('');
  }

  campo.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(buscar, 120); });
  limpar.addEventListener('click', function () { campo.value = ''; buscar(); campo.focus(); });

  caixa.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var alvo = document.getElementById(a.dataset.id);
    if (!alvo) return;
    alvo.classList.remove('piscar');
    void alvo.offsetWidth;
    alvo.classList.add('piscar');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== campo && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); campo.focus();
    }
    if (e.key === 'Escape' && document.activeElement === campo) { campo.value = ''; buscar(); campo.blur(); }
  });
})();

// Pula direto pra uma seção (usado pelo <select id="pular"> da barra mobile).
// window.scrollTo é legítimo aqui — o guard de capacidade do scrollspy logo
// abaixo é só pra evitar que a marcação AUTOMÁTICA do item ativo escape pro
// window; navegação EXPLÍCITA do usuário sempre pode mexer no scroll da janela.
function irPara(id) {
  var alvo = document.getElementById(id);
  if (!alvo) return;
  var nav = document.querySelector('nav.sumario');
  // --modo-barra é setado só dentro do @media(max-width:960px) do CSS: lendo
  // o valor computado (em vez de repetir "960px" aqui) o JS nunca desalinha
  // do breakpoint se alguém mudar só o CSS depois.
  var emModoBarra = !!nav && getComputedStyle(nav).getPropertyValue('--modo-barra').trim() === '1';
  var alturaBarra = emModoBarra ? nav.offsetHeight : 0;
  var y = alvo.getBoundingClientRect().top + window.pageYOffset - alturaBarra - 12;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

// destaca no sumário a seção que está na tela
(function () {
  var links = {};
  document.querySelectorAll('nav.sumario a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  // No desktop, nav.sumario É o container de rolagem (overflow-y:auto). No
  // celular, quem rola é .sumario-corpo (quando aberta) — nav.sumario vira só
  // a tira fixa fina, sem overflow próprio. scrollIntoView() não serve aqui:
  // ele sobe a árvore até achar QUALQUER ancestral rolável, e no celular isso
  // é a JANELA (porque nem nav.sumario nem .sumario-corpo fechada têm o que
  // rolar) — o scroll "brigava com o dedo" porque isso disparava a cada troca
  // de seção. Fix: nunca escapa do container, e só mexe se ele realmente tiver
  // conteúdo pra rolar (guard por CAPACIDADE, não por largura/media query —
  // sobrevive se o breakpoint mudar depois).
  function containerRolavel() {
    var candidatos = [document.querySelector('nav.sumario'), document.getElementById('sumario-corpo')];
    for (var i = 0; i < candidatos.length; i++) {
      var c = candidatos[i];
      if (c && c.scrollHeight > c.clientHeight + 1) return c;
    }
    return null;
  }
  var obs = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      var a = links[e.target.id];
      if (!a) return;
      if (e.isIntersecting) {
        Object.values(links).forEach(function (l) { l.classList.remove('ativo'); });
        a.classList.add('ativo');
        var col = containerRolavel();
        if (col) {
          var alvoTopo = a.offsetTop - col.clientHeight / 2;
          col.scrollTop = Math.max(0, alvoTopo);
        }
      }
    });
  }, { rootMargin: '-10% 0px -80% 0px' });
  document.querySelectorAll('section.tutorial').forEach(function (s) { obs.observe(s); });
})();

// barra mobile: toggle do painel de sumário, salto rápido pelo <select> e
// scroll-padding-top ajustado à altura REAL da barra (medida, não chutada —
// evita título de seção escondido embaixo da tira fixa)
(function () {
  var nav = document.querySelector('nav.sumario');
  var toggle = document.getElementById('sumario-toggle');
  var corpo = document.getElementById('sumario-corpo');
  var pular = document.getElementById('pular');
  if (!nav) return;

  function emModoBarra() { return getComputedStyle(nav).getPropertyValue('--modo-barra').trim() === '1'; }

  function fechar() {
    nav.classList.remove('aberto');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function abrir() {
    nav.classList.add('aberto');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  if (toggle && corpo) {
    toggle.addEventListener('click', function () {
      if (nav.classList.contains('aberto')) fechar(); else abrir();
    });
    // clicou num link da lista (dentro do painel aberto): fecha antes do
    // salto nativo da âncora, pra não ficar um painel vazio sobreposto
    corpo.addEventListener('click', function (e) {
      if (e.target.closest('a')) fechar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('aberto')) fechar();
    });
  }

  if (pular) {
    pular.addEventListener('change', function () {
      if (this.value) irPara(this.value);
      this.value = '';
      fechar();
    });
  }

  // .sumario-corpo é position:absolute (não conta pro offsetHeight do
  // nav.sumario) — então isso mede só a tira fixa, com busca+select+toggle,
  // que é o que de fato cobre o topo da página o tempo todo.
  function ajustarEspacoTopo() {
    document.documentElement.style.scrollPaddingTop = emModoBarra() ? (nav.offsetHeight + 12) + 'px' : '24px';
  }
  ajustarEspacoTopo();
  window.addEventListener('resize', ajustarEspacoTopo);
})();

// clicar no print abre ele grande, escurecendo o fundo
(function () {
  var lupa = document.getElementById('lupa');
  var alvo = lupa.querySelector('img');
  var legenda = lupa.querySelector('.legenda');
  function abrir(img) {
    alvo.src = img.currentSrc || img.src;
    alvo.alt = img.alt || '';
    var cap = img.closest('figure') && img.closest('figure').querySelector('figcaption');
    legenda.textContent = cap ? cap.textContent.replace(/^▸\\s*/, '') : (img.alt || '');
    lupa.classList.add('aberta');
    document.body.style.overflow = 'hidden';
  }
  function fechar() {
    lupa.classList.remove('aberta');
    document.body.style.overflow = '';
    alvo.removeAttribute('src');
  }
  document.querySelectorAll('main figure img').forEach(function (img) {
    img.addEventListener('click', function () { abrir(img); });
  });
  lupa.addEventListener('click', fechar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
})();
// tabela larga rola sozinha no celular
document.querySelectorAll('main table').forEach(function (t) {
  if (t.parentElement.classList.contains('tabela-rolagem')) return;
  var d = document.createElement('div');
  d.className = 'tabela-rolagem';
  t.parentNode.insertBefore(d, t);
  d.appendChild(t);
});
</script>
</body></html>`;

  fs.writeFileSync(path.join(DEST, "index.html"), html);

  // llms.txt: convenção pra agente de IA descobrir o conteúdo em texto puro
  fs.writeFileSync(
    path.join(DEST, "llms.txt"),
    `# Guia Técnico — Dominex

> Manual completo da Dominex, sistema de gestão para empresas de serviço técnico em campo
> (refrigeração e climatização, elétrica, energia solar, CFTV, dedetização, elevadores e
> assistência técnica). Uma seção por área do sistema, na ordem da Trilha Domiflix. Cobre o que
> cada tela faz, o passo a passo, as regras que o sistema aplica, os problemas mais comuns com
> causa e solução, e as perguntas frequentes.

Atualizado em ${hoje} · versão do sistema ${VERSAO ? "v" + VERSAO : "—"} · ${secoes.length} seções.

## Conteúdo em texto puro

- [Guia completo em markdown](/guia-tecnico/guia.md): o documento inteiro, seção por seção.
- [Chunks para recuperação](/guia-tecnico/chunks.jsonl): um JSON por linha, cada pedaço auto-contido, com seção, capítulo, tipo, rotas do sistema, palavras-chave e sinônimos. Tipos: visao_geral, capitulo, problema, faq, glossario.
- [Índice do corpus](/guia-tecnico/index.json): seções, capítulos e contagem de chunks.
- [Guia em PDF](${PDF_URL}): mesma coisa, diagramado.

## Como usar

Para responder dúvida de usuário, prefira os chunks do tipo \`problema\` (sintoma relatado, causa provável, como resolver)
e \`faq\`. Para explicar um fluxo inteiro, use \`capitulo\`. Cite sempre a seção de origem (ex: T7, O técnico em campo).
`
  );
  const kb = Math.round(fs.statSync(path.join(DEST, "index.html")).size / 1024);
  console.log(`✅ public/guia-tecnico/index.html (${kb} kb, ${secoes.length} seções)`);
  console.log(`   rota pública: /guia-tecnico`);
}

main();
