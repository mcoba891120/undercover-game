import axios from 'axios'

const REGIONAL_HOST = "https://asia.api.riotgames.com"
const REGIONAL_HOST_MATCH = "https://sea.api.riotgames.com"

export class RiotAPIClient {
  constructor(apiKey) {
    this.headers = { "X-Riot-Token": apiKey }
  }

  /**
   * 對應 Python: riot_id_to_puuid
   */
  async riotIdToPuuid(gameName, tagLine) {
    const encodedName = encodeURIComponent(gameName)
    const url = `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodedName}/${tagLine}`
    
    const response = await axios.get(url, { 
      headers: this.headers, 
      timeout: 10000 
    })
    
    return response.data.puuid
  }

  /**
   * 對應 Python: get_match_ids
   */
  async getMatchIds(puuid, count = 5) {
    const url = `${REGIONAL_HOST_MATCH}/lol/match/v5/matches/by-puuid/${puuid}/ids`
    const params = { start: 0, count }
    
    const response = await axios.get(url, { 
      headers: this.headers, 
      params, 
      timeout: 10000 
    })
    
    // 對應 Python 的 print(r.json())
    console.log('Match IDs response:', response.data)
    
    return response.data
  }

  /**
   * 對應 Python: get_match_details
   */
  async getMatchDetails(matchId) {
    const url = `${REGIONAL_HOST_MATCH}/lol/match/v5/matches/${matchId}`
    
    const response = await axios.get(url, { 
      headers: this.headers, 
      timeout: 10000 
    })
    
    return response.data
  }

  /**
   * 對應 Python: did_puuid_win
   */
  didPuuidWin(matchDetail, puuid) {
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
  async queryPlayerLatestMatch(gameName, tagLine) {
    console.log(`🔍 查詢玩家: ${gameName}#${tagLine}`)
    
    // Step 1: 獲取 PUUID
    const puuid = await this.riotIdToPuuid(gameName, tagLine)
    console.log(`PUUID: ${puuid}`)
    
    // Step 2: 獲取比賽 ID 列表
    const matchIds = await this.getMatchIds(puuid, 5)
    console.log('最近 5 場對戰 ID：')
    matchIds.forEach(mid => console.log('  ', mid))
    
    if (matchIds.length === 0) {
      throw new Error('No recent matches found')
    }
    
    // Step 3: 獲取最新比賽詳情
    const matchDetail = await this.getMatchDetails(matchIds[0])
    
    // Step 4: 判斷勝負
    const result = this.didPuuidWin(matchDetail, puuid)
    console.log(result ? "贏了" : "輸了")
    
    return {
      puuid,
      matchIds,
      matchDetail,
      win: result
    }
  }
}