# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Getting Started

- Clone the repo and navigate into it:
  ```bash
  git clone <repo-url> && cd bfs1
  ```
- Install dependencies (using `--legacy-peer-deps` to avoid conflicts):
  ```bash
  npm install --legacy-peer-deps
  ```
- Start the Cloudflare Workers development server locally:
  ```bash
  npx wrangler dev functions --local
  ```
- In a separate terminal, run the React dev server:
  ```bash
  npm run dev
  ```
- Open http://localhost:3000 in your browser—the app proxies `/api` calls to your local Workers at http://127.0.0.1:8787.
