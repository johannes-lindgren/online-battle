import { useEffect, useRef } from 'react'
import { GameRuntime, type Transport } from '@martini-kit/core'
import { Application, Graphics, type Renderer } from 'pixi.js'
import { TrysteroTransport } from '@martini-kit/transport-trystero'
import { createGame, type GameState } from './Game'
import { keyDownTracker } from './keyDownTracker.ts'
import RAPIER from '@dimforge/rapier2d'
import { normalize, scale } from './math/vector.ts'
import { LocalTransport } from '@martini-kit/transport-local'

interface GameProps {
  mode: 'host' | 'join'
  roomId: string
  onBackToMenu: () => void
}

type GameGraphics = {
  players: Record<string, Graphics>
}

// Get or create graphics for a player
const getOrCreatePlayerGraphics = (
  app: Application<Renderer>,
  gameGraphics: GameGraphics,
  playerId: string
): Graphics => {
  if (!gameGraphics.players[playerId]) {
    const paddleGraphic = new Graphics()
    paddleGraphic.circle(0, 0, 20) // Draw circle with radius 20
    paddleGraphic.fill(0x00ff00)
    app.stage.addChild(paddleGraphic)
    gameGraphics.players[playerId] = paddleGraphic
  }
  return gameGraphics.players[playerId]
}

// Render function - updates Pixi graphics from current state
const syncToPixi = (
  app: Application<Renderer>,
  gameGraphics: GameGraphics,
  state: GameState
) => {
  // First loop: Create graphics for new players
  Object.entries(state.players).forEach(([playerId, player]) => {
    const playerGraphics = getOrCreatePlayerGraphics(
      app,
      gameGraphics,
      playerId
    )
    playerGraphics.position.set(player.position.x, player.position.y)
  })
}

// Bidirectional mapping between playerIds and rigid body handles
export type WorldReferences = {
  playerToBody: Map<string, RAPIER.RigidBodyHandle>
  bodyToPlayer: Map<RAPIER.RigidBodyHandle, string>
}

// Add a reference to worldReferences
const addReference = (
  worldReferences: WorldReferences,
  playerId: string,
  handle: RAPIER.RigidBodyHandle
) => {
  worldReferences.playerToBody.set(playerId, handle)
  worldReferences.bodyToPlayer.set(handle, playerId)
}

// Remove a reference from worldReferences
const removeReference = (
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
const getOrCreateRigidBody = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  playerId: string,
  position: { x: number; y: number }
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
    .setTranslation(position.x, position.y)
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

  console.log(`Created rigid body for player ${playerId}, handle: ${handle}`)
  return rigidBody
}

const syncToWorld = (
  world: RAPIER.World,
  state: GameState,
  worldReferences: WorldReferences
) => {
  // First loop: Create rigid bodies for new players
  Object.entries(state.players).forEach(([playerId, player]) => {
    getOrCreateRigidBody(world, worldReferences, playerId, player.position)
  })

  // Second loop: Apply new forces based on player inputs
  Object.entries(state.players).forEach(([playerId]) => {
    const handle = worldReferences.playerToBody.get(playerId)
    if (handle === undefined) {
      return
    }
    const rigidBody = world.getRigidBody(handle)
    if (!rigidBody) {
      return
    }

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
    if (!state.players[playerId]) {
      const rigidBody = world.getRigidBody(handle)
      if (rigidBody) {
        world.removeRigidBody(rigidBody)
      }
      removeReference(worldReferences, playerId)
      console.log(`Removed rigid body for player ${playerId}`)
    }
  })
}

