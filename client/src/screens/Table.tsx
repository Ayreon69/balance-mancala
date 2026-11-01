// La table : les joueurs et leurs trois couleurs, puis le plateau en anneau ; au centre, la consigne du moment et la poignée à semer.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, Flag, LogOut, MoreHorizontal, Smile, Undo2, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ANGEL, DEVIL, DROP_MS, EMOTES, PLACE_CAP, SCORE_MS, SPACES, TAUNTS, TINTS, type GameView, type MoveView, type PlayerView, type RoomView, type Tint } from '../../../shared/protocol';
import { BoardFrame, CoinMotion, Plate, type Ghost, type Landing } from '../components/Board';
import { Avatar, Button, Coin, Logo, Modal, Scores, TINT_LABEL, TintGlyph } from '../components/Ui';
import { sfx } from '../lib/sound';
import { capital, moveText, nameOf } from '../lib/text';
import { cls, reducedMotion, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore, type Emote } from '../store';

const CONFETTI = ['#c8372d', '#2b5fae', '#2f8a4c', '#f2c230', '#1d1813'];

function burst(el: Element | null, count = 70): void {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  void confetti({
    particleCount: count,
    spread: 70,
    startVelocity: 28,
    origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
    colors: CONFETTI,
    shapes: ['circle'],
    scalar: 0.8,
    disableForReducedMotion: true,
  });
}

// ───────────────────────────── Le semis animé ─────────────────────────────

interface Anim {
  id: number;
  /** Pions déjà tombés. */
  step: number;
  phase: 'drop' | 'score';
}

interface Sowing {
  board: string[][];
  hit: number | null;
  landing: Landing | null;
  /** Les pions tombent encore : on ne peut pas jouer. */
  busy: boolean;
  /** Le gain du dernier coup, à retirer des scores affichés tant que le pion n'est pas tombé. */
  hidden: { scorer: string; tint: Tint; points: number } | null;
  anim: Anim | null;
}

/** Le plateau d'avant le coup, moins la coupelle semée : on y remet les pions un à un. */
function withoutDrops(board: string[][], m: MoveView): string[][] {
  const b = board.map((s) => [...s]);
  for (let i = m.drops.length - 1; i >= 0; i--) {
    const d = m.drops[i];
    const at = b[d.space].lastIndexOf(d.owner);
    if (at >= 0) b[d.space].splice(at, 1);
  }
  b[m.from] = [];
  return b;
}

function useSowing(g: GameView): Sowing {
  const m = g.last;
  const [anim, setAnim] = useState<Anim | null>(null);
  const seen = useRef<{ id: number; tint: Tint | null } | null>(m ? { id: m.id, tint: m.tint } : null);

  // Un nouveau coup se rejoue pion par pion ; une couleur choisie après coup relance seulement le gain.
  useLayoutEffect(() => {
    if (!m) return;
    const prev = seen.current;
    seen.current = { id: m.id, tint: m.tint };
    if (prev?.id === m.id) {
      if (!prev.tint && m.tint) setAnim({ id: m.id, step: m.drops.length, phase: 'score' });
      return;
    }
    if (reducedMotion()) setAnim({ id: m.id, step: m.drops.length, phase: 'score' });
    else setAnim({ id: m.id, step: 0, phase: 'drop' });
  }, [m?.id, m?.tint]);

  useEffect(() => {
    if (!anim || !m || anim.id !== m.id) return;
    if (anim.phase === 'drop') {
      const done = anim.step >= m.drops.length;
      const t = window.setTimeout(() => setAnim((a) => a && (done ? { ...a, phase: 'score' } : { ...a, step: a.step + 1 })), done ? 140 : DROP_MS);
      return () => window.clearTimeout(t);
    }
    if (!m.tint) return;
    const t = window.setTimeout(() => setAnim(null), SCORE_MS);
    return () => window.clearTimeout(t);
  }, [anim, m]);

  const live = !!anim && !!m && anim.id === m.id;
  let board = g.board;
  if (live && anim.phase === 'drop') {
    board = withoutDrops(g.board, m);
    for (let i = 0; i < anim.step; i++) board[m.drops[i].space].push(m.drops[i].owner);
  }
  const scoring = live && anim.phase === 'score';
  const tiePending = g.stage === 'color' && !!g.tie && !!m;
  return {
    board,
    hit: live && anim.phase === 'drop' && anim.step > 0 ? m.drops[anim.step - 1].space : null,
    landing: (scoring || tiePending) && m ? { space: m.landing, scorer: m.scorer, points: m.points, tint: m.tint } : null,
    busy: live && anim.phase === 'drop',
    hidden: live && anim.phase === 'drop' && m.tint ? { scorer: m.scorer, tint: m.tint, points: m.points } : null,
    anim: live ? anim : null,
  };
}

