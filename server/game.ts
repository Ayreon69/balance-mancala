// Moteur de Balance Mancala, sans réseau : la pose des pions, les semis, les points de couleur et la fin de partie.
import crypto from 'node:crypto';
import {
  ANGEL,
  BOARD,
  DEVIL,
  PLACE_CAP,
  SPACES,
  TINTS,
  finalScore,
  isSpace,
  isTint,
  piecesFor,
  type MoveView,
  type PlaceView,
  type Stage,
  type Target,
  type TieView,
  type Tint,
} from '../shared/protocol';

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type Score = [number, number, number];

export interface Standing {
  id: string;
  score: Score;
  final: number;
  place: number;
}

/** Les couleurs les plus basses (pour l'Ange) ou les plus hautes (pour le Diable) d'un score. */
export function extremeTints(score: Score, where: 'angel' | 'devil'): Tint[] {
  const ref = where === 'angel' ? Math.min(...score) : Math.max(...score);
  return TINTS.filter((_, i) => score[i] === ref);
}

/** Même contenu, à l'ordre près. */
function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const count = new Map<string, number>();
  for (const x of a) count.set(x, (count.get(x) ?? 0) + 1);
  for (const x of b) {
    const n = count.get(x);
    if (!n) return false;
    count.set(x, n - 1);
  }
  return true;
}

export class Game {
  readonly order: string[];
  readonly pieces: number;
  readonly target: Target;
  board: string[][] = Array.from({ length: SPACES }, () => []);
  scores = new Map<string, Score>();
  stage: Stage = 'place';
  /** Indice, dans l'ordre de jeu, de celui qui agit. */
  turn = 0;
  round = 0;
  placed = 0;
  seq = 0;
  moves = 0;
  last: MoveView | null = null;
  lastPlace: PlaceView | null = null;
  /** Une égalité chez l'Ange ou le Diable, à trancher par le semeur. */
  tie: TieView | null = null;
  closer: string | null = null;
  closerTint: Tint | null = null;
  closedBy: string | null = null;

  constructor(order: string[], target: Target, pieces = piecesFor(order.length)) {
    this.order = [...order];
    this.target = target;
    this.pieces = pieces;
    for (const id of order) this.scores.set(id, [0, 0, 0]);
  }

  /** Une copie indépendante, pour que les bots essaient des coups. */
  clone(): Game {
    const g = new Game(this.order, this.target, this.pieces);
    g.board = this.board.map((s) => [...s]);
    g.scores = new Map([...this.scores].map(([id, s]) => [id, [...s] as Score]));
    g.stage = this.stage;
    g.turn = this.turn;
    g.round = this.round;
    g.placed = this.placed;
    g.seq = this.seq;
    g.moves = this.moves;
    g.last = this.last ? { ...this.last, drops: this.last.drops.map((d) => ({ ...d })) } : null;
    g.lastPlace = this.lastPlace ? { ...this.lastPlace } : null;
    g.tie = this.tie ? { ...this.tie, options: [...this.tie.options] } : null;
    g.closer = this.closer;
    g.closerTint = this.closerTint;
    g.closedBy = this.closedBy;
    return g;
  }

  get current(): string | null {
    return this.stage === 'over' ? null : this.order[this.turn];
  }

  get toPlace(): number {
    return this.order.length * this.pieces;
  }

  score(id: string): Score {
    return this.scores.get(id) ?? [0, 0, 0];
  }

  /** Les coupelles où l'on peut encore poser un pion. */
  placeOptions(): number[] {
    return this.board.flatMap((s, i) => (s.length < PLACE_CAP ? [i] : []));
  }

  /** Les coupelles que ce joueur peut semer : celles où il a au moins un pion. */
  sources(id: string): number[] {
    return this.board.flatMap((s, i) => (s.includes(id) ? [i] : []));
  }

  /** La case où tombe le dernier pion d'une coupelle semée. */
  landingOf(from: number, count = this.board[from].length): number {
    return (from + count) % SPACES;
  }

