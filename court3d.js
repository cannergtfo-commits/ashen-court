import * as THREE from './vendor/three.module.js';

const S = 0.02;
const Court3D = {
  ready: false,
  weather: 'storm',
  mount(canvas, art, props, world) {
    this.canvas = canvas;
    this.art = art;
    this.world = world;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070b12');
    this.scene.fog = new THREE.FogExp2('#0b1218', 0.035);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
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

    const hemi = new THREE.HemisphereLight('#8ea4c4', '#1a140e', 0.45);
    this.scene.add(hemi);
    this.moon = new THREE.DirectionalLight('#d5e2ff', 1.7);
    this.moon.position.set(-14, 26, 10);
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
    this.rim = new THREE.DirectionalLight('#6f8cff', 0.45);
    this.rim.position.set(10, 8, -12);
    this.scene.add(this.rim);
    this.ambient = new THREE.AmbientLight('#1c2430', 0.25);
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
      new THREE.MeshStandardMaterial({ map: this.stone, roughness: 0.92, metalness: 0.04, color: '#6a6258' })
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
    this.scene.fog.density = storm ? 0.055 : wet ? 0.04 : 0.02;
    this.rain.visible = wet;
    this.rain.material.opacity = storm ? 0.7 : 0.4;
    if (this.ground) {
      this.ground.material.roughness = wet ? 0.28 : 0.9;
      this.ground.material.metalness = wet ? 0.22 : 0.04;
      this.ground.material.color.set(wet ? '#4a514c' : '#6a6258');
    }
    this.moon.intensity = storm ? 0.7 : 1.7;
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
      this.ambient.intensity = 0.25 + this.flash * 2.4;
      this.moon.intensity = 0.7 + this.flash * 3;
    } else if (this.weather === 'storm') {
      this.ambient.intensity = 0.18;
    } else {
      this.ambient.intensity = 0.25;
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

function buildElf(kind, court) {
  const dark = kind === 'foe';
  const mage = kind === 'mage';
  const skin = std(dark ? '#8e97a6' : mage ? '#d2c0a4' : '#e0cbb0', { roughness: 0.72, metalness: 0.02, map: court.skinTex });
  const cloth = std(dark ? '#16181e' : mage ? '#17362e' : '#2c261c', { roughness: 0.86 });
  const metal = std(dark ? '#8b929c' : mage ? '#8fd6b0' : '#c6a56a', {
    roughness: dark ? 0.32 : 0.42,
    metalness: 0.74,
    map: dark ? court.armorTex : null
  });
  const hairMat = std(dark ? '#07080c' : mage ? '#241432' : '#2a1a12', { roughness: 0.55 });
  const root = new THREE.Group();
  const hips = pivot(root, 0, 0.96, 0);
  addMesh(hips, new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.18), cloth));
  const spine = pivot(hips, 0, 0.12, 0);
  addMesh(spine, new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.16), cloth), 0, 0.1, 0);
  const chest = pivot(spine, 0, 0.24, 0);
  addMesh(chest, new THREE.Mesh(new THREE.BoxGeometry(dark ? 0.46 : 0.36, 0.34, 0.2), dark ? metal : cloth), 0, 0.14, 0);
  if (dark) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.04), std('#ffffff', { map: court.portrait, roughness: 0.5, metalness: 0.25 }));
    addMesh(chest, plate, 0, 0.14, 0.12);
    for (const side of [-1, 1]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), metal);
      spike.position.set(side * 0.26, 0.32, 0);
      spike.rotation.z = side * -0.5;
      spike.castShadow = true;
      chest.add(spike);
    }
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.05), std('#101218', { map: court.portrait, roughness: 0.8, side: THREE.DoubleSide }));
    cape.position.set(0, -0.05, -0.16);
    chest.add(cape);
  }
  const head = pivot(chest, 0, 0.36, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), skin);
  skull.scale.set(0.92, 1.12, 0.95);
  skull.castShadow = true;
  skull.position.y = 0.1;
  head.add(skull);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, dark ? 0.18 : 0.12, 4), skin);
    ear.position.set(side * 0.12, 0.12, 0.02);
    ear.rotation.z = side * -1.15;
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), std(dark ? '#ff6a4a' : '#1a120e', { emissive: dark ? '#802010' : '#000000', emissiveIntensity: dark ? 0.8 : 0, roughness: 0.3 }));
    eye.position.set(side * 0.045, 0.12, 0.11);
    head.add(eye);
  }
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, dark ? 0.62 : 0.3, 0.18), hairMat);
  hair.position.set(0, dark ? 0.0 : 0.18, dark ? -0.02 : -0.02);
  hair.castShadow = true;
  head.add(hair);

  const armL = limb(chest, 0.28, 0.048, skin);
  armL.position.set(0.24, 0.22, 0);
  const foreL = limb(armL, 0.26, 0.04, mage ? std('#8fd6b0', { emissive: '#1c4a3a', emissiveIntensity: 0.35, metalness: 0.2 }) : skin);
  foreL.position.y = -0.28;
  const armR = limb(chest, 0.28, 0.05, dark ? metal : skin);
  armR.position.set(-0.24, 0.22, 0);
  const foreR = limb(armR, 0.26, 0.042, dark ? metal : skin);
  foreR.position.y = -0.28;
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(dark ? 0.045 : 0.035, dark ? 0.86 : 0.7, 0.012),
    std('#d5dde6', { metalness: 0.88, roughness: 0.22 })
  );
  blade.position.y = 0.32;
  if (dark) blade.rotation.z = 0.42;
  blade.castShadow = true;
  sword.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.04), metal);
  sword.add(guard);
  sword.position.y = -0.26;
  foreR.add(sword);

  const thighL = limb(hips, 0.42, 0.075, cloth);
  thighL.position.x = 0.1;
  const shinL = limb(thighL, 0.4, 0.055, dark ? metal : cloth);
  shinL.position.y = -0.42;
  const footL = addMesh(shinL, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), metal), 0, -0.42, 0.04);
  const thighR = limb(hips, 0.42, 0.075, cloth);
  thighR.position.x = -0.1;
  const shinR = limb(thighR, 0.4, 0.055, dark ? metal : cloth);
  shinR.position.y = -0.42;
  addMesh(shinR, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), metal), 0, -0.42, 0.04);

  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.05), new THREE.MeshBasicMaterial({ color: '#c44752' }));
  bar.position.set(0, 2.05, 0);
  root.add(bar);
  return { root, hips, spine, chest, head, armL, armR, foreL, foreR, thighL, thighR, shinL, shinR, bar, sword, footL };
}

