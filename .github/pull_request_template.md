## What this changes

<!-- The change itself, in a sentence or two. -->

## Why

<!-- What was wrong, or what this makes possible. The commit messages in this
     repository explain reasoning rather than restate the diff; a pull request
     description is the same job at a larger size. -->

## How it was verified

<!-- Delete what does not apply, and say what you actually ran. "Tests pass" is
     worth less than which ones and against what. -->

- [ ] `npm ci` from an empty `node_modules`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Driven in the real app (anything touching a component, a wallet or a chart
      is not covered by the suite, which runs in Node with no DOM)

## Anything a reviewer should look at twice

<!-- A flag flipped, a value that only matters in production, a path that
     signs a transaction with real money. Say so here rather than in a
     comment later. -->
