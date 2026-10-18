# sports-ticker

A Claude Code mod that scrolls live sports scores in a band above the prompt.

```
NHL STL 2 @ NSH 3 · 2:50 - 3rd   •   NFL HOU @ JAX · 10/18 - 9:30 AM EDT   •   NBA BOS 98 @ DET 101 · Final
```

- Live games first (green), then upcoming, then finished (dimmed)
- Scrolls when the games don't fit on one line
- Optional pop-up notifications when a score changes or a game ends
- `/ticker` refreshes right away

## Requirements

- Claude Code in a terminal. The desktop app is not supported, because the mod runs `curl`.
- `curl` on your `PATH` (macOS and most Linux distributions include it)

## Install

At the Claude Code prompt:

```
/plugin install sports-ticker --marketplace eckorog2005/claude-sports-ticker
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Configure

The first run creates `~/.claude/sports-ticker.json`:

```json
{
  "leagues": ["nfl", "nba"],
  "teams": [],
  "refreshSeconds": 60,
  "scroll": true,
  "notify": "teams"
}
```

| Key | Meaning |
| --- | --- |
| `leagues` | `nfl`, `ncaaf`, `nba`, `wnba`, `ncaab`, `mlb`, `nhl`, `mls`, `epl`, `laliga`, `ucl`, or any ESPN path such as `"soccer/ger.1"` |
| `teams` | ESPN team abbreviations, e.g. `["NYJ", "BUF", "NYR"]`. Empty shows every game in your leagues. |
| `refreshSeconds` | How often to fetch scores. Minimum 15. |
| `scroll` | Scroll the band when the games don't fit on one line |
| `notify` | `"teams"` notifies for the teams you list, `"all"` for every game, `"off"` never |

The file is re-read on every refresh, so edits apply within `refreshSeconds`, or straight away with `/ticker`.

## Development

```sh
claude --plugin-dir .            # run it from this folder
claude plugin validate .         # check the manifest and hooks module
claude plugin test .             # run tests/*.test.ts
```

Logic that doesn't touch Claude Code (parsing, formatting, scrolling, notifications) lives in `hooks/ticker.ts`. The band, timers and fetching are in `hooks/register.tsx`.

`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which Claude Code generates the first time it loads the mod. Load it once with `--plugin-dir` before type-checking.

## Disclaimer

Not affiliated with or endorsed by ESPN. Scores come from ESPN's public but undocumented scoreboard endpoints, which can change or stop working without notice. Intended for personal use.

## License

MIT
