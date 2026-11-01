// Les bots de Balance Mancala : ils voient le plateau et les scores comme tout le monde, et calculent leurs coups côté serveur.
import crypto from 'node:crypto';
import { BOARD, SPACES, TINTS, finalScore, type Tint } from '../shared/protocol';
import { Game, extremeTints, type Score } from './game';

export interface Skill {
  label: string;
  /** Prévoit la réponse du joueur suivant. */
  lookahead: boolean;
  /** L'imprécision de son jugement. */
  noise: number;
  /** Le poids du meilleur adversaire face à la moyenne des autres. */
  spite: number;
}

export const SKILLS: Skill[] = [
  { label: 'novice', lookahead: false, noise: 2.5, spite: 0.25 },
  { label: 'habile', lookahead: false, noise: 0.8, spite: 0.5 },
  { label: 'retors', lookahead: true, noise: 0.3, spite: 0.7 },
];

/** Le pilote automatique d'un absent joue proprement, sans finesse. */
export const AUTOPILOT: Skill = { label: 'pilote', lookahead: false, noise: 0.2, spite: 0.5 };

export function randomSkill(): Skill {
  const r = Math.random();
  return r < 0.25 ? SKILLS[0] : r < 0.65 ? SKILLS[1] : SKILLS[2];
}

function jitter(noise: number): number {
  return noise ? (Math.random() + Math.random() + Math.random() - 1.5) * noise : 0;
}

/** Où en est la partie : de 0 au début à 1 quand quelqu'un touche le score de fin. */
function progress(g: Game): number {
  let hi = 0;
  for (const s of g.scores.values()) hi = Math.max(hi, ...s);
  return Math.min(1, hi / g.target);
}

/** La valeur d'un score : le score final, plus un peu des points bruts tant que la fin est loin. */
function worth(s: Score, lam: number): number {
  return finalScore(s) + lam * (s[0] + s[1] + s[2]);
}

/** La couleur où tomberait un pion qu'on fait marquer à ce joueur sur cette case. */
function tintAt(space: number, score: Score): Tint {
  const kind = BOARD[space];
  return kind === 'angel' || kind === 'devil' ? extremeTints(score, kind)[0] : kind;
}

function added(s: Score, tint: Tint, pts: number): Score {
  const n = [...s] as Score;
  n[TINTS.indexOf(tint)] += pts;
  return n;
}

/** Le meilleur gain qu'un joueur peut s'offrir à son prochain tour, si personne ne touche au plateau d'ici là. */
function chance(g: Game, id: string, lam: number): number {
  const s = g.score(id);
  const base = worth(s, lam);
  let best = 0;
  for (let from = 0; from < SPACES; from++) {
    const hand = g.board[from];
    if (!hand.includes(id) || hand.length >= SPACES) continue;
    const landing = (from + hand.length) % SPACES;
    const pts = g.board[landing].length + 1;
    const tint = tintAt(landing, s);
    const next = added(s, tint, pts);
    if (next[TINTS.indexOf(tint)] >= g.target) continue;
    best = Math.max(best, worth(next, lam) - base);
  }
  return best;
}

/** Fin de partie : seule la place compte, puis l'écart avec le premier. */
function terminal(g: Game, me: string): number {
  const rows = g.standings();
  const mine = rows.find((r) => r.id === me)!;
  if (mine.place === 1) {
    const shared = rows.filter((r) => r.place === 1).length;
    const second = rows.find((r) => r.place > 1);
    return (shared > 1 ? 60 : 100) + Math.min(20, mine.final - (second?.final ?? mine.final));
  }
  return -30 - 12 * (mine.place - 1) + Math.max(-20, mine.final - rows[0].final);
}

/** Ce que vaut une situation pour ce joueur. */
export function evaluate(g: Game, me: string, skill: Skill): number {
  if (g.stage === 'over') return terminal(g, me);
  const lam = 0.45 * (1 - progress(g));
  const mine = worth(g.score(me), lam);
  let best = -Infinity;
  let sum = 0;
  let n = 0;
  for (const id of g.order) {
    if (id === me) continue;
    const v = worth(g.score(id), lam);
    best = Math.max(best, v);
    sum += v;
    n++;
  }
  return mine - (skill.spite * best + (1 - skill.spite) * (sum / n)) + 0.4 * chance(g, me, lam);
}

