// Test de bout en bout sur le serveur compilé : 3 humains (socket.io) + 2 bots jouent une partie complète jusqu'à 20,
// un spectateur arrive en cours de route, un joueur se déconnecte puis revient ; puis une revanche à 8 jusqu'à 30, la table pleine.
// À chaque état reçu, on vérifie qu'aucun secret ne fuit et que le plateau suit les règles. Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), BM_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

// Recopié des règles, pour ne pas dépendre du code testé.
const BOARD = ['devil', 'red', 'blue', 'green', 'red', 'blue', 'green', 'angel', 'red', 'blue', 'green', 'red', 'blue', 'green'];
const TINTS = ['red', 'blue', 'green'];
const piecesFor = (n) => (n <= 3 ? 6 : n <= 5 ? 5 : n <= 7 ? 4 : 3);
const finalScore = (s) => 2 * Math.min(...s) - Math.max(...s);
const stats = { states: 0, places: 0, moves: 0, ties: 0, refused: 0, angel: 0, devil: 0 };

function client(name, { player = true, avatar = 'soleil' } = {}) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, avatar, player, session: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(c, v);
    if (c.player) play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Tout est public dans ce jeu, sauf les sessions et la tête des bots ; le plateau, lui, doit toujours suivre les règles. */
function audit(c, v) {
  stats.states++;
  const json = JSON.stringify(v);
  for (const word of ['"token":', '"skill', '"spite"', '"memory"', '"plan"', '"botActAt"']) if (json.includes(word)) fail(`la vue contient ${word}`);
  const g = v.game;
  if (v.phase !== 'playing' || !g) return;
  const n = g.order.length;
  if (g.pieces !== piecesFor(n)) fail(`${g.pieces} pions par joueur à ${n} au lieu de ${piecesFor(n)}`);
  if (g.target !== v.settings.target) fail('le score de fin ne suit pas les réglages');
  if (g.board.length !== 14) fail('le plateau doit avoir 14 coupelles');
  const total = g.board.reduce((a, s) => a + s.length, 0);
  const own = (id) => g.board.reduce((a, s) => a + s.filter((x) => x === id).length, 0);
  const scoreOf = (id) => v.players.find((p) => p.id === id)?.score;
  for (const id of g.order) {
    const s = scoreOf(id);
    if (!s || s.length !== 3 || s.some((x) => !Number.isInteger(x) || x < 0)) fail(`score illisible pour ${id}`);
  }
  for (const p of v.players) if (!g.order.includes(p.id) && p.score !== null) fail('un spectateur a un score');

  if (g.stage === 'place') {
    if (g.round !== 0 || g.last || g.tie) fail('un semis pendant la pose');
    if (total !== g.placed || g.toPlace !== n * g.pieces) fail(`pose mal comptée : ${total} sur le plateau, ${g.placed} posés`);
    if (g.board.some((s) => s.length > 2)) fail('plus de deux pions dans une coupelle pendant la pose');
    for (const id of g.order) if (own(id) > g.pieces) fail(`${id} a posé trop de pions`);
    if (g.order.some((id) => scoreOf(id).some((x) => x > 0))) fail('des points avant le premier semis');
    if (g.current !== g.order[g.placed % n]) fail('la pose ne suit pas l’ordre du tour');
    return;
  }
  // Après la pose, chacun garde tous ses pions sur le plateau.
  if (total !== g.toPlace) fail(`${total} pions sur le plateau au lieu de ${g.toPlace}`);
  for (const id of g.order) if (own(id) !== g.pieces) fail(`${id} a ${own(id)} pions au lieu de ${g.pieces}`);
  if (!!g.tie !== (g.stage === 'color')) fail('choix de couleur incohérent');

  const m = g.last;
  if (!m) {
    if (g.stage !== 'move' || g.round !== 1 || g.current !== g.order[0]) fail('le premier semis revient au premier joueur');
    return;
  }
  // Le dernier coup, tel qu'il s'affiche : le plateau est celui d'après ce coup.
  if (m.landing !== (m.from + m.drops.length) % 14) fail('le dernier pion ne tombe pas au bon endroit');
  m.drops.forEach((d, i) => d.space !== (m.from + i + 1) % 14 && fail('un pion sauté pendant le semis'));
  if (m.scorer !== m.drops.at(-1).owner) fail('le marqueur n’est pas le propriétaire du dernier pion');
  if (g.board[m.landing].length !== m.points) fail(`${m.points} points pour une coupelle de ${g.board[m.landing].length} pions`);
  if (m.drops.length < 14 && g.board[m.from].length !== 0) fail('la coupelle semée n’est pas vide');
  const kind = BOARD[m.landing];
  if (g.stage === 'color') {
    if (m.tint !== null || g.current !== m.by || g.tie.scorer !== m.scorer || g.tie.points !== m.points) fail('égalité mal posée');
    if (g.tie.where !== kind || g.tie.options.length < 2) fail('une égalité sans choix');
    const s = scoreOf(m.scorer);
    const want = kind === 'angel' ? Math.min(...s) : Math.max(...s);
    if (g.tie.options.some((t) => s[TINTS.indexOf(t)] !== want) || s.filter((x) => x === want).length !== g.tie.options.length) fail('les couleurs proposées ne sont pas les extrêmes');
    return;
  }
  if (!m.tint) fail('un coup sans couleur hors égalité');
  if (kind !== 'angel' && kind !== 'devil' && m.tint !== kind) fail(`une coupelle ${kind} a marqué en ${m.tint}`);
  // L'Ange donne la couleur la plus basse, le Diable la plus haute : on la retrouve en retirant les points marqués.
  const before = [...scoreOf(m.scorer)];
  before[TINTS.indexOf(m.tint)] -= m.points;
  if (before.some((x) => x < 0)) fail('les points du dernier coup ne figurent pas au score');
  if (kind === 'angel' || kind === 'devil') {
    const want = kind === 'angel' ? Math.min(...before) : Math.max(...before);
    if (before[TINTS.indexOf(m.tint)] !== want) fail(`${kind} : mauvaise couleur (${m.tint} sur ${before})`);
    if (m.chosen !== before.filter((x) => x === want).length > 1) fail(`${kind} : choix signalé à tort`);
  } else if (m.chosen) fail('un choix de couleur sur une coupelle de couleur');
  const top = Math.max(...g.order.map((id) => Math.max(...scoreOf(id))));
  if (m.ends !== (g.stage === 'over')) fail('la fin ne suit pas le coup final');
  if (g.stage === 'over' ? scoreOf(m.scorer)[TINTS.indexOf(m.tint)] < g.target : top >= g.target) fail('la partie aurait dû s’arrêter (ou pas)');
}

