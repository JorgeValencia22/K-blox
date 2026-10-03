# Kest Worlds

Plataforma de mundos 3D multijugador de estilo "bloques", con identidad visual original:
cuentas, avatares personalizables, cinco experiencias jugables, editor de mundos con
publicación, vehículos, chat moderado, amigos, economía ficticia (K-Coins), niveles y logros.

- **Cliente:** Three.js + JavaScript (módulos ES) + HTML/CSS, empaquetado con Vite.
- **Servidor:** Node.js + Express + Socket.IO.
- **Base de datos:** SQLite mediante el módulo integrado `node:sqlite` (sin compilación nativa).
- **Audio:** sintetizado en tiempo real con Web Audio (sin archivos de sonido; todo original).

---

## Requisitos

- Windows 10/11 (también funciona en Linux/macOS con `npm`).
- **Node.js 22.13 o superior** (probado con Node 24). Descárgalo en <https://nodejs.org>.
- Un navegador moderno con WebGL (Chrome, Edge, Firefox).

## Inicio rápido (Windows)

Haz doble clic en **`start.bat`**. El script:

1. Comprueba que Node.js está instalado y su versión.
2. Instala las dependencias la primera vez (`npm install`).
3. Crea `.env` a partir de `.env.example` si no existe.
4. Inicializa la base de datos (`data/kest.db`).
5. Compila el cliente y arranca el servidor.
6. Abre <http://localhost:3000> en el navegador.

Para jugar con otros equipos de tu red local, abre `http://IP-DE-TU-PC:3000` desde ellos
(acepta el aviso del cortafuegos de Windows la primera vez).

Modo desarrollo (recarga automática del cliente y del servidor):

```bat
start.bat dev
```

## Comandos

| Comando | Descripción |
|---|---|
| `npm install` | Instala dependencias |
| `npm run db:init` | Crea/actualiza el esquema de la base de datos |
| `npm run build` | Compila el cliente en `dist/` |
| `npm start` | Arranca el servidor (sirve `dist/`, la API y Socket.IO) en el puerto 3000 |
| `npm run dev` | Servidor con `--watch` + Vite en <http://localhost:5173> (redirige `/api` y `/socket.io` al 3000) |
| `npm test` | Pruebas automáticas (servidor, filtro de chat, mundos, física) |

## Configuración (`.env`)

Copia `.env.example` como `.env`. Variables principales:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | 3000 | Puerto del servidor |
| `DB_FILE` | `data/kest.db` | Archivo SQLite |
| `MAX_CONNECTIONS` | 200 | Conexiones simultáneas máximas |
| `MAX_PLAYERS_PER_ROOM` | 24 | Límite de jugadores por sala |
| `NEW_ACCOUNT_MINUTES` | 30 | Minutos de chat restringido para cuentas nuevas |
| `ADMIN_USERNAMES` | (vacío) | Usuarios con rol de moderador (se aplica al registrarse) |
| `FILTER_WORDS_FILE` | `server/security/filter-words.json` | Lista configurable de palabras filtradas |
| `KEST_SERVER_PORT` | 3000 | (Solo `npm run dev`) puerto al que Vite redirige la API |

No hay contraseñas, claves ni credenciales en el código.

---

## Qué incluye

### Menú principal
Fondo 3D animado (plaza con personajes paseando y bailando), botones JUGAR (entra en Kest City),
DESCUBRIR, CREAR, AVATAR, AMIGOS y CONFIGURACIÓN, perfil (nivel), K-Coins (abre la tienda),
notificaciones y, para moderadores, el panel de moderación.

### Cuentas y progresión
- Registro, inicio y cierre de sesión, recuperación de sesión (token en el navegador, guardado
  en el servidor solo como hash SHA-256 y con caducidad).
- Contraseñas con **scrypt** y sal aleatoria. Bloqueo de 5 minutos tras 5 intentos fallidos
  por usuario o IP. Límites de frecuencia en la API.
- Nivel, experiencia, monedas, estadísticas, logros (16), historial de partidas, mundos
  visitados, favoritos y fecha de creación. Todo persiste en SQLite.

