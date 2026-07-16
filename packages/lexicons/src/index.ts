/**
 * @arena/lexicons — compiled PL/EN word-game dictionaries.
 *
 * Browser-safe entry: the DAWG codec + the browser loader. The Node loader
 * (`node:fs`) lives behind the `@arena/lexicons/node` subpath so it never leaks
 * into the web bundle.
 */
export * from './dawg';
export * from './loader-browser';
