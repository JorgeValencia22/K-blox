// Coche deportivo de Slow Roads: carrocería de perfil suavizado con pintura de barniz, cristales,
// llantas de cinco radios con discos y pinzas, faros y pilotos que se encienden, alerón, difusor,
// escapes, retrovisores y matrícula. El origen está en el suelo, bajo el centro de gravedad; +z es delante.
import * as THREE from 'three';
import { CAR } from '../../../../shared/slowroads/car.js';
import { canvasTex } from '../galaxia/kit.js';

export const PAINTS = [
  ['rojo', '#c8102e'], ['azul', '#1f4fd8'], ['blanco', '#f1f1ee'], ['negro', '#15161a'], ['amarillo', '#f4c20d'],
  ['verde', '#0f7a4a'], ['naranja', '#f26a0f'], ['plata', '#b7bcc4'], ['morado', '#6a2bd8'],
];

function smoothShape(points, n = 220) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  curve.closed = true;
  return new THREE.Shape(curve.getSpacedPoints(n));
}

/** Perfil (z, y) extruido a lo ancho y centrado en x. */
function profileGeo(points, width, bevel, curveSegs = 220) {
  const shape = smoothShape(points, curveSegs);
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function plateTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#f4f4ef'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b3a8c'; g.fillRect(0, 0, 26, h);
    g.fillStyle = '#111'; g.font = '700 40px monospace'; g.textAlign = 'center'; g.fillText('KEST-01', w / 2 + 12, 46);
    g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  });
}

