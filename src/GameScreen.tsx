import { useEffect, useRef, useState } from 'react'
import {
  Application,
  Container,
  Graphics,
  type Renderer,
  Texture,
} from 'pixi.js'
import { joinRoom } from 'trystero/mqtt'
import { selfId } from 'trystero'
import {
  createInitialState,
  type GameState,
  handlePlayerJoin,
  handlePlayerLeave,
  type PlayerInput,
} from './Game'
import { keyDownTracker } from './keyDownTracker.ts'
import RAPIER from '@dimforge/rapier2d'
import {
  applyInput,
  createWorldReferences,
  simulate,
  staticWorldConfig,
} from './simulation'
import { normalized, origo } from './math/Vector2.ts'

type ConnectionState = 'connected' | 'connecting' | 'disconnected'

interface GameProps {
  mode: 'host' | 'client'
  roomId: string
  onBackToMenu: () => void
}

type PixiUnitRef = { container: Container; circle: Graphics }

type PixiTextures = {
  soldier: Texture
}

type PixiReferences = {
  player: Map<string, PixiUnitRef>
  soldier: Map<string, PixiUnitRef>
  units: Map<string, PixiUnitRef>
  textures: PixiTextures
}

const createGamePixiReferences = async (
  renderer: Renderer
): Promise<PixiReferences> => {
  return {
    player: new Map(),
    soldier: new Map(),
    units: new Map(),
    textures: await createTextures(renderer),
  }
}

const createTextures = async (renderer: Renderer): Promise<PixiTextures> => {
  // Create white soldier texture that can be tinted
  const soldierGraphics = new Graphics()
  soldierGraphics.circle(0, 0, staticWorldConfig.soldier.radius)
  soldierGraphics.fill(0xffffff) // White color

  const soldierTexture = renderer.extract.texture(soldierGraphics)

  return {
    soldier: soldierTexture,
  }
}

const createPlayer = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
): PixiUnitRef => {
  const player = gameState.players[id]

  // Create a container to hold both the circle and text
  const container = new Container()

  // Create the circle graphic
  const circle = new Graphics()
  circle.circle(0, 0, staticWorldConfig.player.radius) // Draw circle with radius 20
  circle.fill(player?.color ?? 'gray')

  // Add both to the container
  container.addChild(circle)
  appContainer.addChild(container)

  const result = { container: container, circle: circle }
  pixiReferences.player.set(id, result)
  return result
}

// Get or create graphics for a player
const getOrCreatePlayer = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
) => {
  const existing = pixiReferences.player.get(id)
  if (existing) {
    return existing
  }
  return createPlayer(appContainer, gameState, pixiReferences, id)
}

const getOrCreateUnit = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
) => {
  const existing = pixiReferences.units.get(id)
  if (existing) {
    return existing
  }
  return createUnit(appContainer, gameState, pixiReferences, id)
}

const createUnit = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
): PixiUnitRef => {
  const unit = gameState.units[id]
  const player = unit ? gameState.players[unit.playerId] : undefined

  const container = new Container()

  // Unit visual: a small green square
  const circle = new Graphics()
  circle.circle(0, 0, staticWorldConfig.soldier.radius)
  circle.fill(player?.color ?? 'gray')

  // Add both to the container
  container.addChild(circle)
  appContainer.addChild(container)

  const result = { container: container, circle: circle }
  pixiReferences.units.set(id, result)
  return result
}

const createSoldier = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string,
  unitId: string,
  onClick: (unitId: string) => void
): PixiUnitRef => {
  const unit = gameState.units[unitId]
  const player = unit ? gameState.players[unit.playerId] : undefined

  const container = new Container()

  // Soldier visual: a small blue square
  const circle = new Graphics()
  circle.circle(0, 0, staticWorldConfig.soldier.radius) // Draw circle with radius 20
  circle.fill(player?.color ?? 'gray')

  container.addChild(circle)
  appContainer.addChild(container)

  container.interactive = true
  container.on('pointerdown', () => {
    onClick(unitId)
  })

  const result = { container: container, circle: circle }
  pixiReferences.player.set(id, result)
  return result
}

