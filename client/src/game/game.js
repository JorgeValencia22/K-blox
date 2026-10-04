// Sesión de juego: une mundo, física, jugador local, jugadores remotos, vehículos,
// red, modo de juego, HUD y audio. Funciona en línea (sala del servidor) o en local
// (modo de prueba del editor).
import * as THREE from 'three';
import { NET } from '../../../shared/constants.js';
import { getBuiltinWorld } from '../../../shared/worlds/index.js';
import { insideObject, cycleToSkyTime } from '../../../shared/geometry.js';
import { engine } from '../engine/renderer.js';
import { Sky } from '../engine/sky.js';
import { input } from '../engine/input.js';
import { ThirdPersonCamera } from '../engine/cameraController.js';
import { settings } from '../core/settings.js';
import { store } from '../core/store.js';
import { net } from '../core/net.js';
import { audio } from '../audio/audio.js';
import { buildWorld, setGroupState, platformOffset, disposeWorld } from '../world/worldBuilder.js';
import { LocalPlayer, RemotePlayer } from './players.js';
import { Vehicle, driveGround, flyPlane } from './vehicles.js';
import { createClientMode } from './modes.js';
import { Hud } from '../ui/hud.js';
import { PauseMenu } from '../ui/pause.js';
import { toast } from '../ui/dom.js';
import { EMOTES } from '../avatar/avatarAnimator.js';
import { AdminPanel, isAdmin } from '../ui/adminPanel.js';

const EMOTE_KEYS = { Digit1: 'emote_wave', Digit2: 'emote_dance', Digit3: 'emote_cheer', Digit4: 'sit', Digit5: 'emote_spin', Digit6: 'emote_robot', Digit7: 'emote_flip' };
const FREE_EMOTES = ['emote_wave', 'emote_dance', 'emote_cheer', 'sit'];

export class Game {
  /**
   * opts.join: respuesta del servidor a room:join
   * opts.offline: { world, name } para probar mundos del editor
   * opts.onExit(reason): se llama al salir de la partida
   */
  constructor(opts) {
    this.opts = opts;
    this.offline = !!opts.offline;
    this.listeners = [];
    this.remotes = new Map();
    this.vehicles = new Map();
    this.sendAcc = 0;
    this.lightAcc = 0;
    this.paused = false;
    this.disposed = false;
    this.lastLook = 0;
    this.bubbles = new Map();
  }

  start() {
    const join = this.opts.join;
    this.world = this.offline ? this.opts.offline.world : join.world.builtin ? getBuiltinWorld(join.world.builtin) : join.world.data;
    this.title = this.offline ? this.opts.offline.name : join.room.name;
    this.room = this.offline ? null : join.room;
    this.meta = this.world.meta || { mode: 'custom' };
    // Administrador que mira la partida sin ser visto
    this.spectator = !this.offline && !!join.you.spectator;
    this.specTarget = this.spectator ? join.target || null : null;
    this.controlling = null; // jugador al que controla el admin
    this.controlledBy = null; // admin que controla a este jugador
    this.remoteCtl = null;
    this.adminFrozen = false;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, settings.get('drawDistance') + 50);
    this.sky = new Sky(scene, { fog: this.world.sky?.fog !== false });
    this.built = buildWorld(this.world, { terrainDetail: settings.get('terrainDetail'), shadows: settings.get('shadows') !== 'off' });
    scene.add(this.built.group);
    this.physics = this.built.physics;

    // Luces puntuales reutilizables (número fijo para no recompilar shaders)
    this.lightPool = [];
    for (let i = 0; i < (settings.get('pointLights') ?? 2); i++) {
      const l = new THREE.PointLight('#ffffff', 0, 16, 1.6);
      scene.add(l);
      this.lightPool.push(l);
    }

    const spawn = this.offline ? this.built.spawns[0] : join.you.spawn;
    this.player = new LocalPlayer(scene, store.user.avatar, spawn);
    this.cam = new ThirdPersonCamera(this.camera, this.physics);
    this.cam.yaw = 0; // cámara detrás del jugador, mirando hacia -z
    this.player.yaw = Math.PI;

    const vehicles = this.offline ? (this.world.vehicles || []).map((v) => ({ ...v, r: [0, (v.ry * Math.PI) / 180, 0] })) : join.vehicles;
    for (const v of vehicles) this.addVehicle(v);
    if (!this.offline) {
      for (const p of join.players) this.addRemote(p);
      for (const [id, open] of Object.entries(join.state.doors || {})) this.setDoor(id, open);
    }
    this.groupState = { street: true, ...(this.offline ? {} : join.state.groups) };
    for (const name of this.built.groupMats.keys()) setGroupState(this.built, name, this.groupState[name] !== false);
    for (const name of this.built.groupMeshes.keys()) setGroupState(this.built, name, this.groupState[name] !== false);

