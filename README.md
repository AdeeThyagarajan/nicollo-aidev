# Devassist V1 (UI-locked prototype)

This repo is a **pixel-locked** UI prototype of the Devassist V1 workspace layout (desktop-only).

## Run

```bash
npm install
npm run dev
```

Open: http://localhost:3000

## Routes

- `/projects/1/workspace` — workspace (matches the locked mock)
- `/projects` — project list (minimal)
- `/login` and `/signup` — minimal auth UIs (no auth logic yet)

## Notes

- No Tailwind for layout/visuals (CSS Modules + globals only).
- UI is intentionally non-responsive and desktop-locked.


## Workspace interactions
- Chat send (Enter/click)
- Status dropdown filters table
- Export Data downloads CSV
- Pending Actions + increments count
- File tree highlights selection and tabs switch


## OpenAI
Create `.env.local` with only:
```
OPENAI_API_KEY=your_key
```
(Optional) `OPENAI_MODEL`.
