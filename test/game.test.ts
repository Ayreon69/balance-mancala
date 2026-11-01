// Tests du moteur : plateau, pose, semis, points de couleur, Ange et Diable, égalités, fin de partie, classement et parties complètes.
import { describe, expect, it } from 'vitest';
import { ANGEL, BOARD, DEVIL, MAX_PLAYERS, MIN_PLAYERS, PLACE_CAP, SPACES, finalScore, piecesFor } from '../shared/protocol';
import { SKILLS, botMove, botPlace, botTint, orders } from '../server/bots';
import { Game } from '../server/game';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Une partie déjà posée : le plateau donné, le tour au premier joueur. */
function ready(order: string[], board: Record<number, string[]>, target: 20 | 30 = 30): Game {
  const g = new Game(order, target);
  g.board = Array.from({ length: SPACES }, (_, i) => [...(board[i] ?? [])]);
  g.placed = g.toPlace;
  g.stage = 'move';
  g.round = 1;
  return g;
}

describe('le plateau', () => {
  it('reprend celui de l’émission : le Diable en haut, l’Ange en face, rouge, bleu, vert de chaque côté', () => {
    expect(SPACES).toBe(14);
    expect(BOARD[DEVIL]).toBe('devil');
    expect(BOARD[ANGEL]).toBe('angel');
    expect(ANGEL - DEVIL).toBe(7);
    expect(BOARD.slice(1, 7)).toEqual(['red', 'blue', 'green', 'red', 'blue', 'green']);
    expect(BOARD.slice(8)).toEqual(['red', 'blue', 'green', 'red', 'blue', 'green']);
  });
  it('a toujours assez de place pour poser tous les pions, deux par coupelle au plus', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) expect(n * piecesFor(n)).toBeLessThanOrEqual(SPACES * PLACE_CAP);
    expect(piecesFor(7)).toBe(4);
  });
});

describe('la pose', () => {
  it('se fait chacun son tour, un pion à la fois, jamais plus de deux par coupelle', () => {
    const g = new Game(ids(3), 20);
    expect(g.current).toBe('p0');
    expect(g.place('p1', 3)).toMatch(/pas ton tour/);
    expect(g.place('p0', 3)).toBeUndefined();
    expect(g.current).toBe('p1');
    expect(g.place('p1', 3)).toBeUndefined();
    expect(g.place('p2', 3)).toMatch(/déjà 2 pions/);
    expect(g.placeOptions()).not.toContain(3);
    expect(g.place('p2', DEVIL)).toBeUndefined();
    expect(g.current).toBe('p0');
  });
  it('passe aux semis une fois tous les pions posés, en commençant par le premier joueur', () => {
    const g = new Game(ids(3), 20);
    for (let i = 0; i < g.toPlace; i++) expect(g.place(g.current!, g.placeOptions()[0])).toBeUndefined();
    expect(g.stage).toBe('move');
    expect(g.round).toBe(1);
    expect(g.current).toBe('p0');
    expect(g.board.flat()).toHaveLength(18);
  });
});