const getOrCreateSoldier = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  soldierId: string,
  unitId: string,
  onClick: (unitId: string) => void
) => {
  const existing = pixiReferences.soldier.get(soldierId)
  if (existing) {
    return existing
  }
  return createSoldier(
    appContainer,
    gameState,
    pixiReferences,
    soldierId,
    unitId,
    onClick
  )
}

// Render function - updates Pixi graphics from current state
const syncToPixi = (
  appContainer: Container,
  pixiReferences: PixiReferences,
  state: GameState,
  selfId: string,
  screenDimensions: { width: number; height: number },
  onClick: (unitId: string) => void
) => {
  // Update camera position to follow own player
  const ownPlayer = state.players[selfId]
  if (ownPlayer) {
    const targetX = screenDimensions.width / 2 - ownPlayer.position.x
    const targetY = screenDimensions.height / 2 - ownPlayer.position.y
    appContainer.position.set(targetX, targetY)
  }
  // Add or update player graphics
  Object.entries(state.players).forEach(([id, player]) => {
    const ref = getOrCreatePlayer(appContainer, state, pixiReferences, id)

    ref.container.position.set(player.position.x, player.position.y)
  })

  // Add or update unit graphics
  Object.entries(state.units).forEach(([id, unit]) => {
    const ref = getOrCreateUnit(appContainer, state, pixiReferences, id)

    ref.container.position.set(unit.position.x, unit.position.y)
  })

  // Remove graphics for players that have left
  pixiReferences.player.forEach((playerRef, playerId) => {
    if (playerId in state.players) {
      return
    }
    appContainer.removeChild(playerRef.container)
    pixiReferences.player.delete(playerId)
  })

  // Add or update soldier graphics (soldiers are stored globally on state)
  Object.entries(state.soldiers).forEach(([id, soldier]) => {
    const ref = getOrCreateSoldier(
      appContainer,
      state,
      pixiReferences,
      id,
      soldier.unitId,
      onClick
    )
    ref.container.position.set(soldier.position.x, soldier.position.y)
  })

  // Remove graphics for soldiers that are no longer present or whose owner left
  pixiReferences.soldier.forEach((ref, soldierId) => {
    const soldier = state.soldiers[soldierId]
    if (!soldier || !(soldier.unitId in state.players)) {
      appContainer.removeChild(ref.container)
      pixiReferences.soldier.delete(soldierId)
    }
  })
}

