# Undertone website

The project website and an in-browser demo of the Undertone interface, built with Next.js (App Router) and exported as a static site.

- `/` is the landing page, with an interactive Privacy Mode comparison in the hero.
- `/demo/` is the app interface rebuilt for the browser: assistant with quick actions and context, meeting mode, history and settings. Replies are simulated, like the desktop app's Mock mode, and nothing leaves the browser.

## Run it

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to web/out
```

## Deploy

`.github/workflows/pages.yml` builds the site and publishes it to GitHub Pages on every push to `main` that touches `web/`. The base path is set from the repository name, so the site works at `https://<user>.github.io/<repo>/`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once.

## Layout

| Path | What it holds |
| --- | --- |
| `app/page.tsx` | Landing page |
| `app/demo/page.tsx` | Browser demo route |
| `app/globals.css` | Design tokens and all styles |
| `components/ShareStage.tsx` | Hero: your screen versus what the call sees |
| `components/DemoApp.tsx` | The demo app interface |
| `components/Markdown.tsx` | Small renderer for simulated replies |
| `lib/mock.ts` | Quick actions, meeting tools and simulated replies |
