import * as THREE from './vendor/three.module.js';

const S = 0.02;
const Court3D = {
  ready: false,
  weather: 'clear',
  mount(canvas, art, props, world) {
    this.canvas = canvas;
    this.art = art;
    this.world = world;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a2433');
    this.scene.fog = new THREE.FogExp2('#243044', 0.01);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.clock = 0;
    this.rigs = new Map();
    this.flash = 0;
    this.boltTimer = 2.4;

    const hemi = new THREE.HemisphereLight('#f2f6ff', '#8a7660', 1.25);
    this.scene.add(hemi);
    this.moon = new THREE.DirectionalLight('#fff6e4', 3.1);
    this.moon.position.set(-10, 22, 12);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.camera.near = 2;
    this.moon.shadow.camera.far = 70;
    this.moon.shadow.camera.left = -28;
    this.moon.shadow.camera.right = 28;
    this.moon.shadow.camera.top = 28;
    this.moon.shadow.camera.bottom = -28;
    this.moon.shadow.bias = -0.0004;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
    this.rim = new THREE.DirectionalLight('#d7e4ff', 1.15);
    this.rim.position.set(8, 12, -6);
    this.scene.add(this.rim);
    this.fill = new THREE.DirectionalLight('#ffe7c4', 0.9);
    this.fill.position.set(6, 9, 14);
    this.scene.add(this.fill);
    this.ambient = new THREE.AmbientLight('#f4efe4', 0.72);
    this.scene.add(this.ambient);

    const moonBall = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#efe8d4' })
    );
    moonBall.position.set(-18, 22, -16);
    this.scene.add(moonBall);

    this.skinTex = paintTex((g, n) => {
      g.fillStyle = '#9aa3b0';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        g.fillRect(Math.random() * n, Math.random() * n, 2, 2);
      }
    });
    this.armorTex = paintTex((g, n) => {
      g.fillStyle = '#2a2e36';
      g.fillRect(0, 0, n, n);
      g.strokeStyle = '#8d939e';
      g.lineWidth = 3;
      for (let y = 8; y < n; y += 22) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(n, y + 6);
        g.stroke();
      }
      g.fillStyle = '#cfc6b4';
      g.beginPath();
      g.arc(n / 2, n / 2, 28, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1c20';
      g.beginPath();
      g.arc(n / 2 - 10, n / 2 - 4, 4, 0, Math.PI * 2);
      g.arc(n / 2 + 10, n / 2 - 4, 4, 0, Math.PI * 2);
      g.fill();
    });
    this.portrait = makeTex(art.maelveth);
    this.stone = makeTex(art.stone, [8, 8]);
    this.mud = makeTex(art.mud, [6, 6]);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(world.w * S + 8, world.h * S + 8),
      new THREE.MeshStandardMaterial({ map: this.stone, roughness: 0.84, metalness: 0.02, color: '#c8bfb0' })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(8, world.h * S * 0.72),
      new THREE.MeshStandardMaterial({ map: this.mud, roughness: 0.35, metalness: 0.08, color: '#3a342c' })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.02;
    path.receiveShadow = true;
    this.scene.add(path);

    if (art.backdrop) {
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(70, 28, 18),
        new THREE.MeshBasicMaterial({ map: makeTex(art.backdrop), side: THREE.BackSide })
      );
      this.scene.add(sky);
    }

    this.propGroup = new THREE.Group();
    this.scene.add(this.propGroup);
    this.lights = [];
    for (const p of props) this.addProp(p);

    this.shadeMeshes = [];
    this.arrowGroup = new THREE.Group();
    this.scene.add(this.arrowGroup);

    const rainN = 2800;
    this.rainN = rainN;
    const positions = new Float32Array(rainN * 3);
    this.rainSpeed = new Float32Array(rainN);
    for (let i = 0; i < rainN; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
      this.rainSpeed[i] = 9 + Math.random() * 7;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainPos = positions;
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      color: '#d5e4f2', size: 0.045, transparent: true, opacity: 0.55, depthWrite: false
    }));
    this.scene.add(this.rain);
    this.applyWeather();
    this.camera.position.set(0, 9, 18);
    this.resize();
    this.ready = true;
  },
  resize() {
    if (!this.renderer) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  },
  cycleWeather() {
    const order = ['clear', 'rain', 'storm'];
    this.weather = order[(order.indexOf(this.weather) + 1) % order.length];
    this.applyWeather();
    return this.weather;
  },
  weatherName() {
    return this.weather === 'storm' ? 'storm' : this.weather === 'rain' ? 'rain' : 'clear';
  },
  applyWeather() {
    const storm = this.weather === 'storm';
    const wet = this.weather !== 'clear';
    this.scene.fog.density = storm ? 0.02 : wet ? 0.012 : 0.007;
    this.rain.visible = wet;
    this.rain.material.opacity = storm ? 0.45 : 0.28;
    if (this.ground) {
      this.ground.material.roughness = wet ? 0.45 : 0.82;
      this.ground.material.metalness = wet ? 0.08 : 0.02;
      this.ground.material.color.set(wet ? '#aeb6ae' : '#d5cbb8');
    }
    this.baseMoon = storm ? 2.5 : 3.1;
    this.moon.intensity = this.baseMoon;
    this.ambient.intensity = storm ? 0.62 : 0.72;
  },
  to3(x, y, lift) {
    const w = this.world;
    return new THREE.Vector3((x - w.w / 2) * S, lift || 0, (y - w.h / 2) * S);
  },
  pick(cx, cy, rect) {
    this.ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.hit)) return null;
    const w = this.world;
    return { x: this.hit.x / S + w.w / 2, y: this.hit.z / S + w.h / 2 };
  },
  addProp(p) {
    const at = this.to3(p.x, p.y, 0);
    let mesh;
    if (p.kind === 'tree') {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.1, 6), new THREE.MeshStandardMaterial({ color: '#2a2118', roughness: 0.9 }));
      trunk.position.y = 0.55;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 7), new THREE.MeshStandardMaterial({ color: '#1c2420', roughness: 0.85 }));
      crown.position.y = 2.1;
      crown.castShadow = true;
      g.add(trunk, crown);
      mesh = g;
    } else if (p.kind === 'brazier') {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.7, 8), new THREE.MeshStandardMaterial({ color: '#3a332c', metalness: 0.5, roughness: 0.45 }));
      bowl.position.y = 0.4;
      bowl.castShadow = true;
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#7dff6a' }));
      fire.position.y = 0.85;
      fire.name = 'fire';
      const light = new THREE.PointLight('#b6ff8a', 0, 4.5, 2);
      light.position.y = 1;
      g.add(bowl, fire, light);
      g.userData.light = light;
      g.userData.fire = fire;
      mesh = g;
    } else if (p.kind === 'arch') {
      const g = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ color: '#6c675f', roughness: 0.8, metalness: 0.05 });
      for (const side of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.2, 0.45), stone);
        col.position.set(side * 1.3, 1.6, 0);
        col.castShadow = true;
        g.add(col);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.4, 0.5), stone);
      lintel.position.y = 3.3;
      lintel.castShadow = true;
      g.add(lintel);
      mesh = g;
    } else if (p.kind === 'chest') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.45), new THREE.MeshStandardMaterial({
        map: makeTex(this.art[p.skin] || this.art.chestIron), roughness: 0.55, metalness: 0.35
      }));
      mesh.position.y = 0.28;
      mesh.castShadow = true;
    } else if (p.kind === 'statue') {
      mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.55, metalness: 0.1 }));
      mesh.position.y = 0.9;
      mesh.castShadow = true;
    } else if (p.kind === 'graves') {
      const g = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ color: '#4e5550', roughness: 0.75 });
      for (let i = 0; i < 3; i++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.08), stone);
        slab.position.set((i - 1) * 0.55, 0.4, 0);
        slab.castShadow = true;
        g.add(slab);
      }
      mesh = g;
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#8eb6ff' }));
      mesh.position.y = 1.2;
      const light = new THREE.PointLight('#8eb6ff', 0.6, 3.2, 2);
      light.position.y = 1.2;
      const g = new THREE.Group();
      g.add(mesh, light);
      mesh = g;
    }
    mesh.position.copy(at);
    mesh.userData.prop = p;
    this.propGroup.add(mesh);
  },
  rigFor(actor) {
    let rig = this.rigs.get(actor);
    if (!rig) {
      rig = buildElf(actor.kind, this);
      this.scene.add(rig.root);
      this.rigs.set(actor, rig);
    }
    return rig;
  },
  frame(state) {
    if (!this.ready) return;
    const now = performance.now();
    const dt = Math.min(0.05, this.clock ? (now - this.clock) / 1000 : 0.016);
    this.clock = now;
    for (const actor of state.actors) {
      if (!actor) continue;
      const rig = this.rigFor(actor);
      poseElf(rig, actor, this);
    }
    for (const child of this.propGroup.children) {
      const p = child.userData.prop;
      if (!p) continue;
      if (p.kind === 'brazier') {
        const on = !!p.lit;
        child.userData.light.intensity = on ? 2.4 : 0;
        child.userData.fire.visible = on;
      }
      if (p.kind === 'chest') {
        child.rotation.z = p.open ? -0.5 : 0;
      }
    }
    this.syncShades(state.shades);
    this.syncBolts(state.bolts);
    const focus = this.to3(state.controlled.x, state.controlled.y, 1.1);
    const desired = focus.clone().add(new THREE.Vector3(0, 8.2, 7.4));
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3.2));
    this.camera.lookAt(focus);
    this.moon.target.position.copy(focus);
    this.moon.target.updateMatrixWorld();
    this.stepWeather(dt, focus);
    this.renderer.render(this.scene, this.camera);
  },
  stepWeather(dt, focus) {
    const wet = this.weather !== 'clear';
    if (wet) {
      const pos = this.rainPos;
      for (let i = 0; i < this.rainN; i++) {
        pos[i * 3 + 1] -= this.rainSpeed[i] * dt;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3] = focus.x + (Math.random() - 0.5) * 22;
          pos[i * 3 + 1] = 8 + Math.random() * 6;
          pos[i * 3 + 2] = focus.z + (Math.random() - 0.5) * 22;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.position.set(0, 0, 0);
    }
    if (this.weather === 'storm') {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.flash = 1;
        this.boltTimer = 2.2 + Math.random() * 3.5;
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.2);
      this.ambient.intensity = 0.72 + this.flash * 1.2;
      this.moon.intensity = (this.baseMoon || 3.1) + this.flash * 2;
    } else {
      this.ambient.intensity = this.weather === 'storm' ? 0.62 : 0.72;
      this.moon.intensity = this.baseMoon || 3.1;
    }
  },
  syncShades(shades) {
    while (this.shadeMeshes.length < shades.length) {
      const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.7, 4, 8),
        new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.4, metalness: 0.2, emissive: '#143028', emissiveIntensity: 0.4 })
      );
      m.castShadow = true;
      this.scene.add(m);
      this.shadeMeshes.push(m);
    }
    shades.forEach((s, i) => {
      const m = this.shadeMeshes[i];
      m.visible = s.hp > 0;
      const p = this.to3(s.x, s.y, 0.7);
      m.position.copy(p);
    });
  },
  syncBolts(bolts) {
    while (this.arrowGroup.children.length < bolts.length) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: '#d6c496', metalness: 0.6, roughness: 0.3 }));
      this.arrowGroup.add(m);
    }
    this.arrowGroup.children.forEach((m, i) => {
      const b = bolts[i];
      if (!b) { m.visible = false; return; }
      m.visible = true;
      m.position.copy(this.to3(b.x, b.y, 1.1));
    });
  }
};

