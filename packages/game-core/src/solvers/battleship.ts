/**
 * Battleship shot heuristic (SPEC §7.3, §12.2). No full solver — instead a
 * probability heat map: for every remaining ship length, count the straight
 * placements consistent with the shooter's tracking board that pass through
 * each un-fired cell. A shot's quality = its percentile against that map, with
 * a "hunting" bonus for cells adjacent to an unresolved hit.
 */
import type { BattleshipTrackingCell, BattleshipView } from '../types';
import type { MoveQuality } from '../types';

function orthogonalNeighbors(cell: number, size: number): number[] {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const out: number[] = [];
  if (row > 0) out.push((row - 1) * size + col);
  if (row < size - 1) out.push((row + 1) * size + col);
  if (col > 0) out.push(row * size + (col - 1));
  if (col < size - 1) out.push(row * size + (col + 1));
  return out;
}

function placementCells(
  start: number,
  length: number,
  horizontal: boolean,
  size: number,
): number[] | null {
  const row = Math.floor(start / size);
  const col = start % size;
  const cells: number[] = [];
  for (let k = 0; k < length; k++) {
    const r = horizontal ? row : row + k;
    const c = horizontal ? col + k : col;
    if (r >= size || c >= size) return null;
    cells.push(r * size + c);
  }
  return cells;
}

/**
 * Heat per cell: Σ over remaining ships of the number of legal placements
 * covering that cell. A placement is legal if every cell is un-fired-or-hit
 * (never a miss or sunk cell). Placements covering an unresolved hit get a
 * large weight so hunting dominates (§7.3 "polowanie po trafieniu").
 */
export function battleshipHeatMap(
  tracking: BattleshipTrackingCell[],
  size: number,
  remainingLengths: number[],
): number[] {
  const heat = new Array<number>(size * size).fill(0);
  const HUNT_WEIGHT = 50;

  for (const length of remainingLengths) {
    for (let start = 0; start < size * size; start++) {
      for (const horizontal of [true, false] as const) {
        const cells = placementCells(start, length, horizontal, size);
        if (!cells) continue;
        // A placement can't sit on a known miss or a sunk cell.
        if (cells.some((c) => tracking[c] === 'miss' || tracking[c] === 'sunk')) continue;
        const coversHit = cells.some((c) => tracking[c] === 'hit');
        const weight = coversHit ? HUNT_WEIGHT : 1;
        for (const c of cells) {
          if (tracking[c] === 'unknown') heat[c] += weight;
        }
      }
    }
  }
  return heat;
}

/** True when the board has a hit that isn't yet part of a sunk ship (§7.3 hunt). */
function hasUnresolvedHit(tracking: BattleshipTrackingCell[]): boolean {
  return tracking.some((t) => t === 'hit');
}

/**
 * Classify a shot at `cell` given the shooter's pre-shot `view` (§12.2):
 * optimal | good | weak | blunder. Firing at a cell that provably can't hold a
 * remaining ship (heat 0) is a blunder; a cell next to a fresh hit is optimal.
 */
export function classifyBattleshipShot(view: BattleshipView, cell: number): MoveQuality {
  const { trackingBoard, size, enemyShipsRemaining } = view;
  const heat = battleshipHeatMap(trackingBoard, size, enemyShipsRemaining);

  // Hunting: next to an unresolved hit is the textbook optimal follow-up.
  if (hasUnresolvedHit(trackingBoard)) {
    const nextToHit = orthogonalNeighbors(cell, size).some((n) => trackingBoard[n] === 'hit');
    if (nextToHit) return 'optimal';
    if (heat[cell] === 0) return 'blunder';
    return 'weak'; // shooting elsewhere while a hit is unresolved wastes tempo
  }

  const candidates: number[] = [];
  for (let c = 0; c < size * size; c++) {
    if (trackingBoard[c] === 'unknown') candidates.push(heat[c]);
  }
  if (candidates.length === 0) return 'optimal';

  const fired = heat[cell];
  if (fired === 0) return 'blunder';

  // Percentile: fraction of candidate cells with heat ≤ the fired cell's heat.
  const leq = candidates.filter((h) => h <= fired).length;
  const percentile = leq / candidates.length;

  if (percentile >= 0.85) return 'optimal';
  if (percentile >= 0.6) return 'good';
  if (percentile >= 0.3) return 'weak';
  return 'blunder';
}
