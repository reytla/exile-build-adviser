# Contributing

Thanks for helping. This page explains how the project is built and tested, and the rules the advice follows.

## Build

The page `poe2-advisor.html` is generated. Do not edit it by hand: change the files in `src/` (or `docs/pob-setup.html`) and rebuild. Requires Node.js 18 or later.

```sh
node tools/build.js --offline   # rebuild the page from src/ and the bundled game data
node tools/build.js             # download fresh Path of Building data first (after a game patch)
```

`tools/build.js` inlines the CSS and scripts, the game data snapshot (`data/snapshot.json`), the example build (`data/example-build.txt`) and the setup sheet (`docs/pob-setup.html`) into one file.

## Test

Rules must work for every class and play style, so test against many characters and not only the example.

```sh
node tools/fetch-corpus.js <dir>   # one public ladder build per ascendancy from poe.ninja
node tools/survey.js <dir>         # every finding for every build (V=1 adds the reasons)
node tools/regress.js <dir>        # loads each build in headless Chrome; must end "failures: 0 of N"
```

Keep the downloaded builds **outside** the repository. They are other players' characters; never commit them. `regress.js` expects Chrome at its default Windows path, or set the `CHROME` environment variable.

Read the survey output for false positives after any rule change. If a rule fires on level-100 ladder characters, it is probably wrong.

## How the code is organised

| File | Role |
|---|---|
| `src/pobdata.js` | Parses Path of Building's data files (passive tree, gems, skills, item bases) and ports PoB's support-compatibility check. |
| `src/character.js` | Decodes a build code (URL-safe base64, zlib, XML) and reads the character. |
| `src/analysis.js` | The check-up rules. Each finding has a severity, a certainty, why, effect, action and goal weights. |
| `src/plan.js` | Goal weights, the price table, costs, value-for-cost ranking, trade links, crafting steps, stash matches. |
| `src/guide.js` | Compares the build with a guide's PoB code and/or text, and checks whether the guide is out of date. |
| `src/lookup.js` | Account lookup through poe.ninja, with an optional proxy. |
| `src/app.js`, `src/index.html`, `src/style.css` | The interface. |

Every script is a UMD module, so it runs both in the page and in Node (the tools use it that way).

## Rules for advice

- **Never guess.** Anything that cannot be worked out from the build or the game data is shown as "unknown". Prices come only from the player's own price table.
- **Be honest about certainty.** `sure` means straight from game data or Path of Building's numbers; `likely` (shown as "probably") means something the page cannot see could change it; `check` means the page cannot settle it.
- **Data-driven only.** Use skill types, item classes, stat text and PoB's own numbers. No lists of specific classes, skills or builds.
- **Plain language.** Short, direct sentences written for the player. Errors say what went wrong and what to do next.

## Design

- Use the CSS tokens at the top of `src/style.css`; no hard-coded colours. Light and dark themes must both work.
- Check the page at about 390 px wide (phones).
- Keep it a single file under about 2 MB. Google Fonts is the only external resource, with fallback fonts.

## Instructions for Path of Building

`docs/pob-setup.html` was checked step by step against Path of Building for PoE 2 v0.23.1 (its import screen, sign-in and local sign-in listener). Things that confuse new players, and the sheet covers them:

- Sign-in must be approved in the browser within **30 seconds**. A slow Steam sign-in leads to "localhost refused to connect".
- The sign-in page is on pathofexile.com and shows Path of Exile 1 artwork; both games share one account.
- When already signed in, PoB shows a **Start** button instead of the character list.
- The Code box can hold an empty build's code before anything is imported; the advisor rejects empty builds.

When Path of Building releases a new version, re-check the sheet against it.

## When the game patches

1. Run `node tools/build.js` to download fresh data.
2. Update the default "current patch" in `src/app.js` (`GUIDE_DEFAULT`).
3. Run the survey and the regression test.
4. Re-read any advice text that names specific game mechanics.
