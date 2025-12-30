import { type Vector2, vector } from './math/Vector2.ts'

export type Player = {
  position: Vector2
}

export type PlayerInput = {
  movingDirection: Vector2
}

export type GameState = {
  players: Record<string, Player>
  inputs: Record<string, PlayerInput>
}

export function createInitialState(playerIds: string[]): GameState {
  const players: Record<string, Player> = {}
  playerIds.forEach((id, index) => {
    players[id] = { position: vector(index * 50, 300) }
  })
  return { players, inputs: {} }
}

export function handlePlayerJoin(state: GameState, playerId: string): void {
  if (!state.players[playerId]) {
    const index = Object.keys(state.players).length
    state.players[playerId] = { position: vector(index * 50, 300) }
  }
}

export function handlePlayerLeave(state: GameState, playerId: string): void {
  delete state.players[playerId]
  delete state.inputs[playerId]
}

// TODO: REMOVE THIS COMMENT (AND JOHANNES)