/* ============================================================
   PETIT JUEGO — les 20 mini-jeux, écrits une seule fois.
   Chaque jeu est une fonction async qui joue UN SET, en s'appuyant
   sur un runtime R (téléphone passé ou écran + manettes) :
     R.P(i) nom · R.S état · R.draw(jeu) · R.isHot(jeu, q)
     R.show(html) écran principal · R.result(html) zone de résultat
     R.ask(seat, prompt) · R.askAll(seats, fn) · R.choice([{label}])
     R.addPoints(i, n, label) · R.ptsList · R.progress · R.avatar
     R.sleep · R.sfx · R.shake() · R.alarm(on) · R.esc · R.isWeb
   ============================================================ */
(function () {
  'use strict';
  const D = window.DATA;
  const { esc, rnd, shuffle, others } = window.PJ;

  /* ---------- helpers ---------- */
  const seatBtns = (R, self, exclude) => [0, 1, 2].filter(i => !exclude || !exclude.includes(i)).map(i => ({ v: i, label: R.P(i), seat: i }));
  const isApero = R => R.S.ambiance === 'apero' || (R.S.ambiance === 'mix' && R.S.mixApero);
  /** Sanctions apéro : ceux qui ont marqué 0 boivent (ou les perdants donnés). */
  function drinks(R, losers) {
    if (!isApero(R) || !losers.length) return '';
    losers.forEach(i => { R.S.stats.sips[i] = (R.S.stats.sips[i] || 0) + 1; });
    return `<div class="sips">🍻 ${losers.map(i => esc(rnd(D.sips).replace('{P}', R.P(i)))).join(' ')}</div>`;
  }
  const zeroes = pts => pts.filter(p => !p.n).map(p => p.i);
  /** Classement réflexes : +2 au premier, +1 au deuxième (égalités partagées). */
  function rankPoints(R, values, better, label) {
    const order = [0, 1, 2].slice().sort((a, b) => better(values[a], values[b]));
    const pts = [];
    let rank = 0;
    order.forEach((i, idx) => { if (idx > 0 && better(values[i], values[order[idx - 1]]) !== 0) rank = idx; const n = rank === 0 ? 2 : rank === 1 ? 1 : 0; if (n === 2) R.S.stats.reflex[i]++; pts.push(R.addPoints(i, n, label(values[i]))); });
    return pts;
  }
  const tour = R => { R.S.turn.tour = (R.S.turn.tour || 0) + 1; return (R.S.turn.tour - 1) % 3; };
  const NEXT = (R, label) => R.choice([{ label: label || 'MANCHE SUIVANTE' }, { label: 'ARRÊTER CE JEU', cls: 'ghost' }]);
  const gname = (g) => `<div class="gname" style="color:${g.color}">${g.icon} ${esc(g.name)}</div>`;
  const big = (R, text, cls) => `<div class="panel ${cls || ''}"><div class="bigq">${esc(text)}</div></div>`;
  const hotTag = h => h ? '🌶️ ' : '';

  /* ============================================================
     01 — QUI DE NOUS ?
     ============================================================ */
  async function qui(R, g) {
    for (let round = 0; round < g.rounds; round++) {
      const q = R.draw('qui'), hot = R.isHot('qui', q);
      R.show(gname(g) + big(R, hotTag(hot) + q, 'neon') + R.progress([0, 1, 2], 'VOTEZ EN SECRET'));
      const votes = await R.askAll([0, 1, 2], s => ({ kind: 'buttons', title: q, sub: 'Ton vote (toi compris)', hot, options: seatBtns(R, s), after: 'Vote enregistré. Maintenant, le pari…' }));
      R.show(gname(g) + big(R, q) + R.progress([0, 1, 2], 'VOTES VERROUILLÉS. PARIEZ : QUI VA ÊTRE DÉSIGNÉ ?'));
      const bets = await R.askAll([0, 1, 2], s => ({ kind: 'buttons', title: 'Qui va être désigné ?', sub: 'Ton pari', options: seatBtns(R, s), after: 'Pari pris.' }));
      const v = [0, 1, 2].map(i => +votes[i]), b = [0, 1, 2].map(i => +bets[i]);
      const counts = [0, 0, 0]; v.forEach(x => counts[x]++);
      const max = Math.max(...counts), tie = max === 1, ko = tie ? null : counts.indexOf(max);
      R.S.stats.rounds++;
      R.show(big(R, q) + `<div class="instr blink">DÉPOUILLEMENT…</div><div class="votes">${[0, 1, 2].map(i => `<div class="vrow" id="vr${i}">${R.avatar(i)}<span class="txt">${esc(R.P(i))}</span><span class="arrow">▶</span>${R.avatar(v[i])}<span class="txt c${v[i]}">${esc(R.P(v[i]))}</span></div>`).join('')}</div><div id="result" class="stack"></div>`);
      for (let i = 0; i < 3; i++) { await R.sleep(650); const el = document.getElementById('vr' + i); if (el) el.classList.add('in'); R.sfx.drum(); }
      await R.sleep(600);
      const pts = [];
      if (tie) {
        R.sfx.fail();
        [0, 1, 2].forEach(i => pts.push({ i, n: 0, label: 'a parié ' + R.P(b[i]) }));
        R.result(`<div class="panel yellow center"><div class="px xl">ÉGALITÉ</div><div class="muted">${esc(rnd(D.taunts.tie))}</div></div>${R.ptsList(pts)}${drinks(R, [0, 1, 2])}`);
      } else {
        R.sfx.ko(); R.shake(); R.S.stats.ko[ko]++;
        [0, 1, 2].forEach(i => { let n = 0, lab = 'a parié ' + R.P(b[i]); if (b[i] === ko) { n += 1; R.S.stats.mental[i]++; lab = 'bon pari'; } if (i === ko && v[i] === i) { n += 2; R.S.stats.lucid[i]++; lab += ' + lucidité'; } pts.push(R.addPoints(i, n, lab)); });
        const lucid = v[ko] === ko;
        R.result(`<div class="tally">${[0, 1, 2].map(i => `<div class="t ${i === ko ? 'win' : ''}">${R.avatar(i)}<div class="n">${counts[i]}</div></div>`).join('')}</div><div class="ko">K.O.</div><div class="center">${R.avatar(ko, 'glitch', 'style="width:110px;height:110px"')}<div class="px xl c${ko}">${esc(R.P(ko))}</div><div class="muted">${esc(lucid ? rnd(D.taunts.lucid) : rnd(D.taunts.ko))}</div></div>${R.ptsList(pts)}${drinks(R, [ko])}`);
      }
      R.save();
      if (round < g.rounds - 1 && await NEXT(R) === 1) return;
    }
  }

  /* ============================================================
     02 — 5 SECONDES CHRONO
     ============================================================ */
  async function cinq(R, g) {
    for (let round = 0; round < 3; round++) {
      const p = tour(R), q = R.draw('cinq'), hot = R.isHot('cinq', q), judges = others(p);
      R.show(gname(g) + `<div class="sc centered">${R.avatar(p, 'bounce', 'style="width:140px;height:140px"')}<div class="px xl c${p}">${esc(R.P(p))}</div><div class="instr">START, la consigne apparaît, 5 secondes pour citer 3 réponses à voix haute.</div><div class="panel red"><div class="bigq">? ? ?</div><div class="instr">${hot ? '🌶️ consigne épicée' : 'consigne cachée'}</div></div></div>`);
      await R.ask(p, { kind: 'start', title: 'À TOI DE JOUER', sub: 'Appuie quand tu es prêt.' });
      R.show(`<div class="panel red"><div class="label">CITE…</div><div class="bigq">${esc(q)}</div></div><div class="timer" id="tm">5</div><div class="tbar" id="tb"><div style="width:100%"></div></div><div class="instr">${esc(R.P(p))} parle, les deux autres comptent.</div>`);
      await R.countdown(5);
      R.show(big(R, q) + `<div class="px xl center" style="color:var(--red)">STOP !</div>` + R.progress(judges, 'LES JUGES DÉCIDENT'));
      const r = await R.askAll(judges, () => ({ kind: 'buttons', title: 'Verdict pour ' + R.P(p), sub: '3 réponses à temps ?', options: [{ v: 2, label: '👍 RÉUSSI +2', cls: 'green' }, { v: 1, label: '🤏 PRESQUE +1', cls: 'yellow' }, { v: 0, label: '👎 RATÉ 0', cls: 'red' }], after: 'Verdict envoyé.' }));
      const n = Math.round((+r[judges[0]] + +r[judges[1]]) / 2);
      if (n === 2) { R.S.stats.cinqOk[p]++; R.sfx.win(); } else if (n === 0) { R.S.stats.cinqFail[p]++; R.sfx.fail(); } else R.sfx.select();
      R.S.stats.rounds++; const pts = [R.addPoints(p, n, n === 2 ? 'bouche en feu' : n ? 'presque' : 'buffer')]; R.save();
      R.show(`<div class="sc centered">${R.avatar(p, n ? 'bounce' : '', 'style="width:140px;height:140px"')}<div class="px xl c${p}">${esc(R.P(p))}</div><div class="hero" style="color:${n ? 'var(--green)' : 'var(--red)'};text-shadow:none">+${n}</div><div class="instr">${esc(n ? rnd(D.taunts.timerOk) : rnd(D.taunts.timerFail))}</div>${drinks(R, n ? [] : [p])}</div>`);
      if (round < 2 && await NEXT(R, 'AU TOUR DE ' + R.P((R.S.turn.tour) % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     03 — MENTEUR !
     ============================================================ */
  async function menteur(R, g) {
    R.show(gname(g) + big(R, 'Écrivez 2 vérités et 1 mensonge sur vous. Marquez la fausse. Soyez crédibles.', 'green') + R.progress([0, 1, 2], 'EN TRAIN D\'ÉCRIRE…'));
    const sets = await R.askAll([0, 1, 2], () => ({ kind: 'lie', title: '2 vérités, 1 mensonge', inspi: shuffle(D.menteur.inspi).slice(0, 3), after: 'Tes phrases sont parties. Garde ton poker face.' }));
    for (const a of [0, 1, 2]) {
      const set = sets[a], order = shuffle([0, 1, 2]), guessers = others(a);
      R.show(`<div class="center">${R.avatar(a, '', 'style="width:90px;height:90px"')}<div class="px xl c${a}">${esc(R.P(a))} DIT :</div></div><div class="stmts">${order.map(k => `<div class="stmt">${esc(set.st[k])}</div>`).join('')}</div>` + R.progress(guessers, 'LEQUEL EST LE MENSONGE ?'));
      const picks = await R.askAll(guessers, () => ({ kind: 'statements', title: R.P(a) + ' dit…', items: order.map(k => ({ k, text: set.st[k] })), after: 'Verdict envoyé.' }));
      const found = guessers.filter(gg => +picks[gg] === set.lie);
      const pts = [R.addPoints(a, found.length === 0 ? 2 : found.length === 1 ? 1 : 0, found.length === 0 ? 'personne ne l\'a vu' : found.length === 1 ? 'un seul a vu' : 'démasqué par tous')];
      if (found.length === 0) R.S.stats.lieHidden[a]++;
      guessers.forEach(gg => { if (+picks[gg] === set.lie) { R.S.stats.lieDetect[gg]++; pts.push(R.addPoints(gg, 1, 'a démasqué')); } else pts.push(R.addPoints(gg, 0, 'a cru une vérité')); });
      R.S.stats.rounds++; R.save();
      R.show(`<div class="px xl center" style="color:var(--red)">LE MENSONGE…</div><div class="stmts">${order.map((k, pos) => `<div class="stmt" id="sm${pos}">${esc(set.st[k])}<div class="who" id="sw${pos}">${guessers.filter(gg => +picks[gg] === k).map(gg => R.P(gg)).join(', ') || '—'}</div></div>`).join('')}</div><div id="result" class="stack"></div>`);
      await R.sleep(900); R.sfx.drum(); await R.sleep(900);
      order.forEach((k, pos) => { const el = document.getElementById('sm' + pos), w = document.getElementById('sw' + pos); if (!el) return; el.classList.add(k === set.lie ? 'lie' : 'truth'); w.textContent = (k === set.lie ? '❌ FAUX · ' : '✅ VRAI · ') + w.textContent; });
      if (found.length === 2) R.sfx.fail(); else R.sfx.win();
      R.result(`<div class="instr">${esc(found.length === 0 ? rnd(D.taunts.lieHidden) : found.length === 2 ? rnd(D.taunts.lieFound) : 'Un sur deux. Moyen.')}</div>${R.ptsList(pts)}${drinks(R, zeroes(pts))}`);
      if (a < 2 && await NEXT(R, 'AU TOUR DE ' + R.P(a + 1).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     04 — DANS LA TÊTE DE…
     ============================================================ */
  async function tete(R, g) {
    for (let round = 0; round < 3; round++) {
      const seat = tour(R), raw = R.draw('tete'), q = raw.replace(/\{P\}/g, R.P(seat)), hot = R.isHot('tete', raw), [a, b] = others(seat);
      R.show(gname(g) + big(R, hotTag(hot) + q, 'pink') + R.progress([0, 1, 2], R.P(seat) + ' RÉPOND EN SECRET · LES DEUX AUTRES DEVINENT'));
      const res = await R.askAll([0, 1, 2], s => s === seat
        ? { kind: 'text', title: q, sub: 'Ta vraie réponse (secrète)', hot, placeholder: 'Réponds honnêtement…', after: 'Réponse enregistrée.' }
        : { kind: 'text', title: q, sub: 'Qu\'a répondu ' + R.P(seat) + ' ?', hot, placeholder: 'Ta prédiction…', after: 'Prédiction envoyée.' });
      R.show(big(R, q) + `<div class="answers"><div class="answer">${R.avatar(a)}<span class="who c${a}">${esc(R.P(a))} PENSAIT</span><span class="txt">${esc(res[a])}</span></div><div class="answer">${R.avatar(b)}<span class="who c${b}">${esc(R.P(b))} PENSAIT</span><span class="txt">${esc(res[b])}</span></div><div class="answer seat hidden-txt" id="anS">${R.avatar(seat)}<span class="who c${seat}">${esc(R.P(seat))} A RÉPONDU</span><span class="txt">${esc(res[seat])}</span></div></div><div id="result" class="stack">${R.progress([seat], R.P(seat) + ' DÉSIGNE LE PLUS PROCHE')}</div>`);
      await R.sleep(1800); const anS = document.getElementById('anS'); if (anS) anS.classList.remove('hidden-txt'); R.sfx.coin();
      const who = await R.ask(seat, { kind: 'buttons', title: 'Qui était le plus proche ?', sub: 'Ta réponse : ' + res[seat], options: [{ v: a, label: R.P(a), seat: a }, { v: b, label: R.P(b), seat: b }, { v: 'both', label: 'LES DEUX +1 CHACUN', cls: 'yellow' }, { v: 'none', label: 'PERSONNE. JE SUIS UNE ÉNIGME.', cls: 'ghost' }], after: 'Verdict envoyé.' });
      const pts = [];
      if (who === 'both') { pts.push(R.addPoints(a, 1, 'bien vu'), R.addPoints(b, 1, 'bien vu')); R.S.stats.mental[a]++; R.S.stats.mental[b]++; R.S.stats.guessedOn[seat] += 2; R.sfx.win(); }
      else if (who === 'none') { pts.push(R.addPoints(seat, 1, 'énigme vivante'), R.addPoints(a, 0, 'à côté'), R.addPoints(b, 0, 'à côté')); R.sfx.fail(); }
      else { const w = +who, l = w === a ? b : a; pts.push(R.addPoints(w, 2, 'dans sa tête'), R.addPoints(l, 0, 'à côté')); R.S.stats.mental[w]++; R.S.stats.guessedOn[seat]++; R.sfx.win(); }
      R.S.stats.rounds++; R.save();
      R.result(R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (round < 2 && await NEXT(R, 'SELLETTE : ' + R.P(R.S.turn.tour % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     05 — TU PRÉFÈRES ?    (et 18 — JAMAIS / TOUJOURS, même moteur)
     ============================================================ */
  async function abGame(R, g, opts) {
    for (let round = 0; round < g.rounds; round++) {
      const d = opts.draw(), hot = opts.hot(d), a = opts.a(d), b = opts.b(d), title = opts.title(d);
      R.show(gname(g) + (opts.statement ? big(R, hotTag(hot) + opts.statement(d), 'yellow') : '') + `<div class="ab"><div class="opt a"><span class="l">${esc(opts.la)}</span>${esc(a)}</div><div class="opt b"><span class="l">${esc(opts.lb)}</span>${esc(b)}</div></div>` + R.progress([0, 1, 2], 'CHOISISSEZ, ET PRÉDISEZ LE CHOIX DES DEUX AUTRES'));
      const r = await R.askAll([0, 1, 2], s => ({ kind: 'ab', title, hot, a, b, la: opts.la, lb: opts.lb, predict: others(s).map(o => ({ seat: o, name: R.P(o) })), predictTitle: opts.predictTitle, after: 'C\'est noté.' }));
      const picks = [0, 1, 2].map(i => r[i].pick), pts = [];
      [0, 1, 2].forEach(i => { let ok = 0; others(i).forEach(o => { if (r[i].preds[o] === picks[o]) { ok++; R.S.stats.guessedOn[o]++; } }); if (ok) R.S.stats.mental[i] += ok; pts.push(R.addPoints(i, ok + (ok === 2 ? 1 : 0), ok === 2 ? 'les deux + bonus' : ok === 1 ? 'une bonne' : 'à côté')); });
      const unanimous = picks.every(p => p === picks[0]);
      R.S.stats.rounds++; R.save();
      R.show((opts.statement ? big(R, opts.statement(d)) : '') + `<div class="ab"><div class="opt a"><span class="l">${esc(opts.la)}</span>${esc(a)}<div class="who" id="whoA"></div></div><div class="opt b"><span class="l">${esc(opts.lb)}</span>${esc(b)}<div class="who" id="whoB"></div></div></div><div id="result" class="stack"></div>`);
      for (const i of [0, 1, 2]) { await R.sleep(700); const el = document.getElementById(picks[i] === 0 ? 'whoA' : 'whoB'); if (el) el.insertAdjacentHTML('beforeend', R.avatar(i, 'screen-in')); R.sfx.drum(); }
      await R.sleep(500); R.sfx.coin();
      const losers = opts.losers ? opts.losers(picks) : zeroes(pts);
      R.result(`${unanimous ? '<div class="px center" style="color:var(--yellow)">UNANIMITÉ. VOUS ÊTES LE MÊME CERVEAU.</div>' : ''}${R.ptsList(pts)}${drinks(R, losers)}`);
      if (round < g.rounds - 1 && await NEXT(R, opts.next) === 1) return;
    }
  }
  const prefere = (R, g) => abGame(R, g, { draw: () => R.draw('prefere'), hot: d => R.isHot('prefere', d), a: d => d[0], b: d => d[1], title: () => 'Tu préfères…', la: 'A', lb: 'B', next: 'DILEMME SUIVANT' });
  const jamais = (R, g) => abGame(R, g, { draw: () => R.draw('jamais'), hot: d => R.isHot('jamais', d), statement: d => d, a: () => 'Jamais, promis', b: () => 'Déjà fait', title: d => d, la: 'JAMAIS', lb: 'DÉJÀ', predictTitle: 'ET LES AUTRES, ILS ONT DÉJÀ ?', next: 'SUIVANT', losers: picks => [0, 1, 2].filter(i => picks[i] === 1) });

  /* ============================================================
     06 — ÉCHELLE DE 1 À 10
     ============================================================ */
  async function echelle(R, g) {
    for (let round = 0; round < 3; round++) {
      const seat = tour(R), t = R.draw('echelle'), hot = R.isHot('echelle', t), [a, b] = others(seat);
      R.show(gname(g) + big(R, `${hotTag(hot)}${R.P(seat)}, de 1 à 10, tu es ${t} à combien ?`, 'neon') + R.progress([0, 1, 2], R.P(seat) + ' SE NOTE EN SECRET · LES AUTRES DEVINENT SA NOTE'));
      const r = await R.askAll([0, 1, 2], s => ({ kind: 'scale', title: s === seat ? `Tu es ${t} à combien ?` : `${R.P(seat)} se met combien en « ${t} » ?`, sub: s === seat ? 'Sois honnête' : 'Devine sa note, pas la tienne', hot, min: 1, max: 10, lo: 'pas du tout', hi: 'à fond', after: 'C\'est noté.' }));
      const pts = [];
      [a, b].forEach(i => { const diff = Math.abs(r[i] - r[seat]); const n = diff === 0 ? 2 : diff === 1 ? 1 : 0; if (n) { R.S.stats.mental[i]++; R.S.stats.guessedOn[seat]++; } pts.push(R.addPoints(i, n, `a dit ${r[i]}${diff === 0 ? ' · pile' : diff === 1 ? ' · à 1 près' : ''}`)); });
      R.S.stats.rounds++; R.save(); R.sfx.coin();
      R.show(big(R, `${R.P(seat)} · ${t}`) + `<div class="scalebar"><div class="scalev seat" style="left:${(r[seat] - 1) * 11.1}%">${R.avatar(seat)}<b>${r[seat]}</b></div><div class="scalev" style="left:${(r[a] - 1) * 11.1}%">${R.avatar(a)}<b>${r[a]}</b></div><div class="scalev" style="left:${(r[b] - 1) * 11.1}%">${R.avatar(b)}<b>${r[b]}</b></div></div><div class="instr">${esc(R.P(seat))} se donne ${r[seat]} / 10</div>` + R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (round < 2 && await NEXT(R, 'SUIVANT : ' + R.P(R.S.turn.tour % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     07 — POURCENTAGE
     ============================================================ */
  async function pourcentage(R, g) {
    for (let round = 0; round < 3; round++) {
      const seat = tour(R), raw = R.draw('pourcentage'), q = raw.replace(/\{P\}/g, R.P(seat)), hot = R.isHot('pourcentage', raw), [a, b] = others(seat);
      R.show(gname(g) + big(R, `${hotTag(hot)}Il y a combien de chances que ${q} ?`, 'neon') + R.progress([0, 1, 2], R.P(seat) + ' DONNE SON CHIFFRE · LES AUTRES ESTIMENT'));
      const r = await R.askAll([0, 1, 2], s => ({ kind: 'percent', title: `${q} ?`, sub: s === seat ? 'Selon toi, honnêtement' : 'Selon ' + R.P(seat), hot, after: 'C\'est noté.' }));
      const da = Math.abs(r[a] - r[seat]), db = Math.abs(r[b] - r[seat]), pts = [];
      if (da === db) { pts.push(R.addPoints(a, 1, `${r[a]} %`), R.addPoints(b, 1, `${r[b]} %`)); R.S.stats.guessedOn[seat] += 2; }
      else { const w = da < db ? a : b, l = w === a ? b : a; pts.push(R.addPoints(w, 2, `${r[w]} % · le plus proche`), R.addPoints(l, 0, `${r[l]} %`)); R.S.stats.mental[w]++; R.S.stats.guessedOn[seat]++; }
      R.S.stats.rounds++; R.save(); R.sfx.coin();
      R.show(big(R, q) + `<div class="hero" style="color:var(--neon);text-shadow:none">${r[seat]} %</div><div class="instr">selon ${esc(R.P(seat))}</div>` + R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (round < 2 && await NEXT(R, 'SUIVANT : ' + R.P(R.S.turn.tour % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     08 — LE CONFESSIONNAL
     ============================================================ */
  async function confession(R, g) {
    const q = R.draw('confession'), hot = R.isHot('confession', q);
    R.show(gname(g) + big(R, hotTag(hot) + q, 'pink') + R.progress([0, 1, 2], 'CHACUN CONFESSE EN SECRET · L\'ÉCRAN NE DIRA PAS QUI'));
    const conf = await R.askAll([0, 1, 2], () => ({ kind: 'text', title: q, sub: 'Confession anonyme', hot, placeholder: 'Vas-y, c\'est anonyme (ou presque)…', after: 'Confession reçue. Reste de marbre.' }));
    const order = shuffle([0, 1, 2]);
    for (let k = 0; k < 3; k++) {
      const author = order[k], guessers = others(author);
      R.show(`<div class="label center">CONFESSION ${k + 1} / 3</div>` + big(R, '« ' + conf[author] + ' »', 'pink') + R.progress(guessers, 'QUI A ÉCRIT ÇA ? (L\'AUTEUR ATTEND, SANS RIEN DIRE)'));
      const r = await R.askAll(guessers, s => ({ kind: 'buttons', title: 'Qui a écrit ça ?', sub: conf[author], options: seatBtns(R, s, [s]), after: 'Accusation envoyée.' }));
      const found = guessers.filter(s => +r[s] === author), pts = [];
      found.forEach(s => { R.S.stats.lieDetect[s]++; pts.push(R.addPoints(s, 1, 'a reconnu la plume')); });
      guessers.filter(s => +r[s] !== author).forEach(s => pts.push(R.addPoints(s, 0, 'accusait ' + R.P(+r[s]))));
      if (!found.length) { R.S.stats.lieHidden[author]++; pts.unshift(R.addPoints(author, 2, 'incognito')); }
      R.S.stats.rounds++; R.save(); if (found.length) R.sfx.win(); else R.sfx.fail();
      R.show(big(R, '« ' + conf[author] + ' »') + `<div class="center">${R.avatar(author, 'bounce', 'style="width:100px;height:100px"')}<div class="px xl c${author}">C'ÉTAIT ${esc(R.P(author)).toUpperCase()}</div></div>` + R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (k < 2 && await NEXT(R, 'CONFESSION SUIVANTE') === 1) return;
    }
  }

  /* ============================================================
     09 — LE TESTAMENT
     ============================================================ */
  async function testament(R, g) {
    for (let round = 0; round < 3; round++) {
      const seat = tour(R), items = shuffle(D.testament).slice(0, 3), [a, b] = others(seat);
      const opts = [a, b].map(i => ({ v: i, label: R.P(i), seat: i }));
      R.show(gname(g) + big(R, `${R.P(seat)} meurt demain (désolé). Il laisse quoi à qui ?`, 'yellow') + `<div class="stmts">${items.map(it => `<div class="stmt">${esc(it)}</div>`).join('')}</div>` + R.progress([0, 1, 2], R.P(seat) + ' RÉDIGE · LES AUTRES DEVINENT QUI HÉRITE'));
      const r = await R.askAll([0, 1, 2], s => ({ kind: 'multi', title: s === seat ? 'Tu laisses quoi à qui ?' : `${R.P(seat)} laisse quoi à qui ?`, sub: s === seat ? 'Ton testament' : 'Devine son testament', items: items.map((it, k) => ({ key: 'i' + k, label: it })), options: opts, after: 'Testament scellé.' }));
      const pts = [];
      [a, b].forEach(i => { const ok = items.filter((it, k) => r[i]['i' + k] === r[seat]['i' + k]).length; if (ok) { R.S.stats.mental[i] += ok; R.S.stats.guessedOn[seat] += ok; } pts.push(R.addPoints(i, ok, ok + ' / 3 bonne' + (ok > 1 ? 's' : ''))); });
      R.S.stats.rounds++; R.save(); R.sfx.coin();
      R.show(big(R, 'Testament de ' + R.P(seat)) + `<div class="stmts">${items.map((it, k) => `<div class="stmt truth">${esc(it)} <span class="arrow">▶</span> <span class="c${+r[seat]['i' + k]}">${esc(R.P(+r[seat]['i' + k]))}</span></div>`).join('')}</div>` + R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (round < 2 && await NEXT(R, 'SUIVANT : ' + R.P(R.S.turn.tour % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     10 — LA FAUSSE DÉFINITION
     ============================================================ */
  async function definition(R, g) {
    for (let round = 0; round < 3; round++) {
      const [word, real] = R.draw('mots');
      R.show(gname(g) + big(R, word.toUpperCase(), 'green') + `<div class="instr">Personne ne connaît ce mot ? Parfait. Inventez une définition crédible.</div>` + R.progress([0, 1, 2], 'EN TRAIN D\'INVENTER…'));
      const fakes = await R.askAll([0, 1, 2], () => ({ kind: 'text', title: word, sub: 'Invente une définition crédible', placeholder: 'Nom masculin. Désigne…', maxlen: 120, after: 'Définition envoyée. Poker face.' }));
      // chacun vote parmi : la vraie + les 2 fausses des autres
      R.show(big(R, word.toUpperCase()) + R.progress([0, 1, 2], 'VOTEZ POUR LA VRAIE DÉFINITION'));
      const votes = await R.askAll([0, 1, 2], s => { const items = shuffle([{ k: 'real', text: real }].concat(others(s).map(o => ({ k: String(o), text: fakes[o] })))); return { kind: 'statements', title: word, question: 'Laquelle est la vraie ?', items, after: 'Vote enregistré.' }; });
      const pts = [], tally = {};
      [0, 1, 2].forEach(i => { const v = votes[i]; if (v === 'real') { R.S.stats.lieDetect[i]++; pts.push(R.addPoints(i, 1, 'a trouvé la vraie')); } else { tally[v] = (tally[v] || 0) + 1; pts.push(R.addPoints(i, 0, 'a cru ' + R.P(+v))); } });
      [0, 1, 2].forEach(i => { const n = tally[String(i)] || 0; if (n) { R.S.stats.votes[i] += n; R.S.stats.lieHidden[i]++; pts.push(R.addPoints(i, n, n + ' bluffé' + (n > 1 ? 's' : ''))); } });
      R.S.stats.rounds++; R.save(); R.sfx.coin();
      R.show(big(R, word.toUpperCase()) + `<div class="stmts"><div class="stmt truth">${esc(real)}<div class="who">✅ LA VRAIE · ${[0, 1, 2].filter(i => votes[i] === 'real').map(i => R.P(i)).join(', ') || '—'}</div></div>${[0, 1, 2].map(i => `<div class="stmt lie">${esc(fakes[i])}<div class="who">🤥 ${esc(R.P(i))} · ${[0, 1, 2].filter(j => votes[j] === String(i)).map(j => R.P(j)).join(', ') || '—'}</div></div>`).join('')}</div>` + R.ptsList(pts) + drinks(R, [0, 1, 2].filter(i => votes[i] !== 'real')));
      if (round < 2 && await NEXT(R, 'MOT SUIVANT') === 1) return;
    }
  }

  /* ============================================================
     11 — LE DÉTECTEUR
     ============================================================ */
  async function detecteur(R, g) {
    for (let round = 0; round < 3; round++) {
      const seat = tour(R), qs = shuffle(D.detecteur).slice(0, 5), guessers = others(seat);
      R.show(gname(g) + big(R, `${R.P(seat)} répond à 5 questions… et ment sur une seule.`, 'green') + R.progress([seat], 'EN TRAIN DE RÉPONDRE'));
      const r = await R.ask(seat, { kind: 'detector', title: '5 réponses, 1 mensonge', questions: qs, after: 'Réponses envoyées.' });
      const items = qs.map((q, k) => ({ k, text: q + ' → ' + r.answers[k] }));
      R.show(`<div class="center">${R.avatar(seat, '', 'style="width:80px;height:80px"')}<div class="px lg c${seat}">${esc(R.P(seat))} RÉPOND :</div></div><div class="stmts">${items.map(it => `<div class="stmt">${esc(it.text)}</div>`).join('')}</div>` + R.progress(guessers, 'OÙ EST LE MENSONGE ?'));
      const picks = await R.askAll(guessers, () => ({ kind: 'statements', title: R.P(seat) + ' répond…', question: 'Où est le mensonge ?', items, after: 'Verdict envoyé.' }));
      const found = guessers.filter(s => +picks[s] === r.lie), pts = [];
      pts.push(R.addPoints(seat, found.length === 0 ? 2 : found.length === 1 ? 1 : 0, found.length === 0 ? 'indétectable' : found.length === 1 ? 'un seul a vu' : 'grillé'));
      if (!found.length) R.S.stats.lieHidden[seat]++;
      guessers.forEach(s => { if (+picks[s] === r.lie) { R.S.stats.lieDetect[s]++; pts.push(R.addPoints(s, 1, 'a flairé')); } else pts.push(R.addPoints(s, 0, 'à côté')); });
      R.S.stats.rounds++; R.save(); if (found.length === 2) R.sfx.fail(); else R.sfx.win();
      R.show(`<div class="stmts">${items.map(it => `<div class="stmt ${it.k === r.lie ? 'lie' : 'truth'}">${esc(it.text)}<div class="who">${it.k === r.lie ? '❌ FAUX' : '✅ VRAI'} · ${guessers.filter(s => +picks[s] === it.k).map(s => R.P(s)).join(', ') || '—'}</div></div>`).join('')}</div>` + R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (round < 2 && await NEXT(R, 'SUIVANT : ' + R.P(R.S.turn.tour % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     12 — LE SLOGAN   (et 19 — PIRE PUNCHLINE, même moteur de vote)
     ============================================================ */
  async function voteGame(R, g, opts) {
    for (let round = 0; round < 3; round++) {
      const subject = opts.draw();
      R.show(gname(g) + big(R, opts.headline(subject), g.cls) + R.progress([0, 1, 2], opts.writing));
      const texts = await R.askAll([0, 1, 2], () => ({ kind: 'text', title: opts.headline(subject), sub: opts.sub, placeholder: opts.placeholder, maxlen: 120, after: 'Envoyé. Regarde l\'écran.' }));
      R.show(big(R, opts.headline(subject)) + `<div class="stmts">${[0, 1, 2].map(i => `<div class="stmt">${esc(texts[i])}</div>`).join('')}</div>` + R.progress([0, 1, 2], opts.voting));
      const votes = await R.askAll([0, 1, 2], s => ({ kind: 'statements', title: opts.headline(subject), question: opts.question, items: others(s).map(o => ({ k: o, text: texts[o] })), after: 'Vote enregistré.' }));
      const tally = [0, 0, 0]; [0, 1, 2].forEach(i => tally[+votes[i]]++);
      const pts = [0, 1, 2].map(i => { R.S.stats.votes[i] += tally[i]; return R.addPoints(i, tally[i] + (tally[i] === 2 ? 1 : 0), tally[i] === 2 ? 'plébiscité + bonus' : tally[i] === 1 ? 'une voix' : 'zéro voix'); });
      R.S.stats.rounds++; R.save(); R.sfx.win();
      R.show(big(R, opts.headline(subject)) + `<div class="stmts">${[0, 1, 2].slice().sort((x, y) => tally[y] - tally[x]).map(i => `<div class="stmt ${tally[i] === 2 ? 'truth' : ''}">${esc(texts[i])}<div class="who">${esc(R.P(i))} · ${tally[i]} vote${tally[i] > 1 ? 's' : ''}</div></div>`).join('')}</div>` + R.ptsList(pts) + drinks(R, zeroes(pts)));
      if (round < 2 && await NEXT(R, opts.next) === 1) return;
    }
  }
  const slogan = (R, g) => voteGame(R, g, { draw: () => R.draw('slogan'), headline: s => `Un slogan pour… ${s}`, sub: '30 secondes, pas plus', placeholder: 'Le slogan qui tue…', writing: 'LES CRÉATIFS BOSSENT…', voting: 'VOTEZ POUR LE MEILLEUR SLOGAN (PAS LE VÔTRE)', question: 'Le meilleur slogan ?', next: 'PRODUIT SUIVANT' });
  const punchline = (R, g) => voteGame(R, g, { draw: () => R.draw('punchline'), headline: s => `La pire phrase de drague… ${s}`, sub: 'Plus c\'est nul, mieux c\'est', placeholder: 'Excusez-moi, vous…', writing: 'LES DRAGUEURS PRÉPARENT LEUR COUP…', voting: 'VOTEZ POUR LA PIRE (PAS LA VÔTRE)', question: 'La pire ?', next: 'LIEU SUIVANT' });

  /* ============================================================
     13 — LE JUGE SUPRÊME
     ============================================================ */
  async function juge(R, g) {
    for (let round = 0; round < 3; round++) {
      const j = tour(R), q = R.draw('juge'), hot = R.isHot('juge', q), [a, b] = others(j);
      R.show(gname(g) + big(R, hotTag(hot) + q, 'yellow') + `<div class="instr">${esc(R.P(j))} juge. Les deux autres répondent. Le juge ne saura pas qui a écrit quoi.</div>` + R.progress([a, b], 'LES CANDIDATS RÉDIGENT…'));
      const r = await R.askAll([a, b], () => ({ kind: 'text', title: q, sub: 'Convaincs le juge ' + R.P(j), hot, placeholder: 'Ta réponse…', maxlen: 120, after: 'Envoyé au tribunal.' }));
      const order = shuffle([a, b]);
      R.show(big(R, q) + `<div class="ab"><div class="opt a"><span class="l">A</span>${esc(r[order[0]])}</div><div class="opt b"><span class="l">B</span>${esc(r[order[1]])}</div></div>` + R.progress([j], R.P(j) + ' DÉLIBÈRE'));
      const v = await R.ask(j, { kind: 'buttons', title: 'Verdict ?', sub: q, options: [{ v: order[0], label: 'A · ' + r[order[0]].slice(0, 40) }, { v: order[1], label: 'B · ' + r[order[1]].slice(0, 40) }], after: 'Verdict rendu.' });
      const w = +v, l = w === a ? b : a;
      const pts = [R.addPoints(w, 2, 'a convaincu le juge'), R.addPoints(l, 0, 'débouté')]; R.S.stats.votes[w]++;
      R.S.stats.rounds++; R.save(); R.sfx.win();
      R.show(big(R, q) + `<div class="center">${R.avatar(w, 'bounce', 'style="width:100px;height:100px"')}<div class="px xl c${w}">${esc(R.P(w))} GAGNE</div><div class="muted">« ${esc(r[w])} »</div></div>` + R.ptsList(pts) + drinks(R, [l]));
      if (round < 2 && await NEXT(R, 'JUGE SUIVANT : ' + R.P(R.S.turn.tour % 3).toUpperCase()) === 1) return;
    }
  }

  /* ============================================================
     14-17 — RÉFLEXES : COULEUR, SIMON, CHRONO, TAP
     ============================================================ */
  async function reflexGame(R, g, prompt, better, label, intro) {
    for (let round = 0; round < g.rounds; round++) {
      R.show(gname(g) + big(R, intro, g.cls) + R.progress([0, 1, 2], R.isWeb ? 'TOUS EN MÊME TEMPS SUR VOS TÉLÉPHONES' : 'CHACUN SON TOUR'));
      const r = await R.askAll([0, 1, 2], () => Object.assign({}, prompt));
      const pts = rankPoints(R, r, better, label);
      R.S.stats.rounds++; R.save(); R.sfx.fanfare();
      const order = [0, 1, 2].slice().sort((x, y) => better(r[x], r[y]));
      R.show(gname(g) + `<div class="podium small">${[{ i: order[1], c: 'second', n: 2 }, { i: order[0], c: 'first', n: 1 }, { i: order[2], c: 'third', n: 3 }].map(s => `<div class="step ${s.c}">${R.avatar(s.i, s.n === 1 ? 'bounce' : '')}<div class="nm c${s.i}">${esc(R.P(s.i))}</div><div class="total">${esc(label(r[s.i]))}</div><div class="box">${s.n}</div></div>`).join('')}</div>` + R.ptsList(pts) + drinks(R, [order[2]]));
      if (round < g.rounds - 1 && await NEXT(R, 'ENCORE') === 1) return;
    }
  }
  const couleur = (R, g) => reflexGame(R, g, { kind: 'color', rounds: 8 }, (x, y) => (y.score - x.score) || (x.ms - y.ms), v => `${v.score}/8 · ${(v.ms / 1000).toFixed(1)}s`, 'Le mot dit une couleur, l\'encre en montre une autre. Tape la couleur de l\'ENCRE.');
  const simon = (R, g) => reflexGame(R, g, { kind: 'simon' }, (x, y) => y.len - x.len, v => 'niveau ' + v.len, 'Une séquence de couleurs, de plus en plus longue. Mémorise, reproduis.');
  const chrono = (R, g) => reflexGame(R, g, { kind: 'chrono', target: 10000 }, (x, y) => Math.abs(x.err) - Math.abs(y.err), v => `${v.err > 0 ? '+' : ''}${(v.err / 1000).toFixed(2)}s`, 'Appuie sur STOP pile à 10 secondes, sans aucun repère.');
  const tap = (R, g) => reflexGame(R, g, { kind: 'tap', seconds: 5 }, (x, y) => y.taps - x.taps, v => v.taps + ' taps', '5 secondes. Tape le plus vite possible. Pas de technique, que de la rage.');

  /* ============================================================
     20 — ROAST GENTIL
     ============================================================ */
  async function roast(R, g) {
    const pairs = [[0, 1], [1, 2], [2, 0]];
    for (let round = 0; round < 3; round++) {
      const [r, v] = pairs[round], theme = R.draw('roast');
      R.show(gname(g) + big(R, `${R.P(r)} clashe ${R.P(v)} sur… ${theme}`, 'red') + `<div class="instr">20 secondes. Tendrement. ${esc(R.P(v))} notera ensuite de 1 à 10.</div>` + R.progress([r], R.P(r) + ' PRÉPARE SON CLASH'));
      await R.ask(r, { kind: 'start', title: 'À TOI DE CLASHER', sub: `Sujet : ${theme}. 20 secondes.`, button: 'JE SUIS PRÊT ▶' });
      R.show(big(R, `${R.P(r)} clashe ${R.P(v)} sur ${theme}`) + `<div class="timer" id="tm">20</div><div class="tbar" id="tb"><div style="width:100%"></div></div>`);
      await R.countdown(20);
      R.show(big(R, `${R.P(r)} clashe ${R.P(v)}`) + R.progress([v], R.P(v) + ' NOTE LE CLASH'));
      const note = await R.ask(v, { kind: 'scale', title: 'Le clash de ' + R.P(r), sub: 'Tu lui mets combien ?', min: 1, max: 10, lo: 'nul', hi: 'tu m\'as détruit', after: 'Note envoyée.' });
      const n = note >= 8 ? 3 : note >= 5 ? 2 : note >= 3 ? 1 : 0;
      if (n >= 2) R.S.stats.votes[r]++;
      const pts = [R.addPoints(r, n, `noté ${note}/10`)];
      R.S.stats.rounds++; R.save(); if (n) R.sfx.win(); else R.sfx.fail();
      R.show(`<div class="center">${R.avatar(r, n ? 'bounce' : '', 'style="width:100px;height:100px"')}<div class="hero" style="color:var(--yellow);text-shadow:none">${note} / 10</div><div class="instr">${esc(note >= 8 ? 'Dévastateur. Et tendre.' : note >= 5 ? 'Ça pique un peu.' : 'Même pas mal.')}</div></div>` + R.ptsList(pts) + drinks(R, n ? [v] : [r]));
      if (round < 2 && await NEXT(R, `SUIVANT : ${R.P(pairs[round + 1][0]).toUpperCase()} CLASHE ${R.P(pairs[round + 1][1]).toUpperCase()}`) === 1) return;
    }
  }

  /* ============================================================
     REGISTRE
     ============================================================ */
  const GAMES = [
    { id: 'qui',        n: 1,  icon: '🎯', name: 'QUI DE NOUS ?',          desc: 'Vote, parie, assume.',                      type: 'vote',   cat: 'connaitre', color: 'var(--neon)',   cls: 'neon',   rounds: 3, run: qui },
    { id: 'tete',       n: 2,  icon: '🧠', name: 'DANS LA TÊTE DE…',       desc: 'Devine ce qu\'il va répondre.',             type: 'devine', cat: 'connaitre', color: 'var(--pink)',   cls: 'pink',   rounds: 3, run: tete },
    { id: 'prefere',    n: 3,  icon: '⚖️', name: 'TU PRÉFÈRES ?',          desc: 'Dilemmes impossibles et prédictions.',      type: 'vote',   cat: 'connaitre', color: 'var(--yellow)', cls: 'yellow', rounds: 3, run: prefere },
    { id: 'echelle',    n: 4,  icon: '📏', name: 'ÉCHELLE DE 1 À 10',      desc: 'Note-toi, les autres devinent ta note.',    type: 'devine', cat: 'connaitre', color: 'var(--neon)',   cls: 'neon',   rounds: 3, run: echelle },
    { id: 'pourcentage',n: 5,  icon: '🎰', name: 'POURCENTAGE',            desc: 'Combien de chances que… ?',                 type: 'devine', cat: 'connaitre', color: 'var(--neon)',   cls: 'neon',   rounds: 3, run: pourcentage },
    { id: 'confession', n: 6,  icon: '🙊', name: 'LE CONFESSIONNAL',       desc: 'Aveu anonyme, devine l\'auteur.',           type: 'bluff',  cat: 'connaitre', color: 'var(--pink)',   cls: 'pink',   rounds: 3, run: confession },
    { id: 'testament',  n: 7,  icon: '⚰️', name: 'LE TESTAMENT',           desc: 'Tu laisses quoi à qui ?',                   type: 'devine', cat: 'connaitre', color: 'var(--yellow)', cls: 'yellow', rounds: 3, run: testament },
    { id: 'menteur',    n: 8,  icon: '🤥', name: 'MENTEUR !',              desc: '2 vérités, 1 mensonge, démasque.',          type: 'bluff',  cat: 'bluff',     color: 'var(--green)',  cls: 'green',  rounds: 3, run: menteur },
    { id: 'definition', n: 9,  icon: '📖', name: 'LA FAUSSE DÉFINITION',   desc: 'Mot rare, définitions bidon, vote.',        type: 'bluff',  cat: 'bluff',     color: 'var(--green)',  cls: 'green',  rounds: 3, run: definition },
    { id: 'detecteur',  n: 10, icon: '🕵️', name: 'LE DÉTECTEUR',           desc: '5 réponses, 1 mensonge, trouve-le.',        type: 'bluff',  cat: 'bluff',     color: 'var(--green)',  cls: 'green',  rounds: 3, run: detecteur },
    { id: 'slogan',     n: 11, icon: '📣', name: 'LE SLOGAN',              desc: 'Produit absurde, slogan, vote.',            type: 'impro',  cat: 'bluff',     color: 'var(--yellow)', cls: 'yellow', rounds: 3, run: slogan },
    { id: 'juge',       n: 12, icon: '⚖️', name: 'LE JUGE SUPRÊME',        desc: 'Deux réponses anonymes, un juge.',          type: 'impro',  cat: 'bluff',     color: 'var(--yellow)', cls: 'yellow', rounds: 3, run: juge },
    { id: 'cinq',       n: 13, icon: '⏱️', name: '5 SECONDES CHRONO',      desc: '3 réponses, 5 secondes, pas de pitié.',     type: 'reflex', cat: 'reflex',    color: 'var(--red)',    cls: 'red',    rounds: 3, run: cinq },
    { id: 'couleur',    n: 14, icon: '🎨', name: 'RÉFLEXE COULEUR',        desc: 'La couleur de l\'encre, pas le mot.',        type: 'reflex', cat: 'reflex',    color: 'var(--red)',    cls: 'red',    rounds: 2, run: couleur },
    { id: 'simon',      n: 15, icon: '🔁', name: 'SIMON DIT',              desc: 'Mémorise la séquence de couleurs.',         type: 'reflex', cat: 'reflex',    color: 'var(--red)',    cls: 'red',    rounds: 2, run: simon },
    { id: 'chrono',     n: 16, icon: '⏳', name: 'CHRONO HUMAIN',          desc: 'Appuie pile à 10 secondes, à l\'aveugle.',  type: 'reflex', cat: 'reflex',    color: 'var(--red)',    cls: 'red',    rounds: 2, run: chrono },
    { id: 'tap',        n: 17, icon: '👊', name: 'TAP BATTLE',             desc: '5 secondes, tape le plus vite possible.',   type: 'reflex', cat: 'reflex',    color: 'var(--red)',    cls: 'red',    rounds: 2, run: tap },
    { id: 'jamais',     n: 18, icon: '🙈', name: 'JAMAIS / TOUJOURS',      desc: '« Je n\'ai jamais… », réponse secrète, paris.', type: 'vote', cat: 'glisse',   color: 'var(--orange)', cls: 'yellow', rounds: 3, run: jamais, hotOnly: true },
    { id: 'punchline',  n: 19, icon: '😏', name: 'LA PIRE PUNCHLINE',      desc: 'La pire phrase de drague gagne.',           type: 'impro',  cat: 'glisse',    color: 'var(--orange)', cls: 'pink',   rounds: 3, run: punchline, hotOnly: true },
    { id: 'roast',      n: 20, icon: '🔥', name: 'ROAST GENTIL',           desc: '20 secondes pour clasher tendrement.',      type: 'impro',  cat: 'glisse',    color: 'var(--orange)', cls: 'red',    rounds: 3, run: roast, hotOnly: true }
  ];
  const CATS = { connaitre: { icon: '🧠', name: 'SE CONNAÎTRE' }, bluff: { icon: '🎭', name: 'BLUFF & IMPRO' }, reflex: { icon: '⚡', name: 'RÉFLEXES & APÉRO' }, glisse: { icon: '🌶️', name: 'ÇA GLISSE' } };

  /** Jeux proposés pour une ambiance. */
  function available(ambiance) {
    return GAMES.filter(g => ambiance === 'glisse' || ambiance === 'mix' ? true : !g.hotOnly);
  }
  /** Tirage aléatoire futé : pas le même jeu, pas le même type si possible, pondéré par l'ambiance. */
  function pickRandom(ambiance, lastId) {
    const last = GAMES.find(g => g.id === lastId);
    const pool = available(ambiance).filter(g => g.id !== lastId).map(g => {
      let w = 1;
      if (last && g.type === last.type) w *= 0.3;
      if (ambiance === 'apero' && g.cat === 'reflex') w *= 2.5;
      if (ambiance === 'apero' && g.cat === 'connaitre') w *= 0.6;
      if (ambiance === 'glisse' && g.cat === 'glisse') w *= 2.5;
      if (ambiance === 'glisse' && g.cat === 'reflex') w *= 0.5;
      if (ambiance === 'connaitre' && (g.cat === 'connaitre' || g.cat === 'bluff')) w *= 1.8;
      if (ambiance === 'connaitre' && g.cat === 'reflex') w *= 0.4;
      return { g, w };
    });
    let total = pool.reduce((a, b) => a + b.w, 0), x = Math.random() * total;
    for (const it of pool) { x -= it.w; if (x <= 0) return it.g; }
    return pool[pool.length - 1].g;
  }

  /** Compte à rebours visible sur l'écran principal (#tm / #tb), partagé par les deux runtimes. */
  async function countdown(R, secs) {
    const total = secs * 1000, start = Date.now(); let last = secs;
    R.sfx.tick();
    await new Promise(res => { const iv = setInterval(() => {
      const left = Math.max(0, total - (Date.now() - start)), sec = Math.ceil(left / 1000), tm = document.getElementById('tm'), tb = document.getElementById('tb');
      if (!tm || R.aborted()) { clearInterval(iv); return res(); }
      tm.textContent = sec; tb.firstElementChild.style.width = (left / total * 100) + '%';
      if (sec !== last) { last = sec; if (sec > 0) (sec <= 3 ? R.sfx.tock : R.sfx.tick)(); }
      if (left <= 3000) { tm.classList.add('warn'); tb.classList.add('warn'); }
      if (left <= 0) { clearInterval(iv); R.alarm(true); R.sfx.alarm(); R.shake(); setTimeout(res, 900); }
    }, 50); });
    R.alarm(false);
  }

  window.PJ.countdown = countdown;
  window.PJ.GAMES = GAMES;
  window.PJ.CATS = CATS;
  window.PJ.available = available;
  window.PJ.pickRandom = pickRandom;
})();