describe('les semis', () => {
  it('sèment dans le sens des aiguilles d’une montre, le dernier pion marque autant que de pions dans sa coupelle', () => {
    // p0 sème la case 1 (p0, p1) : p1 tombe en 2, p0 en 3 (verte), où attendent déjà deux pions.
    const g = ready(ids(3), { 1: ['p0', 'p1'], 3: ['p2', 'p1'] });
    expect(g.move('p0', 1, ['p1', 'p0'])).toBeUndefined();
    expect(g.board[1]).toEqual([]);
    expect(g.board[2]).toEqual(['p1']);
    expect(g.board[3]).toEqual(['p2', 'p1', 'p0']);
    expect(g.last).toMatchObject({ by: 'p0', landing: 3, scorer: 'p0', points: 3, tint: 'green' });
    expect(g.score('p0')).toEqual([0, 0, 3]);
    expect(g.current).toBe('p1');
  });
  it('donne les points au propriétaire du dernier pion, pas au semeur', () => {
    const g = ready(ids(3), { 1: ['p0', 'p1'], 3: ['p2'] });
    expect(g.move('p0', 1, ['p0', 'p1'])).toBeUndefined();
    expect(g.last).toMatchObject({ scorer: 'p1', points: 2, tint: 'green' });
    expect(g.score('p1')).toEqual([0, 0, 2]);
    expect(g.score('p0')).toEqual([0, 0, 0]);
  });
  it('fait le tour du plateau : après la case 13 vient le Diable', () => {
    const g = ready(ids(3), { 13: ['p0'], 0: ['p1'] });
    g.scores.set('p0', [5, 2, 1]);
    expect(g.move('p0', 13, ['p0'])).toBeUndefined();
    expect(g.last).toMatchObject({ landing: DEVIL, points: 2, tint: 'red' });
    expect(g.score('p0')).toEqual([7, 2, 1]);
  });
  it('refuse une coupelle sans pion à soi, ou un ordre qui ne correspond pas à son contenu', () => {
    const g = ready(ids(3), { 1: ['p1', 'p2'], 4: ['p0', 'p1'] });
    expect(g.move('p0', 1, ['p1', 'p2'])).toMatch(/aucun pion/);
    expect(g.move('p0', 4, ['p0', 'p0'])).toMatch(/pas ceux/);
    expect(g.move('p0', 4, ['p0'])).toMatch(/pas ceux/);
    expect(g.move('p1', 4, ['p0', 'p1'])).toMatch(/pas ton tour/);
    expect(g.move('p0', 4, ['p1', 'p0'])).toBeUndefined();
  });
});

describe('l’Ange et le Diable', () => {
  it('l’Ange donne les points dans la couleur la plus basse du dernier pion', () => {
    const g = ready(ids(3), { 6: ['p0'], 7: ['p1'] });
    g.scores.set('p0', [4, 1, 3]);
    g.move('p0', 6, ['p0']);
    expect(g.last).toMatchObject({ landing: ANGEL, points: 2, tint: 'blue' });
    expect(g.score('p0')).toEqual([4, 3, 3]);
  });
  it('le Diable donne les points dans sa couleur la plus haute', () => {
    const g = ready(ids(3), { 12: ['p0', 'p1'] });
    g.scores.set('p1', [4, 9, 3]);
    g.move('p0', 12, ['p0', 'p1']);
    expect(g.last).toMatchObject({ landing: DEVIL, scorer: 'p1', points: 1, tint: 'blue' });
    expect(g.score('p1')).toEqual([4, 10, 3]);
  });
  it('sur une égalité, c’est le semeur qui choisit la couleur, même pour un autre', () => {
    const g = ready(ids(3), { 12: ['p0', 'p1'] });
    g.scores.set('p1', [6, 6, 2]);
    g.move('p0', 12, ['p0', 'p1']);
    expect(g.stage).toBe('color');
    expect(g.current).toBe('p0');
    expect(g.tie).toEqual({ scorer: 'p1', points: 1, where: 'devil', options: ['red', 'blue'] });
    expect(g.chooseTint('p1', 'red')).toMatch(/semeur/);
    expect(g.chooseTint('p0', 'green')).toMatch(/ne fait pas partie/);
    expect(g.chooseTint('p0', 'blue')).toBeUndefined();
    expect(g.score('p1')).toEqual([6, 7, 2]);
    expect(g.last).toMatchObject({ tint: 'blue', chosen: true });
    expect(g.current).toBe('p1');
  });
  it('au début, tout est à égalité : le semeur choisit parmi les trois couleurs', () => {
    const g = ready(ids(3), { 6: ['p0'] });
    g.move('p0', 6, ['p0']);
    expect(g.tie?.options).toEqual(['red', 'blue', 'green']);
  });
});