function poseElf(rig, e, court) {
  const b = e.bones;
  rig.root.visible = e.hp > 0;
  rig.root.position.copy(court.to3(e.x, e.y, 0));
  const face = e.facing >= 0 ? -Math.PI / 2 : Math.PI / 2;
  rig.root.rotation.y = face;
  rig.hips.rotation.z = b.lean || 0;
  rig.hips.position.y = 0.96 + (b.hip || 0) * 0.003;
  rig.spine.rotation.x = (b.chest || 0) * 0.6;
  rig.chest.rotation.x = (b.chest || 0);
  rig.head.rotation.x = b.head || 0;
  rig.thighL.rotation.x = b.lLeg || 0;
  rig.thighR.rotation.x = b.rLeg || 0;
  rig.shinL.rotation.x = Math.max(0, -(b.lLeg || 0)) * 0.85;
  rig.shinR.rotation.x = Math.max(0, -(b.rLeg || 0)) * 0.85;
  rig.armL.rotation.x = b.lArm || 0;
  rig.foreL.rotation.x = Math.max(0, b.lArm || 0) * 0.45;
  let arm = b.rArm || 0;
  let elbow = arm < -0.3 ? -0.45 : 0.1;
  if (e.attackT > 0) {
    const swing = Math.sin((1 - Math.min(1, e.attackT / 0.44)) * Math.PI);
    arm = -1.35 + swing * 2.1;
    elbow = -0.2 - swing * 0.4;
    rig.chest.rotation.y = swing * 0.35 * (e.facing || 1);
  } else {
    rig.chest.rotation.y = 0;
  }
  rig.armR.rotation.x = arm;
  rig.foreR.rotation.x = elbow;
  const ratio = Math.max(0.04, e.hp / Math.max(1, (e.base && e.base.maxHp) || e.hp));
  rig.bar.scale.x = ratio;
  rig.bar.lookAt(court.camera.position);
}

window.Court3D = Court3D;
