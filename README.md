# Nicollo V1 (UI-locked prototype)

This repo is a **pixel-locked** UI prototype of the Devassist V1 workspace layout (desktop-only).

# Nicollo

AI assisted product design system

Nicollo helps turn vague ideas into structured, delivery ready product plans. It is built for people who have ideas but struggle to turn them into something engineers and designers can actually execute.

Instead of open ended chat, Nicollo guides users through constraint driven workflows that force clarity, sequencing, and tradeoff awareness early.

The goal is not to replace product thinking, but to support it.

## What it does

Helps users break down ideas into clear problem statements  
Surfaces assumptions, risks, and gaps early  
Produces structured outputs that are usable by real product teams  
Reduces ambiguity before build time, not after  

## How it thinks

Constraint driven rather than free form  
Sequenced reasoning instead of prompt sprawl  
Focused on decision quality, not verbosity  
Designed to fail clearly rather than hallucinate confidently  

## Why I built it

I kept seeing good ideas fail because they were unclear, underspecified, or too abstract to act on. Nicollo is an attempt to bring structure, discipline, and calm thinking into early product design using AI as a support tool.

## Status

Actively evolving through real world use and iteration.

More details and demos  
https://nicollo-aidev.vercel.app/projects


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
