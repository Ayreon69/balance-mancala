// Les règles, lisibles en deux minutes et consultables à tout moment.
import { Flag, Hand, RotateCw, Scale, Sparkles } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS, piecesFor } from '../../../shared/protocol';
import { useStore } from '../store';
import { Coin, Modal, TintGlyph } from './Ui';

/** Un petit exemple : une poignée de trois pions, semée dans trois coupelles. */
function Example() {
  return (
    <div className="rule-example" aria-label="Exemple : le joueur 1 sème 1, 2, 1 ; son dernier pion tombe chez l’Ange, où attendent deux pions : 3 points dans sa couleur la plus faible">
      <div className="rule-row" aria-hidden>
        <span className="plate is-red rule-plate">
          <span className="bowl">
            <span className="bowl-coins is-one" />
          </span>
          <span className="plate-tag">
            <TintGlyph tint="red" />
          </span>
        </span>
        <span className="rule-arrow">→</span>
        <span className="plate is-blue rule-plate">
          <span className="bowl">
            <span className="bowl-coins is-one">
              <span className="bowl-slot">
                <Coin seat={1} size="sm" />
              </span>
            </span>
          </span>
          <span className="plate-tag">
            <TintGlyph tint="blue" />
          </span>
        </span>
        <span className="plate is-green rule-plate">
          <span className="bowl">
            <span className="bowl-coins is-four">
              <span className="bowl-slot">
                <Coin seat={3} size="sm" />
              </span>
              <span className="bowl-slot">
                <Coin seat={4} size="sm" />
              </span>
              <span className="bowl-slot">
                <Coin seat={2} size="sm" />
              </span>
            </span>
          </span>
          <span className="plate-tag">
            <TintGlyph tint="green" />
          </span>
        </span>
        <span className="plate is-angel rule-plate is-landing">
          <span className="bowl">
            <span className="bowl-coins is-four">
              <span className="bowl-slot">
                <Coin seat={5} size="sm" />
              </span>
              <span className="bowl-slot">
                <Coin seat={5} size="sm" />
              </span>
              <span className="bowl-slot">
                <Coin seat={1} size="sm" />
              </span>
            </span>
          </span>
          <span className="plate-tag">Ange</span>
        </span>
      </div>
      <p>
        Le joueur 1 sème la coupelle rouge : le pion 1, puis le 2, puis encore le 1. Le dernier tombe chez l'Ange, où 2 pions attendent. Il marque <b>3 points</b>, dans sa couleur la plus faible.
      </p>
    </div>
  );
}

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <p>
            Quatorze coupelles en anneau : <b>rouges, bleues, vertes</b>, l'<b>Ange</b> en bas et le <b>Diable</b> en haut. On sème les pions de tout le monde, et <b>le dernier pion posé fait marquer son propriétaire</b>. Le but : monter ses trois couleurs <b>ensemble</b>.
          </p>
        </section>

        <section>
          <h3>
            <Hand size={18} aria-hidden /> La mise en place
          </h3>
          <p>
            Chacun son tour, on pose un pion où l'on veut, <b>deux pions au plus par coupelle</b>, jusqu'à avoir tout posé.
          </p>
          <p className="rule-counts">
            {counts.map((n) => (
              <span key={n}>
                {n} joueurs : <b>{piecesFor(n)}</b>
              </span>
            ))}
          </p>
        </section>

        <section>
          <h3>
            <RotateCw size={18} aria-hidden /> Ton tour
          </h3>
          <ol className="rule-steps">
            <li>
              Choisis une coupelle où tu as <b>au moins un pion</b>, et prends <b>tous</b> ses pions, ceux des autres compris.
            </li>
            <li>
              Pose-les <b>un par un</b> dans les coupelles suivantes, dans le sens des aiguilles d'une montre, <b>dans l'ordre que tu veux</b>.
            </li>
            <li>
              Le propriétaire du <b>dernier pion</b> marque autant de points qu'il y a de pions dans sa coupelle, le sien compris, <b>dans la couleur de la coupelle</b>.
            </li>
          </ol>
          <Example />
        </section>

        <section className="rule-split">
          <div className="rule-case is-angel">
            <h3>
              <Sparkles size={18} aria-hidden /> L'Ange
            </h3>
            <p>
              Le dernier pion marque dans <b>sa couleur la plus basse</b> : un cadeau, pour rééquilibrer.
            </p>
          </div>
          <div className="rule-case is-devil">
            <h3>
              <Flag size={18} aria-hidden /> Le Diable
            </h3>
            <p>
              Le dernier pion marque dans <b>sa couleur la plus haute</b> : un piège, qui creuse l'écart.
            </p>
          </div>
        </section>
        <p className="rule-tie">En cas d'égalité entre deux couleurs, c'est celui qui a semé qui choisit.</p>

        <section className="rule-warn">
          <h3>
            <Scale size={18} aria-hidden /> La fin
          </h3>
          <p>
            La partie s'arrête <b>dès qu'une couleur de quelqu'un atteint 20</b> (ou 30, au choix de l'hôte). Chacun calcule alors son score final : <b>sa couleur la plus basse, moins l'écart entre sa plus haute et sa plus basse</b>.
          </p>
          <p className="rule-formula">
            <TintGlyph tint="red" /> 13 · <TintGlyph tint="blue" /> 11 · <TintGlyph tint="green" /> 20 → 11 − (20 − 11) = <b>2</b>
          </p>
          <p>Le meilleur score final gagne. Une couleur trop haute coûte cher : celui qui fait déborder une couleur met fin à la partie, et pas toujours à son avantage.</p>
        </section>

        <section className="rule-memory">
          <h3>Dans cette version</h3>
          <ul>
            <li>Les scores de chacun sont affichés, comme dans l'émission. Le score final, lui, se calcule de tête.</li>
            <li>Rien ne prévoit le résultat d'un coup : à toi de compter les pions et les coupelles.</li>
            <li>Un joueur absent plus de 20 secondes est remplacé par le pilote automatique jusqu'à son retour.</li>
          </ul>
        </section>

        <p className="rule-foot">
          D'après <i>Balance Mancala</i>, épreuve principale du 5e jour de <i>The Devil's Plan : Death Room</i> (Netflix). Création de fans, non officielle, avec ses propres visuels.
        </p>
      </div>
    </Modal>
  );
}
