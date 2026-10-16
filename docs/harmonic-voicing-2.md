# Harmonic Voicing 2.0

A chord's pitch classes describe its harmony; the six actual MIDI slots describe
its register and voice leading. These identities now have separate jobs:

- `soundKey`: harmonic novelty, recent-return/bounce penalties, distinct manual proposals.
- `voicingKey`: candidate identity and Migration pool merging, preserving MIDI slots/mutes.
- Internal register key: sorted MIDI multiset, to avoid spending the search budget on permutations.

## Search and ranking

`voiceChord` remains the original minimum-motion coverage DP. `voiceChordVariants`
retains that exact result and explores four paths per coverage mask at each active
slot, returning at most three distinct MIDI multisets **including** the original.
This is bounded approximate search, not an exhaustive/global acoustic optimum.
All required pitch classes must be covered; the original MIDI 12–127 and per-slot
7-semitone limits remain hard constraints. Scale transformations still preserve
their complete multiset through `assignVoices`. Generated paths retain their own
slot assignment rather than being collapsed back through a second optimization.
Equivalent target sets share search results within one pool computation. Harmonic
eligibility is checked before searching. There is no cache of histories/pools.

`voicingColor` adds a bounded acoustic preference, with no chord-type whitelist:

- Actual intervals below five semitones contribute crowding in proportion to how
  far their lower note lies below MIDI 60 (saturating at MIDI 36).
- A small bass-space reward saturates at seven semitones; it does not reward
  unbounded widening. High seconds and ninths are not forbidden.
- A lightweight pairwise beating/roughness kernel uses a fixed fundamental and
  partials 2/3/4/6 with relative weights 1/.30/.22/.14/.09, referencing `audio.js`.
  This is a fixed harmonic reference, not a measurement of changing Character,
  Bloom, filtering, effects, stretching, or the actual rendered waveform.
- Pair values are cached for valid MIDI notes only (at most 6,786 entries).
- A soft, capped register tether starts after one octave of bass/mean-register
  displacement from the origin, to resist gaming the acoustic proxy by climbing
  indefinitely (or sinking). This never quantizes or forbids a harmony.

The color score is in [-6, .8], weighted .7 normally and .35 on Edge. Autoplay
reduces its contribution by up to 65% with Wander. Existing progression, common
tones, retained notes, per-slot motion, outer-voice leaps, harmonic tension,
accepted-edge resolution and actual Migration-arrival logic remain in force.
The register tether costs at most four score points and is independent of key.

Autoplay normalizes the total lottery weight of each pitch-class family by its
number of eligible variants (subtracting temperature * log(count)); manual
proposals use the equivalent division and remove the selected harmonic family.
This avoids multiplying harmonic probability merely by generating more layouts.
Different layouts can still win on their score. A manual reroll continues to show
up to four distinct harmonies. No WARMTH control was added: the existing UI, DSP,
Inharmonicity and background-clock implementation are unchanged.

## Reproduction

```sh
npm test
npm run build
node scripts/voicing-simulation.mjs . new.json
# Point at a separate checkout of e8b87bf6c36d240885e4ddd24da630ae6d4a9122:
node scripts/voicing-simulation.mjs /path/to/baseline old.json
```

The simulation runs the real `Journey`, including Wander, accepted Edge,
resolution and evidence-based Migration arrivals. It advances active time in
500 ms increments, with Pace 12 and texture complexity fixed at zero. Seeds 23
and 91 use default controls (.25 Wander/.08 Edge); seed 19 uses 1/1 to exercise
adventure. It records cumulative 10/30/60 minute checkpoints, not three separate
sessions. Each adopted transition checks MIDI bounds, hard leaps, bounded
accepted history and Edge cooldown. Pool diversity is sampled at checkpoints;
adopted harmonic/register diversity and crowding/roughness are cumulative.
Wall-clock timings include the whole Journey transition; compare serial runs on
the same machine. This is simulated active time, not a real-hour audio soak.

See `voicing-validation.md` and its raw JSON for the measured comparison and
browser limitations. Musical pleasantness still requires human listening.
