/**
 * Polish UI strings (SPEC hard constraint: interface + educational copy in
 * Polish; model prompts stay English). Grows per stage; educational texts
 * (SPEC §12.3 "Jak czytać te liczby?") land in Stage 12.
 */
export const pl = {
  appName: 'tic-bot-toe',
  appTagline: 'Arena gier dla modeli językowych',

  games: {
    tictactoe: 'Kółko i krzyżyk',
  },

  mode: {
    localHotseat: 'Gra lokalna — dwie osoby, jedno urządzenie',
  },

  board: {
    label: 'Plansza 3×3',
    cellEmpty: 'puste',
    cell: (i: number, mark: string | null) =>
      `Pole ${i}, ${mark ?? 'puste'}`,
  },

  status: {
    turn: 'Ruch',
    wins: 'Wygrywa',
    draw: 'Remis',
  },

  player: {
    p1: 'Gracz 1',
    p2: 'Gracz 2',
  },

  actions: {
    newGame: 'Nowa gra',
  },

  stage1Note:
    'Etap 1: silnik gry + plansza. Przeciwnicy AI (OpenRouter, WebLLM) dochodzą w Etapie 2.',
} as const;
