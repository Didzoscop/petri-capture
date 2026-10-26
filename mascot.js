/* Mascotte de Petri·Capture : boîte de Petri en pixel art, rendue image par image.
   Petit moteur 3D en pixels : la tranche du verre est échantillonnée dans l'espace, la face est retrouvée pixel par pixel
   (lancer de rayon sur son plan), le tout passe par un tampon de profondeur sur une petite grille, puis est cerné de noir.
   Utilisée par index.html et par mascot-lab.html (page d'essai de l'animation). */
(function(){
'use strict';
const MCOL = { ink:[26,26,26], glass:[214,230,226], agar:[242,196,107], edge:[157,183,177], dark:[118,142,136], col:[217,102,63], white:[255,255,255] };
const calmMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a, b) => a + Math.random()*(b - a);
const dot = (p, q) => p[0]*q[0] + p[1]*q[1] + p[2]*q[2];
const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate*dt)); // rapprochement indépendant de la cadence
function rot(v, k, a){ // rotation de v autour de l'axe unitaire k (formule de Rodrigues)
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v) * (1 - c);
  return [v[0]*c + (k[1]*v[2] - k[2]*v[1])*s + k[0]*d, v[1]*c + (k[2]*v[0] - k[0]*v[2])*s + k[1]*d, v[2]*c + (k[0]*v[1] - k[1]*v[0])*s + k[2]*d];
}
// réglages par défaut ; la page d'essai les modifie en direct
const OPTIONS = {
  fps: 30,         // images par seconde
  scale: 2.5,      // finesse de la grille : 1 = 28 × 30 pixels, 2,5 = 70 × 75
  elev: 10,        // plongée de la caméra (degrés)
  wobble: 18,      // inclinaison du disque d'Euler au lancer (degrés)
  eulerMin: 2.2, eulerMax: 3.6, // durée de la rotation avant de s'écraser (s)
  whirl: 1.2,      // tours d'oscillation par seconde au lancer
  whirlMax: 8.5,   // accélération maximale juste avant de s'écraser (× la vitesse du lancer)
  restMin: 1, restMax: 1.2,  // immobile à plat avant de se relever (s)
  riseStiff: 100, riseDamp: 8, // ressort pour se relever
  gravity: 4.5, bounce: .3,     // chute et rebond
  hopSpeed: 26, hopGravity: 90,
  rollAcc: 7, rollMax: 5,       // roulement sur la tranche : accélération (rayons/s²) et vitesse maximale (rayons/s)
  bumpBounce: .5,               // part de la vitesse gardée en rebondissant sur l'aperçu
  jumpGravity: 2600,            // saut depuis le bas de l'écran (px/s²)
  idle: true,      // se relève et regarde autour d'elle entre deux rotations
  wall: null       // fonction qui renvoie l'élément contre lequel elle peut rouler (l'aperçu vidéo) ; sans lui, seule l'animation classique
};