function paintTex(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  draw(c.getContext('2d'), 256);
  return makeTex(c);
}
function makeTex(source, repeat) {
  const t = new THREE.Texture(source);
  t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function std(color, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.12 }, extra));
}
function pivot(parent, x, y, z) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function addMesh(parent, mesh, x, y, z) {
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function limb(parent, len, radius, material) {
  const joint = pivot(parent, 0, 0, 0);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.05, len - radius * 2), 4, 8), material);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  joint.add(mesh);
  return joint;
}

function sliceFigure(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = d[i], gv = d[i + 1], b = d[i + 2];
      const mag = r > 140 && b > 140 && gv < 150 && (r + b) > gv * 2.1 && Math.abs(r - b) < 90;
      if (mag) { d[i + 3] = 0; continue; }
      if (d[i + 3] < 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  g.putImageData(im, 0, 0);
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  function crop(nx, ny, nw, nh) {
    const out = document.createElement('canvas');
    const sx = minX + nx * bw;
    const sy = minY + ny * bh;
    const sw = Math.max(2, nw * bw);
    const sh = Math.max(2, nh * bh);
    out.width = Math.max(2, Math.ceil(sw));
    out.height = Math.max(2, Math.ceil(sh));
    out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const tex = new THREE.CanvasTexture(out);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return { tex, aspect: out.width / out.height };
  }
  return {
    head: crop(0.3, 0.0, 0.4, 0.16),
    torso: crop(0.24, 0.14, 0.52, 0.28),
    armImgL: crop(0.0, 0.15, 0.3, 0.2),
    foreImgL: crop(0.0, 0.32, 0.3, 0.2),
    armImgR: crop(0.7, 0.15, 0.3, 0.2),
    foreImgR: crop(0.7, 0.32, 0.3, 0.22),
    thighImgL: crop(0.5, 0.42, 0.28, 0.26),
    shinImgL: crop(0.5, 0.66, 0.28, 0.34),
    thighImgR: crop(0.22, 0.42, 0.28, 0.26),
    shinImgR: crop(0.22, 0.66, 0.28, 0.34)
  };
}

function limbCard(part, height) {
  const width = Math.max(0.08, height * part.aspect);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: part.tex, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0.05,
      side: THREE.DoubleSide
    })
  );
  mesh.position.y = -height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.45, height * 0.8, 0.06),
    new THREE.MeshStandardMaterial({ color: '#3a332c', roughness: 0.7 })
  );
  slab.position.y = -height / 2;
  slab.position.z = -0.035;
  slab.castShadow = true;
  const joint = new THREE.Group();
  joint.add(slab);
  joint.add(mesh);
  return joint;
}

