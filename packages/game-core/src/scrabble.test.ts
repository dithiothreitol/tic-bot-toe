import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearLexicons, miniLexicon, registerLexicon } from './lexicon-registry';
import { type ReplayMove, replayMatch } from './replay';
import { type ScrabbleState, scrabble, finalScores } from './scrabble';
import type { PlacedTile, Variant } from './types';

const EN_WORDS = [
  'CAT', 'CATS', 'CAR', 'CARS', 'AT', 'AI', 'IS', 'TS', 'AX', 'AXE', 'OX',
  'HI', 'HE', 'RETINAS', 'AA', 'AB', 'ABC',
];

beforeEach(() => {
  registerLexicon('en', miniLexicon('en', EN_WORDS));
  registerLexicon('pl', miniLexicon('pl', ['KOT', 'KOTY', 'ŻÓŁW', 'MĄKA']));
});
afterEach(() => clearLexicons());

/** A state with an empty board and chosen racks; p1 to move. */
function emptyState(variant: 'en' | 'pl', rackP1: string[], rackP2: string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']): ScrabbleState {
  const base = scrabble.createInitialState({ id: variant, label: '' } as Variant, { seed: 1 });
  return {
    ...base,
    board: Array<PlacedTile | null>(225).fill(null),
    racks: { p1: rackP1, p2: rackP2 },
    toMove: 'p1',
  };
}

/** Place existing tiles on a board (not scored — just the starting position). */
function withWord(state: ScrabbleState, start: number, dir: 'across' | 'down', word: string): ScrabbleState {
  const board = state.board.slice();
  for (let k = 0; k < word.length; k++) {
    const cell = dir === 'across' ? start + k : start + k * 15;
    board[cell] = { letter: word[k], isBlank: false, points: 1 };
  }
  return { ...state, board };
}

const H8 = 7 * 15 + 7; // 112

describe('scrabble — scoring', () => {
  it('scores the first word across the centre double-word square', () => {
    const st = emptyState('en', ['C', 'A', 'T', 'X', 'Y', 'Z', 'B']);
    const next = scrabble.applyMove(st, 'p1', 'H8>CAT');
    // C3 + A1 + T1 = 5, centre is a double-WORD square → ×2 = 10.
    expect(next.scores.p1).toBe(10);
    expect(next.board[H8]!.letter).toBe('C');
    expect(next.history.at(-1)!.total).toBe(10);
  });

  it('adds the 50-point bingo bonus for playing all 7 tiles', () => {
    const st = emptyState('en', ['R', 'E', 'T', 'I', 'N', 'A', 'S']);
    const next = scrabble.applyMove(st, 'p1', 'H8>RETINAS');
    const words = next.history.at(-1)!.words;
    const sumWords = words.reduce((a, w) => a + w.score, 0);
    expect(next.scores.p1 - sumWords).toBe(50);
  });

  it('scores a blank as zero but still records the letter it plays', () => {
    const st = emptyState('en', ['?', 'A', 'T', 'X', 'Y', 'Z', 'B']);
    const next = scrabble.applyMove(st, 'p1', 'H8>cAT'); // blank plays C
    // blank C = 0, A1, T1 = 2, centre ×2 = 4.
    expect(next.scores.p1).toBe(4);
    expect(next.board[H8]!.isBlank).toBe(true);
    expect(next.board[H8]!.points).toBe(0);
    expect(next.board[H8]!.letter).toBe('C');
  });

  it('scores every cross-word a new tile forms', () => {
    // Board: A T at H8,I8. Play I,S below → main "IS", crosses "AI" and "TS".
    let st = emptyState('en', ['I', 'S', 'X', 'Y', 'Z', 'B', 'D']);
    st = withWord(st, H8, 'across', 'AT');
    const next = scrabble.applyMove(st, 'p1', 'H9>IS');
    // main IS: I1 + S1(DL)=2 → 3; cross AI: A1+I1 → 2; cross TS: T1 + S1(DL)=2 → 3. Total 8.
    expect(next.scores.p1).toBe(8);
    const played = next.history.at(-1)!.words.map((w) => w.word).sort();
    expect(played).toEqual(['AI', 'IS', 'TS']);
  });
});

