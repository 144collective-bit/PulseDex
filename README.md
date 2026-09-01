# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Tests

```
npm test          # once
npm run test:watch
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

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
