# MP Group-2 Sub-group-4 Marks Calculator (Ace With Abhinav)

Netlify site: static page (`public/`) + 2 serverless functions (`netlify/functions/`).
Needs Netlify Functions + Netlify Blobs (both included in the free plan).

## Deploy (recommended: GitHub)
1. Push this folder to a GitHub repo.
2. Netlify -> Add new site -> Import from Git -> pick the repo. Settings are read from `netlify.toml`. Deploy.
   (CLI alternative: `npm i -g netlify-cli && netlify deploy --prod`.)
   Plain drag-and-drop of the folder may not install function dependencies.

## Configure
Edit `netlify/lib/config.mjs`:
- `appeared` per shift = real number of candidates who appeared. When all 22 are filled, ranks are
  extrapolated to the full population ("Estimated"). Until then ranks are among candidates who used the tool.
- Optional env var `HASH_SALT` to salt stored candidate hashes.

## Notes
- Shift is auto-detected from the link host (..._01octs2.cbtexam.in = 1 Oct Shift 2); otherwise the user picks it.
- Only marks + a hashed id are stored. No name / roll number.
- Tests: `npm install && npm test`.
