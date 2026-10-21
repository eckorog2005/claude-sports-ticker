import { describe, expect, test } from 'claude-code/testing'

import {
  DEFAULT_CONFIG,
  fetchFailure,
  parseConfig,
  parseScoreboard,
  scoreboardUrl,
  scoreChanges,
  segmentsLength,
  selectGames,
  toSegments,
  windowSegments,
} from '../hooks/ticker'
import type { Game } from '../types'

const espn = JSON.stringify({
  events: [
    {
      id: '1',
      status: { type: { state: 'post', shortDetail: 'Final/OT' } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '17', team: { abbreviation: 'DEN' } },
        { homeAway: 'away', score: '14', team: { abbreviation: 'SEA' } },
      ] }],
    },
    {
      id: '2',
      status: { type: { state: 'in', shortDetail: '3rd 4:12' } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '7', team: { abbreviation: 'BUF' } },
        { homeAway: 'away', score: '3', team: { abbreviation: 'NYJ' } },
      ] }],
    },
  ],
})

const game = (over: Partial<Game> = {}): Game => ({
  id: '2', league: 'NFL', state: 'in', detail: '3rd 4:12',
  away: { abbr: 'NYJ', score: 3 }, home: { abbr: 'BUF', score: 7 }, ...over,
})

describe('sports ticker', () => {
  test('resolves league shortcuts and raw ESPN paths', async () => {
    expect(scoreboardUrl('NFL')).toBe('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')
    expect(scoreboardUrl('soccer/ger.1')).toBe('https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard')
    expect(scoreboardUrl('curling')).toBe(undefined)
  })

  test('parses config with defaults and normalizes teams', async () => {
    const config = parseConfig('{"leagues":["nhl"],"teams":["nyr"],"refreshSeconds":1}')
    expect(config.leagues).toEqual(['nhl'])
    expect(config.teams).toEqual(['NYR'])
    expect(config.refreshSeconds).toBe(15)
    expect(config.notify).toBe('teams')
  })

  test('parses the scoreboard and puts live games first', async () => {
    const games = selectGames(parseScoreboard('nfl', espn), [])
    expect(games.map(g => g.id)).toEqual(['2', '1'])
    expect(toSegments(games)[0]?.text).toBe('NFL NYJ 3 @ BUF 7 · 3rd 4:12')
  })

  test('filters to followed teams', async () => {
    expect(selectGames(parseScoreboard('nfl', espn), ['SEA']).map(g => g.id)).toEqual(['1'])
  })

  test('scroll window is exactly the band width and wraps around', async () => {
    const segments = toSegments(parseScoreboard('nfl', espn))
    const total = segmentsLength(segments)
    for (const at of [0, 5, total - 3, total + 40]) {
      expect(segmentsLength(windowSegments(segments, at, 20))).toBe(20)
    }
  })

  test('toasts score changes and finals for followed teams only', async () => {
    const config = { ...DEFAULT_CONFIG, teams: ['NYJ'] }
    const before = new Map([['2', game()]])
    expect(scoreChanges(before, [game({ home: { abbr: 'BUF', score: 14 } })], config))
      .toEqual(['Score! NFL NYJ 3 @ BUF 14 · 3rd 4:12'])
    expect(scoreChanges(before, [game({ state: 'post', detail: 'Final' })], config))
      .toEqual(['Final: NFL NYJ 3 @ BUF 7 · Final'])
    expect(scoreChanges(before, [game({ home: { abbr: 'BUF', score: 14 } })], { ...config, teams: ['SEA'] }))
      .toEqual([])
  })
})

describe('fetchFailure', () => {
  test('drops the host prefix and URL so the reason fits the band', () => {
    const err = new Error('HooksError: sports-ticker: $.http.fetch(https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard): timed out')
    expect(fetchFailure(err)).toBe('timed out')
  })

  test('keeps a message it does not recognise', () => {
    expect(fetchFailure('socket hang up')).toBe('socket hang up')
  })
})
