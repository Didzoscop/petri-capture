// Génère test-sheet.pdf : feuille de test à l'échelle réelle (A4 paysage) avec les deux socles et leurs 8 marqueurs ArUco.
// Usage : node tools/make-test-sheet.js   (écrit test-sheet.pdf à la racine du dépôt)
// Géométrie identique à celle attendue par l'app (index.html, « Socles : géométrie ») :
//   socles de 103 mm, marqueurs DICT_4X4_50 de 10 × 10 mm, centres à 35,75 mm du centre du socle,
//   boîte à gauche (ID 0 nord, 1 est, 2 sud, 3 ouest), couvercle à droite (ID 4 à 7), nord = haut de la feuille.
const fs = require('fs'), path = require('path');

const MM = 72 / 25.4, PW = 297, PH = 210;            // A4 paysage, en mm
const R = 51.5, D = 35.75, TILE = 10;
// codes des marqueurs 0 à 7 (2 octets = 16 bits, ligne par ligne, bit à 1 = blanc), dictionnaire 4×4 d'OpenCV
const CODES = [[181,50],[15,154],[51,45],[153,70],[84,158],[121,205],[158,46],[196,242]];
const SOCLES = [
  { cx: 89, cy: 112, ids: [0, 1, 2, 3], fr: 'Boîte', en: 'Dish' },
  { cx: 208, cy: 112, ids: [4, 5, 6, 7], fr: 'Couvercle', en: 'Lid' }
];
const POS = [[0, -D], [D, 0], [0, D], [-D, 0]];       // nord, est, sud, ouest (y vers le bas de la feuille)
const DIR = ['N', 'E', 'S', 'O/W'];

let ops = [];
const X = x => (x * MM).toFixed(2), Y = y => ((PH - y) * MM).toFixed(2); // mm (y vers le bas) → points PDF
const rect = (x, y, w, h) => ops.push(`${X(x)} ${Y(y + h)} ${(w * MM).toFixed(2)} ${(h * MM).toFixed(2)} re f`);
function circle(cx, cy, r, op){
  const k = .5523 * r, p = (x, y) => `${X(x)} ${Y(y)}`;
  ops.push(`${p(cx + r, cy)} m ${p(cx + r, cy - k)} ${p(cx + k, cy - r)} ${p(cx, cy - r)} c ${p(cx - k, cy - r)} ${p(cx - r, cy - k)} ${p(cx - r, cy)} c`
    + ` ${p(cx - r, cy + k)} ${p(cx - k, cy + r)} ${p(cx, cy + r)} c ${p(cx + k, cy + r)} ${p(cx + r, cy + k)} ${p(cx + r, cy)} c ${op}`);
}
const line = (x1, y1, x2, y2) => ops.push(`${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);
// texte en Helvetica (WinAnsi) : accents et tiret demi-cadratin codés en octal
const enc = s => [...s].map(ch => { const c = ch === '–' ? 0x96 : ch === '·' ? 0xB7 : ch.charCodeAt(0);
  if (ch === '(' || ch === ')' || ch === '\\') return '\\' + ch; return c > 126 ? '\\' + c.toString(8) : ch; }).join('');
const width = (s, size) => s.length * size * .5 / MM;  // estimation, pour centrer
function text(x, y, s, size, opts = {}){
  const font = opts.bold ? '/F2' : '/F1', w = opts.center ? width(s, size) : 0;
  ops.push(`BT ${font} ${size} Tf ${X(x - w / 2)} ${Y(y)} Td (${enc(s)}) Tj ET`);
}
function marker(cx, cy, id){
  const cell = TILE / 6, x0 = cx - TILE / 2, y0 = cy - TILE / 2, bits = (CODES[id][0] << 8) | CODES[id][1];
  ops.push('1 g'); rect(x0 - 1.5, y0 - 1.5, TILE + 3, TILE + 3); ops.push('0 g');  // marge blanche
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++){
    const inner = r > 0 && r < 5 && c > 0 && c < 5;
    if (inner && ((bits >> (15 - ((r - 1) * 4 + (c - 1)))) & 1)) continue;  // bit blanc
    rect(x0 + c * cell, y0 + r * cell, cell + .02, cell + .02);
  }
}

// titre et consignes
ops.push('0 g');
text(12, 14, 'Petri·Capture – test sheet / feuille de test', 14, { bold: true });
text(12, 20.5, 'EN  Print at 100 % (actual size, no "fit to page"). Lay flat, dish base on the left, then in the app: Settings > Calibration > Automatic > Calibrate.', 8.5);
text(12, 25, 'FR  Imprimer à 100 % (taille réelle, sans « ajuster à la page »). Poser à plat, socle boîte à gauche, puis dans l\'app : Réglages > Calibration > Automatique > Calibrer.', 8.5);
// les deux socles
SOCLES.forEach(s => {
  ops.push('0.6 G', `${(.4 * MM).toFixed(2)} w`); circle(s.cx, s.cy, R, 'S');
  ops.push('0.85 G', `${(.25 * MM).toFixed(2)} w`); line(s.cx - 3, s.cy, s.cx + 3, s.cy); line(s.cx, s.cy - 3, s.cx, s.cy + 3);
  s.ids.forEach((id, j) => {
    const mx = s.cx + POS[j][0], my = s.cy + POS[j][1];
    marker(mx, my, id);
    const lx = mx + (POS[j][0] ? Math.sign(POS[j][0]) * 9.5 : 0), ly = my + (POS[j][1] ? Math.sign(POS[j][1]) * 9.5 : 0) + 1;
    ops.push('0.35 g'); text(lx, ly, id + ' ' + DIR[j], 6.5, { center: true }); ops.push('0 g');
  });
  text(s.cx, s.cy + R + 7, s.en + ' / ' + s.fr + '  (ID ' + s.ids[0] + '–' + s.ids[3] + ')', 10, { bold: true, center: true });
});
text((SOCLES[0].cx + SOCLES[1].cx) / 2, SOCLES[0].cy - R - 3, 'N ^', 9, { bold: true, center: true });
// règle de contrôle
ops.push('0 G', `${(.4 * MM).toFixed(2)} w`);
const bx = 12, by = 197; line(bx, by, bx + 50, by);
for (let i = 0; i <= 50; i += 10) line(bx + i, by - (i % 50 ? 1.5 : 2.5), bx + i, by);
text(bx + 53, by + 1, '50 mm – check with a ruler / vérifier à la règle', 8);
text(PW - 12 - width('103 mm bases · 10 mm ArUco DICT_4X4_50 markers at 35.75 mm', 7), by + 1, '103 mm bases · 10 mm ArUco DICT_4X4_50 markers at 35.75 mm', 7);

// assemblage du PDF
const content = ops.join('\n');
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(PW * MM).toFixed(2)} ${(PH * MM).toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
  `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
];
let pdf = '%PDF-1.4\n', offs = [];
objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const out = path.join(__dirname, '..', 'test-sheet.pdf');
fs.writeFileSync(out, Buffer.from(pdf, 'latin1'));
console.log('écrit', out, Buffer.byteLength(pdf, 'latin1'), 'octets');
