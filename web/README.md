# Hammyhamster (web)

Browser port of the desktop app one directory up: point your webcam at yourself and pull faces - a hamster meme reacts live next to your camera feed. Runs entirely client-side (MediaPipe Tasks Vision, WASM) - nothing is uploaded anywhere.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Deploys to [Vercel](https://vercel.com/new) - import the repo, set **Root Directory** to `web`, and deploy. No environment variables needed.

## Layout

- `app/page.tsx` - landing page
- `app/camera/page.tsx` - the live gesture-detection app
- `app/lib/gestures.ts` - gesture-classification logic, ported from `main.py`
- `public/memes/` - the meme images per gesture
- `public/models/` - the three MediaPipe `.task` models
