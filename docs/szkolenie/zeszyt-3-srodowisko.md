:::cover
# Przygotuj środowisko krok po kroku

Od czystego komputera z Windows do działającego Claude Code — z punktami kontrolnymi po każdym kroku.

---

Zeszyt 3 z 4 · Pakiet „Jak powstała aplikacja tic-bot-toe”

Środowisko główne: **Windows 11**. Uwagi dla macOS w osobnych ramkach.

Instrukcje zweryfikowano: **18.07.2026**. Jeśli ekrany wyglądają inaczej — patrz rozdział 9.
:::

## Czego się tu nauczysz

Przeprowadzimy Cię od zera do momentu, w którym **Claude Code odpowiada, czyta i tworzy pliki** na Twoim komputerze. Każdy krok kończy się **punktem kontrolnym** — jeśli widzisz to, co opisano, idziesz dalej. Nic tu nie zakładamy „z góry”.

:::note
**Ile to zajmie:** około 45–60 minut przy pierwszym razie. **Ile kosztuje:** instalacje są darmowe; do samego korzystania z Claude Code wystarczy subskrypcja Claude (rozdział 4).
:::

## Mapa: co i po co instalujemy

| Narzędzie | Po co | Kiedy potrzebne |
|---|---|---|
| Konto GitHub | tożsamość dla kodu i miejsce na projekty | zaraz |
| Konto Claude (Anthropic) | logowanie do Claude Code | zaraz |
| VS Code | edytor, w którym mieszka Claude Code | zaraz |
| Git | zapisuje historię zmian (cofanie krok w tył) | zaraz |
| Node.js 22 LTS + pnpm | uruchamia projekty webowe | zaraz |
| Claude Code | sam agent kodujący | zaraz |
| Docker Desktop | uruchamianie baz/usług w kontenerach | opcjonalnie, później |
| Konto OpenRouter | dostęp do wielu modeli jednym kluczem | opcjonalnie |

Rób po kolei. Po każdym kroku jest punkt kontrolny.

<!-- break -->

## 1. Konto GitHub

GitHub to miejsce, gdzie trzyma się projekty (repozytoria) i ich historię.

1. Wejdź na `https://github.com` i kliknij **Sign up**.
2. Podaj e-mail, ustaw hasło i nazwę użytkownika, potwierdź e-mail.
3. Zapisz nazwę użytkownika — przyda się później.

:::checkpoint
Po zalogowaniu widzisz swój pulpit GitHub (górny pasek z Twoim awatarem po prawej). Masz konto.
:::

## 2. Konto Claude (Anthropic)

To konto, którym zalogujesz się do Claude Code.

1. Wejdź na `https://claude.ai` i załóż konto (albo zaloguj się, jeśli już masz).
2. Sprawdź, czy możesz normalnie rozmawiać z Claude w oknie czatu — to potwierdza, że konto działa.

:::checkpoint
Potrafisz wysłać wiadomość do Claude na claude.ai i dostać odpowiedź. Konto działa.
:::

## 3. VS Code (edytor)

VS Code (Visual Studio Code) to darmowy edytor kodu. W nim zamieszka Claude Code.

1. Wejdź na `https://code.visualstudio.com` i pobierz wersję dla **Windows**.
2. Uruchom instalator. Na ekranie z opcjami **zaznacz** „Add to PATH” (zwykle domyślnie włączone) — dzięki temu zadziała polecenie `code` w terminalu.
3. Uruchom VS Code.

:::note
**macOS:** pobierz wersję dla Mac, przeciągnij aplikację do folderu Applications, uruchom. Resztę zeszytu robisz tak samo.
:::

:::checkpoint
VS Code się otwiera i widzisz ekran powitalny. Edytor gotowy.
:::

## 4. Sposób opłacania modeli — wybierz jeden

Zanim zainstalujemy agenta, zdecyduj, jak płacisz za „myślenie” modelu. Do nauki poleca się **subskrypcję**.