export function buildCar(paint = '#c8102e') {
  const root = new THREE.Group();
  const car = new THREE.Group(); // la carrocería se inclina; las ruedas siguen al suelo
  root.add(car);
  const m = {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#0a1017', metalness: 0.85, roughness: 0.06, clearcoat: 1 }),
    black: new THREE.MeshStandardMaterial({ color: '#0d0d0f', metalness: 0.3, roughness: 0.55 }),
    carbon: new THREE.MeshStandardMaterial({ color: '#17181b', metalness: 0.5, roughness: 0.35 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d7dae0', metalness: 1, roughness: 0.12 }),
    tire: new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 1, roughness: 0.2 }),
    disc: new THREE.MeshStandardMaterial({ color: '#7d8087', metalness: 0.9, roughness: 0.4 }),
    caliper: new THREE.MeshStandardMaterial({ color: '#d91c1c', roughness: 0.4 }),
    head: new THREE.MeshStandardMaterial({ color: '#e9f4ff', emissive: '#bfe0ff', emissiveIntensity: 0.4 }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a0b0b', emissive: '#ff1010', emissiveIntensity: 0.4 }),
    reverse: new THREE.MeshStandardMaterial({ color: '#cccccc', emissive: '#ffffff', emissiveIntensity: 0 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 }),
    seat: new THREE.MeshStandardMaterial({ color: '#25262b', roughness: 0.8 }),
  };

  // --- Carrocería (perfil lateral en z, y)
  const W = 1.84;
  const body = new THREE.Mesh(profileGeo([
    [2.06, 0.3], [2.12, 0.46], [2.0, 0.62], [1.55, 0.74], [0.95, 0.83], [0.2, 0.88], [-0.8, 0.9], [-1.5, 0.9], [-2.1, 0.8],
    [-2.28, 0.64], [-2.24, 0.42], [-2.1, 0.27], [-1.4, 0.2], [0, 0.18], [1.4, 0.2], [1.9, 0.24],
  ], W, 0.1), m.paint);
  body.castShadow = true;
  car.add(body);

  // --- Cabina: caras laterales de cristal y techo pintado
  const cabW = 1.5;
  const cabin = new THREE.Mesh(profileGeo([[1.02, 0.84], [0.62, 1.04], [0.2, 1.2], [-0.5, 1.23], [-1.0, 1.1], [-1.4, 0.93], [-1.42, 0.84], [-0.2, 0.82]], cabW, 0.06, 160), [m.glass, m.paint]);
  cabin.castShadow = true;
  car.add(cabin);
  // Parabrisas y luneta (planos de cristal sobre las pendientes)
  const glassPlane = (z0, y0, z1, y1, w0, w1) => {
    // Cuadrilátero de cristal entre dos bordes (z, y) con anchos distintos
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([-w0 / 2, y0, z0, w0 / 2, y0, z0, w1 / 2, y1, z1, -w1 / 2, y1, z1]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m.glass);
    return mesh;
  };
  car.add(glassPlane(1.0, 0.85, 0.63, 1.045, 1.46, 1.34));
  car.add(glassPlane(-1.01, 1.095, -1.38, 0.935, 1.3, 1.44));
  // Franja de techo y spoiler de la ventana trasera
  const roofTop = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.025, 1.0), m.paint);
  roofTop.position.set(0, 1.235, -0.15); roofTop.castShadow = true;
  car.add(roofTop);

  // --- Frontal: faros, parrilla, splitter
  const light = (x) => {
    const g = new THREE.Group();
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.075, 0.1), m.head);
    lens.position.set(0, 0, 0); g.add(lens);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.105), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 1.2 }));
    drl.position.set(0, -0.05, 0); g.add(drl);
    g.position.set(x, 0.58, 1.99); g.rotation.set(0.1, x > 0 ? -0.22 : 0.22, 0);
    return g;
  };
  car.add(light(0.64), light(-0.64));
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.17, 0.08), m.black);
  grille.position.set(0, 0.38, 2.07); car.add(grille);
  const grille2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.08), m.black);
  for (const x of [-0.72, 0.72]) { const v = grille2.clone(); v.position.set(x, 0.34, 2.04); v.rotation.y = x > 0 ? -0.25 : 0.25; car.add(v); }
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.34), m.carbon);
  splitter.position.set(0, 0.22, 2.0); car.add(splitter);
  const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.42), m.black);
  hoodVent.position.set(0, 0.792, 1.0); hoodVent.rotation.x = -0.1; car.add(hoodVent);

  // --- Trasera: pilotos, difusor, escapes, alerón, matrícula
  const tail = (x) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.075, 0.06), m.tail);
    g.position.set(x, 0.72, -2.27); g.rotation.y = x > 0 ? 0.12 : -0.12; return g;
  };
  car.add(tail(0.56), tail(-0.56));
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.05), m.tail);
  bar.position.set(0, 0.73, -2.285); car.add(bar);
  const backup = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), m.reverse);
  backup.position.set(0.18, 0.56, -2.265); car.add(backup);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), m.plate);
  plate.position.set(0, 0.55, -2.285); plate.rotation.y = Math.PI; car.add(plate);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.34), m.carbon);
  diffuser.position.set(0, 0.27, -2.12); diffuser.rotation.x = 0.28; car.add(diffuser);
  for (const x of [-0.55, 0.55]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.2, 16, 1, true), m.chrome);
    ex.rotation.x = Math.PI / 2; ex.position.set(x, 0.28, -2.3); car.add(ex);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.052, 16), m.black);
    inner.position.set(x, 0.28, -2.29); inner.rotation.y = Math.PI; car.add(inner);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.04, 0.3), m.carbon);
  wing.position.set(0, 1.12, -2.1); wing.rotation.x = 0.08; wing.castShadow = true; car.add(wing);
  for (const x of [-0.6, 0.6]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.16), m.carbon);
    st.position.set(x, 1.02, -2.06); car.add(st);
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.34), m.paint);
    end.position.set(x * 1.35, 1.14, -2.1); car.add(end);
  }

  // --- Detalles laterales: retrovisores, manillas, líneas de puertas, faldones
  for (const s of [-1, 1]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), m.paint);
    mir.position.set(s * 0.92, 0.98, 0.72); mir.rotation.y = s * 0.15; car.add(mir);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04), m.black);
    stem.position.set(s * 0.82, 0.93, 0.78); car.add(stem);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.46, 0.012), m.black);
    for (const z of [0.78, -0.45]) { const d = door.clone(); d.position.set(s * 0.923, 0.58, z); car.add(d); }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.025, 0.18), m.chrome);
    hl.position.set(s * 0.925, 0.74, -0.2); car.add(hl);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 1.9), m.carbon);
    skirt.position.set(s * 0.93, 0.27, 0.1); car.add(skirt);
    const arch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 24), m.black);
    arch1.rotation.z = Math.PI / 2;
    for (const z of [CAR.a, -CAR.b]) { const a = arch1.clone(); a.position.set(s * 0.925, 0.36, z); car.add(a); }
  }
  // Interior mínimo (se ve a través del cristal)
  for (const x of [-0.38, 0.38]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.5), m.seat);
    seat.position.set(x, 0.74, -0.05); car.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.1), m.seat);
    back.position.set(x, 0.98, -0.34); back.rotation.x = -0.12; car.add(back);
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.35), m.black);
  dash.position.set(0, 0.86, 0.72); car.add(dash);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 20), m.black);
  wheelS.position.set(-0.38, 0.96, 0.5); wheelS.rotation.x = -0.9; car.add(wheelS);

  // --- Ruedas (cada una: grupo de dirección → grupo de giro)
  const wheels = [];
  const makeWheel = (x, z, front) => {
    const steer = new THREE.Group();
    steer.position.set(x, CAR.wheelR, z);
    const spin = new THREE.Group();
    steer.add(spin);
    const side = x > 0 ? 1 : -1;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(CAR.wheelR, CAR.wheelR, front ? 0.25 : 0.29, 28), m.tire);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire);
    const hubZ = side * (front ? 0.128 : 0.148);
    const rimDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.03, 28), m.rim);
    rimDisc.rotation.z = Math.PI / 2; rimDisc.position.x = hubZ - side * 0.02; spin.add(rimDisc);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.018, 8, 28), m.chrome);
    lip.rotation.y = Math.PI / 2; lip.position.x = hubZ; spin.add(lip);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.045), m.rim);
      sp.position.set(hubZ + side * 0.004, 0, 0);
      const pivot = new THREE.Group();
      sp.position.y = 0.12; pivot.add(sp); pivot.rotation.x = (i / 5) * Math.PI * 2; pivot.position.x = hubZ;
      spin.add(pivot);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), m.black);
    hub.rotation.z = Math.PI / 2; hub.position.x = hubZ + side * 0.01; spin.add(hub);
    const dark = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.022, 24), m.black);
    dark.rotation.z = Math.PI / 2; dark.position.x = hubZ - side * 0.012; spin.add(dark);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.018, 24), m.disc);
    disc.rotation.z = Math.PI / 2; disc.position.x = side * 0.09; steer.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.13), m.caliper);
    cal.position.set(side * 0.11, 0.12, 0.08 * (front ? 1 : -1)); steer.add(cal);
    root.add(steer);
    wheels.push({ steer, spin, front });
  };
  const tx = CAR.track / 2 + 0.04;
  makeWheel(tx, CAR.a, true); makeWheel(-tx, CAR.a, true);
  makeWheel(tx, -CAR.b, false); makeWheel(-tx, -CAR.b, false);

  // --- Luces reales (faros)
  const beams = [];
  for (const x of [-0.62, 0.62]) {
    const sl = new THREE.SpotLight('#fff3dc', 0, 90, 0.5, 0.6, 1.2);
    sl.position.set(x, 0.65, 2.0);
    sl.target.position.set(x * 0.7, 0.2, 22);
    car.add(sl, sl.target);
    beams.push(sl);
  }
  // Sombra de contacto
  const shTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.05, -0.05);
  root.add(shadow);

  const api = {
    root, car, wheels, beams, mats: m, shadow,
    setPaint(hex) { m.paint.color.set(hex); },
    setLights(on, braking, reversing, night = 0) {
      m.head.emissiveIntensity = on ? 2.6 : 0.4;
      m.tail.emissiveIntensity = braking ? 2.4 : on ? 0.8 : 0.3;
      m.reverse.emissiveIntensity = reversing ? 2.5 : 0;
      for (const b of beams) b.intensity = on ? 120 + 380 * night : 0;
    },
    dispose() {
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      Object.values(m).forEach((x) => { x.map?.dispose?.(); x.dispose(); });
      shTex.dispose();
      shadow.material.dispose();
    },
  };
  return api;
}
