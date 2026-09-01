# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Tests

```
npm test              # once
npm run test:watch    # re-runs only what a change affects
npm run test:changed  # only the tests covering the files you touched
npm run test:coverage # writes coverage/ and prints a summary
```

Vitest, sharing `vite.config.js` so tests resolve modules exactly as the app
does — the source imports without file extensions, which plain Node cannot
follow.

The suite is deliberately weighted toward logic that has broken before rather
than toward coverage: the swap reconstruction and its explorer field names, the
candle service's distinction between an unreadable response and an empty pool,
the dashboard reducer and its undo stack, the module error boundary's reset
state machine, the request deadline, the explorer retry policy, scoped storage
and the write notification that stops two surfaces overwriting each other, the
SIWE message round trip, the indicator maths, the launch quality filters, and a
guard that fails if the wallet connectors ever go back to being extension-only.

Everything runs in Node with no DOM. Anything needing a browser is verified by
driving the real app instead.

Shared fakes live in `src/test/fixtures.js` - responses, a memory
`localStorage`, a `window` complete enough for wallet discovery, candle
builders. They are there because the same three fakes were being rewritten in
every file that needed them, each slightly differently, which is how a test
starts passing for the wrong reason.

Coverage is measured only over the logic these tests aim at - services, utils,
the dashboard reducer, the connector config. Counting components would report a
number near zero and mean nothing, since they are checked by driving the app.

Almost all of the wall-clock time is importing wagmi and viem for the two
connector-config tests; the assertions themselves take under a third of a
second in total.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
