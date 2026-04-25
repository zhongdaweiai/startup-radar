# Startup Radar

Startup Radar is a lightweight Next.js workspace for startup discovery, tracking, and research workflow development.

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after the development server starts.

## Render Deployment

This repository includes `render.yaml` for a Render Static Site named `startup-radar`.

- Build command: `npm ci && npm run build`
- Publish directory: `out`
- Default branch: `master`

Next.js is configured with `output: "export"` so Render can serve the generated static files.
