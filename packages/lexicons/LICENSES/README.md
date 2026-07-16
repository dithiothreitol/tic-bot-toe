# Dictionary sources & licenses

The compiled dictionaries in `../dist/*.dawg` are built from third-party word
lists. Their licenses and attributions are recorded here (verified before
download — plan §6.1 / instruction §5).

## English — `en.dawg`

- **Source:** ENABLE1 (Enhanced North American Benchmark LExicon), master word
  list `WORD.LST` by **Alan Beale** and **M. Cooper**.
- **License:** **Public Domain.** The ENABLE list was explicitly released into
  the public domain — free to use, distribute and modify without restriction.
- Built from `enable1.txt` (168,551 words survive the tile-alphabet + length 2–15
  filter, out of ~172,800).

## Polish — `pl.dawg`

- **Source:** **sjp.pl** word-game dictionary (`sjp-YYYYMMDD.zip` → `slowa.txt`),
  from <https://sjp.pl>.
- **License:** dual-licensed **GPL-2.0** and **CC BY 4.0**
  (<https://creativecommons.org/licenses/by/4.0/>). This project uses it under
  **CC BY 4.0**, which requires attribution — given here and in the app's README.
- **Attribution:** *Słownik SJP.PL — wersja do gier słownych* — https://sjp.pl
- The upstream notice shipped in the archive is preserved verbatim in
  [`sjp-pl-README.txt`](./sjp-pl-README.txt).
- Built from `slowa.txt` (3,239,463 words survive the tile-alphabet + length 2–15
  filter, out of ~3,240,240).

## Rebuilding

Raw sources are **not** committed (large; the DAWG is the artifact). To rebuild:

1. Place `enable1.txt` and `slowa.txt` in `scripts/lexicon/sources/`.
2. `pnpm lexicon:build` → regenerates `packages/lexicons/dist/{en,pl}.dawg`.