const syncFromWorld = (
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
  Object.keys(currentState.players).forEach((playerId) => {
    const handle = worldReferences.playerToBody.get(playerId)
    const rigidBody = handle !== undefined ? world.getRigidBody(handle) : null

    if (rigidBody) {
      const position = rigidBody.translation()
      nextState.players[playerId] = {
        ...currentState.players[playerId],
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

export function Game({ mode, roomId, onBackToMenu }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    // Initialize Pixi Application
    const app = new Application()

    app
      .init({
        canvas: canvasRef.current,
        width: 800,
        height: 600,
        backgroundColor: 0x1a1a1a,
      })
      .then(() => {
        // Invert Y-axis to match physics coordinate system (Y+ = up)
        app.stage.scale.y = -1
        app.stage.position.y = app.canvas.height
        // Initialize martini-kit
        const isDebug = true
        const transport: Transport = isDebug
          ? new LocalTransport({
              roomId,
              isHost: mode === 'host',
            })
          : new TrysteroTransport({
              appId: 'online-armies-game',
              roomId,
              isHost: mode === 'host',
            })
        console.log('Joined as', mode, 'ID:', transport.getPlayerId())

        const gravity = { x: 0.0, y: 0 }
        const world = new RAPIER.World(gravity)

        const game = createGame()

        // Host starts with themselves in the game
        // Client starts with empty game and waits for host to send state
        const isHost = transport.isHost()

        const runtime = new GameRuntime(game, transport, {
          isHost: isHost,
          playerIds: isHost ? [transport.getPlayerId()] : [],
        })

        const gameGraphics: GameGraphics = {
          players: {},
        }

        const worldReferences: WorldReferences = {
          playerToBody: new Map(),
          bodyToPlayer: new Map(),
        }

        const keyTracker = keyDownTracker()

        const submitInputs = () => {
          const isUp =
            keyTracker.isKeyDown('KeyW') || keyTracker.isKeyDown('ArrowUp')
          const isDown =
            keyTracker.isKeyDown('KeyS') || keyTracker.isKeyDown('ArrowDown')
          const isLeft =
            keyTracker.isKeyDown('KeyA') || keyTracker.isKeyDown('ArrowLeft')
          const isRight =
            keyTracker.isKeyDown('KeyD') || keyTracker.isKeyDown('ArrowRight')

          const leftSpeed = isLeft ? -1 : 0
          const rightSpeed = isRight ? 1 : 0
          const upSpeed = isUp ? 1 : 0
          const downSpeed = isDown ? -1 : 0

          runtime.submitAction('move', {
            movingDirection: normalize({
              x: leftSpeed + rightSpeed,
              y: upSpeed + downSpeed,
            }),
          })
          keyTracker.drainEventQueue()
        }

        // Add render loop that runs every frame for smooth rendering
        app.ticker.add(() => {
          submitInputs()

          if (isHost) {
            const currentState = runtime.getState()

            // 1. Apply current state to the physics world
            syncToWorld(world, currentState, worldReferences)

            // 2. Step the physics simulation
            world.step()

            // 3. Compute the next state from the world
            const nextState = syncFromWorld(
              world,
              worldReferences,
              currentState
            )

            // Submit tick action with computed next state
            runtime.submitAction('tick', {
              nextState,
              transport: {
                thisId: transport.getPlayerId(),
                peerIds: transport.getPeerIds(),
              },
            })
          }

          syncToPixi(app, gameGraphics, runtime.getState())
        })

        // Cleanup
        return () => {
          app.destroy(true, { children: true })
          keyTracker.destroy()
        }
      })
  }, [mode, roomId])

  return (
    <div>
      <div
        style={{
          marginBottom: '10px',
          padding: '10px',
        }}
      >
        <button onClick={onBackToMenu} style={{ padding: '5px 10px' }}>
          ← Back to Menu
        </button>
        <span style={{ marginLeft: '20px' }}>
          {mode === 'host' ? '🎮 Hosting' : '👥 Joined'} - Room: {roomId}
        </span>
        <span style={{ marginLeft: '20px', fontSize: '12px', color: '#aaa' }}>
          Press W/S or Arrow Keys to move
        </span>
      </div>
      <canvas ref={canvasRef} />
    </div>
  )
}
