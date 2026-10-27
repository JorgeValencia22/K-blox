// Los cuatro héroes de Guerra Galáctica. Cada uno cambia cómo se juega: vida, velocidad, daño del
// sable y del bláster, cuántos disparos aguanta el sable antes de sobrecalentarse y una habilidad
// especial [Q] con enfriamiento. También cambian los diálogos de la historia.

export const HEROES = {
  knight: {
    id: 'knight', name: 'Caballero Estelar', role: 'Equilibrado', icon: '🗡️', color: '#29b6f6',
    hp: 150, speed: 1, saber: 1, blaster: 1, rate: 210, heat: 6, dodgeCd: 1.1,
    special: { id: 'push', name: 'Pulso de la Fuerza', desc: 'Empuja y daña a todos los enemigos cercanos y borra sus disparos.', cd: 10 },
    stats: { Vida: 3, Velocidad: 3, Sable: 3, Bláster: 3 },
    brief: 'Entrenado en la vieja orden. Sin puntos débiles… ni fuertes.',
    lines: { vex: 'Caballero… la orden cayó hace años. Tú serás el último.', intro: 'Por la orden. Por la galaxia.' },
  },
  smuggler: {
    id: 'smuggler', name: 'Contrabandista', role: 'Bláster', icon: '🔫', color: '#ffca28',
    hp: 120, speed: 1.1, saber: 0.7, blaster: 2, rate: 140, heat: 4, dodgeCd: 0.9,
    special: { id: 'barrage', name: 'Ráfaga Letal', desc: 'Dispara una ráfaga que acierta a los 8 enemigos más cercanos.', cd: 11 },
    stats: { Vida: 2, Velocidad: 4, Sable: 2, Bláster: 5 },
    brief: 'Prefiere un buen blaster a una religión antigua. Dispara más rápido y más fuerte.',
    lines: { vex: 'Un contrabandista… ¿de verdad crees que una pistola me detendrá?', intro: 'Esto no estaba en el trato…' },
  },
  guardian: {
    id: 'guardian', name: 'Guardián', role: 'Tanque', icon: '🛡️', color: '#69f0ae',
    hp: 230, speed: 0.86, saber: 1.25, blaster: 0.8, rate: 240, heat: 9, dodgeCd: 1.4,
    special: { id: 'shield', name: 'Escudo de Plasma', desc: 'Eres invulnerable 4 s y tu sable no se sobrecalienta.', cd: 16 },
    stats: { Vida: 5, Velocidad: 2, Sable: 4, Bláster: 2 },
    brief: 'Una muralla con sable. Aguanta mucho más y desvía hasta 9 disparos.',
    lines: { vex: 'Un guardián… romperé tu escudo y a ti con él.', intro: 'Nadie pasa. Yo os cubro.' },
  },
  shadow: {
    id: 'shadow', name: 'Sombra', role: 'Asesino', icon: '🌀', color: '#e040fb',
    hp: 110, speed: 1.25, saber: 1.25, blaster: 0.9, rate: 200, heat: 5, dodgeCd: 0.55,
    special: { id: 'blitz', name: 'Golpe Relámpago', desc: 'Te lanzas contra el enemigo más cercano y golpeas a todos los de alrededor.', cd: 8 },
    stats: { Vida: 1, Velocidad: 5, Sable: 5, Bláster: 3 },
    brief: 'Rápida y letal, pero frágil. Esquiva casi sin enfriamiento.',
    lines: { vex: 'Una sombra… huele a miedo. A tu miedo.', intro: 'Silencio. Entramos, golpeamos, salimos.' },
  },
};

export const HERO_IDS = Object.keys(HEROES);
export const heroOf = (id) => HEROES[id] || HEROES.knight;
