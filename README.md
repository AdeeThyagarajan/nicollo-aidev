# Nicollo

AI-assisted product design and planning system

Nicollo helps turn vague product ideas into structured, delivery-ready plans. It is designed for early-stage thinking, where ambiguity, missing constraints, and poor sequencing often derail execution before build even begins.

Rather than open-ended chat, Nicollo guides users through constraint-driven workflows that force clarity, surface trade-offs, and structure reasoning early. The goal is not to replace product judgement, but to support clearer decisions.

## What it does

- Breaks down vague ideas into clear problem statements  
- Surfaces assumptions, risks, and gaps early  
- Produces structured outputs usable by real product teams  
- Reduces ambiguity before build time, not after  

## How it works

- Multi-step prompt orchestration instead of free-form chat  
- Constraint-driven reasoning to enforce clarity and sequencing  
- Structured outputs (plans, steps, risks) rather than narrative text  
- Designed to fail clearly rather than hallucinate confidently

## Architecture Overview

- Client (Next.js) → API routes (Node/Server functions)  
- Orchestration layer manages staged LLM calls  
- Project state persists across sessions for continuity  
- Structured outputs are stored and used to build final deliverables 

## System design

- Server-side execution with project-level state  
- Stepwise orchestration across planning stages  
- Persistent project context across interactions  
- UI supports workspace-style interaction rather than chat threads

## Prompt Orchestration

Nicollo uses multi-step, constraint-driven prompt sequences rather than isolated LLM calls.  
Each stage enforces structure and sequencing logic so that outputs are deterministic and repeatable wherever possible.

## Evaluation & Quality Control

- Outputs are tested via fixed input sequences to check stability and drift.
- Logical completeness, step dependency, and risk extraction are validated manually.
- Structured output format reduces ambiguity and prevents confident hallucinations.

## Why I built it

Nicollo is an attempt to bring structure, discipline, and calm reasoning into early product design, using AI as a support system rather than a shortcut.

## Status

Actively evolving through real-world use and iteration.

Demo workspace  
https://nicollo-aidev.vercel.app/projects

## Run locally

```bash
npm install
npm run dev

Open: http://localhost:3000

##Routes
/projects — project list
/projects/[id]/workspace — planning workspace
/login and /signup — minimal auth UI

##Workspace interactions
Chat-driven planning flow
Constraint-aware status tracking
Structured data export (CSV)
File tree and tab-based workspace navigation

##Notes
Desktop-first UI by design
CSS Modules and global styles (no Tailwind)
Focus is on system behaviour and workflow, not responsive polish

##OpenAI

Create .env.local with:

OPENAI_API_KEY=your_key
