// Contrat partagé entre le serveur et le client : plateau, vues de table, réglages et constantes.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** Les trois couleurs de points, dans l'ordre des scores. */
export const TINTS = ['red', 'blue', 'green'] as const;
export type Tint = (typeof TINTS)[number];
export type SpaceKind = Tint | 'angel' | 'devil';

/**
 * Le plateau de l'émission : quatorze coupelles en anneau, parcourues dans le sens des aiguilles d'une montre.
 * La case 0 est le Diable, en haut ; l'Ange lui fait face, en bas, sept cases plus loin.
 * Entre les deux, chaque côté aligne rouge, bleu, vert, rouge, bleu, vert.
 */
export const BOARD: readonly SpaceKind[] = ['devil', 'red', 'blue', 'green', 'red', 'blue', 'green', 'angel', 'red', 'blue', 'green', 'red', 'blue', 'green'];
export const SPACES = BOARD.length;
export const DEVIL = 0;
export const ANGEL = 7;
/** À la pose, une coupelle reçoit deux pions au plus. */
export const PLACE_CAP = 2;

/** Pions par joueur : 4 comme dans l'émission, jusqu'à remplir le plateau sans dépasser 2 pions par coupelle. */
export function piecesFor(players: number): number {
  if (players <= 3) return 6;
  if (players === 4) return 5;
  if (players === 5) return 5;
  if (players <= 7) return 4;
  return 3;
}

/** La partie s'arrête dès qu'une couleur de quelqu'un atteint ce score. */
export const TARGETS = [20, 30] as const;
export type Target = (typeof TARGETS)[number];

/** Le score final : la plus petite couleur, moins l'écart entre la plus grande et la plus petite. */
export function finalScore(s: readonly number[]): number {
  const lo = Math.min(...s);
  const hi = Math.max(...s);
  return lo - (hi - lo);
}

/** Le rythme de l'animation d'un semis : un pion tombe toutes les DROP_MS, puis le score s'affiche. */
export const DROP_MS = 340;
export const SCORE_MS = 1300;
export function sowingMs(drops: number): number {
  return drops * DROP_MS + SCORE_MS;
}

/** Temps pour chaque coup, en secondes (0 : sans limite). */
export const THINK_OPTIONS = [0, 30, 60] as const;
export type ThinkTime = (typeof THINK_OPTIONS)[number];

export interface Settings {
  think: ThinkTime;
  target: Target;
}

export const AVATARS = ['soleil', 'lune', 'etoile', 'couronne', 'epee', 'coupe', 'baton', 'denier', 'roue', 'lion', 'aigle', 'colombe'] as const;
export const EMOTES = ['😇', '😈', '⚖️', '🙏', '😱', '🤝'] as const;
export const TAUNTS = ['Au Diable !', 'Merci, l’Ange', 'On s’allie ?', 'Pas moi, pitié', 'Bien joué', 'Traître !'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** Parties gagnées à cette table. */
  wins: number;
  /** Son numéro de jeu (1 : le premier à jouer), null hors partie. */
  seat: number | null;
  /** Ses points rouges, bleus et verts, null hors partie. */
  score: [number, number, number] | null;
}

/**
 * place : chacun à son tour pose un pion sur le plateau.
 * move : le joueur dont c'est le tour sème une coupelle.
 * color : le dernier pion est tombé chez l'Ange ou le Diable sur une égalité, le semeur choisit la couleur.
 */
export type Stage = 'place' | 'move' | 'color' | 'over';

export interface Drop {
  space: number;
  owner: string;
}

/** Le dernier coup joué, pour l'animer et l'expliquer. */
export interface MoveView {
  /** Croît à chaque coup : sert de clé aux animations. */
  id: number;
  by: string;
  from: number;
  drops: Drop[];
  landing: number;
  scorer: string;
  points: number;
  /** null tant que le semeur n'a pas tranché l'égalité. */
  tint: Tint | null;
  /** La couleur a été choisie par le semeur sur une égalité. */
  chosen: boolean;
  /** Ce coup a fait atteindre le score de fin. */
  ends: boolean;
}

export interface PlaceView {
  id: number;
  by: string;
  space: number;
}

export interface TieView {
  scorer: string;
  points: number;
  where: 'angel' | 'devil';
  options: Tint[];
}

export interface GameView {
  order: string[];
  stage: Stage;
  /** Celui qui doit agir (poser, semer ou choisir la couleur). */
  current: string | null;
  /** Tour de semis (0 pendant la pose). */
  round: number;
  pieces: number;
  target: Target;
  /** Pions posés / à poser pendant la pose. */
  placed: number;
  toPlace: number;
  /** Le contenu de chaque coupelle : les propriétaires, dans l'ordre d'arrivée. */
  board: string[][];
  last: MoveView | null;
  lastPlace: PlaceView | null;
  tie: TieView | null;
  /** Numéro de l'état : une action envoyée pour un état déjà passé est refusée. */
  seq: number;
  /** Fin du chrono du coup en cours (0 : sans limite). */
  endsAt: number;
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  score: [number, number, number];
  final: number;
  place: number;
  wins: number;
  winner: boolean;
}

export interface FinalView {
  rounds: number;
  target: Target;
  /** Celui dont une couleur a atteint le score de fin, et la couleur. */
  closer: string | null;
  closerTint: Tint | null;
  /** Celui qui a joué le coup final. */
  closedBy: string | null;
  players: FinalPlayer[];
  board: string[][];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

export function isSpace(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < SPACES;
}

export function isTint(x: unknown): x is Tint {
  return typeof x === 'string' && (TINTS as readonly string[]).includes(x);
}

/** L'ordre de semis reçu du réseau : une liste de propriétaires (le moteur vérifie qu'elle correspond à la coupelle). */
export function parseDrops(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) return null;
  if (!raw.every((x) => typeof x === 'string' && x.length > 0 && x.length < 40)) return null;
  return raw as string[];
}
