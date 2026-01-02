import { type Vector2, vector } from './math/Vector2.ts'
import { v4 as uuid } from 'uuid'
import { pseudoRandomColor } from './randomColor.ts'

export type PlayerInstruction = {
  tag: 'moveUnit'
  unitId: string
  position: Vector2
}

export type Unit = {
  position: Vector2
  playerId: string
}

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
  instructions: PlayerInstruction[]
}

export type GameState = {
  players: Record<string, Player>
  inputs: Record<string, PlayerInput>
  soldiers: Record<string, Soldier>
  units: Record<string, Unit>
}

export function createInitialState(playerIds: string[]): GameState {
  const initialState: GameState = {
    players: {},
    inputs: {},
    soldiers: {},
    units: {},
  }
  playerIds.forEach((id) => handlePlayerJoin(initialState, id))

  return initialState
}

export function handlePlayerJoin(state: GameState, playerId: string): void {
  if (state.players[playerId]) {
    return
  }
  // Add unit
  const unit: Unit = { position: vector(500, 100), playerId: playerId }
  const unitId = uuid()
  state.units[unitId] = unit

  // Spawn 20 soliders
  Array(8)
    .fill(0)
    .forEach(() => {
      spawnSolider(state, unitId)
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
