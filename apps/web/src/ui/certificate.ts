// Competition certificates: drawn on a canvas (A4 landscape) and packed into a one-page PDF by hand,
// so it works offline in the demo and needs no PDF library.
import type { CertificateDto } from '@qanunhub/core';
import logoUrl from '../assets/logo.png';
import { formatDate, ordinal } from './components';

const W = 1754; // A4 landscape at 150 dpi
const H = 1240;
const MAROON = '#4a0e17';
const BURGUNDY = '#800020';
const GOLD = '#b8923a';
const INK = '#2a1a1e';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
}

function corner(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(0, 0);
  ctx.lineTo(90, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(26, 26, 14, 0, Math.PI * 2);
  ctx.stroke();
  star(ctx, 26, 26, 9, 8, 0.5);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.restore();
}

function placeTitle(place: number): string {
  return place === 1 ? 'Yarış qalibi' : 'Yarış prizyoru';
}

export const PLACE_WORDS = ['', 'birinci', 'ikinci', 'üçüncü'];

export async function renderCertificate(c: CertificateDto, verifyHint: string): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts?.load('600 80px "Source Serif 4"'),
    document.fonts?.load('400 40px "Source Serif 4"'),
    document.fonts?.load('700 30px "Source Sans 3"'),
    document.fonts?.load('400 30px "Source Sans 3"'),
  ].map((p) => p?.catch(() => undefined)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // Paper and frame.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdfaf6');
  bg.addColorStop(1, '#f6efe6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = MAROON;
  ctx.fillRect(0, 0, W, 28);
  ctx.fillRect(0, H - 28, W, 28);
  ctx.fillRect(0, 0, 28, H);
  ctx.fillRect(W - 28, 0, 28, H);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(58, 58, W - 116, H - 116);
  ctx.lineWidth = 1;
  ctx.strokeRect(70, 70, W - 140, H - 140);
  corner(ctx, 86, 86, 1, 1);
  corner(ctx, W - 86, 86, -1, 1);
  corner(ctx, 86, H - 86, 1, -1);
  corner(ctx, W - 86, H - 86, -1, -1);

  // Logo.
  try {
    const logo = await loadImage(logoUrl);
    const lh = 96;
    const lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, (W - lw) / 2, 120, lw, lh);
  } catch {
    /* the certificate is still valid without the logo */
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = MAROON;
  ctx.font = '600 92px "Source Serif 4", Georgia, serif';
  ctx.fillText('SERTİFİKAT', W / 2, 330);
  ctx.fillStyle = GOLD;
  ctx.font = '700 30px "Source Sans 3", Arial, sans-serif';
  ctx.fillText(`${placeTitle(c.place).toLocaleUpperCase('az')}  ·  ${ordinal(c.place).toLocaleUpperCase('az')} YER`, W / 2, 384);

  ctx.fillStyle = INK;
  ctx.font = '400 34px "Source Sans 3", Arial, sans-serif';
  ctx.fillText('Bu sertifikat təqdim olunur:', W / 2, 470);
  ctx.fillStyle = BURGUNDY;
  let size = 84;
  ctx.font = `600 ${size}px "Source Serif 4", Georgia, serif`;
  while (ctx.measureText(c.name).width > W - 360 && size > 48) {
    size -= 4;
    ctx.font = `600 ${size}px "Source Serif 4", Georgia, serif`;
  }
  ctx.fillText(c.name, W / 2, 580);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 420, 612);
  ctx.lineTo(W / 2 + 420, 612);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = '400 36px "Source Serif 4", Georgia, serif';
  const line1 = `«${c.competitionTitle}» yarışında`;
  const line2 = `${PLACE_WORDS[c.place] ?? ordinal(c.place)} yeri tutduğu üçün${c.category ? ` (${c.category} kateqoriyası)` : ''}.`;
  ctx.fillText(line1, W / 2, 690);
  ctx.fillText(line2, W / 2, 742);
  ctx.font = '700 32px "Source Sans 3", Arial, sans-serif';
  ctx.fillStyle = MAROON;
  ctx.fillText(`Nəticə: ${c.pct}%`, W / 2, 812);

  // Seal.
  const sx = W / 2;
  const sy = 960;
  ctx.fillStyle = '#d9b54a';
  star(ctx, sx, sy, 92, 16, 0.86);
  ctx.fill();
  ctx.fillStyle = MAROON;
  ctx.beginPath();
  ctx.arc(sx, sy, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d9b54a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#d9b54a';
  star(ctx, sx, sy - 12, 22, 5, 0.42);
  ctx.fill();
  ctx.font = '700 16px "Source Sans 3", Arial, sans-serif';
  ctx.fillText('QANUNHUB', sx, sy + 30);

  // Date, code and signature line.
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '400 26px "Source Sans 3", Arial, sans-serif';
  ctx.fillText('Tarix', 190, 940);
  ctx.font = '700 30px "Source Sans 3", Arial, sans-serif';
  ctx.fillText(formatDate(c.issuedAt), 190, 980);
  ctx.font = '400 26px "Source Sans 3", Arial, sans-serif';
  ctx.fillText('Sertifikat kodu', 190, 1040);
  ctx.font = '700 30px "Source Sans 3", Arial, sans-serif';
  ctx.fillText(c.code, 190, 1080);

  ctx.textAlign = 'right';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 560, 980);
  ctx.lineTo(W - 190, 980);
  ctx.stroke();
  ctx.font = '400 26px "Source Sans 3", Arial, sans-serif';
  ctx.fillText('QanunHub komandası', W - 190, 1020);
  ctx.font = '400 22px "Source Sans 3", Arial, sans-serif';
  ctx.fillStyle = '#6e5d61';
  ctx.fillText(verifyHint, W - 190, 1080);
  return canvas;
}

// ---------------------------------------------------------------- minimal PDF writer

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** One A4 landscape page showing the canvas as a JPEG. */
export function canvasToPdf(canvas: HTMLCanvasElement, title: string): Blob {
  const jpeg = dataUrlBytes(canvas.toDataURL('image/jpeg', 0.92));
  const pw = 842;
  const ph = 595;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => { parts.push(b); length += b.length; };
  const obj = (n: number, body: Uint8Array[]) => {
    offsets[n] = length;
    push(bytes(`${n} 0 obj\n`));
    body.forEach(push);
    push(bytes('\nendobj\n'));
  };
  const safeTitle = title.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '');
  push(bytes('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  obj(1, [bytes('<< /Type /Catalog /Pages 2 0 R >>')]);
  obj(2, [bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
  obj(3, [bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)]);
  obj(4, [bytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, bytes('\nendstream')]);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, [bytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)]);
  obj(6, [bytes(`<< /Title (${safeTitle}) /Producer (QanunHub) >>`)]);
  const xref = length;
  let table = `xref\n0 7\n0000000000 65535 f \n`;
  for (let n = 1; n <= 6; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(bytes(`${table}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
