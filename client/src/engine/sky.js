// Cielo, sol, luna, estrellas, nubes, niebla e iluminación con ciclo día/noche.
// t en [0,1): 0 = medianoche, 0.25 = amanecer, 0.5 = mediodía, 0.75 = atardecer.
import * as THREE from 'three';
import { settings } from '../core/settings.js';

const KEYS = [
  { t: 0.0, top: '#0a1230', bottom: '#1d2550', sun: 0.0, amb: 0.42, fog: '#161d3e' },
  { t: 0.2, top: '#101a3a', bottom: '#2e2f5a', sun: 0.0, amb: 0.42, fog: '#232850' },
  { t: 0.26, top: '#3b5ba8', bottom: '#ff9e6b', sun: 0.4, amb: 0.45, fog: '#d6a08a' },
  { t: 0.33, top: '#4a90e2', bottom: '#bfe3ff', sun: 1.0, amb: 0.75, fog: '#bfdcf2' },
  { t: 0.5, top: '#3a86e0', bottom: '#cdeaff', sun: 1.15, amb: 0.85, fog: '#cbe4f6' },
  { t: 0.67, top: '#4a8ad8', bottom: '#c9e3fb', sun: 1.0, amb: 0.75, fog: '#c4dcf0' },
  { t: 0.74, top: '#5a4b9e', bottom: '#ff8a5b', sun: 0.45, amb: 0.45, fog: '#c98a78' },
  { t: 0.8, top: '#141e44', bottom: '#3a3164', sun: 0.0, amb: 0.42, fog: '#232850' },
  { t: 1.0, top: '#0a1230', bottom: '#1d2550', sun: 0.0, amb: 0.42, fog: '#161d3e' },
];

function sample(t) {
  t = ((t % 1) + 1) % 1;
  let a = KEYS[0], b = KEYS[1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const f = (t - a.t) / (b.t - a.t || 1);
  const mix = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), f);
  return { top: mix(a.top, b.top), bottom: mix(a.bottom, b.bottom), fog: mix(a.fog, b.fog), sun: a.sun + (b.sun - a.sun) * f, amb: a.amb + (b.amb - a.amb) * f };
}

export class Sky {
  constructor(scene, { fog = true } = {}) {
    this.scene = scene;
    this.t = 0.35;
    this.useFog = fog;
    const uniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 12),
      new THREE.ShaderMaterial({
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
      }),
    );
    this.dome.renderOrder = -10;
    this.uniforms = uniforms;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight('#dfefff', '#5a6b3a', 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.2);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Disco solar y lunar
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(30, 20), new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(20, 20), new THREE.MeshBasicMaterial({ color: '#dfe7ff', fog: false }));
    scene.add(this.sunDisc, this.moonDisc);

    // Estrellas
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
      v.multiplyScalar(850);
      sp.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    scene.add(this.stars);

    // Nubes de bloques
    this.clouds = new THREE.Group();
    const cm = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, fog: false });
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group();
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(18 + Math.random() * 20, 5 + Math.random() * 4, 12 + Math.random() * 10), cm);
        b.position.set(k * 12 - n * 6, Math.random() * 3, Math.random() * 8);
        c.add(b);
      }
      c.position.set((Math.random() - 0.5) * 1100, 140 + Math.random() * 60, (Math.random() - 0.5) * 1100);
      this.clouds.add(c);
    }
    this.cloudMat = cm;
    scene.add(this.clouds);

    scene.fog = new THREE.Fog('#cbe4f6', 60, 400);
    this.applyQuality();
  }

  applyQuality() {
    const sh = settings.get('shadows');
    const size = sh === 'high' ? 2048 : 1024;
    this.sun.castShadow = sh !== 'off';
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const ext = sh === 'high' ? 70 : 45;
    const cam = this.sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = 400;
    cam.updateProjectionMatrix();
    this.drawDistance = settings.get('drawDistance');
  }

  get isNight() {
    const t = this.t;
    return t < 0.23 || t > 0.78;
  }

  update(dt, center, t = this.t) {
    this.t = ((t % 1) + 1) % 1;
    const s = sample(this.t);
    this.uniforms.top.value.copy(s.top);
    this.uniforms.bottom.value.copy(s.bottom);
    const ang = (this.t - 0.25) * Math.PI * 2; // 0 al amanecer
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize();
    const sunUp = dir.y > -0.05;
    const lightDir = sunUp ? dir : dir.clone().negate(); // de noche ilumina la luna
    this.sun.position.copy(center).addScaledVector(lightDir, 160);
    this.sun.target.position.copy(center);
    this.sun.intensity = sunUp ? s.sun * 1.25 : 0.35;
    this.sun.color.set(sunUp ? (s.sun < 0.6 ? '#ffc48a' : '#fff4e0') : '#9fb4ff');
    this.hemi.intensity = s.amb;
    this.hemi.color.copy(s.top).lerp(new THREE.Color('#ffffff'), 0.5);
    // El cielo se escala para quedar dentro de la distancia de dibujado de la cámara.
    const k = (this.drawDistance * 0.9) / 900;
    this.dome.position.copy(center);
    this.dome.scale.setScalar(k);
    this.sunDisc.position.copy(center).addScaledVector(dir, 800 * k);
    this.sunDisc.scale.setScalar(k);
    this.sunDisc.lookAt(center);
    this.moonDisc.position.copy(center).addScaledVector(dir, -800 * k);
    this.moonDisc.scale.setScalar(k);
    this.moonDisc.lookAt(center);
    this.stars.position.copy(center);
    this.stars.scale.setScalar(k);
    this.stars.material.opacity = Math.max(0, Math.min(1, (0.6 - s.amb) * 5));
    this.clouds.position.x = center.x * 0.6;
    this.clouds.position.z = center.z * 0.6;
    for (const c of this.clouds.children) {
      c.position.x += dt * 3;
      if (c.position.x > 600) c.position.x = -600;
    }
    this.cloudMat.color.copy(s.bottom).lerp(new THREE.Color('#ffffff'), 0.6);
    const fog = this.scene.fog;
    if (settings.get('fog') && this.useFog) {
      fog.color.copy(s.fog);
      fog.near = this.drawDistance * 0.35;
      fog.far = this.drawDistance;
    } else {
      fog.near = 1e5;
      fog.far = 1e6;
    }
  }
}
