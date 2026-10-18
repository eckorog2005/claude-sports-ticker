import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Game } from '../types'
import {
  DEFAULT_CONFIG,
  parseConfig,
  parseScoreboard,
  scoreboardUrl,
  scoreChanges,
  segmentsLength,
  selectGames,
  toSegments,
  windowSegments,
} from './ticker'
import type { Config } from './ticker'

const games = atom({ plugin: 'sports-ticker', key: 'games' } as const, [])
const offset = atom({ plugin: 'sports-ticker', key: 'offset' } as const, 0)
const error = atom({ plugin: 'sports-ticker', key: 'error' } as const, null)

const SCROLL_MS = 300

let config: Config = DEFAULT_CONFIG
let poller: Timer | undefined
let pollSeconds = 0
let bandWidth = 0
let shownLength = 0
let seen = new Map<string, Game>()

async function loadConfig($: EngineInterface): Promise<void> {
  const path = `${await $.env.get('HOME')}/.claude/sports-ticker.json`
  if (!(await $.fs.exists(path))) {
    await $.fs.write(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n')
  }
  try {
    config = parseConfig(await $.fs.read(path))
  } catch {
    await update($, error, () => `Couldn't parse ${path}`)
  }
}

type Fetched = { text: string } | { failure: string }

// ESPN's Akamai edge answers 403 to the host's default `Bun/*` User-Agent, so send our own.
async function fetchText($: EngineInterface, url: string): Promise<Fetched> {
  const res = await $.http.fetch(url, { headers: { 'User-Agent': 'claude-sports-ticker' } })
  return res.ok ? { text: res.text } : { failure: `HTTP ${res.status}` }
}

async function refresh($: EngineInterface): Promise<void> {
  await loadConfig($)
  const results = await Promise.all(
    config.leagues.map(async league => {
      const url = scoreboardUrl(league)
      if (!url) return { league, failure: 'unknown league', games: [] as Game[] }
      try {
        const got = await fetchText($, url)
        if ('failure' in got) return { league, failure: got.failure, games: [] as Game[] }
        return { league, failure: undefined, games: parseScoreboard(league, got.text) }
      } catch (err) {
        return { league, failure: String(err), games: [] as Game[] }
      }
    }),
  )
  const all = results.flatMap(r => r.games)
  for (const message of scoreChanges(seen, all, config)) $.ui.toast(message)
  seen = new Map(all.map(g => [g.id, g]))

  const failures = results.flatMap(r => (r.failure ? [`${r.league}: ${r.failure}`] : []))
  await update($, games, () => selectGames(all, config.teams))
  await update($, error, () => (failures.length ? `No scores for ${failures.join('; ')}` : null))

  if (config.refreshSeconds !== pollSeconds) {
    poller?.cancel()
    pollSeconds = config.refreshSeconds
    poller = $.clock.every(pollSeconds * 1000, () => void refresh($))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ticker',
      description: 'Refresh the sports ticker now (re-reads ~/.claude/sports-ticker.json)',
    })
    void refresh($)
    $.clock.every(SCROLL_MS, () => {
      if (config.scroll && bandWidth > 0 && shownLength > bandWidth) {
        void update($, offset, n => n + 1)
      }
    })
    return next(e)
  })

  on('command.run', { command: 'ticker' }, async $ => {
    await refresh($)
    const count = (await read($, games)).length
    const problem = await read($, error)
    const summary = `Sports ticker refreshed: ${count} game${count === 1 ? '' : 's'}.`
    return { text: problem ? `${summary} ${problem}` : summary }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, games)
    const problem = await read($, error)

    if (list.length === 0) {
      shownLength = 0
      return (
        <Box>
          <Text dimColor wrap="truncate">{problem ?? 'No games on the scoreboard right now'}</Text>
        </Box>
      )
    }

    const segments = toSegments(list)
    bandWidth = e.props.bodyColumns
    shownLength = segmentsLength(segments)
    // Proportional fonts off the terminal fit more than bodyColumns characters; overshoot and let the clip cut it.
    const windowWidth = e.surface === 'terminal' ? bandWidth : bandWidth * 2
    const visible = config.scroll && shownLength > bandWidth
      ? windowSegments(segments, await read($, offset), windowWidth)
      : segments

    // The desktop app wraps Text despite wrap="truncate"; non-shrinking items in a clipped row cannot wrap.
    return (
      <Box height={1} overflow="hidden" flexDirection="row" flexWrap="nowrap">
        {visible.map(s => (
          <Box flexShrink={0}>
            <Text color={s.color}>{s.text}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
