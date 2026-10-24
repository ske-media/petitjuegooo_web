/* ============================================================
   PETIT JUEGO WEB — la manette (téléphone)
   Se connecte à l'écran via WebRTC (PeerJS) et affiche ce que
   l'écran lui demande (rendu partagé : prompts.js).
   ============================================================ */
(function () {
  'use strict';
  const { esc, avatar, SFX, $, $$, peerOpts, renderPrompt } = window.PJ;
  const params = new URLSearchParams(location.search);
  const CODE = (params.get('r') || '').toUpperCase();
  const HOST_ID = 'petitjuego-' + CODE;
  const head = $('#padhead'), body = $('#padbody'), dot = $('#conn'), connmsg = $('#connmsg');

  let peer = null, conn = null, seat = null, names = ['', '', ''], scores = [0, 0, 0], current = null;
  let myName = sessionStorage.getItem('pj_name_' + CODE) || '';
  const token = sessionStorage.getItem('pj_token') || (Math.random().toString(36).slice(2, 10));
  sessionStorage.setItem('pj_token', token);

  function setConn(on, msg) { dot.classList.toggle('on', on); connmsg.textContent = msg; }
  function render(html) { body.innerHTML = `<div class="screen-in stack grow">${html}</div>`; window.scrollTo(0, 0); }
  function renderHead() {
    const nm = i => names[i] || (i === seat && myName) || ('Joueur ' + (i + 1));
    head.innerHTML = seat === null ? `<div class="px sm muted">PETIT JUEGO · salle ${esc(CODE)}</div>` : `${avatar(seat)}<div class="nm c${seat}">${esc(nm(seat))}</div><div class="sc">${scores[seat]} PTS</div>`;
  }
  function send(msg) { if (conn && conn.open) conn.send(msg); }
  function shake() { body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); SFX.fail(); }

  /* ---------- pas de code : on le demande ---------- */
  if (!CODE) {
    render(`<div class="wait"><div class="big">PAS DE CODE</div><div class="muted">Scanne le QR code sur l'écran, ou tape le code de la salle.</div>
      <input type="text" id="code" maxlength="4" placeholder="CODE" style="text-align:center;font-size:36px;text-transform:uppercase">
      <button class="btn primary" id="go">REJOINDRE</button></div>`);
    $('#go').onclick = () => { const c = $('#code').value.trim().toUpperCase(); if (c.length === 4) location.search = '?r=' + c + (params.get('peer') ? '&peer=' + encodeURIComponent(params.get('peer')) : ''); else shake(); };
    setConn(false, 'hors ligne');
    return;
  }

  /* ---------- connexion ---------- */
  function connect() {
    setConn(false, 'connexion à ' + CODE + '…');
    if (peer) { try { peer.destroy(); } catch (e) { } }
    peer = new Peer(undefined, peerOpts());
    peer.on('open', () => {
      conn = peer.connect(HOST_ID, { reliable: true, metadata: { token } });
      conn.on('open', () => { setConn(true, 'connecté · salle ' + CODE); if (myName) send({ t: 'join', name: myName, token }); else if (!$('#nm')) nameScreen(); });
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!conn || !conn.open)) connect(); });

  /* ---------- messages de l'écran ---------- */
  function onData(m) {
    if (!m || !m.t) return;
    if (m.names) names = m.names;
    if (m.scores) scores = m.scores;
    switch (m.t) {
      case 'lobby': if (seat === null && !myName && !$('#nm')) nameScreen(); renderHead(); break;
      case 'seat':
        if (m.ok) { seat = m.seat; sessionStorage.setItem('pj_name_' + CODE, myName); SFX.join(); renderHead(); if (!current) waitScreen('TU ES DANS LA PLACE', 'Regarde l\'écran, ça va commencer.'); }
        else { seat = null; myName = ''; sessionStorage.removeItem('pj_name_' + CODE); nameScreen(m.reason); shake(); }
        break;
      case 'prompt': current = m; renderHead(); showPrompt(m); break;
      case 'clear': current = null; waitScreen(m.title || 'REGARDE L\'ÉCRAN', m.msg || ''); break;
      case 'score': renderHead(); break;
      case 'kick': seat = null; myName = ''; current = null; sessionStorage.removeItem('pj_name_' + CODE); renderHead(); nameScreen(m.msg); break;
    }
  }

  function nameScreen(reason) {
    renderHead();
    render(`<div class="ptitle">Ton prénom ?</div><div class="psub">SALLE ${esc(CODE)}</div>
      ${reason ? `<div class="ins" style="color:var(--orange)">${esc(reason)}</div>` : ''}
      <input type="text" id="nm" maxlength="12" placeholder="Prénom" autocomplete="off" autocapitalize="words" style="text-align:center;font-size:32px">
      <button class="btn primary big" id="go">C'EST MOI ▶</button>
      <div class="ins">Ton prénom s'affichera sur l'écran. 12 caractères max, 3 joueurs par salle.</div>`);
    const go = () => { const v = $('#nm').value.trim(); if (!v) return shake(); myName = v; SFX.select(); send({ t: 'join', name: v, token }); waitScreen('…', 'Connexion à la salle'); };
    $('#go').onclick = go; $('#nm').onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => $('#nm') && $('#nm').focus(), 150);
  }
  function waitScreen(big, msg) {
    render(`<div class="wait">${seat !== null ? avatar(seat, 'bounce', 'style="width:100px;height:100px"') : ''}<div class="big">${esc(big)}</div><div class="muted">${esc(msg || '')}</div></div>`);
  }
  function showPrompt(p) {
    renderPrompt(body, p, { names, seat }, value => {
      send({ t: 'in', id: p.id, value, seat });
      current = null;
      if (p.kind === 'start') waitScreen('C\'EST PARTI !', p.kind === 'start' ? 'Regarde l\'écran.' : '');
      else { waitScreen('✓ ENVOYÉ', p.after || 'Regarde l\'écran.'); SFX.coin(); }
    });
  }
})();