describe('scrabble — validation (each rule from §5.5)', () => {
  function view(st: ScrabbleState) {
    return scrabble.viewFor(st, 'p1');
  }

  it('the first word must cover H8', () => {
    const st = emptyState('en', ['C', 'A', 'T', 'X', 'Y', 'Z', 'B']);
    const res = scrabble.validateMove!(view(st), 'A1>CAT');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/H8|cent/i);
    expect(() => scrabble.applyMove(st, 'p1', 'A1>CAT')).toThrow(/H8|cent/i);
  });

  it('rejects a word not in the dictionary, naming it', () => {
    const st = emptyState('en', ['C', 'A', 'B', 'X', 'Y', 'Z', 'D']);
    const res = scrabble.validateMove!(view(st), 'H8>CAB'); // CAB not in EN_WORDS
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('CAB');
  });

  it('rejects an invalid cross-word, naming it', () => {
    let st = emptyState('en', ['O', 'X', 'Y', 'Z', 'B', 'D', 'E']);
    st = withWord(st, H8, 'across', 'CAT');
    // Play below C and A: main "OX" say — build a case where a cross word is bad.
    // Place O under C (H9) and X under A (I9): main "OX" across; crosses "CO" and "AX".
    // CO is not a word here → rejected.
    const res = scrabble.validateMove!(view(st), 'H9>OX');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/CO|not a valid word/);
  });

  it('rejects tiles that are not on the rack', () => {
    const st = emptyState('en', ['C', 'A', 'T', 'X', 'Y', 'Z', 'B']);
    const res = scrabble.validateMove!(view(st), 'H8>CARS'); // no R/S on rack
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/rack/i);
  });

  it('rejects a disconnected move after the first', () => {
    let st = emptyState('en', ['C', 'A', 'T', 'X', 'Y', 'Z', 'S']);
    st = withWord(st, H8, 'across', 'CAT');
    const res = scrabble.validateMove!(view(st), 'A1>AT'); // nowhere near the board
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/connect/i);
  });

  it('rejects a one-letter word', () => {
    const st = emptyState('en', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const res = scrabble.validateMove!(view(st), 'H8>A');
    expect(res.ok).toBe(false);
  });

  it('PASS is always legal; EXCHANGE needs a bag of at least 7', () => {
    const st = emptyState('en', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(scrabble.validateMove!(view(st), 'PASS')).toEqual({ ok: true });
    expect(scrabble.validateMove!(view(st), 'EXCH:AB').ok).toBe(true); // full bag
    const lowBag = { ...st, bag: ['A', 'B', 'C'] };
    const res = scrabble.validateMove!(scrabble.viewFor(lowBag, 'p1'), 'EXCH:AB');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/7 tiles|bag/i);
  });
});

describe('scrabble — bag & exchange determinism', () => {
  it('the same seed deals the same bag', () => {
    const a = scrabble.createInitialState({ id: 'en', label: '' } as Variant, { seed: 99 });
    const b = scrabble.createInitialState({ id: 'en', label: '' } as Variant, { seed: 99 });
    expect(a.bag).toEqual(b.bag);
    expect(a.racks).toEqual(b.racks);
  });

  it('an exchange is deterministic and replayable from (seed, rngUses)', () => {
    const a = scrabble.createInitialState({ id: 'en', label: '' } as Variant, { seed: 7 });
    const move = `EXCH:${a.racks.p1[0]}`;
    const a1 = scrabble.applyMove(a, 'p1', move);
    const b = scrabble.createInitialState({ id: 'en', label: '' } as Variant, { seed: 7 });
    const b1 = scrabble.applyMove(b, 'p1', `EXCH:${b.racks.p1[0]}`);
    expect(a1.bag).toEqual(b1.bag);
    expect(a1.racks).toEqual(b1.racks);
    expect(a1.rngUses).toBe(b1.rngUses);
  });

  it('replays a game with exchanges to a winner (4 scoreless ends it)', () => {
    const seed = 11;
    const s0 = scrabble.createInitialState({ id: 'en', label: '' } as Variant, { seed });
    // Four exchanges of one tile each → 4 scoreless moves → game ends.
    const moves: ReplayMove[] = [];
    let st = s0;
    for (let i = 0; i < 4 && scrabble.status(st) === 'playing'; i++) {
      const side = scrabble.currentPlayer(st);
      const move = `EXCH:${st.racks[side][0]}`;
      moves.push({ player: side, move });
      st = scrabble.applyMove(st, side, move);
    }
    expect(scrabble.status(st)).not.toBe('playing');
    const result = replayMatch('scrabble', 'en', { game: 'scrabble', variant: 'en', seed }, moves);
    expect(result.valid).toBe(true);
    expect(['p1', 'p2', 'draw']).toContain(result.winner);
  });
});

