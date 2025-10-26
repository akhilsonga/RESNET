# Discover News (React + Vite)

A cleanly structured React app with separate mobile and desktop views. Mobile UI mirrors the provided screenshot (header, category chips, and article cards).

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build to `dist/`
- `npm run preview` - preview the built app

## Structure

- `src/root/App.jsx` - routes to mobile/desktop via `useResponsive`
- `src/views/mobile` - mobile screens and sections
- `src/views/desktop` - desktop screens and sections
- `src/shared` - shared hooks/utilities
- `src/__mocks__` - mock data
- `src/styles` - global styles and tokens

## Deploy

- Static hosting: upload `dist/` to Netlify, Vercel, GitHub Pages, S3, etc.
- SPA routing: no extra config needed for this demo.

## Customize breakpoints

Edit `MOBILE_MAX_WIDTH` in `src/shared/hooks/useResponsive.js`. 