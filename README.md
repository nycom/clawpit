# clawpit

An instrument panel above the prompt and a crew pane beside it, for the Claude Code desktop app.

- **The panel** shows what matters right now: context left and when it auto-compacts, the 5-hour and 7-day limits against pace, this turn's clock, lines changed and cost, the session's cost and tokens, tests, and the Hydra plan's phase and tasks. Columns appear only when they have something to say and fit the width.
- **The Agents pane** is a roster of every subagent and crew: who needs you, who has failed, who is running, what runs in the background, who has ended. Each agent is a pixel crab holding the tool it's using, with time left, its steps, and a log that opens with a click.
- **One Agents pane:** on the desktop, savvy-progress's `/agents-info` opens this pane (it opens; it no longer toggles), so there is one tab named Agents. `/agents-info savvy` opens savvy-progress's own pane, the way to its ended background history, planned rows and `/status` line. In a terminal attached to a desktop session the redirected pane draws nothing there; use `/agents-info savvy`. Sessions with no desktop attached keep savvy-progress's pane.
- **One-time setup:** a clawpit or savvy-progress setting whose /config value is still "unasked" is asked once, directly under the Agents pane's head, with Yes and No. The answer is saved as if picked in /config, where it can be changed any time; the question waits while anything needs you or has failed. A write that is refused is not asked again.
- **/clawpit-setup** ("Set up clawpit and savvy-progress") walks the boolean and choice settings of clawpit and savvy-progress with the engine's dialog, one question per setting, the current value first and marked "(current)"; "unasked" is never offered. Answers are written at the end, savvy-progress keys first, then clawpit's own. A choice with more than 4 values shows the current value and the next three; the rest is set in /config. Text, number and list settings are counted and left to /config. The developer setting `clawpit.bench` is skipped. A dismissed dialog keeps the earlier answers. No model call. The result is one line: "Saved N settings. M other settings are edited in /config." (singular for one setting; the second sentence is left out when nothing was skipped) On a CLI without `$.config` or `$.ui.ask` it says "Setup needs a newer Claude Code; use /config."
- **Agent cost:** the pane hides the agent cost (the cost at the end of the head summary and the drawer's cost row) when savvy-progress's `showCost` setting is off. The session and turn costs in the costs view stay. A missing row shows cost as today.
- **Session need:** when the main session itself waits on you (savvy-progress's `need` atom), the Agents pane shows the session row in Needs you. It is not an agent, and the row is not pressable. In the panel above the prompt the need shows as a red chip and as the folded crab's face; pressing either opens the pane. With one agent, in any state, the folded agents column still names that agent; with none, it names the session. Without that atom nothing changes.
- **Background:** savvy-progress's background work (its `background` atom: shells and monitors that run, crons and wakeups that wait) shows in its own section after Running and before Ended, headed "Background 4 · 1 failed". Failed rows lead, on the needs-you tint, until your next prompt. Running rows read back: their age over "since 14:20". Under a hairline, waiting rows read forward, soonest first: a wakeup "in 7m" over "at 14:39", with a still track filled by the wait used; a cron its schedule, abbreviated ("every 10m", "hourly", "daily"; the full wording in the tooltip). Clock times follow Claude Code's time format setting, else the locale, in the machine's zone. An active row's Stop button stops the task (TaskStop, CronDelete, or ScheduleWakeup's stop, which ends every wakeup) and hides the row; a refused stop is toasted and the row stays; a task that is already gone just hides. Done and stopped rows hide (`/agents-info savvy` keeps the history). Background work is not an agent: it is in no count, the crew bar, the alerts or the loops. With no agents it reaches the pane through the folded column (labelled "background", led by the icon of what fires next), the one-line row and, at full size, one muted chip that says what fires next ("2 running · wakeup in 7m · 1 failed"). Without that atom nothing changes.
- **Plan ticks:** the tasks savvy-progress names done tick first; the rest of the done count ticks in plan order, skipping tasks with a live run. When no task is live, waiting or failed, and the bar is not naming its tasks (more than 8 tasks, or segments too narrow for names), the plan line's right-hand text gains a clause, "12/47 tasks · next: <first not-started task>". It follows "So-whats drop whole clauses": next: drops first, whole, when there is no room; the task name inside it may be cut with "…" but not under 8 characters, else the clause drops. The ETA stage words come from savvy-progress's `stages` atom, with clawpit's own list as the fallback (also when the atom is missing or unreadable). A word matches a run's description as a whole word, where ASCII letters, digits and `_` count as part of a word; it is compared as text, never as a pattern.
- **Three sizes**, switched by one icon: everything, agents folded, or one line.
- **Calm by rule:** nothing moves while idle, motion uses stepped loops only, and colours are fixed and contrast-checked in light and dark.

The ETA is kept per stage list: a word added to or removed from savvy's stages starts a new ETA key and leaves the old one in the store (nothing prunes `eta:` keys).

> **Status:** in development, not released. The preview below is the design mockup.

<!-- preview: refreshed after every visual change, see AGENTS.md -->
<picture>
  <source media="(prefers-color-scheme: light)" srcset="design/preview-light.png">
  <img alt="clawpit mockup: the panel above the prompt with gauges, the Hydra plan and agent chips, beside the Agents pane of pixel crabs" src="design/preview-dark.png">
</picture>

## Install

```
/plugin marketplace add nycom/clawpit
/plugin install clawpit@clawpit
```

clawpit needs savvy-progress installed: it reads savvy's crew data, and savvy's own band stands down while clawpit runs on the desktop.

Use savvy-progress from nycom/claude-kit main once its clawpit change has merged (nycom/claude-kit#9): it carries the step `reason` and `error` fields clawpit reads, and stands its band down on the desktop. Update savvy-progress first, then install or update clawpit.

## How it is tested

Unit tests run under the engine's mock (`claude plugin test plugin`). Playwright stills and motion counts run on a render harness (`npm run test:visual`). The helper scripts have their own tests (`npm run test:scripts`). In-app checks capture the app window and diff it pixel by pixel (`scripts/app-capture.sh`, `npm run app-diff`); the screenshots stay out of the repo.

## Docs

- [`AGENTS.md`](AGENTS.md): the rules for working in this repo. Read it before changing anything.
- [`docs/decisions/`](docs/decisions/): the locked design decisions, the animation budget, and the file tree decision.
- [`docs/plans/`](docs/plans/): build plans.
- [`design/`](design/): the interactive mockup. Open `design/mockups-all.html` in a browser; add `?theme=dark` or `?theme=light`.

## Licence

MIT
