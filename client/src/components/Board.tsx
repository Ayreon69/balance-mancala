// Le plateau : quatorze coupelles en anneau autour d'un centre, le Diable en haut, l'Ange en bas, le sens du semis marqué sur la piste.
import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useContext, type ReactNode } from 'react';
import { BOARD, SPACES, type SpaceKind, type Tint } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { Coin, TINT_LABEL, TintGlyph } from './Ui';

/** Ligne et colonne de chaque case dans une grille de 5 × 6 : le plateau de l'émission, coins vides. */
export const POS: [number, number][] = [
  [1, 3],
  [1, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [5, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [5, 1],
  [4, 1],
  [3, 1],
  [2, 1],
  [1, 2],
];

/** Les pions qui apparaissent tombent dans leur coupelle ; au premier affichage, ils sont déjà là. */
export const CoinMotion = createContext(false);

export function kindLabel(kind: SpaceKind): string {
  if (kind === 'angel') return "l'Ange";
  if (kind === 'devil') return 'le Diable';
  return TINT_LABEL[kind];
}

export interface Ghost {
  /** Le propriétaire du pion qui tombera là, ou null s'il n'est pas encore choisi. */
  owner: string | null;
  index: number;
  last: boolean;
}

export interface Landing {
  space: number;
  scorer: string;
  points: number;
  tint: Tint | null;
}

interface PlateProps {
  space: number;
  owners: string[];
  seatOf: (id: string) => number;
  nameOf: (id: string) => string;
  onTap?: () => void;
  selected?: boolean;
  lifted?: boolean;
  dim?: boolean;
  ghost?: Ghost | null;
  hit?: boolean;
  landing?: Landing | null;
}

function Bowl({ owners, seatOf, ghost, lifted }: { owners: string[]; seatOf: (id: string) => number; ghost?: Ghost | null; lifted?: boolean }) {
  const appear = useContext(CoinMotion);
  const n = owners.length + (ghost?.owner ? 1 : 0);
  const size = n <= 1 ? 'one' : n <= 4 ? 'four' : n <= 9 ? 'nine' : 'many';
  return (
    <span className={cls('bowl-coins', `is-${size}`, lifted && 'is-lifted')}>
      <AnimatePresence initial={false}>
        {owners.map((o, i) => (
          <motion.span
            key={`${i}`}
            className="bowl-slot"
            initial={appear ? { y: -22, scale: 1.35, opacity: 0 } : false}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -16, scale: 1.2, opacity: 0, transition: { duration: 0.22 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          >
            <Coin seat={seatOf(o)} size="sm" />
          </motion.span>
        ))}
        {ghost?.owner && (
          <motion.span key="ghost" className="bowl-slot" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
            <Coin seat={seatOf(ghost.owner)} size="sm" ghost />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function plateLabel(space: number, owners: string[], nameOf: (id: string) => string): string {
  const kind = BOARD[space];
  const where = kind === 'angel' ? "L'Ange" : kind === 'devil' ? 'Le Diable' : `Coupelle ${TINT_LABEL[kind]}`;
  if (!owners.length) return `${where}, vide`;
  const count = new Map<string, number>();
  for (const o of owners) count.set(o, (count.get(o) ?? 0) + 1);
  const who = [...count].map(([id, c]) => `${c} à ${nameOf(id)}`).join(', ');
  return `${where}, ${owners.length} pion${owners.length > 1 ? 's' : ''} : ${who}`;
}

export function Plate({ space, owners, seatOf, nameOf, onTap, selected, lifted, dim, ghost, hit, landing }: PlateProps) {
  const kind = BOARD[space];
  const [row, col] = POS[space];
  const label = plateLabel(space, owners, nameOf);
  const body = (
    <>
      <span className="bowl">
        <Bowl owners={owners} seatOf={seatOf} ghost={ghost} lifted={lifted} />
      </span>
      <span className="plate-tag" aria-hidden>
        {kind === 'angel' ? 'Ange' : kind === 'devil' ? 'Diable' : <TintGlyph tint={kind} />}
      </span>
      {ghost && (
        <span className={cls('path-badge', ghost.last && 'is-last', ghost.owner && 'is-set')} aria-hidden>
          {ghost.last ? '★' : ghost.index + 1}
        </span>
      )}
      <AnimatePresence>
        {landing && (
          <motion.span
            key={`${landing.space}-${landing.tint ?? 'q'}`}
            className={cls('gain', landing.tint && `is-${landing.tint}`)}
            initial={{ y: 10, scale: 0.4, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 18 }}
            aria-hidden
          >
            <Coin seat={seatOf(landing.scorer)} size="xs" />+{landing.points}
            {landing.tint && <TintGlyph tint={landing.tint} />}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );
  const className = cls('plate', `is-${kind}`, onTap && 'is-tappable', selected && 'is-selected', dim && 'is-dim', hit && 'is-hit', landing && 'is-landing', ghost?.last && 'is-target');
  const style = { gridRow: row, gridColumn: col };
  if (onTap)
    return (
      <button type="button" className={className} style={style} onClick={onTap} aria-label={label} aria-pressed={selected}>
        {body}
      </button>
    );
  return (
    <div className={className} style={style} role="img" aria-label={label}>
      {body}
    </div>
  );
}

/** La piste qui relie les coupelles, avec une flèche par segment : le sens des aiguilles d'une montre. */
function Track() {
  const pts = POS.map(([r, c]) => [(c - 0.5) * 100, (r - 0.5) * 100] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + ' Z';
  return (
    <svg className="track" viewBox="0 0 500 600" aria-hidden>
      <path d={d} className="track-line" />
      {pts.map(([x, y], i) => {
        const [nx, ny] = pts[(i + 1) % SPACES];
        const a = (Math.atan2(ny - y, nx - x) * 180) / Math.PI;
        return <path key={i} className="track-arrow" d="M-7 -6 L3 0 L-7 6" transform={`translate(${(x + nx) / 2} ${(y + ny) / 2}) rotate(${a})`} />;
      })}
    </svg>
  );
}

export function BoardFrame({ children, center, className }: { children: ReactNode; center: ReactNode; className?: string }) {
  return (
    <div className={cls('board', className)}>
      <Track />
      {children}
      <div className="board-center">{center}</div>
    </div>
  );
}
