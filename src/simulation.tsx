// Add a reference to worldReferences
import RAPIER from '@dimforge/rapier2d'
import type { GameState, PlayerInput, Soldier } from './Game.tsx'
import {
  add,
  cross,
  fromAngle,
  length,
  lengthSquared,
  normalized,
  origo,
  scale,
  sub,
  type Vector2,
} from './math/Vector2'

const natureConst = {
  g: 9.82,
}

/*
 * Properties that never change after initialization.
 * These properties do not need to be synchronized between server and clients.
 */
export const staticWorldConfig = {
  soldier: {
    radius: 5,
    stoppingDistance: 100,
    mass: 70,
    linearDamping: 0.5,
    angularDamping: 5,
    friction: 0.2,
    restitution: 0.0,
    // The force is proportional to the mass of the player
    walkForcePerKg: 1.3 * natureConst.g,
    runForcePerKg: 2.5 * natureConst.g,
    torquePerKg: 0.1,
  },
  player: {
    radius: 7,
  },
  unit: {
    flagSize: 2,
  },
}

// Bidirectional mapping between playerIds and rigid body handles
export type WorldReferences = {
  player: Map<string, RAPIER.RigidBodyHandle>
  soldier: Map<string, RAPIER.RigidBodyHandle>
}

export const createWorldReferences = (): WorldReferences => ({
  player: new Map(),
  soldier: new Map(),
})

const createPlayer = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  playerId: string
): RAPIER.RigidBody => {
  // Create new rigid body for this player as a ball
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0)
    .setLinearDamping(staticWorldConfig.soldier.linearDamping) // Add damping to slow down over time (5.0 = strong air resistance)
    .setAngularDamping(staticWorldConfig.soldier.angularDamping)

  const rigidBody = world.createRigidBody(rigidBodyDesc)
  const handle = rigidBody.handle

  // Add a ball collider with radius 20 and friction
  const colliderDesc = RAPIER.ColliderDesc.ball(staticWorldConfig.player.radius)
    .setMass(staticWorldConfig.soldier.mass)
    .setFriction(staticWorldConfig.soldier.friction)
    .setRestitution(staticWorldConfig.soldier.restitution)

  world.createCollider(colliderDesc, rigidBody)
  // Store bidirectional mapping
  worldReferences.player.set(playerId, handle)

  return rigidBody
}

const getOrCreatePlayer = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  playerId: string
): RAPIER.RigidBody => {
  const existingHandle = worldReferences.player.get(playerId)
  if (existingHandle !== undefined) {
    const rigidBody = world.getRigidBody(existingHandle)
    if (rigidBody) {
      return rigidBody
    }
  }

  return createPlayer(world, worldReferences, playerId)
}

const createSolider = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  soldierId: string
): RAPIER.RigidBody => {
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0)
    .setLinearDamping(staticWorldConfig.soldier.linearDamping)
    .setAngularDamping(staticWorldConfig.soldier.angularDamping)

  const rigidBody = world.createRigidBody(rigidBodyDesc)
  const handle = rigidBody.handle

  // Smaller collider for soldiers (square approximation with a small ball)
  const colliderDesc = RAPIER.ColliderDesc.ball(
    staticWorldConfig.soldier.radius
  )
    .setFriction(staticWorldConfig.soldier.friction)
    .setMass(staticWorldConfig.soldier.mass)
    .setRestitution(staticWorldConfig.soldier.restitution)

  world.createCollider(colliderDesc, rigidBody)

  worldReferences.soldier.set(soldierId, handle)

  return rigidBody
}

const getOrCreateSoldier = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  soldierId: string
): RAPIER.RigidBody => {
  const existingHandle = worldReferences.soldier.get(soldierId)
  if (existingHandle !== undefined) {
    const rigidBody = world.getRigidBody(existingHandle)
    if (rigidBody) {
      return rigidBody
    }
  }

  return createSolider(world, worldReferences, soldierId)
}

export const applyInput = (
  state: GameState,
  playerId: string,
  input: PlayerInput
) => {
  // Store the latest input for the player
  state.inputs[playerId] = input

  // Move units
  input.instructions.forEach((instruction) => {
    if (instruction.tag === 'moveUnit') {
      const unit = state.units[instruction.unitId]

      if (!unit) {
        return
      }
      unit.position = instruction.position
    }
  })
}

/**
 * Sync the game state to the physics world
 * @param world
 * @param state
 * @param worldReferences
 * @param unitAveragePositions
 */
