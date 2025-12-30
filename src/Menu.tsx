interface MenuProps {
  roomId: string
  onRoomIdChange: (roomId: string) => void
  onStartGame: (mode: 'host' | 'client') => void
}

export function Menu(props: MenuProps) {
  const { roomId, onRoomIdChange, onStartGame } = props

  const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRoomIdChange(e.target.value)
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Paddle Battle</h1>
      <div style={{ marginBottom: '20px' }}>
        <label>
          Room ID:{' '}
          <input
            type="text"
            value={roomId}
            onChange={handleRoomIdChange}
            style={{ padding: '5px', marginLeft: '10px' }}
          />
        </label>
      </div>
      <button
        onClick={() => onStartGame('host')}
        style={{
          padding: '10px 20px',
          marginRight: '10px',
          fontSize: '16px',
        }}
      >
        Host Game
      </button>
      <button
        onClick={() => onStartGame('client')}
        style={{ padding: '10px 20px', fontSize: '16px' }}
      >
        Join Game
      </button>
      <div style={{ marginTop: '20px', color: '#666' }}>
        <p>🎮 Host creates the game room</p>
        <p>👥 Others join with the same Room ID</p>
        <p>⌨️ Controls: W/S or Arrow Up/Down</p>
      </div>
    </div>
  )
}
