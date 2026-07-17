import { useMemo, useState } from 'react';

import {
  type PlacedTile,
  type PlayerSide,
  type ScrabbleState,
  type ScrabbleVariant,
  RACK_SIZE,
  scrabble,
  tilesFor,
} from '@arena/game-core';

import { ScrabbleBoard } from '@/components/ScrabbleBoard';
import { ScrabbleRack } from '@/components/ScrabbleRack';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const SIZE = 15;
const COLS = 'ABCDEFGHIJKLMNO';

type Dir = 'across' | 'down';
interface UserTile {
  letter: string;
  isBlank: boolean;
  /** Index in the rack this tile came from. */
  rackIndex: number;
}

function stepCell(cell: number, dir: Dir, delta: number): number | null {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const nr = dir === 'down' ? r + delta : r;
  const nc = dir === 'across' ? c + delta : c;
  if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return null;
  return nr * SIZE + nc;
}

/** Build the full-word notation from a start cell, direction and the new tiles. */
function buildNotation(
  board: (PlacedTile | null)[],
  startCell: number,
  dir: Dir,
  userTiles: UserTile[],
): { notation: string; pending: Map<number, { letter: string; isBlank: boolean }> } | null {
  // Extend the start back over any existing tiles so the notation is the whole word.
  let start = startCell;
  for (;;) {
    const prev = stepCell(start, dir, -1);
    if (prev === null || board[prev] === null) break;
    start = prev;
  }
  const letters: string[] = [];
  const pending = new Map<number, { letter: string; isBlank: boolean }>();
  let ui = 0;
  let cell: number | null = start;
  while (cell !== null) {
    const placed = board[cell];
    if (placed) {
      letters.push(placed.letter);
      cell = stepCell(cell, dir, 1);
    } else if (ui < userTiles.length) {
      const t = userTiles[ui++];
      letters.push(t.isBlank ? t.letter.toLowerCase() : t.letter);
      pending.set(cell, { letter: t.letter, isBlank: t.isBlank });
      cell = stepCell(cell, dir, 1);
    } else {
      break;
    }
  }
  if (ui < userTiles.length) return null; // ran off the board
  const col = start % SIZE;
  const row = Math.floor(start / SIZE);
  return { notation: `${COLS[col]}${row + 1}${dir === 'down' ? 'v' : '>'}${letters.join('')}`, pending };
}

/**
 * Word-game arena (plan §7.2/§7.3). LLM-vs-LLM shows the god view (both racks).
 * Human input is a guided builder: tap a start cell, pick a direction, then tap
 * rack tiles to lay a word — board letters on the path are woven in automatically
 * and the move is validated live by the engine before it can be submitted.
 */
