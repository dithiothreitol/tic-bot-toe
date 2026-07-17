import type { Dict } from './types';

/**
 * English UI strings — the mirror of `pl.ts`, which stays the source of truth
 * (`Dict` is derived from it, so a missing key here is a build error).
 *
 * Translated for MEANING, not word-for-word: the educational copy is the product,
 * and a literal translation of Polish idiom reads like a machine wrote it.
 */
export const en: Dict = {
  appName: 'tic-bot-toe',
  appTagline: 'A game arena for language models',

  header: {
    subtitle: 'LLM Game Arena · learn by playing',
    key: 'OpenRouter key',
    keyLocal: '· local',
    keyNone: '· none',
  },

  lang: {
    label: 'Language',
    pl: 'Polski',
    en: 'English',
    switchTo: 'Switch language',
  },

  arena: {
    kicker: 'New match',
    heading: 'Set up the duel',
    lead: 'Pick a game, the opponents and a mode. After a few matches you will see how models actually differ — without reading a single benchmark.',
  },

  live: {
    kicker: 'Live',
    heading: 'matches in progress',
    hvm: 'human vs model',
    mvm: 'model vs model',
    none: 'Nobody is playing right now — start the first match.',
    gamesPlayed: 'games played',
    tokensBurned: 'tokens burned on matches',
  },

  games: {
    tictactoe: 'Tic-tac-toe',
    battleship: 'Battleship',
    sudoku: 'Sudoku Duel',
    scrabble: 'Word Battle',
  },

  gameMeta: {
    tictactoe: '3×3 · perfect information',
    battleship: '6×6 · 8×8 · 10×10 · hidden information',
    sudoku: '4×4 · 6×6 · 9×9 · deduction duel',
    scrabble: 'PL / EN · hidden info · dictionary',
  },

  /** Keyed by the variant id from @arena/game-core (whose own labels are Polish). */
  variants: {
    standard: 'Classic 3×3',
    small: 'Small 6×6',
    medium: 'Medium 8×8',
    classic: 'Classic 10×10',
    mini: 'Mini 4×4',
    classic6: 'Classic 6×6',
    classic9: 'Classic 9×9',
    pl: 'Polish',
    en: 'English',
  },

  quickStart: {
    kicker: 'How to start',
    steps: [
      {
        title: 'Pick a game',
        desc: 'Tic-tac-toe (3×3, perfect information) or Battleship (6×6 – 10×10, hidden information). The variant selector sits right next to it.',
      },
      {
        title: 'Add players',
        desc: 'An OpenRouter model on your own key, a WebLLM model running locally in your browser (no key needed), or you, as a human.',
      },
      {
        title: 'Run the match',
        desc: 'Board, move log and timeline, live. Every move shows its latency, tokens and cost.',
      },
      {
        title: 'Read the result',
        desc: 'Move precision, a coached replay, and — if you want — a save to the Elo ranking.',
      },
    ],
    watch: {
      title: 'Watch a match',
      lead: 'A recording of a real match between two free models — no editing. The red “retry” and “forced” markers in the log are not app bugs: they are models that failed to keep the answer format and had to be handed a move automatically. Showing exactly this kind of difference is what the arena is for.',
    },
    why: {
      title: 'Why this works',
      points: [
        'Every move shows latency, tokens and cost — you watch the model “think”, not just the final score.',
        'A solver grades every move (optimal / weak / blunder) — that is where Precision comes from.',
        'The match runs on your machine, but a result saved to the ranking is replayed and verified by the server.',
      ],
    },
  },

  battleship: {
    yourFleet: 'Your fleet',
    yourShots: 'Your shots',
    fleetP1: 'Fleet — Player 1',
    fleetP2: 'Fleet — Player 2',
  },

  sudoku: {
    boardLabel: 'Sudoku board',
    cell: (row: number, col: number, digit: number | null) =>
      `Row ${row}, column ${col}${digit === null ? ', empty' : `, digit ${digit}`}`,
    placeDigit: (d: number) => `Place digit ${d}`,
    movesLeft: 'Moves left',
    cancel: 'Cancel',
  },

  scrabble: {
    boardLabel: 'Word board',
    rackLabel: 'Your rack',
    blankTile: 'blank',
    cell: (col: string, row: number, letter: string | null) =>
      `Square ${col}${row}${letter ? `, letter ${letter}` : ''}`,
    across: 'Across',
    down: 'Down',
    play: 'Play word',
    pass: 'Pass',
    exchange: 'Exchange',
    exchangeHint: 'Pick tiles to exchange',
    confirmExchange: 'Exchange selected',
    clear: 'Clear',
    cancel: 'Cancel',
    pickBlank: 'Pick a letter for the blank',
    bag: 'Bag',
    loadingTitle: 'Loading dictionary',
    loadingHint: 'Fetching the word-game dictionary (once — then served from cache).',
    loadError: 'Could not load the dictionary. Check your connection and try again.',
    retry: 'Try again',
  },

  placement: {
    title: 'Place your fleet',
    instruction:
      'Click the cells to place your ships. Ships may not touch each other — not even diagonally.',
    rotate: 'Rotate',
    random: 'Place randomly',
    clear: 'Clear',
    ready: 'Ready',
    remaining: 'Left to place',
    nextShip: (len: number) => `Placing a ship of length ${len}`,
    allPlaced: 'The whole fleet is placed.',
  },

  mode: {
    label: 'Mode',
    humanVsModel: 'Human vs model',
    modelVsModel: 'Model vs model',
    localHotseat: 'Local game — two people, one device',
  },

  board: {
    label: '3×3 board',
    cellEmpty: 'empty',
    cell: (i: number, mark: string | null) => `Cell ${i}, ${mark ?? 'empty'}`,
  },

  status: {
    turn: 'Turn',
    wins: 'Wins',
    draw: 'Draw',
    thinking: 'thinking…',
    yourTurn: 'Your turn',
    aborted: 'Match aborted',
    abortedStalled: 'Match aborted — too many bad moves',
    abortedBudget: 'Match aborted — token limit reached',
  },

  control: {
    stop: 'STOP',
  },

  player: {
    p1: 'Player 1',
    p2: 'Player 2',
    human: 'Human',
  },

  setup: {
    title: 'New match',
    game: 'Game',
    variant: 'Variant',
    chooseModel: 'Choose a model',
    searchModel: 'Search models…',
    onlyFree: 'Free only',
    providerOpenRouter: 'OpenRouter',
    providerWebllm: 'WebLLM (in browser)',
    providerOllama: 'Ollama (server)',
    noModels: 'No models',
    loadingModels: 'Loading the catalog…',
    modelP1: 'Model — Player 1',
    modelP2: 'Model — Player 2',
    start: 'Start',
    needKey: 'Add an OpenRouter key in settings first.',
    needModel: 'Pick a model for every LLM player.',
    catalogError: 'Could not fetch the OpenRouter model catalog.',
  },

  keyHelp: {
    title: 'Why a key?',
    why: 'OpenRouter models play on your account — you pay OpenRouter for the tokens they burn. We are not in the billing path and we never see your key. You can also play without one: WebLLM models run locally in your browser, for free, and are enough for a first match.',
    howTitle: 'Where to get it',
    steps: [
      'Create an account at openrouter.ai.',
      'Go to openrouter.ai/keys and click “Create key”.',
    ],
    lastStepHere:
      'Copy the key (it starts with “sk-or-”) and paste it in the field above. The “Test” button checks it right away.',
    lastStepSettings:
      'Copy the key (it starts with “sk-or-”) and paste it into Settings (the gear in the top-right corner). The “Test” button checks it right away.',
    cost:
      'Models tagged “:free” (the “Free only” filter) cost nothing — OpenRouter caps how many requests you may send per day instead. For the rest you pay from the balance you top up at openrouter.ai/credits; the cost of every move and of the whole match is in the telemetry as you play.',
    cta: 'Create a key at openrouter.ai',
    href: 'https://openrouter.ai/keys',
  },

  settings: {
    title: 'Settings',
    openRouterKey: 'OpenRouter key',
    keyPlaceholder: 'sk-or-…',
    keyLocalOnly:
      'The key is stored only in your browser (localStorage) and sent only to openrouter.ai. It never reaches our server.',
    save: 'Save',
    test: 'Test',
    remove: 'Remove',
    keyValid: 'The key works.',
    keyInvalid: 'Invalid key, or no connection.',
    keySaved: 'Key saved.',
    keyRemoved: 'Key removed.',
    nickname: 'Nickname (optional)',
    nicknamePlaceholder: 'e.g. NoughtsMaster',
    sound: 'Sound',
  },

  profile: {
    title: 'Player profile',
    anonymous: 'You are playing anonymously',
    nicknameHint:
      'Without a nickname your matches still add up to a single Elo, but you do not show up in the ranking table.',
    nicknameSaved: 'Nickname saved.',
    nicknameRemoved: 'Nickname removed.',
    nicknameTaken: 'That nickname is already taken.',
    nicknameInvalid: '3–20 characters: letters, digits, “_” or “-”.',
    nicknameProfanity: 'That nickname contains a banned word.',
    saveError: 'Could not save the nickname.',
    flagged: 'Your account has been flagged as suspicious and is hidden from the ranking.',
    privacy:
      'Your identity is a random token in this browser — it is what makes all of your matches add up to a single Elo. We collect no personal data. Clearing site data = losing that identity.',
    identity: 'Identity code',
    identityHint:
      'Move this code to another device to play there as the same person. Treat it like a password — whoever holds it plays as you.',
    copyIdentity: 'Copy identity code',
    identityCopied: 'Identity code copied.',
    copyFailed: 'Could not copy the code.',
    importIdentity: 'Move an identity from another device',
    importPlaceholder: 'Paste an identity code…',
    import: 'Move',
    importInvalid: 'Invalid identity code.',
    importConfirm:
      'Moving an identity in will abandon the one used in this browser (its matches stay in the ranking, but you lose access to them). Continue?',
    imported: 'Identity moved.',
  },

  log: {
    title: 'Match log',
    telemetry: 'telemetry',
    empty: 'No moves yet.',
    latency: 'time',
    tokens: 'tokens',
    cost: 'cost',
    retry: 'retry',
    forfeit: 'forced',
    // Short label for why a move was forced (next to the "forced" badge).
    reason: {
      rate_limited: 'rate limit',
      no_credits: 'no credits',
      auth: 'key',
      unavailable: 'unavailable',
      timeout: 'timeout',
      network: 'network',
      bad_output: 'bad reply',
    },
  },

  // The model never made a real move — name the cause instead of silently
  // playing random.
  moveError: {
    // {name} = model name. Shared suffix for every reason.
    playingRandom: "This model's moves are now random.",
    rate_limited:
      '{name}: OpenRouter is rate-limiting requests (429). Free models are heavily throttled — wait a moment or pick a paid model.',
    no_credits:
      '{name}: no balance on the OpenRouter account (402). The key is valid but the account has no budget — top it up or pick a free model.',
    auth: '{name}: OpenRouter rejected the key for this model (401/403).',
    unavailable:
      '{name}: model unavailable (404/5xx) — bad id or provider outage. Pick another model.',
    timeout: '{name}: the model did not answer in time.',
    network: '{name}: network error calling the model (offline or CORS).',
    bad_output: "{name}: the model responds but doesn't follow the move format.",
  },

  result: {
    title: 'Result',
    youWon: 'You win!',
    youLost: 'You lose',
    cost: 'Match cost',
    newGame: 'New game',
    rematch: 'Rematch',
    backToSetup: 'Change settings',
    save: 'Save to ranking',
    saving: 'Saving…',
    saved: 'Saved to the ranking',
    saveError: 'Could not save the result.',
    saveTooFast: 'This match was played too fast for a human — it did not enter the ranking.',
    saveDailyLimit: 'Daily limit of ranked matches reached. Come back tomorrow.',
    saveNoStart: 'Could not confirm the start of the match — please play another one.',
    analyze: 'Coached analysis',
    closeAnalysis: 'Close the analysis',
    savedUnranked: 'Saved — but out of the ranking',
    unrankedNoRealMoves:
      'The model never made a single real move (rate limit or a provider outage) — every one of its moves was forced at random. A match like that does not count towards Elo.',
    unrankedLab: 'A prompt-lab match does not affect Elo.',
  },

  analysis: {
    title: 'Coached replay',
    intro: 'Every move graded by the solver — green optimal, yellow weak, red a blunder.',
    precision: 'Precision',
    turningPoint: 'Turning point',
    turningPointDesc: 'the first blunder of the match',
    noBlunder: 'No blunders — a clean match.',
    goToTurningPoint: 'Jump to the turning point',
    step: 'Step',
    start: 'Start',
    first: '⏮',
    prev: '◀',
    next: '▶',
    last: '⏭',
    moveList: 'Moves',
    quality: {
      optimal: 'optimal',
      good: 'good',
      weak: 'weak',
      blunder: 'blunder',
    },
  },

  modelCard: {
    kicker: 'Model card',
    back: '← Back to the ranking',
    notRanked: 'This model has no saved matches in this ranking yet.',
    loadError: 'Could not fetch the model card.',
    whoIsIt: 'What is this model?',
    generatedNote:
      'Assembled automatically from catalog metadata (size, price, context) — by rules, not by a model. Always identical, and free.',
    noMeta: 'No metadata in the catalog — judge this model by the numbers below.',
    stats: 'Numbers',
    opponents: 'Head-to-head record',
    opponentsEmpty: 'No matches played in this ranking.',
    col: { opponent: 'Opponent', games: 'Matches', wld: 'W/L/D' },
    play: 'Play against',
    hallucinations: 'Hallucinations',
    hallucinationsLead:
      'How often the model lost the format and failed to produce a legal move. "Forced moves" covers the whole history; "clean first try" only matches saved since attempt-logging shipped.',
    disciplineRank: (pos: number, total: number) => `#${pos} of ${total} for discipline`,
    noDisciplineRank: 'Not enough data to rank discipline.',
    cleanFirstTry: 'Clean first try',
    cleanFirstTrySince: (date: string) => `Measured since ${date}`,
    recentFailures: 'Recent fails',
  },

  explain: {
    title: 'How to read these numbers',
    lead: 'A short, jargon-free guide to the ranking columns and the charts.',
    entries: [
      {
        q: 'What is a token?',
        a: 'A model does not read letters, it reads “tokens” — chunks of text, usually 3–4 characters or a short word. You pay for every token you send to the model (the prompt) and for every token it generates (the answer). That is why telemetry shows two numbers: input + output. When a provider does not report usage we show “—”, never 0 — missing data is not the same as zero.',
      },
      {
        q: 'Elo — what does it actually mean?',
        a: 'A rating system borrowed from chess. Everyone starts at 1000. Beating a favourite earns a lot of points; beating a weaker opponent earns very few. Elo means nothing on its own: 1200 only says that this model reliably beats the ones at 1000. It is computed exclusively from matches saved to the ranking — prompt-lab matches are excluded.',
      },
      {
        q: 'Precision, i.e. the % of optimal moves',
        a: 'Tic-tac-toe has perfect play — a computer can solve it all the way to the end (minimax). So every move can be judged objectively: “optimal” means precisely that it did not worsen the outcome of the match. 100% is flawless play. It is the fairest measure of thinking in the whole ranking, because it does not depend on which opponent the model happened to draw.',
      },
      {
        q: 'Why do models “hallucinate” moves?',
        a: 'The model does not see the board — it gets it as text and predicts the next token. Nothing physically stops it from naming a cell that is already taken, or one that does not exist at all. The smaller the model, the more often this happens, especially as the board fills up and the state needs careful tracking.',
      },
      {
        q: 'Retries and forced moves',
        a: 'When a model returns an illegal move, it is told so and handed the list of legal moves to try again — that is a “retry”. After three failed attempts we pick a random legal move for it and mark the move as “forced”. A high share of forced moves is not bad luck: it is a failure to stick to the answer format.',
      },
      {
        q: 'Why is a small model sometimes better than a huge one?',
        a: 'For a simple task, more model does not always help. Tic-tac-toe has nine cells — it rewards consistency, not erudition. A small model answers in a fraction of a second, costs pennies, and as long as it keeps the format it can sit in the ranking right behind the giants. That is why the “cost vs strength” chart is worth a look: pricier does not mean better.',
      },
      {
        q: 'Match cost',
        a: 'Computed from a snapshot of the price list taken when the match was played: (input tokens × input price) + (output tokens × output price). A later price change therefore cannot rewrite history. Free models and WebLLM cost exactly zero.',
      },
      {
        q: 'Where do these results come from, and how far can you trust them?',
        a: 'Matches are played in your browser, so there is no absolute guarantee of fair play. The server defends itself as best it can: it replays every match with its own engine, grades the moves itself, and rejects illegal moves, duplicates and suspiciously fast answers. Matches played through Ollama on our server are marked “server-verified”.',
      },
    ],
  },

  daily: {
    kicker: 'Daily challenge',
    headline: (model: string, game: string) => `Beat ${model} at ${game} today`,
    play: 'Take the challenge',
    done: 'Challenge complete!',
    doneToday: "Today's challenge is done. Come back tomorrow for the next one.",
    streak: 'Streak',
    streakDays: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    streakNone: 'No streak — start one today.',
    claiming: 'Claiming the result…',
    claimed: 'Complete! Streak: ',
    claimError: 'Could not claim the challenge result.',
    needKey: "Today's opponent runs through OpenRouter — add a key in settings.",
    needWebGpu:
      "Today's opponent runs in the browser (WebGPU), and your browser does not support it.",
    opponentRetired:
      "Today's opponent has disappeared from the OpenRouter catalog — the challenge cannot be played fairly today. Come back tomorrow for a new opponent.",
    loadError: 'Could not fetch the daily challenge.',
    lostHint: 'Not this time — try again, the challenge is valid until the end of the day.',
    free: 'always a free opponent',
  },

  prediction: {
    kicker: 'Spectator call',
    question: 'Who wins this match?',
    lead: 'Call it before the first move. Nothing at stake — just intuition points.',
    draw: 'Draw',
    skip: 'Skip and play',
    locked: 'Your call',
    hit: 'Called it! +1 intuition point.',
    miss: 'Missed.',
    saveHint: 'Save the match to the ranking for the call to count.',
    error: 'Could not save the call.',
    alreadyPredicted: 'This match has already been called.',
  },

  intuition: {
    title: 'Intuition ranking',
    lead: 'Who predicts best which model wins. One point per correct call.',
    empty: 'No calls yet — call the result of a model-vs-model match.',
    loadError: 'Could not fetch the intuition ranking.',
    needNickname: 'You appear in this ranking once you set a nickname in settings.',
    col: { rank: '#', player: 'Player', points: 'Points', total: 'Calls', accuracy: 'Accuracy' },
  },

  commentator: {
    section: 'AI commentator',
    toggle: 'AI commentator',
    lead: 'A third model commentates the match in plain language — explaining why a move was good or awful. Off by default.',
    model: 'Commentator model',
    costHint:
      'The commentator runs on your key / WebLLM — pick a cheap or free model (the “Free only” filter). It comments on selected moves, not on every one, and it never slows the game down.',
    badge: 'Commentator',
    sourceLabel: 'Who commentates',
    sourceOwn: 'My model',
    sourceServer: 'Coach (built-in)',
    serverName: 'AI coach',
    serverHint:
      'The built-in coach — no key and no cost on your side; it runs on the app server, so no secret ever reaches your browser. It has a fair-use limit (a few matches per hour). Want commentary with no limit, on any model? Pick “My model” and play on your own key and provider.',
    /** Toast when the funded coach hits its cap — a one-time nudge toward BYOK. */
    serverLimited:
      'The built-in coach hit its hourly limit. Switch to “My model” to keep commentary going, unlimited, on your own key.',
  },

  lab: {
    badge: 'Lab',
    section: 'Prompt lab',
    toggle: 'Lab mode',
    lead: 'Append your own instruction to the model prompt and turn the randomness dial. Lab matches do not count towards the ranking — otherwise comparisons would stop meaning anything.',
    appendix: 'Prompt appendix',
    appendixPlaceholder: 'e.g. Play aggressively and always open in a corner.',
    appendixHint:
      'Appended AFTER the fixed prompt core — the answer format stays untouched.',
    temperature: 'Randomness (temperature)',
    temperatureHint:
      '0 = always the same, “safe” move; higher = more creativity and more mistakes.',
    excludedNote: 'This match is flagged as a lab match and will not affect Elo.',
  },

  reasoning: {
    badge: 'Reasoning',
    section: 'Reasoning mode',
    toggle: 'Reasoning mode',
    lead: 'By default the models answer in one shot with no thinking — which makes them play weakly. Turn this on to give them a moment to reason about the move (win / block / centre) and a bigger token budget. They play much stronger.',
    excludedNote: 'Reasoning changes how strong the models play, so these matches do not count towards the ranking — the no-reasoning ranking stays untouched.',
  },

  safety: {
    section: 'Auto-stop',
    toggle: 'Auto-stop',
    lead: 'When the models can’t return a legal move, the match turns into a run of forced random moves that burn tokens for nothing. This guard kills such a match automatically.',
    forfeits: 'Forced moves in a row',
    forfeitsHint: 'Kill the match after this many forced moves in a row. 0 = off.',
    tokens: 'Token budget per match',
    tokensHint: 'Kill the match once total tokens exceed this. 0 = no limit.',
    off: 'off',
  },

  nav: {
    arena: 'Arena',
    rankings: 'Rankings',
    compare: 'Compare',
    models: 'Models',
    intuition: 'Intuition',
    failures: 'Fails',
  },

  museum: {
    kicker: 'Fail museum',
    title: 'Fail museum',
    lead: 'Illegal and unreadable moves that models tried to play — straight from saved matches. "Hallucination" here means the everyday thing: a rule-breaking move or an invented word, not the academic sense.',
    filterAll: 'All',
    empty: 'Nothing to show — models are playing remarkably clean (or there are too few matches).',
    inventedWords: 'Words that do not exist',
    attempted: 'Tried to play',
    said: 'Replied',
    reason: 'Reason',
    replay: 'See the match',
    kindIllegal: 'illegal move',
    kindUnparseable: 'unreadable',
    loadError: 'Could not fetch the museum.',
  },

  replay: {
    kicker: 'Replay',
    loading: 'Loading the replay…',
    notFound: 'This match was not found.',
    loadError: 'Could not fetch the replay.',
    play: 'Play',
    pause: 'Pause',
    copyLink: 'Copy link',
    copied: 'Replay link copied',
    serverVerified: 'server-verified',
    lab: 'lab',
    result: 'Result',
    draw: 'draw',
    wins: 'wins',
    openArena: 'Play a match of your own',
  },

  charts: {
    exportPng: 'Export PNG',
    empty: 'Not enough data — play some matches.',
    timeline: {
      title: 'Match timeline',
      takeaway: 'a longer bar = the model “thought” for longer.',
      seconds: 's',
      move: 'Move',
      tokens: 'tokens',
      retries: 'retries',
      forfeit: 'forced',
    },
    radar: {
      title: 'Model profile',
      takeaway:
        'axes normalised 0–100 against the ranking population — the further from the centre, the better.',
      axes: {
        strength: 'Strength',
        speed: 'Speed',
        discipline: 'Discipline',
        economy: 'Economy',
        cheapness: 'Cheapness',
      },
    },
    scatter: {
      title: 'Cost vs strength',
      takeaway: 'pricier is not always better — cheap models often sit close to the top.',
      x: 'cost / match (log)',
      y: 'Elo',
      games: 'matches',
    },
    elo: {
      title: 'Elo over time',
      takeaway: 'one point per saved match — the trend of strength over time.',
      start: 'start',
    },
    compare: {
      title: 'Compare models',
      lead: 'Pick two subjects — overlaid radar + the record of their shared matches.',
      pickA: 'Model A',
      pickB: 'Model B',
      pickPrompt: 'Choose…',
      h2h: 'Head-to-head',
      games: 'Shared matches',
      wins: 'wins',
      draws: 'draws',
      noShared: 'No shared matches in this ranking.',
      sameModel: 'Pick two different models.',
    },
    tooltip: {
      elo: 'Elo',
      cost: 'Cost/match',
      games: 'Matches',
    },
  },

  session: {
    verifyTitle: 'Confirm you are not a bot',
    verifyDesc: 'Cloudflare Turnstile verification — required to save a result to the ranking.',
    verifyFailed: 'Verification failed.',
    turnstileLoadFailed: 'Could not load the verification.',
  },

  leaderboard: {
    title: 'Rankings',
    empty: 'No data — play and save some matches.',
    loadError: 'Could not fetch the ranking.',
    rowHint: 'Click a row to see its radar and Elo curve.',
    subjectModels: 'Models',
    subjectHumans: 'Humans',
    humansEmpty: 'Nobody has set a nickname yet — play a match and give yourself one.',
    humansNote:
      'Results come from the client environment. The human ranking is protected in layers: Turnstile verification, a server-side replay of the match, pacing checks and daily limits.',
    col: {
      rank: '#',
      subject: 'Subject',
      player: 'Player',
      elo: 'Elo',
      games: 'Matches',
      wld: 'W/L/D',
      forfeit: 'Forced',
      latency: 'Avg. time',
      cost: 'Cost/match',
      precision: 'Precision',
    },
    forfeitTip:
      'Share of moves where the model failed to give a legal move in 4 tries and we substituted a random one (a "forfeit"). This is the everyday sense of a move "hallucination" — lower is more disciplined. Computed over the whole history (forced / all moves).',
  },

  actions: {
    newGame: 'New game',
    settings: 'Settings',
  },

  modelLoad: {
    downloading: 'Downloading the model into your browser…',
  },

  footerNote:
    'Models play through OpenRouter (your key, sent only to openrouter.ai), WebLLM (locally in your browser, no key) or Ollama. Matches run on your machine, so any result saved to the ranking is replayed and verified on our side.',
};
