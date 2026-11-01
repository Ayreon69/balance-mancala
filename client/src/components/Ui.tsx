// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, logo, avatars, pions et papier du tarot.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TINTS, type Tint } from '../../../shared/protocol';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le titre, comme une lame de tarot : le numéro de Tempérance, le nom, et le cartouche. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Balance Mancala">
      <span className="logo-num" aria-hidden>
        XIIII
      </span>
      <span className="logo-word" aria-hidden>
        Balance
      </span>
      <span className="logo-cartouche" aria-hidden>
        Mancala
      </span>
    </div>
  );
}

/** Le décor : un papier ancien, son grain et, sur l'accueil, les coins gravés d'une lame de tarot. */
export function Backdrop({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <div className={cls('backdrop', quiet && 'is-quiet', className)}>
      <div className="paper" aria-hidden>
        {!quiet && (
          <>
            <span className="corner is-tl" />
            <span className="corner is-tr" />
            <span className="corner is-bl" />
            <span className="corner is-br" />
          </>
        )}
      </div>
      <div className="backdrop-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'gold' | 'ink' | 'soft' | 'red'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent.
 * Elle s'ouvre avec un petit mouvement en CSS et se ferme d'un coup.
 */
export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-body button, .modal-body input')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  soleil: '☀️',
  lune: '🌙',
  etoile: '⭐',
  couronne: '👑',
  epee: '🗡️',
  coupe: '🍷',
  baton: '🪄',
  denier: '🪙',
  roue: '🎡',
  lion: '🦁',
  aigle: '🦅',
  colombe: '🕊️',
};

export const AVATAR_LABELS: Record<string, string> = {
  soleil: 'Soleil',
  lune: 'Lune',
  etoile: 'Étoile',
  couronne: 'Couronne',
  epee: 'Épée',
  coupe: 'Coupe',
  baton: 'Bâton',
  denier: 'Denier',
  roue: 'Roue',
  lion: 'Lion',
  aigle: 'Aigle',
  colombe: 'Colombe',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '☀️'}
    </span>
  );
}

/** La couleur des pions de chaque place, de 1 à 8 : claires, pour trancher sur le rouge, le bleu, le vert, l'Ange et le Diable. */
export const SEAT_COLORS = ['#f2c230', '#f6efe0', '#f4a3b4', '#94cfe4', '#c6a3e3', '#f59a4c', '#b8d66a', '#d6b48a'];

export function seatColor(seat: number | null | undefined): string {
  return SEAT_COLORS[((seat ?? 1) - 1) % SEAT_COLORS.length];
}

/** Un pion : un denier à la couleur de sa place, frappé de son numéro de jeu. */
export function Coin({ seat, size = 'md', className, ghost, style, label }: { seat: number | null; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string; ghost?: boolean; style?: CSSProperties; label?: string }) {
  return (
    <span className={cls('coin', `coin-${size}`, ghost && 'is-ghost', className)} style={{ ['--c' as string]: seatColor(seat), ...style }} aria-label={label} aria-hidden={label ? undefined : true}>
      {seat ?? '?'}
    </span>
  );
}

export const TINT_LABEL: Record<Tint, string> = { red: 'rouge', blue: 'bleu', green: 'vert' };

/** Une forme par couleur, pour la lire sans voir les couleurs : triangle rouge, carré bleu, losange vert. */
export function TintGlyph({ tint, className }: { tint: Tint; className?: string }) {
  return (
    <svg className={cls('glyph', `glyph-${tint}`, className)} viewBox="0 0 10 10" aria-hidden>
      {tint === 'red' && <path d="M5 1 9.2 8.6H.8z" />}
      {tint === 'blue' && <rect x="1.4" y="1.4" width="7.2" height="7.2" />}
      {tint === 'green' && <path d="M5 .6 9.4 5 5 9.4.6 5z" />}
    </svg>
  );
}

/** Les trois scores d'un joueur, rouge, bleu, vert. */
export function Scores({ score, className, bump }: { score: readonly number[] | null; className?: string; bump?: Tint | null }) {
  const s = score ?? [0, 0, 0];
  return (
    <span className={cls('scores', className)} aria-label={`Rouge ${s[0]}, bleu ${s[1]}, vert ${s[2]}`}>
      {TINTS.map((t, i) => (
        <span key={t} className={cls('score', `is-${t}`, bump === t && 'is-bump')}>
          <TintGlyph tint={t} />
          <b>{s[i]}</b>
        </span>
      ))}
    </span>
  );
}