- **Subskrypcja Claude (zalecane na start)** — stały abonament, bez liczenia tokenów przy każdej prośbie. Najprościej dla początkującego. Kupujesz na `https://claude.ai` w ustawieniach planu.
- **Klucz API Anthropic** — płacisz za zużycie (tokeny). Elastyczne, ale wymaga pilnowania kosztów. Klucz zakładasz w konsoli Anthropic.
- **OpenRouter (opcjonalnie, na później)** — jeden klucz do wielu modeli różnych dostawców, w tym **darmowych** (warianty „:free”). Przyda się dopiero, gdy Twoja aplikacja będzie sama wywoływać modele (jak tic-bot-toe). Do samej nauki z Claude Code nie jest potrzebny.

:::warn
Klucze API to **hasła**. Nie wklejaj ich do losowych stron, nie wysyłaj w wiadomościach, nie wgrywaj do repozytorium. Jak je bezpiecznie trzymać — rozdział 8.
:::

:::checkpoint
Masz aktywną **jedną** ścieżkę: subskrypcję Claude **albo** klucz API. To wystarczy, by zalogować się do Claude Code w kroku 7.
:::

<!-- break -->

## 5. Git (historia zmian)

Git zapisuje każdą zmianę w projekcie, więc zawsze można cofnąć się o krok.

1. Wejdź na `https://git-scm.com/download/win` — pobieranie ruszy samo.
2. Uruchom instalator. Klikaj **Next** z ustawieniami domyślnymi (są rozsądne). Jeśli zapyta o domyślny edytor, wybierz VS Code, jeśli jest na liście.
3. Po instalacji otwórz **Terminal** w Windows (menu Start → wpisz „Terminal”) i sprawdź wersję:

```
git --version
```

Powinno wypisać coś w rodzaju `git version 2.x.x`.

4. Ustaw swoje dane (podstaw swoje):

```
git config --global user.name "Imię Nazwisko"
git config --global user.email "twoj@email.pl"
```

:::checkpoint
Polecenie `git --version` wypisuje numer wersji (2.x lub wyższy). Git działa.
:::

## 6. Node.js 22 LTS + pnpm

Node.js uruchamia aplikacje webowe. pnpm to menedżer pakietów (pobiera biblioteki, których projekt używa).

1. Wejdź na `https://nodejs.org` i pobierz wersję **LTS** (na dzień weryfikacji: **Node 22 LTS**). Zainstaluj z ustawieniami domyślnymi.
2. **Zamknij i otwórz ponownie** Terminal (żeby zobaczył nową instalację), potem sprawdź:

```
node --version
```

Powinno pokazać `v22.x.x` (lub nowsze LTS).

3. Włącz pnpm (Node ma wbudowany mechanizm o nazwie corepack):

