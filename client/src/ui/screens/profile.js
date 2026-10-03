// Perfil: nivel, experiencia, estadísticas, logros e historial de partidas.
import { h, button, clear, formatTime } from '../dom.js';
import { store } from '../../core/store.js';
import { pageHead } from './menu.js';
import { ACHIEVEMENTS, EXPERIENCES } from '../../../../shared/catalog.js';

export function profileScreen(app) {
  const body = h('div.page-body');
  const render = () => {
    const u = store.user;
    const s = u.stats || {};
    const got = new Map(u.achievements.map((a) => [a.id, a.at]));
    const span = Math.max(1, u.xpNextLevel - u.xpLevelStart);
    const stat = (label, value) => h('div.stat', h('b', value), h('span.muted.small', label));
    clear(body).append(
      h('div.box.panel', { style: { marginBottom: '16px' } },
        h('div.row', h('span.avatar-mini', { style: { width: '54px', height: '54px', fontSize: '24px' } }, u.username[0].toUpperCase()),
          h('div.grow', h('h2', { style: { margin: 0 } }, u.username), h('div.muted.small', `Miembro desde ${new Date(u.createdAt).toLocaleDateString()}`))),
        h('div.row', { style: { marginTop: '14px' } }, h('b', `Nivel ${u.level}`), h('div.xpbar.grow', h('div', { style: { width: `${Math.min(100, ((u.xp - u.xpLevelStart) / span) * 100)}%` } })), h('span.muted.small', `${u.xp - u.xpLevelStart}/${span} XP`)),
      ),
      h('div.section-title', 'Estadísticas'),
      h('div.stats',
        stat('Monedas', `🪙 ${u.coins}`), stat('Partidas', s.gamesPlayed || 0), stat('Tiempo jugado', `${s.playMinutes || 0} min`),
        stat('Mundos visitados', (s.visited || []).length), stat('Victorias', s.wins || 0), stat('Objetos', u.inventory.length),
        stat('Obby completados', s.obbyClears || 0), stat('Mejor Obby', s.obbyBest ? formatTime(s.obbyBest) : '—'), stat('Carreras', s.races || 0),
        stat('Noches superadas', s.nightsSurvived || 0), stat('Cofres abiertos', s.chests || 0), stat('Gemas', `${(s.cityGems || []).length}/12`),
      ),
      h('div.section-title', `Logros (${got.size}/${ACHIEVEMENTS.length})`),
      h('div.cols', ACHIEVEMENTS.map((a) => h(`div.ach${got.has(a.id) ? '' : '.locked'}`,
        h('span.medal', got.has(a.id) ? '🏆' : '🔒'), h('div.grow', h('b', a.name), h('div.muted.small', a.desc)), h('span.tag', `🪙 ${a.reward}`)))),
      h('div.section-title', 'Historial de partidas'),
      h('div.list', u.history.length ? u.history.map((r) => h('div.list-item',
        h('span.name.grow', EXPERIENCES.find((e) => e.id === r.world_id)?.name || r.world_name),
        r.result ? h('span.tag', r.result) : null,
        h('span.muted.small', new Date(r.started_at).toLocaleString()),
      )) : h('p.muted.small', 'Todavía no has jugado ninguna partida.')),
    );
  };
  render();
  store.refreshUser().then(render).catch(() => {});
  return h('div.screen.page', pageHead(app, 'Perfil', button('Cerrar sesión', () => app.logout(), 'danger small')), body);
}
