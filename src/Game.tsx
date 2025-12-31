import { type Vector2, vector } from './math/Vector2.ts'
import { v4 as uuid } from 'uuid'

export type Soldier = {
  position: Vector2
  // TODO: This is Player id
  unitId: string
}

export type Player = {
  position: Vector2
}

export type PlayerInput = {
  movingDirection: Vector2
}

export type GameState = {
  players: Record<string, Player>
  inputs: Record<string, PlayerInput>
  soldiers: Record<string, Soldier>
}

export function createInitialState(playerIds: string[]): GameState {
  const players: Record<string, Player> = {}
  playerIds.forEach((id, index) => {
    players[id] = {
      position: vector(index * 50, 300),
    }
  })
  return { players, inputs: {}, soldiers: {} }
}

export function handlePlayerJoin(state: GameState, playerId: string): void {
  if (state.players[playerId]) {
    return
  }
  const soldier = { position: vector(100, 100), unitId: playerId }

  const soldierId = uuid()
  state.soldiers[soldierId] = soldier

  const index = Object.keys(state.players).length
  state.players[playerId] = {
    position: vector(index * 50, 300),
  }
}

export function handlePlayerLeave(state: GameState, playerId: string): void {
  delete state.players[playerId]
  delete state.inputs[playerId]
}

// TODO: REMOVE THIS COMMENT (AND JOHANNES)
