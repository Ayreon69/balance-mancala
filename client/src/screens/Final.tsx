// Fin de partie : qui a fait déborder une couleur, le classement au score final avec son calcul, les victoires de la soirée et la revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TINTS, type FinalPlayer, type RoomView } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, Coin, Logo, TINT_LABEL, TintGlyph } from '../components/Ui';
import { sfx } from '../lib/sound';
import { listing, placeLabel } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

/** Les trois couleurs en barres, la plus basse et la plus haute marquées : le score final se lit dessus. */
function Balance({ p, target }: { p: FinalPlayer; target: number }) {
  const lo = Math.min(...p.score);
  const hi = Math.max(...p.score);
  return (
    <span className="balance" aria-hidden>
      {TINTS.map((t, i) => (
        <span key={t} className={cls('balance-bar', `is-${t}`, p.score[i] === lo && 'is-lo', p.score[i] === hi && 'is-hi')}>
          <i style={{ height: `calc((100% - 13px) * ${Math.max(0.06, Math.min(1, p.score[i] / target))})` }} />
          <b>{p.score[i]}</b>
        </span>
      ))}
    </span>
  );
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const mine = final.players.find((p) => p.id === view.me);
  const winners = final.players.filter((p) => p.winner);
  const good = !!mine?.winner;
  const once = useRef(false);
  const closer = final.players.find((p) => p.id === final.closer);
  const closedBy = final.players.find((p) => p.id === final.closedBy);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.fanfare(good);
    if (reducedMotion() || !good) return;
    const t = window.setTimeout(() => {
      void confetti({ particleCount: 160, spread: 100, origin: { y: 0.3 }, colors: ['#c8372d', '#2b5fae', '#2f8a4c', '#f2c230', '#1d1813'], shapes: ['circle'], scalar: 0.9, disableForReducedMotion: true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [good]);

  const nameOf = (p: FinalPlayer | undefined) => (!p ? '?' : p.id === view.me ? 'toi' : p.name);
  let title: string;
  if (winners.length > 1) title = winners.some((w) => w.id === view.me) ? 'Victoire partagée !' : `Égalité : ${listing(winners.map((w) => w.name))}`;
  else if (good) title = 'Tu gagnes !';
  else title = `${winners[0]?.name ?? '?'} gagne`;
  let reason = '';
  if (closer && final.closerTint) {
    const own = closer.id === closedBy?.id;
    const whose = closer.id === view.me ? 'Ton' : `Le`;
    const of = closer.id === view.me ? '' : ` de ${closer.name}`;
    reason = `${whose} ${TINT_LABEL[final.closerTint]}${of} atteint ${final.target}${own ? '' : `, poussé par ${nameOf(closedBy)}`} : fin au tour ${final.rounds}.`;
  }

  return (
    <Backdrop quiet>
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className={cls('final-hero', good && 'is-good')} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <span className="eyebrow">{final.closerTint && <TintGlyph tint={final.closerTint} />} Partie terminée</span>
          <h1>{title}</h1>
          <p className="final-reason">{reason}</p>
        </motion.section>

        <section className="panel final-table">
          <h3>Le classement</h3>
          <p className="muted small final-formula">
            Score final = la couleur la plus basse, moins l’écart entre la plus haute et la plus basse.
          </p>
          <ol className="final-list">
            {final.players.map((p, i) => {
              const lo = Math.min(...p.score);
              const hi = Math.max(...p.score);
              return (
                <motion.li
                  key={p.id}
                  className={cls('final-row', p.winner && 'is-winner', p.id === view.me && 'is-me')}
                  initial={{ x: -14, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.07 }}
                >
                  <span className="final-place">{placeLabel(p.place)}</span>
                  <Coin seat={p.seat} size="md" />
                  <span className="final-who">
                    <b>
                      <span className="final-name">
                        <Avatar avatar={p.avatar} /> {p.id === view.me ? 'Toi' : p.name}
                      </span>
                      {p.wins > 0 && (
                        <span className="final-wins" title="Parties gagnées à cette table, ce soir">
                          <Trophy size={12} aria-hidden /> {p.wins}
                        </span>
                      )}
                    </b>
                    <small>
                      {lo} − ({hi} − {lo})
                    </small>
                  </span>
                  <Balance p={p} target={final.target} />
                  <span className={cls('final-score', p.final < 0 && 'is-neg')}>{p.final}</span>
                </motion.li>
              );
            })}
          </ol>
          <p className="muted small">À égalité de score final, la meilleure couleur la plus basse départage. Le trophée compte les parties gagnées à cette table.</p>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
