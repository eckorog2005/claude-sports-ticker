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

// ESPN's Akamai edge refuses Claude Code's own HTTP client with a 403 but serves curl.
async function fetchText($: EngineInterface, url: string): Promise<Fetched> {
  const curl = await $.process.run(['curl', '-sS', '--fail', '--max-time', '15', url])
  return curl.exitCode === 0 ? { text: curl.stdout } : { failure: `curl: ${curl.stderr.trim()}` }
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
    const visible = config.scroll && shownLength > bandWidth
      ? windowSegments(segments, await read($, offset), bandWidth)
      : segments

    return (
      <Box>
        <Text wrap="truncate">
          {visible.map(s => (
            <Text color={s.color}>{s.text}</Text>
          ))}
        </Text>
      </Box>
    )
  })
}
