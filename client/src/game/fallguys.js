// Fall Guys (modo Pro), cliente: marcador de la ronda, cuenta atrás, eliminaciones y el inicio de la
// partida (contra bots, o esperando jugadores reales).
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { h, clear } from '../ui/dom.js';

const PHASE = { lobby: 'Sala de espera', gather: 'Buscando jugadores', countdown: '¡Preparados!', round: 'Ronda en curso', results: 'Clasificación', final: 'Fin del torneo' };
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class FallGuysClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.state = state || {};
    this.netEvents = {};
    this.lockVehicle = true;
    this.blockEmotes = true;
    this.fg = state.fg || { phase: 'lobby', standings: [] };
    this.panel = h('div.hud-card');
    this.board = h('div.hud-card', { style: { minWidth: '220px' } });
    this.hud.setMode(this.panel, this.board);
    this.hint = ['[G] empezar contra bots  [H] esperar jugadores reales'];
    this.hud.addTouchButton('Bots', 'KeyG', { right: '120px', top: '70px', width: '60px', height: '60px', fontSize: '11px' });
    this.hud.addTouchButton('Reales', 'KeyH', { right: '190px', top: '70px', width: '60px', height: '60px', fontSize: '11px' });
    this.netEvents.fg = (s) => {
      const prev = this.fg.phase;
      this.fg = s;
      if (s.phase === 'round' && prev === 'countdown') { audio.play('countdown', null, { go: true }); this.hud.showCenter('¡YA!', '', 900); }
      if (s.phase === 'results' && prev === 'round') this.hud.showCenter(`Ronda ${s.round} terminada`, `${s.alive} siguen en pie`, 3000);
      if (s.phase === 'final') this.hud.showCenter(s.winner ? `👑 ${s.winner}` : 'Fin', 'gana Fall Guys', 6000);
      this.render();
    };
    this.netEvents['fg:out'] = () => {
      audio.play('death');
      this.hud.showCenter('ELIMINADO', 'mira cómo acaba el torneo', 3500);
    };
    this.render();
  }

  update() {
    const p = this.fg.phase;
    if (p === 'lobby' && input.pressed('KeyG')) net.request('mode', { name: 'start', data: { fill: 'bots' } }).then((r) => r.error && this.hud.showCenter(r.error, '', 1500));
    if (p === 'lobby' && input.pressed('KeyH')) net.request('mode', { name: 'start', data: { fill: 'real' } }).then((r) => r.error && this.hud.showCenter(r.error, '', 1500));
    if (p === 'countdown') {
      const left = Math.ceil((this.fg.startAt - this.game.now()) / 1000);
      if (left !== this.lastCount && left > 0) { this.lastCount = left; audio.play('countdown'); this.hud.showCenter(String(left), '', 900); }
    }
    const now = performance.now();
    if (!this.lastRender || now - this.lastRender > 250) { this.lastRender = now; this.render(); }
  }

  render() {
    const s = this.fg;
    const left = s.phase === 'round' ? s.limitMs - (this.game.now() - s.roundAt) : 0;
    this.panel.replaceChildren(
      h('div.big', PHASE[s.phase] || ''),
      h('div.small.muted', s.course ? `Ronda ${s.round}/${s.rounds}: ${s.course}` : `Diez rondas · ${s.rounds || 10} recorridos`),
      s.phase === 'round' ? h('div.small', `⏱ ${mmss(left)}  ·  ${s.alive} en pie`) : null,
      s.phase === 'gather' ? h('div.small', `Esperando… ${s.total} jugadores`) : null,
    );
    const rows = (s.standings || []).slice(0, 12).map((r) => h('div.small', { style: { opacity: r.alive ? 1 : 0.45 } }, `${r.alive ? '🟢' : '💀'} ${r.name}${r.bot ? ' 🤖' : ''} · ${r.points} pts`));
    clear(this.board).append(h('div.small.muted', 'Clasificación'), ...rows);
  }

  dispose() {}
}
