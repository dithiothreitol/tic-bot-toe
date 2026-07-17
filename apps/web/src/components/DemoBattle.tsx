import { useMemo, useState } from 'react';

import { type TicTacToeCell, type TicTacToeState, getGame } from '@arena/game-core';

import { reportFinish } from '@/api/live';
import { Board3x3 } from '@/components/Board3x3';
import { GameLog } from '@/components/GameLog';
import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { type MatchOutcome, type MoveLogEntry, runMatch } from '@/game/orchestrator';
import { useT } from '@/i18n';
import { useModelLoad } from '@/store/model-load';
import { useSetupPrefs } from '@/store/setup';
import {
  createWebLlmPlayer,
  isWebGpuAvailable,
  smallestWebLlmModel,
} from '@/providers/webllm';

type Phase = 'idle' | 'loading' | 'playing' | 'done' | 'error';

const EMPTY_BOARD: TicTacToeCell[] = Array(9).fill(null);

/**
 * „Dwa AI zagrają ze sobą w Twojej przeglądarce" (Module E, plan §7, D9). One
 * small WebLLM model plays itself at two temperatures (cautious vs reckless) — no
 * key, no cloud, offline. Gated hard on WebGPU and behind an explicit click that
 * names the download size (weights are ~2 GB). The match is never saved (no
 * Turnstile flow); it only bumps the live counter like any finished game.
 */
export function DemoBattle() {
  const t = useT();
  const patch = useSetupPrefs((s) => s.patch);
  const model = useMemo(() => smallestWebLlmModel(), []);
  const webgpu = useMemo(() => isWebGpuAvailable(), []);

  const [phase, setPhase] = useState<Phase>('idle');
  const [log, setLog] = useState<MoveLogEntry[]>([]);
  const [board, setBoard] = useState<TicTacToeCell[]>(EMPTY_BOARD);
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);

  const loadProgress = useModelLoad((s) => s.progress);
  const loadActive = useModelLoad((s) => s.active);

  const names = { p1: t.demo.cautious, p2: t.demo.bold };
  const sizeGb = (model.downloadMb / 1024).toFixed(1);

  const run = async () => {
    setPhase('loading');
    setLog([]);
    setBoard(EMPTY_BOARD);
    setOutcome(null);
    const id = crypto.randomUUID();
    try {
      // ONE engine, both sides: same mlcId → shared cached engine (no double
      // download, no two models in VRAM at once — D9). Temperatures diverge so
      // the two "personalities" actually play differently.
      const p1 = createWebLlmPlayer(model.mlcId, names.p1, { temperature: 0.2 });
      const p2 = createWebLlmPlayer(model.mlcId, names.p2, { temperature: 0.9 });
      const result = await runMatch({
        mode: 'model_vs_model',
        game: 'tictactoe',
        variant: getGame('tictactoe').variants[0]!,
        players: { p1, p2 },
        onMove: (entry, snap) => {
          setPhase('playing');
          setBoard((snap.state as TicTacToeState).board);
          setLog((prev) => [...prev, entry]);
        },
        // Tic-tac-toe can't exceed 9 moves, but keep the fuses on as a matter of course.
        safetyMaxMoves: 12,
        maxConsecutiveForfeits: 4,
        maxTokens: 40_000,
      });
      // The final onMove already set the board to the terminal position.
      setOutcome(result);
      setPhase('done');

      const tokens = result.moves.reduce(
        (s, m) => s + (m.telemetry.promptTokens ?? 0) + (m.telemetry.completionTokens ?? 0),
        0,
      );
      reportFinish(id, 'model_vs_model', 'tictactoe', tokens);
    } catch {
      setPhase('error');
    }
  };

  const playYourself = () => {
    // Preselect this WebLLM model as the opponent and jump to the setup card.
    patch({
      game: 'tictactoe',
      variantId: 'standard',
      mode: 'human_vs_model',
      p1ModelId: null,
      p2ModelId: model.mlcId,
    });
    document.getElementById('arena-setup')?.scrollIntoView({ behavior: 'smooth' });
  };

  const lastMove = log.length ? (log[log.length - 1]!.move as number) : null;

  return (
    <HudPanel brackets accent="edu" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <SectionLabel className="text-edu">{t.demo.kicker}</SectionLabel>
        <h2 className="font-sans text-xl font-bold text-edu text-glow-edu">{t.demo.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t.demo.lead}</p>
      </div>

      {!webgpu ? (
        <p className="font-mono text-xs text-warn">{t.demo.noWebgpu}</p>
      ) : phase === 'idle' ? (
        <div className="flex flex-col items-start gap-2">
          <Button onClick={run} className="border border-edu/50 bg-edu/10 text-edu hover:bg-edu/20">
            {t.demo.start(sizeGb)}
          </Button>
          <p className="font-mono text-[10px] text-dim">{t.demo.note}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Two personalities of the SAME model. */}
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            <span className="text-p1">
              {names.p1} <span className="text-dim">· {t.demo.cautiousTag}</span>
            </span>
            <span className="text-p2">
              {names.p2} <span className="text-dim">· {t.demo.boldTag}</span>
            </span>
          </div>

          {phase === 'loading' && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs text-muted-foreground">{t.demo.downloading}</p>
              {loadActive && (
                <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-edu transition-all"
                    style={{ width: `${Math.round(loadProgress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {phase !== 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Board3x3 board={board} lastMove={lastMove} />
              {phase === 'playing' && (
                <p className="font-mono text-xs text-dim">{t.demo.playing}</p>
              )}
              {phase === 'done' && outcome && (
                <p className="font-sans text-lg font-bold text-edu">
                  {outcome.winner === 'draw' || outcome.winner === null
                    ? t.demo.resultDraw
                    : t.demo.resultWin(outcome.winner === 'p1' ? names.p1 : names.p2)}
                </p>
              )}
              {log.length > 0 && <GameLog moves={log} names={names} className="w-full max-w-md" />}
            </div>
          )}

          {phase === 'error' && <p className="font-mono text-xs text-danger">{t.demo.error}</p>}

          {(phase === 'done' || phase === 'error') && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={run} variant="outline" size="sm">
                {t.demo.again}
              </Button>
              <Button onClick={playYourself} size="sm">
                {t.demo.playYourself}
              </Button>
            </div>
          )}
        </div>
      )}
    </HudPanel>
  );
}
