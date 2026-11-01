// Les mots de la table : noms, places, couleurs, durée d'une partie et récit du dernier coup.
import { ANGEL, DEVIL, piecesFor, type MoveView, type RoomView, type Target, type Tint } from '../../../shared/protocol';
import { TINT_LABEL } from '../components/Ui';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** « 1re », « 2e ». */
export function placeLabel(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

export function tintWord(t: Tint): string {
  return TINT_LABEL[t];
}

/** La durée d'une partie, mesurée en parties de bots : le nombre de tours à peu près. */
const ROUNDS: Record<Target, number[]> = {
  20: [14, 12, 10, 10, 9, 11],
  30: [21, 19, 15, 17, 15, 17],
};

export function rulesLine(players: number, target: Target): string {
  const n = Math.max(3, Math.min(8, players));
  const rounds = ROUNDS[target][n - 3];
  return `${piecesFor(n)} pions chacun. La partie s'arrête dès qu'une couleur atteint ${target}, en ${rounds} tours environ.`;
}

/** Ce qu'a donné le dernier coup, en une phrase : « Sam fait marquer Léa : +3 en rouge ». */
export function moveText(view: RoomView, m: MoveView): string {
  const by = nameOf(view, m.by);
  const scorer = nameOf(view, m.scorer);
  const self = m.by === m.scorer;
  const where = m.landing === DEVIL ? ' chez le Diable' : m.landing === ANGEL ? " chez l'Ange" : '';
  const gain = m.tint ? `+${m.points} en ${tintWord(m.tint)}` : `+${m.points}, couleur à choisir`;
  if (self) return `${capital(by)} ${m.by === view.me ? 'marques' : 'marque'}${where} : ${gain}`;
  return `${capital(by)} ${m.by === view.me ? 'fais' : 'fait'} marquer ${scorer}${where} : ${gain}`;
}
