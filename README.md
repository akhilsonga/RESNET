<p align="center">
  <img src="space-shuttle.png" alt="RESNET UI" width="96" />
  <h2 align="center" style="margin-top:4px;">RESNET — New UI</h2>
  <p align="center">Fast, clean news reading experience with desktop and mobile layouts.</p>
  <a href="https://newui.resnet.in"><img alt="Live: newui.resnet.in" src="https://img.shields.io/badge/Live-newui.resnet.in-2ea44f?style=for-the-badge" /></a>
  <br/>
  <sub>Click the badge to open the app</sub>
</p>

### Table of contents
- [Features](#features)
- [UI gallery](#ui-gallery)
- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [Scripts](#scripts)
- [Project structure](#project-structure)

### Features
- Clean, distraction‑free reader with cards and summaries
- Dedicated mobile and desktop experiences
- Search, chains (company‑only news), comments, dark mode
- Fast image proxy and caching for snappy loads

### UI gallery

<details open>
<summary><b>Open preview</b></summary>

<p align="center" style="margin-top:8px;">
  <b>Desktop — Home</b><br/>
  <img src="public/ui-images/image.png" alt="Desktop Home" width="1200" />
</p>

<table>
  <tr>
    <td align="center">
      <b>Mobile — Home</b><br/>
      <img src="public/ui-images/image%20copy.png" alt="Mobile Home" width="360" />
    </td>
    <td align="center">
      <b>Mobile — Search</b><br/>
      <img src="public/ui-images/image%20copy%202.png" alt="Search results UI" width="360" />
    </td>
  </tr>
  <tr>
    <td align="center">
      <b>Mobile — Article details</b><br/>
      <sub>Tabs: Summary, Options (comments), Chains (company‑only news)</sub><br/>
      <img src="public/ui-images/image%20copy%203.png" alt="Mobile Article Details with tabs" width="360" />
    </td>
    <td align="center">
      <b>Mobile — Settings</b><br/>
      <img src="public/ui-images/image%20copy%205.png" alt="Settings page" width="360" />
    </td>
  </tr>
  <tr>
    <td align="center">
      <b>Mobile — Dark mode</b><br/>
      <img src="public/ui-images/image%20copy%206.png" alt="Mobile dark mode" width="360" />
    </td>
    <td align="center">
      <b>Chains view</b><br/>
      <img src="public/ui-images/image%20copy%204.png" alt="Chains UI" width="360" />
    </td>
  </tr>
  
</table>

</details>

### Quick start

```bash
# install deps
npm install

# run the unified dev server (API + Vite SPA)
npm run dev

# production build and preview
npm run build
npm run preview
```

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
