# Harmonic Voicing 2.0 — validation (2026-10-16)

Baseline: `e8b87bf6c36d240885e4ddd24da630ae6d4a9122`. Main and open PRs were rechecked at start and before publication; no existing open PR was found. No AGENTS.md was present in the repository or applicable workspace ancestors.

`npm test`: **57 passed, 0 failed** (including six new voicing tests). `npm run build`: passed. Existing ii–V–I, Edge resolution/cooldown, Migration arrival, 60-minute journey/texture, audio, hold, history and background-clock unit coverage all passes.

## Seeded comparison

Three one-hour Journey sessions per version, checkpoints at 10/30/60 minutes. Two default-control seeds and one adventure seed; Pace 12, complexity 0, active-time simulation (not real-time audio). Same seeds do not imply identical subsequent paths once candidate selection changes. Results are a small deterministic regression sample, not a perceptual study or a guarantee for every seed. Details and reproduction: [harmonic-voicing-2.md](harmonic-voicing-2.md). Raw data: [before](voicing-before.json), [after](voicing-after.json).

Each cell is **before → after**. Crowding/roughness are cumulative means per adopted chord; lower is preferred by the proxy. Diversity is unique adopted PC sets. Arrivals use the existing evidence/bass/dwell criterion, not inferred-key relabels.

| Seed | Minutes | Low crowding | Roughness proxy | Harmonic diversity | Edge adoptions | Actual arrivals |
|---|---:|---:|---:|---:|---:|---:|
| 23 | 10 | 0.392 → 0.120 | 1.255 → 1.081 | 26 → 29 | 1 → 0 | 0 → 1 |
| 23 | 30 | 0.782 → 0.088 | 1.442 → 0.867 | 54 → 62 | 1 → 1 | 1 → 5 |
| 23 | 60 | 0.721 → 0.053 | 1.365 → 0.763 | 78 → 99 | 3 → 2 | 3 → 10 |
| 91 | 10 | 0.796 → 0.190 | 1.477 → 0.810 | 31 → 28 | 0 → 0 | 1 → 0 |
| 91 | 30 | 1.641 → 0.084 | 1.960 → 0.638 | 61 → 51 | 0 → 0 | 2 → 2 |
| 91 | 60 | 2.060 → 0.042 | 2.324 → 0.475 | 84 → 88 | 0 → 0 | 4 → 5 |
| 19 | 10 | 0.339 → 0.106 | 1.101 → 0.868 | 31 → 26 | 4 → 4 | 1 → 1 |
| 19 | 30 | 0.261 → 0.037 | 1.134 → 0.585 | 58 → 54 | 9 → 9 | 1 → 2 |
| 19 | 60 | 0.220 → 0.019 | 0.948 → 0.382 | 88 → 91 | 15 → 14 | 2 → 5 |

## Range, candidate registers and transition performance

Measurements below are the final 60-minute checkpoint; timings were collected in sequential simulations after the test suite, on the same host. Transition times include candidate generation, selection, inference, Wander and Migration. Browser/audio-thread timing is not represented by these Node measurements.

| Seed | Adopted MIDI range before → after | Max leap before → after | Pool / PC families after | Families with multiple layouts before → after | Mean ms before → after | p95 ms before → after | Max ms after |
|---|---|---:|---:|---:|---:|---:|---:|
| 23 | [12, 67] → [31, 79] | 4 → 6 | 120 / 41 | 0 → 38 | 19.8 → 75.8 | 27.4 → 100.7 | 1260.4 |
| 91 | [26, 70] → [33, 106] | 6 → 6 | 119 / 38 | 0 → 38 | 19.3 → 59.6 | 25.7 → 80.2 | 108.6 |
| 19 | [19, 77] → [26, 103] | 5 → 5 | 144 / 48 | 0 → 48 | 18.1 → 63.3 | 23.7 → 92.7 | 132.8 |

All adopted notes remained MIDI 12–127 and every slot leap stayed ≤7 semitones. Accepted history stayed bounded at 16 and cooldown checks passed. The search is more expensive than the baseline: at most four paths per coverage mask, three returned registers per target set, with per-pool target deduplication and a finite note-pair cache. Candidate computation runs on the main thread; low-powered mobile devices still need listening/performance validation.

## Browser checks

- Existing `browser-layout.mjs`: passed desktop, mobile and all four texture tabs.
- Existing `browser-ui.mjs`: passed start, stop/resume, controls, adopted audio notes, fixed oscillator count, desktop/mobile/zoom layout and no page errors.
- Existing `browser-background.mjs`: passed in Chrome with **synthetic visibility**. Native tab switching/minimizing did not expose a hidden page in this automation environment. The test fallback dispatched visibility changes. Over ~21 seconds, Journey/texture/audio time advanced, one harmony changed, oscillator count remained 36 and the audio-worklet probe recorded 23 windows with **0 silent windows**. This does not prove native OS background/lock-screen behavior.

## Scope and limits

No UI, audio/DSP, Inharmonicity, Journey, history or background-clock source changes. No WARMTH slider added. No changes to fret-drift or chord-atlas, and no main merge.
The roughness model is a fixed harmonic reference. Actual timbre/effects and subjective musical pleasantness were **not assessed by human listening**. No real-time one-hour audio soak was performed. The comparison shows candidate/selection behavior, not that every new voicing sounds better.