class Mascot{
  constructor(el, opts){
    this.el = el; this.o = Object.assign({}, OPTIONS, opts);
    this.stand = 0; this.standV = 0; this.up = false; this.hop = 0; this.hopV = 0;
    this.phi = Math.random()*6.3; this.psi = 0; this.alpha = 0; this.look = 0; this.lookT = 0; this.talking = false; this.t = 0;
    this.X = 0; this.V = 0; this.oy = 0; this.oyV = 0; this.noLegs = false; this.legK = 1; // déplacement hors de sa place (X en pixels de la grille, oy en px)
    this.build(); this.euler(Math.random() * .6);
  }
  build(){ // (re)crée la grille selon la finesse choisie
    const k = this.o.scale;
    Object.assign(this, { MW:Math.round(28*k), MH:Math.round(30*k), CX:14*k, MR:8*k, MTH:2.4*k, LEG:5*k });
    if (this.canvas) this.canvas.remove();
    const c = this.canvas = document.createElement('canvas'); c.width = this.MW; c.height = this.MH; this.el.appendChild(c);
    this.ctx = c.getContext('2d'); this.img = this.ctx.createImageData(this.MW, this.MH);
    this.zb = new Float32Array(this.MW*this.MH); this.mask = new Uint8Array(this.MW*this.MH);
  }
  set(opts){ const k = this.o.scale; Object.assign(this.o, opts); if (this.o.scale !== k) this.build(); }
  phase(name, dur){ this.ph = name; this.pt = 0; this.pd = dur || 0; }
  /* Animation d'attente, en boucle :
     euler  : le disque tourne de plus en plus vite en s'inclinant de moins en moins, puis s'écrase à plat ;
     rest   : immobile un instant, puis l'une des suites suivantes, tirée au hasard :
       classique : rise (se relève, regarde à droite puis à gauche), fall (se laisse tomber, l'impact relance la rotation) ;
       cogne     : se dresse sur la tranche, roule vers l'aperçu vidéo, le cogne, rebondit en arrière et retombe en rotation ;
       sortie    : roule vers la gauche hors de l'écran, puis revient en sautant depuis le bas de l'écran ;
     home   : après « cogne », elle revient à sa place en roulant avant de se relever. */
  euler(start, landed){ this.up = false; this.talking = false; this.ramp = !landed; this.phase('euler', rnd(this.o.eulerMin, this.o.eulerMax)); this.pt = (start || 0) * this.pd; }
  rise(){ this.up = true; this.talking = false; this.noLegs = false; this.lookT = 0; this.phase('rise', 2.6); }
  // dressée sur la tranche, sans jambes, comme une roue ; next : phase de roulement qui suit
  wheel(next){ this.up = true; this.talking = false; this.noLegs = true; this.lookT = 0; this.V = 0; this.next = next; this.phase('wheel', .6); }
  // fin du repos : retour à sa place si elle s'en est éloignée, sinon une animation au hasard
  pick(){
    if (!this.o.idle || calmMotion) return this.euler();
    if (Math.abs(this.X) > .5) return this.wheel('home');
    const r = this.o.wall ? Math.random() : 0;
    if (r < .4) this.rise(); else if (r < .7) this.wheel('bump'); else this.wheel('exit');
  }
  geom(){ // position à l'écran : rectangle de l'élément et taille d'un pixel de la grille (le canevas est centré, object-fit: contain)
    const r = this.el.getBoundingClientRect();
    return { r, sc: Math.min(r.width / this.MW, r.height / this.MH) || 1 };
  }
  home(){ this.X = 0; this.V = 0; this.oy = 0; this.oyV = 0; }
  // chute : elle part de travers (penchée sur le côté), si bien qu'elle touche le sol par le bord et se met à tourner
  fall(){ this.up = false; this.talking = false; this.omega = 0; this.phi = (Math.random() < .5 ? 0 : Math.PI) + rnd(Math.PI/3, 2*Math.PI/3); this.phase('fall'); }
  spin(){ if (this.stand > .3) this.fall(); else this.euler(); }
  jump(){ if (!this.hop && !this.up) this.hopV = this.o.hopSpeed * this.o.scale; }
  // parole : elle se lève sur ses jambes et bouge la bouche, puis se laisse retomber
  talk(ms){ if (this.ph === 'exit' || this.ph === 'jumpin') this.home(); // hors de l'écran : elle revient tout de suite pour parler
    this.up = true; this.noLegs = false; this.talking = true; this.lookT = (Math.random() < .5 ? -1 : 1) * rnd(.15, .3); this.phase('talk', (ms || 1700) / 1000); }
  step(dt){
    const o = this.o; this.t += dt; this.pt += dt;
    // déroulé des phases
    if (this.ph === 'euler'){
      const u = Math.min(1, this.pt / this.pd), left = Math.pow(1 - u, .6);
      this.alpha = o.wobble * left * (this.ramp ? Math.min(1, this.pt / .25) : 1); // sans chute avant, le lancer incline le disque en un quart de seconde
      this.omega = 2*Math.PI * o.whirl * Math.min(o.whirlMax, 1 / Math.sqrt(Math.max(left, 1e-4)));
      if (u >= 1) this.phase('settle', .35);
    } else if (this.ph === 'settle'){ // dernières vibrations contre le sol
      const k = 1 - this.pt / this.pd;
      this.alpha = Math.max(0, k) * 1.5 * Math.abs(Math.sin(this.pt * 55));
      if (this.pt >= this.pd){ this.alpha = 0; this.phase('rest', rnd(o.restMin, o.restMax)); }
    } else if (this.ph === 'rest'){
      if (this.pt >= this.pd) this.pick();
    } else if (this.ph === 'wheel'){
      if (this.pt >= this.pd) this.phase(this.next);
    } else if (this.ph === 'bump'){ // roule vers l'aperçu en accélérant…
      this.V = Math.min(o.rollMax*this.MR, this.V + o.rollAcc*this.MR*dt); this.X += this.V*dt;
      const w = o.wall && o.wall(), g = this.geom();
      if (!w) this.phase('back');
      else {
        const wl = w.getBoundingClientRect().left, edge = g.r.left + g.r.width/2 + (this.X + this.MR)*g.sc;
        if (edge >= wl){ // …le cogne et rebondit en arrière avec un petit saut
          this.X -= (edge - wl) / g.sc; this.V = -this.V*o.bumpBounce;
          this.hopV = o.hopSpeed*o.scale*.45; this.phase('back');
        }
      }
    } else if (this.ph === 'back'){ // freine en reculant, puis se laisse tomber en rotation
      this.V *= Math.exp(-2.2*dt); this.X += this.V*dt;
      if (Math.abs(this.V) < .35*this.MR) this.fall();
    } else if (this.ph === 'home'){ // revient à sa place en roulant
      const vmax = .6*o.rollMax*this.MR;
      this.V = Math.max(-vmax, Math.min(vmax, -this.X*2.5)); if (Math.abs(this.V) < .8*this.MR) this.V = -Math.sign(this.X)*.8*this.MR;
      this.X += this.V*dt;
      if (Math.abs(this.X) <= .8*this.MR*dt + .5){ this.X = 0; this.V = 0; this.rise(); }
    } else if (this.ph === 'exit'){ // roule vers la gauche jusqu'à sortir de l'écran
      this.V = Math.max(-1.3*o.rollMax*this.MR, this.V - o.rollAcc*this.MR*dt); this.X += this.V*dt;
      const g = this.geom();
      if (g.r.left + g.r.width/2 + (this.X + this.MR)*g.sc < -2){
        // réapparaît sous sa place, debout sur ses jambes, et saute pour la rejoindre
        this.X = 0; this.V = 0; this.noLegs = false; this.legK = 1; this.stand = 1; this.standV = 0; this.psi = 0;
        this.oy = Math.max(0, innerHeight - g.r.top) + 4;
        this.oyV = -Math.sqrt(2*o.jumpGravity*(this.oy + g.r.height*.45));
        this.phase('jumpin');
      }
    } else if (this.ph === 'jumpin'){
      this.oyV += o.jumpGravity*dt; this.oy += this.oyV*dt;
      if (this.oyV > 0 && this.oy >= 0){ this.oy = 0; this.oyV = 0; this.standV = -4; this.rise(); } // atterrit en fléchissant les jambes
    } else if (this.ph === 'rise'){
      this.lookT = this.pt < .55 ? 0 : this.pt < 1.25 ? .55 : this.pt < 2 ? -.55 : 0; // à droite, puis à gauche
      if (this.pt >= this.pd) this.fall();
    } else if (this.ph === 'talk'){
      if (this.pt >= this.pd) this.fall();
    } else if (this.ph === 'fall'){
      this.alpha = o.wobble * Math.min(1, Math.max(0, 1 - this.stand)); // penche de plus en plus en tombant
      if (this.stand <= 0 && this.standV >= 0) this.euler(0, true); // touche le sol par le bord : la rotation démarre
    }
    if (this.ph !== 'euler' && this.ph !== 'settle' && this.ph !== 'fall') this.alpha = ease(this.alpha, 0, 10, dt);
    // corps : ressort pour se relever, chute libre et rebonds pour retomber
    if (this.up){ this.standV += (o.riseStiff*(1 - this.stand) - o.riseDamp*this.standV) * dt; this.stand += this.standV * dt; }
    else {
      this.standV -= o.gravity*dt; this.stand += this.standV*dt;
      if (this.stand < 0){ this.stand = 0; this.standV = this.standV < -.6 ? -this.standV*o.bounce : 0; }
    }
    this.look = ease(this.look, this.up ? this.lookT : 0, 7, dt);
    this.legK = ease(this.legK, this.noLegs ? 0 : 1, 10, dt);
    this.faceT = this.up && this.stand > .35 ? (this.faceT || 0) + dt : 0; // temps depuis le retour des yeux
    if (this.hop > 0 || this.hopV){ this.hopV -= o.hopGravity*o.scale*dt; this.hop += this.hopV*dt; if (this.hop <= 0){ this.hop = 0; this.hopV = 0; } }
    if (!calmMotion){
      const lie = 1 - Math.min(1, Math.max(0, this.stand));
      if (this.alpha > .01) this.phi += dt * (this.omega || 0);
      // la face roule lentement avec l'inclinaison (comme un vrai disque d'Euler) et se redresse quand elle se lève
      const rolling = this.ph === 'bump' || this.ph === 'back' || this.ph === 'home' || this.ph === 'exit';
      if (rolling) this.psi -= this.V*dt / this.MR; // roule sans glisser
      else if (this.up) this.psi = ease(this.psi, Math.round(this.psi / (2*Math.PI)) * 2*Math.PI, 8, dt);
      else this.psi -= dt * (this.omega || 0) * (1 - Math.cos(this.alpha * Math.PI/180)) * 6 * lie;
    }
  }
  render(){
    const { MW, MH, CX, MR, MTH, LEG, o } = this, d = this.img.data, zb = this.zb, mask = this.mask;
    const CE = Math.cos(o.elev * Math.PI/180), SE = Math.sin(o.elev * Math.PI/180);
    // ligne du sol : assez haute pour que le bord avant du disque couché et incliné reste dans l'image
    const GY = MH - (MR * Math.sin(Math.min(90, o.elev + o.wobble) * Math.PI/180) + MTH/2 + 1.5*o.scale);
    d.fill(0); zb.fill(-1e9); mask.fill(0);
    const s = Math.max(0, Math.min(1.12, this.stand)), s1 = Math.min(1, s), lie = 1 - s1;
    let legs = Math.max(0, Math.min(1, (s - .55) / .4)) * this.legK; if (legs < .1) legs = 0; // pas de pied résiduel sur la tranche
    const alr = calmMotion ? 0 : this.alpha * Math.PI/180 * lie; // inclinaison du disque d'Euler
    const C = [0, MTH/2 + (MR + LEG*legs - MTH/2)*s1 + MR*Math.sin(alr) + this.hop, 0]; // incliné, le disque repose sur son bord
    // orientation : debout face à nous (a droite, b haut, n vers nous), basculée en arrière pour se coucher
    const X = [1, 0, 0], tilt = -(1 - s) * Math.PI/2;
    let a = X, b = rot([0, 1, 0], X, tilt), n = rot([0, 0, 1], X, tilt);
    const k = [Math.cos(this.phi), 0, Math.sin(this.phi)]; // axe d'inclinaison, qui tourne avec l'oscillation
    if (alr){ a = rot(a, k, alr); b = rot(b, k, alr); n = rot(n, k, alr); }
    const Y = [0, 1, 0], lk = this.look * s1;
    a = rot(a, Y, lk); b = rot(b, Y, lk); n = rot(n, Y, lk);
    const a2 = rot(a, n, this.psi), b2 = rot(b, n, this.psi); a = a2; b = b2;
    const set = (i, c, al) => { d[i*4] = c[0]; d[i*4+1] = c[1]; d[i*4+2] = c[2]; d[i*4+3] = al == null ? 255 : al; };
    const put = (P, c) => {
      const sx = Math.floor(CX + P[0]), sy = Math.floor(GY - (P[1]*CE - P[2]*SE));
      if (sx < 0 || sy < 0 || sx >= MW || sy >= MH) return;
      const i = sy*MW + sx, z = P[2]*CE + P[1]*SE;
      if (z > zb[i]){ zb[i] = z; set(i, c); mask[i] = 1; }
    };
    // tranche du verre
    const nTh = Math.round(220 * o.scale);
    for (let j = 0; j < nTh; j++){
      const th = j / nTh * 2*Math.PI, cu = MR*Math.cos(th), cv = MR*Math.sin(th);
      for (let h = -MTH/2; h <= MTH/2 + 1e-6; h += MTH/(6*o.scale))
        put([C[0] + a[0]*cu + b[0]*cv + n[0]*h, C[1] + a[1]*cu + b[1]*cv + n[1]*h, C[2] + a[2]*cu + b[2]*cv + n[2]*h], h < -MTH/2 + .5*o.scale ? MCOL.dark : MCOL.edge);
    }
    // face visible : on lance un rayon par pixel jusqu'au plan de la face (ou du fond si elle nous tourne le dos)
    const ED = [0, SE, CE], EU = [0, CE, -SE], nd = dot(n, ED), front = nd > 0, off = (front ? 1 : -1) * MTH/2;
    const F = [C[0] + n[0]*off, C[1] + n[1]*off, C[2] + n[2]*off];
    const open = this.talking && Math.floor(this.t / .15) % 2;
    // le visage disparaît dès qu'elle tombe et revient pendant qu'elle se relève : les yeux d'abord, puis la bouche
    const eyes = this.faceT > 0, mouth = this.faceT > .22;
    if (Math.abs(nd) > .04) for (let sy = 0; sy < MH; sy++) for (let sx = 0; sx < MW; sx++){
      const U = GY - (sy + .5), Xs = sx + .5 - CX;
      const Q0 = [Xs, U*EU[1], U*EU[2]], tt = dot([F[0] - Q0[0], F[1] - Q0[1], F[2] - Q0[2]], n) / nd;
      const Q = [Q0[0] + ED[0]*tt, Q0[1] + ED[1]*tt, Q0[2] + ED[2]*tt], R = [Q[0] - F[0], Q[1] - F[1], Q[2] - F[2]];
      const u = dot(R, a) / MR * 8, v = dot(R, b) / MR * 8, r = Math.hypot(u, v); // coordonnées de la face ramenées à un rayon de 8
      if (r > 8) continue;
      const i = sy*MW + sx; if (tt <= zb[i]) continue;
      const px = 8 / MR; // taille d'un pixel dans ces coordonnées
      let c;
      if (!front) c = MCOL.edge;
      else if (r > 8 - .75*px*o.scale) c = MCOL.ink;
      else if (r > 6.3) c = (Math.atan2(v, u) > 1.9 && Math.atan2(v, u) < 2.7) ? MCOL.white : MCOL.glass;
      else if (eyes && Math.abs(Math.abs(u) - 2.6) < .6 && v > .4 && v < 2.6) c = MCOL.ink;                // yeux
      else if (mouth && Math.abs(u) < 1.1 && v < -1.2 && v > (open ? -3.2 : -2.1)) c = MCOL.ink;          // bouche
      else if (Math.hypot(u + 3.4, v + 2.8) < 1.2 || Math.hypot(u - 3.6, v - 3.4) < .8 || Math.hypot(u - 2.4, v + 4.3) < .75) c = MCOL.col; // colonies
      else c = MCOL.agar;
      zb[i] = tt; set(i, c); mask[i] = 1;
    }
    // jambes
    if (legs > 0) [-2.6, 2.6].forEach(l => {
      const lx = l / 8 * MR, ly = -Math.sqrt(MR*MR - lx*lx), T = [C[0] + a[0]*lx + b[0]*ly, C[1] + a[1]*lx + b[1]*ly, C[2] + a[2]*lx + b[2]*ly];
      const w = Math.max(1, Math.round(o.scale));
      for (let q = 0; q <= 1; q += .02){
        const P = [T[0], T[1]*(1 - q), T[2]], sx = Math.floor(CX + P[0]), sy = Math.floor(GY - (P[1]*CE - P[2]*SE));
        for (let e = 0; e < w; e++) if (sx + e >= 0 && sy >= 0 && sx + e < MW && sy < MH && !mask[sy*MW + sx + e]) set(sy*MW + sx + e, MCOL.ink);
      }
      const fy = Math.floor(GY + T[2]*SE), fx = Math.floor(CX + T[0]) + (l < 0 ? -w : w);
      for (let e = 0; e < w; e++) for (let f = 0; f < w; f++) if (fx + e >= 0 && fx + e < MW && fy - f >= 0 && fy - f < MH) set((fy - f)*MW + fx + e, MCOL.ink);
    });
    // contour noir autour de la silhouette, puis ombre au sol
    const edge = [];
    for (let i = 0; i < MW*MH; i++){
      if (mask[i] || d[i*4+3]) continue;
      const x = i % MW, y = (i / MW) | 0;
      if ((x > 0 && mask[i-1]) || (x < MW-1 && mask[i+1]) || (y > 0 && mask[i-MW]) || (y < MH-1 && mask[i+MW])) edge.push(i);
    }
    edge.forEach(i => set(i, MCOL.ink));
    const rx = MR*(1 - .4*s1) - this.hop*.3, ry = 1.6*o.scale;
    for (let y = Math.floor(GY - ry); y <= Math.ceil(GY + ry); y++) for (let x = 0; x < MW; x++){
      if (y < 0 || y >= MH) continue;
      const i = y*MW + x, dx = (x + .5 - CX) / rx, dy = (y + .5 - GY - .3*o.scale) / ry;
      if (!d[i*4+3] && dx*dx + dy*dy <= 1) set(i, MCOL.ink, 46);
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.place();
  }
  // hors de sa place, le canevas passe en position fixe : il peut sortir du panneau sans être coupé ni créer de défilement
  place(){
    const c = this.canvas;
    if (!this.X && !this.oy){ if (c.style.position) c.style.cssText = ''; return; }
    const { r, sc } = this.geom();
    c.style.cssText = 'position:fixed;z-index:10;pointer-events:none;left:' + (r.left + this.X*sc) + 'px;top:' + (r.top + this.oy) + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  }
}

// une seule boucle pour toutes les mascottes, à la cadence choisie (requestAnimationFrame)
const all = [];
let last = 0, acc = 0;
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
  if (document.hidden) return;
  all.forEach(m => {
    if (!m.el.getClientRects().length) return;
    m.acc = (m.acc || 0) + dt;
    const step = 1 / m.o.fps;
    if (m.acc < step) return;
    m.step(Math.min(.1, m.acc)); m.acc = 0; m.render();
  });
}
requestAnimationFrame(frame);
function create(el, opts){ const m = new Mascot(el, opts); all.push(m); m.render(); return m; } // première image tout de suite, même si la page est en arrière-plan
window.PetriMascot = { create, OPTIONS, Mascot, all };
})();
