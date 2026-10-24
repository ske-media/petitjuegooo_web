/* ============================================================
   PETIT JUEGO WEB — la manette (téléphone)
   Se connecte à l'écran via WebRTC (PeerJS) et affiche ce que
   l'écran lui demande : boutons, texte, dilemmes…
   ============================================================ */
(function () {
  'use strict';
  const { esc, avatar, SFX, $, $$, peerOpts } = window.PJ;
  const params = new URLSearchParams(location.search);
  const CODE = (params.get('r') || '').toUpperCase();
  const HOST_ID = 'petitjuego-' + CODE;
  const head = $('#padhead'), body = $('#padbody'), dot = $('#conn'), connmsg = $('#connmsg');

  let peer = null, conn = null, seat = null, names = ['Steven', 'Jade', 'Lionel'], scores = [0, 0, 0];
  let current = null; // prompt en cours
  const token = sessionStorage.getItem('pj_token') || (Math.random().toString(36).slice(2, 10));
  sessionStorage.setItem('pj_token', token);
  const savedSeat = sessionStorage.getItem('pj_seat_' + CODE);
  if (savedSeat !== null && savedSeat !== '') seat = +savedSeat;

  function setConn(on, msg) { dot.classList.toggle('on', on); connmsg.textContent = msg; }
  function render(html) { body.innerHTML = `<div class="screen-in stack grow">${html}</div>`; window.scrollTo(0, 0); }
  function renderHead() {
    head.innerHTML = seat === null ? `<div class="px sm muted">PETIT JUEGO · salle ${esc(CODE)}</div>` : `${avatar(seat)}<div class="nm c${seat}">${esc(names[seat])}</div><div class="sc">${scores[seat]} PTS</div>`;
  }
  function send(msg) { if (conn && conn.open) conn.send(msg); }
  function shake(el) { (el || body).classList.remove('shake'); void (el || body).offsetWidth; (el || body).classList.add('shake'); SFX.fail(); }

  /* ---------- connexion ---------- */
  if (!CODE) {
    render(`<div class="wait"><div class="big">PAS DE CODE</div><div class="muted">Scanne le QR code sur l'écran, ou tape le code de la salle.</div>
      <input type="text" id="code" maxlength="4" placeholder="CODE" style="text-align:center;font-size:36px;text-transform:uppercase">
      <button class="btn primary" id="go">REJOINDRE</button></div>`);
    $('#go').onclick = () => { const c = $('#code').value.trim().toUpperCase(); if (c.length === 4) location.search = '?r=' + c + (params.get('peer') ? '&peer=' + encodeURIComponent(params.get('peer')) : ''); else shake(); };
    setConn(false, 'hors ligne');
    return;
  }

  function connect() {
    setConn(false, 'connexion à ' + CODE + '…');
    if (peer) { try { peer.destroy(); } catch (e) { } }
    peer = new Peer(undefined, peerOpts());
    peer.on('open', () => {
      conn = peer.connect(HOST_ID, { reliable: true, metadata: { token } });
      conn.on('open', () => { setConn(true, 'connecté · salle ' + CODE); send({ t: 'join', seat, token }); });
      conn.on('data', onData);
      conn.on('close', () => { setConn(false, 'déconnecté, je réessaie…'); setTimeout(connect, 2000); });
      conn.on('error', () => { setConn(false, 'erreur, je réessaie…'); setTimeout(connect, 2500); });
    });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') { setConn(false, 'salle ' + CODE + ' introuvable… je réessaie'); setTimeout(connect, 3000); }
      else { setConn(false, 'réseau : ' + e.type); setTimeout(connect, 3000); }
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
  }
  connect();
  // Quand le téléphone revient de veille, on vérifie la connexion
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!conn || !conn.open)) connect(); });

  /* ---------- messages de l'écran ---------- */
  function onData(m) {
    if (!m || !m.t) return;
    if (m.names) names = m.names;
    if (m.scores) scores = m.scores;
    switch (m.t) {
      case 'lobby': if (seat === null) seatPicker(m.taken || []); renderHead(); break;
      case 'seat':
        if (m.ok) { seat = m.seat; sessionStorage.setItem('pj_seat_' + CODE, seat); SFX.join(); renderHead(); if (!current) waitScreen('TU ES DANS LA PLACE', 'Regarde l\'écran, ça va commencer.'); }
        else { seat = null; sessionStorage.removeItem('pj_seat_' + CODE); seatPicker(m.taken || []); shake(); }
        break;
      case 'prompt': current = m; renderHead(); prompt(m); break;
      case 'clear': current = null; waitScreen(m.title || 'REGARDE L\'ÉCRAN', m.msg || ''); break;
      case 'score': renderHead(); break;
    }
  }

  function seatPicker(taken) {
    render(`<div class="ptitle">Qui es-tu ?</div><div class="psub">SALLE ${esc(CODE)}</div>
      <div class="stack seatpick">${[0, 1, 2].map(i => `<button class="btn pbtn c${i} ${taken.includes(i) ? 'taken' : ''}" data-seat="${i}">${avatar(i)}<span>${esc(names[i])}</span><span class="me">${taken.includes(i) ? 'PRIS' : ''}</span></button>`).join('')}</div>
      <div class="ins">Si ton prénom n'est pas là, Steven peut le changer sur l'écran (⚙️).</div>`);
    $$('[data-seat]').forEach(b => b.onclick = () => { SFX.select(); send({ t: 'join', seat: +b.dataset.seat, token }); });
  }
  function waitScreen(big, msg) {
    render(`<div class="wait">${seat !== null ? avatar(seat, 'bounce', 'style="width:100px;height:100px"') : ''}<div class="big">${esc(big)}</div><div class="muted">${esc(msg || '')}</div></div>`);
  }
  function sent(msg) { current = null; waitScreen('✓ ENVOYÉ', msg || 'Regarde l\'écran.'); SFX.coin(); }
  function answer(id, value) { send({ t: 'in', id, value, seat }); }

  /* ---------- rendu des invites ---------- */
  function prompt(p) {
    SFX.blip();
    if (navigator.vibrate) navigator.vibrate(40);
    const hot = p.hot ? '<span class="tag hot">🌶️</span> ' : '';
    switch (p.kind) {
      case 'wait': waitScreen(p.title || 'ATTENDS', p.sub); break;

      case 'buttons':
        render(`${p.title ? `<div class="ptitle">${hot}${esc(p.title)}</div>` : ''}${p.sub ? `<div class="psub">${esc(p.sub)}</div>` : ''}
          <div class="stack">${p.options.map(o => o.seat !== undefined
            ? `<button class="btn pbtn c${o.seat}" data-v="${esc(o.v)}">${avatar(o.seat)}<span>${esc(o.label)}</span>${o.seat === seat ? '<span class="me">(MOI)</span>' : ''}</button>`
            : `<button class="btn ${o.cls || ''}" data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}</div>`);
        $$('[data-v]').forEach(b => b.onclick = () => { SFX.select(); answer(p.id, b.dataset.v); sent(p.after); });
        break;

      case 'text':
        render(`<div class="ptitle">${hot}${esc(p.title)}</div>${p.sub ? `<div class="psub">${esc(p.sub)}</div>` : ''}
          <input type="text" id="tx" maxlength="${p.maxlen || 80}" placeholder="${esc(p.placeholder || '')}" autocomplete="off">
          <button class="btn primary big" id="ok">VALIDER</button>`);
        setTimeout(() => $('#tx').focus(), 100);
        const go = () => { const v = $('#tx').value.trim(); if (!v) return shake(); answer(p.id, v); sent(p.after); };
        $('#ok').onclick = go; $('#tx').onkeydown = e => { if (e.key === 'Enter') go(); };
        break;

      case 'lie': {
        let lie = null;
        render(`<div class="ptitle">${esc(p.title)}</div><div class="psub">MARQUE LA FAUSSE</div>
          ${[0, 1, 2].map(k => `<div class="lieopt"><input type="text" id="st${k}" maxlength="90" placeholder="Phrase ${k + 1}…" autocomplete="off"><button class="mark" data-k="${k}">FAUX</button></div>`).join('')}
          <div class="ins">Idées : ${(p.inspi || []).map(esc).join(' · ')}</div>
          <button class="btn green big" id="ok">VALIDER</button>`);
        $$('.mark').forEach(b => b.onclick = () => { lie = +b.dataset.k; $$('.mark').forEach(x => x.classList.toggle('on', x === b)); SFX.blip(); });
        $('#ok').onclick = () => {
          const st = [0, 1, 2].map(k => $('#st' + k).value.trim());
          if (st.some(s => !s) || lie === null) return shake();
          answer(p.id, { st, lie }); sent('Tes phrases sont parties. Garde ton poker face.');
        };
        break;
      }

      case 'ab': {
        const sel = { pick: null, preds: {} };
        render(`<div class="psub">${hot}${esc(p.title)}</div>
          <div class="ab"><button class="opt a" data-p="0"><span class="l">A</span>${esc(p.a)}</button><button class="opt b" data-p="1"><span class="l">B</span>${esc(p.b)}</button></div>
          ${p.predict && p.predict.length ? `<div class="psub">ET LES AUTRES, ILS CHOISISSENT QUOI ?</div>${p.predict.map(o => `<div class="predrow">${avatar(o.seat)}<span class="nm c${o.seat}">${esc(o.name)}</span><button class="mini" data-pr="${o.seat}:0">A</button><button class="mini" data-pr="${o.seat}:1">B</button></div>`).join('')}` : ''}
          <button class="btn yellow big" id="ok">VALIDER</button>`);
        $$('[data-p]').forEach(b => b.onclick = () => { sel.pick = +b.dataset.p; $$('[data-p]').forEach(x => x.classList.toggle('sel', x === b)); SFX.blip(); });
        $$('[data-pr]').forEach(b => b.onclick = () => { const [s, v] = b.dataset.pr.split(':').map(Number); sel.preds[s] = v; $$('.mini', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); SFX.blip(); });
        $('#ok').onclick = () => {
          if (sel.pick === null) return shake();
          if (p.predict && p.predict.some(o => sel.preds[o.seat] === undefined)) return shake();
          answer(p.id, sel); sent(p.after);
        };
        break;
      }

      case 'statements':
        render(`<div class="psub">${esc(p.title)}</div><div class="ptitle">Lequel est le mensonge ?</div>
          <div class="stack">${p.items.map(it => `<button class="stmt" data-v="${it.k}">${esc(it.text)}</button>`).join('')}</div>`);
        $$('[data-v]').forEach(b => b.onclick = () => { SFX.select(); answer(p.id, +b.dataset.v); sent('Verdict envoyé.'); });
        break;

      case 'start':
        render(`<div class="wait">${avatar(seat, 'bounce', 'style="width:100px;height:100px"')}<div class="big">${esc(p.title)}</div><div class="muted">${esc(p.sub || '')}</div>
          <button class="btn red big" id="ok">START ▶</button></div>`);
        $('#ok').onclick = () => { SFX.coin(); answer(p.id, 'go'); current = null; waitScreen('PARLE !', 'Les 3 réponses, à voix haute. Vite.'); };
        break;

      default: waitScreen('…', '');
    }
  }
})();
