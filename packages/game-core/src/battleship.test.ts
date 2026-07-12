import { describe, expect, it } from 'vitest';

import { getGame } from './index';
import {
  type BattleshipState,
  BATTLESHIP_VARIANTS,
  BATTLESHIP_VARIANTS_CONFIG,
  battleship,
  canPlaceShip,
  cellToCoord,
  coordToCell,
  generateFleet,
  getBattleshipVariant,
  shipCellsAt,
  validateFleet,
} from './battleship';
import type { PlayerSide } from './types';

function variantById(id: string) {
  return BATTLESHIP_VARIANTS.find((v) => v.id === id)!;
}

/** Build a minimal custom state for fine-grained mechanics tests. */
function makeState(
  size: number,
  p1ships: number[][],
  p2ships: number[][],
  opts: { turn?: PlayerSide; extraShotOnHit?: boolean } = {},
): BattleshipState {
  const toShips = (arr: number[][]) =>
    arr.map((cells) => ({ cells: [...cells], length: cells.length, hits: 0 }));
  return {
    variant: 'custom',
    size,
    extraShotOnHit: opts.extraShotOnHit ?? true,
    seed: 0,
    turn: opts.turn ?? 'p1',
    fleets: {
      p1: { ships: toShips(p1ships), shots: [] },
      p2: { ships: toShips(p2ships), shots: [] },
    },
    moves: [],
  };
}

describe('variants', () => {
  it('exposes small / medium / classic with correct sizes and fleets', () => {
    expect(BATTLESHIP_VARIANTS.map((v) => v.id)).toEqual(['small', 'medium', 'classic']);
    expect(BATTLESHIP_VARIANTS_CONFIG.small.size).toBe(6);
    expect(BATTLESHIP_VARIANTS_CONFIG.classic.fleet).toEqual([5, 4, 3, 3, 2]);
    expect(getGame('battleship')).toBe(battleship);
  });
});

describe('coordinates', () => {
  it('round-trips cell ↔ coordinate', () => {
    expect(cellToCoord(0, 6)).toBe('A1');
    expect(cellToCoord(6, 6)).toBe('A2');
    expect(coordToCell('A1', 6)).toBe(0);
    expect(coordToCell('C5', 6)).toBe(4 * 6 + 2);
    expect(coordToCell('J10', 10)).toBe(99);
  });

  it('rejects out-of-range / malformed coordinates', () => {
    expect(coordToCell('G1', 6)).toBeNull(); // col G beyond 6×6
    expect(coordToCell('A9', 6)).toBeNull(); // row beyond 6
    expect(coordToCell('ZZ', 6)).toBeNull();
    expect(coordToCell('5', 6)).toBeNull();
  });
});

describe('placement legality — 1000 random layouts per variant (SPEC §7.2)', () => {
  for (const id of ['small', 'medium', 'classic'] as const) {
    it(`generates 1000 legal ${id} fleets (no overlap, no touch incl. diagonal)`, () => {
      const vc = getBattleshipVariant(id);
      const expectedCells = vc.fleet.reduce((a, b) => a + b, 0);
      for (let seed = 0; seed < 1000; seed++) {
        // Deterministic RNG per seed.
        let a = seed >>> 0;
        const rng = () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const fleet = generateFleet(vc.size, vc.fleet, rng);
        expect(validateFleet(vc.size, vc.fleet, fleet)).toBe(true);
        expect(fleet.flat()).toHaveLength(expectedCells);
      }
    });
  }
});

describe('validateFleet', () => {
  it('rejects a diagonal touch but accepts a one-cell gap', () => {
    // cells 0 and 7 are diagonal neighbours on a 6×6 board.
    expect(validateFleet(6, [1, 1], [[0], [7]])).toBe(false);
    expect(validateFleet(6, [1, 1], [[0], [8]])).toBe(true);
  });

  it('rejects wrong fleet composition and non-straight ships', () => {
    expect(validateFleet(6, [2], [[0]])).toBe(false); // wrong length
    expect(validateFleet(6, [2], [[0, 7]])).toBe(false); // diagonal, not a line
    expect(validateFleet(6, [3], [[0, 1, 2]])).toBe(true);
  });
});

