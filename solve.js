// Fast drop-in for makefun-site 1.0.0: run(input) returns exactly build(input)'s answer.
// Optimised re-implementation (GLM-5.3 drafted the modules; semantics verified against the baseline).
import { build } from './fast_build.js';
export function run(input) {
  return build(input);
}