### Avatares
Personajes de bloques originales (cabeza, torso, brazos, piernas, cara, ojos, boca, pelo, ropa,
accesorios y efectos). Editor con vista previa giratoria, colores personalizados y tienda.
Animaciones procedurales con máquina de estados: reposo, caminar, correr, saltar, caer,
aterrizar, bailar, baile robot, saludar, celebrar, giro, voltereta, sentarse, nadar, conducir,
golpear y caer derrotado. El servidor valida que solo se equipen objetos poseídos.

### Controles
| PC | Acción |
|---|---|
| W A S D | Moverse (relativo a la cámara) |
| Shift | Correr |
| Espacio | Saltar / nadar hacia arriba |
| E | Interactuar (puertas, cofres, interruptores, asientos, vehículos, recursos) |
| Ratón | Cámara (clic en la pantalla para capturar el ratón; botón derecho + arrastrar también) |
| Rueda | Distancia de la cámara |
| Enter | Chat (`/w nombre mensaje` para privado) |
| Tab | Lista de jugadores |
| 1–7 | Emotes (saludar, bailar, celebrar, sentarse, giro, robot, voltereta) |
| Esc | Pausa |

Vehículos: W/S acelerar/frenar, A/D girar, Espacio freno de mano. Avioneta: Espacio/Shift
potencia, W/S morro, A/D alabeo, Q/R timón.

En móviles aparecen joystick virtual, botón de salto, botón de acción contextual, emotes y chat;
arrastrar en la mitad derecha mueve la cámara. Sensibilidad e inversión del eje Y configurables.

### Experiencias oficiales
1. **Kest City** – isla de 512×512 m con ciudad, montañas, río, lago, puentes, carreteras,
   tiendas, casas con puertas, plaza, parque infantil, observatorio con ascensor (plataforma
   móvil), aeródromo, playa y cabaña. Coches, karts y avioneta. Objetivos: 12 gemas
   (persistentes), 5 cofres, la cumbre y despegar. Interruptores de fuente y farolas compartidos.
2. **Kest Obby** – recorrido en el cielo con saltos, lava, vigas, plataformas móviles,
   trampolines, 4 puntos de control y cronómetro. El servidor valida el orden de los puntos de
   control y un tiempo mínimo; guarda el mejor tiempo.
3. **Kest Racing** – circuito con 8 puntos de control, 3 vueltas, parrilla, cuenta atrás,
   clasificación en directo y resultados. Cada jugador tiene su kart.
4. **Kest Survival** – recursos (madera, piedra, bayas), hambre, salud, construcción por
   cuadrícula (bloquea a las criaturas), ciclo día/noche sincronizado y criaturas nocturnas
   simuladas en el servidor. Recompensa por sobrevivir a cada noche.
5. **Kest Hangout** – plaza social con pista de baile animada, escenario, hoguera con asientos,
   trampolines, plataforma del cielo, tobogán y laberinto. Recompensas sociales moderadas.

6. **Kest Only Up** – escalada vertical de más de 200 m generada por código (barrio, obra, nubes y espacio). Sin puntos de control; récord de altura guardado y clasificación de la sala.
7. **Kest Teclas** – obby ASMR sobre teclados mecánicos gigantes: cada tecla se hunde y suena al pisarla (cada letra da una nota de una escala pentatónica), también cuando la pisan otros jugadores. Lluvia de fondo.
8. **Kest Terror** – laberinto de setos de noche con linterna (F), aguante al correr y La Sombra: un monstruo simulado en el servidor que patrulla los pasillos, oye a quien corre y persigue. Encontrad 6 almas para abrir la verja y escapar.
9. **Kest Royale** – batalla tipo «último en pie»: cofres de botín (rifle, escopeta, escudo, botiquín), tormenta que se cierra en 4 fases, construcción de muros y rampas (B/R), disparos resueltos en el servidor con línea de visión y bots que completan la partida.
10. **Kest Rocket** – fútbol con coches 2 contra 2 (con bots): turbo, salto, cámara al balón, balón simulado en el servidor, saques, goles y partidos de 3 minutos con gol de oro.
11. **Kest Castores** – atraco cooperativo inspirado en *Beavers Be Dammed*: roe tablones, roba troncos del aserradero (los grandes, mejor entre dos), esquiva sierras y lanzallamas y llévalos a la presa antes de que acabe el tiempo. Suena la canción `client/public/audio/ia-beat.mp3`.