describe('scrabble — end of game', () => {
  it('settles racks when the bag is empty and a player goes out (rule a)', () => {
    const base = emptyState('en', [], ['A', 'B']); // p1 out, p2 holds A(1)+B(3)=4
    const st: ScrabbleState = { ...base, bag: [], scores: { p1: 50, p2: 40 }, toMove: 'p2' };
    expect(scrabble.status(st)).toBe('p1_won');
    expect(finalScores(st)).toEqual({ p1: 54, p2: 36 }); // p1 += opp rack, p2 -= own rack
  });

  it('ends after 4 scoreless moves and subtracts each rack (rule b)', () => {
    const base = emptyState('en', ['A'], ['B']); // A=1, B=3
    const st: ScrabbleState = { ...base, scorelessStreak: 4, scores: { p1: 20, p2: 20 } };
    // Each side loses its own rack: p1 20-1=19, p2 20-3=17 → p1 wins.
    expect(scrabble.status(st)).toBe('p1_won');
    expect(finalScores(st)).toEqual({ p1: 19, p2: 17 });
  });
});

describe('scrabble — view hides the opponent rack and the bag', () => {
  it('the serialized view leaks neither the opponent rack nor the bag', () => {
    // Give p2 a blank and keep the bag full; p1's view must contain no '?'.
    const st = emptyState('en', ['A', 'A', 'A', 'A', 'A', 'A', 'A'], ['?', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z']);
    const view = scrabble.viewFor(st, 'p1');
    expect(view.rack).not.toContain('?');
    expect(view.opponentRackCount).toBe(7);
    expect('bag' in view).toBe(false);
    // No opponent tile ('?') anywhere in the serialized view.
    expect(JSON.stringify(view)).not.toContain('?');
  });
});

describe('scrabble — parseMove cascade', () => {
  it('parses whole-string JSON', () => {
    expect(scrabble.parseMove('{"move": "H8>KOTY"}', [])).toBe('H8>KOTY');
  });
  it('parses embedded JSON and normalizes column case', () => {
    expect(scrabble.parseMove('sure: {"move":"h8vKOT"} ok', [])).toBe('H8vKOT');
  });
  it('preserves lowercase blanks', () => {
    expect(scrabble.parseMove('{"move":"H8>koTY"}', [])).toBe('H8>koTY');
  });
  it('sorts exchanged tiles into canonical order', () => {
    expect(scrabble.parseMove('{"move":"EXCH:CBA"}', [])).toBe('EXCH:ABC');
  });
  it('parses PASS and a bare notation token in prose', () => {
    expect(scrabble.parseMove('I will PASS this turn', [])).toBe('PASS');
    expect(scrabble.parseMove('playing H8vRETINAS for the bingo', [])).toBe('H8vRETINAS');
  });
  it('parses Polish letters (NFC)', () => {
    expect(scrabble.parseMove('{"move":"H8>ŻÓŁW"}', [])).toBe('H8>ŻÓŁW');
  });
  it('returns null on garbage', () => {
    expect(scrabble.parseMove('no move here', [])).toBeNull();
  });
});

describe('scrabble — forfeit + legal moves', () => {
  it('legalMoves always offers PASS; fallbackMove is PASS', () => {
    const st = emptyState('en', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(scrabble.legalMoves(st, 'p1')).toContain('PASS');
    expect(scrabble.fallbackMove!(scrabble.viewFor(st, 'p1'), ['PASS'], () => 0)).toBe('PASS');
  });
});
