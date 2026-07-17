/**
 * Polish UI strings — and the SOURCE OF TRUTH for every other locale: `Dict`
 * (i18n/types.ts) is derived from this object, so any key added here is a build
 * error in `en.ts` until it is translated.
 *
 * Model prompts stay English regardless of the UI language (SPEC §5) — the only
 * exception is the AI commentator, whose OUTPUT is read by the user and so
 * follows the interface language (providers/commentator.ts).
 */
export const pl = {
  appName: 'tic-bot-toe',
  appTagline: 'Arena gier dla modeli językowych',

  header: {
    subtitle: 'LLM Game Arena · ucz się przez grę',
    key: 'klucz OpenRouter',
    keyLocal: '· lokalny',
    keyNone: '· brak',
  },

  lang: {
    label: 'Język',
    pl: 'Polski',
    en: 'English',
    switchTo: 'Zmień język',
  },

  arena: {
    kicker: 'Nowa partia',
    heading: 'Skonfiguruj pojedynek',
    lead: 'Wybierz grę, przeciwników i tryb. Po kilku partiach zobaczysz, czym różnią się modele — bez czytania benchmarków.',
  },

  /** Pasek „na żywo" na stronie głównej: partie w toku + spalone tokeny. */
  live: {
    kicker: 'Na żywo',
    heading: 'partie w toku',
    hvm: 'człowiek vs model',
    mvm: 'model vs model',
    none: 'Nikt teraz nie gra — rozpocznij pierwszą partię.',
    gamesPlayed: 'rozegranych partii',
    tokensBurned: 'tokenów spalonych na partie',
  },

  games: {
    tictactoe: 'Kółko i krzyżyk',
    battleship: 'Statki',
    sudoku: 'Sudoku Duel',
    scrabble: 'Słowna bitwa',
  },

  /** Sub-labels on the game-select tiles (screen 01). */
  gameMeta: {
    tictactoe: '3×3 · pełna informacja',
    battleship: '6×6 · 8×8 · 10×10 · ukryta info',
    sudoku: '4×4 · 6×6 · 9×9 · pojedynek dedukcji',
    scrabble: 'PL / EN · ukryta info · słownik',
  },

  /**
   * Keyed by the variant id from @arena/game-core. The engine carries a label of
   * its own, but it is Polish — a game engine has no business holding UI copy, so
   * the UI reads variant names from here instead (`variantLabel`).
   */
  variants: {
    standard: 'Klasyczne 3×3',
    small: 'Małe 6×6',
    medium: 'Średnie 8×8',
    classic: 'Klasyczne 10×10',
    mini: 'Mini 4×4',
    classic6: 'Klasyczne 6×6',
    classic9: 'Klasyczne 9×9',
    pl: 'Polski',
    en: 'Angielski',
  },

  /** Onboarding strip under the setup card — how to actually use the arena. */
  quickStart: {
    kicker: 'Jak zacząć',
    steps: [
      {
        title: 'Wybierz grę',
        desc: 'Kółko i krzyżyk (3×3, pełna informacja) albo Statki (6×6 – 10×10, ukryta informacja). Wariant ustawiasz obok.',
      },
      {
        title: 'Dodaj graczy',
        desc: 'Model z OpenRoutera na Twoim kluczu, model WebLLM lokalnie w przeglądarce (bez klucza) albo Ty jako człowiek.',
      },
      {
        title: 'Uruchom partię',
        desc: 'Plansza, log ruchów i oś czasu na żywo. Przy każdym ruchu widzisz czas, tokeny i koszt.',
      },
      {
        title: 'Czytaj wynik',
        desc: 'Precyzja ruchów, analiza z trenerem, a jeśli chcesz — zapis do rankingu Elo.',
      },
    ],
    watch: {
      title: 'Zobacz partię',
      lead: 'Nagranie prawdziwej rozgrywki dwóch darmowych modeli — bez montażu. Czerwone znaczniki „retry" i „wymuszony" w logu to nie błędy aplikacji: to modele, które nie utrzymały formatu odpowiedzi i musiały dostać ruch z automatu. Dokładnie takie różnice arena ma pokazywać.',
    },
    why: {
      title: 'Dlaczego to działa',
      points: [
        'Każdy ruch pokazuje czas, tokeny i koszt — widzisz „myślenie" modelu, nie tylko wynik.',
        'Solver ocenia każdy ruch (optymalny / słaby / błąd) — stąd bierze się Precyzja.',
        'Partia toczy się u Ciebie, ale wynik zapisany do rankingu serwer odtwarza i weryfikuje.',
      ],
    },
  },

  battleship: {
    yourFleet: 'Twoja flota',
    yourShots: 'Twoje strzały',
    fleetP1: 'Flota — Gracz 1',
    fleetP2: 'Flota — Gracz 2',
  },

  sudoku: {
    boardLabel: 'Plansza Sudoku',
    cell: (row: number, col: number, digit: number | null) =>
      `Wiersz ${row}, kolumna ${col}${digit === null ? ', puste' : `, cyfra ${digit}`}`,
    placeDigit: (d: number) => `Wpisz cyfrę ${d}`,
    movesLeft: 'Ruchów do końca',
    cancel: 'Anuluj',
  },

  scrabble: {
    boardLabel: 'Plansza słowna',
    rackLabel: 'Twój stojak',
    blankTile: 'blank',
    cell: (col: string, row: number, letter: string | null) =>
      `Pole ${col}${row}${letter ? `, litera ${letter}` : ''}`,
    across: 'W poziomie',
    down: 'W pionie',
    play: 'Zagraj słowo',
    pass: 'Pas',
    exchange: 'Wymień',
    exchangeHint: 'Wybierz płytki do wymiany',
    confirmExchange: 'Wymień wybrane',
    clear: 'Wyczyść',
    cancel: 'Anuluj',
    pickBlank: 'Wybierz literę dla blanku',
    bag: 'Worek',
    loadingTitle: 'Ładowanie słownika',
    loadingHint: 'Pobieram słownik do gry słownej (jednorazowo, potem z pamięci).',
    loadError: 'Nie udało się pobrać słownika. Sprawdź połączenie i spróbuj ponownie.',
    retry: 'Spróbuj ponownie',
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
    abortedStalled: 'Partia przerwana — za dużo błędnych ruchów',
    abortedBudget: 'Partia przerwana — limit tokenów',
  },

  control: {
    stop: 'PRZERWIJ',
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
    providerOllama: 'Ollama (serwer)',
    noModels: 'Brak modeli',
    loadingModels: 'Ładowanie katalogu…',
    modelP1: 'Model — Gracz 1',
    modelP2: 'Model — Gracz 2',
    start: 'Start',
    needKey: 'Najpierw dodaj klucz OpenRouter w ustawieniach.',
    needModel: 'Wybierz model dla każdego gracza LLM.',
    catalogError: 'Nie udało się pobrać katalogu modeli OpenRouter.',
  },

  /**
   * „Po co ten klucz i skąd go wziąć" — jeden tekst, dwa miejsca (ustawienia
   * + „Jak zacząć"), bo do klucza trafia się z obu stron.
   */
  keyHelp: {
    title: 'Po co ten klucz?',
    why: 'Modele z OpenRoutera grają na Twoim koncie — to Ty płacisz OpenRouterowi za zużyte tokeny. My nie pośredniczymy w rozliczeniach i nie widzimy Twojego klucza. Bez klucza też pogramy: modele WebLLM chodzą lokalnie w przeglądarce, za darmo, i wystarczą do pierwszej partii.',
    howTitle: 'Skąd go wziąć',
    steps: [
      'Załóż konto na openrouter.ai.',
      'Wejdź na openrouter.ai/keys i kliknij „Create key".',
    ],
    /** Ostatni krok zależy od tego, czy pole na klucz jest tuż obok. */
    lastStepHere:
      'Skopiuj klucz (zaczyna się od „sk-or-") i wklej go w polu powyżej. Przycisk „Testuj" od razu sprawdzi, czy działa.',
    lastStepSettings:
      'Skopiuj klucz (zaczyna się od „sk-or-") i wklej go w Ustawieniach (koło zębate w prawym górnym rogu). Przycisk „Testuj" od razu sprawdzi, czy działa.',
    cost:
      'Modele z dopiskiem „:free" (filtr „Tylko darmowe") nic nie kosztują — OpenRouter ogranicza za to liczbę zapytań na dobę. Za pozostałe płacisz z salda doładowanego na openrouter.ai/credits; koszt każdego ruchu i całej partii widzisz na bieżąco w telemetrii.',
    cta: 'Utwórz klucz na openrouter.ai',
    href: 'https://openrouter.ai/keys',
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
    showThoughts: 'Tok myślenia modelu',
    showThoughtsHint: 'Pokazuj ślad rozumowania modelu w grze i powtórkach.',
  },

  profile: {
    title: 'Profil gracza',
    anonymous: 'Grasz anonimowo',
    nicknameHint:
      'Bez pseudonimu Twoje partie nadal liczą się do jednego Elo, ale nie pojawiasz się w tabeli rankingu.',
    nicknameSaved: 'Pseudonim zapisany.',
    nicknameRemoved: 'Pseudonim usunięty.',
    nicknameTaken: 'Ten pseudonim jest już zajęty.',
    nicknameInvalid: '3–20 znaków: litery, cyfry, „_" lub „-".',
    nicknameProfanity: 'Ten pseudonim zawiera niedozwolone słowo.',
    saveError: 'Nie udało się zapisać pseudonimu.',
    flagged:
      'Twoje konto zostało oznaczone jako podejrzane i nie jest pokazywane w rankingu.',
    privacy:
      'Twoja tożsamość to losowy token w tej przeglądarce — dzięki niemu wszystkie Twoje partie liczą się do jednego Elo. Nie zbieramy żadnych danych osobowych. Wyczyszczenie danych strony = utrata tożsamości.',
    identity: 'Kod tożsamości',
    identityHint:
      'Przenieś ten kod na inne urządzenie, aby grać tam jako ta sama osoba. Traktuj go jak hasło — kto go ma, gra jako Ty.',
    copyIdentity: 'Skopiuj kod tożsamości',
    identityCopied: 'Skopiowano kod tożsamości.',
    copyFailed: 'Nie udało się skopiować kodu.',
    importIdentity: 'Przenieś tożsamość z innego urządzenia',
    importPlaceholder: 'Wklej kod tożsamości…',
    import: 'Przenieś',
    importInvalid: 'Nieprawidłowy kod tożsamości.',
    importConfirm:
      'Przeniesienie tożsamości porzuci tożsamość używaną w tej przeglądarce (jej partie zostaną w rankingu, ale stracisz do niej dostęp). Kontynuować?',
    imported: 'Tożsamość przeniesiona.',
  },

  thoughts: {
    title: 'Tok myślenia',
    waiting: 'Model myśli…',
    none: 'Ten ruch nie ma zapisanego toku myślenia.',
    show: 'Pokaż tok myślenia',
  },

  log: {
    title: 'Log partii',
    telemetry: 'telemetria',
    empty: 'Brak ruchów.',
    latency: 'czas',
    tokens: 'tokeny',
    cost: 'koszt',
    retry: 'retry',
    forfeit: 'wymuszony',
    // Krótka etykieta przyczyny wymuszonego ruchu (obok znacznika „wymuszony").
    reason: {
      rate_limited: 'limit',
      no_credits: 'brak środków',
      auth: 'klucz',
      unavailable: 'niedostępny',
      timeout: 'timeout',
      network: 'sieć',
      bad_output: 'zła odpowiedź',
    },
  },

  // Model nie zagrał realnego ruchu — nazwij powód, zamiast po cichu grać losowo.
  moveError: {
    // {name} = nazwa modelu. Sufiks wspólny dla wszystkich powodów.
    playingRandom: 'Ruchy tego modelu są teraz losowe.',
    rate_limited:
      '{name}: OpenRouter ogranicza zapytania (429). Darmowe modele są mocno limitowane — poczekaj chwilę albo wybierz model płatny.',
    no_credits:
      '{name}: brak środków na koncie OpenRouter (402). Klucz jest ważny, ale konto nie ma budżetu — doładuj je albo wybierz darmowy model.',
    auth: '{name}: OpenRouter odrzucił klucz przy tym modelu (401/403).',
    unavailable:
      '{name}: model niedostępny (404/5xx) — zły identyfikator albo awaria dostawcy. Wybierz inny model.',
    timeout: '{name}: model nie odpowiedział na czas.',
    network: '{name}: błąd sieci przy wywołaniu modelu (offline lub CORS).',
    bad_output: '{name}: model odpowiada, ale nie trzyma się formatu ruchu.',
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
    saveTooFast: 'Partia rozegrana zbyt szybko jak na człowieka — wynik nie trafił do rankingu.',
    saveDailyLimit: 'Dzienny limit partii rankingowych wyczerpany. Wróć jutro.',
    saveNoStart: 'Nie udało się potwierdzić startu partii — zagraj jeszcze raz.',
    analyze: 'Analiza z trenerem',
    closeAnalysis: 'Zamknij analizę',
    savedUnranked: 'Zapisano — ale poza rankingiem',
    unrankedNoRealMoves:
      'Model nie wykonał ani jednego realnego ruchu (limit zapytań albo awaria dostawcy) — wszystkie jego ruchy były wymuszone losowo. Taka partia nie liczy się do Elo.',
    unrankedLab: 'Partia z laboratorium promptów nie wpływa na Elo.',
  },

  analysis: {
    title: 'Powtórka z trenerem',
    intro: 'Każdy ruch oceniony solverem — zielony optymalny, żółty słaby, czerwony błąd.',
    precision: 'Precyzja',
    turningPoint: 'Moment zwrotny',
    turningPointDesc: 'pierwszy błąd w partii',
    noBlunder: 'Brak błędów — czysta partia.',
    goToTurningPoint: 'Skocz do momentu zwrotnego',
    step: 'Krok',
    start: 'Start',
    first: '⏮',
    prev: '◀',
    next: '▶',
    last: '⏭',
    moveList: 'Ruchy',
    quality: {
      optimal: 'optymalny',
      good: 'dobry',
      weak: 'słaby',
      blunder: 'błąd',
    },
  },

  modelCard: {
    kicker: 'Karta modelu',
    back: '← Wróć do rankingu',
    notRanked: 'Ten model nie ma jeszcze zapisanych partii w tym rankingu.',
    loadError: 'Nie udało się pobrać karty modelu.',
    whoIsIt: 'Kim jest ten model?',
    generatedNote:
      'Opis złożony automatycznie z metadanych katalogu (rozmiar, cena, kontekst) — regułami, nie modelem. Zawsze taki sam, zero kosztów.',
    noMeta: 'Brak metadanych w katalogu — oceń ten model po liczbach poniżej.',
    stats: 'Liczby',
    opponents: 'Bilans z przeciwnikami',
    opponentsEmpty: 'Brak rozegranych partii w tym rankingu.',
    col: { opponent: 'Przeciwnik', games: 'Partie', wld: 'W/P/R' },
    play: 'Zagraj przeciwko',
    hallucinations: 'Halucynacje',
    hallucinationsLead:
      'Jak często model gubił format i nie podawał legalnego ruchu. „Ruchy wymuszone" liczymy z całej historii; „czysto za 1. razem" tylko z partii zapisanych od wdrożenia rejestracji prób.',
    disciplineRank: (pos: number, total: number) =>
      `${pos}. miejsce z ${total} pod względem dyscypliny`,
    noDisciplineRank: 'Za mało danych, aby uszeregować dyscyplinę.',
    cleanFirstTry: 'Czysto za 1. razem',
    cleanFirstTrySince: (date: string) => `Liczone od ${date}`,
    recentFailures: 'Ostatnie wpadki',
    psychology: 'Psychologia',
    psychologyLead: 'Czy model ma nawyki? Rozkład decyzji ze wszystkich zapisanych partii.',
    // „Na podstawie" wymusza dopełniacz — „partii" jest poprawne dla każdego n.
    psychologySample: (n: number) => `Na podstawie ${n} partii`,
    psychologyEmpty: 'Za mało partii na wzorce — potrzeba co najmniej 10 w tym trybie.',
    psychFirstMove: 'Pierwszy ruch',
    psychAllMoves: 'Wszystkie ruchy',
    psychAllShots: 'Wszystkie strzały',
    psychFirstShot: 'Pierwszy strzał',
  },

  /**
   * „Jak czytać te liczby?" (SPEC §12.3) — stały, ręcznie napisany tekst
   * edukacyjny. Bez żargonu: to jest sedno produktu, nie wypełniacz.
   */
  explain: {
    title: 'Jak czytać te liczby?',
    lead: 'Krótki przewodnik po kolumnach rankingu i wykresach — po ludzku.',
    entries: [
      {
        q: 'Czym jest token?',
        a: 'Model nie czyta liter, tylko „tokeny" — kawałki tekstu, zwykle 3–4 znaki albo krótkie słowo. Płacisz za każdy token, który do modelu wyślesz (prompt) i za każdy, który on wygeneruje (odpowiedź). Dlatego w telemetrii widzisz dwie liczby: wejście + wyjście. Gdy dostawca nie zwróci zużycia, pokazujemy „—", a nie zero — brak danych to nie to samo co zero.',
      },
      {
        q: 'Elo — co właściwie znaczy?',
        a: 'System rankingowy z szachów. Każdy startuje z 1000. Wygrana z faworytem daje dużo punktów, wygrana ze słabszym — niewiele. Elo nie ma sensu samo w sobie: 1200 znaczy tylko tyle, że ten model regularnie ogrywa te z 1000. Liczy się wyłącznie z partii zapisanych do rankingu — partie z laboratorium promptów są z niego wykluczone.',
      },
      {
        q: 'Precyzja, czyli % ruchów optymalnych',
        a: 'W kółku i krzyżyk istnieje gra idealna — komputer potrafi policzyć ją do samego końca (minimax). Dlatego każdy ruch da się obiektywnie ocenić: „optymalny" znaczy dokładnie tyle, że nie pogorszył wyniku partii. 100% to gra bezbłędna. To najuczciwsza miara myślenia w całym rankingu, bo nie zależy od tego, na jakiego przeciwnika model trafił.',
      },
      {
        q: 'Czemu modele „halucynują" ruchy?',
        a: 'Model nie widzi planszy — dostaje ją jako tekst i przewiduje kolejny token. Nic go fizycznie nie powstrzymuje przed wskazaniem pola, które jest już zajęte albo w ogóle nie istnieje. Im mniejszy model, tym częściej mu się to zdarza, zwłaszcza gdy plansza się zapełnia i trzeba uważnie śledzić stan gry.',
      },
      {
        q: 'Poprawki i ruch wymuszony',
        a: 'Gdy model poda nielegalny ruch, dostaje komunikat z listą dozwolonych ruchów i próbuje jeszcze raz — to „poprawka". Po trzech nieudanych próbach wybieramy za niego losowy legalny ruch i oznaczamy go jako „wymuszony". Wysoki odsetek wymuszonych to nie pech, tylko brak dyscypliny w trzymaniu się formatu odpowiedzi.',
      },
      {
        q: 'Czemu mały model bywa lepszy od wielkiego?',
        a: 'Do prostego zadania większy model nie zawsze pomaga. Kółko i krzyżyk ma dziewięć pól — nie trzeba tu erudycji, tylko konsekwencji. Mały model odpowiada w ułamku sekundy i kosztuje grosze, a jeśli tylko trzyma format, potrafi siedzieć w rankingu tuż za gigantami. Dlatego warto patrzeć na wykres „koszt vs skuteczność": drożej nie znaczy lepiej.',
      },
      {
        q: 'Koszt partii',
        a: 'Liczony ze snapshotu cennika z chwili rozegrania partii: (tokeny wejścia × cena wejścia) + (tokeny wyjścia × cena wyjścia). Dzięki temu późniejsza zmiana cennika nie przepisuje historii. Modele darmowe i WebLLM kosztują dokładnie zero.',
      },
      {
        q: 'Skąd te wyniki i na ile można im ufać?',
        a: 'Partie toczą się w Twojej przeglądarce, więc pełnej gwarancji uczciwości nie ma. Serwer broni się jak potrafi: odtwarza każdą partię własnym silnikiem, sam liczy oceny ruchów, odrzuca ruchy nielegalne, duplikaty i podejrzanie szybkie odpowiedzi. Partie rozegrane przez Ollamę na naszym serwerze są oznaczone jako „zweryfikowane serwerowo".',
      },
    ],
  },

  daily: {
    kicker: 'Wyzwanie dnia',
    /** „Pokonaj dziś Llama 3.2 3B w statki 8×8" */
    headline: (model: string, game: string) => `Pokonaj dziś ${model} w ${game}`,
    play: 'Podejmij wyzwanie',
    done: 'Wyzwanie zaliczone!',
    doneToday: 'Dzisiejsze wyzwanie zaliczone. Wróć jutro po kolejne.',
    streak: 'Seria',
    streakDays: (n: number) => (n === 1 ? '1 dzień' : `${n} dni`),
    streakNone: 'Brak serii — zacznij dziś.',
    claiming: 'Zgłaszanie wyniku…',
    claimed: 'Zaliczone! Seria: ',
    claimError: 'Nie udało się zgłosić wyniku wyzwania.',
    needKey: 'Dzisiejszy przeciwnik działa przez OpenRouter — dodaj klucz w ustawieniach.',
    needWebGpu:
      'Dzisiejszy przeciwnik działa w przeglądarce (WebGPU), a Twoja przeglądarka go nie obsługuje.',
    opponentRetired:
      'Dzisiejszy przeciwnik zniknął z katalogu OpenRoutera — wyzwania nie da się dziś rozegrać uczciwie. Wróć jutro po nowego przeciwnika.',
    loadError: 'Nie udało się pobrać wyzwania dnia.',
    lostHint: 'Tym razem nie wyszło — spróbuj jeszcze raz, wyzwanie jest ważne do końca dnia.',
    free: 'zawsze darmowy przeciwnik',
  },

  prediction: {
    kicker: 'Zgadywanka widza',
    question: 'Kto wygra tę partię?',
    lead: 'Obstaw przed pierwszym ruchem. Zero stawek — tylko punkty intuicji.',
    draw: 'Remis',
    skip: 'Pomiń i zagraj',
    locked: 'Twój typ',
    hit: 'Trafione! +1 punkt intuicji.',
    miss: 'Nietrafione.',
    saveHint: 'Zapisz partię do rankingu, aby zaliczyć typ.',
    error: 'Nie udało się zapisać typu.',
    alreadyPredicted: 'Ta partia była już obstawiona.',
  },

  intuition: {
    title: 'Ranking intuicji',
    lead: 'Kto najlepiej przewiduje, który model wygra. Punkt za każdy trafiony typ.',
    empty: 'Brak typów — obstaw wynik partii model kontra model.',
    loadError: 'Nie udało się pobrać rankingu intuicji.',
    needNickname:
      'Pojawiasz się w tym rankingu dopiero po ustawieniu pseudonimu w ustawieniach.',
    col: { rank: '#', player: 'Gracz', points: 'Punkty', total: 'Typy', accuracy: 'Skuteczność' },
  },

  commentator: {
    section: 'Komentator AI',
    toggle: 'Komentator AI',
    lead: 'Trzeci model komentuje partię prostym językiem — tłumaczy, dlaczego ruch był dobry albo fatalny. Domyślnie wyłączony.',
    model: 'Model komentatora',
    costHint:
      'Komentator działa na Twoim kluczu / WebLLM — wybierz tani albo darmowy model (filtr „Tylko darmowe"). Komentuje wybrane ruchy, nie każdy, i nigdy nie spowalnia gry.',
    badge: 'Komentator',
    /** Wybór źródła trenera: własny model gracza vs fundowany trener serwerowy. */
    sourceLabel: 'Kto komentuje',
    sourceOwn: 'Mój model',
    sourceServer: 'Trener (wbudowany)',
    serverName: 'Trener AI',
    serverHint:
      'Wbudowany trener — bez klucza i bez kosztu po Twojej stronie; działa na serwerze aplikacji, więc żaden sekret nie trafia do przeglądarki. Ma limit uczciwego użycia (kilka partii na godzinę). Chcesz komentarza bez limitu i na dowolnym modelu? Wybierz „Mój model" i zagraj na własnym kluczu oraz providerze.',
    /** Toast, gdy fundowany trener wyczerpie limit — jednorazowa zachęta do BYOK. */
    serverLimited:
      'Wbudowany trener wyczerpał limit na tę godzinę. Przełącz na „Mój model", aby komentować bez limitu na własnym kluczu.',
  },

  lab: {
    badge: 'Lab',
    section: 'Laboratorium promptów',
    toggle: 'Tryb laboratorium',
    lead: 'Dopisz własną instrukcję do modelu i pokręć losowością. Partie z laboratorium nie liczą się do rankingu — inaczej porównania straciłyby sens.',
    appendix: 'Dopisek do promptu',
    appendixPlaceholder: 'np. Graj agresywnie i zawsze zaczynaj od rogu.',
    appendixHint:
      'Doklejane PO stałym rdzeniu promptu — format odpowiedzi zostaje nienaruszony.',
    temperature: 'Losowość (temperature)',
    temperatureHint:
      '0 = zawsze ten sam, „bezpieczny" ruch; wyżej = więcej kreatywności i błędów.',
    excludedNote: 'Ta partia jest oznaczona jako laboratoryjna i nie wpłynie na Elo.',
  },

  reasoning: {
    badge: 'Rozumowanie',
    section: 'Tryb rozumowania',
    toggle: 'Tryb rozumowania',
    lead: 'Domyślnie modele odpowiadają jednym słowem, bez namysłu — to je osłabia. Włącz, by dać im chwilę na przemyślenie ruchu (wygrać / zablokować / środek) i większy limit tokenów. Grają wtedy dużo mocniej.',
    excludedNote: 'Rozumowanie zmienia siłę gry, więc te partie nie liczą się do rankingu — ranking bez rozumowania zostaje nietknięty.',
  },

  safety: {
    section: 'Auto-przerwanie',
    toggle: 'Auto-przerwanie',
    lead: 'Gdy modele nie potrafią zwrócić poprawnego ruchu, partia zamienia się w serię wymuszonych, losowych ruchów, które palą tokeny bez sensu. Ten strażnik ubija taką partię automatycznie.',
    forfeits: 'Wymuszone ruchy z rzędu',
    forfeitsHint: 'Ubij partię po tylu wymuszonych ruchach pod rząd. 0 = wyłączone.',
    tokens: 'Limit tokenów na partię',
    tokensHint: 'Ubij partię, gdy łączne tokeny przekroczą tę wartość. 0 = bez limitu.',
    off: 'wył.',
  },

  nav: {
    arena: 'Arena',
    rankings: 'Rankingi',
    compare: 'Porównaj',
    models: 'Modele',
    intuition: 'Intuicja',
    failures: 'Wpadki',
  },

  museum: {
    kicker: 'Muzeum wpadek',
    title: 'Muzeum wpadek',
    lead: 'Nielegalne i niezrozumiałe ruchy, które modele próbowały zagrać — prosto z zapisanych partii. „Halucynacja" znaczy tu potocznie: ruch niezgodny z zasadami albo zmyślone słowo, nie halucynacja w sensie akademickim.',
    filterAll: 'Wszystkie',
    empty: 'Brak wpadek do pokazania — modele grają wyjątkowo czysto (albo za mało partii).',
    inventedWords: 'Słowa, które nie istnieją',
    attempted: 'Próbował zagrać',
    said: 'Odpowiedział',
    reason: 'Powód',
    replay: 'Zobacz partię',
    kindIllegal: 'nielegalny ruch',
    kindUnparseable: 'nie do odczytania',
    loadError: 'Nie udało się pobrać muzeum.',
  },

  replay: {
    kicker: 'Powtórka',
    loading: 'Ładowanie powtórki…',
    notFound: 'Nie znaleziono tej partii.',
    loadError: 'Nie udało się pobrać powtórki.',
    play: 'Odtwórz',
    pause: 'Pauza',
    copyLink: 'Skopiuj link',
    copied: 'Skopiowano link do powtórki',
    serverVerified: 'zweryfikowana serwerowo',
    lab: 'laboratorium',
    result: 'Wynik',
    draw: 'remis',
    wins: 'wygrywa',
    openArena: 'Zagraj własną partię',
  },

  charts: {
    exportPng: 'Eksportuj PNG',
    empty: 'Za mało danych — rozegraj partie.',
    timeline: {
      title: 'Oś czasu partii',
      takeaway: 'dłuższy słupek = model dłużej „myślał".',
      seconds: 's',
      move: 'Ruch',
      tokens: 'tokenów',
      retries: 'poprawki',
      forfeit: 'wymuszony',
    },
    radar: {
      title: 'Profil modelu',
      takeaway:
        'osie znormalizowane 0–100 względem populacji rankingu — im dalej od środka, tym lepiej.',
      axes: {
        strength: 'Siła',
        speed: 'Szybkość',
        discipline: 'Dyscyplina',
        economy: 'Oszczędność',
        cheapness: 'Taniość',
      },
    },
    scatter: {
      title: 'Koszt vs skuteczność',
      takeaway: 'drożej nie zawsze znaczy lepiej — tanie modele bywają blisko czołówki.',
      x: 'koszt / partię (log)',
      y: 'Elo',
      games: 'partie',
    },
    elo: {
      title: 'Przebieg Elo',
      takeaway: 'linia po każdej zapisanej partii — trend siły w czasie.',
      start: 'start',
    },
    compare: {
      title: 'Porównaj modele',
      lead: 'Wybierz dwa podmioty — radar nałożony + bilans wspólnych partii.',
      pickA: 'Model A',
      pickB: 'Model B',
      pickPrompt: 'Wybierz…',
      h2h: 'Bilans bezpośredni',
      games: 'Wspólne partie',
      wins: 'wygrane',
      draws: 'remisy',
      noShared: 'Brak wspólnych partii w tym rankingu.',
      sameModel: 'Wybierz dwa różne modele.',
    },
    tooltip: {
      elo: 'Elo',
      cost: 'Koszt/partię',
      games: 'Partie',
    },
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
    rowHint: 'Kliknij wiersz, aby zobaczyć radar i przebieg Elo.',
    subjectModels: 'Modele',
    subjectHumans: 'Ludzie',
    humansEmpty: 'Nikt jeszcze nie ustawił pseudonimu — zagraj i nadaj sobie pseudonim.',
    humansNote:
      'Wyniki pochodzą ze środowiska klienckiego. Ranking ludzi chronimy warstwowo: weryfikacja Turnstile, serwerowe odtworzenie partii, kontrola tempa gry i limity dzienne.',
    col: {
      rank: '#',
      subject: 'Podmiot',
      player: 'Gracz',
      elo: 'Elo',
      games: 'Partie',
      wld: 'W/P/R',
      forfeit: 'Wymuszone',
      latency: 'Śr. czas',
      cost: 'Koszt/partię',
      precision: 'Precyzja',
    },
    forfeitTip:
      'Odsetek ruchów, w których model przez 4 próby nie podał legalnego ruchu i wstawiliśmy losowy („poddanie"). To potoczna „halucynacja" ruchu — im niżej, tym większa dyscyplina. Liczone z całej historii (wymuszone / wszystkie ruchy).',
  },

  actions: {
    newGame: 'Nowa gra',
    settings: 'Ustawienia',
  },

  modelLoad: {
    downloading: 'Pobieranie modelu do przeglądarki…',
  },

  /** Honest footer: what runs where, and where the numbers come from. */
  footerNote:
    'Modele grają przez OpenRouter (Twój klucz, wysyłany wyłącznie do openrouter.ai), WebLLM (lokalnie w przeglądarce, bez klucza) albo Ollamę. Partie toczą się u Ciebie, więc wyniki zapisane do rankingu serwer odtwarza i weryfikuje po swojej stronie.',
} as const;
