/* FLOSYS site — 3D scene, scroll choreography, Talk-to-Flow widget. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia('(max-width: 860px)').matches;

  /* ---------- Config: where the site gets a Flow web-call token ---------- */
  var FLOW = {
    // HQ endpoint that creates a Retell web-call access token for the Website Flo agent.
    tokenEndpoint: 'https://hq.flosys.org/api/public/website-flo/webcall',
    maxSeconds: 300
  };

  /* ---------- 3D scene ---------- */
  var scene, camera, renderer, orb, core, wave, stars, uniforms, clock, ready = false;
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

    // Glass shell — fresnel rim, refracted-looking gradient, thin highlights.
    var shellMat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      vertexShader: [
        'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
        'void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;',
        ' vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);',
        ' gl_Position = projectionMatrix * viewMatrix * wp; }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime; uniform float uHue; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
        'vec3 hs(float h){ return mix(vec3(0.66,0.36,0.98), vec3(0.85,0.55,1.0), h); }',
        'void main(){',
        ' float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);',
        ' float band = 0.5 + 0.5*sin(vP.y*3.0 + uTime*0.8);',
        ' vec3 col = mix(vec3(0.30,0.12,0.60), hs(uHue), band*0.6+0.2);',
        ' vec3 rim = mix(vec3(0.77,0.71,0.99), vec3(1.0), f);',
        ' float spec = pow(max(dot(reflect(-vV, vN), normalize(vec3(0.6,0.9,0.4))),0.0), 40.0);',
        ' vec3 c = col*0.35 + rim*f*1.15 + spec*0.9;',
        ' float a = 0.10 + f*0.85 + spec*0.5;',
        ' gl_FragColor = vec4(c, a); }'
      ].join('\n')
    });
    orb = new THREE.Mesh(new THREE.SphereGeometry(1.55, 96, 96), shellMat);

    // Inner core — displaced, glowing, breathing with the "voice".
    var coreMat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: [
        'uniform float uTime; uniform float uWave; varying float vD; varying vec3 vN;',
        'float n(vec3 p){ return sin(p.x*3.1+uTime*1.3)*sin(p.y*2.7-uTime*1.1)*sin(p.z*3.3+uTime*0.9); }',
        'void main(){ float d = n(position)*0.14*uWave; vD = d; vN = normal;',
        ' vec3 p = position + normal*d; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uHue; varying float vD; varying vec3 vN;',
        'void main(){ float g = smoothstep(-0.14, 0.14, vD);',
        ' vec3 a = vec3(0.42,0.16,0.85); vec3 b = mix(vec3(0.75,0.45,1.0), vec3(0.95,0.75,1.0), uHue);',
        ' vec3 c = mix(a, b, g); float rim = pow(1.0-abs(vN.z),1.5);',
        ' gl_FragColor = vec4(c, 0.55 + rim*0.35); }'
      ].join('\n')
    });
    core = new THREE.Mesh(new THREE.SphereGeometry(0.78, 64, 64), coreMat);

    // Voice wave — a tube through the middle of the orb.
    var pts = [];
    for (var i = 0; i <= 120; i++) { var t = i / 120; pts.push(new THREE.Vector3(-1.25 + 2.5 * t, 0, 0)); }
    var curve = new THREE.CatmullRomCurve3(pts);
    var waveGeo = new THREE.TubeGeometry(curve, 120, 0.028, 8, false);
    wave = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: 0xe9d5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    wave.userData.base = waveGeo.attributes.position.array.slice();

    var group = new THREE.Group();
    group.add(core); group.add(wave); group.add(orb);
    group.position.x = mobile ? 1.4 : 3.2;
    group.position.y = mobile ? 2.4 : 0.6;
    group.scale.setScalar(mobile ? 0.28 : 0.38);
    scene.add(group);
    orb.userData.group = group;

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
    g.rotation.y = t * 0.12 + (talkMode ? 0 : mouse.x * 0.25);
    g.rotation.x = Math.sin(t * 0.2) * 0.08 + (talkMode ? 0 : mouse.y * 0.15);
    core.rotation.y = -t * 0.3; core.rotation.z = t * 0.15;
    // animate the wave tube
    var arr = wave.geometry.attributes.position.array, base = wave.userData.base;
    for (var i = 0; i < arr.length; i += 3) {
      var x = base[i], amp = 0.32 * uniforms.uWave.value;
      var env = Math.exp(-x * x * 1.1);
      arr[i + 1] = base[i + 1] + env * (Math.sin(x * 6.0 - t * 5.0) * amp + Math.sin(x * 13.0 + t * 7.0) * amp * 0.35);
      arr[i + 2] = base[i + 2] + env * Math.cos(x * 4.0 + t * 3.0) * amp * 0.3;
    }
    wave.geometry.attributes.position.needsUpdate = true;
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

  /* ---------- Talk to Flow ---------- */
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
    // jsDelivr's +esm build bundles the SDK's dependencies (livekit, eventemitter3).
    return import('https://cdn.jsdelivr.net/npm/retell-client-js-sdk@2.0.8/+esm').then(function (m) { retellMod = m; return m; });
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
        retell.on('call_started', function () { talkLive = true; document.body.classList.add('talk-live'); setStatus('Flo is listening. Ask her anything about FLOSYS.'); startBtn.textContent = 'End conversation'; startBtn.disabled = false; });
        retell.on('call_ended', function () { endCall(); setStatus('Thanks for talking with Flo. Want a live demo? Book a call with Josh.'); });
        retell.on('error', function () { endCall(); setStatus("Couldn't hold the call. Try again, or call 346-590-6353."); });
        callTimer = setTimeout(function () { endCall(); setStatus('That\'s the time limit for a chat here. For a full demo, book a call with Josh.'); }, FLOW.maxSeconds * 1000);
        return retell.startCall({ accessToken: d.access_token, sampleRate: 24000 });
      })
      .catch(function (err) {
        endCall();
        if (err && err.kind === 'limit') setStatus('You\'ve reached the limit for browser chats for now. Call 346-590-6353, or book a call with Josh.');
        else if (err && err.kind === 'token') setStatus('Flo\'s browser line isn\'t answering right now. Call 346-590-6353 and she\'ll answer there, or book a call with Josh.');
        else setStatus('Couldn\'t start the call in this browser (' + ((err && err.message) || 'unknown') + '). Call 346-590-6353, or book a call with Josh.');
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
