# clawpit

An instrument panel above the prompt and a crew pane beside it, for the Claude Code desktop app.

- **The panel** shows what matters right now: context left and when it auto-compacts, the 5-hour and 7-day limits against pace, this turn's clock, lines changed and cost, the session's cost and tokens, tests, and the Hydra plan's phase and tasks. Columns appear only when they have something to say and fit the width.
- **The Agents pane** is a roster of every subagent and crew: who needs you, who is running, who has ended. Each one is a pixel crab holding the tool it's using, with time left, its steps, and a log that opens with a click.
- **Three sizes**, switched by one icon: everything, agents folded, or one line.
- **Calm by rule:** nothing moves while idle, motion uses stepped loops only, and colours are fixed and contrast-checked in light and dark.

> **Status:** design locked, build not started. The preview below is the design mockup, not the running mod.

<!-- preview: refreshed after every visual change, see AGENTS.md -->

## Docs

- [`docs/decisions/`](docs/decisions/): the locked design decisions, the animation budget, and the file tree decision.
- [`docs/plans/`](docs/plans/): build plans.
- [`design/`](design/): the interactive mockup. Open `design/mockups-all.html` in a browser; add `?theme=dark` or `?theme=light`.

## Licence

MIT
