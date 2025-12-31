// Add a reference to worldReferences
import RAPIER from '@dimforge/rapier2d'
import type { GameState, PlayerInput } from './Game.tsx'
import { scale } from './math/Vector2'

// Bidirectional mapping between playerIds and rigid body handles
export type WorldReferences = {
  playerToBody: Map<string, RAPIER.RigidBodyHandle>
  bodyToPlayer: Map<RAPIER.RigidBodyHandle, string>
}

export const createWorldReferences = (): WorldReferences => ({
  playerToBody: new Map(),
  bodyToPlayer: new Map(),
})

export const addReference = (
  worldReferences: WorldReferences,
  playerId: string,
  handle: RAPIER.RigidBodyHandle
) => {
  worldReferences.playerToBody.set(playerId, handle)
  worldReferences.bodyToPlayer.set(handle, playerId)
}

// Remove a reference from worldReferences
export const removeReference = (
  worldReferences: WorldReferences,
  playerId: string
) => {
  const handle = worldReferences.playerToBody.get(playerId)
  if (handle !== undefined) {
    worldReferences.bodyToPlayer.delete(handle)
  }
  worldReferences.playerToBody.delete(playerId)
}

// Get or create rigid body for a player
export const getOrCreateRigidBody = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  playerId: string
): RAPIER.RigidBody => {
  const existingHandle = worldReferences.playerToBody.get(playerId)
  if (existingHandle !== undefined) {
    const rigidBody = world.getRigidBody(existingHandle)
    if (rigidBody) {
      return rigidBody
    }
  }

  // Create new rigid body for this player as a ball
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0)
    .setLinearDamping(5.0) // Add damping to slow down over time (5.0 = strong air resistance)

  const rigidBody = world.createRigidBody(rigidBodyDesc)
  const handle = rigidBody.handle

  // Add a ball collider with radius 20 and friction
  const colliderDesc = RAPIER.ColliderDesc.ball(20)
    .setFriction(0.5) // Add friction for contact with surfaces
    .setRestitution(0.3) // Add some bounciness (0 = no bounce, 1 = perfect bounce)

  world.createCollider(colliderDesc, rigidBody)
  // Store bidirectional mapping
  addReference(worldReferences, playerId, handle)

  return rigidBody
}

export const applyInput = (
  state: GameState,
  playerId: string,
  input: PlayerInput
) => {
  state.inputs[playerId] = input
}

/**
 * Sync the game state to the physics world
 * @param world
 * @param state
 * @param worldReferences
 */
export const syncToWorld = (
  world: RAPIER.World,
  state: GameState,
  worldReferences: WorldReferences
) => {
  // First loop: Create rigid bodies for new players
  Object.entries(state.players).forEach(([playerId, player]) => {
    const rigidBody = getOrCreateRigidBody(world, worldReferences, playerId)

    // Update rigid body position
    rigidBody.setTranslation(player.position, false)

    // Clear persistent forces from previous frames
    rigidBody.resetForces(true)

    // Apply new force based on current input
    const input = state.inputs[playerId]
    if (input) {
      const forceMultiplier = 1000000.0
      rigidBody.addForce(scale(input.movingDirection, forceMultiplier), true)
    }
  })

  // Third loop: Remove rigid bodies for disconnected players
  worldReferences.playerToBody.forEach((handle, playerId) => {
    if (playerId in state.players) {
      return
    }
    const rigidBody = world.getRigidBody(handle)
    if (rigidBody) {
      world.removeRigidBody(rigidBody)
    }
    removeReference(worldReferences, playerId)
    console.log(`Removed rigid body for player ${playerId}`)
  })
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
  }

  // Copy all players with updated positions from the physics world
  Object.entries(currentState.players).forEach(([playerId, player]) => {
    const handle = worldReferences.playerToBody.get(playerId)
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

  return nextState
}