El Obby oficial ahora tiene 10 etapas (pilares, plataformas rápidas, islas con trampolín, espiral y vigas con vallas de lava).

### Editor de mundos (CREAR)
Biblioteca (bloques, esferas, cilindros, rampas, escaleras, árboles, puertas, ventanas, luces,
decoraciones, plataformas móviles, puntos de aparición/control, meta, lava, monedas,
trampolines, asientos, carteles), selección con el ratón, gizmos para mover/rotar/escalar,
cuadrícula con ajuste configurable, cámara libre, deshacer/rehacer, duplicar, propiedades
(posición, tamaño, rotación, color, material y parámetros), ajustes del mundo (terreno llano o
colinas, agua, hora, ciclo día/noche, niebla), guardado en el servidor con portada automática,
**modo de prueba local** y **publicación** (nombre, descripción, categoría, visibilidad,
límite de jugadores, versión). Los mundos son JSON validado en el servidor (tipos cerrados,
números acotados, máximo 2500 objetos y 600 KB). No se ejecuta código de usuarios: las
mecánicas son componentes predefinidos (plataformas, puntos de control, meta, lava, monedas…).

### Multijugador
- Salas por experiencia; emparejamiento automático en salas públicas, salas privadas con
  código de invitación e invitaciones a amigos; unirse a la partida de un amigo.
- Cliente envía su estado 15 veces/s; el servidor valida y difunde instantáneas 15 veces/s;
  los clientes interpolan con 120 ms de retardo y sincronizan el reloj con el servidor.
- El servidor valida velocidades (a pie y por tipo de vehículo), límites del mapa, distancias
  de interacción, orden de puntos de control, tiempos mínimos y recompensas (con límites
  diarios). Movimientos imposibles → corrección; abusos repetidos → expulsión.
- Reconexión automática que devuelve al jugador a su sala (incluso privada) durante 60 s.
- Vehículos sincronizados (un conductor por vehículo), puertas e interruptores compartidos.
- `RoomManager` concentra la creación/búsqueda de salas detrás de una interfaz pequeña para
  poder repartir salas entre varios procesos en el futuro (`SERVER_NAME` identifica a cada uno).

### Chat y seguridad para menores
Chat de sala, mensajes privados (amigos o misma sala), hora y remitente, burbujas sobre los
personajes, ocultar chat, silenciar, bloquear, reportar mensajes (se adjunta el texto real del
servidor, no el que envía el cliente) y reportar jugadores o mundos. Límite de longitud y de
frecuencia, bloqueo de mensajes repetidos, filtro de palabras configurable resistente a
leetspeak, separadores y letras repetidas, y bloqueo de datos personales (teléfonos, también
escritos con palabras, correos, enlaces y redes sociales). Las cuentas nuevas no pueden enviar
números ni mensajes privados durante unos minutos. Moderación automática preventiva (mundos con
3 reportes se ocultan; usuarios con 5 reportes se silencian 30 min) y panel de moderación para
resolver reportes, silenciar, suspender y ocultar/restaurar mundos. Sin chat de voz.

### Economía y logros
K-Coins ficticias (sin compras con dinero real). Se ganan con gemas, cofres, carreras, obby,
noches superadas, criaturas, actividad social, logros y subidas de nivel. Tienda con ropa,
peinados, caras, accesorios, emotes, efectos y decoraciones para el editor; cada compra se
valida en una transacción del servidor.

### Gráficos y rendimiento
Calidades Baja/Media/Alta y ajustes de resolución, sombras, distancia de dibujado, detalle del
terreno, luces dinámicas, efectos y niebla. Geometría estática fusionada por material y zona
(pocas llamadas de dibujo), materiales compartidos, texturas generadas de 64 px, materiales
Lambert en calidad baja/media y un número fijo de luces puntuales. Probado en Intel UHD 620.
Cielo dinámico con sol, luna, estrellas, nubes y ciclo día/noche.

### Audio
Música generativa, pasos según la superficie, saltos, aterrizajes, interacción, motores según
la velocidad, efectos de interfaz y ambiente (viento, pájaros de día, grillos de noche). Volumen
independiente de música, efectos y ambiente; sonidos posicionales atenuados por distancia.

