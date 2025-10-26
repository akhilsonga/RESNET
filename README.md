## RESNET — New UI

Modern React + Vite interface for discovering and reading news with dedicated desktop and mobile experiences.

### Access the app
- Live: [newui.resnet.in](https://newui.resnet.in)

### UI gallery

Desktop home

<img src="public/ui-images/image.png" alt="Desktop Home" width="1024" />

Mobile home

<img src="public/ui-images/image%20copy.png" alt="Mobile Home" width="380" />

Search — keyword and results

<img src="public/ui-images/image%20copy%202.png" alt="Search results UI" width="380" />

Article details (mobile) — Summary, Options (comments), Chains (company‑only news)

<img src="public/ui-images/image%20copy%203.png" alt="Mobile Article Details with tabs" width="380" />

Chains view

<img src="public/ui-images/image%20copy%204.png" alt="Chains UI" width="1024" />

Settings

<img src="public/ui-images/image%20copy%205.png" alt="Settings page" width="380" />

Mobile — dark mode

<img src="public/ui-images/image%20copy%206.png" alt="Mobile dark mode" width="380" />

### Tech stack
- **React + Vite** for fast dev/build
- **Responsive layouts** with separate mobile/desktop views

### Scripts
- `npm run dev` — start dev server
- `npm run build` — production build in `dist/`
- `npm run preview` — preview the built app

### Project structure
- `src/root/App.jsx` — routes to mobile/desktop via `useResponsive`
- `src/views/mobile` — mobile screens and sections
- `src/views/desktop` — desktop screens and sections
- `src/shared` — shared components, hooks and utilities
- `src/styles` — global styles and tokens
- `public/ui-images` — UI screenshots shown above
