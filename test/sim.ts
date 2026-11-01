// Simulation : des bots entre eux, pour juger leur niveau et la durée des parties (npx tsx test/sim.ts 200).
import { piecesFor, type Target } from '../shared/protocol';
import { AUTOPILOT, SKILLS, botMove, botPlace, botTint, randomMove, type Skill } from '../server/bots';
import { Game } from '../server/game';

const N = Number(process.argv[2] ?? 100);
const ONLY = process.argv[3] ? Number(process.argv[3]) : null;
const TARGET = Number(process.argv[4] ?? 30) as Target;
const PIECES = process.argv[5] ? Number(process.argv[5]) : null;

type Brain = Skill | 'random';

function play(order: string[], brain: (id: string) => Brain, target: Target, pieces: number): { game: Game; ms: number; decisions: number; worst: number } {
  const g = new Game(order, target, pieces);
  let ms = 0;
  let decisions = 0;
  let worst = 0;
  for (let guard = 0; guard < 5000 && g.stage !== 'over'; guard++) {
    const id = g.current!;
    const b = brain(id);
    const skill = b === 'random' ? AUTOPILOT : b;
    const t = performance.now();
    let err: string | undefined;
    if (g.stage === 'place') {
      const opts = g.placeOptions();
      err = g.place(id, b === 'random' ? opts[Math.floor(Math.random() * opts.length)] : botPlace(g, id, skill));
    } else if (g.stage === 'move') {
      const plan = b === 'random' ? randomMove(g, id) : botMove(g, id, skill);
      err = g.move(id, plan.from, plan.drops);
      if (!err && (g.stage as string) === 'color') err = g.chooseTint(id, plan.tint ?? g.tie!.options[0]);
    } else if (g.stage === 'color') err = g.chooseTint(id, botTint(g, id, skill));
    const dt = performance.now() - t;
    ms += dt;
    worst = Math.max(worst, dt);
    decisions++;
    if (err) throw new Error(err);
  }
  if (g.stage !== 'over') throw new Error('partie bloquée');
  return { game: g, ms, decisions, worst };
}

const counts = ONLY ? [ONLY] : [3, 4, 5, 6, 7, 8];
for (const n of counts) {
  const pieces = PIECES ?? piecesFor(n);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  let rounds = 0;
  let ms = 0;
  let decisions = 0;
  let worst = 0;
  let finals = 0;
  let maxRounds = 0;
  const winsBy = new Map<string, number>();
  const seats = new Map<string, number>();
  for (let k = 0; k < N; k++) {
    const skills = new Map(ids.map((id, i) => [id, SKILLS[(i + k) % SKILLS.length]]));
    const r = play(ids, (id) => skills.get(id)!, TARGET, pieces);
    rounds += r.game.round;
    maxRounds = Math.max(maxRounds, r.game.round);
    ms += r.ms;
    decisions += r.decisions;
    worst = Math.max(worst, r.worst);
    const rows = r.game.standings();
    finals += rows.reduce((a, b) => a + b.final, 0) / rows.length;
    for (const row of rows.filter((x) => x.place === 1)) {
      const label = skills.get(row.id)!.label;
      winsBy.set(label, (winsBy.get(label) ?? 0) + 1);
      seats.set(row.id, (seats.get(row.id) ?? 0) + 1);
    }
  }
  // Un bot moyen contre des joueurs qui sèment au hasard.
  let beat = 0;
  const M = Math.max(10, Math.floor(N / 2));
  for (let k = 0; k < M; k++) {
    const r = play(ids, (id) => (id === ids[k % n] ? SKILLS[1] : 'random'), TARGET, pieces);
    if (r.game.standings().some((x) => x.id === ids[k % n] && x.place === 1)) beat++;
  }
  const share = [...winsBy].map(([l, w]) => `${l} ${Math.round((100 * w) / N)} %`).join(', ');
  const bySeat = ids.map((id) => Math.round((100 * (seats.get(id) ?? 0)) / N)).join('/');
  console.log(
    `${n} joueurs, ${pieces} pions, fin à ${TARGET} : ${(rounds / N).toFixed(1)} tours en moyenne (max ${maxRounds}), score final moyen ${(finals / N).toFixed(1)}, ` +
      `${(ms / decisions).toFixed(1)} ms par décision (pire ${worst.toFixed(0)} ms). Victoires : ${share} ; par siège ${bySeat} %. ` +
      `Un bot « habile » contre des joueurs au hasard gagne ${Math.round((100 * beat) / M)} % (au hasard : ${Math.round(100 / n)} %).`,
  );
}