const busy = new Set();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);

/** Un joueur au hasard : il pose, sème et choisit sa couleur au hasard ; parfois, il tente un coup interdit. */
function play(c) {
  const v = c.view;
  const g = v?.game;
  if (!v || v.phase !== 'playing' || !g || g.current !== v.me) return;
  const send = (key, event, payload, expectOk = true) => {
    if (busy.has(key)) return;
    busy.add(key);
    c.socket.emit(event, payload, (res) => {
      if (res?.ok !== expectOk) fail(`${c.name} : ${event} ${JSON.stringify(payload)} → ${JSON.stringify(res)}`);
      if (!res?.ok) stats.refused++;
    });
  };
  const k = (what) => `${c.name}:${what}:${g.seq}`;
  if (g.stage === 'place') {
    const full = g.board.findIndex((s) => s.length >= 2);
    if (full >= 0 && Math.random() < 0.3) send(k('full'), 'game:place', { space: full, seq: g.seq }, false);
    stats.places++;
    return send(k('place'), 'game:place', { space: pick(g.board.flatMap((s, i) => (s.length < 2 ? [i] : []))), seq: g.seq });
  }
  if (g.stage === 'move') {
    const mine = g.board.flatMap((s, i) => (s.includes(v.me) ? [i] : []));
    const other = g.board.findIndex((s) => s.length && !s.includes(v.me));
    if (other >= 0 && Math.random() < 0.15) send(k('other'), 'game:move', { from: other, drops: g.board[other], seq: g.seq }, false);
    const from = pick(mine);
    if (Math.random() < 0.1) send(k('lie'), 'game:move', { from, drops: [...g.board[from], v.me], seq: g.seq }, false);
    if (Math.random() < 0.1) send(k('stale'), 'game:move', { from, drops: g.board[from], seq: g.seq - 1 }, false);
    stats.moves++;
    return send(k('move'), 'game:move', { from, drops: shuffled(g.board[from]), seq: g.seq });
  }
  if (g.stage === 'color') {
    const wrong = TINTS.find((t) => !g.tie.options.includes(t));
    if (wrong && Math.random() < 0.3) send(k('wrong'), 'game:tint', { tint: wrong, seq: g.seq }, false);
    stats.ties++;
    return send(k('tint'), 'game:tint', { tint: pick(g.tie.options), seq: g.seq });
  }
}

