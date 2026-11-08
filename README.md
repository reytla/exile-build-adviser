# Exile Build Advisor

A build check-up for **Path of Exile 2**. Paste your character's build code from Path of Building and the advisor shows what is holding the character back, why it matters, what fixing it gains, what it costs, and what to do. The best-value fixes come first.

It is a single HTML file that runs entirely in your browser. There is nothing to install, no account and no upload.

## Using it

**Online:** open **https://reytla.github.io/exile-build-adviser/** in any modern browser.

**Offline:** download [`poe2-advisor.html`](poe2-advisor.html) and open the file. It works without an internet connection.

1. Open the advisor online or offline, using one of the options above.
2. Click **How to use** at the top for a 10-minute tutorial, or **Try an example build** to look around first.
3. To check your own character, export it from [Path of Building for PoE 2](https://pathofbuilding.community) (Import/Export Build → import your character → Build Sharing → Generate → Copy) and paste the code into the page.

The page works offline. Only the fonts, the trade links, the optional game-data refresh and the optional account lookup go online.

## What it does

| Tab | Shows |
|---|---|
| **Check-up** | Ranked findings, each with why it matters, what fixing it gains, its cost and the steps to take. Rate damage, survivability, mana, ease of play and progression to change the order. |
| **Guide** | Compares your build with a guide's PoB code or pasted text (skills, supports, passives, ascendancy order, stat priorities, uniques). Warns when the guide is older than the current patch. |
| **Overview / Skills / Gear / Passive tree** | Your character in plain language: resistance gauges, skill costs with supports, Spirit reservations, items and allocated passives. |
| **Your details** | League, budget, spare currency, stash items (Ctrl+C from the game) and your own price table. |
| **Game data** | Which Path of Building data the page uses, with a button to download the latest. |

The check-up looks for:
- resistances below the cap;
- weak spots against hits of one damage type;
- unmet attribute requirements;
- Spirit problems;
- mana that runs out;
- supports that cannot affect their skill;
- gems below the level your character allows;
- unspent passive points;
- passives and gear mods that do nothing for your build.

Every rule works from game data, so it applies to every class and ascendancy. Anything the page cannot work out is labelled **unknown**. Prices are never guessed: you enter them yourself.

## Building from source

The page is generated from `src/`. Requires [Node.js](https://nodejs.org) 18 or later.

```sh
node tools/build.js --offline   # rebuild poe2-advisor.html from src/ and the bundled game data
node tools/build.js             # first download fresh game data from Path of Building, then rebuild
```

Testing (see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full method):

```sh
node tools/fetch-corpus.js <dir>   # fetch public ladder builds from poe.ninja (keep them outside this folder)
node tools/survey.js <dir>         # print every finding for each build
node tools/regress.js <dir>        # load each build in headless Chrome; expect "failures: 0"
```

## Project layout

```
src/            page source: index.html, style.css and one script per stage
  pobdata.js    parses Path of Building's data files (tree, gems, skills, item bases)
  character.js  decodes a build code and reads the character
  analysis.js   the check-up rules
  plan.js       goals, prices, costs, ranking, trade links
  guide.js      guide comparison
  lookup.js     account lookup through poe.ninja
  app.js        the user interface
data/           bundled game data snapshot and the example build
tools/          build and test scripts
docs/           the Path of Building setup sheet (also built into the app)
CONTRIBUTING.md how to build, test and change the rules
```

## Data and credits

- Game data comes from the [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2) project (MIT licence).
- Trade links use the official Path of Exile trade site. The account lookup uses [poe.ninja](https://poe.ninja).
- Path of Exile and its game data are © Grinding Gear Games. This project is not affiliated with or endorsed by Grinding Gear Games, Path of Building Community or poe.ninja.
- Fonts: Marcellus SC, Figtree and IBM Plex Mono (SIL Open Font License), via Google Fonts.

## Feedback and contributing

Found a wrong finding, a confusing step or a bug? Open an issue on this repository and include the build code if you can. Pull requests are welcome; read [`CONTRIBUTING.md`](CONTRIBUTING.md) first.

## Licence

MIT, © 2026 reytla. Free to use, change and share. See [`LICENSE`](LICENSE). Third-party material is listed in [`NOTICE`](NOTICE).
