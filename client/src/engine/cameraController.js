// Cámara en tercera persona: sigue suavemente al objetivo, gira con ratón/táctil
// y se acerca automáticamente si una pared se interpone.
import * as THREE from 'three';
import { settings } from '../core/settings.js';

export class ThirdPersonCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = 0;
    this.pitch = 0.35;
    this.distance = 9;
    this.targetDistance = 9;
    this.minDist = 2.5;
    this.maxDist = 22;
    this.focus = new THREE.Vector3();
    this.current = new THREE.Vector3();
    this.first = true;
    this.height = 1.7;
    this.firstPerson = false;
    this.eye = 1.62;
    this.shake = 0;
  }

  look(dx, dy, wheel) {
    const s = 0.0025 * settings.get('sensitivity');
    this.yaw -= dx * s;
    this.pitch += dy * s * (settings.get('invertY') ? -1 : 1);
    this.pitch = this.firstPerson ? Math.max(-1.45, Math.min(1.45, this.pitch)) : Math.max(-0.9, Math.min(1.35, this.pitch));
    if (wheel) this.targetDistance = Math.max(this.minDist, Math.min(this.maxDist, this.targetDistance + wheel * 1.2));
  }

  /** Dirección "adelante" en el plano XZ según la cámara. */
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, target) {
    if (this.firstPerson) {
      // Ojos del personaje: la vista mira en sentido contrario al vector cámara→objetivo de la 3.ª persona
      const d = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      this.current.set(target.x, target.y + this.eye, target.z);
      this.camera.position.copy(this.current);
      if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
      this.camera.lookAt(this.camera.position.x - d.x, this.camera.position.y - d.y, this.camera.position.z - d.z);
      this.first = true; // al volver a 3.ª persona la cámara se coloca sin transición
      return;
    }
    this.focus.set(target.x, target.y + this.height, target.z);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 14);
    this.current.lerp(this.focus, k);
    this.first = false;
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 8);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // Evita atravesar paredes y el terreno
    let dist = this.distance;
    if (this.physics) {
      const hit = this.physics.raycast(this.current.x, this.current.y, this.current.z, dir.x, dir.y, dir.z, this.distance, 0.3);
      dist = Math.max(0.6, hit.dist - 0.3);
    }
    this.camera.position.copy(this.current).addScaledVector(dir, dist);
    this.camera.lookAt(this.current);
    if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
  }
}
