/* Procedural 3D plasma sculpture. No bitmap, animation library, or network dependency. */
window.createNyraPlasma = function createNyraPlasma(canvas, options = {}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { setPaused() {}, setSpeed() {}, burst() {}, reset() {}, destroy() {} };
  const TAU = Math.PI * 2, nodes = [...document.querySelectorAll('.agent')];
  const bloomCanvas = document.createElement('canvas'), bloom = bloomCanvas.getContext('2d');
  const colors = ['75,231,255', '80,167,255', '255,68,184', '255,170,133'];
  let seed = 31057;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let w = 0, h = 0, radius = 100, cx = 0, cy = 0, angle = .32, tilt = -.16, phase = 0;
  let paused = !!options.paused, speed = 1, zoom = 1, visible = true, frame = 0, previous = 0;
  let dragging = false, pointerX = 0, pointerY = 0, viewX = 0, viewY = 0, targetX = 0, targetY = 0, burstLife = 0;
  let glowStrength = 1, compact = false, lastNodeLayout = 0;
  const stars = Array.from({ length: 170 }, () => ({ x: random(), y: random(), z: random(), r: random() }));
  const filaments = Array.from({ length: 56 }, (_, i) => ({ theta: i / 56 * TAU + random() * .15, length: .45 + random() * 1.65, depth: (random() - .5) * 1.4, wave: random() * TAU, spread: .05 + random() * .19, color: i % 11 === 0 ? 3 : i % 3 === 0 ? 2 : i % 5 === 0 ? 1 : 0, strength: .45 + random() * .65 }));
  const wisps = Array.from({ length: 260 }, (_, i) => ({ a: i / 260 * TAU, b: random() * TAU, r: random(), phase: random() * TAU }));
  const motes = Array.from({ length: 330 }, () => ({ a: random() * TAU, r: .8 + random() * 2.2, z: (random() - .5) * 2, phase: random(), size: .25 + random() * .7 }));
  const sprites = colors.map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const s = sprite.getContext('2d'), g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(245,255,255,1)'); g.addColorStop(.08, `rgba(${color},.95)`); g.addColorStop(.22, `rgba(${color},.55)`); g.addColorStop(.48, `rgba(${color},.15)`); g.addColorStop(1, `rgba(${color},0)`);
    s.fillStyle = g; s.fillRect(0, 0, 64, 64); return sprite;
  });
  const mistSprites = colors.map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const s = sprite.getContext('2d'), g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${color},.7)`); g.addColorStop(.25, `rgba(${color},.45)`); g.addColorStop(.6, `rgba(${color},.12)`); g.addColorStop(1, `rgba(${color},0)`);
    s.fillStyle = g; s.fillRect(0, 0, 64, 64); return sprite;
  });
  const bound = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function project(x, y, z, spin = angle) {
    const cos = Math.cos(spin), sin = Math.sin(spin), x1 = x * cos + z * sin, z1 = z * cos - x * sin;
    const ct = Math.cos(tilt), st = Math.sin(tilt), y1 = y * ct - z1 * st, z2 = y * st + z1 * ct;
    const roll = -.24, xx = x1 * Math.cos(roll) - y1 * Math.sin(roll), yy = x1 * Math.sin(roll) + y1 * Math.cos(roll);
    const perspective = 5.5 / (5.5 - z2);
    return [cx + xx * radius * zoom * perspective + viewX * 10, cy + yy * radius * zoom * perspective + viewY * 7, z2];
  }
  function path(points) { ctx.beginPath(); for (let j = 0; j < points.length; j++) { if (!j) ctx.moveTo(points[j][0], points[j][1]); else ctx.lineTo(points[j][0], points[j][1]); } }
  function line(points, color, alpha, thickness = 1, bloom = true) {
    path(points);
    if (bloom) { ctx.strokeStyle = `rgba(${color},${alpha * .045})`; ctx.lineWidth = thickness * 11; ctx.stroke(); ctx.strokeStyle = `rgba(${color},${alpha * .1})`; ctx.lineWidth = thickness * 4; ctx.stroke(); }
    ctx.strokeStyle = `rgba(${color},${alpha})`; ctx.lineWidth = thickness; ctx.stroke();
  }
  function glow(x, y, size, color = 0, alpha = 1) { ctx.globalAlpha = bound(alpha, 0, 1); ctx.drawImage(sprites[color], x - size / 2, y - size / 2, size, size); ctx.globalAlpha = 1; }
  function filamentPoint(f, u, offset = 0) {
    const reach = .76 + u * (f.length + burstLife * .35);
    const twist = f.theta + Math.sin(u * 2.4 + phase * .16 + f.wave) * .19 * u + Math.sin(u * 9 + f.wave + phase * .55) * f.spread * u;
    const flutter = (Math.sin(u * 24 - phase * .7 + f.wave) * .027 + Math.sin(u * 71 + f.wave * 3 + phase * .3) * .006) * Math.sin(u * Math.PI);
    return project(Math.cos(twist) * reach + flutter + offset * u, Math.sin(twist) * reach * .89 + flutter, f.depth * u + Math.sin(u * 5 + phase * .18 + f.wave) * .17, angle * .56);
  }
  function drawBackground() {
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h);
    // Follow the page theme so the field never fights the surrounding surfaces.
    const styles = getComputedStyle(document.body);
    const accent = (styles.getPropertyValue('--accent') || '#67e8ff').trim();
    const light = document.body.classList.contains('theme-light');
    const [r, g, b] = (accent.match(/[0-9a-f]{2}/gi) || ['67', 'e8', 'ff']).map(hex => parseInt(hex, 16));
    const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.8);
    aura.addColorStop(0, `rgba(${r},${g},${b},.085)`); aura.addColorStop(.45, `rgba(${r},${g},${b},.05)`); aura.addColorStop(1, `rgba(${r},${g},${b},0)`); ctx.fillStyle = aura; ctx.fillRect(0, 0, w, h);
    stars.forEach(s => { const x = s.x * w + viewX * s.z * 8, y = s.y * h + viewY * s.z * 5; ctx.fillStyle = light ? `rgba(46,98,124,${.16 + s.z * .3})` : `rgba(116,186,220,${.12 + s.z * .22})`; ctx.fillRect(x, y, s.r > .94 ? 1.5 : .65, s.r > .94 ? 1.5 : .65); if (s.r > .985) glow(x, y, 12, 0, .25); });
    // Thin instrument rings give a stable frame of reference for the rotating volume.
    ctx.strokeStyle = light ? 'rgba(30,110,145,.22)' : '#2c91b52d'; ctx.lineWidth = .65;
    for (let ring = 0; ring < 2; ring++) { ctx.beginPath(); ctx.ellipse(cx, cy, radius * (1.42 + ring * .18) * zoom, radius * (.83 + ring * .03) * zoom, -.3 + ring * .8, 0, TAU); ctx.setLineDash(ring ? [2, 11] : []); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, r = radius * 1.23; const length = i % 6 ? 2 : 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * zoom, cy + Math.sin(a) * r * zoom); ctx.lineTo(cx + Math.cos(a) * (r + length) * zoom, cy + Math.sin(a) * (r + length) * zoom); ctx.strokeStyle = i % 6 ? (light ? 'rgba(30,110,145,.18)' : '#36769b21') : (light ? 'rgba(30,110,145,.36)' : '#5695b144'); ctx.stroke(); }
  }
  function drawFilaments(front) {
    filaments.forEach((f, index) => {
      const root = filamentPoint(f, .1); if ((root[2] > 0) !== front) return;
      const points = []; for (let i = 0; i <= 44; i++) points.push(filamentPoint(f, i / 44));
      const strength = f.strength * (front ? .95 : .45) * glowStrength;
      for (let segment = 0; segment < 4; segment++) {
        const fade = 1 - segment * .24;
        line(points.slice(segment * 11, segment * 11 + 12), colors[f.color], strength * fade, (index % 7 === 0 ? 1.3 : .85) * (1 - segment * .18), true);
      }
      if (index % 2 === 0) {
        const branch = [];
        for (let i = 0; i <= 26; i++) { const u = .36 + i / 26 * .55; const p = filamentPoint(f, u, Math.sin(f.wave) * .21 * (i / 26)); branch.push(p); }
        line(branch, colors[f.color], strength * .45, .45, false);
      }
      // Packets continuously leave the core along the electrical branches.
      const travel = (phase * (.13 + index % 3 * .015) + index * .127) % 1;
      const point = filamentPoint(f, travel), size = (index % 5 ? 9 : 19) * (1 - travel * .3);
      glow(point[0], point[1], size, f.color, (.3 + f.strength * .5) * (1 - travel * .65));
      if (index % 4 === 0) { const end = points[points.length - 1]; glow(end[0], end[1], 12, f.color, .25); }
    });
  }
  function drawCore() {
    // Additive turbulent wisps provide volume, rather than the appearance of a wire model.
    const clouds = wisps.map(wisp => {
      const a = wisp.a + phase * .035, b = wisp.b + phase * .12;
      const tube = .25 + Math.sin(a * 5 + wisp.phase + phase * .12) * .07;
      const rr = .65 + Math.cos(b) * tube;
      const point = project(Math.cos(a) * rr, Math.sin(a) * rr * 1.08, Math.sin(b) * tube * 1.7 + Math.sin(a * 2 + phase * .12) * .18);
      const pink = Math.sin(a * 2 - phase * .07 + .8) > .38;
      return { point, size: radius * zoom * (.34 + wisp.r * .34), color: pink ? 2 : 0, alpha: (.09 + wisp.r * .07) * glowStrength };
    }).sort((a, b) => a.point[2] - b.point[2]);
    clouds.forEach(cloud => { ctx.globalAlpha = cloud.alpha; ctx.drawImage(mistSprites[cloud.color], cloud.point[0] - cloud.size / 2, cloud.point[1] - cloud.size / 2, cloud.size, cloud.size); }); ctx.globalAlpha = 1;
    const contours = [];
    // Twisting toroidal strands have real depth and an irregular, turbulent silhouette.
    for (let band = 0; band < 25; band++) {
      const b = band / 25 * TAU, points = []; let averageZ = 0;
      for (let step = 0; step <= 130; step++) {
        const a = step / 130 * TAU, coil = b + a * (2.4 + Math.sin(b * 3) * .24) + phase * .16;
        const turbulence = Math.sin(a * 7 + b * 2 + phase * .5) * .055 + Math.sin(a * 19 - b * 3 + phase * .7) * .025;
        const thick = .29 + .06 * Math.sin(a * 3 + b + phase * .13);
        const rr = .64 + Math.cos(coil) * thick + turbulence;
        const p = project(Math.cos(a) * rr, Math.sin(a) * rr * 1.08, Math.sin(coil) * thick * 1.7 + Math.sin(a * 2 + phase * .12) * .18);
        averageZ += p[2]; points.push(p);
      }
      contours.push({ points, z: averageZ / 131, b, band });
    }
    contours.sort((a, b) => a.z - b.z);
    for (const contour of contours) {
      const alpha = (.34 + (contour.z + .6) * .3) * glowStrength;
      const color = contour.band % 3 === 0 ? colors[2] : contour.band % 9 === 0 ? colors[1] : colors[0];
      const offset = (contour.band * 17 + Math.floor(phase * 2)) % 130;
      const broken = [...contour.points.slice(offset, 130), ...contour.points.slice(0, offset)].slice(0, 72 + contour.band % 45);
      line(broken, color, alpha, contour.band % 4 === 0 ? 1 : .65, true);
      if (contour.band % 3 === 0) {
        const index = Math.floor((phase * 8 + contour.band * 2.7) % 130), p = contour.points[index];
        glow(p[0], p[1], 22 + 8 * Math.sin(contour.b + phase), contour.band % 3 === 0 ? 2 : 0, .55);
      }
    }
    // Broken, noisy discharge arcs interrupt the woven surface with luminous lightning.
    for (let arc = 0; arc < 23; arc++) {
      const start = arc * .71 + phase * .045, length = .38 + (arc % 5) * .19, points = [];
      for (let j = 0; j <= 48; j++) {
        const a = start + j / 48 * length, envelope = Math.sin(j / 48 * Math.PI);
        const noise = Math.sin(a * 39 + arc * 9 + phase * .5) * .015 + Math.sin(a * 71 + arc) * .009;
        const rr = .71 + Math.sin(a * 3 + arc * .3) * .08 + noise * envelope;
        points.push(project(Math.cos(a) * rr, Math.sin(a) * rr * 1.08, Math.sin(a * 2 + arc * .8) * .32));
      }
      line(points, arc % 3 === 0 ? '255,130,215' : '184,252,255', .82 * glowStrength, arc % 3 === 0 ? 1.5 : .8, true);
    }
    // Irregular hot spots form a bright cyan-white edge without flattening the structure.
    for (let i = 0; i < 13; i++) {
      const a = i / 13 * TAU + phase * .09, rr = .69 + Math.sin(a * 4 + phase * .12) * .04;
      const p = project(Math.cos(a) * rr, Math.sin(a) * rr * 1.12, Math.sin(a * 3 + phase * .1) * .2);
      glow(p[0], p[1], radius * (.42 + .16 * Math.sin(a + phase * .15)) * zoom, i % 3 === 0 ? 2 : 0, 1.05 * glowStrength);
    }
    // Fine speckles inside and around the plasma surface.
    motes.forEach((m, i) => { const r = m.r + ((phase * .08 + m.phase) % 1) * .22; const p = project(Math.cos(m.a + phase * .025) * r, Math.sin(m.a + phase * .025) * r * .84, m.z, angle * .45); ctx.fillStyle = `rgba(${i % 9 === 0 ? colors[2] : colors[0]},${(.08 + (m.z + 1) * .15) * glowStrength})`; ctx.beginPath(); ctx.arc(p[0], p[1], m.size, 0, TAU); ctx.fill(); });
  }
  function drawNodes() {
    const placement = [[-1.2, -.59, .35], [.95, -.9, -.3], [-1.04, .87, -.4], [1.24, .66, .3]];
    nodes.forEach((node, i) => {
      const [x, y, z] = placement[i];
      const movement = Math.sin(angle * .65 + i * 1.7) * .14;
      const position = [cx + (x + movement) * radius * (compact ? 1.12 : 1.26), cy + (y + Math.cos(angle * .65 + i) * .08) * radius * 1.12];
      const inset = compact ? Math.max(node.offsetWidth / 2 + 22, 64) : w < 1000 ? 220 : 280;
      position[0] = bound(position[0], inset, w - inset);
      const anchor = project(x * .58, y * .58, z);
      const active = options.getActivity?.().agent === node.dataset.agent;
      const colorIndex = [0, 2, 1, 3][i];
      line([anchor, [position[0] + (i % 2 ? -20 : 20), position[1]], position], colors[colorIndex], active ? .75 : .22, .65, false);
      if (phase - lastNodeLayout > .025 || paused || dragging || phase === 0) {
        node.style.transform = `translate3d(${position[0].toFixed(1)}px,${position[1].toFixed(1)}px,0) translate(-50%,-50%)`;
      }
      if (active) glow(anchor[0], anchor[1], 24, colorIndex, .8);
    });
    if (phase - lastNodeLayout > .025) lastNodeLayout = phase;
  }
  function draw() {
    if (!w || !h) return;
    const activity = options.getActivity?.() || {};
    glowStrength = 1.2 + (activity.busy ? .3 : 0) + (activity.speaking ? .2 + Math.sin(phase * 7) * .12 : 0) + burstLife * .65;
    drawBackground(); ctx.globalCompositeOperation = 'lighter';
    drawFilaments(false); drawCore(); drawFilaments(true); drawNodes();
    if (burstLife > .01) {
      const progress = 1 - burstLife, r = radius * (1 + progress * 2.7) * zoom;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * .66, -.24, 0, TAU); ctx.strokeStyle = `rgba(109,240,255,${burstLife * .36})`; ctx.lineWidth = 1 + burstLife * 2; ctx.stroke();
      glow(cx, cy, radius * 3.5 * zoom, 0, burstLife * .18);
    }
    // Low-resolution bloom keeps fine filaments crisp inside a soft, luminous plasma volume.
    bloom.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bloom.filter = 'blur(4px)'; bloom.drawImage(canvas, 0, 0, bloomCanvas.width, bloomCanvas.height); bloom.filter = 'none';
    ctx.globalAlpha = 1; ctx.drawImage(bloomCanvas, 0, 0, w, h); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    canvas.dataset.azimuth = (((angle * 180 / Math.PI) % 360 + 360) % 360).toFixed(1);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); w = rect.width; h = rect.height; compact = w <= 760;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bloomCanvas.width = Math.max(1, Math.round(w * .4)); bloomCanvas.height = Math.max(1, Math.round(h * .4));
    cx = w * .5; cy = h * (compact ? .43 : .45);
    radius = Math.min(h * .265, w * (compact ? .25 : w < 1000 ? .18 : .17));
    draw();
  }
  function animate(timestamp) {
    frame = 0; if (paused || !visible || document.hidden) return;
    if (timestamp - previous >= 32) {
      const dt = Math.min((timestamp - previous) / 1000, .06); previous = timestamp;
      phase += dt; if (!dragging) angle += dt * .28 * speed;
      burstLife = Math.max(0, burstLife - dt * .6); viewX += (targetX - viewX) * .06; viewY += (targetY - viewY) * .06;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function start() { if (!frame && !paused && visible && !document.hidden) { previous = performance.now(); frame = requestAnimationFrame(animate); } }
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function burst() { if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { burstLife = 0; draw(); return; } burstLife = 1; start(); }
  function pointerDown(event) { if (event.pointerType === 'touch') return; dragging = true; pointerX = event.clientX; pointerY = event.clientY; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); }
  function pointerMove(event) {
    const rect = canvas.getBoundingClientRect(); targetX = (event.clientX - rect.left) / w - .5; targetY = (event.clientY - rect.top) / h - .5;
    if (dragging) { angle += (event.clientX - pointerX) * .009; tilt = bound(tilt + (event.clientY - pointerY) * .005, -1, 1); pointerX = event.clientX; pointerY = event.clientY; draw(); }
  }
  function pointerUp() { dragging = false; canvas.classList.remove('dragging'); }
  function wheel(event) { if (compact) return; event.preventDefault(); zoom = bound(zoom - event.deltaY * .0006, .68, 1.32); draw(); }
  function keydown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); if (event.key === 'ArrowLeft') angle -= .12; if (event.key === 'ArrowRight') angle += .12; if (event.key === 'ArrowUp') tilt = bound(tilt - .1, -1, 1); if (event.key === 'ArrowDown') tilt = bound(tilt + .1, -1, 1); draw(); }
    if (event.key.toLowerCase() === 'b') burst();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; visible ? start() : stop(); }); intersectionObserver.observe(canvas);
  const visibility = () => document.hidden ? stop() : start(); document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', keydown);
  resize(); start();
  return {
    setPaused(value) { paused = value; burstLife = 0; paused ? stop() : start(); draw(); },
    setSpeed(value) { speed = bound(Number(value) || 1, .2, 2); },
    burst,
    reset() { angle = .32; tilt = -.16; zoom = 1; viewX = targetX = viewY = targetY = 0; draw(); },
    destroy() { stop(); resizeObserver.disconnect(); intersectionObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown); }
  };
};
