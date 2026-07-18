import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import {
  type BattleshipState,
  type PlayerSide,
  type TicTacToeState,
  battleship,
} from '@arena/game-core';

import {
  type TuringDetective,
  type TuringNext,
  type TuringReveal,
  fetchTuringLeaderboard,
  fetchTuringNext,
  submitTuringGuess,
} from '@/api/turing';
import { BattleshipBoard } from '@/components/BattleshipBoard';
import { Board3x3 } from '@/components/Board3x3';
import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useLocalePath, useT } from '@/i18n';
import { reconstructStates } from '@/lib/match-states';
import { cn } from '@/lib/utils';

type Label = 'A' | 'B';
type Status = 'loading' | 'ok' | 'empty' | 'error';

const STREAK_KEY = 'turing-streak';
const BEST_KEY = 'turing-best';

function readNum(key: string): number {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Turing mode — „Kto jest botem?" (Module D, plan §6). The human is systematically
 * `p1` in stored matches (the UI always seats a person as player one), so which
 * real side maps to the displayed „A"/„B" is randomised per puzzle — otherwise
 * „always pick A" would win. The board colours follow that mapping, so A/B stay
 * linked to the pieces on the board.
 */
export function TuringPage() {
  const t = useT();
  const path = useLocalePath();

  const [status, setStatus] = useState<Status>('loading');
  const [next, setNext] = useState<TuringNext | null>(null);
  const [swap, setSwap] = useState(false);
  const [step, setStep] = useState(0);
  const [reveal, setReveal] = useState<TuringReveal | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [board, setBoard] = useState<TuringDetective[]>([]);

  useEffect(() => {
    setStreak(readNum(STREAK_KEY));
    setBest(readNum(BEST_KEY));
  }, []);

  const load = useCallback(() => {
    setStatus('loading');
    setReveal(null);
    setStep(0);
    // A fresh coin-flip for the A/B↔p1/p2 mapping on every puzzle.
    setSwap(Math.random() < 0.5);
    fetchTuringNext()
      .then((n) => {
        setNext(n);
        setStatus(n ? 'ok' : 'empty');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    load();
    fetchTuringLeaderboard()
      .then(setBoard)
      .catch(() => setBoard([]));
  }, [load]);

  // A/B ⇄ p1/p2 mapping (and back), plus the side's colour accent.
  const sideOfLabel = (label: Label): PlayerSide =>
    label === 'A' ? (swap ? 'p2' : 'p1') : swap ? 'p1' : 'p2';
  const labelOfSide = (side: PlayerSide): Label =>
    side === 'p1' ? (swap ? 'B' : 'A') : swap ? 'A' : 'B';
  const accentOfLabel = (label: Label): 'p1' | 'p2' => (sideOfLabel(label) === 'p1' ? 'p1' : 'p2');

  const puzzle = next?.puzzle ?? null;
  const moves = useMemo(() => puzzle?.moves ?? [], [puzzle]);
  const states = useMemo(
    () =>
      puzzle
        ? reconstructStates(puzzle.game, puzzle.variant, puzzle.setup, moves)
        : [],
    [puzzle, moves],
  );

  const clamp = (n: number) => Math.max(0, Math.min(moves.length, n));

  const onGuess = async (label: Label) => {
    if (!next || reveal) return;
    try {
      const r = await submitTuringGuess(next.puzzleToken, sideOfLabel(label));
      setReveal(r);
      const nextStreak = r.correct ? streak + 1 : 0;
      setStreak(nextStreak);
      localStorage.setItem(STREAK_KEY, String(nextStreak));
      if (nextStreak > best) {
        setBest(nextStreak);
        localStorage.setItem(BEST_KEY, String(nextStreak));
      }
    } catch {
      toast.error(t.turing.loadError);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <SectionLabel>{t.turing.kicker}</SectionLabel>
        <h1 className="font-sans text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          {t.turing.title}
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t.turing.lead}</p>
        <div className="flex gap-4 font-mono text-xs text-dim">
          <span className="text-edu">{t.turing.streak(streak)}</span>
          <span>{t.turing.bestStreak(best)}</span>
        </div>
      </header>

      {status === 'loading' && (
        <p className="py-16 text-center font-mono text-sm text-dim">{t.turing.loading}</p>
      )}
      {status === 'error' && (
        <p className="py-16 text-center font-mono text-sm text-danger">{t.turing.loadError}</p>
      )}
      {status === 'empty' && (
        <HudPanel className="p-8">
          <p className="text-center text-sm text-muted-foreground">{t.turing.empty}</p>
        </HudPanel>
      )}

      {status === 'ok' && puzzle && (
        <>
          <HudPanel brackets className="flex flex-col items-center gap-4 p-5">
            {puzzle.game === 'tictactoe' ? (
              <Board3x3
                board={(states[step] as TicTacToeState).board}
                lastMove={step > 0 ? (moves[step - 1]!.move as number) : null}
              />
            ) : puzzle.game === 'battleship' ? (
              <BattleshipGuessView
                state={states[step] as BattleshipState}
                labelOfSide={labelOfSide}
                aLabel={t.turing.playerA}
                bLabel={t.turing.playerB}
              />
            ) : null}

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(0)} disabled={step === 0}>
                {t.analysis.first}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(clamp(step - 1))}
                disabled={step === 0}
              >
                {t.analysis.prev}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(clamp(step + 1))}
                disabled={step === moves.length}
              >
                {t.analysis.next}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(moves.length)}
                disabled={step === moves.length}
              >
                {t.analysis.last}
              </Button>
              <span className="min-w-16 text-center font-mono text-xs text-dim">
                {step}/{moves.length}
              </span>
            </div>
          </HudPanel>

          {/* Guess / reveal */}
          {reveal ? (
            <HudPanel
              brackets
              accent={reveal.correct ? 'edu' : 'p2'}
              className="flex flex-col items-center gap-3 p-6"
            >
              <span
                className={cn(
                  'font-sans text-2xl font-bold uppercase',
                  reveal.correct ? 'text-edu text-glow-edu' : 'text-p2',
                )}
              >
                {reveal.correct ? t.turing.correct : t.turing.wrong}
              </span>
              <p className="font-mono text-sm">
                {t.turing.revealWasHuman(
                  labelOfSide(reveal.humanSide) === 'A' ? t.turing.playerA : t.turing.playerB,
                )}
              </p>
              <p className="font-mono text-xs text-dim">{t.turing.revealModel(reveal.modelId)}</p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <Link to={path('replay', reveal.matchId)}>
                  <Button variant="outline" size="sm">
                    {t.turing.viewReplay}
                  </Button>
                </Link>
                <Button size="sm" onClick={load}>
                  {t.turing.next}
                </Button>
              </div>
            </HudPanel>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="font-mono text-sm uppercase tracking-wider text-dim">
                {t.turing.question}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {(['A', 'B'] as const).map((label) => (
                  <Button
                    key={label}
                    onClick={() => onGuess(label)}
                    className={cn(
                      'min-w-44 border font-bold',
                      accentOfLabel(label) === 'p1'
                        ? 'border-p1/50 bg-p1/10 text-p1 hover:bg-p1/20'
                        : 'border-p2/50 bg-p2/10 text-p2 hover:bg-p2/20',
                    )}
                    variant="outline"
                  >
                    {t.turing.guessHuman(label === 'A' ? t.turing.playerA : t.turing.playerB)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center font-mono text-[10px] text-dim">{t.turing.nicknameNote}</p>
        </>
      )}

      {/* Detective ranking */}
      <HudPanel className="flex flex-col gap-3 p-5">
        <SectionLabel>{t.turing.leaderboard}</SectionLabel>
        {board.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.turing.leaderboardEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-dim">
                  <th className="py-1 text-left font-normal uppercase tracking-wider">
                    {t.turing.colDetective}
                  </th>
                  <th className="py-1 text-right font-normal uppercase tracking-wider">
                    {t.turing.colAccuracy}
                  </th>
                  <th className="py-1 text-right font-normal uppercase tracking-wider">
                    {t.turing.colGuesses}
                  </th>
                </tr>
              </thead>
              <tbody>
                {board.map((d, i) => (
                  <tr key={`${d.nickname}-${i}`} className="border-t border-border">
                    <td className="py-1.5 font-sans">{d.nickname}</td>
                    <td className="py-1.5 text-right text-edu">{Math.round(d.accuracy * 100)}%</td>
                    <td className="py-1.5 text-right text-muted-foreground">{d.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HudPanel>
    </div>
  );
}

/**
 * Both fleets, god-view, labelled A/B per the puzzle's random mapping (never
 * p1/p2 — the side identity is the answer). Colour follows the mapped side so the
 * label lines up with the guess buttons.
 */
function BattleshipGuessView({
  state,
  labelOfSide,
  aLabel,
  bLabel,
}: {
  state: BattleshipState;
  labelOfSide: (side: PlayerSide) => Label;
  aLabel: string;
  bLabel: string;
}) {
  const v1 = battleship.viewFor(state, 'p1');
  const v2 = battleship.viewFor(state, 'p2');
  const titleFor = (side: PlayerSide) => (labelOfSide(side) === 'A' ? aLabel : bLabel);
  return (
    <div className="flex flex-wrap justify-center gap-6">
      <BattleshipBoard
        size={state.size}
        variant="own"
        accent={labelOfSide('p1') === 'A' ? 'p1' : 'p2'}
        title={titleFor('p1')}
        cells={v1.ownBoard}
      />
      <BattleshipBoard
        size={state.size}
        variant="own"
        accent={labelOfSide('p2') === 'A' ? 'p1' : 'p2'}
        title={titleFor('p2')}
        cells={v2.ownBoard}
      />
    </div>
  );
}