function buildElf(kind, court) {
  const src = kind === 'foe' ? court.art.modelMaelveth : kind === 'mage' ? court.art.modelSereth : court.art.modelVaelor;
  const parts = sliceFigure(src);
  const root = new THREE.Group();
  const hips = pivot(root, 0, 0.92, 0);
  const spine = pivot(hips, 0, 0.08, 0);
  const chest = pivot(spine, 0, 0.06, 0);
  const torso = limbCard(parts.torso, 0.62);
  torso.position.y = 0.28;
  chest.add(torso);
  const head = pivot(chest, 0, 0.58, 0);
  head.add(limbCard(parts.head, 0.36));
  const armR = limbCard(parts.armImgL, 0.34);
  armR.position.set(-0.2, 0.22, 0);
  chest.add(armR);
  const foreR = limbCard(parts.foreImgL, 0.36);
  foreR.position.y = -0.34;
  armR.add(foreR);
  const armL = limbCard(parts.armImgR, 0.34);
  armL.position.set(0.2, 0.22, 0);
  chest.add(armL);
  const foreL = limbCard(parts.foreImgR, 0.34);
  foreL.position.y = -0.34;
  armL.add(foreL);
  const thighR = limbCard(parts.thighImgR, 0.42);
  thighR.position.set(-0.09, -0.02, 0);
  hips.add(thighR);
  const shinR = limbCard(parts.shinImgR, 0.46);
  shinR.position.y = -0.42;
  thighR.add(shinR);
  const footR = pivot(shinR, 0, -0.46, 0.02);
  const thighL = limbCard(parts.thighImgL, 0.42);
  thighL.position.set(0.09, -0.02, 0);
  hips.add(thighL);
  const shinL = limbCard(parts.shinImgL, 0.46);
  shinL.position.y = -0.42;
  thighL.add(shinL);
  const footL = pivot(shinL, 0, -0.46, 0.02);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.055), new THREE.MeshBasicMaterial({ color: '#e15a5a' }));
  bar.position.set(0, 1.85, 0);
  root.add(bar);
  return { root, hips, spine, chest, head, armL, armR, foreL, foreR, thighL, thighR, shinL, shinR, footL, footR, bar };
}

