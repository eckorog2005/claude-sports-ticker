import type { Game, GameState, Segment } from '../types'

export type Notify = 'teams' | 'all' | 'off'

export type Config = {
  leagues: string[]
  teams: string[]
  refreshSeconds: number
  scroll: boolean
  notify: Notify
}

export const DEFAULT_CONFIG: Config = {
  leagues: ['nfl', 'nba'],
  teams: [],
  refreshSeconds: 60,
  scroll: true,
  notify: 'teams',
}

export const LEAGUES: Record<string, string> = {
  nfl: 'football/nfl',
  ncaaf: 'football/college-football',
  nba: 'basketball/nba',
  wnba: 'basketball/wnba',
  ncaab: 'basketball/mens-college-basketball',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
  mls: 'soccer/usa.1',
  epl: 'soccer/eng.1',
  laliga: 'soccer/esp.1',
  ucl: 'soccer/uefa.champions',
}

export function scoreboardUrl(league: string): string | undefined {
  const path = LEAGUES[league.toLowerCase()] ?? (league.includes('/') ? league : undefined)
  return path && `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`
}

// The host prefixes a rejected fetch with the error class, plugin and full URL, which pushes the reason off the band.
export function fetchFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^(?:\w*Error: )?(?:[\w-]+: )?\$\.http\.fetch\([^)]*\)[:\s]*/, '') || message
}

export function parseConfig(text: string): Config {
  const raw = JSON.parse(text) as Partial<Config>
  const notify: Notify[] = ['teams', 'all', 'off']
  return {
    leagues: Array.isArray(raw.leagues) ? raw.leagues.map(String) : DEFAULT_CONFIG.leagues,
    teams: Array.isArray(raw.teams) ? raw.teams.map(t => String(t).toUpperCase()) : [],
    // ESPN is free but unofficial; polling faster than this risks getting throttled.
    refreshSeconds: Math.max(15, Number(raw.refreshSeconds) || DEFAULT_CONFIG.refreshSeconds),
    scroll: raw.scroll ?? DEFAULT_CONFIG.scroll,
    notify: notify.includes(raw.notify as Notify) ? (raw.notify as Notify) : DEFAULT_CONFIG.notify,
  }
}

type EspnCompetitor = { homeAway: 'home' | 'away'; score?: string; team: { abbreviation: string } }
type EspnEvent = {
  id: string
  status: { type: { state: GameState; shortDetail: string } }
  competitions: { competitors: EspnCompetitor[] }[]
}

export function parseScoreboard(league: string, text: string): Game[] {
  const { events = [] } = JSON.parse(text) as { events?: EspnEvent[] }
  return events.flatMap(event => {
    const sides = event.competitions[0]?.competitors ?? []
    const side = (where: 'home' | 'away') => {
      const c = sides.find(s => s.homeAway === where)
      return c && { abbr: c.team.abbreviation, score: Number(c.score ?? 0) }
    }
    const home = side('home')
    const away = side('away')
    if (!home || !away) return []
    return [{
      id: event.id,
      league: league.toUpperCase(),
      state: event.status.type.state,
      home,
      away,
      detail: event.status.type.shortDetail,
    }]
  })
}

export function involves(game: Game, teams: string[]): boolean {
  return teams.includes(game.home.abbr) || teams.includes(game.away.abbr)
}

const ORDER: Record<GameState, number> = { in: 0, pre: 1, post: 2 }

export function selectGames(games: Game[], teams: string[]): Game[] {
  const shown = teams.length ? games.filter(g => involves(g, teams)) : games
  return [...shown].sort((a, b) => ORDER[a.state] - ORDER[b.state])
}

export function formatGame(game: Game): string {
  const { away, home } = game
  const matchup = game.state === 'pre'
    ? `${away.abbr} @ ${home.abbr}`
    : `${away.abbr} ${away.score} @ ${home.abbr} ${home.score}`
  return `${game.league} ${matchup} · ${game.detail}`
}

export const SEPARATOR = '   •   '

export function toSegments(games: Game[]): Segment[] {
  return games.flatMap((game, i) => {
    const color = game.state === 'in' ? 'success' : game.state === 'post' ? 'subtle' : undefined
    const item: Segment = { text: formatGame(game), color }
    return i === 0 ? [item] : [{ text: SEPARATOR, color: 'subtle' as const }, item]
  })
}

export function segmentsLength(segments: Segment[]): number {
  return segments.reduce((n, s) => n + s.text.length, 0)
}

/** A `width`-wide window into the segments repeated end to end, starting `offset` characters in. */
export function windowSegments(segments: Segment[], offset: number, width: number): Segment[] {
  const loop = [...segments, { text: SEPARATOR, color: 'subtle' as const }]
  const total = segmentsLength(loop)
  if (total === 0 || width <= 0) return []
  let skip = ((offset % total) + total) % total
  let room = width
  const out: Segment[] = []
  for (let i = 0; room > 0; i = (i + 1) % loop.length) {
    const seg = loop[i]!
    if (skip >= seg.text.length) {
      skip -= seg.text.length
      continue
    }
    const text = seg.text.slice(skip, skip + room)
    skip = 0
    room -= text.length
    out.push({ ...seg, text })
  }
  return out
}

export function scoreChanges(before: Map<string, Game>, after: Game[], config: Config): string[] {
  if (config.notify === 'off') return []
  return after.flatMap(game => {
    const prev = before.get(game.id)
    if (!prev) return []
    if (config.notify === 'teams' && !involves(game, config.teams)) return []
    const scored = prev.home.score !== game.home.score || prev.away.score !== game.away.score
    const ended = prev.state !== 'post' && game.state === 'post'
    if (ended) return [`Final: ${formatGame(game)}`]
    if (scored && game.state === 'in') return [`Score! ${formatGame(game)}`]
    return []
  })
}