```
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

`pnpm --version` powinno wypisać numer (9.x lub wyższy).

:::warn
Jeśli `corepack` zgłasza błąd uprawnień, uruchom Terminal jako administrator (Start → wpisz „Terminal” → prawy przycisk → „Uruchom jako administrator”) i powtórz polecenia z tego kroku.
:::

:::checkpoint
`node --version` pokazuje v22+, a `pnpm --version` pokazuje numer. Środowisko uruchomieniowe gotowe.
:::

## 7. Claude Code (agent)

Teraz sam bohater. Najprościej przez rozszerzenie w VS Code.

1. W VS Code kliknij ikonę **Extensions** na lewym pasku (kwadraciki) lub naciśnij `Ctrl+Shift+X`.
2. W polu wyszukiwania wpisz **Claude Code** i zainstaluj oficjalne rozszerzenie (wydawca: Anthropic).
3. Po instalacji otwórz panel Claude Code (ikona na pasku bocznym lub `Ctrl+Shift+P` → wpisz „Claude”).
4. **Zaloguj się** — wybierz logowanie kontem Claude (subskrypcja) lub kluczem API, zgodnie z tym, co wybrałeś w kroku 4. Otworzy się przeglądarka, potwierdzasz i wracasz do VS Code.

:::note
**Alternatywa (terminal):** Claude Code można też zainstalować jako narzędzie wiersza poleceń: `npm install -g @anthropic-ai/claude-code`, a potem uruchomić poleceniem `claude` w folderze projektu. Dla początkującego wygodniejsze jest jednak rozszerzenie VS Code.
:::

:::checkpoint
Panel Claude Code w VS Code jest zalogowany (nie prosi już o logowanie) i widać pole, w którym można napisać wiadomość do agenta.
:::

<!-- break -->

## 8. Pierwszy test — „czy to naprawdę działa”

Sprawdzimy trzy rzeczy: czy agent **odpowiada**, czy **czyta** plik i czy **tworzy** plik.

1. Utwórz nowy, pusty folder na projekt, np. `C:\Users\TwojaNazwa\Documents\pierwszy-agent`. W VS Code: **File → Open Folder** i wskaż go.
2. Otwórz panel Claude Code i wpisz pierwsze polecenie:

:::prompt
Przywitaj się i wypisz w jednym zdaniu, w jakim folderze teraz jesteś.
:::

Agent powinien odpowiedzieć i podać ścieżkę Twojego folderu — to znaczy, że **widzi** projekt.

3. Teraz test tworzenia pliku:

:::prompt
Utwórz plik notatka.txt z jedną linią: „Moje środowisko działa”. Potem odczytaj jego zawartość i pokaż mi ją.
:::

Agent utworzy plik, odczyta go i pokaże treść. Zobaczysz `notatka.txt` w drzewie plików po lewej.

:::checkpoint
Widzisz plik `notatka.txt` w folderze, a agent potwierdził jego treść. **Twoje środowisko działa w komplecie** — agent odpowiada, czyta i tworzy pliki.
:::

### Higiena: czego pilnować od pierwszego dnia

- **Sekrety trzymaj w pliku `.env`.** To zwykły plik tekstowy z liniami typu `KLUCZ=wartosc`. Nie wgrywa się go do repozytorium.
- **Poproś o `.gitignore`.** Powiedz agentowi: „dodaj `.env` do `.gitignore`”, żeby git nigdy nie zapisał sekretów.
- **Nie wklejaj** do agenta haseł, kluczy ani danych osobowych, których nie chcesz nigdzie utrwalać.
- **Cofanie:** skoro masz git, każdą zmianę da się cofnąć. Nie bój się eksperymentować.

:::warn
Nigdy nie wysyłaj pliku `.env` ani kluczy w wiadomości, na czat publiczny czy do repozytorium. Jeśli klucz gdzieś trafił — skasuj go u dostawcy i wygeneruj nowy.
:::

## 9. Gdy coś wygląda inaczej

Oprogramowanie się zmienia — ekrany mogą odbiegać od opisu. To normalne. Jak sobie radzić:

- **Czytaj komunikat błędu do końca.** Zwykle mówi, czego brakuje (np. „command not found” = coś nie jest zainstalowane albo trzeba otworzyć nowy terminal).
- **Zamknij i otwórz Terminal** po każdej instalacji — nowe narzędzia bywają widoczne dopiero w świeżym oknie.
- **Zapytaj samego agenta.** To Twój nauczyciel. Wklej mu błąd:

:::prompt
Podczas instalacji dostałem taki komunikat: [wklej dokładny tekst błędu]. Wyjaśnij po ludzku, co oznacza, i podaj krok po kroku, jak to naprawić na Windows 11.
:::

- **Wersje.** Jeśli numer wersji jest wyższy niż w tym zeszycie — zwykle w porządku. Problemem są wersje **niższe** niż wymagane (np. Node poniżej 22).

:::checkpoint
Wiesz, gdzie szukać pomocy, gdy ekran nie zgadza się z instrukcją: czytać błąd, odświeżyć terminal, zapytać agenta. To wystarczy, by odblokować się samodzielnie.
:::

## 10. Podsumowanie i co dalej

Masz komplet: konta (GitHub, Claude), edytor (VS Code), git, Node 22 + pnpm oraz działającego **Claude Code**, który odpowiada, czyta i tworzy pliki. To dokładnie to środowisko, w którym powstał tic-bot-toe.

W **Zeszycie 4** użyjesz go do rzeczy najważniejszej: zbudujesz z agentem **swoją pierwszą działającą aplikację**, powtarzając metodę z Zeszytu 2 w miniaturze — z gotowymi promptami do skopiowania.

:::checkpoint
Zanim przejdziesz dalej: masz otwarty pusty folder projektu w VS Code i zalogowany panel Claude Code. Jeśli tak — jesteś gotów zbudować pierwszą aplikację.
:::
