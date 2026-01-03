import { type Vector2, vector, add } from './math/Vector2.ts'
import { v4 as uuid } from 'uuid'
import { pseudoRandomColor } from './randomColor.ts'
import { staticWorldConfig } from './simulation.tsx'

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
  unitId: string
}

export type Player = {
  position: Vector2
  color: string
}

export type PlayerInput = {
  movingDirection: Vector2
  instructions: PlayerInstruction[]
  selectedUnitId?: string
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

const createUnitCompositions = (
  state: GameState,
  playerId: string,
  position: Vector2
) => {
  const soldierCount: number = 20
  const unit: Unit = { position, playerId: playerId }
  const unitId = uuid()
  state.units[unitId] = unit

  Array(soldierCount)
    .fill(0)
    .forEach((_zero, i) => {
      const soldierPos = add(
        unit.position,
        vector((i - soldierCount / 2) * staticWorldConfig.soldier.radius * 2, 0)
      )
      spawnSolider(state, unitId, soldierPos)
    })
}

export function handlePlayerJoin(state: GameState, playerId: string): void {
  if (state.players[playerId]) {
    return
  }

  // The new player
  const playerIndex = Object.keys(state.players).length
  const playerSpawnPos = vector(0, playerIndex * 300)
  const player = {
    position: playerSpawnPos,
    color: pseudoRandomColor(playerId),
  }

  createArmy(state, playerId, playerSpawnPos)

  state.players[playerId] = player
}

const createArmy = (state: GameState, playerId: string, position: Vector2) => {
  const unitCount: number = 3
  // Add unit
  const unitDistance = 400
  Array(unitCount)
    .fill(0)
    .forEach((_zero, i) => {
      const unitPos = add(
        position,
        vector((i - unitCount / 2) * unitDistance, 0)
      )
      createUnitCompositions(state, playerId, unitPos)
    })
}

const spawnSolider = (
  state: GameState,
  unitId: string,
  position: Vector2
): void => {
  const soldier = { position, unitId: unitId }

  const soldierId = uuid()
  state.soldiers[soldierId] = soldier
}

export function handlePlayerLeave(state: GameState, playerId: string): void {
  delete state.players[playerId]
  delete state.inputs[playerId]
}
