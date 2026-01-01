import { type Vector2, vector } from './math/Vector2.ts'
import { v4 as uuid } from 'uuid'
import { pseudoRandomColor } from './randomColor.ts'

export type Soldier = {
  position: Vector2
  // TODO: This is Player id
  unitId: string
}

export type Player = {
  position: Vector2
  color: string
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
  const initialState = { players: {}, inputs: {}, soldiers: {} }
  playerIds.forEach((id) => handlePlayerJoin(initialState, id))

  return initialState
}

export function handlePlayerJoin(state: GameState, playerId: string): void {
  if (state.players[playerId]) {
    return
  }

  // Spawn 20 soliders
  Array(20)
    .fill(0)
    .forEach(() => {
      spawnSolider(state, playerId)
    })

  const index = Object.keys(state.players).length
  state.players[playerId] = {
    position: vector(index * 50, 300),
    color: pseudoRandomColor(playerId),
  }
}

const spawnSolider = (state: GameState, unitId: string): void => {
  const soldier = { position: vector(100, 100), unitId: unitId }

  const soldierId = uuid()
  state.soldiers[soldierId] = soldier
}

export function handlePlayerLeave(state: GameState, playerId: string): void {
  delete state.players[playerId]
  delete state.inputs[playerId]
}

// TODO: REMOVE THIS COMMENT (AND JOHANNES)
