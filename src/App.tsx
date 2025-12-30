import './App.css'
import { useState } from 'react'
import { Menu } from './Menu'
import { Game } from './GameScreen'

type AppState =
  | {
      room: 'menu'
      roomId: string
    }
  | {
      room: 'game'
      mode: 'host' | 'client'
      roomId: string
    }

export function App() {
  const [appState, setAppState] = useState<AppState>({
    room: 'menu',
    roomId: 'paddle-battle-room-1',
  })

  const handleStartGame = (mode: 'host' | 'client') => {
    setAppState({ room: 'game', mode, roomId: appState.roomId })
  }

  const handleBackToMenu = () => {
    setAppState({ room: 'menu', roomId: appState.roomId })
  }

  const handleRoomIdChange = (roomId: string) => {
    setAppState((prevState) => ({
      ...prevState,
      roomId,
    }))
  }

  if (appState.room === 'menu') {
    return (
      <Menu
        roomId={appState.roomId}
        onRoomIdChange={handleRoomIdChange}
        onStartGame={handleStartGame}
      />
    )
  }

  return (
    <Game
      mode={appState.mode}
      roomId={appState.roomId}
      onBackToMenu={handleBackToMenu}
    />
  )
}
