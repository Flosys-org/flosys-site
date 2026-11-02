/* THE ORB, EVERYWHERE (HQ revamp Phase 7, 2 Nov 2026) — flosys.org's copy of
 * HQ's components/flow-launcher.tsx: the same plain purple floating orb (92 px
 * desktop, 76 px phone), bottom-right, no frame, no label; the same bubble
 * "Click to talk to Flow" (× hides it for this session, it's back next
 * session); the same glow and breath, stilled under prefers-reduced-motion.
 * Click → the talk panel: voice with SALES FLOW (HQ mints the web call; the
 * Retell key never leaves HQ) or "Type instead" (HQ's /api/public/website-flo/chat,
 * the same Sales Flow by text). */
(function () {
  'use strict';
  var CHAT = 'https://hq.flosys.org/api/public/website-flo/chat';
  var KEY = 'flow:bubble-dismissed';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function openTalk() { var a = document.querySelector('[data-talk]'); if (a) a.click(); else location.hash = '#talk'; }

  /* ---------- the launcher ---------- */
  var wrap = el('div', 'flow-launcher' + (reduce ? ' still' : ''));
  wrap.setAttribute('data-testid', 'flow-launcher'); wrap.setAttribute('data-surface', 'website');
  var dismissed = false; try { dismissed = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  if (!dismissed) {
    var bubble = el('div', 'flow-bubble'); bubble.setAttribute('role', 'note'); bubble.setAttribute('data-testid', 'flow-bubble');
    var say = el('button', 'flow-bubble-say', 'Click to talk to Flow'); say.type = 'button'; say.addEventListener('click', openTalk);
    var x = el('button', 'flow-bubble-x', '&times;'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.setAttribute('data-testid', 'flow-bubble-dismiss');
    x.addEventListener('click', function () { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} bubble.remove(); });
    bubble.appendChild(say); bubble.appendChild(x); wrap.appendChild(bubble);
  }
  var orb = el('button', 'flow-orb', '<span class="flow-orb-body" aria-hidden="true"></span>');
  orb.type = 'button'; orb.setAttribute('aria-label', 'Talk to Flow'); orb.title = 'Talk to Flow';
  orb.setAttribute('data-testid', 'flo-orb'); orb.setAttribute('data-surface', 'website'); orb.setAttribute('data-launcher', 'flow');
  orb.addEventListener('click', openTalk);
  wrap.appendChild(orb);
  document.body.appendChild(wrap);

  /* ---------- "Type instead": Sales Flow by text ---------- */
  var panel = document.querySelector('#talk .talk-panel'); if (!panel) return;
  var box = el('div', 'flow-chat'); box.hidden = true;
  box.innerHTML = '<div class="flow-chat-log" aria-live="polite"></div><form class="flow-chat-form"><input class="flow-chat-in" type="text" maxlength="600" placeholder="Ask Flow anything…" aria-label="Message Flow" autocomplete="off"><button class="btn btn-primary" type="submit">Send</button></form>';
  var toggle = el('button', 'btn btn-glass flow-type-instead', 'Prefer to type? Chat with Flow'); toggle.type = 'button';
  var actions = panel.querySelector('.talk-actions'); (actions || panel).appendChild(toggle);
  panel.insertBefore(box, panel.querySelector('.fine'));
  var log = box.querySelector('.flow-chat-log'), form = box.querySelector('form'), input = box.querySelector('input');
  var history = [];
  function line(role, text) { var p = el('p', 'flow-chat-line ' + role); p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; }
  toggle.addEventListener('click', function () {
    box.hidden = false; toggle.hidden = true;
    var start = document.getElementById('talkStart'); if (start && /End/.test(start.textContent || '')) start.click();   // one at a time
    if (!history.length) line('flow', "Hi, I'm Flow, the AI receptionist from Flosys. Who do I have the pleasure of chatting with?");
    input.focus();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (input.value || '').trim(); if (!text) return;
    input.value = ''; line('you', text); history.push({ role: 'user', content: text });
    var wait = line('flow', '…'); input.disabled = true;
    fetch(CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-16), page: location.pathname }) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) { var reply = d && d.ok ? d.reply : ((d && d.error) || "Flow didn't answer — call her at 346-683-4178."); wait.textContent = reply; if (d && d.ok) history.push({ role: 'assistant', content: reply }); })
      .catch(function () { wait.textContent = "Flow didn't answer — call her at 346-683-4178."; })
      .then(function () { input.disabled = false; input.focus(); });
  });
})();
