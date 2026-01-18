# HyPortal (Electron + React)

HyPortal is a desktop client to manage Hytale servers across Windows, Linux, and macOS. This scaffold ships with Electron, React, Vite, basic i18n, and placeholders for app icons.

## Scripts

- `npm install` — install dependencies.
- `npm run dev` — start Vite and Electron in watch mode.
- `npm run build` — build the renderer (Vite) and prepare unpacked Electron output.
- `npm run build:dist` — build and generate platform installers (via electron-builder).
- `npm run start` — launch Electron against the bundled files (after `npm run build`).

## Structure

- `electron/` — main & preload processes.
- `src/renderer/` — React UI rendered by Vite.
- `resources/` — static assets (icons, logos, etc).
- `electron-builder.yml` — packaging targets for Win/Linux/macOS.