export const syncToWorld = (
  world: RAPIER.World,
  state: GameState,
  worldReferences: WorldReferences,
  unitAveragePositions: Map<string, Vector2>
) => {
  // First loop: Create rigid bodies for new players
  Object.entries(state.players).forEach(([playerId, player]) => {
    const rigidBody = getOrCreatePlayer(world, worldReferences, playerId)

    // Update rigid body position
    rigidBody.setTranslation(player.position, false)

    // Clear persistent forces from previous frames
    rigidBody.resetForces(true)

    // Apply new force based on current input
    const input = state.inputs[playerId]
    if (input) {
      const forceMultiplier =
        staticWorldConfig.soldier.runForcePerKg * rigidBody.mass()
      rigidBody.addForce(scale(input.movingDirection, forceMultiplier), true)
    }
  })

  Object.entries(state.soldiers).forEach(([soldierId, soldier]) => {
    const rigidBody = getOrCreateSoldier(world, worldReferences, soldierId)

    rigidBody.setTranslation(soldier.position, false)
    rigidBody.setRotation(soldier.angle, false)
    rigidBody.resetForces(true)
    rigidBody.resetTorques(true)

    const unitAvgPos =
      unitAveragePositions.get(soldier.unitId) ?? soldier.position
    updateSoldier(state, soldierId, soldier, rigidBody, world, unitAvgPos)
  })

  // Third loop: Remove rigid bodies for disconnected players
  worldReferences.player.forEach((handle, playerId) => {
    if (playerId in state.players) {
      return
    }
    const rigidBody = world.getRigidBody(handle)
    if (rigidBody) {
      world.removeRigidBody(rigidBody)
    }
    worldReferences.player.delete(playerId)
    console.log(`Removed rigid body for player ${playerId}`)
  })

  worldReferences.soldier.forEach((handle, soldierId) => {
    if (soldierId in state.soldiers) {
      return
    }
    const rigidBody = world.getRigidBody(handle)
    if (rigidBody) {
      world.removeRigidBody(rigidBody)
    }
    worldReferences.soldier.delete(soldierId)
    console.log(`Removed rigid body for soldier ${soldierId}`)
  })
}

const avoidanceDist = staticWorldConfig.soldier.radius
const alignmentRadius = staticWorldConfig.soldier.radius * 6
const avoidanceShape = new RAPIER.Ball(
  staticWorldConfig.soldier.radius * 2 + avoidanceDist
)
const alignmentShape = new RAPIER.Ball(alignmentRadius)

const torqueTowards = (
  rigidBody: RAPIER.RigidBody,
  targetDirection: Vector2,
  torqueMultiplier: number
) => {
  const currentDirection = fromAngle(rigidBody.rotation())
  const torque = cross(currentDirection, targetDirection) * torqueMultiplier
  rigidBody.addTorque(torque, true)
}

const findClosestNeighbor = (
  world: RAPIER.World,
  position: Vector2,
  rigidBody: RAPIER.RigidBody,
  shape: RAPIER.Ball
): { direction: Vector2; distanceSquared: number } => {
  let closestDistanceSquared = Infinity
  let avoidanceDirection = origo

  world.intersectionsWithShape(position, 0, shape, (collider) => {
    const otherBody = collider.parent()
    if (otherBody && otherBody.handle !== rigidBody.handle) {
      const otherPos = otherBody.translation()
      const diff = sub(position, otherPos)
      const distanceSquared = lengthSquared(diff)

      if (distanceSquared < closestDistanceSquared) {
        closestDistanceSquared = distanceSquared
        avoidanceDirection = normalized(diff) ?? origo
      }
    }
    return true
  })

  return {
    direction: avoidanceDirection,
    distanceSquared:
      closestDistanceSquared - staticWorldConfig.soldier.radius * 2,
  }
}

const gatherFlockingNeighbors = (
  world: RAPIER.World,
  position: Vector2,
  rigidBody: RAPIER.RigidBody,
  shape: RAPIER.Ball,
  maxDistanceSquared: number
): {
  neighborCount: number
  averageVelocity: Vector2
  averagePosition: Vector2
} => {
  let neighborCount = 0
  let averageVelocity = origo
  let averagePosition = origo

  world.intersectionsWithShape(position, 0, shape, (collider) => {
    const otherBody = collider.parent()
    if (otherBody && otherBody.handle !== rigidBody.handle) {
      const otherPos = otherBody.translation()
      const diff = sub(position, otherPos)
      const distanceSquared = lengthSquared(diff)

      if (distanceSquared < maxDistanceSquared) {
        averageVelocity = add(averageVelocity, otherBody.linvel())
        averagePosition = add(averagePosition, otherPos)
        neighborCount++
      }
    }
    return true
  })

  return { neighborCount, averageVelocity, averagePosition }
}

const computeUnitAveragePositions = (
  state: GameState
): Map<string, Vector2> => {
  const unitPositions = new Map<string, Vector2>()
  const unitCounts = new Map<string, number>()

  Object.values(state.soldiers).forEach((soldier) => {
    const currentSum = unitPositions.get(soldier.unitId) ?? origo
    const currentCount = unitCounts.get(soldier.unitId) ?? 0

    unitPositions.set(soldier.unitId, add(currentSum, soldier.position))
    unitCounts.set(soldier.unitId, currentCount + 1)
  })

  const averages = new Map<string, Vector2>()
  unitPositions.forEach((sum, unitId) => {
    const count = unitCounts.get(unitId) ?? 1
    averages.set(unitId, scale(sum, 1 / count))
  })

  return averages
}

