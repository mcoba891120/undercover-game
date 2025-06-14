import axios from 'axios'

// 完全對應 Python 的常數
const REGIONAL_HOST = "https://asia.api.riotgames.com"
const REGIONAL_HOST_MATCH = "https://sea.api.riotgames.com"

/**
 * 將 Riot ID 轉成 PUUID
 */
export async function riotIdToPuuid(gameName, tagLine, headers) {
  const encodedName = encodeURIComponent(gameName)
  const url = `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodedName}/${tagLine}`
  
  console.log(`🔍 riot_id_to_puuid: ${url}`)
  const response = await axios.get(url, { headers, timeout: 10000 })
  return response.data.puuid
}

/**
 * 抓最近 count 場對戰 ID
 */
export async function getMatchIds(puuid, count = 5, headers) {
  const url = `${REGIONAL_HOST_MATCH}/lol/match/v5/matches/by-puuid/${puuid}/ids`
  const params = { start: 0, count }
  
  console.log(`📋 get_match_ids: ${url} (count: ${count})`)
  const response = await axios.get(url, { headers, params, timeout: 10000 })
  
  console.log('📄 Match IDs:', response.data)
  return response.data
}

/**
 * 抓對戰詳情
 */
export async function getMatchDetails(matchId, headers) {
  const url = `${REGIONAL_HOST_MATCH}/lol/match/v5/matches/${matchId}`
  
  console.log(`🎮 get_match_details: ${url}`)
  const response = await axios.get(url, { headers, timeout: 10000 })
  return response.data
}

/**
 * 傳回 True = 該 puuid 勝利, False = 落敗
 */
export function didPuuidWin(matchDetail, puuid) {
  for (const player of matchDetail.info.participants) {
    if (player.puuid === puuid) {
      return player.win
    }
  }
  throw new Error("puuid 不在這場對戰名單裡")
}

/**
 * 完整查詢流程，對應 Python 的 main 邏輯
 */
export async function queryPlayerLatestMatch(gameName, tagLine, riotApiKey) {
  console.log(`🚀 開始查詢: ${gameName}#${tagLine}`)
  
  const headers = { "X-Riot-Token": riotApiKey }

  // Step 1: 獲取 PUUID
  const puuid = await riotIdToPuuid(gameName, tagLine, headers)
  console.log(`✅ PUUID: ${puuid}`)

  // Step 2: 獲取比賽 ID 列表
  const matchIds = await getMatchIds(puuid, 5, headers)
  console.log('📋 最近 5 場對戰 ID：')
  matchIds.forEach(mid => console.log('  ', mid))

  if (matchIds.length === 0) {
    throw new Error('No recent matches found')
  }

  // Step 3: 獲取最新比賽詳情
  const matchDetail = await getMatchDetails(matchIds[0], headers)

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