UI images folder
=================

Purpose
-------
Keep ad‑hoc UI images used across the app (mockups, placeholders, marketing artwork, etc.). Files here are served statically by the dev/prod server.

How to reference images
-----------------------
- Import via public path in code:
  - React/JSX: `<img src="/ui-images/your-file.png" alt="" />`
  - CSS/SCSS: `background-image: url('/ui-images/your-file.png');`

Guidelines
----------
- Prefer `.webp` or optimized `.png/.jpg`.
- Keep filenames lowercase-with-dashes; avoid spaces.
- Add context in the filename (e.g., `hero-landing.webp`).
- Remove unused assets periodically.