    this.hud = new Hud(this);
    if (this.spectator) this.player.model.root.visible = false;
    this.pause = new PauseMenu(this);
    this.mode = createClientMode(this.meta.mode, this, this.offline ? {} : join.mode || {});
    this.mode.decorate?.(this.player.model);
    for (const r of this.remotes.values()) this.mode.decorateRemote?.(r);
    this.hud.setPlayerCount(this.playerCount());
    if (!this.offline && isAdmin()) this.adminPanel = new AdminPanel(this);
    if (this.spectator) {
      if (!this.specTarget || !this.remotes.has(this.specTarget)) this.cycleSpectate(1);
      this.adminPanel?.toggle(true);
    }
    this.updateHint();
    if (!this.offline) this.bindNet();

    this.offClick = input.on('mousedown', () => {
      if (!this.paused && !this.hud.chatOpen && !input.isTouch) this.requestLock();
    });
    input.leftDragLook = true;
    this.offLock = input.on('pointerlock', (locked) => {
      this.hud.setLockHint(!locked && !input.isTouch);
      if (!locked && !this.paused && !this.hud.chatOpen && !this.disposed && !this.ignoreUnlock) this.openPause();
      this.ignoreUnlock = false;
    });
    this.offKey = input.on('key', (e) => this.onKey(e));
    this.offKeyUp = input.on('keyup', (e) => {
      if (e.code === 'Tab') this.hud.togglePlayerList(false);
    });

