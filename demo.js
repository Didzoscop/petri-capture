/* Mode démo de Petri·Capture : une fausse caméra pour essayer l'app sans caméra (ordinateur, aperçu de Claude Code…).
   Elle filme un socle double avec ses 8 marqueurs ArUco ; PetriDemo.toggle() pose ou retire une boîte et son couvercle. */
(function(){
'use strict';
const W = 1280, H = 720, POS = [[0, 35.75], [35.75, 0], [0, -35.75], [-35.75, 0]];
const SOCLES = [ // centre (px), échelle (px par mm), rotation (rad), ID des marqueurs
  { cx:430, cy:380, s:3.4, rot:.08, ids:[0, 1, 2, 3] },
  { cx:900, cy:365, s:3.3, rot:.05, ids:[4, 5, 6, 7] }
];
let dish = false, colonies = [];
function mapper(o){ return (X, Y) => { const c = Math.cos(o.rot), s = Math.sin(o.rot); return [o.cx + (X*c - Y*s)*o.s, o.cy - (X*s + Y*c)*o.s]; }; }
function poly(g, f, pts, col){ g.fillStyle = col; g.beginPath(); pts.forEach(([X, Y], i) => { const [x, y] = f(X, Y); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); }
const circle = r => { const p = []; for (let i = 0; i < 72; i++){ const t = i/72*2*Math.PI; p.push([r*Math.cos(t), r*Math.sin(t)]); } return p; };
function marker(g, f, id, mx, my){
  const codes = window.AR && AR.DICTIONARIES && AR.DICTIONARIES.ARUCO_4X4_1000 && AR.DICTIONARIES.ARUCO_4X4_1000.codeList;
  const rot = (id*37 + 11) * Math.PI/180; // tuile clipsée de travers
  const tile = (u, v) => [mx + u*Math.cos(rot) - v*Math.sin(rot), my + u*Math.sin(rot) + v*Math.cos(rot)];
  poly(g, f, [tile(-5,-5), tile(5,-5), tile(5,5), tile(-5,5)], '#fff');
  if (!codes) return;
  const bits = (codes[id][0] << 8) | codes[id][1], cell = 8/6;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++){
    if (r > 0 && r < 5 && c > 0 && c < 5 && ((bits >> (15 - ((r-1)*4 + c-1))) & 1)) continue; // bit blanc
    const u0 = -4 + c*cell, v0 = 4 - r*cell;
    poly(g, f, [tile(u0, v0), tile(u0+cell, v0), tile(u0+cell, v0-cell), tile(u0, v0-cell)], '#111');
  }
}
function draw(g){
  g.fillStyle = '#6f7479'; g.fillRect(0, 0, W, H);
  SOCLES.forEach((o, k) => {
    const f = mapper(o);
    poly(g, f, circle(51.5), '#d9d4c8');
    o.ids.forEach((id, j) => marker(g, f, id, POS[j][0], POS[j][1]));
    if (!dish) return;
    if (k === 0){ // boîte ouverte : gélose et colonies
      poly(g, f, circle(45), '#cfe0dc'); poly(g, f, circle(43), '#e8bf62');
      colonies.forEach(c => poly(g, f, circle(c.r).map(([x, y]) => [x + c.x, y + c.y]), c.col));
    } else { poly(g, f, circle(46), '#cfe0dc'); poly(g, f, circle(44), '#e4ece9'); poly(g, f, circle(6).map(([x, y]) => [x - 20, y + 25]), '#333'); } // couvercle et son numéro
  });
}
function start(){
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  draw(g); setInterval(() => draw(g), 100);
  return cv.captureStream(10);
}
function toggle(){
  dish = !dish;
  if (dish) colonies = Array.from({ length: 14 }, () => { const a = Math.random()*6.3, d = Math.random()*36;
    return { x:d*Math.cos(a), y:d*Math.sin(a), r:1 + Math.random()*3, col:['#f4efe2', '#d26a3c', '#b8d070'][Math.floor(Math.random()*3)] }; });
  return dish;
}
window.PetriDemo = { start, toggle };
})();