/** Les ordres de semis distincts d'une coupelle ; au-delà de `cap`, un échantillon où chaque dernier pion possible figure. */
export function orders(hand: readonly string[], cap = 90): string[][] {
  const count = new Map<string, number>();
  for (const x of hand) count.set(x, (count.get(x) ?? 0) + 1);
  const keys = [...count.keys()];
  let total = 1;
  for (let i = 2; i <= hand.length; i++) total *= i;
  for (const c of count.values()) for (let i = 2; i <= c; i++) total /= i;
  if (total <= cap) {
    const out: string[][] = [];
    const cur: string[] = [];
    const rec = () => {
      if (cur.length === hand.length) {
        out.push([...cur]);
        return;
      }
      for (const k of keys) {
        const c = count.get(k)!;
        if (!c) continue;
        count.set(k, c - 1);
        cur.push(k);
        rec();
        cur.pop();
        count.set(k, c);
      }
    };
    rec();
    return out;
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  const add = (o: string[]) => {
    const key = o.join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };
  for (const last of keys) {
    for (let t = 0; t < 4; t++) {
      const rest = [...hand];
      rest.splice(rest.indexOf(last), 1);
      add([...shuffleLocal(rest), last]);
    }
  }
  while (out.length < cap) add(shuffleLocal([...hand]));
  return out;
}

function shuffleLocal<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Plan {
  from: number;
  drops: string[];
  /** La couleur à choisir si le coup tombe sur une égalité chez l'Ange ou le Diable. */
  tint: Tint | null;
}

/** Joue un coup sur une copie, en tranchant l'égalité au mieux pour le semeur. */
function tryPlan(g: Game, me: string, from: number, drops: string[], skill: Skill): { after: Game; tint: Tint | null } {
  const after = g.clone();
  after.move(me, from, drops);
  if (after.stage !== 'color' || !after.tie) return { after, tint: null };
  let bestTint: Tint = after.tie.options[0];
  let best = -Infinity;
  let bestGame = after;
  for (const t of after.tie.options) {
    const h = after.clone();
    h.chooseTint(me, t);
    const v = evaluate(h, me, skill);
    if (v > best) {
      best = v;
      bestTint = t;
      bestGame = h;
    }
  }
  return { after: bestGame, tint: bestTint };
}

interface Candidate extends Plan {
  value: number;
  after: Game;
}

function candidates(g: Game, me: string, skill: Skill): Candidate[] {
  const out: Candidate[] = [];
  for (const from of g.sources(me)) {
    for (const drops of orders(g.board[from])) {
      const { after, tint } = tryPlan(g, me, from, drops, skill);
      out.push({ from, drops, tint, after, value: evaluate(after, me, skill) });
    }
  }
  return out;
}

/** Le coup du bot : le meilleur selon son jugement, et pour les plus retors, après avoir prévu la riposte du suivant. */
export function botMove(g: Game, me: string, skill: Skill): Plan {
  const list = candidates(g, me, skill);
  if (skill.lookahead) {
    list.sort((a, b) => b.value - a.value);
    for (const c of list.slice(0, 6)) {
      if (c.after.stage === 'over') continue;
      const next = c.after.current;
      if (!next || next === me) continue;
      const reply = candidates(c.after, next, AUTOPILOT).reduce((a, b) => (b.value > a.value ? b : a));
      c.value = 0.5 * c.value + 0.5 * evaluate(reply.after, me, skill);
    }
  }
  let best = list[0];
  let bestV = -Infinity;
  for (const c of list) {
    const v = c.value + jitter(skill.noise);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return { from: best.from, drops: best.drops, tint: best.tint };
}

/** Le bot pose un pion là où il se ménage le meilleur coup à venir. */
export function botPlace(g: Game, me: string, skill: Skill): number {
  const options = g.placeOptions();
  let best = options[0];
  let bestV = -Infinity;
  for (const space of options) {
    const h = g.clone();
    h.place(me, space);
    const v = chance(h, me, 0.45) + jitter(skill.noise + 0.6);
    if (v > bestV) {
      bestV = v;
      best = space;
    }
  }
  return best;
}

/** Sur une égalité, la couleur qui sert le mieux le semeur. */
export function botTint(g: Game, me: string, skill: Skill): Tint {
  const options = g.tie?.options ?? [...TINTS];
  let best = options[0];
  let bestV = -Infinity;
  for (const t of options) {
    const h = g.clone();
    h.chooseTint(me, t);
    const v = evaluate(h, me, skill);
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  return best;
}

/** Un joueur qui sème au hasard : la référence pour mesurer les bots. */
export function randomMove(g: Game, me: string): Plan {
  const sources = g.sources(me);
  const from = sources[crypto.randomInt(sources.length)];
  const drops = shuffleLocal([...g.board[from]]);
  return { from, drops, tint: null };
}
