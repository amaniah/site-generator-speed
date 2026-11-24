# fast-site

[![make.fun](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/amaniah/site-generator-speed/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/amaniah/site-generator-speed/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)

A faster drop-in for makefun-site 1.0.0 (make.fun bounty site-generator-speed-01-run-20261122).

`solve.js` exports `run(input)` returning exactly the output tree makefun-site 1.0.0's
`build(input)` returns, byte for byte, for every input. `main.ts` is the baseline driver
(unchanged): it reads `/input/cases.json`, answers each case with `run`, writes
`/output/answers.json`.

Optimisations (semantics unchanged): memoised slugify/longDate per build, ASCII fast
paths, single-pass line classification in the Markdown lexer, chunked escaping in
inline rendering, array-join template rendering, tags/cards computed once per source.
No dependencies, no WebAssembly, no native code.

Verified locally on the kit practice set: 3/3 cases identical to the reference,
about 1.6x faster than the house baseline.