/** Sons, vibrations et confettis : tout se déduit de l'animation et de l'état reçu. */
function useTableEffects(view: RoomView, sow: Sowing, myTurn: boolean) {
  const g = view.game!;
  const m = g.last;
  const step = sow.anim ? `${sow.anim.id}:${sow.anim.phase}:${sow.anim.step}` : '';
  const placed = g.lastPlace?.id ?? 0;
  const started = useRef(false);
  const lastPlace = useRef(placed);
  const turnSeen = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      if (g.stage === 'place' && g.placed === 0) sfx.start();
    }
  }, [g.stage, g.placed]);

  useEffect(() => {
    if (placed > lastPlace.current) sfx.place();
    lastPlace.current = placed;
  }, [placed]);

  useEffect(() => {
    const a = sow.anim;
    if (!a || !m) return;
    if (a.phase === 'drop') {
      if (a.step === 0) sfx.scoop();
      else sfx.drop(a.step - 1);
      return;
    }
    if (!m.tint) return;
    const mine = m.scorer === view.me;
    if (m.landing === DEVIL) sfx.devil();
    else if (m.landing === ANGEL) sfx.angel();
    else sfx.score(m.tint, mine);
    if (mine) {
      vibrate(m.landing === DEVIL ? [80, 50, 160] : [20, 30, 40]);
      if (m.landing === ANGEL) window.setTimeout(() => burst(document.querySelector('.plate.is-landing'), 40), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const ready = myTurn && !sow.busy;
    if (ready && !turnSeen.current) {
      window.setTimeout(() => sfx.turn(), 80);
      vibrate(25);
    }
    turnSeen.current = ready;
  }, [myTurn, sow.busy]);
}

// ───────────────────────────── Morceaux de la table ─────────────────────────────

function TurnTimer({ endsAt, think }: { endsAt: number; think: number }) {
  const now = useTick(250);
  if (!endsAt) return null;
  const span = Math.max(1500, think * 1000);
  const left = Math.max(0, endsAt - now);
  const shown = Math.min(span, left);
  return (
    <span className={cls('turn-timer', left < 8000 && 'is-low')} role="timer" aria-label={`${Math.ceil(left / 1000)} secondes`}>
      <span style={{ width: `${(shown / span) * 100}%` }} />
    </span>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function Bubbles({ emotes }: { emotes: Emote[] }) {
  return (
    <AnimatePresence>
      {emotes.slice(-1).map((e) => (
        <motion.span key={e.id} className={cls('bubble', e.emoji.length > 3 && 'is-text')} initial={{ scale: 0.4, y: 6, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ opacity: 0, y: -6 }}>
          {e.emoji}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

/** Un joueur : son pion, son nom, ses trois couleurs. Celui qui joue est mis en avant. */
function PlayerChip({ view, p, emotes, hidden, bump }: { view: RoomView; p: PlayerView; emotes: Emote[]; hidden: Sowing['hidden']; bump: Tint | null }) {
  const g = view.game!;
  const now = g.current === p.id;
  const me = p.id === view.me;
  let score = p.score;
  if (score && hidden?.scorer === p.id) {
    score = [...score] as [number, number, number];
    score[TINTS.indexOf(hidden.tint)] -= hidden.points;
  }
  return (
    <li className={cls('pchip', now && 'is-now', me && 'is-me', !p.connected && 'is-off')}>
      <span className="pchip-coin">
        <Coin seat={p.seat} size="md" />
      </span>
      <Bubbles emotes={emotes} />
      <span className="pchip-name">
        <Avatar avatar={p.avatar} className="pchip-avatar" />
        <b>{me ? 'Toi' : p.name}</b>
        {p.autopilot ? <Bot size={13} className="pchip-state" aria-label="Pilote automatique" /> : !p.connected ? <WifiOff size={13} className="pchip-state" aria-label="Absent" /> : null}
      </span>
      <Scores score={score} className="pchip-scores" bump={bump} />
    </li>
  );
}

function Players({ view, emotes, sow }: { view: RoomView; emotes: Emote[]; sow: Sowing }) {
  const g = view.game!;
  const players = g.order.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p);
  const m = g.last;
  const bumpFor = (id: string): Tint | null => (sow.anim?.phase === 'score' && m && m.tint && m.scorer === id ? m.tint : null);
  return (
    <ol className={cls('players', `has-${players.length}`)} aria-label="Les joueurs, dans l'ordre du jeu">
      {players.map((p) => (
        <PlayerChip key={p.id} view={view} p={p} emotes={emotes.filter((e) => e.playerId === p.id)} hidden={sow.hidden} bump={bumpFor(p.id)} />
      ))}
    </ol>
  );
}

/** Le tampon d'un grand moment : le Diable, l'Ange, ou la fin de partie. */
function Stamp({ m, view }: { m: MoveView; view: RoomView }) {
  if (!m.tint) return null;
  const devil = m.landing === DEVIL;
  const angel = m.landing === ANGEL;
  if (!devil && !angel && !m.ends) return null;
  const who = nameOf(view, m.scorer);
  const title = m.ends ? 'Fin de partie' : devil ? 'Le Diable' : "L'Ange";
  const sub = m.ends
    ? `Le ${TINT_LABEL[m.tint]} de ${who} atteint ${view.game!.target}`
    : devil
      ? `+${m.points} dans ${m.scorer === view.me ? 'ta' : 'sa'} meilleure couleur`
      : `+${m.points} dans ${m.scorer === view.me ? 'ta' : 'sa'} couleur la plus faible`;
  return (
    <motion.div
      className={cls('stamp', devil && 'is-devil', angel && 'is-angel', m.ends && 'is-end')}
      initial={{ scale: 2, rotate: -14, opacity: 0 }}
      animate={{ scale: 1, rotate: -6, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 17 }}
    >
      <b>{title}</b>
      <small>{sub}</small>
    </motion.div>
  );
}

// ───────────────────────────── L'écran ─────────────────────────────

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const emotes = useStore((s) => s.emotes);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  const [sending, setSending] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const appear = useRef(false);
  const g = view.game!;
  const sow = useSowing(g);
  const me = view.players.find((p) => p.id === view.me);
  const seated = g.order.includes(view.me);
  const isHost = view.hostId === view.me;
  const myTurn = seated && g.current === view.me && g.stage !== 'over';
  const canAct = myTurn && !sow.busy && !sending;
  useTableEffects(view, sow, myTurn);

  useEffect(() => {
    appear.current = true;
  }, []);

  // La sélection repart de zéro à chaque nouvel état du plateau.
  useEffect(() => {
    setSel(null);
    setOrder([]);
  }, [g.seq]);

  const seatOf = (id: string) => view.players.find((p) => p.id === id)?.seat ?? 1;
  const nameFor = (id: string) => nameOf(view, id);

  const act = async (event: string, payload: Record<string, unknown>) => {
    setSending(true);
    await send(event, { ...payload, seq: g.seq });
    setSending(false);
  };

  const hand = sel !== null ? g.board[sel] : [];
  const remaining = [...hand];
  for (const o of order) remaining.splice(remaining.indexOf(o), 1);
  remaining.sort((a, b) => seatOf(a) - seatOf(b));
  const complete = sel !== null && order.length === hand.length;

  const choose = (space: number) => {
    if (sel === space) {
      setSel(null);
      setOrder([]);
      return;
    }
    sfx.tap();
    vibrate(10);
    const owners = g.board[space];
    setSel(space);
    // Une poignée d'un seul propriétaire n'a qu'un ordre possible.
    setOrder(new Set(owners).size === 1 ? [...owners] : []);
  };
  const pickCoin = (owner: string) => {
    sfx.tap();
    setOrder((o) => [...o, owner]);
  };
  const sowNow = () => {
    if (sel === null || !complete) return;
    vibrate(15);
    void act('game:move', { from: sel, drops: order });
  };

  // Les cases jouables, et le chemin du semis en préparation.
  const tappable = (i: number): boolean => {
    if (!canAct) return false;
    if (g.stage === 'place') return g.board[i].length < PLACE_CAP;
    if (g.stage === 'move') return g.board[i].includes(view.me);
    return false;
  };
  const ghosts = new Map<number, Ghost>();
  if (sel !== null) for (let i = 0; i < hand.length; i++) ghosts.set((sel + 1 + i) % SPACES, { owner: order[i] ?? null, index: i, last: i === hand.length - 1 });
  const choosing = canAct && (g.stage === 'place' || g.stage === 'move');

  let center: ReactNode;
  const current = view.players.find((p) => p.id === g.current);
  const lastLine = g.last && g.last.tint && !sow.anim ? moveText(view, g.last) : null;
  if (g.stage === 'over') {
    center = (
      <div className="center-msg">
        <AnimatePresence>{g.last && sow.anim?.phase !== 'drop' && <Stamp m={g.last} view={view} />}</AnimatePresence>
      </div>
    );
  } else if (sow.anim?.phase === 'score' && g.last?.tint && (g.last.landing === DEVIL || g.last.landing === ANGEL)) {
    center = (
      <div className="center-msg">
        <Stamp m={g.last} view={view} />
      </div>
    );
  } else if (myTurn && g.stage === 'color' && g.tie) {
    const t = g.tie;
    const scorer = view.players.find((p) => p.id === t.scorer);
    center = (
      <div className="center-msg is-mine">
        <span className="center-kicker">{t.where === 'devil' ? 'Égalité chez le Diable' : "Égalité chez l'Ange"}</span>
        <p className="center-title">
          {t.scorer === view.me ? 'Où marques-tu' : `Où ${scorer?.name ?? '?'} marque`} <b>+{t.points}</b> ?
        </p>
        <div className="tint-choice">
          {t.options.map((o) => (
            <button key={o} type="button" className={cls('tint-btn', `is-${o}`)} disabled={!canAct} onClick={() => void act('game:tint', { tint: o })}>
              <TintGlyph tint={o} />
              {capital(TINT_LABEL[o])}
            </button>
          ))}
        </div>
        <TurnTimer endsAt={g.endsAt} think={view.settings.think} />
      </div>
    );
  } else if (myTurn && g.stage === 'place') {
    const left = g.pieces - g.board.flat().filter((o) => o === view.me).length;
    center = (
      <div className="center-msg is-mine">
        <span className="center-kicker">Mise en place</span>
        <p className="center-title">Pose un pion</p>
        <p className="center-sub">Touche une coupelle qui a moins de 2 pions.</p>
        <span className="center-stock" aria-label={`Encore ${left} pions à poser`}>
          {Array.from({ length: left }, (_, i) => (
            <Coin key={i} seat={me?.seat ?? 1} size="sm" />
          ))}
        </span>
        <TurnTimer endsAt={g.endsAt} think={view.settings.think} />
      </div>
    );
  } else if (myTurn && g.stage === 'move' && sel !== null) {
    center = (
      <div className="center-msg is-mine is-hand">
        <span className="center-kicker">Ta poignée</span>
        <p className="center-sub">{complete ? 'Le dernier pion, à l’étoile, fait marquer son propriétaire.' : order.length ? 'Le suivant ?' : 'Touche les pions dans l’ordre où ils tombent.'}</p>
        <div className="hand" aria-label="Les pions à semer">
          <AnimatePresence initial={false}>
            {remaining.map((o, i) => (
              <motion.button
                key={`${o}-${i}-${remaining.length}`}
                type="button"
                className="hand-coin"
                onClick={() => pickCoin(o)}
                disabled={!canAct}
                aria-label={`Poser le pion de ${nameFor(o)}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.15 } }}
              >
                <Coin seat={seatOf(o)} size="lg" />
              </motion.button>
            ))}
          </AnimatePresence>
          {complete && <span className="hand-done">Prête à semer</span>}
        </div>
        <div className="hand-actions">
          {order.length > 0 && new Set(hand).size > 1 && (
            <button type="button" className="icon-btn" aria-label="Reprendre le dernier pion" onClick={() => setOrder((o) => o.slice(0, -1))}>
              <Undo2 size={18} />
            </button>
          )}
          <Button variant="primary" className="sow-btn" disabled={!complete || !canAct} onClick={sowNow}>
            Semer
          </Button>
        </div>
        <TurnTimer endsAt={g.endsAt} think={view.settings.think} />
      </div>
    );
  } else if (myTurn && g.stage === 'move') {
    center = (
      <div className="center-msg is-mine">
        <span className="center-kicker">{sow.busy ? 'Ça tombe…' : 'À toi'}</span>
        <p className="center-title">Sème une coupelle</p>
        <p className="center-sub">Touche une coupelle où tu as un pion.</p>
        {lastLine && <p className="center-last">{lastLine}</p>}
        <TurnTimer endsAt={g.endsAt} think={view.settings.think} />
      </div>
    );
  } else {
    const verb = g.stage === 'place' ? 'pose un pion' : g.stage === 'color' ? 'choisit la couleur' : 'sème';
    center = (
      <div className="center-msg">
        {g.stage === 'place' && <span className="center-kicker">Mise en place</span>}
        {g.stage !== 'place' && <span className="center-kicker">Tour {g.round}</span>}
        <p className="center-title is-other">
          {current && <Coin seat={current.seat} size="sm" />}
          <span>
            <b>{current?.name ?? '?'}</b> {verb}
            <i className="dots" aria-hidden />
          </span>
        </p>
        {g.stage === 'color' && g.tie && (
          <p className="center-sub">
            Égalité {g.tie.where === 'devil' ? 'chez le Diable' : "chez l'Ange"} : +{g.tie.points} pour {nameFor(g.tie.scorer)}.
          </p>
        )}
        {lastLine && g.stage !== 'color' && <p className="center-last">{lastLine}</p>}
        {!seated && <p className="center-sub">Tu regardes la partie : tu joueras à la prochaine.</p>}
        <TurnTimer endsAt={g.endsAt} think={view.settings.think} />
      </div>
    );
  }

  return (
    <div className={cls('table-screen', myTurn && !sow.busy && 'is-my-turn', `stage-${g.stage}`)}>
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        <span className="round-chip">
          {g.stage === 'place' ? (
            <>
              <small>Pose</small>
              <b>
                {Math.min(g.placed + 1, g.toPlace)}
                <i>/{g.toPlace}</i>
              </b>
            </>
          ) : (
            <>
              <small>Tour</small>
              <b>{g.round}</b>
            </>
          )}
        </span>
        <span className="target-chip" title="La partie s'arrête dès qu'une couleur atteint ce score">
          <small>Fin à</small>
          <b>{g.target}</b>
        </span>
        <div className="table-tools">
          <button type="button" className={cls('icon-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      <div className="table-body">
        <Players view={view} emotes={emotes} sow={sow} />

        <CoinMotion.Provider value={appear.current}>
          <BoardFrame center={center} className={cls(choosing && 'is-choosing', sel !== null && 'has-sel')}>
            {sow.board.map((owners, i) => (
              <Plate
                key={i}
                space={i}
                owners={owners}
                seatOf={seatOf}
                nameOf={nameFor}
                onTap={tappable(i) ? () => (g.stage === 'place' ? void act('game:place', { space: i }) : choose(i)) : undefined}
                selected={sel === i}
                lifted={sel === i}
                dim={choosing && !tappable(i) && !ghosts.has(i)}
                ghost={ghosts.get(i) ?? null}
                hit={sow.hit === i}
                landing={sel === null && sow.landing?.space === i ? sow.landing : null}
              />
            ))}
          </BoardFrame>
        </CoinMotion.Provider>
      </div>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
