// Une table de Balance Mancala : salon, partie, minuteries, bots, pilote automatique et vue de chacun.
import crypto from 'node:crypto';
import {
  ANGEL,
  AVATARS,
  DEVIL,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TARGETS,
  THINK_OPTIONS,
  parseDrops,
  sowingMs,
  type GameView,
  type FinalView,
  type PlayerStatus,
  type RoomView,
  type Settings,
  type Target,
  type ThinkTime,
} from '../shared/protocol';
import { AUTOPILOT, botMove, botPlace, botTint, randomSkill, type Skill } from './bots';
import { Game, shuffle } from './game';

const BOT_NAMES = ['Bateleur', 'Papesse', 'Ermite', 'Pendu', 'Chariot', 'Étoile', 'Lune', 'Soleil', 'Monde', 'Mat'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (BM_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.BM_FAST === '1';
/** En mode accéléré, un humain n'a qu'un instant pour jouer : on atteint vite la fin. */
const FAST_THINK_MS = 1_500;
/** Le temps de voir un pion se poser. */
const PLACE_MS = FAST ? 20 : 500;
/** Après le coup final, le temps de voir le dernier pion tomber et la couleur déborder. */
const FINISH_MS = FAST ? 150 : 2_600;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { think: 60, target: 20 };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  skills = new Map<string, Skill>();
  /** Le coup en cours : son début (après l'animation du précédent), sa fin, et le moment où le bot joue. */
  turnStartedAt = 0;
  turnEndsAt = 0;
  botActAt = 0;
  finishAt = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const name = names.length ? names[crypto.randomInt(names.length)] : `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : le pilote automatique joue pour lui.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if ((THINK_OPTIONS as readonly unknown[]).includes(payload.think)) this.settings.think = payload.think as ThinkTime;
    if ((TARGETS as readonly unknown[]).includes(payload.target)) this.settings.target = payload.target as Target;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    for (const p of seated) p.status = 'playing';
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, this.settings.target);
    this.skills.clear();
    for (const p of this.players) if (p.isBot && p.status === 'playing') this.skills.set(p.id, randomSkill());
    this.phase = 'playing';
    this.final = null;
    this.armTurn(0);
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.skills.clear();
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Plus aucun humain présent à la table : les bots jouent vite. */
  private onlyBots(): boolean {
    const g = this.game;
    return !!g && g.order.every((id) => {
      const p = this.get(id);
      return !p || this.isAuto(p);
    });
  }

  private botDelay(min: number, spread: number): number {
    if (FAST) return 15;
    if (this.onlyBots()) return 250;
    return min + Math.random() * spread;
  }

  /** Prépare le coup qui commence, une fois l'animation du précédent terminée : chrono de l'humain, réflexion du bot. */
  private armTurn(settleMs: number): void {
    const g = this.game;
    if (!g) return;
    const start = Date.now() + settleMs;
    this.turnStartedAt = start;
    const think = this.settings.think * 1000;
    this.turnEndsAt = FAST ? start + FAST_THINK_MS : think ? start + think : 0;
    const delay = g.stage === 'place' ? this.botDelay(700, 1100) : g.stage === 'color' ? this.botDelay(900, 900) : this.botDelay(1500, 2500);
    this.botActAt = start + delay;
  }

  private check(seq: unknown): string | undefined {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    if (this.game.stage === 'over') return 'La partie est terminée.';
    if (seq !== undefined && seq !== this.game.seq) return 'Le plateau a changé entre-temps.';
    return undefined;
  }

  place(by: string, space: unknown, seq?: unknown): string | undefined {
    const err = this.check(seq);
    if (err) return err;
    const refused = this.game!.place(by, space);
    if (refused) return refused;
    this.armTurn(PLACE_MS);
    return undefined;
  }

  move(by: string, from: unknown, drops: unknown, seq?: unknown): string | undefined {
    const err = this.check(seq);
    if (err) return err;
    const refused = this.game!.move(by, from, parseDrops(drops));
    if (refused) return refused;
    this.afterMove(false);
    return undefined;
  }

  chooseTint(by: string, tint: unknown, seq?: unknown): string | undefined {
    const err = this.check(seq);
    if (err) return err;
    const refused = this.game!.chooseTint(by, tint);
    if (refused) return refused;
    this.afterMove(true);
    return undefined;
  }

  /** Après un semis (ou le choix de sa couleur) : la fin de partie, ou le coup suivant après l'animation. */
  private afterMove(tintOnly: boolean): void {
    const g = this.game!;
    const last = g.last!;
    const anim = FAST ? 20 : tintOnly ? 900 : sowingMs(last.drops.length);
    if (last.tint) this.botReacts(tintOnly);
    if (g.stage === 'over') {
      this.finishAt = Date.now() + anim + FINISH_MS;
      this.turnEndsAt = 0;
      return;
    }
    this.armTurn(anim);
  }

  /** De temps en temps, un bot réagit au coup : envoyé au Diable, sauvé par l'Ange, ou fier d'avoir clos la partie. */
  private botReacts(tintOnly: boolean): void {
    if (FAST) return;
    const m = this.game?.last;
    if (!m || !m.tint) return;
    const scorer = this.get(m.scorer);
    const mover = this.get(m.by);
    const delay = tintOnly ? 500 : sowingMs(m.drops.length) - 600;
    const sent = m.scorer !== m.by;
    if (m.landing === DEVIL && sent && scorer?.isBot && Math.random() < 0.4) {
      setTimeout(() => this.onEmote(scorer.id, pickOne(['😈', 'Traître !', '😱'])), delay);
    } else if (m.landing === ANGEL && sent && scorer?.isBot && Math.random() < 0.35) {
      setTimeout(() => this.onEmote(scorer.id, pickOne(['😇', 'Merci, l’Ange', '🙏'])), delay);
    } else if (m.landing === DEVIL && sent && mover?.isBot && Math.random() < 0.3) {
      setTimeout(() => this.onEmote(mover.id, 'Au Diable !'), Math.max(0, delay - 400));
    } else if (m.ends && mover?.isBot && Math.random() < 0.6) {
      setTimeout(() => this.onEmote(mover.id, '⚖️'), delay);
    }
  }

  private finishGame(): void {
    const g = this.game;
    if (!g) return;
    const rows = g.standings();
    for (const r of rows) if (r.place === 1) this.wins.set(r.id, (this.wins.get(r.id) ?? 0) + 1);
    this.final = {
      rounds: g.round,
      target: g.target,
      closer: g.closer,
      closerTint: g.closerTint,
      closedBy: g.closedBy,
      board: g.board.map((s) => [...s]),
      players: rows.map((r) => {
        const p = this.get(r.id);
        return {
          id: r.id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          seat: g.order.indexOf(r.id) + 1,
          score: [...r.score] as [number, number, number],
          final: r.final,
          place: r.place,
          wins: this.wins.get(r.id) ?? 0,
          winner: r.place === 1,
        };
      }),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries & pilote automatique ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  /** Quand agir pour le joueur dont c'est le tour : bot → délai naturel, absent → fin du délai de grâce, sinon fin du chrono. */
  private dueAt(p: Player | undefined): number {
    const limit = this.turnEndsAt > 0 ? this.turnEndsAt : Infinity;
    if (!p) return Date.now();
    if (p.isBot) return this.botActAt;
    if (this.isAuto(p)) return Math.max(this.turnStartedAt + 1200, p.left ? 0 : p.disconnectedAt + GRACE_MS);
    if (!p.connected) return Math.min(limit, p.disconnectedAt + GRACE_MS);
    return limit;
  }

  private reschedule(): void {
    this.clearTimer();
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const due = g.stage === 'over' ? this.finishAt : this.dueAt(this.get(g.current ?? undefined));
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();
    if (g.stage === 'over') {
      if (now >= this.finishAt) this.finishGame();
      return;
    }
    const id = g.current;
    if (id && now >= this.dueAt(this.get(id))) this.autoPlay(id);
  }

  /** Le bot joue ; le pilote automatique d'un absent (ou d'un joueur à court de temps) fait de même, proprement. */
  autoPlay(id: string): void {
    const g = this.game!;
    const p = this.get(id);
    const skill = (p?.isBot && this.skills.get(id)) || AUTOPILOT;
    if (g.stage === 'place') {
      if (!this.place(id, botPlace(g, id, skill))) return;
      console.error(`[room ${this.code}] pose refusée`);
      this.place(id, g.placeOptions()[0]);
      return;
    }
    if (g.stage === 'color') {
      if (!this.chooseTint(id, botTint(g, id, skill))) return;
      console.error(`[room ${this.code}] couleur refusée`);
      this.chooseTint(id, g.tie?.options[0]);
      return;
    }
    if (g.stage !== 'move') return;
    const plan = botMove(g, id, skill);
    if (this.move(id, plan.from, plan.drops)) {
      // Filet de sécurité : la partie ne doit jamais se bloquer.
      console.error(`[room ${this.code}] semis refusé`, plan);
      const from = g.sources(id)[0];
      this.move(id, from, [...g.board[from]]);
    }
    // Un bot tranche l'égalité dans la foulée : le plateau montre directement la couleur choisie.
    if ((g.stage as string) === 'color' && g.current === id) {
      const tint = plan.tint && g.tie?.options.includes(plan.tint) ? plan.tint : botTint(g, id, skill);
      g.chooseTint(id, tint);
      const last = g.last!;
      if ((g.stage as string) === 'over') this.finishAt = Date.now() + (FAST ? 20 : sowingMs(last.drops.length)) + FINISH_MS;
      else this.armTurn(FAST ? 20 : sowingMs(last.drops.length));
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game): GameView {
    return {
      order: [...g.order],
      stage: g.stage,
      current: g.current,
      round: g.round,
      pieces: g.pieces,
      target: g.target,
      placed: g.placed,
      toPlace: g.toPlace,
      board: g.board.map((s) => [...s]),
      last: g.last ? { ...g.last, drops: g.last.drops.map((d) => ({ ...d })) } : null,
      lastPlace: g.lastPlace ? { ...g.lastPlace } : null,
      tie: g.tie ? { ...g.tie, options: [...g.tie.options] } : null,
      seq: g.seq,
      endsAt: g.stage === 'over' ? 0 : this.turnEndsAt,
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => {
        const seat = g ? g.order.indexOf(p.id) : -1;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isBot: p.isBot,
          isHost: p.id === this.hostId,
          connected: p.isBot || p.connected,
          autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
          status: p.status,
          wins: this.wins.get(p.id) ?? 0,
          seat: seat >= 0 ? seat + 1 : null,
          score: g && seat >= 0 ? ([...g.score(p.id)] as [number, number, number]) : null,
        };
      }),
      game: g ? this.gameView(g) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}

function pickOne<T>(arr: T[]): T {
  return arr[crypto.randomInt(arr.length)];
}