    engine.setView(this);
    if (this.mode.startAudio) this.mode.startAudio();
    else {
      audio.setAmbient('day');
      audio.startMusic();
    }
    this.hud.showCenter(this.title, this.spectator ? '👁️ Modo espectador (invisible)' : this.offline ? 'Modo de prueba' : 'Pulsa en la pantalla para controlar la cámara', 2600);
    return this;
  }

  requestLock() {
    input.lockPointer();
  }

  // --- Red --------------------------------------------------------------------
  bindNet() {
    const on = (ev, fn) => this.listeners.push(net.on(ev, fn));
    on('snap', (s) => {
      for (const e of s.players) {
        if (e.id === store.user.id) continue;
        const r = this.remotes.get(e.id);
        if (!r) continue;
        r.push(s.t, e);
        if (e.v) {
          const v = this.vehicles.get(e.v.id);
          if (v && v !== this.player.vehicle) v.pushRemote(s.t, e.v);
        }
      }
      if (s.m) this.mode.onSnap?.(s.m, s.t);
    });
    on('player:join', (p) => {
      this.addRemote(p);
      this.hud.setPlayerCount(this.playerCount());
    });
    on('player:leave', ({ id }) => {
      const r = this.remotes.get(id);
      if (r) { r.dispose(); this.remotes.delete(id); }
      this.hud.setPlayerCount(this.playerCount());
      if (!this.hud.playerList.classList.contains('hidden')) this.hud.renderPlayerList();
    });
    on('chat', (m) => this.hud.addChat(m));
    on('vehicle', (v) => {
      let veh = this.vehicles.get(v.id);
      if (!veh) veh = this.addVehicle(v);
      veh.driver = v.driver;
      if (!v.driver || v.driver !== store.user.id) {
        if (this.player.vehicle === veh && v.driver !== store.user.id) this.player.vehicle = null;
        if (!v.driver) { veh.buffer.length = 0; veh.setPose(v.p, v.r); veh.state.speed = 0; }
      } else if (this.player.vehicle !== veh) {
        this.boardVehicle(veh);
      }
    });
    on('vehicle:remove', ({ id }) => {
      const v = this.vehicles.get(id);
      if (!v) return;
      if (this.player.vehicle === v) this.player.vehicle = null;
      audio.engine(id, null, null, 0, false);
      v.dispose();
      this.vehicles.delete(id);
    });
    on('world:door', ({ id, open }) => this.setDoor(id, open, true));
    on('world:group', ({ group, on: state, by }) => {
      this.groupState[group] = state;
      setGroupState(this.built, group, state);
      audio.play('switch', this.player.position);
      if (by && by !== store.user.username) toast(`${by} ha ${state ? 'activado' : 'desactivado'} ${group === 'street' ? 'las farolas' : 'la fuente'}`);
    });
    on('correction', ({ p }) => {
      if (this.player.vehicle) {
        const s = this.player.vehicle.state;
        Object.assign(s, { x: p[0], y: p[1], z: p[2], speed: 0 });
        this.player.vehicle.applyPose();
      } else this.player.teleport(p);
    });
    on('respawn', ({ p }) => {
      this.player.dead = false;
      this.player.teleport(p);
    });
    on('objectives', (list) => this.hud.setObjectives(list));
    on('npc:say', ({ id, text }) => this.showBubble(id, text));
    on('reconnected', async () => {
      const r = await net.request('room:join', { roomId: this.room.id });
      if (r.error) {
        toast('No se pudo volver a la partida: ' + r.error, 'err');
        this.exit('reconnect');
        return;
      }
      toast('Reconectado', 'ok');
      // Sincroniza jugadores tras la reconexión
      for (const id of [...this.remotes.keys()]) if (!r.players.some((p) => p.id === id)) { this.remotes.get(id).dispose(); this.remotes.delete(id); }
      for (const p of r.players) if (!this.remotes.has(p.id)) this.addRemote(p);
      this.player.teleport([this.player.body.x, this.player.body.y, this.player.body.z]);
    });
    on('kicked', ({ reason }) => {
      toast(reason || 'Has sido expulsado de la partida', 'err', 5000);
      this.exit('kicked');
    });
    on('player:leave', ({ id }) => {
      if (this.spectator && id === this.specTarget) this.cycleSpectate(1);
      if (this.controlling === id) this.controlling = null;
    });
    // --- Acciones de un administrador sobre este jugador ---
    on('admin:kill', ({ by }) => { this.player.dead = false; this.die(`💀 ${by} (admin) te ha eliminado`); });
    on('admin:lose', ({ by, handled }) => {
      this.hud.showCenter('❌ HAS PERDIDO', `Decisión de ${by} (admin)`, 3000);
      audio.play('death');
      if (!handled) { this.player.dead = false; this.die('Has perdido'); }
    });
    on('admin:freeze', ({ on: v }) => {
      this.adminFrozen = v;
      this.hud.showCenter(v ? '🧊' : '🔥', v ? 'Un administrador te ha congelado' : 'Ya puedes moverte', 2000);
    });
    on('admin:launch', ({ power }) => {
      const b = this.player.body;
      if (this.player.vehicle) return;
      b.vy = power;
      b.onGround = false;
      b.ground = null;
      audio.play('bounce');
    });
    on('admin:tp', ({ p }) => this.player.teleport(p));
    on('admin:control', ({ on: v, by }) => {
      this.controlledBy = v ? by : null;
      this.remoteCtl = null;
      this.hud.showCenter('🎮', v ? `${by} (admin) te está controlando` : 'Vuelves a tener el control', 2500);
    });
    on('admin:ctl', (c) => { this.remoteCtl = { ...c, at: performance.now() }; });
    on('admin:target-left', ({ id }) => { if (this.specTarget === id) this.cycleSpectate(1); });
    for (const [ev, fn] of Object.entries(this.mode.netEvents || {})) on(ev, fn);
  }

  /** Espectador: cambia el jugador al que se mira. */
  setSpecTarget(id) {
    this.specTarget = id;
    const r = this.remotes.get(id);
    if (r) this.hud.showCenter('👁️', `Mirando a ${r.name}`, 1500);
  }

  cycleSpectate(dir) {
    const ids = [...this.remotes.values()].filter((r) => !r.npc).map((r) => r.id);
    if (!ids.length) { this.specTarget = null; return; }
    const i = ids.indexOf(this.specTarget);
    this.setSpecTarget(ids[(i + dir + ids.length) % ids.length]);
    this.adminPanel?.open && this.adminPanel.render();
  }

  playerCount() {
    let n = this.spectator ? 0 : 1;
    for (const r of this.remotes.values()) if (!r.npc && !r.bot) n++;
    return n;
  }

  /** Conversación con un NPC: el servidor responde con su frase y las opciones. */
  async talkTo(r, action) {
    if (this.offline) return;
    const res = await net.request('npc', { id: r.id, action });
    if (res.error) {
      toast(res.error, 'warn');
      return;
    }
    this.dialogueNpc = r;
    if (action === 'adios') {
      this.hud.showDialogue({ name: res.name, title: res.title, text: res.say, options: [] });
      setTimeout(() => this.dialogueNpc === r && this.closeDialogue(), 1500);
      return;
    }
    if (action === 'baile') this.player.playEmote('dance');
    // Libera el ratón para poder pulsar las opciones (sin abrir el menú de pausa)
    if (input.locked) {
      this.ignoreUnlock = true;
      input.unlockPointer();
    }
    this.hud.showDialogue({ name: res.name, title: res.title, text: res.say, options: res.options }, (opt) => this.talkTo(r, opt.id));
  }

  closeDialogue() {
    this.dialogueNpc = null;
    this.hud.hideDialogue();
  }

  addRemote(p) {
    if (this.remotes.has(p.id)) return;
    const r = new RemotePlayer(this.scene, p);
    this.remotes.set(p.id, r);
    this.mode?.decorateRemote?.(r);
    return r;
  }

  addVehicle(v) {
    const veh = new Vehicle(v, this.scene);
    this.vehicles.set(v.id, veh);
    if (v.driver === store.user?.id) this.boardVehicle(veh);
    return veh;
  }

  boardVehicle(veh) {
    this.player.vehicle = veh;
    this.player.seat = null;
    this.player.emote = null;
    veh.driver = store.user.id;
    veh.state.throttle = 0;
    this.updateHint();
  }

  setDoor(id, open, sound = false) {
    const e = this.built.objects.get(id);
    if (!e) return;
    e.open = open;
    e.colliders.forEach((c) => (c.enabled = !open));
    if (e.mesh) e.mesh.userData.targetOpen = open;
    if (sound) audio.play('door', { x: e.o.p[0], y: e.o.p[1], z: e.o.p[2] });
  }

  // --- Entrada ---------------------------------------------------------------
  onKey(e) {
    if (this.disposed) return;
    if (e.code === 'Escape' && this.hud.dialogueOpen && !this.paused) {
      this.closeDialogue();
      return;
    }
    if (e.code === 'Escape') {
      if (this.paused) this.pause.close();
      else this.openPause();
      return;
    }
    if (e.code === 'F2' && this.adminPanel) {
      e.preventDefault();
      this.adminPanel.toggle();
      return;
    }
    if (this.paused || this.hud.chatOpen) return;
    if (this.spectator && !this.controlling && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
      this.cycleSpectate(e.code === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.code === 'Enter' || e.code === 'Slash') {
      e.preventDefault();
      this.hud.openChat(e.code === 'Slash' ? '/' : '');
      return;
    }
    if (e.code === 'Tab') {
      this.hud.togglePlayerList(true);
      return;
    }
    if (this.hud.dialogueOpen && /^Digit[1-5]$/.test(e.code)) {
      this.hud.chooseDialogue(Number(e.code.slice(5)) - 1);
      return;
    }
    const emote = EMOTE_KEYS[e.code];
    if (emote && !this.player.vehicle && !this.mode.blockEmotes) this.tryEmote(emote);
  }

  tryEmote(id) {
    if (id === 'sit') {
      this.player.playEmote('sit');
      return;
    }
    if (!FREE_EMOTES.includes(id) && !store.owns(id)) {
      toast('Consigue este emote en la tienda', 'warn');
      return;
    }
    this.player.playEmote(EMOTES[id]);
  }

  openPause() {
    if (this.paused || this.disposed) return;
    this.paused = true;
    input.enabled = false;
    this.ignoreUnlock = true;
    input.unlockPointer();
    this.pause.open();
  }

  resume() {
    this.paused = false;
    input.enabled = true;
    if (!input.isTouch) this.requestLock();
  }

  updateHint() {
    const v = this.player?.vehicle;
    let lines;
    if (v && v.type === 'plane') lines = ['[Espacio]/[Shift] o [C] potencia  [W]/[S] morro', '[A]/[D] alabeo  [Q]/[R] timón  [E] salir'];
    else if (v) lines = ['[W]/[S] acelerar/frenar  [A]/[D] girar', '[Espacio] freno de mano  ' + (this.mode?.lockVehicle ? '[R] recolocar' : '[E] salir')];
    else lines = ['[WASD] mover  [Shift] correr  [Espacio] saltar', '[E] interactuar  [Enter] chat  [Tab] jugadores', '[1-7] emotes  [Esc] pausa'];
    this.hud?.setHint([...(this.mode?.hint || []), ...lines]);
    this.hud?.setVehicleTouch(v?.type || null);
  }

  // --- Bucle principal ----------------------------------------------------------
  now() {
    return this.offline ? Date.now() : net.serverNow();
  }

  update(dt) {
    if (this.disposed) return;
    const now = this.now();
    const tSec = now / 1000;

    for (const e of this.built.platforms) {
      const off = platformOffset(e.o, tSec);
      const x = e.o.p[0] + off[0], y = e.o.p[1] + off[1], z = e.o.p[2] + off[2];
      for (const c of e.colliders) this.physics.moveDynamic(c, x, y, z);
      e.mesh?.position.set(x, y, z);
    }

    const look = input.takeLook();
    if (!this.paused) {
      if (look.dx || look.dy) this.lastLook = now;
      this.cam.look(look.dx, look.dy, look.wheel);
    }

    const p = this.player;
    const move = input.moveVector();
    const veh = p.vehicle;
    if (veh && !this.paused) this.driveVehicle(veh, dt, move);
    else if (veh) veh.applyPose();
    let ctl = { move, run: input.down('ShiftLeft') || input.down('ShiftRight'), jump: input.pressed('Space'), jumpHeld: input.down('Space'), crouch: false };
    let camFwd = this.cam.forward();
    // Un administrador controla a este jugador: sus mandos sustituyen a los nuestros
    const rc = this.controlledBy && this.remoteCtl && performance.now() - this.remoteCtl.at < 600 ? this.remoteCtl : null;
    if (this.controlledBy) {
      ctl = { move: rc ? { x: rc.x, y: rc.y } : { x: 0, y: 0 }, run: !!rc?.run, jump: !!rc?.jump && !this.lastRcJump, jumpHeld: !!rc?.jump, crouch: false };
      this.lastRcJump = !!rc?.jump;
      if (rc) camFwd = new THREE.Vector3(-Math.sin(rc.yaw), 0, -Math.cos(rc.yaw));
    }
    if (this.controlling) ctl = { move: { x: 0, y: 0 }, run: false, jump: false, jumpHeld: false, crouch: false };
    this.mode.filterCtl?.(ctl, dt);
    p.frozen = this.paused || this.mode.frozen || this.adminFrozen || this.spectator;
    p.update(dt, ctl, this.physics, camFwd);
    // Primera persona (Kest Pesadilla): el cuerpo mira hacia donde mira la cámara y no se dibuja
    const fp = !!this.mode.firstPerson && !veh;
    this.cam.firstPerson = fp;
    if (fp) {
      p.yaw = this.cam.yaw + Math.PI;
      p.model.root.rotation.y = p.yaw;
      this.cam.eye = this.mode.eyeHeight?.() ?? 1.62;
    }
    if (fp !== !!this.wasFp) {
      p.model.root.visible = !fp;
      this.wasFp = fp;
    }

    this.adminPanel?.update(dt);
    if (!this.paused && !p.dead && !this.spectator) {
      this.checkTriggers();
      this.updateInteraction();
      if (this.dialogueNpc) {
        const r = this.dialogueNpc;
        if (!this.remotes.has(r.id) || Math.hypot(r.pos.x - this.player.body.x, r.pos.z - this.player.body.z) > 7) this.closeDialogue();
      }
      this.mode.update?.(dt);
    }

    // Cámara (detrás del vehículo si no se mueve el ratón)
    const spec = this.spectator ? this.remotes.get(this.specTarget) : null;
    const target = spec ? spec.pos : veh ? veh.state : p.body;
    if (veh && now - this.lastLook > 1200) {
      const want = veh.state.yaw + Math.PI;
      this.cam.yaw += Math.atan2(Math.sin(want - this.cam.yaw), Math.cos(want - this.cam.yaw)) * Math.min(1, dt * 2.5);
    }
    this.cam.height = veh ? (veh.type === 'plane' ? 2.6 : 1.8) : 1.7;
    this.cam.update(dt, target);

    const renderT = now - NET.interpDelayMs;
    for (const r of this.remotes.values()) r.update(dt, renderT, this.vehicles);
    for (const v of this.vehicles.values()) {
      if (v !== veh && v.driver && v.driver !== store.user.id) v.interpolate(renderT);
      v.animate(dt);
      if (settings.get('sfx') > 0) audio.engine(v.id, v.type, v === veh ? null : new THREE.Vector3(v.state.x, v.state.y, v.state.z), v.state.speed, !!v.driver);
    }
    this.animateWorld(dt, tSec);
    this.updateBubbles();

    // Cielo y luces
    const skyT = this.mode.skyTime?.(now) ?? (this.world.sky?.dayNight && settings.get('dayNight') ? cycleToSkyTime(tSec / 600 + 0.1) : this.world.sky?.time ?? 0.35);
    this.sky.update(dt, new THREE.Vector3(target.x, target.y, target.z), skyT);
    this.mode.afterSky?.(dt);
    this.lightAcc += dt;
    if (this.lightAcc > 0.3) {
      this.lightAcc = 0;
      this.updateLights(target);
      const amb = this.sky.isNight ? 'night' : 'day';
      if (amb !== this.ambient && !this.mode.customAudio) { this.ambient = amb; audio.setAmbient(amb); }
    }

    // Caída fuera del mapa
    const minY = this.world.bounds?.min[1] ?? -40;
    if (!p.dead && !this.spectator && target.y < minY) this.die('Has caído fuera del mapa');

    // Red
    this.sendAcc += dt;
    if (!this.offline && !this.spectator && this.sendAcc >= 1 / NET.clientSendRate) {
      this.sendAcc = 0;
      const b = p.body;
      const msg = { p: [round(b.x), round(b.y), round(b.z)], ry: round(p.yaw), a: p.netAnim() };
      if (veh) msg.v = veh.pose();
      net.send('state', msg);
    }
    audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.cam.yaw + Math.PI);
    input.endFrame();
  }

  driveVehicle(v, dt, move) {
    let res;
    const frozen = this.mode.frozen;
    if (v.type === 'plane') {
      res = flyPlane(v, {
        pitch: frozen ? 0 : -move.y,
        roll: frozen ? 0 : move.x,
        yaw: (input.down('KeyR') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0),
        // En táctil, el joystick al máximo activa 'correr' (Shift): ahí la potencia baja con su propio botón.
        throttleDelta: frozen ? 0 : (input.down('Space') ? 1 : 0) - ((input.down('ShiftLeft') && !input.isTouch) || input.down('KeyC') ? 1 : 0),
      }, dt, this.physics);
    } else {
      // Los modos pueden cambiar los controles del coche (turbo y salto en Kest Rocket)
      const extra = this.mode.vehicleCtl?.(v, dt) || {};
      res = driveGround(v, { throttle: frozen ? 0 : move.y, steer: move.x, brake: input.down('Space') || frozen, ...extra }, dt, this.physics);
      if (res.hit > 10) audio.play('hit');
    }
    if (res.crash) this.crashVehicle(v);
  }

  async crashVehicle(v) {
    audio.play('hit');
    this.hud.showCenter('💥 ¡Choque!', '', 1500);
    this.player.vehicle = null;
    if (this.offline) {
      v.setPose(v.spawn.p, v.spawn.r);
      v.state.speed = 0;
      v.state.onGround = true;
      this.player.teleport(this.built.spawns[0]);
      return;
    }
    const r = await net.request('respawn', { resetVehicle: true });
    if (r.p) this.player.teleport(r.p);
    this.updateHint();
  }

  // --- Disparadores e interacción -------------------------------------------
  checkTriggers() {
    const b = this.player.body;
    const pos = [b.x, b.y + 0.9, b.z];
    for (const e of this.built.triggers) {
      const o = e.o;
      if (e.hidden) continue;
      const pad = o.t === 'zone' ? 0 : 0.35;
      const padY = o.t === 'zone' ? 0 : o.t === 'jumppad' || o.t === 'checkpoint' || o.t === 'finish' ? 1.2 : 0.9;
      if (!insideObject(pos, o, pad, padY)) {
        if (e.inside) { e.inside = false; this.mode.onTriggerExit?.(e); }
        continue;
      }
      const entered = !e.inside;
      e.inside = true;
      if (this.mode.onTrigger?.(e, entered)) continue;
      switch (o.t) {
        case 'kill':
          this.die('¡Lava!');
          return;
        case 'jumppad':
          if (b.vy <= 1) {
            b.vy = o.power || 24;
            b.onGround = false;
            b.ground = null;
            audio.play('bounce');
          }
          break;
        case 'coin':
        case 'gem':
          if (entered) this.collect(e);
          break;
        default:
          break;
      }
    }
  }

  async collect(e) {
    if (e.hidden || e.pending) return;
    e.pending = true;
    if (this.offline) {
      this.hideObject(e);
      audio.play(e.o.t === 'gem' ? 'gem' : 'coin');
      this.mode.onCollect?.(e);
      return;
    }
    const r = await net.request('interact', { id: e.o.id });
    e.pending = false;
    if (r.ok) {
      this.hideObject(e);
      audio.play(e.o.t === 'gem' ? 'gem' : 'coin');
      this.mode.onCollect?.(e);
    } else if (r.error && /Ya /.test(r.error)) this.hideObject(e);
  }

  hideObject(e) {
    e.hidden = true;
    if (e.mesh) e.mesh.visible = false;
  }

  /** Busca el objeto interactuable más cercano y muestra la indicación. */
  updateInteraction() {
    const p = this.player;
    const b = p.body;
    let best = null, bestD = Infinity, label = null;
    if (p.vehicle) {
      if (!this.mode.lockVehicle) { best = { kind: 'exit' }; label = 'Salir del vehículo'; }
    } else {
      for (const e of this.built.interactables) {
        if (e.hidden) continue;
        const o = e.o;
        const reach = Math.max(o.s[0], o.s[2]) / 2 + 2;
        const d = Math.hypot(b.x - o.p[0], b.z - o.p[2]);
        if (d > reach || Math.abs(b.y + 1 - o.p[1]) > o.s[1] / 2 + 2.5 || d >= bestD) continue;
        const l = this.mode.promptFor?.(e) ?? defaultPrompt(e);
        if (!l) continue;
        best = { kind: 'object', e };
        bestD = d;
        label = l;
      }
      for (const r of this.remotes.values()) {
        if (!r.npc) continue;
        const d = Math.hypot(b.x - r.pos.x, b.z - r.pos.z);
        // Los NPC tienen prioridad sobre objetos cercanos (p. ej. el banco en el que están sentados)
        if (d < 3.2 && d - 2 < bestD && Math.abs(b.y - r.pos.y) < 2.5) {
          best = { kind: 'npc', r };
          bestD = d - 2;
          label = `Hablar con ${r.name}`;
        }
      }
      for (const v of this.vehicles.values()) {
        if (v.driver || this.mode.lockVehicle) continue;
        const d = Math.hypot(b.x - v.state.x, b.z - v.state.z);
        if (d < 4.5 && d < bestD && Math.abs(b.y - v.state.y) < 3) {
          best = { kind: 'vehicle', v };
          bestD = d;
          label = v.type === 'plane' ? 'Pilotar avioneta' : v.type === 'kart' ? 'Conducir kart' : 'Conducir coche';
        }
      }
      // Interacciones propias del modo (roer tablones, coger troncos...)
      for (const c of this.mode.interactions?.(b) || []) {
        if (c.d < bestD) {
          best = { kind: 'mode', c };
          bestD = c.d;
          label = c.label;
        }
      }
    }
    this.hud.setPrompt('E', label);
    if (input.isTouch && this.hud.touchAction) this.hud.touchAction.style.opacity = best ? 1 : 0.35;
    if (best && input.pressed('KeyE')) this.interact(best);
  }

  async interact(t) {
    const p = this.player;
    if (t.kind === 'npc') return this.talkTo(t.r, 'hola');
    if (t.kind === 'mode') return t.c.act();
    if (t.kind === 'exit') {
      const v = p.vehicle;
      if (!this.offline) {
        const r = await net.request('vehicle:exit');
        if (r.error) return toast(r.error, 'warn');
      }
      p.vehicle = null;
      v.driver = null;
      v.state.speed = 0;
      // Baja por el lado izquierdo (o derecho si está bloqueado)
      const s = v.state;
      for (const side of [1, -1, 0]) {
        const off = side === 0 ? [0, 2.5, 0] : [Math.cos(s.yaw) * 2.2 * side, 0.6, -Math.sin(s.yaw) * 2.2 * side];
        const pos = [s.x + off[0], s.y + off[1], s.z + off[2]];
        if (!this.physics.pointBlocked(pos[0], pos[1] + 1, pos[2]) || side === 0) {
          p.teleport(pos);
          break;
        }
      }
      this.updateHint();
      return;
    }
    if (t.kind === 'vehicle') {
      if (!this.offline) {
        const r = await net.request('vehicle:enter', { id: t.v.id });
        if (r.error) return toast(r.error, 'warn');
      }
      this.boardVehicle(t.v);
      audio.play('door', p.position);
      return;
    }
    const e = t.e;
    if (this.mode.onInteract?.(e)) return;
    const o = e.o;
    if (o.t === 'seat') {
      p.sitOn(o);
      return;
    }
    if (this.offline) {
      if (o.t === 'door') this.setDoor(o.id, !e.open, true);
      if (o.t === 'switch') {
        this.groupState[o.group] = !(this.groupState[o.group] !== false);
        setGroupState(this.built, o.group, this.groupState[o.group]);
        audio.play('switch');
      }
      return;
    }
    const r = await net.request('interact', { id: o.id });
    if (r.error) {
      toast(r.error, 'warn');
      return;
    }
    if (o.t === 'chest' && r.opened) {
      e.opened = true;
      if (e.mesh) e.mesh.userData.targetOpen = true;
      audio.play('chest', p.position);
    }
  }

  die(reason) {
    const p = this.player;
    if (p.dead) return;
    if (this.mode.onDie?.(reason)) return;
    p.dead = true;
    audio.play('death');
    this.hud.showCenter('💀', reason, 1200);
    if (p.vehicle) p.vehicle = null;
    setTimeout(() => this.respawn(), 1100);
  }

  async respawn() {
    if (this.disposed) return;
    const p = this.player;
    let pos = null;
    if (this.offline) pos = this.mode.localRespawn?.() || this.built.spawns[0];
    else {
      const r = await net.request('respawn', {});
      pos = r.p || this.built.spawns[0];
    }
    p.teleport(pos);
    p.dead = false;
    this.updateHint();
  }

  // --- Efectos visuales --------------------------------------------------------
  animateWorld(dt, t) {
    for (const e of this.built.animated) {
      const m = e.mesh;
      if (!m || !m.visible) continue;
      const o = e.o;
      if (o.t === 'coin' || o.t === 'gem') {
        m.rotation.y += dt * 2.5;
        m.position.y = o.p[1] + Math.sin(t * 3 + o.p[0]) * 0.15;
      } else if (o.t === 'kill') {
        const k = 0.75 + Math.sin(t * 6) * 0.25;
        m.children[0].material.color?.setRGB?.(1, 0.25 * k, 0.05);
      } else if (o.dance) {
        const hue = (t * 0.25 + (o.p[0] + o.p[2]) * 0.05) % 1;
        m.children[0].material = danceMat(Math.floor(hue * 12));
      }
      m.traverse((c) => {
        if (c.userData.tag === 'fire') {
          c.scale.y = 0.8 + Math.sin(t * 13 + o.p[0]) * 0.2;
          c.scale.x = c.scale.z = 0.9 + Math.sin(t * 9) * 0.1;
        }
        if (c.userData.tag === 'water') c.rotation.y += dt * 0.3;
      });
    }
    // Puertas y cofres: animación suave hacia su estado
    for (const e of this.built.interactables) {
      const m = e.mesh;
      if (!m || m.userData.targetOpen === undefined) continue;
      if (e.o.t === 'door') {
        const base = ((e.o.ry || 0) * Math.PI) / 180;
        const want = base + (m.userData.targetOpen ? Math.PI / 2 : 0);
        m.rotation.y += (want - m.rotation.y) * Math.min(1, dt * 8);
        // La puerta gira sobre su bisagra (borde), no sobre el centro
        const w = Math.max(e.o.s[0], e.o.s[2]) / 2;
        const ang = m.rotation.y - base;
        const ax = e.o.s[0] >= e.o.s[2];
        const hx = ax ? -w : 0, hz = ax ? 0 : -w;
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const lx = -hx, lz = -hz;
        const rx = lx * cos + lz * sin, rz = -lx * sin + lz * cos;
        const cb = Math.cos(base), sb = Math.sin(base);
        const ox = hx + rx, oz = hz + rz;
        m.position.set(e.o.p[0] + ox * cb + oz * sb, e.o.p[1], e.o.p[2] - ox * sb + oz * cb);
      } else if (e.o.t === 'chest') {
        const lid = m.children.find((c) => c.userData.tag === 'lid');
        if (lid) lid.rotation.x += ((m.userData.targetOpen ? -1.1 : 0) - lid.rotation.x) * Math.min(1, dt * 6);
      }
    }
  }

  updateLights(center) {
    const night = this.sky.isNight;
    const spots = [];
    for (const s of this.built.lightSpots) {
      if (s.group && this.groupState[s.group] === false) continue;
      if (s.nightOnly && !night) continue;
      const d = Math.hypot(s.x - center.x, s.z - center.z);
      if (d < 70) spots.push([d, s]);
    }
    spots.sort((a, b) => a[0] - b[0]);
    this.lightPool.forEach((l, i) => {
      const s = spots[i]?.[1];
      if (!s) { l.intensity = 0; return; }
      l.position.set(s.x, s.y, s.z);
      l.color.set(s.color);
      l.intensity = s.intensity * 6;
      l.distance = s.range;
    });
  }

  showBubble(id, text) {
    const r = this.remotes.get(id);
    if (!r) return;
    const old = this.bubbles.get(id);
    if (old) { old.sprite.parent?.remove(old.sprite); old.sprite.material.map.dispose(); old.sprite.material.dispose(); }
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.font = '700 30px Nunito, system-ui, sans-serif';
    const t = text.length > 34 ? text.slice(0, 33) + '…' : text;
    const w = Math.min(500, g.measureText(t).width + 36);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.roundRect((512 - w) / 2, 8, w, 64, 20); g.fill();
    g.fillStyle = '#1b1e3d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 256, 41);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(4, 0.75, 1);
    sprite.position.y = 3.4;
    r.model.root.add(sprite);
    this.bubbles.set(id, { sprite, until: performance.now() + 5000 });
  }

  updateBubbles() {
    const now = performance.now();
    for (const [id, b] of this.bubbles) {
      if (now > b.until) {
        b.sprite.parent?.remove(b.sprite);
        b.sprite.material.map.dispose();
        b.sprite.material.dispose();
        this.bubbles.delete(id);
      }
    }
  }

  onSettings() {
    if (!this.sky) return;
    this.sky.applyQuality();
    this.camera.far = settings.get('drawDistance') + 50;
    this.camera.updateProjectionMatrix();
  }

  // --- Salida -------------------------------------------------------------------
  async exit(reason = 'leave') {
    if (this.disposed) return;
    if (!this.offline && reason === 'leave') await net.request('room:leave');
    this.dispose();
    this.opts.onExit?.(reason);
  }

  dispose() {
    this.disposed = true;
    this.listeners.forEach((u) => u());
    this.offClick?.(); this.offLock?.(); this.offKey?.(); this.offKeyUp?.();
    this.mode?.dispose?.();
    this.adminPanel?.destroy();
    this.hud?.destroy();
    this.pause?.destroy();
    audio.stopEngines();
    audio.stopTrack();
    audio.stopLoops();
    if (this.mode?.customAudio) audio.startMusic();
    input.enabled = true;
    input.leftDragLook = false;
    input.unlockPointer();
    for (const r of this.remotes.values()) r.dispose();
    for (const v of this.vehicles.values()) v.dispose();
    this.player?.dispose();
    if (this.built) disposeWorld(this.built);
    this.scene?.clear();
  }
}

function defaultPrompt(e) {
  const o = e.o;
  switch (o.t) {
    case 'door': return e.open ? 'Cerrar puerta' : 'Abrir puerta';
    case 'chest': return e.opened ? null : 'Abrir cofre';
    case 'switch': return `Activar: ${o.label || 'interruptor'}`;
    case 'seat': return 'Sentarse';
    default: return null;
  }
}

const round = (v) => Math.round(v * 100) / 100;

const danceCache = [];
function danceMat(i) {
  if (!danceCache[i]) danceCache[i] = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 12, 0.85, 0.55) });
  return danceCache[i];
}