const waitPhase = (c, phase) =>
  new Promise((resolve) => {
    const check = setInterval(() => {
      if (c.view?.phase === phase) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

/** Le classement : les scores finaux bien calculés et rangés, un seul joueur au-delà du score de fin. */
function checkFinal(final, players, target) {
  if (!final || final.players.length !== players) fail(`table finale incomplète (${final?.players.length})`);
  if (final.target !== target) fail('le score de fin a changé en route');
  const rows = final.players;
  for (const p of rows) if (p.final !== finalScore(p.score)) fail(`score final faux pour ${p.name}`);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const tied = a.final === b.final && Math.min(...a.score) === Math.min(...b.score);
    if (a.final < b.final || (a.final === b.final && Math.min(...a.score) < Math.min(...b.score))) fail('classement mal rangé');
    if (tied ? b.place !== a.place : b.place !== i + 1) fail(`places incohérentes : ${rows.map((x) => x.place)}`);
  }
  if (rows.some((p) => p.winner !== (p.place === 1))) fail('gagnants mal marqués');
  const over = rows.filter((p) => Math.max(...p.score) >= target);
  const closer = rows.find((p) => p.id === final.closer);
  if (over.length !== 1 || over[0] !== closer || closer.score[TINTS.indexOf(final.closerTint)] < target) fail('un seul joueur doit avoir atteint le score de fin');
  if (final.board.reduce((a, s) => a + s.length, 0) !== players * piecesFor(players)) fail('des pions ont disparu');
  return rows[0];
}

// Les coups vus par l'hôte : Ange et Diable.
const seenMoves = new Set();
function watchMoves(c) {
  c.socket.on('state', (v) => {
    const m = v.game?.last;
    if (!m?.tint || seenMoves.has(`${v.code}:${v.game.order.length}:${m.id}`)) return;
    seenMoves.add(`${v.code}:${v.game.order.length}:${m.id}`);
    if (m.landing === 7) stats.angel++;
    if (m.landing === 0) stats.devil++;
  });
}

// ── Partie 1 : 3 humains + 2 bots, fin à 20 ──
const host = client('Ana');
await new Promise((r) => host.socket.on('connect', r));
watchMoves(host);
const created = await host.call('room:create', { name: 'Ana', avatar: 'soleil', bots: 2 });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const bob = client('Bob');
const chloe = client('Chloé');
await Promise.all([bob, chloe].map((c) => new Promise((r) => c.socket.on('connect', r))));
for (const c of [bob, chloe]) {
  const res = await c.call('room:join', { code, name: c.name, avatar: 'lune' });
  if (!res.ok) fail(`arrivée de ${c.name} : ${res.error}`);
  c.session = res.data;
}
if (!(await host.call('room:settings', { think: 30 })).ok) fail('réglages refusés');
await host.call('room:settings', { think: 45, target: 25 });
await new Promise((r) => setTimeout(r, 100));
if (host.view.settings.think !== 30 || host.view.settings.target !== 20) fail('un réglage hors liste a été accepté');
if ((await bob.call('room:settings', { think: 0 })).ok) fail('un invité a changé les réglages');
if ((await bob.call('game:start')).ok) fail('un invité a lancé la partie');
// Une réaction passe d'un joueur à l'autre.
const heard = new Promise((r) => bob.socket.once('emote', r));
host.socket.emit('emote', { emoji: 'Au Diable !' });
if ((await heard).emoji !== 'Au Diable !') fail('réaction perdue');
const start = await host.call('game:start');
if (!start.ok) fail(`lancement : ${start.error}`);

// Un spectateur arrive en cours de partie : il voit le plateau, sans siège ni score, et ne peut pas jouer.
await new Promise((r) => setTimeout(r, 300));
const watcher = client('Dora', { player: false, avatar: 'etoile' });
await new Promise((r) => watcher.socket.on('connect', r));
const joined = await watcher.call('room:join', { code, name: 'Dora', avatar: 'etoile' });
if (!joined.ok) fail(`spectateur : ${joined.error}`);
watcher.session = joined.data;
await new Promise((r) => setTimeout(r, 100));
const dora = watcher.view.players.find((p) => p.name === 'Dora');
if (dora?.status !== 'spectator' || dora.seat !== null) fail('la retardataire devrait regarder');
if (!watcher.view.game?.board) fail('le spectateur ne voit pas le plateau');
if ((await watcher.call('game:place', { space: 3 })).ok || (await watcher.call('game:move', { from: 3, drops: ['x'] })).ok) fail('le spectateur a joué');

// Bob se déconnecte un moment, puis revient avec sa session.
await new Promise((r) => setTimeout(r, 400));
bob.socket.disconnect();
await new Promise((r) => setTimeout(r, 900));
bob.socket.connect();
await new Promise((r) => bob.socket.on('connect', r));
const back = await bob.call('room:join', { code, playerId: bob.session.playerId, token: bob.session.token, resumeOnly: true });
if (!back.ok) fail(`retour de Bob : ${back.error}`);
const intruder = await chloe.call('room:join', { code, playerId: bob.session.playerId, token: 'faux', resumeOnly: true });
if (intruder.ok) fail('une session volée a été acceptée');

await waitPhase(host, 'finished');
const w1 = checkFinal(host.view.final, 5, 20);
if (!host.view.players.some((p) => p.wins === 1)) fail('la victoire n’est pas comptée');
const rounds1 = host.view.final.rounds;

// ── Partie 2 : revanche à 8, la table pleine (Dora s'assoit, deux bots de plus), fin à 30 ──
if ((await bob.call('game:restart')).ok) fail('un invité a relancé la partie');
if (!(await host.call('game:restart')).ok) fail('revanche refusée');
await new Promise((r) => setTimeout(r, 150));
if (host.view.phase !== 'lobby') fail('la revanche ne ramène pas au salon');
// Les numéros d'état repartent de zéro : on oublie les coups déjà envoyés.
busy.clear();
watcher.player = true;
for (let i = 0; i < 2; i++) if (!(await host.call('room:addBot')).ok) fail('ajout de bot refusé');
// L'accusé de réception arrive avant le nouvel état : on laisse le temps à la vue de suivre.
await new Promise((r) => setTimeout(r, 150));
const seatedNow = host.view.players.filter((p) => p.status !== 'spectator').length;
if (seatedNow !== 8) fail(`8 joueurs attendus au salon, ${seatedNow} trouvés`);
if ((await host.call('room:addBot')).ok) fail('un neuvième joueur a été accepté');
if (!(await host.call('room:settings', { think: 0, target: 30 })).ok) fail('réglages de la revanche refusés');
if (!(await host.call('game:start')).ok) fail('lancement de la revanche refusé');
await new Promise((r) => setTimeout(r, 50));
if (host.view.game.pieces !== 3 || host.view.game.toPlace !== 24 || host.view.game.target !== 30) fail('mise en place de la revanche fausse');

await waitPhase(host, 'finished');
const w2 = checkFinal(host.view.final, 8, 30);
if (!stats.angel || !stats.devil) fail(`ni Ange ni Diable en deux parties (${stats.angel}/${stats.devil}) : suspect`);

console.log(`✓ partie 1 (5 joueurs, fin à 20) : ${rounds1} tours, ${w1.name} gagne avec ${w1.final}.`);
console.log(`✓ partie 2 (8 joueurs, fin à 30, sans limite) : ${host.view.final.rounds} tours, ${w2.name} gagne avec ${w2.final}.`);
console.log(
  `  ${stats.places} pions posés, ${stats.moves} semis et ${stats.ties} égalités tranchées par les humains ; ${stats.angel} fois l'Ange et ${stats.devil} fois le Diable ; ${stats.refused} coups interdits refusés ; ${stats.states} états vérifiés.`,
);
for (const c of [host, bob, chloe, watcher]) c.socket.close();
server.kill();
process.exit(0);
