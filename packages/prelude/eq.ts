import * as eq from 'fp-ts/Eq';
import { constTrue } from 'fp-ts/function';

export * from 'fp-ts/Eq';

export const trivial: eq.Eq<unknown> = {
  equals: constTrue,
};

export const isEqualTo =
  <A>(e: eq.Eq<A>) =>
  (a: A) =>
  (b: A): boolean =>
    e.equals(a, b);
