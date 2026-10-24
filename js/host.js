/* ============================================================
   PETIT JUEGO WEB — l'écran de jeu (host)
   Le laptop est posé sur la table, tout le monde regarde l'écran,
   chacun joue avec son téléphone comme manette (WebRTC / PeerJS).
   La logique des 20 jeux est dans games.js ; ici : état, salle,
   manettes, borne, ambiance, fin de set.
   ============================================================ */
(function () {
  'use strict';
  const D = window.DATA;
  const { esc, rnd, shuffle, others, sleep, $, $$, avatar, SFX, peerOpts, peerParam, GAMES, CATS, pickRandom, available, countdown } = window.PJ;
  const LS = 'petitjuego_web_v2';

  /* ---------- état persistant ---------- */
  const defaultState = () => ({
    players: ['', '', ''], scores: [0, 0, 0], ambiance: null, hot: false, sound: true, lastGame: null, setsPlayed: 0,
    turn: { tour: 0 }, used: {}, custom: { qui: [], cinq: [], tete: [], prefere: [] },
    stats: { ko: [0, 0, 0], lucid: [0, 0, 0], mental: [0, 0, 0], lieHidden: [0, 0, 0], lieDetect: [0, 0, 0], cinqOk: [0, 0, 0], cinqFail: [0, 0, 0], guessedOn: [0, 0, 0], reflex: [0, 0, 0], votes: [0, 0, 0], sips: [0, 0, 0], rounds: 0 }
  });
  let S = load();
  function load() {
    try { const raw = localStorage.getItem(LS); if (!raw) return defaultState(); const s = JSON.parse(raw), d = defaultState();
      return Object.assign(d, s, { turn: Object.assign(d.turn, s.turn || {}), used: s.used || {}, custom: Object.assign(d.custom, s.custom || {}), stats: Object.assign(d.stats, s.stats || {}) }); } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } }
  SFX.setOn(S.sound);
  const P = i => S.players[i] || ('Joueur ' + (i + 1));
  const hotOn = () => S.ambiance === 'glisse' || S.ambiance === 'mix' || S.hot;
  const amb = () => D.ambiances[S.ambiance] || D.ambiances.mix;

  function draw(game) {
    const base = D[game];
    let pool = Array.isArray(base) ? base.slice() : base.soft.slice();
    if (!Array.isArray(base) && hotOn() && base.hot) pool = pool.concat(base.hot);
    const custom = (S.custom[game] || []).map(c => game === 'prefere' ? c.split('|').map(x => x.trim()) : c).filter(c => game !== 'prefere' || (c.length === 2 && c[0] && c[1]));
    pool = pool.concat(custom);
    const key = q => Array.isArray(q) ? q.join('|') : q;
    S.used[game] = S.used[game] || [];
    let fresh = pool.filter(q => !S.used[game].includes(key(q)));
    if (!fresh.length) { S.used[game] = []; fresh = pool; }
    const q = rnd(fresh); S.used[game].push(key(q)); save(); return q;
  }
  const isHot = (game, q) => { const b = D[game]; if (Array.isArray(b) || !b.hot) return false; const k = Array.isArray(q) ? q.join('|') : q; return b.hot.some(h => (Array.isArray(h) ? h.join('|') : h) === k); };

  /* ============================================================
     RÉSEAU — salle, manettes, invites
     ============================================================ */
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const genCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  let CODE = genCode(), peer = null, roomOpen = false;
  const conns = [null, null, null], tokens = [null, null, null], pending = [null, null, null];
  let pid = 0, gen = 0;
  const joinURL = () => location.href.replace(/[^/]*$/, '') + 'play.html?r=' + CODE + (peerParam ? '&peer=' + encodeURIComponent(peerParam) : '');
  const online = i => !!(conns[i] && conns[i].open);
  const allOnline = () => [0, 1, 2].every(online);

  function openRoom() {
    if (peer) { try { peer.destroy(); } catch (e) { } }
    roomOpen = false; renderRoom();
    peer = new Peer('petitjuego-' + CODE, peerOpts());
    peer.on('open', () => { roomOpen = true; renderRoom(); if (screenName === 'lobby') lobby(); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') { CODE = genCode(); setTimeout(openRoom, 300); }
      else { toast('Réseau : ' + e.type); if (!peer.open) setTimeout(openRoom, 4000); }
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
    peer.on('connection', conn => {
      conn.on('data', m => onData(conn, m));
      conn.on('close', () => { const i = conns.indexOf(conn); if (i >= 0) { conns[i] = null; renderSide(); if (screenName === 'lobby') lobby(); toast(P(i) + ' a lâché sa manette'); } });
      conn.on('open', () => conn.send({ t: 'lobby', names: S.players, scores: S.scores }));
    });
  }
  function onData(conn, m) {
    if (!m || !m.t) return;
    if (m.t === 'join') {
      const name = String(m.name || '').trim().slice(0, 12);
      let seat = tokens.indexOf(m.token);
      if (seat >= 0 && online(seat) && conns[seat] !== conn) { try { conns[seat].close(); } catch (e) { } conns[seat] = null; }
      if (seat < 0 && name) {
        const lower = name.toLowerCase();
        const dup = [0, 1, 2].find(i => online(i) && (S.players[i] || '').toLowerCase() === lower);
        if (dup !== undefined) { conn.send({ t: 'seat', ok: false, reason: 'Ce prénom est déjà pris sur une autre manette.', names: S.players, scores: S.scores }); return; }
        seat = [0, 1, 2].find(i => !online(i) && (S.players[i] || '').toLowerCase() === lower);
        if (seat === undefined) seat = [0, 1, 2].find(i => !online(i) && !S.players[i]);
        if (seat === undefined) seat = [0, 1, 2].find(i => !online(i));
        if (seat === undefined) { conn.send({ t: 'seat', ok: false, reason: 'La salle est pleine (3 joueurs max).', names: S.players, scores: S.scores }); return; }
      }
      if (seat < 0 || seat === undefined) { conn.send({ t: 'seat', ok: false, reason: 'Dis-nous ton prénom.', names: S.players, scores: S.scores }); return; }
      if (name) S.players[seat] = name;
      conns[seat] = conn; tokens[seat] = m.token; save();
      conn.send({ t: 'seat', ok: true, seat, names: S.players, scores: S.scores });
      SFX.join(); renderSide(); if (screenName === 'lobby') lobby();
      if (pending[seat]) conn.send(Object.assign({ t: 'prompt' }, pending[seat].prompt, { id: pending[seat].id, names: S.players, scores: S.scores }));
      return;
    }
    if (m.t === 'in') {
      const seat = conns.indexOf(conn); if (seat < 0) return;
      const p = pending[seat]; if (!p || p.id !== m.id) return;
      pending[seat] = null; p.resolve(m.value);
    }
  }
  function sendTo(i, msg) { if (online(i)) conns[i].send(Object.assign({ names: S.players, scores: S.scores }, msg)); }
  function clearPads(title, msg) { [0, 1, 2].forEach(i => { pending[i] = null; sendTo(i, { t: 'clear', title, msg }); }); }

  class Aborted extends Error { }
  function ask(seat, prompt, quiet) {
    const myGen = gen, id = ++pid;
    return new Promise((resolve, reject) => {
      pending[seat] = { id, prompt, resolve: v => { if (gen !== myGen) return reject(new Aborted()); resolve(v); }, reject };
      sendTo(seat, Object.assign({ t: 'prompt', id }, prompt));
      if (!quiet) setBadge(seat, 'waiting');
    }).then(v => { if (!quiet) setBadge(seat, 'done'); return v; });
  }
  async function askAll(seats, promptFn) {
    const out = {};
    await Promise.all(seats.map(s => ask(s, promptFn(s)).then(v => { out[s] = v; SFX.blip(); const el = $('#pp' + s); if (el) { el.classList.add('done'); $('.ok', el).textContent = 'OK'; } })));
    [0, 1, 2].forEach(i => setBadge(i, ''));
    return out;
  }
  let tvKey = null, abortHooks = [];
  function scrollEnd() { const all = $$('#stage .tvbtns'); const r = all[all.length - 1] || $('#result'); if (r) setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50); }
  /** Boutons sur l'écran (clic / Espace) ET sur les 3 manettes : le premier qui répond gagne. */
  function tvChoice(options) {
    const myGen = gen;
    return new Promise((resolve, reject) => {
      const box = document.createElement('div'); box.className = 'tvbtns';
      box.innerHTML = options.map((o, i) => `<button class="btn tvbtn ${o.cls || (i === 0 ? 'primary' : 'ghost')}" data-i="${i}">${esc(o.label)}</button>`).join('');
      $('#stage .sc').appendChild(box);
      let done = false;
      const finish = i => { if (done || gen !== myGen) return; done = true; tvKey = null; [0, 1, 2].forEach(s => { pending[s] = null; setBadge(s, ''); }); clearPads('REGARDE L\'ÉCRAN', ''); SFX.select(); resolve(i); };
      $$('button', box).forEach(b => b.onclick = () => finish(+b.dataset.i));
      tvKey = () => finish(0);
      [0, 1, 2].forEach(s => { if (online(s)) ask(s, { kind: 'buttons', title: '', sub: 'Et maintenant ?', options: options.map((o, i) => ({ v: i, label: o.label, cls: i === 0 ? 'primary' : 'ghost' })), after: 'Regarde l\'écran.' }, true).then(v => finish(+v)).catch(() => { }); });
      abortHooks.push(() => reject(new Aborted()));
      scrollEnd();
    });
  }
  function abortGame() { gen++; tvKey = null; currentGame = null; abortHooks.forEach(h => { try { h(); } catch (e) { } }); abortHooks = []; [0, 1, 2].forEach(i => { pending[i] = null; setBadge(i, ''); }); clearPads('BORNE', 'Choix du jeu en cours…'); $('#tv').classList.remove('alarm'); }

  /* ============================================================
     RENDU
     ============================================================ */
  const stage = $('#stage');
  let screenName = 'boot', currentGame = null;
  function show(name, html, hint) {
    screenName = name;
    stage.innerHTML = `<div class="sc screen-in">${html}</div>`;
    stage.scrollTop = 0;
    $('#hint').textContent = hint || 'ESPACE / ENTRÉE = suivant  ·  ÉCHAP = retour borne  ·  les téléphones peuvent aussi répondre';
  }
  function renderRoom() { $('#room').innerHTML = roomOpen ? `<span>SALLE</span><b>${CODE}</b><div class="miniqr">${qrSVG(joinURL(), 2)}</div>` : `<span class="blink">OUVERTURE DE LA SALLE…</span>`; }
  function qrSVG(text, cell) { try { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: cell || 4, margin: 0, scalable: true }); } catch (e) { return '<div style="color:#000;font-size:10px">QR indisponible</div>'; } }
  function renderSide() {
    const max = Math.max(...S.scores), a = amb();
    $('#side').innerHTML = [0, 1, 2].map(i => `<div class="badge ${online(i) ? 'on' : ''} ${S.scores[i] === max && max > 0 ? 'lead' : ''}" id="badge${i}">${avatar(i)}<div><div class="nm c${i}">${esc(P(i))}</div><div class="pt" id="pt${i}">${S.scores[i]}</div><div class="st">${online(i) ? 'MANETTE OK' : 'PAS CONNECTÉ'}</div></div><span class="dot"></span></div>`).join('')
      + `<div class="sidefoot">${S.stats.rounds} MANCHE${S.stats.rounds > 1 ? 'S' : ''} · ${S.setsPlayed} SET${S.setsPlayed > 1 ? 'S' : ''}<br><span class="tag" style="color:${a.color}">${a.icon} ${esc(a.name)}</span></div>`;
  }
  function setBadge(i, cls) { const b = $('#badge' + i); if (!b) return; b.classList.remove('waiting', 'done'); if (cls) b.classList.add(cls); }
  function shake() { const t = $('#tv'); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); }
  let toastT = null;
  function toast(msg) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2600); }

  /* ============================================================
     RUNTIME pour games.js
     ============================================================ */
  const R = {
    S, P, draw, isHot, esc, avatar, sleep, sfx: SFX, isWeb: true, save,
    aborted: () => false, shake, alarm: on => $('#tv').classList.toggle('alarm', !!on),
    show(html) { show('game', html, ''); },
    result(html) { const r = $('#result'); if (r) r.innerHTML = html; else $('#stage .sc').insertAdjacentHTML('beforeend', `<div id="result" class="stack">${html}</div>`); renderSide(); scrollEnd(); },
    progress(seats, label) { return `<div class="instr">${esc(label)}</div><div class="progress">${seats.map(s => `<div class="pp" id="pp${s}">${avatar(s)}<span class="px sm c${s}">${esc(P(s))}</span><span class="ok"></span></div>`).join('')}</div>`; },
    addPoints(i, n, label) { S.scores[i] += n; save(); const el = $('#pt' + i); if (el) { el.textContent = S.scores[i]; if (n) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } } return { i, n, label }; },
    ptsList(list) { return `<div class="pts">${list.map(p => `<div class="p ${p.n ? '' : 'zero'}">${avatar(p.i)}<span>${esc(P(p.i))} <span class="muted">· ${esc(p.label || '')}</span></span><span class="plus">${p.n ? '+' + p.n : '0'}</span></div>`).join('')}</div>`; },
    ask: (seat, prompt) => ask(seat, prompt), askAll, choice: tvChoice
  };
  R.countdown = s => countdown(R, s);

  async function runGame(g) {
    abortGame(); const myGen = gen; currentGame = g;
    if (!allOnline()) { toast('Il manque des manettes : ' + [0, 1, 2].filter(i => !online(i)).map(P).join(', ')); shake(); }
    if (S.ambiance === 'mix') S.mixApero = Math.random() < 0.5;
    R.aborted = () => gen !== myGen;
    try { await g.run(R, g); } catch (e) { if (!(e instanceof Aborted)) { console.error(e); toast('Oups : ' + e.message); } return; }
    if (gen !== myGen) return;
    S.lastGame = g.id; S.setsPlayed++; save(); renderSide();
    await endSet(g);
  }
  async function endSet(g) {
    const order = [0, 1, 2].slice().sort((a, b) => S.scores[b] - S.scores[a]);
    const lead = S.scores[order[0]] > S.scores[order[1]] ? `${P(order[0])} mène avec ${S.scores[order[0]]} pts` : 'Égalité en tête. Tendu.';
    const next = pickRandom(S.ambiance, g.id);
    SFX.fanfare();
    show('endset', `<div class="sc centered"><div class="hero" style="font-size:44px;color:${g.color};text-shadow:none">FIN DU SET</div><div class="instr">${esc(lead)}</div><div class="podium small">${[{ i: order[1], c: 'second', n: 2 }, { i: order[0], c: 'first', n: 1 }, { i: order[2], c: 'third', n: 3 }].map(s => `<div class="step ${s.c}">${avatar(s.i, s.n === 1 ? 'bounce' : '')}<div class="nm c${s.i}">${esc(P(s.i))}</div><div class="total">${S.scores[s.i]} pts</div><div class="box">${s.n}</div></div>`).join('')}</div><div class="instr">${esc(rnd(D.taunts.home))}</div></div>`);
    let c;
    try { c = await tvChoice([{ label: '🎲 AU HASARD : ' + next.name }, { label: '🔁 ENCORE ' + g.name, cls: '' }, { label: '🕹️ CHOISIR À LA BORNE' }, { label: '🏆 PODIUM' }]); } catch (e) { return; }
    if (c === 0) runGame(next); else if (c === 1) runGame(g); else if (c === 3) run(podium); else home();
  }
  async function run(fn) { abortGame(); const myGen = gen; try { await fn(); } catch (e) { if (!(e instanceof Aborted)) { console.error(e); toast('Oups : ' + e.message); } return; } if (gen === myGen) home(); }

  /* ============================================================
     LOBBY, AMBIANCE, BORNE
     ============================================================ */
  function lobby() {
    abortGame();
    const url = joinURL();
    show('lobby', `
      <div class="gname" style="color:var(--yellow)">SCANNEZ POUR PRENDRE UNE MANETTE</div>
      <div class="lobby">
        <div class="center"><div class="qrbox">${qrSVG(url, 4)}</div><div class="joinurl">${esc(url.replace(/^https?:\/\//, ''))}<b>CODE ${CODE}</b></div></div>
        <div class="seats">${[0, 1, 2].map(i => `<div class="seat ${online(i) ? 'on' : ''}">${avatar(i, online(i) ? 'bounce' : '')}<div><div class="nm c${i}">${online(i) ? esc(P(i)) : (S.players[i] ? esc(S.players[i]) : 'JOUEUR ' + (i + 1))}</div><div class="st">${online(i) ? '✓ CONNECTÉ' : (S.players[i] ? 'PAS ENCORE REVENU…' : 'EN ATTENTE…')}</div></div></div>`).join('')}
          <div class="instr">${allOnline() ? 'TOUT LE MONDE EST LÀ !' : 'Chacun ouvre le lien sur son téléphone et tape son prénom.'}</div>
        </div>
      </div>
      <div class="tvbtns"><button class="btn tvbtn primary big" id="golobby" ${allOnline() ? '' : 'disabled'}>${allOnline() ? (S.ambiance ? 'ALLER À LA BORNE ▶' : 'CHOISIR L\'AMBIANCE ▶') : 'EN ATTENTE DES 3 MANETTES'}</button><button class="btn tvbtn ghost" id="skiplobby">continuer quand même</button><button class="btn tvbtn ghost" id="newnight">👥 nouvelle soirée</button></div>
    `, 'les téléphones doivent avoir internet (wifi ou 4G) · ÉCHAP = borne');
    const go = () => { SFX.coin(); S.ambiance ? home() : ambianceScreen(true); };
    $('#golobby').onclick = go; $('#skiplobby').onclick = go; $('#newnight').onclick = () => newNight();
    tvKey = () => { if (allOnline()) go(); };
  }
  function ambianceScreen(first) {
    abortGame();
    show('ambiance', `<div class="hero" style="font-size:40px">QUELLE <span class="neon">SOIRÉE ?</span></div><div class="instr">Ça change les questions, les jeux proposés, et ce qui arrive aux perdants.</div>
      <div class="ambs">${Object.keys(D.ambiances).map(k => { const a = D.ambiances[k]; return `<button class="ambiance ${S.ambiance === k ? 'sel' : ''}" data-amb="${k}"><span class="ico">${a.icon}</span><span><div class="an" style="color:${a.color}">${esc(a.name)}</div><div class="ad">${esc(a.desc)}</div></span></button>`; }).join('')}</div>
      <div class="instr">🍻 apéro : celui qui perd boit · 🌶️ ça glisse : questions épicées · 🎲 mix : les deux, au hasard</div>${first ? '' : '<div class="tvbtns"><button class="btn tvbtn ghost" id="cancel">annuler</button></div>'}`, 'cliquez une ambiance · les manettes peuvent aussi choisir');
    const pick = k => { S.ambiance = k; save(); SFX.fanfare(); renderSide(); setTimeout(home, 250); };
    $$('[data-amb]').forEach(b => b.onclick = () => pick(b.dataset.amb));
    if ($('#cancel')) $('#cancel').onclick = () => home();
    const myGen = gen, opts = Object.keys(D.ambiances).map(k => ({ v: k, label: D.ambiances[k].icon + ' ' + D.ambiances[k].name }));
    [0, 1, 2].forEach(s => { if (online(s)) ask(s, { kind: 'buttons', title: 'Quelle soirée ?', sub: 'Le premier qui choisit l\'emporte', options: opts, after: 'Regarde l\'écran.' }, true).then(v => { if (gen === myGen && screenName === 'ambiance') pick(v); }).catch(() => { }); });
  }
  function home() {
    abortGame();
    const a = amb(), games = available(S.ambiance), byCat = {};
    games.forEach(g => (byCat[g.cat] = byCat[g.cat] || []).push(g));
    show('home', `
      <div class="hero" style="font-size:40px">PETIT <span class="neon">JUEGO</span></div>
      <div class="row" style="justify-content:center;gap:16px;flex-wrap:wrap"><button class="ambiance inline" data-g="ambiance"><span class="ico">${a.icon}</span><span><div class="an" style="color:${a.color}">SOIRÉE ${esc(a.name)}</div><div class="ad">${esc(a.desc)} · changer</div></span></button><button class="btn tvbtn yellow big" data-g="random">🎲 UN JEU AU HASARD</button></div>
      ${Object.keys(CATS).filter(c => byCat[c]).map(c => `<div class="catname">${CATS[c].icon} ${CATS[c].name}</div><div class="games">${byCat[c].map(g => `<button class="gcard ${g.cat === 'glisse' ? 'glisse' : 'g' + (g.n % 5)}" data-game="${g.id}"><span class="ico">${g.icon}</span><span><div class="gt">${esc(g.name)}</div><div class="gd">${esc(g.desc)}</div></span><span class="num">${String(g.n).padStart(2, '0')}</span></button>`).join('')}</div>`).join('')}
      <div class="tvbtns"><button class="btn tvbtn ghost" data-g="podium">🏆 PODIUM</button><button class="btn tvbtn ghost" data-g="lobby">📱 MANETTES (${[0, 1, 2].filter(online).length}/3)</button><button class="btn tvbtn ghost" data-g="custom">✏️ NOS QUESTIONS</button><button class="btn tvbtn ghost" data-g="settings">⚙️ RÉGLAGES</button><button class="btn tvbtn ghost" data-g="newnight">👥 NOUVELLE SOIRÉE</button></div>
    `, 'cliquez un jeu · les manettes peuvent aussi choisir');
    $$('[data-g]').forEach(b => b.onclick = () => go(b.dataset.g));
    $$('[data-game]').forEach(b => b.onclick = () => { const g = GAMES.find(x => x.id === b.dataset.game); if (g) { SFX.select(); runGame(g); } });
    const myGen = gen;
    const opts = [{ v: 'random', label: '🎲 Au hasard' }].concat(games.map(g => ({ v: g.id, label: g.icon + ' ' + g.name })));
    [0, 1, 2].forEach(s => { if (online(s)) ask(s, { kind: 'buttons', title: 'À LA BORNE', sub: 'Choisis un jeu (ou laissez l\'écran décider)', options: opts, after: 'Regarde l\'écran.' }, true).then(v => { if (gen !== myGen || screenName !== 'home') return; if (v === 'random') go('random'); else { const g = GAMES.find(x => x.id === v); if (g) runGame(g); } }).catch(() => { }); });
  }
  function go(g) {
    SFX.select();
    const map = { podium: () => run(podium), lobby, custom: () => run(custom), settings: () => run(settings), ambiance: () => ambianceScreen(false), newnight: () => newNight(), random: () => runGame(pickRandom(S.ambiance, S.lastGame)) };
    if (map[g]) map[g]();
  }
  function newNight(askConfirm) {
    if (askConfirm !== false && !confirm('Nouvelle soirée ? Les joueurs, les scores et les titres repartent de zéro.')) return;
    abortGame();
    [0, 1, 2].forEach(i => { sendTo(i, { t: 'kick', msg: 'Nouvelle soirée ! Retape ton prénom pour rejouer.' }); tokens[i] = null; });
    const d = defaultState(); S.players = d.players; S.scores = d.scores; S.stats = d.stats; S.turn = d.turn; S.ambiance = null; S.lastGame = null; S.setsPlayed = 0; save();
    setTimeout(() => { conns.forEach(c => { try { c && c.close(); } catch (e) { } }); conns.fill(null); renderSide(); lobby(); }, 150);
    SFX.back();
  }

  /* ============================================================
     PODIUM, NOS QUESTIONS, RÉGLAGES
     ============================================================ */
  async function podium() {
    const order = [0, 1, 2].slice().sort((a, b) => S.scores[b] - S.scores[a]), st = S.stats, awards = [];
    D.titles.forEach(t => { const arr = st[t.key]; if (!arr) return; const total = arr.reduce((a, b) => a + b, 0); if (!total) return; const val = t.mode === 'max' ? Math.max(...arr) : Math.min(...arr); const who = [0, 1, 2].filter(i => arr[i] === val); if (who.length === 1) awards.push({ t, who: who[0] }); });
    SFX.fanfare();
    show('podium', `<div class="hero" style="font-size:40px">🏆 PODIUM</div>
      <div class="podium">${[{ i: order[1], c: 'second', n: 2 }, { i: order[0], c: 'first', n: 1 }, { i: order[2], c: 'third', n: 3 }].map(s => `<div class="step ${s.c}">${avatar(s.i, s.n === 1 ? 'bounce' : '')}<div class="nm c${s.i}">${esc(P(s.i))}</div><div class="total">${S.scores[s.i]} pts</div><div class="box">${s.n}</div></div>`).join('')}</div>
      <div class="label center">TITRES DE LA SOIRÉE</div>
      ${awards.length ? `<div class="awards">${awards.map(a => `<div class="award"><span class="ico">${a.t.icon}</span><span><div class="nm">${esc(a.t.name)}</div><div class="ds">${esc(a.t.desc)}</div></span>${avatar(a.who)}</div>`).join('')}</div>` : '<div class="instr">Jouez quelques manches pour débloquer des titres.</div>'}`);
    clearPads('🏆 PODIUM', 'Regarde l\'écran.');
    const c = await tvChoice([{ label: 'RETOUR BORNE' }, { label: '🔄 SCORES À ZÉRO', cls: 'ghost' }, { label: '👥 NOUVELLE SOIRÉE', cls: 'ghost' }]);
    if (c === 1 && confirm('Remettre les scores et les titres à zéro ?')) { const d = defaultState(); S.scores = d.scores; S.stats = d.stats; S.turn = d.turn; S.setsPlayed = 0; save(); renderSide(); SFX.back(); }
    if (c === 2) { newNight(); throw new Aborted(); }
  }
  let customTab = 'qui';
  const TABS = { qui: 'QUI DE NOUS', cinq: '5 SECONDES', tete: 'DANS LA TÊTE', prefere: 'TU PRÉFÈRES' };
  const HINTS = { qui: 'Ex : Qui de nous a déjà pleuré devant Pékin Express ?', cinq: 'Ex : 3 surnoms qu\'on donne au plus petit du groupe', tete: 'Utilise {P} pour le prénom. Ex : Le pire achat de {P} ?', prefere: 'Sépare A et B par une barre |. Ex : Un mois sans sucre | Un mois sans sel' };
  async function custom() {
    const list = S.custom[customTab];
    show('custom', `<div class="gname">✏️ NOS QUESTIONS</div><div class="settings stack"><div class="muted">Vos private jokes, c'est là que ça devient drôle. Tout reste sur cet ordinateur.</div>
      <div class="row" style="flex-wrap:wrap">${Object.keys(TABS).map(k => `<button class="chip ${k === customTab ? 'on' : ''}" data-tab="${k}">${TABS[k]} (${S.custom[k].length})</button>`).join('')}</div>
      <div class="row"><input type="text" id="cq" maxlength="140" placeholder="${esc(HINTS[customTab])}" autocomplete="off"><button class="btn" id="cadd" style="width:auto">AJOUTER</button></div>
      <div class="list">${list.length ? list.map((q, i) => `<div class="it"><span>${esc(q)}</span><button class="del" data-del="${i}">✕</button></div>`).join('') : '<div class="muted center">Rien pour l\'instant.</div>'}</div></div>`, 'ÉCHAP = retour borne');
    $$('[data-tab]').forEach(b => b.onclick = () => { customTab = b.dataset.tab; custom(); });
    $$('[data-del]').forEach(b => b.onclick = () => { S.custom[customTab].splice(+b.dataset.del, 1); save(); custom(); });
    const add = () => { const v = $('#cq').value.trim(); if (!v) return shake(); if (customTab === 'prefere' && v.split('|').length !== 2) { shake(); toast('Il faut une barre | entre A et B'); return; } S.custom[customTab].push(v); save(); SFX.coin(); custom(); };
    $('#cadd').onclick = add; $('#cq').onkeydown = e => { if (e.key === 'Enter') add(); }; $('#cq').focus();
    await new Promise(() => { });
  }
  async function settings() {
    show('settings', `<div class="gname">⚙️ RÉGLAGES</div><div class="settings stack">
      <div class="label">JOUEURS</div><div class="muted">${[0, 1, 2].map(i => `<span class="c${i}">${esc(P(i))}</span>`).join(' · ')} — les prénoms sont choisis sur les téléphones.</div>
      <button class="btn primary" id="newnight">👥 NOUVELLE SOIRÉE (autres joueurs)</button>
      <div class="hr"></div>
      <div class="toggle"><span class="px sm">SON</span><button class="sw ${S.sound ? 'on' : ''}" id="swsound">${S.sound ? 'ON' : 'OFF'}</button></div>
      <div class="toggle"><span class="px sm">AMBIANCE ${amb().icon} ${esc(amb().name)}</span><button class="sw on" id="swamb">CHANGER</button></div>
      <div class="toggle"><span class="px sm">QUESTIONS 🌶️ MÊME EN MODE SOFT</span><button class="sw ${S.hot ? 'on' : ''}" id="swhot">${S.hot ? 'ON' : 'OFF'}</button></div>
      <div class="toggle"><span class="px sm">SALLE ${CODE}</span><button class="sw" id="newroom">NOUVEAU CODE</button></div>
      <div class="hr"></div>
      <button class="btn ghost" id="rused">♻️ REMETTRE TOUTES LES QUESTIONS DANS LE STOCK</button>
      <button class="btn ghost" id="rscores">🔄 SCORES ET TITRES À ZÉRO</button>
      <button class="btn ghost" id="rall" style="color:var(--red)">💣 TOUT EFFACER (y compris nos questions)</button>
      <div class="muted center">PETIT JUEGO WEB · zéro serveur, zéro tracking. Les téléphones parlent directement à cet écran (WebRTC).</div></div>`, 'ÉCHAP = retour borne');
    $('#newnight').onclick = () => newNight();
    $('#swsound').onclick = () => { S.sound = !S.sound; SFX.setOn(S.sound); save(); settings(); };
    $('#swamb').onclick = () => ambianceScreen(false);
    $('#swhot').onclick = () => { S.hot = !S.hot; save(); SFX.coin(); settings(); };
    $('#newroom').onclick = () => { CODE = genCode(); conns.forEach(c => { try { c && c.close(); } catch (e) { } }); openRoom(); lobby(); };
    $('#rused').onclick = () => { S.used = {}; save(); toast('Stock de questions réinitialisé'); };
    $('#rscores').onclick = () => { if (!confirm('Remettre les scores et les titres à zéro ?')) return; const d = defaultState(); S.scores = d.scores; S.stats = d.stats; S.turn = d.turn; S.setsPlayed = 0; save(); renderSide(); SFX.back(); home(); };
    $('#rall').onclick = () => { if (!confirm('Tout effacer, vraiment tout ?')) return; localStorage.removeItem(LS); S = defaultState(); R.S = S; renderSide(); SFX.ko(); newNight(false); };
    await new Promise(() => { });
  }

  /* ============================================================
     CLAVIER, BARRE, DÉMARRAGE
     ============================================================ */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { SFX.back(); home(); return; }
    if (e.target && e.target.tagName === 'INPUT') return;
    if ((e.key === ' ' || e.key === 'Enter') && tvKey) { e.preventDefault(); tvKey(); }
  });
  $('#btnHome').onclick = () => { SFX.back(); home(); };
  $('#btnSound').onclick = () => { S.sound = !S.sound; SFX.setOn(S.sound); save(); $('#btnSound').textContent = S.sound ? '♪' : '✕'; SFX.blip(); };
  $('#btnFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => { }); };
  document.addEventListener('click', () => SFX.ac(), { once: true });

  renderSide(); renderRoom();
  show('boot', `<div class="sc centered"><div class="hero">PETIT <span class="neon">JUEGO</span></div><div class="instr">3 JOUEURS · 3 TÉLÉPHONES · 1 ÉCRAN · ${GAMES.length} JEUX<br>Un jeu pour apprendre à se connaître, sans pitié.</div><button class="btn primary big tvbtn blink" id="pressstart">PRESS START</button></div>`, 'cliquez PRESS START (ou Espace)');
  const boot = () => { SFX.coin(); tvKey = null; lobby(); };
  $('#pressstart').onclick = boot; tvKey = boot;
  openRoom();
})();