describe('placement helpers (UI reuse)', () => {
  it('shipCellsAt computes horizontal/vertical cells and rejects off-board', () => {
    expect(shipCellsAt(0, 3, true, 6)).toEqual([0, 1, 2]);
    expect(shipCellsAt(0, 3, false, 6)).toEqual([0, 6, 12]);
    expect(shipCellsAt(4, 3, true, 6)).toBeNull(); // runs off the right edge
  });

  it('canPlaceShip enforces no overlap and no touch', () => {
    expect(canPlaceShip(6, [], [0, 1])).toBe(true);
    expect(canPlaceShip(6, [[0, 1]], [7, 8])).toBe(false); // 7 touches diagonally
    expect(canPlaceShip(6, [[0, 1]], [14, 15])).toBe(true); // clear gap
  });
});

describe('createInitialState', () => {
  it('produces legal fleets for both sides, p1 to move', () => {
    const state = battleship.createInitialState(variantById('medium'), { seed: 42 });
    const vc = getBattleshipVariant('medium');
    expect(state.turn).toBe('p1');
    expect(state.size).toBe(8);
    for (const side of ['p1', 'p2'] as const) {
      const cells = state.fleets[side].ships.map((s) => s.cells);
      expect(validateFleet(vc.size, vc.fleet, cells)).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = battleship.createInitialState(variantById('small'), { seed: 7 });
    const b = battleship.createInitialState(variantById('small'), { seed: 7 });
    expect(a.fleets.p1.ships).toEqual(b.fleets.p1.ships);
    expect(a.fleets.p2.ships).toEqual(b.fleets.p2.ships);
  });

  it('accepts a valid human placement and rejects an illegal one', () => {
    // A guaranteed-legal fleet lifted from a generated game.
    const legal = battleship
      .createInitialState(variantById('small'), { seed: 3 })
      .fleets.p1.ships.map((s) => s.cells);
    // Provide p1 placement; p2 generated.
    const state = battleship.createInitialState(variantById('small'), {
      seed: 1,
      placements: { p1: legal },
    });
    expect(state.fleets.p1.ships.map((s) => s.cells)).toEqual(legal);

    expect(() =>
      battleship.createInitialState(variantById('small'), {
        placements: { p1: [[0], [1]] }, // touching + wrong composition
      }),
    ).toThrow(/Illegal/);
  });
});

describe('firing mechanics', () => {
  it('records a miss and passes the turn', () => {
    const state = makeState(6, [[20, 21]], [[0, 1]]);
    const next = battleship.applyMove(state, 'p1', 'C1'); // cell 2 = water
    expect(next.turn).toBe('p2');
    expect(battleship.viewFor(next, 'p1').trackingBoard[2]).toBe('miss');
  });

  it('records a hit and grants an extra shot (extraShotOnHit)', () => {
    const state = makeState(6, [[20, 21]], [[0, 1]]);
    const next = battleship.applyMove(state, 'p1', 'A1'); // cell 0 = p2 ship
    expect(next.turn).toBe('p1'); // same player shoots again
    expect(battleship.viewFor(next, 'p1').trackingBoard[0]).toBe('hit');
    expect(battleship.status(next)).toBe('playing');
  });

  it('passes the turn on a hit when extraShotOnHit is off', () => {
    const state = makeState(6, [[20, 21]], [[0, 1]], { extraShotOnHit: false });
    const next = battleship.applyMove(state, 'p1', 'A1');
    expect(next.turn).toBe('p2');
  });

  it('sinks a ship and wins when the whole fleet is down', () => {
    let state = makeState(6, [[20, 21]], [[0, 1]]);
    state = battleship.applyMove(state, 'p1', 'A1'); // hit
    state = battleship.applyMove(state, 'p1', 'B1'); // sunk → last ship
    expect(battleship.status(state)).toBe('p1_won');
    const view = battleship.viewFor(state, 'p1');
    expect(view.trackingBoard[0]).toBe('sunk');
    expect(view.trackingBoard[1]).toBe('sunk');
    expect(view.enemyShipsRemaining).toEqual([]);
  });

  it('is immutable and throws on illegal shots', () => {
    const state = makeState(6, [[20, 21]], [[0, 1]]);
    const after = battleship.applyMove(state, 'p1', 'A1');
    expect(state.fleets.p2.shots).toEqual([]); // input untouched
    expect(state.moves).toEqual([]);

    expect(() => battleship.applyMove(after, 'p1', 'A1')).toThrow(/already fired/);
    expect(() => battleship.applyMove(state, 'p2', 'A1')).toThrow(/not p2's turn/);
    expect(() => battleship.applyMove(state, 'p1', 'Z9')).toThrow(/Illegal shot/);
  });

  it('legalMoves covers all cells at start and shrinks after a shot', () => {
    const state = makeState(6, [[20, 21]], [[0, 1]]);
    expect(battleship.legalMoves(state, 'p1')).toHaveLength(36);
    expect(battleship.legalMoves(state, 'p2')).toHaveLength(0); // not p2's turn
    const after = battleship.applyMove(state, 'p1', 'C1'); // miss → p2's turn
    expect(battleship.legalMoves(after, 'p2')).toHaveLength(36);
    expect(battleship.legalMoves(after, 'p1')).toHaveLength(0);
  });
});

describe('viewFor — NO hidden information (SPEC §5, §20 mandatory)', () => {
  it('never reveals un-fired enemy ship cells', () => {
    // p2 ships at known cells; p1 has fired nothing.
    const state = makeState(6, [[30, 31]], [[3, 4], [12]]);
    const view = battleship.viewFor(state, 'p1');

    // Every enemy cell — ship or water — reads 'unknown' until fired upon.
    expect(view.trackingBoard.every((c) => c === 'unknown')).toBe(true);
    // The enemy ship cells (3, 4, 12) are indistinguishable from water.
    expect(view.trackingBoard[3]).toBe('unknown');
    expect(view.trackingBoard[4]).toBe('unknown');
    expect(view.trackingBoard[12]).toBe('unknown');
    // Only lengths leak, never positions.
    expect(view.enemyShipsRemaining).toEqual([2, 1]);

    // Serialised view contains no reconstruction of the enemy layout.
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain('"ships"');
    expect(view).not.toHaveProperty('fleets');
  });

  it('shows the player their own fleet and incoming fire', () => {
    const state = makeState(6, [[0, 1]], [[30, 31]]);
    const afterEnemyShot = battleship.applyMove(
      { ...state, turn: 'p2' },
      'p2',
      'A1', // cell 0 — hits p1 ship
    );
    const view = battleship.viewFor(afterEnemyShot, 'p1');
    expect(view.ownBoard[0]).toBe('ship-hit');
    expect(view.ownBoard[1]).toBe('ship');
  });
});

describe('renderPrompt / parseMove (SPEC §7.3)', () => {
  it('builds the firing prompt from the view only (snapshot)', () => {
    const state = makeState(6, [[30, 31]], [[3, 4]]);
    const view = battleship.viewFor(state, 'p1');
    const legal = ['A1', 'B1'];
    const { system, user } = battleship.renderPrompt(view, legal);
    expect(system).toContain('Battleship on a 6x6 grid. Columns A-F, rows 1-6');
    expect(system).toContain("'?' unknown, 'M' miss, 'H' hit, 'S' sunk");
    expect(system).toContain('{"shot": "<cell>"}');
    // The prompt cannot contain enemy positions — the view has none.
    expect(user).toBe('Take your first shot.');
  });

  it('parses a shot via all tiers and validates against legal targets', () => {
    const legal = ['C5', 'A1', 'F6'];
    expect(battleship.parseMove('{"shot": "C5"}', legal)).toBe('C5');
    expect(battleship.parseMove('I will fire {"shot":"A1"} now', legal)).toBe('A1');
    expect(battleship.parseMove('let us try f6', legal)).toBe('F6'); // lone coord, lowercase
    expect(battleship.parseMove('{"shot": "B2"}', legal)).toBeNull(); // legal but not offered
    expect(battleship.parseMove('no idea', legal)).toBeNull();
  });
});

describe('serializeSetup', () => {
  it('records seed, rule and both placements for replay', () => {
    const state = makeState(6, [[0, 1]], [[30, 31]]);
    const setup = battleship.serializeSetup(state);
    expect(setup).toMatchObject({
      game: 'battleship',
      variant: 'custom',
      extraShotOnHit: true,
      placements: { p1: [[0, 1]], p2: [[30, 31]] },
    });
  });
});
