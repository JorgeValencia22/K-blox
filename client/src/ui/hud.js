// HUD de partida: perfil, XP, monedas, objetivos, conexión, chat, lista de
// jugadores, indicaciones contextuales y controles táctiles.
import { h, clear, button, toast, modal } from './dom.js';
import { store } from '../core/store.js';
import { settings } from '../core/settings.js';
import { input } from '../engine/input.js';
import { net } from '../core/net.js';
import { post } from '../core/api.js';
import { audio } from '../audio/audio.js';

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.muted = new Set();
    this.el = h('div.hud');
    document.getElementById('ui').appendChild(this.el);

    // --- Superior izquierda: perfil y objetivos
    this.nameEl = h('div.hud-name');
    this.xpBar = h('div');
    this.coinsEl = h('b');
    this.objEl = h('div.hud-card.objectives.hidden');
    this.el.appendChild(h('div.tl',
      h('div.hud-card', this.nameEl, h('div.xpbar', { style: { margin: '7px 0' } }, this.xpBar),
        h('div.row.small', h('span.chip', { style: { padding: '2px 8px', cursor: 'default' } }, h('span.coin', 'K'), this.coinsEl), h('span.muted.grow', { style: { textAlign: 'right' } }, game.title))),
      this.objEl,
    ));

    // --- Superior derecha: conexión, jugadores, pausa
    this.conn = h('div.conn', h('div.bars', h('i', { style: { height: '5px' } }), h('i', { style: { height: '9px' } }), h('i', { style: { height: '14px' } })), h('span', '—'));
    this.playersBtn = button('👥 0', () => this.togglePlayerList(), 'small');
    this.el.appendChild(h('div.tr', h('div.hud-card', this.conn), this.playersBtn, button('⏸', () => game.openPause(), 'small')));

    this.modePanel = h('div.mode-panel');
    this.el.appendChild(this.modePanel);
    this.center = h('div.center-msg.hidden');
    this.el.appendChild(this.center);
    this.promptEl = h('div.prompt.hidden');
    this.el.appendChild(this.promptEl);
    this.hint = h('div.controls-hint');
    this.el.appendChild(this.hint);
    this.lockHint = h('div.lock-hint', input.isTouch ? '' : '🖱️ Haz clic en el juego para controlar la cámara (o arrastra con el ratón)');
    if (input.isTouch) this.lockHint.classList.add('hidden');
    this.el.appendChild(this.lockHint);
    this.crosshair = h('div.crosshair.hidden');
    this.el.appendChild(this.crosshair);
    this.playerList = h('div.playerlist.panel.hidden');
    this.el.appendChild(this.playerList);

    this.buildChat();
    if (input.isTouch) this.buildTouch();
    this.unsub = [store.on('user', () => this.updateProfile()), net.on('latency', (l) => this.setConn(l)), net.on('status', () => this.setConn(net.latency))];
    this.updateProfile();
    this.setConn(net.latency);
  }

  updateProfile() {
    const u = store.user;
    if (!u) return;
    clear(this.nameEl).append(h('span', u.username), h('span.lvl', `Nv ${u.level}`));
    const span = Math.max(1, u.xpNextLevel - u.xpLevelStart);
    this.xpBar.style.width = `${Math.min(100, ((u.xp - u.xpLevelStart) / span) * 100)}%`;
    this.coinsEl.textContent = u.coins;
  }

  setConn(latency) {
    const offline = this.game.offline ? false : !net.connected;
    this.conn.className = 'conn' + (offline ? ' bad' : latency > 250 ? ' bad' : latency > 120 ? ' mid' : '');
    this.conn.lastChild.textContent = this.game.offline ? 'Local' : offline ? 'Sin conexión' : `${Math.round(latency)} ms`;
  }

  setObjectives(list, title = 'Objetivos') {
    if (!list || !list.length) {
      this.objEl.classList.add('hidden');
      return;
    }
    this.objEl.classList.remove('hidden');
    clear(this.objEl).append(h('b.small', title), ...list.map((o) => {
      const done = o.done || (o.total && o.progress >= o.total);
      return h(`div.o${done ? '.done' : ''}`, h('span.ck', done ? '✓' : ''), h('span', o.text + (o.total ? ` (${o.progress}/${o.total})` : '')));
    }));
  }

  setPrompt(key, text) {
    if (!text) {
      this.promptEl.classList.add('hidden');
      this.promptText = null;
      return;
    }
    if (this.promptText === key + text) return;
    this.promptText = key + text;
    this.promptEl.classList.remove('hidden');
    clear(this.promptEl).append(input.isTouch ? '' : h('kbd', key), text);
  }

  showCenter(text, sub = '', ms = 1800) {
    clear(this.center).append(...[text, sub ? h('small', sub) : null].filter(Boolean));
    this.center.classList.remove('hidden');
    clearTimeout(this.centerT);
    if (ms) this.centerT = setTimeout(() => this.center.classList.add('hidden'), ms);
  }

  hideCenter() {
    this.center.classList.add('hidden');
  }

  setMode(...nodes) {
    clear(this.modePanel).append(...nodes.filter(Boolean));
  }

  setHint(lines) {
    clear(this.hint);
    if (input.isTouch) return;
    for (const l of lines) this.hint.append(h('div', ...l.split(/(\[[^\]]+\])/).map((p) => (p.startsWith('[') ? h('kbd', p.slice(1, -1)) : p))));
  }

  // --- Diálogo con NPC ---------------------------------------------------------
  get dialogueOpen() {
    return !!this.dialogue && !this.dialogue.classList.contains('hidden');
  }

  showDialogue({ name, title, text, options }, onChoose) {
    if (!this.dialogue) {
      this.dialogue = h('div.dialogue.panel.hidden');
      this.el.appendChild(this.dialogue);
    }
    this.dialogueOptions = options;
    this.dialogueChoose = onChoose;
    clear(this.dialogue).append(
      h('div.row', h('b', name), title ? h('span.tag', title) : '', h('div.grow'), button('✕', () => this.game.closeDialogue(), 'small ghost')),
      h('p', text),
      h('div.row.wrap', options.map((o, i) => button(input.isTouch ? o.label : `${i + 1}. ${o.label}`, () => this.chooseDialogue(i), 'small'))),
    );
    this.dialogue.classList.remove('hidden');
  }

  chooseDialogue(i) {
    const opt = this.dialogueOptions?.[i];
    if (opt && this.dialogueChoose) this.dialogueChoose(opt);
  }

  hideDialogue() {
    this.dialogue?.classList.add('hidden');
  }

  setLockHint(show) {
    this.lockHint.classList.toggle('hidden', !show);
  }

  flashHurt() {
    const f = h('div.hurt');
    this.el.appendChild(f);
    setTimeout(() => f.remove(), 500);
  }

  setPlayerCount(n) {
    this.playersBtn.textContent = `👥 ${n}`;
  }

  togglePlayerList(show = this.playerList.classList.contains('hidden')) {
    this.playerList.classList.toggle('hidden', !show);
    if (show) this.renderPlayerList();
  }

  renderPlayerList() {
    const g = this.game;
    const me = store.user;
    const rows = [{ id: me.id, name: me.username, level: me.level, self: true }, ...[...g.remotes.values()].filter((r) => !r.npc && !r.bot).map((r) => ({ id: r.id, name: r.name, level: r.level }))];
    clear(this.playerList).append(
      h('div.row', h('b.grow', `Jugadores (${rows.length}/${g.room?.maxPlayers ?? '∞'})`), g.room?.inviteCode ? h('span.tag', `Código: ${g.room.inviteCode}`) : null),
      h('div.list', { style: { marginTop: '8px' } }, rows.map((r) => h('div.list-item',
        h('span.dot.on'), h('span.name.grow', r.name), h('span.tag', `Nv ${r.level}`),
        r.self ? null : button('⋯', () => this.playerMenu(r.id, r.name), 'small ghost'),
      ))),
    );
  }

  /** Menú de seguridad sobre un jugador: silenciar, bloquear, reportar, amistad, privado. */
  playerMenu(id, name) {
    const muted = this.muted.has(id);
    modal(name, (close) => h('div.list',
      button(muted ? '🔊 Dejar de silenciar' : '🔇 Silenciar en el chat', () => {
        if (muted) this.muted.delete(id); else this.muted.add(id);
        toast(muted ? `${name} ya no está silenciado` : `${name} silenciado`, 'ok');
        close();
      }),
      button('💬 Mensaje privado', () => { close(); this.openChat(`/w ${name} `); }),
      button('➕ Enviar solicitud de amistad', async () => {
        try { await post('/friends/request', { username: name }); toast('Solicitud enviada', 'ok'); } catch (e) { toast(e.message, 'err'); }
        close();
      }),
      button('🚫 Bloquear', async () => {
        try { await post('/block', { userId: id }); this.muted.add(id); toast(`${name} bloqueado`, 'ok'); } catch (e) { toast(e.message, 'err'); }
        close();
      }, 'danger'),
      button('⚠️ Reportar jugador', () => { close(); this.reportDialog({ userId: id, name }); }, 'danger'),
    ), { actions: [{ label: 'Cerrar' }] });
  }

  reportDialog({ userId, msgId, name, text }) {
    const sel = h('select.input', ['spam', 'insultos', 'datos_personales', 'contenido_inapropiado', 'trampas', 'otro'].map((r) => h('option', { value: r }, r.replace('_', ' '))));
    modal(`Reportar ${name ? 'a ' + name : 'mensaje'}`, h('div', text ? h('p.muted', `"${text}"`) : null, h('div.field', h('label', 'Motivo'), sel)), {
      actions: [
        { label: 'Cancelar' },
        { label: 'Enviar reporte', cls: 'danger', onClick: async (close) => {
          const r = await net.request('report', { userId, msgId, reason: sel.value });
          toast(r.error || 'Reporte enviado. ¡Gracias por ayudar!', r.error ? 'err' : 'ok');
          close();
        } },
      ],
    });
  }

  // --- Chat -----------------------------------------------------------------
  buildChat() {
    this.chatLog = h('div.chat-log');
    this.chatInput = h('input.input', { maxLength: 200, placeholder: 'Escribe… (/w nombre mensaje para privado)' });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.sendChat();
      if (e.key === 'Escape') this.closeChat();
    });
    this.chatInput.addEventListener('blur', () => setTimeout(() => this.closeChat(true), 100));
    this.chatInputRow = h('div.chat-input.hidden', this.chatInput, button('Enviar', () => this.sendChat(), 'small primary'));
    this.chatEl = h('div.chat.idle', this.chatLog, this.chatInputRow);
    this.el.appendChild(this.chatEl);
    this.applyChatVisibility();
    this.unsubSettings = settings.on('change', ({ key }) => key === 'showChat' && this.applyChatVisibility());
  }

  applyChatVisibility() {
    this.chatEl.classList.toggle('collapsed', !settings.get('showChat'));
  }

  get chatOpen() {
    return !this.chatInputRow.classList.contains('hidden');
  }

  openChat(prefill = '') {
    this.chatInputRow.classList.remove('hidden');
    this.chatEl.classList.remove('idle', 'collapsed');
    input.enabled = false;
    input.unlockPointer();
    this.chatInput.value = prefill;
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat(fromBlur = false) {
    if (!this.chatOpen) return;
    this.chatInputRow.classList.add('hidden');
    this.chatEl.classList.add('idle');
    this.applyChatVisibility();
    input.enabled = true;
    if (!fromBlur) this.chatInput.blur();
    if (!input.isTouch && !this.game.paused) this.game.requestLock();
  }

  async sendChat() {
    let text = this.chatInput.value.trim();
    if (!text) return this.closeChat();
    let to;
    const pm = text.match(/^\/(w|m|msg)\s+(\S+)\s+(.+)$/i);
    if (pm) { to = pm[2]; text = pm[3]; }
    if (this.game.offline) {
      this.addChat({ id: 'l' + Date.now(), kind: 'system', text: 'El chat no está disponible en el modo de prueba local', ts: Date.now() });
      return this.closeChat();
    }
    const r = await net.request('chat', { text, to });
    if (r.error) {
      toast(r.error, 'warn');
      audio.ui('error');
      return;
    }
    this.chatInput.value = '';
    this.closeChat();
  }

  addChat(m) {
    if (m.from && this.muted.has(m.from.id)) return;
    const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = h(`div.chat-msg.${m.kind}`, h('span.t', time));
    if (m.kind === 'system') row.append(m.text);
    else {
      const isMe = m.from.id === store.user.id;
      const label = m.kind === 'pm' ? (isMe ? `→ ${m.to.name}` : `${m.from.name} (privado)`) : m.from.name;
      row.append(h('span.n', { style: { color: isMe ? '#7cf5df' : '#ffd479' }, on: { click: () => !isMe && this.playerMenu(m.from.id, m.from.name) } }, label + ': '), m.text);
      if (!isMe) row.append(h('span.rep', { title: 'Reportar mensaje', on: { click: () => this.reportDialog({ msgId: m.id, text: m.text }) } }, '⚠️'));
      if (!isMe) audio.play('chat');
      if (!isMe && m.kind === 'pm') toast(`💬 ${m.from.name}: ${m.text}`, 'info');
    }
    this.chatLog.appendChild(row);
    while (this.chatLog.children.length > 80) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    if (m.from && this.game.remotes.has(m.from.id)) this.game.showBubble(m.from.id, m.text);
  }

  // --- Controles táctiles ---------------------------------------------------
  buildTouch() {
    const t = h('div.touch');
    const knob = h('div.knob');
    const joy = h('div.joy', knob);
    let jid = null, cx = 0, cy = 0;
    joy.addEventListener('touchstart', (e) => {
      const tt = e.changedTouches[0];
      jid = tt.identifier;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    const moveJoy = (e) => {
      for (const tt of e.changedTouches) {
        if (tt.identifier !== jid) continue;
        let dx = tt.clientX - cx, dy = tt.clientY - cy;
        const l = Math.hypot(dx, dy), max = 50;
        if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.joy.x = dx / max;
        input.joy.y = -dy / max;
        if (l > max * 0.95) input.pressVirtual('ShiftLeft'); else input.releaseVirtual('ShiftLeft');
      }
    };
    const endJoy = (e) => {
      for (const tt of e.changedTouches) {
        if (tt.identifier !== jid) continue;
        jid = null;
        knob.style.transform = '';
        input.joy.x = input.joy.y = 0;
        input.releaseVirtual('ShiftLeft');
      }
    };
    joy.addEventListener('touchmove', moveJoy, { passive: true });
    joy.addEventListener('touchend', endJoy);
    joy.addEventListener('touchcancel', endJoy);

    const tbtn = (label, code, style) => {
      const b = h('div.tbtn', { style }, label);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('on'); input.pressVirtual(code); }, { passive: false });
      const up = () => { b.classList.remove('on'); input.releaseVirtual(code); };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
      return b;
    };
    this.touchAction = tbtn('E', 'KeyE', { right: '110px', bottom: '60px' });
    t.append(joy,
      tbtn('Saltar', 'Space', { right: '30px', bottom: '110px', width: '78px', height: '78px' }),
      this.touchAction,
      tbtn('😀', 'Digit2', { right: '30px', bottom: '24px', width: '54px', height: '54px' }),
      h('div.tbtn', { style: { right: '30px', top: '70px', width: '50px', height: '50px' }, on: { click: () => this.openChat() } }, '💬'),
      document.fullscreenEnabled ? h('div.tbtn', { style: { right: '90px', top: '70px', width: '50px', height: '50px' }, on: { click: () => toggleFullscreen() } }, '⛶') : null,
    );
    // Botón para bajar la potencia de la avioneta (solo visible en ella)
    this.planeDown = tbtn('−Pot.', 'KeyC', { right: '120px', bottom: '150px', width: '60px', height: '60px', fontSize: '12px' });
    this.planeDown.classList.add('hidden');
    t.appendChild(this.planeDown);
    this.extraTouch = h('div');
    t.appendChild(this.extraTouch);
    this.el.appendChild(t);

    // Un dedo en el lienzo gira la cámara; dos dedos (pellizco) acercan o alejan.
    const canvas = input.canvas;
    const touches = new Map();
    let lid = null, pinch = 0;
    const pinchDist = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    this.onTouchStart = (e) => {
      for (const tt of e.changedTouches) {
        touches.set(tt.identifier, { x: tt.clientX, y: tt.clientY });
        if (lid === null && tt.clientX > innerWidth * 0.35) lid = tt.identifier;
      }
      if (touches.size === 2) pinch = pinchDist();
    };
    this.onTouchMove = (e) => {
      for (const tt of e.changedTouches) {
        const prev = touches.get(tt.identifier);
        if (!prev) continue;
        if (tt.identifier === lid && touches.size < 2) {
          input.touchLook.dx += (tt.clientX - prev.x) * 1.6;
          input.touchLook.dy += (tt.clientY - prev.y) * 1.6;
        }
        prev.x = tt.clientX;
        prev.y = tt.clientY;
      }
      if (touches.size === 2) {
        const d = pinchDist();
        if (Math.abs(d - pinch) > 24) {
          input.mouse.wheel += d > pinch ? -1 : 1;
          pinch = d;
        }
      }
    };
    this.onTouchEnd = (e) => {
      for (const tt of e.changedTouches) {
        touches.delete(tt.identifier);
        if (tt.identifier === lid) lid = null;
      }
    };
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: true });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('touchcancel', this.onTouchEnd);
  }

  /** Muestra los botones táctiles propios del vehículo actual. */
  setVehicleTouch(type) {
    this.planeDown?.classList.toggle('hidden', type !== 'plane');
  }

  /** Botón táctil adicional del modo de juego (p. ej. "Construir"). */
  addTouchButton(label, code, style) {
    if (!this.extraTouch) return;
    const b = h('div.tbtn', { style }, label);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); input.pressVirtual(code); }, { passive: false });
    b.addEventListener('touchend', () => input.releaseVirtual(code));
    this.extraTouch.appendChild(b);
  }

  destroy() {
    this.unsub.forEach((u) => u());
    this.unsubSettings?.();
    if (this.onTouchStart) {
      input.canvas.removeEventListener('touchstart', this.onTouchStart);
      input.canvas.removeEventListener('touchmove', this.onTouchMove);
      input.canvas.removeEventListener('touchend', this.onTouchEnd);
    }
    this.el.remove();
  }
}
