# Resolved: ESPN returned HTTP 403 inside Claude Code

`/ticker` reports `HTTP 403` for every league when the mod fetches through `$.http.fetch`,
while `curl` and Node `fetch` to the same URLs from this machine return 200 with full data.
The parser is fine: run outside Claude Code it finds games for nfl, nba, nhl and ncaaf.

Not the cause: a `WebFetch(domain:site.api.espn.com)` allow rule (tried, then removed).

Also not the cause: User-Agent. curl gets 200 with an empty, browser, `Claude-User` or
`claude-code/...` User-Agent. No proxy env vars or sandbox settings are set.

Confirmed: the 403 comes from ESPN's Akamai edge (`Server: AkamaiGHost`, "Access Denied" page).
Fix in `fetchText()` (`hooks/register.tsx`): every scoreboard is fetched with `curl` via
`$.process.run`; `$.http.fetch` is no longer used. This needs `curl` on PATH and works in the
CLI only, since `$.process` is CLI only.