function poseElf(rig, e, court) {
  const b = e.bones;
  const moving = e.speed() > 18;
  rig.root.visible = e.hp > 0;
  rig.root.position.copy(court.to3(e.x, e.y, 0));
  rig.root.rotation.y = e.facing >= 0 ? -Math.PI / 2 : Math.PI / 2;
  const bob = Math.abs(Math.sin(e.phase || 0)) * (moving ? 0.045 : 0.012);
  rig.hips.position.y = 0.92 + bob + (b.hip || 0) * 0.002;
  rig.hips.rotation.z = (b.lean || 0) * 0.8;
  rig.hips.rotation.y = ((b.lLeg || 0) - (b.rLeg || 0)) * 0.18;
  rig.spine.rotation.y = -rig.hips.rotation.y * 0.7;
  rig.spine.rotation.x = (b.chest || 0) * 0.8;
  rig.chest.rotation.x = Math.sin(e.phase || 0) * (moving ? 0.04 : 0.01);
  rig.head.rotation.x = (b.head || 0) - rig.chest.rotation.x;
  rig.head.rotation.y = -rig.hips.rotation.y * 0.4;
  rig.thighL.rotation.x = b.lLeg || 0;
  rig.thighR.rotation.x = b.rLeg || 0;
  rig.shinL.rotation.x = Math.max(0, b.lLeg || 0) * 1.15;
  rig.shinR.rotation.x = Math.max(0, b.rLeg || 0) * 1.15;
  rig.footL.rotation.x = -(rig.thighL.rotation.x + rig.shinL.rotation.x);
  rig.footR.rotation.x = -(rig.thighR.rotation.x + rig.shinR.rotation.x);
  rig.armL.rotation.x = (b.lArm || 0) * 0.9;
  rig.armL.rotation.z = 0.15;
  rig.foreL.rotation.x = Math.max(0.05, (b.lArm || 0) * 0.35);
  let arm = (b.rArm || 0) * 0.9;
  let elbow = Math.max(0.08, -arm * 0.25);
  rig.chest.rotation.y = 0;
  if (e.attackT > 0) {
    const u = 1 - Math.min(1, e.attackT / 0.44);
    const swing = Math.sin(u * Math.PI);
    arm = -2.2 + swing * 2.6;
    elbow = 0.2 + (1 - swing) * 0.9;
    rig.chest.rotation.y = (swing - 0.2) * 0.45;
    rig.hips.rotation.y += swing * 0.2;
  }
  rig.armR.rotation.x = arm;
  rig.armR.rotation.z = -0.15;
  rig.foreR.rotation.x = elbow;
  const ratio = Math.max(0.05, e.hp / Math.max(1, (e.base && e.base.maxHp) || e.hp));
  rig.bar.scale.x = ratio;
  rig.bar.lookAt(court.camera.position);
}

window.Court3D = Court3D;
