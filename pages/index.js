import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'

export default function Home() {
  const [socket, setSocket] = useState(null)
  const [user, setUser] = useState(null)
  const [currentPage, setCurrentPage] = useState('auth')
  const [room, setRoom] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [gameLog, setGameLog] = useState([])

  // 表單狀態
  const [authForm, setAuthForm] = useState({
    username: '',
    password: '',
    riotUsername: '',
    isLogin: true
  })
  const [roomForm, setRoomForm] = useState({
    roomName: '',
    roomId: ''
  })

  useEffect(() => {
    // 檢查本地存儲的token
    const token = localStorage.getItem('token')
    if (token) {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      setUser(userData)
      setCurrentPage('mainMenu')
    }

    // 初始化Socket
    const socketInstance = io()
    setSocket(socketInstance)

    return () => socketInstance.close()
  }, [])

  useEffect(() => {
    if (socket) {
      // Socket事件監聽
      socket.on('roomCreated', ({ roomId, room }) => {
        setRoom(room)
        setCurrentPage('room')
        addToGameLog(`房間 "${room.name}" 已創建，房間ID: ${roomId}`)
      })

      socket.on('roomJoined', (room) => {
        setRoom(room)
        setCurrentPage('room')
        addToGameLog(`成功加入房間 "${room.name}"`)
      })

      socket.on('roomUpdated', (room) => {
        setRoom(room)
      })

      socket.on('gameStarted', ({ role, gameData }) => {
        setGameData({ ...gameData, userRole: role })
        setCurrentPage('game')
        addToGameLog('遊戲開始！角色已分配')
      })

      socket.on('checkingRiotAPI', () => {
        addToGameLog('正在查詢最近戰績...')
        handleRiotAPICheck()
      })

      socket.on('gameUpdated', (data) => {
        setGameData(prev => ({ ...prev, ...data }))
      })

      socket.on('voteUpdated', (data) => {
        setGameData(prev => ({ ...prev, ...data }))
      })

      socket.on('voteRoundReset', ({ round }) => {
        setGameData(prev => ({ 
          ...prev, 
          currentVoteRound: round,
          votes: {},
          votedPlayers: []
        }))
        addToGameLog(`第 ${round} 輪投票開始`)
      })

      socket.on('gameEnded', ({ eliminated, spy, winner, voteCounts }) => {
        const voteText = Object.entries(voteCounts)
          .map(([player, count]) => `${player}: ${count}票`)
          .join(', ')
        
        addToGameLog(`投票結果: ${voteText}`)
        addToGameLog(`${eliminated} 被投出！`)
        addToGameLog(`臥底是: ${spy}`)
        addToGameLog(`${winner === 'civilian' ? '平民' : '臥底'}勝利！`)
        
        updateStats(winner)
      })

      socket.on('error', (message) => {
        alert(message)
      })
    }
  }, [socket])

  const addToGameLog = (message) => {
    const timestamp = new Date().toLocaleTimeString()
    setGameLog(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const handleAuth = async () => {
    try {
      const endpoint = authForm.isLogin ? '/api/auth/login' : '/api/auth/register'
      const response = await axios.post(endpoint, authForm)
      
      const { token, user } = response.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      
      setUser(user)
      setCurrentPage('mainMenu')
      
    } catch (error) {
      alert(error.response?.data?.message || 'Authentication failed')
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setCurrentPage('auth')
    setRoom(null)
    setGameData(null)
  }

  const createRoom = () => {
    if (!roomForm.roomName.trim()) {
      alert('請輸入房間名稱！')
      return
    }
    socket.emit('createRoom', { roomName: roomForm.roomName, username: user.username })
  }

  const joinRoom = () => {
    if (!roomForm.roomId.trim()) {
      alert('請輸入房間ID！')
      return
    }
    socket.emit('joinRoom', { roomId: roomForm.roomId, username: user.username })
  }

  const startGame = () => {
    socket.emit('startGame', { roomId: room.id })
  }

  const endGame = () => {
    socket.emit('endGame', { roomId: room.id, username: user.username })
  }

  const handleRiotAPICheck = async () => {
    if (!user.riotUsername) {
      // 模擬結果
      const isVictory = Math.random() > 0.5
      setTimeout(() => {
        addToGameLog(`模擬戰績: ${isVictory ? '勝利 🎉' : '失敗 💀'}`)
        if (isVictory) {
          addToGameLog('臥底失敗，平民勝利！')
          updateStats('civilian')
        } else {
          addToGameLog('進入投票階段')
          setGameData(prev => ({ ...prev, showVoting: true }))
        }
      }, 2000)
      return
    }

    try {
      const [gameName, tagLine] = user.riotUsername.split('#')
      const response = await axios.get('/api/riot/match-history', {
        params: { gameName, tagLine }
      })
      
      const { win } = response.data
      setTimeout(() => {
        addToGameLog(`戰績結果: ${win ? '勝利 🎉' : '失敗 💀'}`)
        if (win) {
          addToGameLog('臥底失敗，平民勝利！')
          updateStats('civilian')
        } else {
          addToGameLog('進入投票階段')
          setGameData(prev => ({ ...prev, showVoting: true }))
        }
      }, 2000)
      
    } catch (error) {
      console.error('Riot API error:', error)
      // 回退到模擬結果
      const isVictory = Math.random() > 0.5
      setTimeout(() => {
        addToGameLog(`API查詢失敗，使用模擬結果: ${isVictory ? '勝利 🎉' : '失敗 💀'}`)
        if (isVictory) {
          updateStats('civilian')
        } else {
          setGameData(prev => ({ ...prev, showVoting: true }))
        }
      }, 2000)
    }
  }

  const submitVote = (target) => {
    socket.emit('submitVote', { 
      roomId: room.id, 
      username: user.username, 
      target 
    })
    setGameData(prev => ({ ...prev, userVoted: true, userVote: target }))
  }

  const updateStats = async (winner) => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.post('/api/stats/update', {
        winner,
        userRole: gameData.userRole
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      const updatedUser = { ...user, stats: response.data.stats }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
      
    } catch (error) {
      console.error('Stats update error:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        
        {/* 認證頁面 */}
        {currentPage === 'auth' && (
          <div className="bg-white rounded-xl shadow-2xl p-8 animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-800 mb-2">🕵️‍♂️ 誰是臥底 🕵️‍♀️</h1>
              <p className="text-gray-600">LOL版本 - 最多5人同時遊戲</p>
            </div>
            
            <div className="max-w-md mx-auto space-y-4">
              <div className="flex justify-center mb-4">
                <div className="bg-gray-100 p-1 rounded-lg flex">
                  <button
                    className={`px-4 py-2 rounded-md transition-colors ${
                      authForm.isLogin 
                        ? 'bg-blue-500 text-white' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                    onClick={() => setAuthForm(prev => ({ ...prev, isLogin: true }))}
                  >
                    登入
                  </button>
                  <button
                    className={`px-4 py-2 rounded-md transition-colors ${
                      !authForm.isLogin 
                        ? 'bg-blue-500 text-white' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                    onClick={() => setAuthForm(prev => ({ ...prev, isLogin: false }))}
                  >
                    註冊
                  </button>
                </div>
              </div>
              
              <input
                type="text"
                placeholder="使用者名稱"
                className="w-full p-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                value={authForm.username}
                onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
              />
              
              <input
                type="password"
                placeholder="密碼"
                className="w-full p-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                value={authForm.password}
                onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
              />
              
              {!authForm.isLogin && (
                <input
                  type="text"
                  placeholder="Riot遊戲ID (例: PlayerName#1234)"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                  value={authForm.riotUsername}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, riotUsername: e.target.value }))}
                />
              )}
              
              <button
                onClick={handleAuth}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transform hover:scale-105 transition-all duration-200"
              >
                {authForm.isLogin ? '登入' : '註冊'}
              </button>
            </div>
          </div>
        )}

        {/* 主選單頁面 */}
        {currentPage === 'mainMenu' && (
          <div className="bg-white rounded-xl shadow-2xl p-8 animate-slide-up">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">歡迎回來！</h1>
              <p className="text-gray-600">嗨 {user?.username}，準備開始遊戲了嗎？</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* 創建房間 */}
              <div className="bg-gradient-to-br from-green-100 to-green-200 p-6 rounded-xl">
                <h3 className="text-xl font-semibold text-green-800 mb-4">創建房間</h3>
                <input
                  type="text"
                  placeholder="房間名稱"
                  className="w-full p-3 border border-green-300 rounded-lg mb-4 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                  value={roomForm.roomName}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, roomName: e.target.value }))}
                />
                <button
                  onClick={createRoom}
                  className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transform hover:scale-105 transition-all duration-200"
                >
                  創建房間
                </button>
              </div>
              
              {/* 加入房間 */}
              <div className="bg-gradient-to-br from-blue-100 to-blue-200 p-6 rounded-xl">
                <h3 className="text-xl font-semibold text-blue-800 mb-4">加入房間</h3>
                <input
                  type="text"
                  placeholder="房間ID"
                  className="w-full p-3 border border-blue-300 rounded-lg mb-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={roomForm.roomId}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, roomId: e.target.value }))}
                />
                <button
                  onClick={joinRoom}
                  className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transform hover:scale-105 transition-all duration-200"
                >
                  加入房間
                </button>
              </div>
            </div>
            
            {/* 統計信息 */}
            <div className="bg-gradient-to-br from-purple-100 to-purple-200 p-6 rounded-xl mb-6">
              <h3 className="text-xl font-semibold text-purple-800 mb-4">📊 你的統計</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{user?.stats?.totalGames || 0}</div>
                  <div className="text-sm text-purple-700">總場次</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{user?.stats?.civilianWins || 0}</div>
                  <div className="text-sm text-blue-700">平民勝利</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{user?.stats?.spyWins || 0}</div>
                  <div className="text-sm text-red-700">臥底勝利</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {user?.stats?.totalGames ? Math.round((user.stats.totalWins / user.stats.totalGames) * 100) : 0}%
                  </div>
                  <div className="text-sm text-green-700">勝率</div>
                </div>
              </div>
            </div>
            
            <div className="text-center">
              <button
                onClick={logout}
                className="bg-red-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-600 transform hover:scale-105 transition-all duration-200"
              >
                登出
              </button>
            </div>
          </div>
        )}

        {/* 房間頁面 */}
        {currentPage === 'room' && room && (
          <div className="bg-white rounded-xl shadow-2xl p-8 animate-slide-up">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">房間: {room.name}</h2>
                <div className="space-y-2 text-gray-600">
                  <p><strong>房間ID:</strong> <span className="font-mono bg-gray-100 px-2 py-1 rounded">{room.id}</span></p>
                  <p><strong>房主:</strong> {room.owner}</p>
                  <p><strong>遊戲狀態:</strong> {room.gameState === 'waiting' ? '等待開始' : '遊戲中'}</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  玩家列表 ({room.players?.length || 0}/5)
                </h3>
                <div className="space-y-2">
                  {room.players?.map((player, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-white rounded-lg">
                      <span className="font-medium">{player.username || player}</span>
                      <div className="flex space-x-2">
                        {(player.username || player) === room.owner && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">房主</span>
                        )}
                        {(player.username || player) === user.username && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">你</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-center space-x-4 mb-8">
              <button
                onClick={startGame}
                disabled={room.players?.length !== 5}
                className={`px-8 py-3 rounded-lg font-semibold transform transition-all duration-200 ${
                  room.players?.length === 5
                    ? 'bg-green-500 text-white hover:bg-green-600 hover:scale-105'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                開始遊戲 {room.players?.length !== 5 && `(需要${5 - (room.players?.length || 0)}人)`}
              </button>
              
              <button
                onClick={() => setCurrentPage('mainMenu')}
                className="px-8 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transform hover:scale-105 transition-all duration-200"
              >
                離開房間
              </button>
            </div>
            
            {/* 遊戲記錄 */}
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">🎮 遊戲記錄</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {gameLog.map((log, index) => (
                  <div key={index} className="text-sm text-gray-600 p-2 bg-white rounded">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 遊戲頁面 */}
        {currentPage === 'game' && gameData && (
          <div className="bg-white rounded-xl shadow-2xl p-8 animate-bounce-in">
            {/* 角色顯示 */}
            <div className={`text-center p-8 rounded-xl mb-8 ${
              gameData.userRole === 'spy' 
                ? 'bg-gradient-to-br from-red-500 to-red-600 text-white' 
                : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
            }`}>
              <div className="text-6xl mb-4">
                {gameData.userRole === 'spy' ? '🕵️‍♂️' : '👥'}
              </div>
              <h2 className="text-3xl font-bold mb-2">
                你是{gameData.userRole === 'spy' ? '臥底' : '平民'}！
              </h2>
              <p className="text-lg opacity-90">
                {gameData.userRole === 'spy' 
                  ? '隱藏身份，努力生存到最後！' 
                  : '找出臥底，保護村莊！'}
              </p>
            </div>
            
            {/* 遊戲控制 */}
            <div className="text-center mb-8">
              {!gameData.endedPlayers?.includes(user.username) ? (
                <button
                  onClick={endGame}
                  className="bg-red-500 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-red-600 transform hover:scale-105 transition-all duration-200"
                >
                  遊戲結束
                </button>
              ) : (
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 p-4 rounded-xl">
                  <p className="font-semibold">等待其他玩家...</p>
                  <p>已結束遊戲: {gameData.endedPlayers?.length || 0}/5</p>
                </div>
              )}
            </div>
            
            {/* 投票階段 */}
            {gameData.showVoting && (
              <div className="bg-gradient-to-br from-orange-100 to-orange-200 p-6 rounded-xl mb-8">
                <h3 className="text-2xl font-bold text-orange-800 mb-4">🗳️ 投票階段</h3>
                <p className="text-orange-700 mb-6">請選擇你認為是臥底的玩家：</p>
                
                {!gameData.userVoted ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {room?.players?.filter(p => (p.username || p) !== user.username).map((player, index) => (
                      <button
                        key={index}
                        onClick={() => submitVote(player.username || player)}
                        className="p-4 bg-white border-2 border-orange-300 rounded-xl hover:border-orange-500 hover:bg-orange-50 transform hover:scale-105 transition-all duration-200"
                      >
                        <div className="text-lg font-semibold text-gray-800">
                          {player.username || player}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="bg-green-100 border border-green-400 text-green-800 p-4 rounded-xl mb-4">
                      <p className="font-semibold">你已投票給: {gameData.userVote}</p>
                    </div>
                    <p className="text-orange-700">
                      等待其他玩家投票... ({gameData.votedPlayers?.length || 0}/5)
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* 遊戲記錄 */}
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📜 遊戲記錄</h3>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {gameLog.map((log, index) => (
                  <div key={index} className="text-sm text-gray-600 p-2 bg-white rounded">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}