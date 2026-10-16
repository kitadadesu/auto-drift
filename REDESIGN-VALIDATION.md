# Spatial UI / background performance validation

2026-10-16 JST. Base: main ea68010 (PR #1 merged). Compact branch 8c841e1 is an ancestor. No open PR at start. Previous Work is idle. Separate feature/spatial-ui-background checkout; no changes to fret-drift or chord-atlas. No main merge or production deployment.

## UI

Single ink/plum stage with coral, amber and mauve six-voice traces; no green/teal/sage palette. Origin and transport share the brand bar. Chord up to 90px, TIME up to 55px, current Texture up to 60px, destination/progress and tonal migration share the stage. Background tint follows the target scene and actual Bloom value. Trace vertical positions follow actual interpolated MIDI; decorative vertical sway removed. System fonts avoid external font loading.

Right slide-in Texture drawer: four groups (5 / 6 / 5 / 7 controls), no internal vertical scroll. History remains bounded and structured, with JSON export. × and Escape close the drawer, focus returns to the opener. Controls have 44px interaction height. Only one drawer opens at a time.

Chrome layout: 1440×900, 1366×768, 390×844 and 1093×614 (125% equivalent CSS viewport, not native zoom). No horizontal overflow; desktop main no vertical overflow. All four Texture tabs fit without internal vertical scrolling. Screenshots inspected for type, color and panel placement. Mobile main uses natural scrolling.

## Automated checks

- npm test equivalent (node --test tests/*.test.js): 51/51 pass. npm run build equivalent (node build.js): pass. Bundled Node distribution has no npm executable; scripts run directly with identical commands.
- Includes seeded 60-minute harmony/Texture test, auto Inharmonicity <=8%, manual full range, initial and bounded HISTORY snapshots, migration rules, audio safety and hashed worker/module deployment assets.
- Added AudioClock STOP/resume and 10-minute timer-gap tests. One long gap produces one harmony transition, Texture consumes full audio-clock time.
- Chrome browser-ui: start, actual MIDI canvas labels, live knobs, fixed oscillator count, STOP/resume, AudioContext suspension, synthetic hidden/restored, manual 80% Inharmonicity, reset/history and responsive controls pass.
- Existing browser-saturation: actual 48kHz OfflineAudioContext safety/PRE/POST/Bloom and 180s stable +180s stress tests pass. No changes to synthesis topology.

## Background browser probe

browser-background.mjs launches real headful Chrome, switches tabs, minimizes/restores the window, disables Playwright focus emulation and removes timer/background exemptions. This environment still reports document.hidden=false for native switching/minimizing. The test therefore explicitly reports realHidden=false and uses a synthetic document.hidden + visibilitychange fallback. This proves the application's hidden handler and continued real WebAudio/Worker behavior, but does NOT prove native background timer policy on normal Chrome.

Measured fallback run: elapsed 3976→25478ms, Texture 3976→25478ms, harmony transitions 0→2, oscillators 36→36, context running. AudioWorklet probe: 23 one-second windows, 0 silent windows. Auto Inharmonicity 0.8815%. Restore follows current time and STOP freezes elapsed. No node recreation at visibility changes. Probe checks energy continuity, not every sample or human perception of clicks.

Worker uses acknowledgement backpressure (at most one pending message). Browser/OS suspension may still hold a chord/Texture longer; catch-up advances once without a transition burst. No guarantee during sleep, mobile lock, OS power saving, discarded tab or browser interruption. Human listening, Safari/mobile hardware and long real-time CPU/heap endurance remain unverified. Existing migration behavior is preserved: 3 minutes is a minimum musical arrival condition, not a periodic modulation guarantee (prior seeded journey first arrival ~35 minutes).

Reproduce: node --test tests/*.test.js; node build.js; node tests/browser-ui.mjs; node tests/browser-layout.mjs; node tests/browser-background.mjs; node tests/browser-saturation.mjs. Browser scripts require Playwright and Chrome (PLAYWRIGHT_MODULE / CHROME_PATH / PORT / OUTPUT_DIR).
