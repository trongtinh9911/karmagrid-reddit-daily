# 📋 PLAN.md — KarmaGrid: The Daily Reddit Logic Game
**Hackathon Target:** Reddit's Game of the Day Hackathon (Devpost — $35,000 Prize Pool)  
**Target Category:** Best Daily Game ($15,000) / Honorable Mention ($1,000)  
**Author:** ong-1 (Antigravity Swarm)  
**Repository:** `hackathons_2026/reddit-game-of-the-day`

---

## 1. Concept & Gameplay Hook (Why It Wins)
* **The Problem with Daily Games:** Many daily games are either passive trivia or require 5+ minutes of heavy reading. Players on Reddit scroll fast and want an immediate dopamine hit within 10 to 60 seconds.
* **The Solution — KarmaGrid:** A fast-paced, tactile, daily deductive logic puzzle that blends the spatial satisfaction of *Queens* / *Sudoku* with native Reddit subreddits and Karma mechanics.
* **Core Rules (Learned in 10 Seconds):**
  1. **One Snoo Star per Row & Column:** Every row and column must contain exactly one Snoo Karma Star ⭐.
  2. **One Snoo Star per Subreddit Sector:** The grid is partitioned into distinct colored Subreddit territories (e.g. *r/AskReddit*, *r/gaming*, *r/memes*, *r/science*, *r/technology*). Exactly one Star must be placed in each territory.
  3. **No Touching:** Stars cannot touch each other, not even diagonally!
  4. **Tap Controls:** Tap once to place a Snoo Star ⭐; tap again to place an "X" blocker ❌ (helps players eliminate impossible squares); tap a third time to clear.
* **Difficulty Curve by Day of Week:**
  - *Monday – Wednesday:* 5x5 Grid (Brisk 30–60 second solve).
  - *Thursday – Saturday:* 6x6 Grid with Karma Clue arrows.
  - *Sunday Master:* 7x7 Grid for hardcore logic heads.
* **Viral Reddit Share Card:**
  Generates an emoji grid (🟩/⬜) with solve time, stars, and Reddit Markdown copyable with one tap to paste directly into the comments.

---

## 2. Devvit Web Architecture & Dual-Mode Deployment
```
reddit-game-of-the-day/
├── devvit.json                # Devvit App Manifest (redis, redditAPI)
├── package.json               # Dependencies, build & test scripts
├── tsconfig.json              # TypeScript strict configuration
├── vite.config.ts             # Vite bundle config (client + server targets)
├── PLAN.md                    # Project blueprint & specification
├── README.md                  # Complete documentation for judges
├── src/
│   ├── client/                # Frontend Webview (React + TypeScript)
│   │   ├── index.html         # HTML entry point (mobile-first viewport)
│   │   ├── main.tsx           # React root
│   │   ├── App.tsx            # Main game container & state machine
│   │   ├── components/
│   │   │   ├── Board.tsx          # Canvas/SVG interactive game grid
│   │   │   ├── Header.tsx         # Date, timer, streak badges, how-to-play
│   │   │   ├── Controls.tsx       # Undo, Reset, Check, Share buttons
│   │   │   ├── WinModal.tsx       # Confetti, stats, share card copy
│   │   │   ├── HowToPlayModal.tsx # 3-step visual tutorial (<10s read)
│   │   │   ├── StatsModal.tsx     # Win %, streak history, time charts
│   │   │   └── Leaderboard.tsx    # Daily Reddit community standings
│   │   ├── engine/
│   │   │   ├── prng.ts            # Mulberry32 deterministic generator
│   │   │   ├── generator.ts       # Daily board generator with unique solution
│   │   │   ├── solver.ts          # Constraint-satisfaction backtracking solver
│   │   │   ├── audio.ts           # Web Audio API procedural sound engine
│   │   │   └── devvitBridge.ts    # Dual-mode bridge (Devvit IPC vs Local Sandbox)
│   │   └── styles/
│   │       └── theme.css          # Reddit dark-mode, high-contrast, zero-AI-slop
│   ├── server/                # Devvit Backend Handlers
│   │   ├── index.ts           # Hono-compatible server endpoints
│   │   └── redisStore.ts      # Daily leaderboard & streak storage
│   └── tests/
│       ├── generator.test.ts  # PRNG & board generation verification
│       ├── solver.test.ts     # Constraint validation & rule checks
│       ├── stress365.test.ts  # 365-day seed stress test (zero invalid days)
│       └── gameplay.test.ts   # Move validation, victory detection, undo/redo
```

---

## 3. Ground Truth Test Plan (TDD & Empirical Proof)
1. **Deterministic PRNG Test:** Verify same date string produces identical grid on all platforms.
2. **Backtracking Solver Verification:** Ensure every generated board has exactly 1 valid solution (no ambiguous multiple solutions, no dead ends).
3. **365-Day Continuous Stress Test:** Iterate through every single day from `2026-01-01` to `2026-12-31`. Prove that:
   - 365/365 boards are generated with valid connected sectors.
   - 365/365 boards have a verifiable winning solution.
   - All rules (Row, Col, Sector, Diagonal) hold with 0 violations.
4. **Gameplay & State Machine Tests:** Tap placing, cross marking, conflict highlighting, timer countdown, victory trigger.
5. **Dual-Mode Build Verification:**
   - `npm run build` bundles without errors or warnings.
   - `npm test` runs with 100% pass rate.
