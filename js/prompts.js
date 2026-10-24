/* ============================================================
   PETIT JUEGO — rendu des invites (ce qu'un joueur voit sur SON écran)
   Partagé entre la version téléphone passé et les manettes.
   renderPrompt(container, prompt, ctx, done)  →  done(valeur)
   ctx = { names, seat }  (seat = index du joueur qui répond)
   ============================================================ */
(function () {
  'use strict';
  const { esc, avatar, SFX, $, $$, shuffle } = window.PJ;
  const COLORS = { R: ['ROUGE', '#ff3b3b'], B: ['BLEU', '#3b7bff'], V: ['VERT', '#4dff88'], J: ['JAUNE', '#ffe14d'] };

  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); SFX.fail(); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

  function renderPrompt(box, p, ctx, done) {
    const seat = ctx.seat, names = ctx.names;
    const hot = p.hot ? '<span class="tag hot">🌶️</span> ' : '';
    const render = html => { box.innerHTML = `<div class="screen-in stack grow">${html}</div>`; window.scrollTo(0, 0); };
    const once = (() => { let d = false; return v => { if (d) return; d = true; done(v); }; })();
    const nextTitle = p.after || 'Regarde l\'écran.';
    SFX.blip(); vibrate(30);

    switch (p.kind) {
      case 'wait':
        render(`<div class="wait">${seat !== null && seat !== undefined ? avatar(seat, 'bounce', 'style="width:100px;height:100px"') : ''}<div class="big">${esc(p.title || 'ATTENDS')}</div><div class="muted">${esc(p.sub || '')}</div></div>`);
        break;

      case 'buttons':
        render(`${p.title ? `<div class="ptitle">${hot}${esc(p.title)}</div>` : ''}${p.sub ? `<div class="psub">${esc(p.sub)}</div>` : ''}
          <div class="stack">${p.options.map((o, i) => o.seat !== undefined
            ? `<button class="btn pbtn c${o.seat}" data-v="${i}">${avatar(o.seat)}<span>${esc(o.label)}</span>${o.seat === seat ? '<span class="me">(MOI)</span>' : ''}</button>`
            : `<button class="btn ${o.cls || ''}" data-v="${i}">${esc(o.label)}</button>`).join('')}</div>`);
        $$('[data-v]', box).forEach(b => b.onclick = () => { SFX.select(); once(p.options[+b.dataset.v].v); });
        break;

      case 'text': {
        render(`<div class="ptitle">${hot}${esc(p.title)}</div>${p.sub ? `<div class="psub">${esc(p.sub)}</div>` : ''}
          <input type="text" id="tx" maxlength="${p.maxlen || 80}" placeholder="${esc(p.placeholder || '')}" autocomplete="off">
          <button class="btn primary big" id="ok">VALIDER</button>`);
        setTimeout(() => $('#tx', box) && $('#tx', box).focus(), 120);
        const go = () => { const v = $('#tx', box).value.trim(); if (!v) return shake(box); once(v); };
        $('#ok', box).onclick = go; $('#tx', box).onkeydown = e => { if (e.key === 'Enter') go(); };
        break;
      }

      case 'lie': {   // 2 vérités 1 mensonge  →  { st:[3], lie:k }
        let lie = null;
        render(`<div class="ptitle">${esc(p.title)}</div><div class="psub">MARQUE LA FAUSSE</div>
          ${[0, 1, 2].map(k => `<div class="lieopt"><input type="text" id="st${k}" maxlength="90" placeholder="Phrase ${k + 1}…" autocomplete="off"><button class="mark" data-k="${k}">FAUX</button></div>`).join('')}
          ${p.inspi ? `<div class="ins">Idées : ${p.inspi.map(esc).join(' · ')}</div>` : ''}
          <button class="btn green big" id="ok">VALIDER</button>`);
        $$('.mark', box).forEach(b => b.onclick = () => { lie = +b.dataset.k; $$('.mark', box).forEach(x => x.classList.toggle('on', x === b)); SFX.blip(); });
        $('#ok', box).onclick = () => { const st = [0, 1, 2].map(k => $('#st' + k, box).value.trim()); if (st.some(s => !s) || lie === null) return shake(box); once({ st, lie }); };
        break;
      }

      case 'detector': {   // 5 réponses dont 1 fausse  →  { answers:[5], lie:k }
        let lie = null;
        render(`<div class="ptitle">${esc(p.title)}</div><div class="psub">RÉPONDS AUX 5, ET MENS SUR UNE SEULE</div>
          ${p.questions.map((q, k) => `<div class="field"><div class="muted">${esc(q)}</div><div class="lieopt"><input type="text" id="st${k}" maxlength="40" placeholder="Réponse…" autocomplete="off"><button class="mark" data-k="${k}">FAUX</button></div></div>`).join('')}
          <button class="btn green big" id="ok">VALIDER</button>`);
        $$('.mark', box).forEach(b => b.onclick = () => { lie = +b.dataset.k; $$('.mark', box).forEach(x => x.classList.toggle('on', x === b)); SFX.blip(); });
        $('#ok', box).onclick = () => { const answers = p.questions.map((q, k) => $('#st' + k, box).value.trim()); if (answers.some(s => !s) || lie === null) return shake(box); once({ answers, lie }); };
        break;
      }

      case 'ab': {   // A/B + prédictions  →  { pick, preds:{seat:v} }
        const sel = { pick: null, preds: {} };
        render(`<div class="psub">${hot}${esc(p.title)}</div>
          <div class="ab"><button class="opt a" data-p="0"><span class="l">${esc(p.la || 'A')}</span>${esc(p.a)}</button><button class="opt b" data-p="1"><span class="l">${esc(p.lb || 'B')}</span>${esc(p.b)}</button></div>
          ${p.predict && p.predict.length ? `<div class="psub">${esc(p.predictTitle || 'ET LES AUTRES, ILS CHOISISSENT QUOI ?')}</div>${p.predict.map(o => `<div class="predrow">${avatar(o.seat)}<span class="nm c${o.seat}">${esc(o.name)}</span><button class="mini" data-pr="${o.seat}:0">${esc(p.la || 'A')}</button><button class="mini" data-pr="${o.seat}:1">${esc(p.lb || 'B')}</button></div>`).join('')}` : ''}
          <button class="btn yellow big" id="ok">VALIDER</button>`);
        $$('[data-p]', box).forEach(b => b.onclick = () => { sel.pick = +b.dataset.p; $$('[data-p]', box).forEach(x => x.classList.toggle('sel', x === b)); SFX.blip(); });
        $$('[data-pr]', box).forEach(b => b.onclick = () => { const [s, v] = b.dataset.pr.split(':').map(Number); sel.preds[s] = v; $$('.mini', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); SFX.blip(); });
        $('#ok', box).onclick = () => { if (sel.pick === null) return shake(box); if (p.predict && p.predict.some(o => sel.preds[o.seat] === undefined)) return shake(box); once(sel); };
        break;
      }

      case 'statements':   // choisir une phrase  →  k
        render(`<div class="psub">${esc(p.title)}</div><div class="ptitle">${esc(p.question || 'Lequel est le mensonge ?')}</div>
          <div class="stack">${p.items.map(it => `<button class="stmt" data-v="${esc(String(it.k))}">${esc(it.text)}</button>`).join('')}</div>`);
        $$('[data-v]', box).forEach(b => b.onclick = () => { SFX.select(); once(b.dataset.v); });
        break;

      case 'scale': {   // note de min à max  →  number
        const min = p.min || 1, max = p.max || 10;
        render(`<div class="psub">${hot}${esc(p.sub || '')}</div><div class="ptitle">${esc(p.title)}</div>
          <div class="scale">${Array.from({ length: max - min + 1 }, (_, i) => `<button class="sc" data-v="${min + i}">${min + i}</button>`).join('')}</div>
          <div class="row" style="justify-content:space-between"><span class="muted">${esc(p.lo || '')}</span><span class="muted">${esc(p.hi || '')}</span></div>`);
        $$('[data-v]', box).forEach(b => b.onclick = () => { SFX.select(); once(+b.dataset.v); });
        break;
      }

      case 'percent': {   // 0 à 100  →  number
        let v = 50;
        render(`<div class="psub">${hot}${esc(p.sub || '')}</div><div class="ptitle">${esc(p.title)}</div>
          <div class="bigpct" id="pv">50 %</div>
          <input type="range" id="rg" min="0" max="100" step="5" value="50">
          <div class="row" style="justify-content:space-between"><span class="muted">aucune chance</span><span class="muted">certain</span></div>
          <button class="btn yellow big" id="ok">VALIDER</button>`);
        $('#rg', box).oninput = e => { v = +e.target.value; $('#pv', box).textContent = v + ' %'; SFX.tick(); };
        $('#ok', box).onclick = () => { SFX.select(); once(v); };
        break;
      }

      case 'multi': {   // plusieurs items, un choix chacun  →  { key: v }
        const sel = {};
        render(`<div class="psub">${esc(p.sub || '')}</div><div class="ptitle">${esc(p.title)}</div>
          ${p.items.map(it => `<div class="mrow"><div class="mlabel">${esc(it.label)}</div><div class="row">${p.options.map(o => `<button class="mini ${o.seat !== undefined ? 'c' + o.seat : ''}" data-m="${esc(it.key)}:${esc(String(o.v))}">${esc(o.label)}</button>`).join('')}</div></div>`).join('')}
          <button class="btn yellow big" id="ok">VALIDER</button>`);
        $$('[data-m]', box).forEach(b => b.onclick = () => { const [k, v] = b.dataset.m.split(':'); sel[k] = v; $$('.mini', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); SFX.blip(); });
        $('#ok', box).onclick = () => { if (p.items.some(it => sel[it.key] === undefined)) return shake(box); once(sel); };
        break;
      }

      case 'start':
        render(`<div class="wait">${avatar(seat, 'bounce', 'style="width:100px;height:100px"')}<div class="big">${esc(p.title)}</div><div class="muted">${esc(p.sub || '')}</div>
          <button class="btn red big" id="ok">${esc(p.button || 'START ▶')}</button></div>`);
        $('#ok', box).onclick = () => { SFX.coin(); once('go'); };
        break;

      /* ---------- RÉFLEXES ---------- */
      case 'color': {   // Stroop : tape la couleur de l'encre  →  { score, ms }
        const rounds = p.rounds || 8, keys = Object.keys(COLORS);
        let i = 0, score = 0, t0 = 0, total = 0, cur = null;
        const intro = () => { render(`<div class="wait"><div class="big">RÉFLEXE COULEUR</div><div class="muted">Tape la couleur de l'ENCRE, pas le mot.<br>${rounds} mots, le plus vite possible.</div><button class="btn red big" id="ok">GO ▶</button></div>`); $('#ok', box).onclick = () => { SFX.coin(); i = 0; score = 0; total = 0; step(); }; };
        const step = () => {
          if (i >= rounds) { SFX.win(); render(`<div class="wait"><div class="big">${score} / ${rounds}</div><div class="muted">${(total / 1000).toFixed(2)} s</div></div>`); setTimeout(() => once({ score, ms: total }), 900); return; }
          const word = keys[Math.floor(Math.random() * 4)]; let ink = keys[Math.floor(Math.random() * 4)];
          if (Math.random() < 0.7 && ink === word) ink = keys[(keys.indexOf(word) + 1 + Math.floor(Math.random() * 3)) % 4];
          cur = ink;
          render(`<div class="psub">MOT ${i + 1} / ${rounds} · SCORE ${score}</div><div class="stroop" style="color:${COLORS[ink][1]}">${COLORS[word][0]}</div>
            <div class="cgrid">${keys.map(k => `<button class="cbtn" data-c="${k}" style="background:${COLORS[k][1]}"></button>`).join('')}</div><div class="psub">LA COULEUR DE L'ENCRE</div>`);
          t0 = performance.now();
          $$('[data-c]', box).forEach(b => b.onclick = () => { total += performance.now() - t0; if (b.dataset.c === cur) { score++; SFX.tick(); } else { SFX.tock(); total += 1000; } i++; step(); });
        };
        intro();
        break;
      }

      case 'simon': {   // séquence de couleurs  →  { len }
        const keys = Object.keys(COLORS); let seq = [], pos = 0, playing = false;
        const render0 = (msg) => render(`<div class="psub">${esc(msg)}</div><div class="psub">NIVEAU ${seq.length}</div><div class="cgrid big">${keys.map(k => `<button class="cbtn" data-c="${k}" id="sb${k}" style="background:${COLORS[k][1]}"></button>`).join('')}</div>`);
        const NOTES = { R: 440, B: 330, V: 550, J: 660 };
        const flash = (k, ms) => new Promise(r => { const b = $('#sb' + k, box); if (!b) return r(); b.classList.add('lit'); SFX.note(NOTES[k], ms / 1000); setTimeout(() => { b.classList.remove('lit'); setTimeout(r, 120); }, ms); });
        const play = async () => {
          seq.push(keys[Math.floor(Math.random() * 4)]); pos = 0; playing = true; render0('REGARDE…');
          await new Promise(r => setTimeout(r, 500));
          for (const k of seq) await flash(k, Math.max(220, 520 - seq.length * 25));
          playing = false; render0('À TOI'); bind();
        };
        const bind = () => $$('[data-c]', box).forEach(b => b.onclick = async () => {
          if (playing) return; const k = b.dataset.c; const bb = $('#sb' + k, box); bb.classList.add('lit'); setTimeout(() => bb.classList.remove('lit'), 150);
          if (k === seq[pos]) { pos++; SFX.note(NOTES[k], 0.15); if (pos === seq.length) { playing = true; SFX.coin(); setTimeout(play, 600); } }
          else { SFX.fail(); vibrate(200); const len = seq.length - 1; render(`<div class="wait"><div class="big">RATÉ !</div><div class="muted">Niveau atteint : ${len}</div></div>`); setTimeout(() => once({ len }), 1000); }
        });
        render(`<div class="wait"><div class="big">SIMON DIT</div><div class="muted">Reproduis la séquence de couleurs.<br>Elle s'allonge à chaque niveau.</div><button class="btn red big" id="ok">GO ▶</button></div>`);
        $('#ok', box).onclick = () => { SFX.coin(); seq = []; play(); };
        break;
      }

      case 'chrono': {   // appuie à X secondes, écran aveugle  →  { err }
        const target = p.target || 10000; let t0 = 0;
        render(`<div class="wait"><div class="big">CHRONO HUMAIN</div><div class="muted">Appuie sur START, puis sur STOP quand tu penses que ${target / 1000} secondes sont passées.<br>Sans regarder l'heure.</div><button class="btn red big" id="ok">START ▶</button></div>`);
        $('#ok', box).onclick = () => {
          SFX.coin(); t0 = performance.now();
          render(`<div class="wait"><div class="muted">…</div><button class="btn yellow big" id="stop" style="min-height:160px">STOP</button><div class="muted">${target / 1000} secondes, à l'instinct</div></div>`);
          $('#stop', box).onclick = () => { const err = Math.round(performance.now() - t0 - target); SFX.select(); render(`<div class="wait"><div class="big">${err > 0 ? '+' : ''}${(err / 1000).toFixed(2)} s</div><div class="muted">${Math.abs(err) < 300 ? 'Horloge interne de compétition.' : Math.abs(err) < 1000 ? 'Pas mal.' : 'Le temps est relatif, paraît-il.'}</div></div>`); setTimeout(() => once({ err }), 1100); };
        };
        break;
      }

      case 'tap': {   // tape le plus vite possible  →  { taps }
        const secs = p.seconds || 5; let taps = 0, t0 = 0, iv = null;
        render(`<div class="wait"><div class="big">TAP BATTLE</div><div class="muted">${secs} secondes. Tape partout. Vite.</div><button class="btn red big" id="ok">GO ▶</button></div>`);
        $('#ok', box).onclick = () => {
          SFX.coin(); t0 = performance.now(); taps = 0;
          render(`<div class="tapzone" id="tz"><div class="tapn" id="tn">0</div><div class="psub" id="tt">${secs}.0</div></div>`);
          const tz = $('#tz', box);
          const hit = e => { e.preventDefault(); taps++; $('#tn', box).textContent = taps; SFX.tick(); };
          tz.addEventListener('pointerdown', hit);
          iv = setInterval(() => { const left = secs * 1000 - (performance.now() - t0); const tt = $('#tt', box); if (tt) tt.textContent = (Math.max(0, left) / 1000).toFixed(1); if (left <= 0) { clearInterval(iv); tz.removeEventListener('pointerdown', hit); SFX.alarm(); render(`<div class="wait"><div class="big">${taps} TAPS</div><div class="muted">${(taps / secs).toFixed(1)} par seconde</div></div>`); setTimeout(() => once({ taps }), 1000); } }, 50);
        };
        break;
      }

      case 'timer': {   // compte à rebours visible, puis bouton  →  'done'
        const secs = p.seconds || 20; let t0 = performance.now();
        render(`<div class="psub">${esc(p.sub || '')}</div><div class="ptitle">${esc(p.title)}</div><div class="timer" id="tm">${secs}</div><div class="tbar" id="tb"><div style="width:100%"></div></div>`);
        const iv = setInterval(() => { const left = Math.max(0, secs * 1000 - (performance.now() - t0)); const tm = $('#tm', box); if (!tm) return clearInterval(iv); const s = Math.ceil(left / 1000); if (tm.textContent != s) { tm.textContent = s; (s <= 3 ? SFX.tock : SFX.tick)(); } $('#tb', box).firstElementChild.style.width = (left / (secs * 1000) * 100) + '%'; if (left <= 3000) { tm.classList.add('warn'); $('#tb', box).classList.add('warn'); } if (left <= 0) { clearInterval(iv); SFX.alarm(); once('done'); } }, 50);
        break;
      }

      default: render(`<div class="wait"><div class="big">…</div></div>`);
    }
  }

  window.PJ.renderPrompt = renderPrompt;
})();
