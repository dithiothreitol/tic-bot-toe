/**
 * Polish UI strings (SPEC hard constraint: interface + educational copy in
 * Polish; model prompts stay English). Grows per stage.
 */
export const pl = {
  appName: 'tic-bot-toe',
  appTagline: 'Arena gier dla modeli językowych',

  games: {
    tictactoe: 'Kółko i krzyżyk',
    battleship: 'Statki',
  },

  battleship: {
    yourFleet: 'Twoja flota',
    yourShots: 'Twoje strzały',
    fleetP1: 'Flota — Gracz 1',
    fleetP2: 'Flota — Gracz 2',
  },

  placement: {
    title: 'Rozstaw flotę',
    instruction:
      'Klikaj pola, aby stawiać statki. Statki nie mogą się stykać — także po skosie.',
    rotate: 'Obróć',
    random: 'Rozstaw losowo',
    clear: 'Wyczyść',
    ready: 'Gotowe',
    remaining: 'Do rozstawienia',
    nextShip: (len: number) => `Stawiasz statek długości ${len}`,
    allPlaced: 'Cała flota rozstawiona.',
  },

  mode: {
    label: 'Tryb',
    humanVsModel: 'Człowiek kontra model',
    modelVsModel: 'Model kontra model',
    localHotseat: 'Gra lokalna — dwie osoby, jedno urządzenie',
  },

  board: {
    label: 'Plansza 3×3',
    cellEmpty: 'puste',
    cell: (i: number, mark: string | null) => `Pole ${i}, ${mark ?? 'puste'}`,
  },

  status: {
    turn: 'Ruch',
    wins: 'Wygrywa',
    draw: 'Remis',
    thinking: 'myśli…',
    yourTurn: 'Twój ruch',
    aborted: 'Partia przerwana',
  },

  player: {
    p1: 'Gracz 1',
    p2: 'Gracz 2',
    human: 'Człowiek',
  },

  setup: {
    title: 'Nowa partia',
    game: 'Gra',
    variant: 'Wariant',
    chooseModel: 'Wybierz model',
    searchModel: 'Szukaj modelu…',
    onlyFree: 'Tylko darmowe',
    providerOpenRouter: 'OpenRouter',
    providerWebllm: 'WebLLM (w przeglądarce)',
    noModels: 'Brak modeli',
    loadingModels: 'Ładowanie katalogu…',
    modelP1: 'Model — Gracz 1',
    modelP2: 'Model — Gracz 2',
    start: 'Start',
    needKey: 'Najpierw dodaj klucz OpenRouter w ustawieniach.',
    needModel: 'Wybierz model dla każdego gracza LLM.',
    catalogError: 'Nie udało się pobrać katalogu modeli OpenRouter.',
  },

  settings: {
    title: 'Ustawienia',
    openRouterKey: 'Klucz OpenRouter',
    keyPlaceholder: 'sk-or-…',
    keyLocalOnly:
      'Klucz jest przechowywany wyłącznie w Twojej przeglądarce (localStorage) i wysyłany wyłącznie do openrouter.ai. Nigdy nie trafia na nasz serwer.',
    save: 'Zapisz',
    test: 'Testuj',
    remove: 'Usuń',
    keyValid: 'Klucz działa.',
    keyInvalid: 'Klucz nieprawidłowy lub brak połączenia.',
    keySaved: 'Klucz zapisany.',
    keyRemoved: 'Klucz usunięty.',
    nickname: 'Pseudonim (opcjonalnie)',
    nicknamePlaceholder: 'np. KrzyżykowyMistrz',
    sound: 'Dźwięki',
  },

  log: {
    title: 'Log partii',
    empty: 'Brak ruchów.',
    latency: 'czas',
    tokens: 'tokeny',
    cost: 'koszt',
    retry: 'retry',
    forfeit: 'wymuszony',
  },

  result: {
    title: 'Wynik',
    youWon: 'Wygrywasz!',
    youLost: 'Porażka',
    cost: 'Koszt partii',
    newGame: 'Nowa gra',
    rematch: 'Rewanż',
    backToSetup: 'Zmień ustawienia',
    save: 'Zapisz do rankingu',
    saving: 'Zapisywanie…',
    saved: 'Zapisano do rankingu',
    saveError: 'Nie udało się zapisać wyniku.',
  },

  nav: {
    arena: 'Arena',
    rankings: 'Rankingi',
  },

  session: {
    verifyTitle: 'Potwierdź, że nie jesteś botem',
    verifyDesc:
      'Weryfikacja Cloudflare Turnstile — wymagana, by zapisać wynik do rankingu.',
    verifyFailed: 'Weryfikacja nie powiodła się.',
    turnstileLoadFailed: 'Nie udało się załadować weryfikacji.',
  },

  leaderboard: {
    title: 'Rankingi',
    empty: 'Brak danych — rozegraj i zapisz partie.',
    loadError: 'Nie udało się pobrać rankingu.',
    col: {
      rank: '#',
      subject: 'Podmiot',
      elo: 'Elo',
      games: 'Partie',
      wld: 'W/P/R',
      forfeit: 'Wymuszone',
      latency: 'Śr. czas',
      cost: 'Koszt/partię',
    },
  },

  actions: {
    newGame: 'Nowa gra',
    settings: 'Ustawienia',
  },

  modelLoad: {
    downloading: 'Pobieranie modelu do przeglądarki…',
  },

  stage2Note:
    'Providery OpenRouter (klucz) / WebLLM (lokalnie, bez klucza) / Human. Rankingi, zapis wyników i moduły edukacyjne dochodzą w kolejnych etapach.',
} as const;
