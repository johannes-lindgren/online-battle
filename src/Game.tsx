import { type Vector2, vector, add, sub } from './math/Vector2.ts'
import { v4 as uuid } from 'uuid'
import { pseudoRandomColor } from './randomColor.ts'
import { staticWorldConfig } from './simulation.tsx'
import { zeros } from './math/linear-algebra.ts'

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
  angle: number
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

const createUnit = (
  state: GameState,
  playerId: string,
  position: Vector2,
  angle: number
) => {
  const lineDepth = 3
  const lineWidth = 10
  // Relative to the unit position
  const width = lineWidth * staticWorldConfig.soldier.radius * 2
  const depth = lineDepth * staticWorldConfig.soldier.radius * 2
  const halfSize = vector(width / 2, depth / 2)
  const soliderPositions = zeros(lineWidth)
    .flatMap((_, iWidth) =>
      zeros(lineDepth).map((_, iDepth) =>
        vector(
          iWidth * staticWorldConfig.soldier.radius * 2,
          iDepth * staticWorldConfig.soldier.radius * 2
        )
      )
    )
    // Center at the origo
    .map((pos) => sub(pos, halfSize))
    // Translate to the unit position
    .map((pos) => add(pos, position))

  const unit: Unit = { position, playerId: playerId }
  const unitId = uuid()
  state.units[unitId] = unit

  soliderPositions.forEach((pos) => {
    spawnSolider(state, unitId, pos, angle)
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
  const unitCount: number = 10
  // Add unit
  const unitDistance = 150
  const angle = 0

  zeros(unitCount).forEach((_zero, i) => {
    const unitPos = add(position, vector((i - unitCount / 2) * unitDistance, 0))
    createUnit(state, playerId, unitPos, angle)
  })
}

const spawnSolider = (
  state: GameState,
  unitId: string,
  position: Vector2,
  angle: number
): void => {
  const soldier: Soldier = { position, unitId, angle }

  const soldierId = uuid()
  state.soldiers[soldierId] = soldier
}

export function handlePlayerLeave(state: GameState, playerId: string): void {
  delete state.players[playerId]
  delete state.inputs[playerId]
}
