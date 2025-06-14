// ===== lib/socket.js (修復導入問題版本) =====
import { Server } from 'socket.io'
import axios from 'axios'

// 直接在這裡實現 Riot API 函數，避免導入問題
const REGIONAL_HOST = "https://asia.api.riotgames.com"
const REGIONAL_HOST_MATCH = "https://sea.api.riotgames.com"

async function riotIdToPuuid(gameName, tagLine, headers) {
  const encodedName = encodeURIComponent(gameName)
  const url = `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodedName}/${tagLine}`
  
  console.log(`🔍 riot_id_to_puuid: ${url}`)
  const response = await axios.get(url, { headers, timeout: 10000 })
  return response.data.puuid
}

async function getMatchIds(puuid, count = 5, headers) {
  const url = `${REGIONAL_HOST_MATCH}/lol/match/v5/matches/by-puuid/${puuid}/ids`
  const params = { start: 0, count }
  
  console.log(`📋 get_match_ids: ${url} (count: ${count})`)
  const response = await axios.get(url, { headers, params, timeout: 10000 })
  
  console.log('📄 Match IDs:', response.data)
  return response.data
}

async function getMatchDetails(matchId, headers) {
  const url = `${REGIONAL_HOST_MATCH}/lol/match/v5/matches/${matchId}`
  
  console.log(`🎮 get_match_details: ${url}`)
  const response = await axios.get(url, { headers, timeout: 10000 })
  return response.data
}

function didPuuidWin(matchDetail, puuid) {
  for (const player of matchDetail.info.participants) {
    if (player.puuid === puuid) {
      return player.win
    }
  }
  throw new Error("puuid 不在這場對戰名單裡")
}

async function queryPlayerLatestMatch(gameName, tagLine, riotApiKey) {
  console.log(`🚀 開始查詢: ${gameName}#${tagLine}`)
  
  const headers = { "X-Riot-Token": riotApiKey }

  // Step 1: 獲取 PUUID
  const puuid = await riotIdToPuuid(gameName, tagLine, headers)
  console.log(`✅ PUUID: ${puuid}`)

  // Step 2: 獲取比賽 ID 列表
  const matchIds = await getMatchIds(puuid, 2, headers)
  console.log('📋 最近 2 場對戰 ID：')
  matchIds.forEach(mid => console.log('  ', mid))

  if (matchIds.length === 0) {
    throw new Error('No recent matches found')
  }

  // Step 3: 獲取最新比賽詳情
  const matchDetail = await getMatchDetails(matchIds[1], headers)

  // Step 4: 判斷勝負
  const result = didPuuidWin(matchDetail, puuid)
  console.log(result ? "贏了" : "輸了")

  // 返回完整結果
  const participant = matchDetail.info.participants.find(p => p.puuid === puuid)
  
  return {
    win: result,
    matchId: matchDetail.metadata.matchId,
    gameMode: matchDetail.info.gameMode,
    gameDuration: matchDetail.info.gameDuration,
    gameEndTimestamp: matchDetail.info.gameEndTimestamp,
    champion: participant.championName,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    puuid: puuid,
    totalMatches: matchIds.length,
    allMatchIds: matchIds
  }
}

