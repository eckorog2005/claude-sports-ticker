export type GameState = 'pre' | 'in' | 'post'

export type Game = {
  id: string
  league: string
  state: GameState
  away: { abbr: string; score: number }
  home: { abbr: string; score: number }
  detail: string
}

export type Segment = { text: string; color?: 'success' | 'subtle' | 'warning' }

declare module 'claude-code' {
  interface PluginState {
    'sports-ticker': {
      games: Game[]
      offset: number
      error: string | null
    }
  }
}
