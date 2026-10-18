# Fifteen-minute chapters, extended texture, chromatic skin

Baseline inspected: main `35b3a1c` (PR #4); no open PRs. No AGENTS.md in checkout or applicable parent paths. Five scenes exist: HOLLOW, CLEAR, HAZE, GLOW, DISSOLVE. No new scenes or changes to harmony candidate scoring. Only auto-drift is modified.

## Chapters

ActiveClock drives 900,000 ms chapters. At 14:52 the final output gate fades for eight seconds, including convolution, shimmer, delay, saturation and dry output. The entire fade is scheduled against AudioContext time in advance, so a delayed worker cannot leave the old key audible. At 15:00 the muted context is closed and replaced, releasing all old tails, worklets and oscillators. A fresh tonic-rooted six-slot triad starts with a 12-second fade-in. This is a silent handoff, not overlapping crossfade: old tails cannot bleed into the new key. Context reconstruction can add a short silent gap depending on the device; it does not advance the active clock.

Remote destinations have a different tonic and at most four shared scale pitch classes; same/relative/dominant/subdominant keys are excluded. Recent chapter keys are avoided when possible. Each new context resets accepted harmony, smoothing, resolution anchors and Migration, and explicitly selects the new center. Origin-based bass placement prevents cumulative octave drift; mute slots remain muted. With fewer than four active slots, a complete triad is not always possible, but the bass remains tonic. Existing Migration resumes within chapters, distinct from chapter events. Chapters and fade-out events have exact active timestamps in HISTORY and JSON.

STOP accounts the final partial tick; RESUME and suspend reset the audio-clock anchor and reconstruct the remaining gate envelope. Browser-hidden time continues while audio runs; OS/audio suspension freezes audio time. If JavaScript is frozen while audio runs, the scheduled gate reaches silence; on wake the journey catches up once and discards the old graph. It does not replay missed chords. This cannot force audio execution when the OS suspends the process.

## Extended controls

| Control | Old UI max → new max | Actual extended effect |
|---|---|---|
| Crush | .85 → 1.7 | Sample-hold down to ~180 Hz, minimum two-bit quantization, pre/reconstruction filtering and DC removal; fixed coarse quantizer crossfade without AudioWorklet |
| Beating | .85 → 1.7 | Doubled independent detune/control modulation |
| Turbulence | .9 → 1.8 | Deeper amplitude erosion; bounded amplitude modulation |
| Wandering | .65 → 1.3 | Larger pitch excursions; oscillator amplitude remains bounded, no recursive feedback |
| Dry/Wet Tape | 1 → 2 | ±8 cents dry wow; doubled wet delay modulation |
| Shimmer | .85 → 1.7 | Stronger return (capped at unity) plus over-range wet pitch smear |
| Shimmer decay | 10.5 → 21 s | Longer requested decay, individual loop gains still capped at .94 |
| Diffusion | 1 → 2 | Fully diffused at 1, further depth lowers tail damping cutoff (smearing/dark collapse) |
| Reverb | .85 → 1.7 | Larger return capped at .85, deeper spectral damping |
| Delay | .52 → 1.04 | Return capped at .65; over-range introduces up to ±40 ms tape-time instability |
| Drive | .9 → 1.8 | Doubled excitation into existing 4× oversampled nonlinear curves, compensated output |
| Character | 1 → 2 | Full wavefold at 1, further excitation above 1 |
| Saturation mix | .76 → 1.52 | Wet blend limited to .95; additional excitation above .76 rather than negative dry gain |

Volume stays unchanged. Feedback remains .65 maximum in DSP, .5 in automatic/UI controls; comb loops .94, allpass loops .45. `saturationPost` remains a placement switch/morph. Spectrum, envelopes, detune and inharmonicity are not doubled. Automatic inharmonicity stays ≤8% (usually 0–3%; DISSOLVE ~6%). A final 25 Hz DC blocker, compressor and oversampled soft ceiling protect the final output. No new recurring timers or per-chord graphs.

DISSOLVE intentionally enters crush/drive/fold/turbulence destruction; HAZE enters extended spatial breakdown. HOLLOW/CLEAR preserve sparse transparent destinations; GLOW remains between them. Seeded one-hour tests confirm all extended controls exceed old bounds in automatic scenes. Manual overrides still hold 35s and return over 12s; Depth, freeze/hold, profile variation and history snapshots remain.

## Color and verification

24 tonic/mode keys × five scenes produce 120 deterministic, distinct hue identities with scene-dependent secondary hue and dark surfaces. Background, full field, headings, time, texture, borders, controls and pitch traces change. CSS color properties interpolate over ten seconds across chapter handoffs; reduced-motion users disable transitions. Glow lightness is adapted to meet 4.5:1 contrast over the brightest field color. Main text stays light; accent controls have dark text. Layout is retained.

Final checks: `npm test` passed 67/67; `npm run build` passed. Existing browser UI regression passed (start, moving knobs, bounded lazy oscillators, stop/resume, suspend, background, 1440×900 / 1366×768 / 390×844 / 1093×614). Chapter browser probe passed five handoffs through chapter 6, all old contexts closed, six voices retained, fresh one-chord inference and distinct palette ids. Manual extended controls, suspend/resume and hidden playback passed with no page errors.

Seeded 48 kHz offline Chrome renders (18 s each): maximum peak across all test cases 0.143265; all extended effects peak 0.061949 / RMS 0.010501 / maximum adjacent sample delta 0.006793. These are normalized samples, not calibrated listening levels. Fade-out output after 8 seconds was exactly zero, slow fade-in energy increased as expected, stop tails were zero. Native fallback also passed (peak 0.074766). Repeated chapters retained 162 counted voice nodes and zero retiring voices; ordinary moves reused voices. Global graph resources are closed at each handoff. Palette endpoint contrast minimum 4.5007:1 over the brightest field.

See `chapter-browser-results.json` and `rupture-audio-results.json` for recorded measurements. Browser scripts use local-only instrumentation; no testing hooks are shipped. Seeded tests accelerate time without waiting fifteen real minutes. Actual long-duration mobile/background device behavior and subjective musical quality still require listening/device testing. Headless tests do not establish OS audio-thread CPU utilization; fixed allocation counts, graph reuse and repeated graph closure are checked instead.