const SocketHandler = (req, res) => {
  if (res.socket.server.io) {
    console.log('Socket is already running')
  } else {
    console.log('Socket is initializing')
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
    })
    res.socket.server.io = io

    // 遊戲房間管理
    const rooms = new Map()
    const userRooms = new Map()

    // 使用內部的 Riot API 函數進行查詢
    async function performRiotAPIQuery(riotUsername) {
      console.log(`🔍 使用內部函數查詢 Riot API: ${riotUsername}`)
      
      if (!riotUsername || !riotUsername.includes('#')) {
        console.log('⚠️ 無效的 Riot 用戶名格式')
        return { success: false, win: Math.random() > 0.5, reason: 'invalid_username' }
      }

      const riotApiKey = process.env.RIOT_API_KEY
      if (!riotApiKey) {
        console.log('⚠️ Riot API 密鑰未配置')
        return { success: false, win: Math.random() > 0.5, reason: 'no_api_key' }
      }

      try {
        const [gameName, tagLine] = riotUsername.split('#')
        
        console.log('📡 調用內部 queryPlayerLatestMatch 函數...')
        console.log(`   參數: gameName="${gameName}", tagLine="${tagLine}"`)
        console.log(`   API Key: ${riotApiKey.substring(0, 10)}...`)
        
        // 直接調用內部函數
        const result = await queryPlayerLatestMatch(gameName, tagLine, riotApiKey)
        
        console.log(`✅ 查詢成功: ${result.win ? '勝利' : '失敗'}`)
        console.log(`🏆 英雄: ${result.champion}, KDA: ${result.kills}/${result.deaths}/${result.assists}`)
        
        return {
          success: true,
          win: result.win,
          matchData: result,
          reason: 'riot_api_success'
        }

      } catch (error) {
        console.error('❌ Riot API 查詢失敗:', error.message)
        console.error('❌ 錯誤詳情:', error.stack)
        
        // 根據錯誤類型決定回退策略
        if (error.response?.status === 404) {
          return { success: false, win: Math.random() > 0.5, reason: 'player_not_found' }
        } else if (error.response?.status === 403) {
          return { success: false, win: Math.random() > 0.5, reason: 'api_key_issue' }
        } else {
          return { success: false, win: Math.random() > 0.5, reason: 'api_error' }
        }
      }
    }

    // 從房間中獲取有效的 Riot 用戶名
    function getRiotUsernameFromRoom(room) {
      console.log('🔍 從房間中查找 Riot 用戶名...')
      console.log('房間玩家:', room.players.map(p => ({ username: p.username, riotUsername: p.riotUsername })))
      
      // 優先使用房主的 Riot 用戶名
      const owner = room.players.find(p => p.username === room.owner)
      if (owner && owner.riotUsername && owner.riotUsername.includes('#')) {
        console.log(`✅ 使用房主的 Riot 用戶名: ${owner.riotUsername}`)
        return owner.riotUsername
      }

      // 如果房主沒有有效的 Riot 用戶名，找第一個有效的
      for (const player of room.players) {
        if (player.riotUsername && player.riotUsername.includes('#')) {
          console.log(`✅ 使用玩家的 Riot 用戶名: ${player.riotUsername}`)
          return player.riotUsername
        }
      }

      console.log('❌ 沒有找到有效的 Riot 用戶名')
      return null
    }

    io.on('connection', (socket) => {
      console.log('User connected:', socket.id)

      // 創建房間
      socket.on('createRoom', ({ roomName, username , riotUsername }) => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase()
        const room = {
          id: roomId,
          name: roomName,
          owner: username,
          players: [{ id: socket.id, username, riotUsername }],
          gameState: 'waiting',
          gameData: null
        }
        
        rooms.set(roomId, room)
        userRooms.set(socket.id, roomId)
        socket.join(roomId)
        
        socket.emit('roomCreated', { roomId, room })
        io.to(roomId).emit('roomUpdated', room)
      })

      // 加入房間
      socket.on('joinRoom', ({ roomId, username, riotUsername }) => {
        const room = rooms.get(roomId)
        if (!room) {
          socket.emit('error', 'Room not found')
          return
        }
        
        if (room.players.length >= 5) {
          socket.emit('error', 'Room is full')
          return
        }

        room.players.push({ id: socket.id, username, riotUsername })
        userRooms.set(socket.id, roomId)
        socket.join(roomId)
        
        socket.emit('roomJoined', room)
        io.to(roomId).emit('roomUpdated', room)
      })

      // 更新玩家 Riot 用戶名
      socket.on('updatePlayerInfo', ({ roomId, username, riotUsername }) => {
        const room = rooms.get(roomId)
        if (!room) return

        const player = room.players.find(p => p.username === username)
        if (player) {
          player.riotUsername = riotUsername
          io.to(roomId).emit('roomUpdated', room)
          console.log(`📝 更新玩家 Riot 用戶名: ${username} -> ${riotUsername}`)
        }
      })

      // 開始遊戲
      socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId)
        if (!room || room.players.length < 2) {
            socket.emit('error', '至少需要 2 名玩家才能開始遊戲')
            return
            }

        // 隨機選擇臥底
        const spyIndex = Math.floor(Math.random() * room.players.length)
        const spy = room.players[spyIndex].username

        room.gameState = 'playing'
        room.gameData = {
          spy,
          roles: {},
          endedPlayers: new Set(),
          votedPlayers: new Set(),
          votes: {},
          currentVoteRound: 1
        }

                // 分配角色
        room.players.forEach(player => {
          console.log("分配角色給玩家:", player.username,"riotUsername:", player.riotUsername)
          room.gameData.roles[player.username] = player.username === spy ? 'spy' : 'civilian'
        })

        const clientGameData = {
            spy: undefined,
            roles: room.gameData.roles,
            endedPlayers: Array.from(room.gameData.endedPlayers),
            votedPlayers: Array.from(room.gameData.votedPlayers),
            votes: room.gameData.votes,
            currentVoteRound: room.gameData.currentVoteRound
        }


        // 向每個玩家發送他們的角色
        // 正確寫法：forEach 帶上參數 name
        room.players.forEach(player => {
            io.to(player.id).emit('gameStarted', {
                role: room.gameData.roles[player.username],
                gameData: clientGameData
            })
        })


        io.to(roomId).emit('roomUpdated', room)
        console.log(`🎮 遊戲開始，房間 ${roomId}，臥底: ${spy}`)
      })

      // 結束遊戲 - 使用內部的 Riot API 函數
      socket.on('endGame', ({ roomId, username }) => {
        const room = rooms.get(roomId)
        if (!room || !room.gameData) {
          console.log(`⚠️ 無效的遊戲結束請求: roomId=${roomId}, username=${username}`)
          return
        }

        room.gameData.endedPlayers.add(username)
        console.log(`🎮 ${username} 結束遊戲，目前結束人數: ${room.gameData.endedPlayers.size}/${room.players.length}`)
        
        if (room.gameData.endedPlayers.size === room.players.length) {
          console.log('🔍 所有玩家都結束了，開始查詢 Riot API...')
          
          // 發送開始查詢事件
          io.to(roomId).emit('checkingRiotAPI')
          
          // 執行 Riot API 查詢
          const executeQuery = async () => {
            try {
              const riotUsername = getRiotUsernameFromRoom(room)
              
              if (!riotUsername) {
                console.log('⚠️ 房間中沒有有效的 Riot 用戶名')
                io.to(roomId).emit('riotAPIResult', {
                  success: false,
                  message: '房間中沒有有效的 Riot 用戶名',
                  win: false,
                  reason: 'no_riot_username'
                })
                
                // 直接進入投票
                room.gameState = 'voting'
                io.to(roomId).emit('enterVotingPhase', {
                  message: '無法查詢戰績，直接進入投票階段',
                  round: room.gameData.currentVoteRound
                })
                return
              }

              console.log(`🎯 使用 ${riotUsername} 查詢戰績`)
              io.to(roomId).emit('riotAPIProgress', {
                message: `正在查詢 ${riotUsername} 的戰績...`,
                username: riotUsername
              })

              // 使用內部的 queryPlayerLatestMatch 函數
              const apiResult = await performRiotAPIQuery(riotUsername)
              
              // 發送查詢結果
              io.to(roomId).emit('riotAPIResult', {
                success: apiResult.success,
                win: apiResult.win,
                matchData: apiResult.matchData,
                reason: apiResult.reason,
                username: riotUsername
              })

              // 處理遊戲結果
              if (apiResult.win) {
                console.log('🎉 戰績勝利！平民獲勝，臥底失敗！')
                io.to(roomId).emit('gameEnded', {
                  eliminated: null,
                  spy: room.gameData.spy,
                  winner: 'civilian',
                  reason: 'riot_api_victory',
                  apiResult: apiResult,
                  voteCounts: {}
                })
              } else {
                console.log('💀 戰績失敗！進入投票階段')
                room.gameState = 'voting'
                io.to(roomId).emit('enterVotingPhase', {
                  message: '戰績失敗，進入投票階段',
                  round: room.gameData.currentVoteRound,
                  apiResult: apiResult
                })
              }

            } catch (error) {
              console.error('❌ Riot API 查詢過程發生錯誤:', error)
              
              io.to(roomId).emit('riotAPIResult', {
                success: false,
                message: 'API 查詢過程發生錯誤',
                win: false,
                reason: 'query_error'
              })
              
              // 失敗時進入投票
              room.gameState = 'voting'
              io.to(roomId).emit('enterVotingPhase', {
                message: 'API 查詢失敗，進入投票階段',
                round: room.gameData.currentVoteRound
              })
            }
          }

          // 延遲 1 秒執行，讓客戶端有時間準備監聽器
          setTimeout(executeQuery, 1000)
        }

        io.to(roomId).emit('gameUpdated', {
          endedPlayers: Array.from(room.gameData.endedPlayers)
        })
      })

      // 提交投票
      socket.on('submitVote', ({ roomId, username, target }) => {
        const room = rooms.get(roomId)
        if (!room || !room.gameData || room.gameState !== 'voting') return

        room.gameData.votes[username] = target
        room.gameData.votedPlayers.add(username)

        console.log(`🗳️ ${username} 投票給 ${target}，當前投票數: ${room.gameData.votedPlayers.size}/${room.players.length}`)

        if (room.gameData.votedPlayers.size === room.players.length) {
          const voteCounts = {}
          Object.values(room.gameData.votes).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1
          })

          let maxVotes = 0
          let winners = []
          
          Object.entries(voteCounts).forEach(([player, count]) => {
            if (count > maxVotes) {
              maxVotes = count
              winners = [player]
            } else if (count === maxVotes) {
              winners.push(player)
            }
          })

          if (winners.length > 1) {
            room.gameData.currentVoteRound++
            room.gameData.votedPlayers.clear()
            room.gameData.votes = {}
            io.to(roomId).emit('voteRoundReset', { round: room.gameData.currentVoteRound })
          } else {
            const eliminated = winners[0]
            const spyEliminated = eliminated === room.gameData.spy
            io.to(roomId).emit('gameEnded', {
              eliminated,
              spy: room.gameData.spy,
              winner: spyEliminated ? 'civilian' : 'spy',
              reason: 'voting',
              voteCounts
            })
          }
        }

        io.to(roomId).emit('voteUpdated', {
          votedPlayers: Array.from(room.gameData.votedPlayers),
          totalPlayers: 5
        })
      })

      // 斷線處理
      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id)
        const roomId = userRooms.get(socket.id)
        if (roomId) {
          const room = rooms.get(roomId)
          if (room) {
            room.players = room.players.filter(p => p.id !== socket.id)
            if (room.players.length === 0) {
              rooms.delete(roomId)
              console.log(`🗑️ 房間 ${roomId} 已清理（無玩家）`)
            } else {
              io.to(roomId).emit('roomUpdated', room)
            }
          }
          userRooms.delete(socket.id)
        }
      })
    })
  }
  res.end()
}

export default SocketHandler