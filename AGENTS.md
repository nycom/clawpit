# Working in this repo

The baseline for everyone who changes clawpit. Short on purpose: read it all.

## Git and PRs
- Never commit to `main`. One branch per change: `<type>/<topic>`, type is `feat`, `fix`, `design`, `docs` or `chore`.
- Every change lands through a PR into `main`. Open a PR only on the maintainer's go.
- Merge commits only. Never squash.
- One topic per PR. The description says what changed, why, how it was checked, and what was not checked.
- Commit subjects: `area: what changed`, present tense.

## No tooling trace
Nothing that lands in the repo or on GitHub says how it was written:
- no co-author trailers;
- no "generated with" footers;
- no mention of AI, assistants or agent tooling in commits, PRs, issues, comments or docs;
- no agent-tooling paths (a tool's dot-folder, for example) in committed prose.

## Public repo hygiene
- Run `bash scripts/leak-check.sh` before every push. It must print `leak-check: clean`.
- Never commit local absolute paths, emails, tokens, personal names or scratch files.
- Docs say "the maintainer", never a person's name.

## Docs layout
- `docs/plans/`: plans, named `YYYY-MM-DD-<topic>.md`.
- `docs/decisions/`: locked decisions. Change one only with the maintainer's OK, and record the date.
- `design/`: the mockups.
- Push a plan or spec only after the maintainer approves it.

## The preview rule
After every visual change, in the same PR:
1. Refresh `design/mockups-all.html`.
2. Run `bash scripts/preview.sh`. It regenerates `design/preview-dark.png` and `design/preview-light.png` with headless Chrome from `design/mockups-all.html?theme=dark` and `?theme=light`.
3. Refresh the Playwright baselines in the same change: `npm run refresh:visual` runs it together with the previews.

Set `CHROME=<path>` if Chrome is not in the default macOS location.

## Design guardrails
The decisions are in [`docs/decisions/`](docs/decisions/). Ask before bending one.
- Fixed app colours from the token table in [`ALIGNMENT.md`](docs/decisions/ALIGNMENT.md), never the active skin ([`LOCKED.md`](docs/decisions/LOCKED.md), "Colours").
- Colour is never the only signal: pair it with a word, an icon or a shape.
- Nothing loops while idle. The one exception: a failed chip pulses for up to 10 minutes of idle, then goes still ([`LOCKED.md`](docs/decisions/LOCKED.md), "Failed chip").
- Stepped loops only, 0 eased loops ([`ANIMATION-LIMIT.md`](docs/decisions/ANIMATION-LIMIT.md)).
- Walkers: 3, or 2 while someone needs you.
- Reduced motion turns every animation and transition off.
- SVG icons. No glyphs as icons.
- Never `dimColor` on AbovePrompt buttons: dim buttons fold into the "…" menu.

## Quality gate, before asking for review
- Tests green: `claude plugin test plugin`, `claude plugin validate plugin`, `claude plugin test gauges`, `claude plugin validate gauges`, `npm run test:visual` and `npm run test:scripts`.
- The gauges plugin (`gauges/`) carries byte copies of the panel's files: after changing any of them, run `bash scripts/sync-gauges.sh` (CI fails until the copies match).
- Off macOS, `npm run test:visual` skips the `@shot` screenshot tests (their baselines are macOS renders) and runs the structural ones.
- The leak check is clean.
- The previews are refreshed if anything visual changed.
- Every unverified item is listed in the PR.

## How to work
- Keep changes small and in scope.
- Write the test first for logic.
- Ask instead of guessing on a design question.
- Never push to, or open a PR on, any other repo (upstream forks included) without the maintainer's OK.
