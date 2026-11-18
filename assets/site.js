/* FLOSYS site — 3D scene, scroll choreography, Talk-to-Flo widget. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia('(max-width: 860px)').matches;

  /* ---------- Config: where the site gets a Flo web-call token ---------- */
  var FLOW = {
    // HQ endpoint that creates a Retell web-call access token for the Website Flo agent.
    tokenEndpoint: 'https://hq.flosys.org/api/public/website-flo/webcall',
    maxSeconds: 300
  };

  /* ---------- 3D scene ---------- */
  var scene, camera, renderer, orb, bars, stars, uniforms, clock, ready = false;
  var target = { x: 3.2, y: 0.6, scale: 0.38, hue: 0, wave: 1 };

  function initScene() {
    if (!window.THREE) return;
    var canvas = document.getElementById('scene');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 9);
    clock = new THREE.Clock();

    uniforms = {
      uTime: { value: 0 },
      uHue: { value: 0 },
      uWave: { value: 1 }
    };

    // Flo — five sound bars in the logo's colours (16 Nov 2026; she was a glass orb).
    // Each bar is a cylinder with a round cap at each end, so its height can change
    // without squashing the caps.
    var BAR_R = 0.2, BAR_X = [-1.2, -0.6, 0, 0.6, 1.2], BAR_H = [0.55, 1.15, 1.75, 1.15, 0.55], BAR_C = [0x7c3aed, 0xa78bfa, 0xffffff, 0xa78bfa, 0x7c3aed];
    var group = new THREE.Group();
    bars = [];
    for (var bi = 0; bi < 5; bi++) {
      var mat = new THREE.MeshBasicMaterial({ color: BAR_C[bi] });
      var body = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, 1, 32), mat);
      var top = new THREE.Mesh(new THREE.SphereGeometry(BAR_R, 32, 16), mat), bot = new THREE.Mesh(new THREE.SphereGeometry(BAR_R, 32, 16), mat);
      var bar = new THREE.Group(); bar.add(body); bar.add(top); bar.add(bot); bar.position.x = BAR_X[bi];
      bar.userData = { body: body, top: top, bot: bot, h: BAR_H[bi], cur: BAR_H[bi] };
      bars.push(bar); group.add(bar);
    }
    orb = { userData: { group: group } };
    group.position.x = mobile ? 1.4 : 3.2;
    group.position.y = mobile ? 2.4 : 0.6;
    group.scale.setScalar(mobile ? 0.28 : 0.38);
    scene.add(group);

    // Particle field.
    var N = mobile ? 380 : 800, pos = new Float32Array(N * 3), sz = new Float32Array(N);
    for (var k = 0; k < N; k++) {
      var r = 6 + Math.random() * 16, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[k * 3] = r * Math.sin(ph) * Math.cos(th); pos[k * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6; pos[k * 3 + 2] = -4 - Math.random() * 14;
      sz[k] = Math.random();
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    stars = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aSize; uniform float uTime; varying float vA; void main(){ vec3 p = position; p.y += sin(uTime*0.3 + p.x*0.4)*0.25; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (1.2 + aSize*2.4) * (150.0/ -mv.z); vA = 0.35 + aSize*0.65; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(0.78,0.68,1.0, a*vA*0.5); }'
    }));
    scene.add(stars);

    // Soft ambient glow plane behind the orb.
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShaderMaterial({
      uniforms: uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uHue; varying vec2 vUv; void main(){ float d = length(vUv-0.5); float a = smoothstep(0.5,0.0,d); a = a*a*0.55; vec3 c = mix(vec3(0.45,0.2,0.9), vec3(0.65,0.35,1.0), uHue); gl_FragColor = vec4(c, a); }'
    }));
    glow.position.z = -1.5;
    group.add(glow);

    window.addEventListener('resize', onResize);
    ready = true;
    animate();
  }

  function onResize() {
    if (!ready) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  var mouse = { x: 0, y: 0 }, drift = 0, talkMode = false, talkLive = false;
  window.addEventListener('pointermove', function (e) {
    mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function animate() {
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uHue.value += (target.hue - uniforms.uHue.value) * 0.02;
    uniforms.uWave.value += (target.wave - uniforms.uWave.value) * 0.02;
    var g = orb.userData.group;
    // Layered sines with unrelated frequencies read as random but never jump.
    var p = drift * Math.PI * 2, ex = mobile ? 1.5 : 3.6, ey = mobile ? 2.6 : 1.7;
    var px = (Math.sin(p * 1.7 + 0.4) * 0.55 + Math.sin(p * 3.1 + 2.1) * 0.3 + Math.sin(p * 0.9 + 4.0) * 0.15) * ex;
    var py = (Math.cos(p * 1.3 + 1.2) * 0.5 + Math.sin(p * 2.6 + 0.7) * 0.3 + Math.cos(p * 0.7 + 3.3) * 0.2) * ey + (mobile ? 0.6 : 0);
    var ps = (mobile ? 0.28 : 0.38) * (0.85 + 0.25 * Math.sin(p * 2.2 + 1.0));
    if (talkMode) {
      target.x = 0; target.y = mobile ? 0.9 : 0.7; target.scale = mobile ? 0.75 : 1.05;
      target.hue = 0.8; target.wave = talkLive ? 2.6 + Math.sin(t * 9) * 0.6 : 1.4;
    } else {
      target.x = px; target.y = py; target.scale = ps;
      target.hue = 0.5 + 0.5 * Math.sin(p * 1.5); target.wave = 1 + 0.8 * (0.5 + 0.5 * Math.sin(p * 2.4 + 0.5));
    }
    var k = talkMode ? 0.06 : 0.022;
    g.position.x += (target.x - g.position.x) * k;
    g.position.y += (target.y - g.position.y) * k;
    var s = g.scale.x + (target.scale - g.scale.x) * (talkMode ? 0.06 : 0.03);
    g.scale.set(s, s, s);
    g.rotation.y = Math.sin(t * 0.3) * 0.18 + (talkMode ? 0 : mouse.x * 0.25);
    g.rotation.x = Math.sin(t * 0.2) * 0.06 + (talkMode ? 0 : mouse.y * 0.12);
    // The bars: a slow breath at rest, a quiet ripple while she listens, a full bounce while she talks.
    var lvl = uniforms.uWave.value;
    for (var i = 0; i < bars.length; i++) {
      var u = bars[i].userData, want;
      if (talkMode && talkLive) want = u.h * (0.35 + 0.65 * Math.abs(Math.sin(t * 7.5 + i * 1.9)) * (0.7 + 0.3 * Math.sin(t * 3.1 + i)));
      else if (talkMode) want = u.h * (0.55 + 0.12 * Math.sin(t * 4.5 - i * 0.7));
      else want = u.h * (0.92 + 0.08 * Math.sin(t * 1.9 - i * 0.6) + 0.1 * (lvl - 1) * Math.sin(t * 3.3 + i * 1.3));
      u.cur += (want - u.cur) * 0.25;
      var len = Math.max(0.001, u.cur);
      u.body.scale.y = len; u.top.position.y = len / 2; u.bot.position.y = -len / 2;
    }
    stars.rotation.z = t * 0.01;
    camera.position.x += ((talkMode ? 0 : mouse.x * 0.3) - camera.position.x) * 0.03;
    camera.position.y += ((talkMode ? 0 : -mouse.y * 0.2) - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  /* ---------- Scroll choreography ---------- */
  function initScroll() {
    if (!window.gsap) return;
    gsap.registerPlugin(ScrollTrigger);

    // Hero reveal
    gsap.to('.hero .reveal', { opacity: 1, y: 0, duration: 1.1, stagger: 0.12, ease: 'power3.out', delay: 0.15 });

    // Flo wanders: a slow, smooth, pseudo-random path driven by scroll progress.
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: function (self) { drift = self.progress; } });

    // Capability tiles cascade in
    gsap.fromTo('.cap', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'power2.out', scrollTrigger: { trigger: '.cap-grid', start: 'top 85%' } });

    // Generic reveals
    gsap.utils.toArray('.sec-head, .price-card, .svc-card, .steps li, .teaser-grid > *, .contact-card, .transcript').forEach(function (el) {
      gsap.fromTo(el, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
    });

    // Transcript bubbles
    gsap.utils.toArray('.bubble').forEach(function (b, i) {
      gsap.to(b, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', scrollTrigger: { trigger: '.transcript', start: 'top 70%' }, delay: i * 0.22 });
    });

    // Glass panels tilt slightly on scroll velocity (desktop only)
    if (!mobile && !reduce) {
      var skew = gsap.quickTo('.panel', 'skewY', { duration: 0.6, ease: 'power3' });
      ScrollTrigger.create({ onUpdate: function (self) { skew(gsap.utils.clamp(-2.5, 2.5, self.getVelocity() / -500)); } });
    }
  }

  /* ---------- Nav ---------- */
  var menuBtn = document.getElementById('menuBtn'), menu = document.getElementById('mobileMenu');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = menu.hidden; menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
    });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }); });
  }

  /* ---------- Talk to Flo ---------- */
  var modal = document.getElementById('talk'), status = document.getElementById('talkStatus'), startBtn = document.getElementById('talkStart');
  var retell = null, callTimer = null;
  function openTalk(e) { if (e) e.preventDefault(); modal.hidden = false; document.body.style.overflow = 'hidden'; document.body.classList.add('talk-open'); talkMode = true; startBtn.focus(); }
  function closeTalk() { endCall(); modal.hidden = true; document.body.classList.remove('talk-open'); talkMode = false; document.body.style.overflow = ''; }
  document.querySelectorAll('[data-talk]').forEach(function (a) { a.addEventListener('click', openTalk); });
  document.querySelectorAll('[data-talk-close]').forEach(function (a) { a.addEventListener('click', closeTalk); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeTalk(); });
  if (location.hash === '#talk') openTalk();

  function setStatus(msg) { status.textContent = msg; }

  var retellMod = null;
  function loadRetell() {
    if (retellMod) return Promise.resolve(retellMod);
    // jsDelivr's +esm build bundles the SDK's dependencies. PINNED to an exact 3.x (31 Oct 2026):
    // Retell retired the v2 web-call mint on 18 Oct; HQ now mints on /v3, whose answer
    // (call id, access token, transport, ICE servers) only the 3.x SDK can start.
    return import('https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.3/+esm').then(function (m) { retellMod = m; return m; });
  }

  function endCall() {
    if (callTimer) { clearTimeout(callTimer); callTimer = null; }
    if (retell) { try { retell.stopCall(); } catch (e) {} retell = null; }
    talkLive = false; document.body.classList.remove('talk-live');
    startBtn.innerHTML = '<span class="pulse" aria-hidden="true"></span>Start talking';
    startBtn.disabled = false;
  }

  startBtn.addEventListener('click', function () {
    if (retell) { endCall(); setStatus('Conversation ended. Start again anytime.'); return; }
    startBtn.disabled = true;
    setStatus('Connecting to Flo…');
    fetch(FLOW.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: location.pathname }) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'bad response' }; }).then(function (d) { if (!r.ok || !d.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.kind = r.status === 429 ? 'limit' : 'token'; throw e; } return d; }); })
      .then(function (d) { return loadRetell().then(function () { return d; }); })
      .then(function (d) {
        var Client = retellMod && (retellMod.RetellWebClient || (retellMod.default && retellMod.default.RetellWebClient));
        if (!Client) throw new Error('sdk');
        retell = new Client();
        retell.on('call_started', function () { talkLive = true; document.body.classList.add('talk-live'); setStatus('Flo is listening. Ask her anything — or ask her to answer like your receptionist.'); startBtn.textContent = 'End conversation'; startBtn.disabled = false; });
        retell.on('call_ended', function () { endCall(); setStatus('Thanks for talking with Flo. Want a live demo? Call Flo at 346-683-4178.'); });
        retell.on('error', function () { endCall(); setStatus("Couldn't hold the call. Try again, or call 346-683-4178."); });
        callTimer = setTimeout(function () { endCall(); setStatus('That\'s the time limit for a chat here. For a full demo, call Flo at 346-683-4178.'); }, FLOW.maxSeconds * 1000);
        // v3 connection details from HQ (/api/public/website-flo/webcall): all four go to startCall.
        // The v3 gateway only sends call_started / call_ended / error — the handlers above are all we listen to.
        var cfg = { callId: d.call_id, accessToken: d.access_token, sampleRate: 24000 };
        if (d.transport) cfg.transport = d.transport;
        if (d.ice_servers && d.ice_servers.length) cfg.iceServers = d.ice_servers;
        return retell.startCall(cfg);
      })
      .catch(function (err) {
        endCall();
        if (err && err.kind === 'limit') setStatus('You\'ve reached the limit for browser chats for now. Call Flo at 346-683-4178.');
        else if (err && err.kind === 'token') setStatus('Flo\'s browser line isn\'t answering right now. Call 346-683-4178 and she\'ll answer there.');
        else setStatus('Couldn\'t start the call in this browser (' + ((err && err.message) || 'unknown') + '). Call Flo at 346-683-4178.');
        try { console.error('[flo]', err); } catch (e) {}
      });
  });

  /* ---------- capability grid ---------- */
  (function () {
    var detail = document.getElementById('capDetail'); if (!detail) return;
    var caps = document.querySelectorAll('.cap'), bodies = detail.querySelectorAll('.cap-body');
    function closeAll() { caps.forEach(function (c) { c.setAttribute('aria-expanded', 'false'); }); bodies.forEach(function (b) { b.hidden = true; }); detail.hidden = true; }
    caps.forEach(function (c) {
      c.addEventListener('click', function () {
        var open = c.getAttribute('aria-expanded') === 'true';
        closeAll(); if (open) return;
        c.setAttribute('aria-expanded', 'true'); detail.hidden = false;
        detail.querySelector('[data-for="' + c.dataset.cap + '"]').hidden = false;
        if (window.gsap) gsap.fromTo(detail, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
        var r = detail.getBoundingClientRect(); if (r.bottom > innerHeight) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });
    });
    detail.querySelector('[data-cap-close]').addEventListener('click', function () { closeAll(); if (window.ScrollTrigger) ScrollTrigger.refresh(); });
  })();

  /* ---------- hover & cursor ---------- */
  function initHover() {
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    // shine layer + 3D tilt on glass panels
    document.querySelectorAll('.panel').forEach(function (p) {
      var sh = document.createElement('i'); sh.className = 'shine'; p.appendChild(sh);
      if (!fine || reduce) return;
      p.addEventListener('pointermove', function (e) {
        var r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        p.style.setProperty('--mx', (x * 100) + '%'); p.style.setProperty('--my', (y * 100) + '%');
        p.style.transform = 'perspective(900px) rotateX(' + ((0.5 - y) * 5) + 'deg) rotateY(' + ((x - 0.5) * 6) + 'deg) translateY(-3px)';
      });
      p.addEventListener('pointerleave', function () { p.style.transform = ''; });
    });
    if (!fine || reduce) return;
    // magnetic buttons
    document.querySelectorAll('.btn').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.18) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.28 - 2) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
    // custom cursor
    var dot = document.createElement('div'), ring = document.createElement('div');
    dot.className = 'cur-dot'; ring.className = 'cur-ring';
    document.body.appendChild(dot); document.body.appendChild(ring); document.body.classList.add('cursor-on');
    var cx = innerWidth / 2, cy = innerHeight / 2, rx = cx, ry = cy;
    window.addEventListener('pointermove', function (e) { cx = e.clientX; cy = e.clientY; dot.style.transform = 'translate(' + (cx - 5.5) + 'px,' + (cy - 5.5) + 'px)'; }, { passive: true });
    (function loop() { rx += (cx - rx) * 0.18; ry += (cy - ry) * 0.18; ring.style.transform = 'translate(' + (rx - ring.offsetWidth / 2) + 'px,' + (ry - ring.offsetHeight / 2) + 'px)'; requestAnimationFrame(loop); })();
    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest('a, button, .panel, .avatar, .contact-item');
      document.body.classList.toggle('cur-hover', !!t);
    });
    document.addEventListener('pointerdown', function () { document.body.classList.add('cur-down'); });
    document.addEventListener('pointerup', function () { document.body.classList.remove('cur-down'); });
    document.addEventListener('mouseleave', function () { dot.style.opacity = 0; ring.style.opacity = 0; });
    document.addEventListener('mouseenter', function () { dot.style.opacity = 1; ring.style.opacity = 1; });
  }

  /* ---------- animated logo wave (every .mark on the page) ---------- */
  function initMark() {
    var paths = document.querySelectorAll('.mark path');
    if (!paths.length || reduce) return;
    paths.forEach(function (p) { p.classList.add('wave'); });
    var t0 = performance.now();
    (function tick(now) {
      var t = (now - t0) / 1000, d = 'M10 24';
      for (var i = 1; i <= 14; i++) {
        var x = 10 + i * 2, k = (x - 24) / 14, env = Math.exp(-k * k * 2.2);
        var y = 24 + env * (Math.sin(k * 7 - t * 4.2) * 7 + Math.sin(k * 15 + t * 6.1) * 2.5);
        d += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      paths.forEach(function (p) { p.setAttribute('d', d); });
      requestAnimationFrame(tick);
    })(t0);
  }

  /* ---------- boot ---------- */
  if (!reduce) initScene(); else { var c = document.getElementById('scene'); if (c) c.style.display = 'none'; }
  initScroll();
  initHover();
  initMark();
})();
// THE PRICE SHEET IS THE ONLY PLACE A PRICE LIVES (10 Nov 2026): the pricing cards are filled from HQ's public price
// list (hq.flosys.org/api/public/prices) so the site never disagrees with the Sale Card or an invoice. The numbers in
// the HTML are the sheet's as of the deploy — the page reads right with no script, and this only corrects it.
(function () {
  var sec = document.querySelector('[data-prices]');
  if (!sec || !window.fetch) return;
  var money = function (n) { return '$' + Number(n).toLocaleString('en-US'); };
  fetch(sec.getAttribute('data-prices'), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.ok || !Array.isArray(j.plans)) return;
    j.plans.forEach(function (p) {
      var card = sec.querySelector('[data-plan="' + p.id + '"]');
      if (!card) return;
      card.hidden = false;
      var set = function (f, v) { var el = card.querySelector('[data-field="' + f + '"]'); if (el && v != null) el.textContent = v; };
      set('monthly', money(p.monthly));
      set('setup', p.setup > 0 ? money(p.setup) + ' setup' : 'No setup fee');
      if (p.about_calls) set('about_calls', 'about ' + Number(p.about_calls).toLocaleString('en-US') + ' calls a month');
      var name = card.querySelector('h3'); if (name && p.label) name.textContent = p.label;
    });
    // a plan the sheet switched off leaves the page
    sec.querySelectorAll('[data-plan]').forEach(function (card) { if (!j.plans.some(function (p) { return p.id === card.getAttribute('data-plan'); })) card.hidden = true; });
    var over = sec.querySelector('[data-field="overage_line"]'); if (over && j.overage_line) over.textContent = j.overage_line;
  }).catch(function () { /* the sheet's numbers in the HTML stand */ });
})();
