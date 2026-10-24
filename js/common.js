/* ============================================================
   PETIT JUEGO WEB — code partagé entre l'écran (host) et les manettes (play)
   ============================================================ */
window.PJ = (function () {
  'use strict';
  const COLORS = ['#00e5ff', '#ff4fa3', '#ffe14d'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const others = i => [0, 1, 2].filter(x => x !== i);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- avatars pixel : 6 visages, couleur du maillot = place (0,1,2) ---------- */
  const FACES = [
    ['..HHHHHH..', '.HHHHHHHH.', '.HSSSSSSH.', '.SSESSESS.', '.SSSSSSSS.', '.SBSMMSBS.', '..BBBBBB..', '...BBBB...', '.CCCCCCCC.', 'CCCCCCCCCC'],
    ['..HHHHHH..', '.HHHHHHHH.', 'HHSSSSSSHH', 'HHSESSESHH', 'HHSSSSSSHH', 'HHSSMMSSHH', 'HH.SSSS.HH', 'HH..SS..HH', '.CCCCCCCC.', 'CCCCCCCCCC'],
    ['H.HH..HH.H', '.HHHHHHHH.', '.HSSSSSSH.', '.GEGSSGEG.', '.SSSSSSSS.', '.SSSMMSSS.', '..SSSSSS..', '...SSSS...', '.CCCCCCCC.', 'CCCCCCCCCC'],
    ['..........', '...SSSS...', '..SSSSSS..', '.SSESSESS.', '.SSSSSSSS.', '.SSBBBBSS.', '..SSMMSS..', '...SSSS...', '.CCCCCCCC.', 'CCCCCCCCCC'],
    ['....HH....', '...HHHH...', '..HHHHHH..', '.HSSSSSSH.', '.SSESSESS.', '.SSSSSSSS.', '.SSSMMSSS.', '..SSSSSS..', '.CCCCCCCC.', 'CCCCCCCCCC'],
    ['..KKKKKK..', '.KKKKKKKK.', 'KKKKKKKKKK', '.SSSSSSSS.', '.SSESSESS.', '.SSSSSSSS.', '.SSSMMSSS.', '..SSSSSS..', '.CCCCCCCC.', 'CCCCCCCCCC']
  ];
  const FACE_PAL = [
    { H: '#3b2a1e', B: '#2a1d14', S: '#f2c6a0', E: '#111', M: '#c0392b', G: '#222' },
    { H: '#5a2d82', B: '#2a1d14', S: '#f6d2b5', E: '#111', M: '#ff2e7e', G: '#222' },
    { H: '#d9a21b', B: '#2a1d14', S: '#e8b98f', E: '#111', M: '#c0392b', G: '#1a1a1a' },
    { H: '#000', B: '#3b2a1e', S: '#c68642', E: '#111', M: '#8e2a2a', G: '#222' },
    { H: '#1a1a1a', B: '#2a1d14', S: '#f0c8a8', E: '#111', M: '#d6336c', G: '#222' },
    { H: '#000', B: '#2a1d14', S: '#8d5524', E: '#111', M: '#7a1f1f', G: '#222', K: '#e63946' }
  ];
  const FACE_NAMES = ['La barbe', 'Les cheveux longs', 'Les lunettes', 'La moustache', 'Le chignon', 'Le bonnet'];
  function avatar(face, seat, cls, extra) {
    const f = FACES[(face || 0) % FACES.length], pal = Object.assign({}, FACE_PAL[(face || 0) % FACES.length], { C: COLORS[(seat || 0) % 3] });
    let r = '';
    f.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
    return `<span class="av ${cls || ''}" ${extra || ''}><svg viewBox="0 0 10 10">${r}</svg></span>`;
  }

  /* ---------- sons 8-bit (WebAudio) ---------- */
  let AC = null; let soundOn = true;
  function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function tone(freq, dur, type, vol, when) {
    if (!soundOn) return; const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    const t = c.currentTime + (when || 0);
    g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    blip: () => tone(880, 0.06),
    select: () => { tone(660, 0.07); tone(990, 0.09, 'square', 0.08, 0.07); },
    back: () => { tone(440, 0.08); tone(300, 0.1, 'square', 0.07, 0.08); },
    tick: () => tone(1200, 0.05, 'square', 0.06),
    tock: () => tone(500, 0.08, 'square', 0.1),
    alarm: () => { [0, .15, .3, .45].forEach(t => tone(220, 0.14, 'sawtooth', 0.12, t)); },
    coin: () => { tone(1046, 0.08, 'square', 0.1); tone(1318, 0.25, 'square', 0.1, 0.08); },
    join: () => { tone(523, 0.08, 'square', 0.1); tone(784, 0.08, 'square', 0.1, 0.08); tone(1046, 0.2, 'square', 0.1, 0.16); },
    ko: () => { tone(150, 0.3, 'sawtooth', 0.15); tone(90, 0.5, 'sawtooth', 0.15, 0.15); },
    drum: () => tone(120, 0.08, 'square', 0.1),
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.09, i * 0.12)); tone(1318, 0.5, 'square', 0.1, 0.5); },
    fail: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.18)); },
    note: (f, d) => tone(f, d || 0.2, 'triangle', 0.12),
    fanfare: () => { [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.09, i * 0.14)); },
    setOn: v => { soundOn = v; }, isOn: () => soundOn, ac
  };

  /* ---------- config PeerJS : serveur public par défaut, ou ?peer=host:port (auto-hébergé / tests) ---------- */
  const peerParam = new URLSearchParams(location.search).get('peer');
  function peerOpts(extra) {
    const o = Object.assign({ debug: 0 }, extra || {});
    if (peerParam) { const [host, port] = peerParam.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' }); }
    return o;
  }

  return { COLORS, esc, rnd, shuffle, others, sleep, $, $$, avatar, FACES, FACE_NAMES, SFX, peerOpts, peerParam };
})();