const initializeGame = async (
  canvas: HTMLCanvasElement,
  config: {
    mode: 'host' | 'client'
    roomId: string
  },
  setPlayers: (playerIds: string[]) => void,
  setConnection: (state: ConnectionState) => void
): Promise<() => void> => {
  // Initialize Pixi Application
  const app = new Application()

  await app.init({
    canvas: canvas,
    width: 1200,
    height: 600,
    backgroundColor: 0x1a1a1a,
  })

  // Invert Y-axis to match physics coordinate system (Y+ = up)

  const rootContainer = new Container()
  const screenDimensions = {
    width: app.canvas.width,
    height: app.canvas.height,
  }
  rootContainer.scale.y = -1
  rootContainer.position.y = screenDimensions.height

  app.stage.addChild(rootContainer)

  const worldContainer = new Container()
  rootContainer.addChild(worldContainer)

  console.log('joining as:', config.mode)
  console.log('Joining room:', config.roomId)
  const room = joinRoom(
    {
      appId: 'online-armies-game',
    },
    config.roomId
  )

  const isHost = config.mode === 'host'
  const [sendInput, receiveInput] = room.makeAction<PlayerInput>('move')
  const [sendState, receiveState] = room.makeAction<GameState>('state')

  // TODO manage on host
  const peerIds = new Set<string>()

  let currentState: GameState = createInitialState(isHost ? [selfId] : [])

  room.onPeerJoin((peerId) => {
    console.log('Peer joined:', peerId)
    if (!isHost) {
      return
    }
    peerIds.add(peerId)
    handlePlayerJoin(currentState, peerId)
    handlePlayersChange()
    if (isHost) {
      sendState(currentState, peerId)
    }
  })

  room.onPeerLeave((peerId) => {
    console.log('Peer left:', peerId)
    if (!isHost) {
      return
    }
    peerIds.delete(peerId)
    handlePlayerLeave(currentState, peerId)
    handlePlayersChange()
  })

  const handlePlayersChange = () => {
    const allIds = [selfId, ...Array.from(peerIds)]
    setPlayers(allIds)
  }

  const handleConnectionChange = () => {
    const state: ConnectionState =
      peerIds.size > 0 || isHost ? 'connected' : 'connecting'
    setConnection(state)
  }

  handlePlayersChange()
  handleConnectionChange()

  receiveInput((data, peerId) => {
    if (!isHost) {
      return
    }
    applyInput(currentState, peerId, data)
  })

  receiveState((nextState) => {
    if (isHost) {
      return
    }
    currentState = nextState
  })

  const gravity = { x: 0.0, y: 0 }
  const world = new RAPIER.World(gravity)

  const pixiReferences = await createGamePixiReferences(app.renderer)

  const worldReferences = createWorldReferences()

  const keyTracker = keyDownTracker()
  const playerInput: PlayerInput = {
    movingDirection: origo,
    instructions: [],
    selectedUnitId: undefined,
  }

  app.stage.interactive = true
  app.stage.hitArea = app.screen
  app.stage.eventMode = 'static'
  app.stage.on('pointerdown', (e) => {
    const worldPos = worldContainer.toLocal(e.global)

    if (playerInput.selectedUnitId === undefined) {
      return
    }

    playerInput.instructions.push({
      tag: 'moveUnit',
      unitId: playerInput.selectedUnitId,
      position: { x: worldPos.x, y: worldPos.y },
    })
  })

  const getOwnInput = (): PlayerInput => {
    const isUp = keyTracker.isKeyDown('KeyW') || keyTracker.isKeyDown('ArrowUp')
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

    return {
      movingDirection:
        normalized({
          x: leftSpeed + rightSpeed,
          y: upSpeed + downSpeed,
        }) ?? origo,
      instructions: playerInput.instructions,
    }
  }

  // const handleUpdateInput = (
  //   update: (nextInput: PlayerInput) => PlayerInput
  // ) => {
  //   playerInput = update(playerInput)
  // }
  const handleClick = (unitId: string) => {
    playerInput.selectedUnitId = unitId
    console.log(playerInput.selectedUnitId)
  }
  app.ticker.add(() => {
    // Process own input.
    const ownInput = getOwnInput()
    applyInput(currentState, selfId, ownInput)
    sendInput(ownInput)
    keyTracker.drainEventQueue()
    playerInput.instructions = []

    currentState = simulate(currentState, world, worldReferences)
    if (isHost) {
      sendState(currentState)
    }

    syncToPixi(
      worldContainer,
      pixiReferences,
      currentState,
      selfId,
      screenDimensions,
      handleClick
    )
  })

  return () => {
    console.log('Cleaning up game...')
    keyTracker.destroy()
    app.stop()
    world.free()
    // room.leave()
  }
}

export function Game({ mode, roomId, onBackToMenu }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playerIds, setPlayerIds] = useState<string[]>([])
  const [connection, setConnection] = useState<ConnectionState>('connecting')

  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    console.log('initializing game...', mode, roomId)
    const cleanupPromise = initializeGame(
      canvasRef.current,
      { mode, roomId },
      setPlayerIds,
      setConnection
    )

    return () => {
      cleanupPromise.then((cleanup) => cleanup())
    }
  }, [mode, roomId])

  return (
    <div>
      <div
        style={{
          marginBottom: '10px',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button onClick={onBackToMenu} style={{ padding: '5px 10px' }}>
          ← Back to Menu
        </button>
        <span
          style={{
            borderRadius: '50%',
            backgroundColor: connectionColors[connection],
            display: 'inline-block',
            width: '10px',
            height: '10px',
          }}
          title={`Connection status: ${connection}`}
        />
        <span>
          {mode === 'host' ? '🎮 Hosting' : '👥 Joined'} <code>{roomId}</code>
        </span>
        <span style={{ marginLeft: '20px' }}>Players: {playerIds.length}</span>
      </div>
      <canvas ref={canvasRef} />
      <span style={{ marginLeft: '20px', fontSize: '12px', color: '#aaa' }}>
        Press W/S or Arrow Keys to move
      </span>
    </div>
  )
}

const connectionColors: Record<ConnectionState, string> = {
  connected: 'green',
  connecting: 'orange',
  disconnected: 'red',
}
