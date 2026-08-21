/* stampSelfie — carimba a selfie do ponto com faixa inferior "GPS Camera":
   logo + nome da empresa, nome do funcionário, data/hora (ícone relógio),
   endereço (ícone pin), lat/long, e rodapé "Ponto Eletrônico por <marca>" + url.
   Carimbo é BAKED nos pixels; nunca bloqueia o ponto (falha -> retorna file original). */

export interface SelfieStampData {
  companyName: string;
  employeeName: string;
  dateTime: string;        // já formatado, ex: new Date().toLocaleString("pt-BR")
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  logoUrl?: string | null;
  poweredBy?: string;      // marca do crédito (ex: "Dominex")
  poweredUrl?: string;     // url do crédito (ex: "dominex.app")
}

const SELFIE_MAX = 1280;
const JPEG_QUALITY = 0.72;

export async function stampSelfie(file: File, data: SelfieStampData): Promise<File> {
  try {
    const img = await loadImage(URL.createObjectURL(file), false);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return file;
    if (Math.max(w, h) > SELFIE_MAX) {
      if (w > h) { h = Math.round((h * SELFIE_MAX) / w); w = SELFIE_MAX; }
      else { w = Math.round((w * SELFIE_MAX) / h); h = SELFIE_MAX; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    let logo: HTMLImageElement | null = null;
    if (data.logoUrl) {
      try { logo = await loadImage(data.logoUrl, true); } catch { logo = null; }
    }
    drawSelfieStamp(ctx, w, h, data, logo);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function drawSelfieStamp(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: SelfieStampData,
  logoImg: HTMLImageElement | null,
) {
  const FONT = "'Helvetica Neue', Arial, sans-serif";
  const u = W / 100;
  const padX = 4 * u;
  const fsBody = Math.max(11, 3.2 * u);
  const fsName = Math.max(13, 3.9 * u);
  const fsCo = Math.max(11, 3.0 * u);
  const gap = fsBody * 1.55;

  const logoSize = 9.5 * u;
  const textLeft = padX + logoSize + 3 * u;
  const maxTextW = W - textLeft - padX;

  // ícones vetoriais (sem emoji)
  const iconSize = fsBody;
  const iconGap = iconSize + 1.6 * u;
  const bodyTextW = W - padX - iconGap - padX;

  ctx.font = `${fsBody}px ${FONT}`;
  const body: { t: string; f: string; c: string; icon: "clock" | "pin" | null; indent: number }[] = [
    { t: data.employeeName, f: `600 ${fsName}px ${FONT}`, c: "#ffffff", icon: null, indent: 0 },
    { t: data.dateTime, f: `${fsBody}px ${FONT}`, c: "#e5e7eb", icon: "clock", indent: iconGap },
  ];
  if (data.address) {
    const addrLines = wrapText(ctx, data.address, bodyTextW, 2);
    addrLines.forEach((t, i) =>
      body.push({ t, f: `${fsBody}px ${FONT}`, c: "#e5e7eb", icon: i === 0 ? "pin" : null, indent: iconGap }),
    );
  }
  if (typeof data.lat === "number" && typeof data.lng === "number") {
    body.push({ t: `Lat ${data.lat.toFixed(6)}   Long ${data.lng.toFixed(6)}`, f: `${fsBody}px ${FONT}`, c: "#e5e7eb", icon: null, indent: 0 });
  }

  const poweredBy = data.poweredBy || "Dominex";
  const poweredUrl = data.poweredUrl || "dominex.app";

  // ---- altura da faixa ----
  const fsCredit = Math.max(9, 2.5 * u);
  const creditGap = fsCredit * 1.45;
  const topPad = 3.5 * u;
  const coHeaderH = Math.max(logoSize, fsCo) + 3 * u;
  const bodyH = body.reduce((acc, _l, i) => acc + (i === 0 ? fsName * 1.25 : gap), 0);
  const creditH = 2.5 * u + creditGap * 2;
  const bandH = topPad + coHeaderH + 2.2 * u + bodyH + creditH + 4.5 * u;
  const bandTop = H - bandH;

  // ---- sobreposição escura (forte) ----
  const grad = ctx.createLinearGradient(0, bandTop - 8 * u, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.25, "rgba(0,0,0,0.6)");
  grad.addColorStop(1, "rgba(0,0,0,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandTop - 8 * u, W, bandH + 8 * u);

  // ---- cabeçalho: logo + nome da empresa ----
  let cy = bandTop + topPad;
  if (logoImg) {
    roundRectPath(ctx, padX, cy, logoSize, logoSize, 1.6 * u);
    ctx.save();
    ctx.clip();
    ctx.drawImage(logoImg, padX, cy, logoSize, logoSize);
    ctx.restore();
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 ${fsCo}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  if (data.companyName) ctx.fillText(data.companyName, textLeft, cy + logoSize / 2, maxTextW);

  // divisória fina
  cy += coHeaderH + 1.2 * u;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, 0.15 * u);
  ctx.beginPath();
  ctx.moveTo(padX, cy);
  ctx.lineTo(W - padX, cy);
  ctx.stroke();

  // ---- linhas do corpo (com ícones vetoriais) ----
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 2 * u;
  let ty = cy + 2.2 * u;
  body.forEach((l, i) => {
    ty += i === 0 ? fsName : gap;
    if (l.icon === "clock") drawClockIcon(ctx, padX, ty - iconSize * 0.82, iconSize, l.c, Math.max(1.4, 0.32 * u));
    else if (l.icon === "pin") drawPinIcon(ctx, padX, ty - iconSize * 0.9, iconSize, l.c);
    ctx.font = l.f;
    ctx.fillStyle = l.c;
    ctx.fillText(l.t, padX + (l.indent || 0), ty, W - padX * 2 - (l.indent || 0));
  });

  // ---- rodapé de crédito ----
  ty += 2.5 * u + creditGap;
  const pre = "Ponto Eletrônico por ";
  ctx.font = `${fsCredit}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(pre, padX, ty);
  const preW = ctx.measureText(pre).width;
  ctx.font = `700 ${fsCredit}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(poweredBy, padX + preW, ty);
  ty += creditGap;
  ctx.font = `${fsCredit}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(poweredUrl, padX, ty);
  ctx.shadowBlur = 0;
}

function drawClockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, lw: number) {
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.46;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy + r * 0.05); ctx.stroke();
  ctx.restore();
}

function drawPinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  const cx = x + s / 2;
  const r = s * 0.34;
  const cyc = y + r + s * 0.04;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cyc, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r * 0.72, cyc + r * 0.72);
  ctx.lineTo(cx, y + s);
  ctx.lineTo(cx + r * 0.72, cyc + r * 0.72);
  ctx.closePath();
  ctx.fill();
  // furo central (círculo escuro sobre o pino — não apaga a foto)
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath(); ctx.arc(cx, cyc, r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (ctx.measureText(last + "…").width > maxW && last.length > 1) last = last.slice(0, -1);
  kept[maxLines - 1] = last.replace(/\s+$/, "") + "…";
  return kept;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