/*
 * Soldier AI with flocking behavior (alignment and cohesion)
 */
const updateSoldier = (
  state: GameState,
  _soldierId: string,
  soldier: Soldier,
  rigidBody: RAPIER.RigidBody,
  world: RAPIER.World,
  unitAveragePosition: Vector2
) => {
  const unit = state.units[soldier.unitId]
  if (!unit) {
    return
  }

  const { direction: avoidanceDirection, distanceSquared: closestDistance } =
    findClosestNeighbor(world, soldier.position, rigidBody, avoidanceShape)

  const { neighborCount, averageVelocity, averagePosition } =
    gatherFlockingNeighbors(
      world,
      soldier.position,
      rigidBody,
      alignmentShape,
      alignmentRadius * alignmentRadius
    )

  const alignmentDirection =
    neighborCount > 0
      ? (normalized(scale(averageVelocity, 1 / neighborCount)) ?? origo)
      : origo

  const cohesionDirection =
    neighborCount > 0
      ? (normalized(
          sub(scale(averagePosition, 1 / neighborCount), soldier.position)
        ) ?? origo)
      : origo

  // Direction to unit goal
  const toUnitPos = sub(unit.position, soldier.position)
  const directionToUnitPos = normalized(toUnitPos) ?? origo

  // Check if unit average position is close to unit.position
  const toUnitFromAverage = sub(unit.position, unitAveragePosition)
  const distanceUnitAverageToTarget = length(toUnitFromAverage)

  // Stop moving if unit average is close enough to the target
  if (distanceUnitAverageToTarget < 10) {
    const currentVelocity = rigidBody.linvel()
    const breakingForce = scale(currentVelocity, -rigidBody.mass() * 2)
    rigidBody.addForce(breakingForce, true)
    return
  }

  const directionToTarget = directionToUnitPos

  // Combine behaviors with weights
  const avoidanceWeight = Math.max(1 - closestDistance / avoidanceDist, 0)
  const alignmentWeight = neighborCount > 0 ? 0.4 : 0
  const cohesionWeight = neighborCount > 0 ? 0.2 : 0
  const targetWeight = 1 - avoidanceWeight

  const finalDirection =
    normalized(
      add(
        scale(directionToTarget, targetWeight),
        scale(avoidanceDirection, avoidanceWeight),
        scale(alignmentDirection, alignmentWeight),
        scale(cohesionDirection, cohesionWeight)
      )
    ) ?? directionToTarget

  // TODO adjust the walk speed based on the players direction:
  //  - units walk slower sideways and backwards

  const forceMagnitude =
    staticWorldConfig.soldier.walkForcePerKg * rigidBody.mass()
  const force = scale(finalDirection, forceMagnitude)
  rigidBody.addForce(force, true)

  // Rotate soldier to face the alignment direction when in formation, otherwise face target
  const rotationTarget =
    neighborCount > 2 ? alignmentDirection : directionToTarget
  const movementDirection = normalized(rigidBody.linvel())
  if (movementDirection) {
    torqueTowards(
      rigidBody,
      rotationTarget,
      staticWorldConfig.soldier.torquePerKg * rigidBody.mass() * 1000
    )
  }
}

export const syncFromWorld = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  currentState: GameState
): GameState => {
  // Create a new state with updated positions from physics
  const nextState: GameState = {
    ...currentState,
    players: {},
    soldiers: {},
  }

  // Copy all players with updated positions from the physics world
  Object.entries(currentState.players).forEach(([playerId, player]) => {
    const handle = worldReferences.player.get(playerId)
    const rigidBody = handle !== undefined ? world.getRigidBody(handle) : null

    if (rigidBody) {
      const position = rigidBody.translation()
      nextState.players[playerId] = {
        ...player,
        position: { x: position.x, y: position.y },
      }
    } else {
      // Keep original position if no physics body exists
      const player = currentState.players[playerId]
      if (player) {
        nextState.players[playerId] = player
      }
    }
  })

  // Copy all soldiers with updated positions from the physics world
  Object.entries(currentState.soldiers).forEach(([soldierId, soldier]) => {
    const handle = worldReferences.soldier.get(soldierId)
    const rigidBody = handle !== undefined ? world.getRigidBody(handle) : null

    if (rigidBody) {
      const position = rigidBody.translation()
      nextState.soldiers[soldierId] = {
        ...soldier,
        position: { x: position.x, y: position.y },
        angle: rigidBody.rotation(),
      }
    } else {
      const s = currentState.soldiers[soldierId]
      if (s) {
        nextState.soldiers[soldierId] = s
      }
    }
  })

  return nextState
}

export const simulate = (
  currentState: GameState,
  world: RAPIER.World,
  worldReferences: WorldReferences
) => {
  const unitAveragePositions = computeUnitAveragePositions(currentState)
  syncToWorld(world, currentState, worldReferences, unitAveragePositions)
  world.step()
  return syncFromWorld(world, worldReferences, currentState)
}