export function ScrabbleArena({
  state,
  interactive,
  toMove,
  mode,
  humanSide,
  names,
  onPlay,
}: {
  state: ScrabbleState | null;
  interactive: boolean;
  toMove: PlayerSide;
  mode: 'model_vs_model' | 'human_vs_model';
  humanSide: PlayerSide | null;
  names: { p1: string; p2: string };
  onPlay: (move: string) => void;
}) {
  const t = useT();
  const [dir, setDir] = useState<Dir>('across');
  const [startCell, setStartCell] = useState<number | null>(null);
  const [userTiles, setUserTiles] = useState<UserTile[]>([]);
  const [blankPick, setBlankPick] = useState<number | null>(null); // rack index awaiting a letter
  const [exchangeSel, setExchangeSel] = useState<Set<number> | null>(null);

  const variant = (state?.variant ?? 'en') as ScrabbleVariant;

  const reset = (): void => {
    setStartCell(null);
    setUserTiles([]);
    setBlankPick(null);
    setExchangeSel(null);
  };

  // Live-built notation + preview + validation.
  const built = useMemo(() => {
    if (!state || startCell === null) return null;
    return buildNotation(state.board, startCell, dir, userTiles);
  }, [state, startCell, dir, userTiles]);

  const validation = useMemo(() => {
    if (!state || !built) return null;
    return scrabble.validateMove!(scrabble.viewFor(state, toMove), built.notation);
  }, [state, built, toMove]);

  if (!state) return <p className="font-mono text-xs text-muted-foreground">…</p>;

  const view = scrabble.viewFor(state, toMove);
  const usedRack = new Set(userTiles.map((u) => u.rackIndex));
  const lastCells = lastMoveCells(state);

  // --- God view (LLM vs LLM spectating): board + both racks --------------
  if (mode === 'model_vs_model') {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <ScoreRow names={names} scores={state.scores} bag={state.bag.length} />
        <ScrabbleBoard board={state.board} lastCells={lastCells} />
        <div className="flex flex-wrap justify-center gap-4">
          <ScrabbleRack rack={state.racks.p1} variant={variant} accent="p1" title={names.p1} />
          <ScrabbleRack rack={state.racks.p2} variant={variant} accent="p2" title={names.p2} />
        </div>
      </div>
    );
  }

  // --- Human vs model, opponent's turn: board + the human's OWN rack only.
  // The opponent's rack is hidden info (SPEC §5) — never render it to a player.
  if (!interactive) {
    const mine = humanSide ?? 'p1';
    const myRack = scrabble.viewFor(state, mine).rack;
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <ScoreRow names={names} scores={state.scores} bag={state.bag.length} />
        <ScrabbleBoard board={state.board} lastCells={lastCells} />
        <ScrabbleRack rack={myRack} variant={variant} accent={mine} title={names[mine]} />
      </div>
    );
  }

  // --- Human input -------------------------------------------------------
  const appendTile = (rackIndex: number): void => {
    const tile = view.rack[rackIndex];
    if (tile === '?') {
      setBlankPick(rackIndex);
      return;
    }
    setUserTiles((prev) => [...prev, { letter: tile, isBlank: false, rackIndex }]);
  };

  const submitPlace = (): void => {
    if (built && validation?.ok) {
      onPlay(built.notation);
      reset();
    }
  };

  const alphabet = tilesFor(variant)
    .map((s) => s.letter)
    .filter((l) => l !== '?');

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ScoreRow names={names} scores={state.scores} bag={state.bag.length} />
      <ScrabbleBoard
        board={state.board}
        pending={built?.pending}
        lastCells={lastCells}
        interactive={exchangeSel === null}
        onCellClick={(cell) => {
          setStartCell(cell);
          setUserTiles([]);
        }}
        startCell={startCell}
      />

      {/* Blank-letter picker */}
      {blankPick !== null && (
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {t.scrabble.pickBlank}
          </span>
          <div className="flex max-w-[32rem] flex-wrap justify-center gap-1">
            {alphabet.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setUserTiles((prev) => [...prev, { letter: l, isBlank: true, rackIndex: blankPick }]);
                  setBlankPick(null);
                }}
                className="clip-cut size-9 border border-p2/50 bg-p2/10 font-mono text-sm font-bold text-p2 hover:brightness-125"
              >
                {l}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBlankPick(null)}
              className="clip-cut size-9 border border-border font-mono text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Rack — tap tiles to build a word, or select tiles to exchange */}
      <ScrabbleRack
        rack={view.rack}
        variant={variant}
        accent={toMove}
        selected={exchangeSel ?? (blankPick === null ? usedRack : undefined)}
        onTileClick={(i) => {
          if (exchangeSel !== null) {
            setExchangeSel((prev) => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            });
          } else if (!usedRack.has(i) && blankPick === null) {
            appendTile(i);
          }
        }}
      />

      {/* Controls */}
      {exchangeSel === null ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDir((d) => (d === 'across' ? 'down' : 'across'))}
            >
              {dir === 'across' ? '→ ' : '↓ '}
              {dir === 'across' ? t.scrabble.across : t.scrabble.down}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUserTiles((p) => p.slice(0, -1))}
              disabled={userTiles.length === 0}
            >
              ⌫
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={startCell === null && userTiles.length === 0}>
              {t.scrabble.clear}
            </Button>
          </div>

          {built && (
            <p
              className={cn(
                'font-mono text-xs',
                validation?.ok ? 'text-edu' : 'text-danger',
              )}
            >
              {built.notation}
              {validation && !validation.ok && ` · ${validation.reason}`}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={submitPlace} disabled={!validation?.ok}>
              {t.scrabble.play}
            </Button>
            <Button variant="outline" onClick={() => onPlay('PASS')}>
              {t.scrabble.pass}
            </Button>
            <Button
              variant="outline"
              onClick={() => setExchangeSel(new Set())}
              disabled={state.bag.length < RACK_SIZE}
            >
              {t.scrabble.exchange}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {t.scrabble.exchangeHint}
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                const tiles = [...exchangeSel].map((i) => view.rack[i]).sort().join('');
                if (tiles) onPlay(`EXCH:${tiles}`);
                reset();
              }}
              disabled={exchangeSel.size === 0}
            >
              {t.scrabble.confirmExchange}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t.scrabble.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRow({
  names,
  scores,
  bag,
}: {
  names: { p1: string; p2: string };
  scores: { p1: number; p2: number };
  bag: number;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-sm">
      <span className="text-p1">
        {names.p1.slice(0, 14)}: <span className="font-bold">{scores.p1}</span>
      </span>
      <span className="text-p2">
        {names.p2.slice(0, 14)}: <span className="font-bold">{scores.p2}</span>
      </span>
      <span className="text-[10px] uppercase tracking-wider text-dim">
        {t.scrabble.bag}: {bag}
      </span>
    </div>
  );
}

/** Cells touched by the most recent placement (for the highlight). */
function lastMoveCells(state: ScrabbleState): number[] {
  const last = state.history.at(-1);
  if (!last || last.words.length === 0) return [];
  // Best-effort: highlight the whole board row/col span of the main word by
  // reconstructing from the notation is overkill here — highlight nothing rather
  // than guess. Kept simple; the board still shows the placed tiles.
  return [];
}