  place(by: string, space: unknown): string | undefined {
    if (this.stage !== 'place') return "Ce n'est pas le moment de poser un pion.";
    if (by !== this.current) return "Ce n'est pas ton tour.";
    if (!isSpace(space)) return 'Coupelle inconnue.';
    if (this.board[space].length >= PLACE_CAP) return `Cette coupelle a déjà ${PLACE_CAP} pions.`;
    this.board[space].push(by);
    this.placed++;
    this.lastPlace = { id: this.placed, by, space };
    if (this.placed >= this.toPlace) {
      this.stage = 'move';
      this.turn = 0;
      this.round = 1;
    } else this.turn = (this.turn + 1) % this.order.length;
    this.seq++;
    return undefined;
  }

  /** Sème la coupelle `from` : ses pions, dans l'ordre choisi, tombent un par un dans les cases suivantes. */
  move(by: string, from: unknown, drops: readonly string[] | null): string | undefined {
    if (this.stage !== 'move') return "Ce n'est pas le moment de semer.";
    if (by !== this.current) return "Ce n'est pas ton tour.";
    if (!isSpace(from)) return 'Coupelle inconnue.';
    const hand = this.board[from];
    if (!hand.includes(by)) return "Tu n'as aucun pion dans cette coupelle.";
    if (!drops || !sameMultiset(hand, drops)) return 'Ces pions ne sont pas ceux de la coupelle.';
    this.board[from] = [];
    let pos = from;
    const placed = drops.map((owner) => {
      pos = (pos + 1) % SPACES;
      this.board[pos].push(owner);
      return { space: pos, owner };
    });
    const scorer = drops[drops.length - 1];
    const points = this.board[pos].length;
    this.moves++;
    this.last = { id: this.moves, by, from, drops: placed, landing: pos, scorer, points, tint: null, chosen: false, ends: false };
    this.lastPlace = null;
    const kind = BOARD[pos];
    if (isTint(kind)) this.award(kind, false);
    else {
      const where = pos === ANGEL ? 'angel' : 'devil';
      const options = extremeTints(this.score(scorer), where);
      if (options.length === 1) this.award(options[0], false);
      else {
        this.tie = { scorer, points, where, options };
        this.stage = 'color';
      }
    }
    this.seq++;
    return undefined;
  }

  /** Le semeur tranche l'égalité : la couleur où le dernier pion marque. */
  chooseTint(by: string, tint: unknown): string | undefined {
    if (this.stage !== 'color' || !this.tie) return "Il n'y a pas de couleur à choisir.";
    if (by !== this.current) return "C'est au semeur de choisir.";
    if (!isTint(tint) || !this.tie.options.includes(tint)) return 'Cette couleur ne fait pas partie du choix.';
    this.tie = null;
    this.award(tint, true);
    this.seq++;
    return undefined;
  }

  private award(tint: Tint, chosen: boolean): void {
    const m = this.last!;
    const s = this.score(m.scorer);
    const i = TINTS.indexOf(tint);
    s[i] += m.points;
    this.scores.set(m.scorer, s);
    m.tint = tint;
    m.chosen = chosen;
    if (s[i] >= this.target) {
      m.ends = true;
      this.closer = m.scorer;
      this.closerTint = tint;
      this.closedBy = m.by;
      this.stage = 'over';
      return;
    }
    this.stage = 'move';
    this.turn = (this.turn + 1) % this.order.length;
    if (this.turn === 0) this.round++;
  }

  /** Le classement : le meilleur score final, puis la meilleure couleur la plus basse ; sinon la place est partagée. */
  standings(): Standing[] {
    const rows = this.order.map((id) => {
      const score = [...this.score(id)] as Score;
      return { id, score, final: finalScore(score), place: 0 };
    });
    const key = (r: Standing) => [r.final, Math.min(...r.score)];
    rows.sort((a, b) => key(b)[0] - key(a)[0] || key(b)[1] - key(a)[1]);
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      r.place = prev && prev.final === r.final && Math.min(...prev.score) === Math.min(...r.score) ? prev.place : i + 1;
    });
    return rows;
  }
}

export { ANGEL, DEVIL };
