import { useEffect, useRef, useState } from 'react'
import { Application, Container } from 'pixi.js'
import { joinRoom } from 'trystero/mqtt'
import { selfId } from 'trystero/mqtt'
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
  computeUnitAveragePositions,
  createWorldReferences,
  simulate,
} from './simulation'
import {
  normalized,
  origo,
  add,
  scale,
  sub,
  type Vector2,
  fromAngle,
  length,
  angle,
  normalize,
} from './math/Vector2.ts'
import { linspace } from './math/linear-algebra.ts'
import {
  createGamePixiReferences,
  syncToPixi,
  type UnitClickEvent,
} from './graphics.ts'

const cubicBezier = (
  p0: Vector2,
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  t: number
): Vector2 => {
  const oneMinusT = 1 - t
  const oneMinusT2 = oneMinusT * oneMinusT
  const oneMinusT3 = oneMinusT2 * oneMinusT
  const t2 = t * t
  const t3 = t2 * t
  return add(
    add(scale(p0, oneMinusT3), scale(p1, 3 * oneMinusT2 * t)),
    add(scale(p2, 3 * oneMinusT * t2), scale(p3, t3))
  )
}

const computeUnitPaths = (
  state: GameState,
  unitAverages: {
    positions: Map<string, Vector2>
    directions: Map<string, Vector2>
  }
): Map<string, Vector2[]> => {
  const paths = new Map<string, Vector2[]>()
  const segmentCount = 20
  const tValues = linspace(0, 1, segmentCount + 1)

  Object.entries(state.units).forEach(([id, unit]) => {
    const p0 = unitAverages.positions.get(id) ?? unit.targetPos
    const p3 = unit.targetPos
    const startDir =
      unitAverages.directions.get(id) ?? fromAngle(unit.targetAngle)
    const endDir = fromAngle(unit.targetAngle)

    const dist = length(sub(p3, p0))
    const controlDist = dist / 3

    const p1 = add(p0, scale(startDir, controlDist))
    const p2 = sub(p3, scale(endDir, controlDist))

    const pathPoints = tValues.map((t) => cubicBezier(p0, p1, p2, p3, t))
    paths.set(id, pathPoints)
  })

  return paths
}

type ConnectionState = 'connected' | 'connecting' | 'disconnected'

const MouseButton = {
  left: 0,
  middle: 1,
  right: 2,
} as const

interface GameProps {
  mode: 'host' | 'client'
  roomId: string
  onBackToMenu: () => void
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
    backgroundColor: 0x103010,
    resolution: window.devicePixelRatio || 2,
    autoDensity: true,
  })

  // Prevent the browser context menu on right-click over the canvas
  app.view.addEventListener('contextmenu', (ev) => ev.preventDefault())

  // Invert Y-axis to match physics coordinate system (Y+ = up)

  const rootContainer = new Container()
  const screenDimensions = {
    width: app.screen.width,
    height: app.screen.height,
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
    const { nativeEvent } = e.originalEvent
    if (nativeEvent.button !== 2) {
      // ignore non-right-clicks
      return
    }

    if (playerInput.selectedUnitId === undefined) {
      return
    }

    const worldPos = worldContainer.toLocal(e.global)
    const pos: Vector2 = {
      x: worldPos.x,
      y: worldPos.y,
    }
    const unitAverages = computeUnitAveragePositions(currentState)
    const unitPos: Vector2 =
      unitAverages.positions.get(playerInput.selectedUnitId) ?? origo
    const dir = normalize(sub(pos, unitPos))

    playerInput.instructions.push({
      tag: 'moveUnit',
      unitId: playerInput.selectedUnitId,
      position: pos,
      angle: angle(dir),
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

  const handlePlayerClick = (event: UnitClickEvent) => {
    if (event.event.button === MouseButton.left) {
      // only select on primary key click
      playerInput.selectedUnitId = event.unitId
    }
  }
  app.ticker.add(() => {
    // Process own input.
    const ownInput = getOwnInput()
    applyInput(currentState, selfId, ownInput)
    sendInput(ownInput)
    keyTracker.drainEventQueue()
    playerInput.instructions = []

    const unitAverages = computeUnitAveragePositions(currentState)
    const unitPaths = computeUnitPaths(currentState, unitAverages)
    currentState = simulate(currentState, world, worldReferences, unitAverages)
    if (isHost) {
      sendState(currentState)
    }

    syncToPixi(
      worldContainer,
      pixiReferences,
      currentState,
      selfId,
      screenDimensions,
      handlePlayerClick,
      playerInput,
      unitAverages,
      unitPaths
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