---

## Estructura

```
kest-worlds/
├─ start.bat, package.json, vite.config.js, .env.example
├─ shared/               Código común cliente/servidor
│  ├─ constants.js       Física, vehículos, red, límites
│  ├─ terrain.js         Mapa de alturas determinista (isla, colinas)
│  ├─ worldSchema.js     Formato JSON de mundos y su validación
│  ├─ catalog.js         Experiencias, tienda, logros, niveles
│  ├─ avatar.js          Avatar por defecto y validación
│  ├─ geometry.js        Utilidades geométricas
│  └─ worlds/            Generadores de los 5 mundos oficiales
├─ server/
│  ├─ index.js / app.js  Arranque (Express + Socket.IO)
│  ├─ config.js          Variables de entorno
│  ├─ db/                SQLite (esquema e inicialización)
│  ├─ security/          Contraseñas, límites de frecuencia, filtro de chat
│  ├─ services/          Usuarios/progresión, amigos/reportes, mundos
│  ├─ routes/            API REST (auth, perfil, tienda, amigos, mundos, moderación)
│  ├─ realtime/          Presencia y protocolo Socket.IO
│  ├─ chat/              Servicio de chat
│  └─ game/              Salas, validación y modos (city, obby, racing, survival, hangout, custom)
├─ client/
│  ├─ index.html
│  └─ src/
│     ├─ main.js         Aplicación: sesión, navegación, partidas
│     ├─ core/           API, red, estado, ajustes
│     ├─ engine/         Renderizador, física, entrada, cámara, cielo, materiales
│     ├─ world/          Construcción de mundos y terreno
│     ├─ avatar/         Modelo y animaciones
│     ├─ game/           Partida, jugadores, vehículos, modos
│     ├─ editor/         Editor de mundos
│     ├─ audio/          Motor de audio
│     └─ ui/             HUD, pausa, ajustes y pantallas
└─ tests/                Pruebas automáticas (node --test)
```

## Pruebas

`npm test` ejecuta 31 pruebas: registro/inicio/cierre de sesión, bloqueo por intentos, tienda
y validación de avatar, amigos y bloqueos, guardado/validación/publicación de mundos,
multijugador real con dos clientes Socket.IO (visibilidad, movimiento, corrección
antitrampas, chat filtrado, reportes), validación del obby, salas privadas e invitaciones,
vehículos, progresión, filtro de chat, terreno, niveles y física (paredes rotadas, escalones,
rampas, plataformas móviles, techos) y herramientas de moderación.

## Subirlo gratis a internet (Render)

1. Sube la carpeta a un repositorio de GitHub con **GitHub Desktop** (respeta el `.gitignore`: no sube `node_modules`, `dist`, `data` ni `.env`).
2. En <https://render.com> crea una cuenta, pulsa **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y configura todo solo.
3. Al terminar te da una dirección `https://kest-worlds-xxxx.onrender.com` para compartir.

Limitaciones del plan gratuito: el servidor se duerme tras 15 minutos sin jugadores (tarda ~1 minuto en despertar) y **su disco se borra al dormirse**, así que las cuentas se pierden. Por eso existe el botón **Jugar como invitado**: si el servidor se reinició, se crea un invitado nuevo automáticamente. Para conservar cuentas usa un plan con disco persistente (`DB_FILE` en el disco) o un VPS.

## Publicar en un servidor

1. `npm install && npm run build`
2. Configura `.env` (`PORT`, `DB_FILE`, `ADMIN_USERNAMES`…).
3. `npm start` detrás de un proxy inverso con HTTPS (nginx/Caddy) que permita WebSockets.
4. Haz copias de seguridad periódicas del archivo SQLite.

## Límites conocidos de esta primera versión

- Un único proceso de servidor; la interfaz de salas está preparada para escalar pero aún no
  hay reparto entre varios procesos.
- La física es simplificada (cajas y rampas con rotación en Y); los objetos del editor solo
  rotan sobre el eje vertical. Los vehículos no colisionan entre sí.
- La validación antitrampas es básica (velocidad, límites, distancias, tiempos), no
  determinista por completo.
- No hay recuperación de contraseña por correo (no se guardan correos para minimizar datos
  personales).
