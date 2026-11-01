// Accueil : une poignée de pions semée en démonstration ; pseudo + avatar, créer / rejoindre une table, jouer contre des bots, règles.
import { motion } from 'framer-motion';
import { BookOpen, Bot, House, LogIn, MessageSquare, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, Backdrop, Button, Coin, Logo, TintGlyph } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const BOTS_KEY = 'bm.bots';
const MAX_BOTS = MAX_PLAYERS - 1;
const MIN_BOTS = MIN_PLAYERS - 1;

function savedBots(): number {
  try {
    const n = Number(localStorage.getItem(BOTS_KEY));
    return n >= MIN_BOTS && n <= MAX_BOTS ? n : 4;
  } catch {
    return 4;
  }
}

/** Une poignée de trois pions se sème : le dernier tombe dans la coupelle verte, où deux pions attendent, et marque 3. */
const HERO_BOWLS: { kind: 'red' | 'blue' | 'green' | 'angel'; start: number[] }[] = [
  { kind: 'red', start: [] },
  { kind: 'blue', start: [4] },
  { kind: 'green', start: [3, 5] },
  { kind: 'angel', start: [] },
];
const HERO_HAND = [4, 1, 2];

function HeroSow() {
  const [step, setStep] = useState(reducedMotion() ? 5 : 0);
  useEffect(() => {
    if (step >= 5) return;
    const t = window.setTimeout(() => setStep((n) => n + 1), step === 0 ? 1100 : step === 4 ? 500 : 520);
    return () => window.clearTimeout(t);
  }, [step]);
  // Étape 1 : la poignée quitte la coupelle rouge ; étapes 2 à 4 : un pion par coupelle ; étape 5 : le gain.
  const dropped = Math.max(0, Math.min(3, step - 1));
  return (
    <div className={cls('hero-sow', step >= 5 && 'is-done')} aria-hidden>
      <div className="hero-hand">
        {HERO_HAND.slice(dropped).map((s, i) => (
          <motion.span key={s} layout initial={{ y: 26, opacity: 0 }} animate={{ y: step >= 1 ? 0 : 26, opacity: step >= 1 ? 1 : 0 }} transition={{ delay: i * 0.05 }}>
            <Coin seat={s} size="md" />
          </motion.span>
        ))}
      </div>
      <div className="hero-bowls">
        {HERO_BOWLS.map((b, i) => {
          const coins = i === 0 ? (step >= 1 ? [] : HERO_HAND) : [...b.start, ...(dropped >= i ? [HERO_HAND[i - 1]] : [])];
          return (
            <span key={b.kind} className={cls('plate', 'hero-plate', `is-${b.kind === 'angel' ? 'angel' : b.kind}`, step >= 5 && i === 3 && 'is-landing')}>
              <span className="bowl">
                <span className={cls('bowl-coins', coins.length <= 1 ? 'is-one' : 'is-four')}>
                  {coins.map((s, k) => (
                    <motion.span key={`${s}-${k}`} className="bowl-slot" initial={{ y: -22, scale: 1.3, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }}>
                      <Coin seat={s} size="sm" />
                    </motion.span>
                  ))}
                </span>
              </span>
              <span className="plate-tag">{b.kind === 'angel' ? 'Ange' : <TintGlyph tint={b.kind} />}</span>
              {step >= 5 && i === 3 && (
                <motion.span className="gain is-green" initial={{ y: 10, scale: 0.4, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 460, damping: 16 }}>
                  <Coin seat={2} size="xs" />+3
                  <TintGlyph tint="green" />
                </motion.span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(savedBots);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('bm:url', sync);
    return () => window.removeEventListener('bm:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const changeBots = (d: number) => {
    const n = Math.max(MIN_BOTS, Math.min(MAX_BOTS, bots + d));
    setBots(n);
    try {
      localStorage.setItem(BOTS_KEY, String(n));
    } catch {
      /* stockage indisponible */
    }
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Backdrop className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=balance-mancala">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          Sème les pions de tout le monde : <b>le dernier pion fait marquer son propriétaire</b>. À la fin, seule ta couleur la plus faible compte.
        </p>
        <HeroSow />
      </header>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et entre !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Tempérance"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="bots-row">
              <Button className="bots-go" icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots, autostart: true }))}>
                {busy === 'bots' ? 'Préparation…' : `Jouer contre ${bots} bots`}
              </Button>
              <div className="stepper" role="group" aria-label="Nombre de bots">
                <button type="button" className="icon-btn" aria-label="Un bot de moins" disabled={bots <= MIN_BOTS} onClick={() => changeBots(-1)}>
                  <Minus size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Un bot de plus" disabled={bots >= MAX_BOTS} onClick={() => changeBots(1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 2 minutes
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après l'épreuve <i>Balance Mancala</i> de <i>The Devil's Plan : Death Room</i> (Netflix). Création de fans, non officielle.
      </footer>
    </Backdrop>
  );
}
