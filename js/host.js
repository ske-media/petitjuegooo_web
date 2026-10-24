/* ============================================================
   PETIT JUEGO WEB — l'écran de jeu (host)
   Le laptop est posé sur la table, tout le monde regarde l'écran,
   chacun joue avec son téléphone comme manette (WebRTC / PeerJS).
   ============================================================ */
(function () {
  'use strict';
  const D = window.DATA;
  const { esc, rnd, shuffle, others, sleep, $, $$, avatar, SFX, peerOpts, peerParam } = window.PJ;
  const LS = 'petitjuego_web_v1';

  /* ---------- état persistant ---------- */
  const defaultState = () => ({
    players: ['', '', ''], scores: [0, 0, 0], hot: false, sound: true,
    turn: { cinq: 0, tete: 0 },
    used: { qui: [], cinq: [], tete: [], prefere: [] },
    custom: { qui: [], cinq: [], tete: [], prefere: [] },
    stats: { ko: [0, 0, 0], lucid: [0, 0, 0], mental: [0, 0, 0], lieHidden: [0, 0, 0], lieDetect: [0, 0, 0], cinqOk: [0, 0, 0], cinqFail: [0, 0, 0], guessedOn: [0, 0, 0], rounds: 0 }
  });
  let S = load();
  function load() {
    try { const raw = localStorage.getItem(LS); if (!raw) return defaultState(); const s = JSON.parse(raw), d = defaultState();
      return Object.assign(d, s, { turn: Object.assign(d.turn, s.turn || {}), used: Object.assign(d.used, s.used || {}), custom: Object.assign(d.custom, s.custom || {}), stats: Object.assign(d.stats, s.stats || {}) }); } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } }
  SFX.setOn(S.sound);
  const P = i => S.players[i] || ('Joueur ' + (i + 1));

  function draw(game) {
    const base = D[game];
    let pool = base.soft.slice();
    if (S.hot && base.hot) pool = pool.concat(base.hot);
    const custom = (S.custom[game] || []).map(c => game === 'prefere' ? c.split('|').map(x => x.trim()) : c).filter(c => game !== 'prefere' || (c.length === 2 && c[0] && c[1]));
    pool = pool.concat(custom);
    const key = q => Array.isArray(q) ? q.join('|') : q;
    let fresh = pool.filter(q => !S.used[game].includes(key(q)));
    if (!fresh.length) { S.used[game] = []; fresh = pool; }
    const q = rnd(fresh); S.used[game].push(key(q)); save(); return q;
  }
  const isHot = (game, q) => { const k = Array.isArray(q) ? q.join('|') : q; return !!(D[game].hot && D[game].hot.some(h => (Array.isArray(h) ? h.join('|') : h) === k)); };

  /* ============================================================
     RÉSEAU — salle, manettes, invites
     ============================================================ */
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const genCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  let CODE = genCode(), peer = null, roomOpen = false;
  const conns = [null, null, null];       // seat -> DataConnection
  const tokens = [null, null, null];      // seat -> token du téléphone (pour reprendre sa place)
  const pending = [null, null, null];     // seat -> {id, prompt, resolve}
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
      conn.on('open', () => conn.send({ t: 'lobby', names: S.players, scores: S.scores, online: [0, 1, 2].filter(online) }));
    });
  }
  function onData(conn, m) {
    if (!m || !m.t) return;
    if (m.t === 'join') {
      const name = String(m.name || '').trim().slice(0, 12);
      let seat = tokens.indexOf(m.token);                       // même téléphone qui revient
      if (seat >= 0 && online(seat) && conns[seat] !== conn) { try { conns[seat].close(); } catch (e) { } conns[seat] = null; }
      if (seat < 0 && name) {
        const lower = name.toLowerCase();
        const dup = [0, 1, 2].find(i => online(i) && (S.players[i] || '').toLowerCase() === lower);
        if (dup !== undefined) { conn.send({ t: 'seat', ok: false, reason: 'Ce prénom est déjà pris sur une autre manette.', names: S.players, scores: S.scores }); return; }
        seat = [0, 1, 2].find(i => !online(i) && (S.players[i] || '').toLowerCase() === lower);   // reprend sa place après un reload de l'écran
        if (seat === undefined) seat = [0, 1, 2].find(i => !online(i) && !S.players[i]);            // place vide
        if (seat === undefined) seat = [0, 1, 2].find(i => !online(i));                             // place libérée par quelqu'un d'autre
        if (seat === undefined) { conn.send({ t: 'seat', ok: false, reason: 'La salle est pleine (3 joueurs max).', names: S.players, scores: S.scores }); return; }
      }
      if (seat < 0 || seat === undefined) { conn.send({ t: 'seat', ok: false, reason: 'Dis-nous ton prénom.', names: S.players, scores: S.scores }); return; }
      if (name) S.players[seat] = name;
      conns[seat] = conn; tokens[seat] = m.token; save();
      conn.send({ t: 'seat', ok: true, seat, names: S.players, scores: S.scores });
      SFX.join(); renderSide(); if (screenName === 'lobby') lobby();
      // il revient en cours de partie : on lui renvoie ce qu'on attend de lui
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
  /** Pose une question à une manette ; se résout avec la réponse (ou rejette si la partie est annulée). */
  function ask(seat, prompt, quiet) {
    const myGen = gen, id = ++pid;
    return new Promise((resolve, reject) => {
      pending[seat] = { id, prompt, resolve: v => { if (gen !== myGen) return reject(new Aborted()); resolve(v); }, reject };
      sendTo(seat, Object.assign({ t: 'prompt', id }, prompt));
      if (!quiet) setBadge(seat, 'waiting');
    }).then(v => { if (!quiet) setBadge(seat, 'done'); return v; });
  }
  function scrollResult() { const all = $$('#stage .tvbtns'); const r = all[all.length - 1] || $('#result'); if (r) setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50); }
  /** Pose une question à plusieurs manettes en même temps, avec progression sur l'écran. */
  async function askAll(seats, promptFn, onEach) {
    const out = {};
    await Promise.all(seats.map(s => ask(s, promptFn(s)).then(v => { out[s] = v; SFX.blip(); const el = $('#pp' + s); if (el) { el.classList.add('done'); $('.ok', el).textContent = 'OK'; } if (onEach) onEach(s, v); })));
    [0, 1, 2].forEach(i => setBadge(i, ''));
    return out;
  }
  /** Boutons sur l'écran (clic / Espace / Entrée) ET sur les 3 manettes : le premier qui répond gagne. */
  function tvChoice(options) {
    const myGen = gen;
    return new Promise((resolve, reject) => {
      const box = document.createElement('div'); box.className = 'tvbtns';
      box.innerHTML = options.map((o, i) => `<button class="btn tvbtn ${o.cls || (i === 0 ? 'primary' : 'ghost')}" data-i="${i}">${esc(o.label)}</button>`).join('');
      $('#stage .sc').appendChild(box);
      let done = false;
      const finish = i => { if (done || gen !== myGen) return; done = true; tvKey = null; [0, 1, 2].forEach(s => { pending[s] = null; }); clearPads('REGARDE L\'ÉCRAN', ''); SFX.select(); resolve(i); };
      $$('button', box).forEach(b => b.onclick = () => finish(+b.dataset.i));
      tvKey = () => finish(0);
      [0, 1, 2].forEach(s => { if (online(s)) ask(s, { kind: 'buttons', title: '', sub: 'Et maintenant ?', options: options.map((o, i) => ({ v: String(i), label: o.label, cls: i === 0 ? 'primary' : 'ghost' })), after: 'Regarde l\'écran.' }, true).then(v => finish(+v)).catch(() => { }); });
      scrollResult();
      abortHooks.push(() => reject(new Aborted()));
    });
  }
  let tvKey = null, abortHooks = [];
  function abortGame() { gen++; tvKey = null; abortHooks.forEach(h => { try { h(); } catch (e) { } }); abortHooks = []; [0, 1, 2].forEach(i => { pending[i] = null; setBadge(i, ''); }); clearPads('BORNE', 'Choix du jeu en cours…'); $('#tv').classList.remove('alarm'); }

  /** Nouvelle soirée : nouveaux joueurs, scores et titres à zéro, manettes renvoyées à l'écran prénom. */
  function newNight(ask) {
    if (ask !== false && !confirm('Nouvelle soirée ? Les joueurs, les scores et les titres repartent de zéro.')) return;
    abortGame();
    [0, 1, 2].forEach(i => { sendTo(i, { t: 'kick', msg: 'Nouvelle soirée ! Retape ton prénom pour rejouer.' }); tokens[i] = null; });
    const d = defaultState(); S.players = d.players; S.scores = d.scores; S.stats = d.stats; S.turn = d.turn; save();
    setTimeout(() => { conns.forEach(c => { try { c && c.close(); } catch (e) { } }); conns.fill(null); renderSide(); lobby(); }, 150);
    SFX.back();
  }

  /* ============================================================
     RENDU
     ============================================================ */
  const stage = $('#stage');
  let screenName = 'boot';
  function show(name, html, hint) {
    screenName = name;
    stage.innerHTML = `<div class="sc screen-in">${html}</div>`;
    $('#hint').textContent = hint || 'ESPACE / ENTRÉE = suivant  ·  ÉCHAP = retour borne  ·  les téléphones peuvent aussi répondre';
  }
  function renderRoom() {
    $('#room').innerHTML = roomOpen ? `<span>SALLE</span><b>${CODE}</b><div class="miniqr">${qrSVG(joinURL(), 2)}</div>` : `<span class="blink">OUVERTURE DE LA SALLE…</span>`;
  }
  function qrSVG(text, cell) {
    try { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: cell || 4, margin: 0, scalable: true }); } catch (e) { return '<div style="color:#000;font-size:10px">QR indisponible</div>'; }
  }
  function renderSide() {
    const max = Math.max(...S.scores);
    $('#side').innerHTML = [0, 1, 2].map(i => `<div class="badge ${online(i) ? 'on' : ''} ${S.scores[i] === max && max > 0 ? 'lead' : ''}" id="badge${i}">${avatar(i)}<div><div class="nm c${i}">${esc(P(i))}</div><div class="pt" id="pt${i}">${S.scores[i]}</div><div class="st">${online(i) ? 'MANETTE OK' : 'PAS CONNECTÉ'}</div></div><span class="dot"></span></div>`).join('')
      + `<div class="sidefoot">${S.stats.rounds} MANCHE${S.stats.rounds > 1 ? 'S' : ''}<br><span class="tag ${S.hot ? 'hot' : 'soft'}">${S.hot ? '🌶️ HOT' : 'SOFT'}</span></div>`;
  }
  function setBadge(i, cls) { const b = $('#badge' + i); if (!b) return; b.classList.remove('waiting', 'done'); if (cls) b.classList.add(cls); }
  function addPoints(i, n, label) { S.scores[i] += n; save(); const el = $('#pt' + i); if (el) { el.textContent = S.scores[i]; if (n) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } } return { i, n, label }; }
  function ptsList(list) { return `<div class="pts">${list.map(p => `<div class="p ${p.n ? '' : 'zero'}">${avatar(p.i)}<span>${esc(P(p.i))} <span class="muted">· ${esc(p.label || '')}</span></span><span class="plus">${p.n ? '+' + p.n : '0'}</span></div>`).join('')}</div>`; }
  function progress(seats, label) { return `<div class="instr">${esc(label)}</div><div class="progress">${seats.map(s => `<div class="pp" id="pp${s}">${avatar(s)}<span class="px sm c${s}">${esc(P(s))}</span><span class="ok"></span></div>`).join('')}</div>`; }
  function shake() { const t = $('#tv'); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); }
  let toastT = null;
  function toast(msg) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2600); }
  const seatButtons = (self, exclude) => [0, 1, 2].filter(i => !exclude || !exclude.includes(i)).map(i => ({ v: String(i), label: P(i), seat: i }));

  /* ============================================================
     LOBBY & ACCUEIL
     ============================================================ */
  function lobby() {
    const url = joinURL();
    show('lobby', `
      <div class="gname" style="color:var(--yellow)">SCANNEZ POUR PRENDRE UNE MANETTE</div>
      <div class="lobby">
        <div class="center"><div class="qrbox">${qrSVG(url, 4)}</div><div class="joinurl">${esc(url.replace(/^https?:\/\//, ''))}<b>CODE ${CODE}</b></div></div>
        <div class="seats">${[0, 1, 2].map(i => `<div class="seat ${online(i) ? 'on' : ''}">${avatar(i, online(i) ? 'bounce' : '')}<div><div class="nm c${i}">${online(i) ? esc(P(i)) : (S.players[i] ? esc(S.players[i]) : 'JOUEUR ' + (i + 1))}</div><div class="st">${online(i) ? '✓ CONNECTÉ' : (S.players[i] ? 'PAS ENCORE REVENU…' : 'EN ATTENTE…')}</div></div></div>`).join('')}
          <div class="instr">${allOnline() ? 'TOUT LE MONDE EST LÀ !' : 'Chacun ouvre le lien sur son téléphone et tape son prénom.'}</div>
        </div>
      </div>
      <div class="tvbtns"><button class="btn tvbtn primary big" id="golobby" ${allOnline() ? '' : 'disabled'}>${allOnline() ? 'ALLER À LA BORNE ▶' : 'EN ATTENTE DES 3 MANETTES'}</button><button class="btn tvbtn ghost" id="skiplobby">continuer quand même</button><button class="btn tvbtn ghost" id="newnight">👥 nouvelle soirée</button></div>
    `, 'les téléphones doivent être sur le même réseau ou avec de la 4G · ÉCHAP = borne');
    $('#golobby').onclick = () => { SFX.coin(); home(); };
    $('#skiplobby').onclick = () => { SFX.coin(); home(); };
    $('#newnight').onclick = newNight;
    tvKey = () => { if (allOnline()) home(); };
  }
  function home() {
    abortGame();
    show('home', `
      <div class="hero">PETIT <span class="neon">JUEGO</span></div>
      <div class="instr">${esc(rnd(D.taunts.home))}</div>
      <div class="games">
        <button class="gcard g0" data-g="g1"><span class="ico">🎯</span><span><div class="gt">QUI DE NOUS 3 ?</div><div class="gd">Vote, parie, assume.</div></span><span class="num">01</span></button>
        <button class="gcard g1" data-g="g2"><span class="ico">⏱️</span><span><div class="gt">5 SECONDES CHRONO</div><div class="gd">3 réponses, 5 secondes, pas de pitié.</div></span><span class="num">02</span></button>
        <button class="gcard g2" data-g="g3"><span class="ico">🤥</span><span><div class="gt">MENTEUR !</div><div class="gd">2 vérités, 1 mensonge, démasque.</div></span><span class="num">03</span></button>
        <button class="gcard g3" data-g="g4"><span class="ico">🧠</span><span><div class="gt">DANS LA TÊTE DE…</div><div class="gd">Devine ce qu'il va répondre.</div></span><span class="num">04</span></button>
        <button class="gcard g4" data-g="g5"><span class="ico">⚖️</span><span><div class="gt">TU PRÉFÈRES ?</div><div class="gd">Dilemmes impossibles et prédictions.</div></span><span class="num">05</span></button>
        <button class="gcard" data-g="podium"><span class="ico">🏆</span><span><div class="gt">PODIUM</div><div class="gd">Classement et titres de la soirée.</div></span></button>
      </div>
      <div class="tvbtns"><button class="btn tvbtn ghost" data-g="lobby">📱 MANETTES (${[0, 1, 2].filter(online).length}/3)</button><button class="btn tvbtn ghost" data-g="hot">${S.hot ? '🌶️ HOT : ON' : 'HOT : OFF'}</button><button class="btn tvbtn ghost" data-g="custom">✏️ NOS QUESTIONS</button><button class="btn tvbtn ghost" data-g="settings">⚙️ RÉGLAGES</button><button class="btn tvbtn ghost" data-g="newnight">👥 NOUVELLE SOIRÉE</button></div>
    `, 'cliquez un jeu · les manettes peuvent aussi choisir');
    $$('[data-g]').forEach(b => b.onclick = () => go(b.dataset.g));
    // les téléphones peuvent choisir le jeu
    const opts = [['g1', '🎯 Qui de nous 3 ?'], ['g2', '⏱️ 5 secondes'], ['g3', '🤥 Menteur !'], ['g4', '🧠 Dans la tête de…'], ['g5', '⚖️ Tu préfères ?'], ['podium', '🏆 Podium']];
    const myGen = gen;
    [0, 1, 2].forEach(s => { if (online(s)) ask(s, { kind: 'buttons', title: 'À LA BORNE', sub: 'Choisis un jeu (ou laissez l\'écran décider)', options: opts.map(o => ({ v: o[0], label: o[1] })), after: 'Regarde l\'écran.' }, true).then(v => { if (gen === myGen && screenName === 'home') go(v); }).catch(() => { }); });
  }
  function go(g) {
    SFX.select();
    const map = { g1: game1, g2: game2, g3: game3, g4: game4, g5: game5, podium, lobby, custom, settings, newnight: () => newNight(), hot: () => { S.hot = !S.hot; save(); SFX.coin(); renderSide(); home(); } };
    if (!map[g]) return;
    if (['g1', 'g2', 'g3', 'g4', 'g5'].includes(g) && !allOnline()) { toast('Il manque des manettes : ' + [0, 1, 2].filter(i => !online(i)).map(P).join(', ')); shake(); }
    run(map[g]);
  }
  async function run(fn) {
    abortGame(); const myGen = gen;
    try { await fn(); } catch (e) { if (!(e instanceof Aborted)) { console.error(e); toast('Oups : ' + e.message); } return; }
    if (gen === myGen) home();
  }

  /* ============================================================
     JEU 1 — QUI DE NOUS 3 ?
     ============================================================ */
  async function game1() {
    while (true) {
      const q = draw('qui'), hot = isHot('qui', q);
      show('g1', `<div class="gname c0">🎯 QUI DE NOUS 3 ?</div><div class="panel neon"><div class="bigq">${hot ? '🌶️ ' : ''}${esc(q)}</div></div>${progress([0, 1, 2], 'VOTEZ SUR VOS TÉLÉPHONES — EN SECRET')}`);
      const votes = await askAll([0, 1, 2], s => ({ kind: 'buttons', title: q, sub: 'Ton vote (toi compris)', hot, options: seatButtons(s), after: 'Vote enregistré. Maintenant, le pari…' }));
      show('g1', `<div class="gname c0">🎯 QUI DE NOUS 3 ?</div><div class="panel"><div class="bigq sm">${esc(q)}</div></div>${progress([0, 1, 2], 'VOTES VERROUILLÉS. MAINTENANT, PARIEZ : QUI VA ÊTRE DÉSIGNÉ ?')}`);
      const bets = await askAll([0, 1, 2], s => ({ kind: 'buttons', title: 'Qui va être désigné ?', sub: 'Ton pari', options: seatButtons(s), after: 'Pari pris. Regarde l\'écran.' }));
      const v = [0, 1, 2].map(i => +votes[i]), b = [0, 1, 2].map(i => +bets[i]);
      const counts = [0, 0, 0]; v.forEach(x => counts[x]++);
      const max = Math.max(...counts), tie = max === 1, ko = tie ? null : counts.indexOf(max);
      S.stats.rounds++;
      show('g1', `<div class="panel"><div class="bigq sm">${esc(q)}</div></div><div class="instr blink">DÉPOUILLEMENT…</div>
        <div class="votes">${[0, 1, 2].map(i => `<div class="vrow" id="vr${i}">${avatar(i)}<span class="txt">${esc(P(i))}</span><span class="arrow">▶</span>${avatar(v[i])}<span class="txt c${v[i]}">${esc(P(v[i]))}</span></div>`).join('')}</div><div id="result" class="stack"></div>`, '');
      for (let i = 0; i < 3; i++) { await sleep(650); $('#vr' + i).classList.add('in'); SFX.drum(); }
      await sleep(600);
      const pts = [];
      if (tie) {
        SFX.fail();
        [0, 1, 2].forEach(i => pts.push({ i, n: 0, label: 'a parié ' + P(b[i]) }));
        $('#result').innerHTML = `<div class="panel yellow center"><div class="px xl">ÉGALITÉ</div><div class="muted">${esc(rnd(D.taunts.tie))}</div></div>${ptsList(pts)}`;
      } else {
        SFX.ko(); shake(); S.stats.ko[ko]++;
        [0, 1, 2].forEach(i => { let n = 0, lab = 'a parié ' + P(b[i]); if (b[i] === ko) { n += 1; S.stats.mental[i]++; lab = 'bon pari'; } if (i === ko && v[i] === i) { n += 2; S.stats.lucid[i]++; lab += ' + lucidité'; } pts.push(addPoints(i, n, lab)); });
        const lucid = v[ko] === ko;
        $('#result').innerHTML = `<div class="tally">${[0, 1, 2].map(i => `<div class="t ${i === ko ? 'win' : ''}">${avatar(i)}<div class="n">${counts[i]}</div></div>`).join('')}</div>
          <div class="ko">K.O.</div><div class="center">${avatar(ko, 'glitch', 'style="width:110px;height:110px"')}<div class="px xl c${ko}">${esc(P(ko))}</div><div class="muted">${esc(lucid ? rnd(D.taunts.lucid) : rnd(D.taunts.ko))}</div></div>${ptsList(pts)}`;
      }
      save(); renderSide();
      if (await tvChoice([{ label: 'MANCHE SUIVANTE' }, { label: 'RETOUR BORNE' }]) === 1) return;
    }
  }

  /* ============================================================
     JEU 2 — 5 SECONDES CHRONO
     ============================================================ */
  async function game2() {
    while (true) {
      const p = S.turn.cinq % 3; let q = draw('cinq');
      show('g2', `<div class="gname" style="color:var(--red)">⏱️ 5 SECONDES CHRONO</div><div class="sc centered">${avatar(p, 'bounce', 'style="width:140px;height:140px"')}<div class="px xl c${p}">${esc(P(p))}</div><div class="instr">Appuie sur START sur ton téléphone.<br>La consigne apparaît, tu as 5 secondes pour citer 3 réponses.</div><div class="panel red" style="min-width:420px"><div class="bigq">? ? ?</div><div class="instr">${isHot('cinq', q) ? '🌶️ consigne épicée' : 'consigne cachée'}</div></div></div>`, 'ESPACE = start aussi');
      const started = new Promise(res => { tvKey = () => res('go'); ask(p, { kind: 'start', title: 'À TOI DE JOUER', sub: 'Appuie quand tu es prêt.' }).then(res).catch(() => { }); });
      await started; if (!running()) return; tvKey = null; pending[p] = null;
      const total = 5000;
      show('g2', `<div class="panel red"><div class="label">CITE…</div><div class="bigq">${esc(q)}</div></div><div class="timer" id="tm">5</div><div class="tbar" id="tb"><div style="width:100%"></div></div><div class="instr">${esc(P(p))} parle, les deux autres comptent.</div>`, '');
      SFX.tick();
      const start = Date.now(); let lastSec = 5;
      await new Promise(res => { const iv = setInterval(() => {
        const left = Math.max(0, total - (Date.now() - start)), sec = Math.ceil(left / 1000), tm = $('#tm'), tb = $('#tb');
        if (!tm || !running()) { clearInterval(iv); return res(); }
        tm.textContent = sec; tb.firstElementChild.style.width = (left / total * 100) + '%';
        if (sec !== lastSec) { lastSec = sec; if (sec > 0) (sec <= 2 ? SFX.tock : SFX.tick)(); }
        if (left <= 2000) { tm.classList.add('warn'); tb.classList.add('warn'); }
        if (left <= 0) { clearInterval(iv); $('#tv').classList.add('alarm'); SFX.alarm(); shake(); setTimeout(res, 900); }
      }, 50); });
      $('#tv').classList.remove('alarm'); if (!running()) return;
      const judges = others(p);
      show('g2', `<div class="panel"><div class="bigq sm">${esc(q)}</div></div><div class="px xl center" style="color:var(--red)">STOP !</div>${progress(judges, 'LES JUGES VOTENT SUR LEURS TÉLÉPHONES')}<div class="tvbtns" id="tvj"><button class="btn tvbtn green" data-j="2">👍 RÉUSSI +2</button><button class="btn tvbtn yellow" data-j="1">🤏 PRESQUE +1</button><button class="btn tvbtn red" data-j="0">👎 RATÉ 0</button></div>`, 'les juges décident · l\'écran peut trancher aussi');
      const verdict = await new Promise((res, rej) => {
        abortHooks.push(() => rej(new Aborted()));
        $$('[data-j]').forEach(b => b.onclick = () => res(+b.dataset.j));
        askAll(judges, () => ({ kind: 'buttons', title: 'Verdict pour ' + P(p), sub: 'Il a cité 3 réponses à temps ?', options: [{ v: '2', label: '👍 RÉUSSI +2', cls: 'green' }, { v: '1', label: '🤏 PRESQUE +1', cls: 'yellow' }, { v: '0', label: '👎 RATÉ 0', cls: 'red' }], after: 'Verdict envoyé.' }))
          .then(r => { const a = +r[judges[0]], c = +r[judges[1]]; res(Math.round((a + c) / 2)); }).catch(() => { });
      });
      [0, 1, 2].forEach(i => { pending[i] = null; setBadge(i, ''); }); clearPads('REGARDE L\'ÉCRAN', '');
      const n = verdict;
      if (n === 2) { S.stats.cinqOk[p]++; SFX.win(); } else if (n === 0) { S.stats.cinqFail[p]++; SFX.fail(); } else SFX.select();
      S.stats.rounds++; S.turn.cinq++; addPoints(p, n); save(); renderSide();
      show('g2', `<div class="sc centered">${avatar(p, n ? 'bounce' : '', 'style="width:140px;height:140px"')}<div class="px xl c${p}">${esc(P(p))}</div><div class="hero" style="font-size:72px;color:${n ? 'var(--green)' : 'var(--red)'};text-shadow:none">+${n}</div><div class="instr">${esc(n ? rnd(D.taunts.timerOk) : rnd(D.taunts.timerFail))}</div></div>`);
      if (await tvChoice([{ label: 'AU TOUR DE ' + P(S.turn.cinq % 3).toUpperCase() }, { label: 'RETOUR BORNE' }]) === 1) return;
    }
  }
  function running() { return screenName !== 'home'; }

  /* ============================================================
     JEU 3 — MENTEUR !
     ============================================================ */
  async function game3() {
    while (true) {
      show('g3', `<div class="gname" style="color:var(--green)">🤥 MENTEUR !</div><div class="panel green"><div class="bigq sm">Sur vos téléphones : écrivez 2 vérités et 1 mensonge sur vous.<br>Marquez la fausse. Soyez crédibles.</div></div>${progress([0, 1, 2], 'EN TRAIN D\'ÉCRIRE…')}`);
      const sets = await askAll([0, 1, 2], s => ({ kind: 'lie', title: '2 vérités, 1 mensonge', inspi: shuffle(D.menteur.inspi).slice(0, 3) }));
      for (const a of [0, 1, 2]) {
        const set = sets[a], order = shuffle([0, 1, 2]), guessers = others(a);
        show('g3', `<div class="center">${avatar(a, '', 'style="width:90px;height:90px"')}<div class="px xl c${a}">${esc(P(a))} DIT :</div></div><div class="stmts">${order.map(k => `<div class="stmt">${esc(set.st[k])}</div>`).join('')}</div>${progress(guessers, 'LEQUEL EST LE MENSONGE ? VOTEZ SUR VOS TÉLÉPHONES')}`);
        await sleep(300);
        const picks = await askAll(guessers, () => ({ kind: 'statements', title: P(a) + ' dit…', items: order.map(k => ({ k, text: set.st[k] })) }));
        const found = guessers.filter(g => +picks[g] === set.lie);
        const pts = [];
        const authorPts = found.length === 0 ? 2 : found.length === 1 ? 1 : 0;
        if (found.length === 0) S.stats.lieHidden[a]++;
        pts.push(addPoints(a, authorPts, found.length === 0 ? 'personne ne l\'a vu' : found.length === 1 ? 'un seul a vu' : 'démasqué par tous'));
        guessers.forEach(g => { if (+picks[g] === set.lie) { S.stats.lieDetect[g]++; pts.push(addPoints(g, 1, 'a démasqué')); } else pts.push(addPoints(g, 0, 'a cru une vérité')); });
        S.stats.rounds++; save(); renderSide();
        // révélation progressive
        show('g3', `<div class="px xl center" style="color:var(--red)">LE MENSONGE…</div><div class="stmts">${order.map((k, pos) => `<div class="stmt" id="sm${pos}">${esc(set.st[k])}<div class="who">${guessers.filter(g => +picks[g] === k).map(g => P(g)).join(', ') || '—'}</div></div>`).join('')}</div><div id="result" class="stack"></div>`, '');
        await sleep(900); SFX.drum(); await sleep(900);
        order.forEach((k, pos) => { const el = $('#sm' + pos); el.classList.add(k === set.lie ? 'lie' : 'truth'); $('.who', el).textContent = (k === set.lie ? '❌ FAUX · ' : '✅ VRAI · ') + $('.who', el).textContent; });
        if (found.length === 2) SFX.fail(); else SFX.win();
        $('#result').innerHTML = `<div class="instr">${esc(found.length === 0 ? rnd(D.taunts.lieHidden) : found.length === 2 ? rnd(D.taunts.lieFound) : 'Un sur deux. Moyen.')}</div>${ptsList(pts)}`;
        const c = await tvChoice([{ label: a < 2 ? 'AU TOUR DE ' + P(a + 1).toUpperCase() : 'TERMINER LA MANCHE' }, { label: 'RETOUR BORNE' }]);
        if (c === 1) return;
      }
      SFX.fanfare();
      show('g3', `<div class="sc centered"><div class="hero" style="font-size:48px">FIN DE LA MANCHE</div><div class="instr">Vous vous connaissez un peu mieux. Ou pas.</div></div>`);
      if (await tvChoice([{ label: 'REJOUER' }, { label: 'RETOUR BORNE' }]) === 1) return;
    }
  }

  /* ============================================================
     JEU 4 — DANS LA TÊTE DE…
     ============================================================ */
  async function game4() {
    while (true) {
      const seat = S.turn.tete % 3, raw = draw('tete'), q = raw.replace(/\{P\}/g, P(seat)), hot = isHot('tete', raw), guessers = others(seat);
      show('g4', `<div class="gname" style="color:var(--pink)">🧠 DANS LA TÊTE DE ${esc(P(seat)).toUpperCase()}</div><div class="panel pink"><div class="bigq">${hot ? '🌶️ ' : ''}${esc(q)}</div></div>${progress([0, 1, 2], P(seat) + ' RÉPOND EN SECRET · LES DEUX AUTRES DEVINENT SA RÉPONSE')}`);
      const res = await askAll([0, 1, 2], s => s === seat
        ? { kind: 'text', title: q, sub: 'Ta vraie réponse (secrète)', hot, placeholder: 'Réponds honnêtement…', after: 'Réponse enregistrée. On va voir s\'ils te connaissent.' }
        : { kind: 'text', title: q, sub: 'Qu\'a répondu ' + P(seat) + ' ?', hot, placeholder: 'Ta prédiction…', after: 'Prédiction envoyée.' });
      const [a, b] = guessers;
      show('g4', `<div class="panel"><div class="bigq sm">${esc(q)}</div></div><div class="answers">
        <div class="answer" id="an${a}">${avatar(a)}<span class="who c${a}">${esc(P(a))} PENSAIT</span><span class="txt">${esc(res[a])}</span></div>
        <div class="answer" id="an${b}">${avatar(b)}<span class="who c${b}">${esc(P(b))} PENSAIT</span><span class="txt">${esc(res[b])}</span></div>
        <div class="answer seat hidden-txt" id="anS">${avatar(seat)}<span class="who c${seat}">${esc(P(seat))} A RÉPONDU</span><span class="txt">${esc(res[seat])}</span></div></div>
        <div id="result" class="stack">${progress([seat], P(seat) + ' DÉSIGNE LE PLUS PROCHE SUR SON TÉLÉPHONE')}</div>`, '');
      await sleep(1800); $('#anS').classList.remove('hidden-txt'); SFX.coin();
      const who = await ask(seat, { kind: 'buttons', title: 'Qui était le plus proche ?', sub: 'Ta réponse : ' + res[seat], options: [{ v: String(a), label: P(a), seat: a }, { v: String(b), label: P(b), seat: b }, { v: 'both', label: 'LES DEUX +1 CHACUN', cls: 'yellow' }, { v: 'none', label: 'PERSONNE. JE SUIS UNE ÉNIGME.', cls: 'ghost' }], after: 'Verdict envoyé.' });
      const pts = [];
      if (who === 'both') { pts.push(addPoints(a, 1, 'bien vu'), addPoints(b, 1, 'bien vu')); S.stats.mental[a]++; S.stats.mental[b]++; S.stats.guessedOn[seat] += 2; SFX.win(); }
      else if (who === 'none') { pts.push(addPoints(seat, 1, 'énigme vivante'), addPoints(a, 0, 'à côté'), addPoints(b, 0, 'à côté')); SFX.fail(); }
      else { const w = +who, l = w === a ? b : a; pts.push(addPoints(w, 2, 'dans sa tête'), addPoints(l, 0, 'à côté')); S.stats.mental[w]++; S.stats.guessedOn[seat]++; SFX.win(); }
      S.stats.rounds++; S.turn.tete++; save(); renderSide();
      $('#result').innerHTML = ptsList(pts);
      if (await tvChoice([{ label: 'SELLETTE : ' + P(S.turn.tete % 3).toUpperCase() }, { label: 'RETOUR BORNE' }]) === 1) return;
    }
  }

  /* ============================================================
     JEU 5 — TU PRÉFÈRES ?
     ============================================================ */
  async function game5() {
    while (true) {
      const d = draw('prefere'), hot = isHot('prefere', d);
      show('g5', `<div class="gname" style="color:var(--yellow)">⚖️ TU PRÉFÈRES ?</div><div class="ab"><div class="opt a"><span class="l">A</span>${esc(d[0])}</div><div class="opt b"><span class="l">B</span>${esc(d[1])}</div></div>${progress([0, 1, 2], 'CHOISISSEZ, ET PRÉDISEZ LE CHOIX DES DEUX AUTRES')}`);
      const r = await askAll([0, 1, 2], s => ({ kind: 'ab', title: 'Tu préfères…', hot, a: d[0], b: d[1], predict: others(s).map(o => ({ seat: o, name: P(o) })), after: 'C\'est noté. Regarde l\'écran.' }));
      const picks = [0, 1, 2].map(i => r[i].pick);
      const pts = [];
      [0, 1, 2].forEach(i => { let ok = 0; others(i).forEach(o => { if (r[i].preds[o] === picks[o]) { ok++; S.stats.guessedOn[o]++; } }); if (ok) S.stats.mental[i] += ok; pts.push(addPoints(i, ok + (ok === 2 ? 1 : 0), ok === 2 ? 'les deux + bonus' : ok === 1 ? 'une bonne' : 'à côté')); });
      const unanimous = picks.every(p => p === picks[0]);
      S.stats.rounds++; save(); renderSide();
      show('g5', `<div class="ab"><div class="opt a"><span class="l">A</span>${esc(d[0])}<div class="who" id="whoA"></div></div><div class="opt b"><span class="l">B</span>${esc(d[1])}<div class="who" id="whoB"></div></div></div><div id="result" class="stack"></div>`, '');
      for (const i of [0, 1, 2]) { await sleep(700); $(picks[i] === 0 ? '#whoA' : '#whoB').insertAdjacentHTML('beforeend', avatar(i, 'screen-in')); SFX.drum(); }
      await sleep(500); SFX.coin();
      $('#result').innerHTML = `${unanimous ? '<div class="px center" style="color:var(--yellow)">UNANIMITÉ. VOUS ÊTES LE MÊME CERVEAU.</div>' : ''}${ptsList(pts)}`;
      if (await tvChoice([{ label: 'DILEMME SUIVANT' }, { label: 'RETOUR BORNE' }]) === 1) return;
    }
  }

  /* ============================================================
     PODIUM
     ============================================================ */
  async function podium() {
    const order = [0, 1, 2].sort((a, b) => S.scores[b] - S.scores[a]), st = S.stats, awards = [];
    D.titles.forEach(t => { const arr = st[t.key]; if (!arr) return; const total = arr.reduce((a, b) => a + b, 0); if (!total) return; const val = t.mode === 'max' ? Math.max(...arr) : Math.min(...arr); const who = [0, 1, 2].filter(i => arr[i] === val); if (who.length === 1) awards.push({ t, who: who[0] }); });
    SFX.fanfare();
    show('podium', `<div class="hero" style="font-size:40px">🏆 PODIUM</div>
      <div class="podium">${[{ i: order[1], c: 'second', n: 2 }, { i: order[0], c: 'first', n: 1 }, { i: order[2], c: 'third', n: 3 }].map(s => `<div class="step ${s.c}">${avatar(s.i, s.n === 1 ? 'bounce' : '')}<div class="nm c${s.i}">${esc(P(s.i))}</div><div class="total">${S.scores[s.i]} pts</div><div class="box">${s.n}</div></div>`).join('')}</div>
      <div class="label center">TITRES DE LA SOIRÉE</div>
      ${awards.length ? `<div class="awards">${awards.map(a => `<div class="award"><span class="ico">${a.t.icon}</span><span><div class="nm">${esc(a.t.name)}</div><div class="ds">${esc(a.t.desc)}</div></span>${avatar(a.who)}</div>`).join('')}</div>` : '<div class="instr">Jouez quelques manches pour débloquer des titres.</div>'}`);
    clearPads('🏆 PODIUM', 'Regarde l\'écran.');
    const c = await tvChoice([{ label: 'RETOUR BORNE' }, { label: '🔄 SCORES À ZÉRO', cls: 'ghost' }, { label: '👥 NOUVELLE SOIRÉE', cls: 'ghost' }]);
    if (c === 1 && confirm('Remettre les scores et les titres à zéro ?')) { const d = defaultState(); S.scores = d.scores; S.stats = d.stats; S.turn = d.turn; save(); renderSide(); SFX.back(); }
    if (c === 2) { newNight(); throw new Aborted(); }
  }

  /* ============================================================
     NOS QUESTIONS & RÉGLAGES
     ============================================================ */
  let customTab = 'qui';
  const TABS = { qui: 'QUI DE NOUS 3', cinq: '5 SECONDES', tete: 'DANS LA TÊTE', prefere: 'TU PRÉFÈRES' };
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
    await new Promise(() => { }); // on reste là jusqu'à ÉCHAP
  }
  async function settings() {
    show('settings', `<div class="gname">⚙️ RÉGLAGES</div><div class="settings stack">
      <div class="label">JOUEURS</div><div class="muted">${[0, 1, 2].map(i => `<span class="c${i}">${esc(P(i))}</span>`).join(' · ')} — les prénoms sont choisis sur les téléphones.</div>
      <button class="btn primary" id="newnight">👥 NOUVELLE SOIRÉE (autres joueurs)</button>
      <div class="hr"></div>
      <div class="toggle"><span class="px sm">SON</span><button class="sw ${S.sound ? 'on' : ''}" id="swsound">${S.sound ? 'ON' : 'OFF'}</button></div>
      <div class="toggle"><span class="px sm">MODE HOT 🌶️</span><button class="sw ${S.hot ? 'on' : ''}" id="swhot">${S.hot ? 'ON' : 'OFF'}</button></div>
      <div class="toggle"><span class="px sm">SALLE ${CODE}</span><button class="sw" id="newroom">NOUVEAU CODE</button></div>
      <div class="hr"></div>
      <button class="btn ghost" id="rused">♻️ REMETTRE TOUTES LES QUESTIONS DANS LE STOCK</button>
      <button class="btn ghost" id="rscores">🔄 SCORES ET TITRES À ZÉRO</button>
      <button class="btn ghost" id="rall" style="color:var(--red)">💣 TOUT EFFACER (y compris nos questions)</button>
      <div class="muted center">PETIT JUEGO WEB · zéro serveur, zéro tracking. Les téléphones parlent directement à cet écran (WebRTC).</div></div>`, 'ÉCHAP = retour borne');
    $('#newnight').onclick = () => newNight();
    $('#swsound').onclick = () => { S.sound = !S.sound; SFX.setOn(S.sound); save(); settings(); };
    $('#swhot').onclick = () => { S.hot = !S.hot; save(); SFX.coin(); renderSide(); settings(); };
    $('#newroom').onclick = () => { CODE = genCode(); conns.forEach(c => { try { c && c.close(); } catch (e) { } }); openRoom(); lobby(); };
    $('#rused').onclick = () => { S.used = { qui: [], cinq: [], tete: [], prefere: [] }; save(); toast('Stock de questions réinitialisé'); };
    $('#rscores').onclick = () => { if (!confirm('Remettre les scores et les titres à zéro ?')) return; const d = defaultState(); S.scores = d.scores; S.stats = d.stats; S.turn = d.turn; save(); renderSide(); SFX.back(); home(); };
    $('#rall').onclick = () => { if (!confirm('Tout effacer, vraiment tout ?')) return; localStorage.removeItem(LS); S = defaultState(); renderSide(); SFX.ko(); home(); };
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
  show('boot', `<div class="sc centered"><div class="hero">PETIT <span class="neon">JUEGO</span></div><div class="instr">3 JOUEURS · 3 TÉLÉPHONES · 1 ÉCRAN<br>Un jeu pour apprendre à se connaître, sans pitié.</div><button class="btn primary big tvbtn blink" id="pressstart">PRESS START</button></div>`, 'cliquez PRESS START (ou Espace)');
  const boot = () => { SFX.coin(); tvKey = null; lobby(); };
  $('#pressstart').onclick = boot; tvKey = boot;
  openRoom();
})();
