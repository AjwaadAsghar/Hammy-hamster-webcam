# Hammyhamster

Point your webcam at yourself and pull faces / gestures - a hamster meme reacts live next to your camera feed. Runs entirely in the browser - see [web/README.md](web/README.md).

## Gestures

| Do this | You get |
|---|---|
| Nothing / no match | poker face hamster |
| Thumbs up (away from your face) | thumbs up hamster |
| Thumbs down (away from your face) | thumbs down hamster |
| Closed fist held beside your head | lollipop hamster |
| Pinch (thumb + index touching) near your face | glasses hamster |
| Index finger near your mouth | finger-near-mouth hamster |
| Index finger up, away from your mouth | nerd hamster |
| Bent elbow, wrist raised above shoulder, elbow out to the side | bicep hamster |
| Both wrists tucked together at chest height (crossed arms - hands can be hidden) | crossed-arms hamster |
| One hand on each cheek | shy hamster |
| Hands clasped together at mouth/chin height | thinking hamster |
| Hands clasped together at chest height, below your face | hug hamster |
| Head tilted down | sad hamster |
| Two hands visible, no other match | truck hamster |
| Turn your head to the side | side-eye hamster |

Priority order when multiple things could apply: pinch, then fist-beside-head/thumbs, then pointer (mouth/nerd), then shy/thinking/hug (two-hand shape+position), then crossed-arms/bicep (pose-based fallback), then two-hands, then head-tilt-down (sad), then head-turn (side-eye), then default.

The "sad" gesture reads head pitch off the same face-transformation-matrix trick `side_eye` uses for yaw; if it triggers on an upward tilt instead of downward, flip the sign in `headPitchDegrees` in `web/app/lib/gestures.ts`.

A debug readout in the top-left of the camera feed shows face detection state and head yaw/pitch live, and a green skeleton overlay tracks your hand - useful for checking a gesture is being read correctly. It's on by default; press `d` to hide it for a cleaner view. The current gesture is always shown as a pill in the header.

## Requirements

- A webcam
- A modern browser (camera access needs HTTPS or localhost)