describe('la fin de partie', () => {
  it('se calcule comme dans l’émission : 13/11/20 donne 2', () => {
    expect(finalScore([13, 11, 20])).toBe(2);
    expect(finalScore([15, 15, 15])).toBe(15);
    expect(finalScore([0, 0, 4])).toBe(-4);
  });
  it('arrive dès qu’une couleur atteint le score de fin, même au milieu d’un tour', () => {
    // p0 tombe sur le pion de p1 (rouge, 2 points), puis p1 ressème les deux et finit seul sur le vert.
    const g = ready(ids(3), { 3: ['p0'], 4: ['p1'] }, 20);
    g.scores.set('p0', [8, 8, 8]);
    g.scores.set('p1', [12, 15, 19]);
    g.move('p0', 3, ['p0']);
    expect(g.stage).toBe('move');
    expect(g.score('p0')).toEqual([10, 8, 8]);
    g.move('p1', 4, ['p0', 'p1']);
    expect(g.stage).toBe('over');
    expect(g.score('p1')).toEqual([12, 15, 20]);
    expect(g.closer).toBe('p1');
    expect(g.closerTint).toBe('green');
    expect(g.closedBy).toBe('p1');
    expect(g.last?.ends).toBe(true);
    expect(g.current).toBeNull();
  });
  it('classe au score final, puis à la couleur la plus basse, sinon la place est partagée', () => {
    const g = new Game(ids(4), 30);
    g.scores.set('p0', [10, 10, 10]); // 10
    g.scores.set('p1', [12, 13, 14]); // 10, mais 12 en bas
    g.scores.set('p2', [30, 5, 5]); // -20
    g.scores.set('p3', [10, 10, 10]); // 10
    const rows = g.standings();
    expect(rows.map((r) => [r.id, r.final, r.place])).toEqual([
      ['p1', 10, 1],
      ['p0', 10, 2],
      ['p3', 10, 2],
      ['p2', -20, 4],
    ]);
  });
});

describe('les bots', () => {
  it('énumèrent chaque ordre de semis distinct une seule fois', () => {
    expect(orders(['a', 'a', 'b'])).toHaveLength(3);
    expect(orders(['a', 'b', 'c', 'd'])).toHaveLength(24);
    const big = orders(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(big.length).toBeLessThanOrEqual(90);
    expect(new Set(big.map((o) => o[o.length - 1]))).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
  });
  it('finissent toujours une partie, de 3 à 8 joueurs, sans un coup refusé', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (const target of [20, 30] as const) {
        const g = new Game(ids(n), target);
        for (let guard = 0; guard < 3000 && g.stage !== 'over'; guard++) {
          const id = g.current!;
          const skill = SKILLS[guard % SKILLS.length];
          if (g.stage === 'place') expect(g.place(id, botPlace(g, id, skill))).toBeUndefined();
          else if (g.stage === 'color') expect(g.chooseTint(id, botTint(g, id, skill))).toBeUndefined();
          else {
            const plan = botMove(g, id, skill);
            expect(g.move(id, plan.from, plan.drops)).toBeUndefined();
          }
        }
        expect(g.stage).toBe('over');
        const top = Math.max(...[...g.scores.values()].flat());
        expect(top).toBeGreaterThanOrEqual(target);
      }
    }
  });
  it('saisissent un gain immédiat évident', () => {
    // p0 peut faire tomber son pion sur une coupelle rouge de quatre pions, alors que ses autres coups ne rapportent presque rien.
    const g = ready(ids(3), { 3: ['p0'], 4: ['p1', 'p2', 'p1'], 9: ['p0'], 11: ['p2'] });
    g.scores.set('p0', [0, 4, 4]);
    const plan = botMove(g, 'p0', { label: 'test', lookahead: false, noise: 0, spite: 0.5 });
    expect(plan.from).toBe(3);
  });
});
