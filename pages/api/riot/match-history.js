import axios from 'axios'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { gameName, tagLine, region = 'asia' } = req.query

    if (!gameName || !tagLine) {
      return res.status(400).json({ message: 'Game name and tag line required' })
    }

    const riotApiKey = process.env.RIOT_API_KEY
    if (!riotApiKey) {
      return res.status(500).json({ message: 'Riot API key not configured' })
    }

    // 獲取PUUID
    const accountResponse = await axios.get(
      `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
      {
        headers: {
          'X-Riot-Token': riotApiKey
        }
      }
    )

    const puuid = accountResponse.data.puuid

    // 獲取最近的比賽ID
    const matchListResponse = await axios.get(
      `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1`,
      {
        headers: {
          'X-Riot-Token': riotApiKey
        }
      }
    )

    if (matchListResponse.data.length === 0) {
      return res.status(404).json({ message: 'No recent matches found' })
    }

    // 獲取最近比賽的詳細信息
    const matchId = matchListResponse.data[0]
    const matchResponse = await axios.get(
      `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      {
        headers: {
          'X-Riot-Token': riotApiKey
        }
      }
    )

    const match = matchResponse.data
    const participant = match.info.participants.find(p => p.puuid === puuid)

    res.status(200).json({
      matchId: match.metadata.matchId,
      gameMode: match.info.gameMode,
      gameDuration: match.info.gameDuration,
      win: participant.win,
      champion: participant.championName,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      gameEndTimestamp: match.info.gameEndTimestamp
    })

  } catch (error) {
    console.error('Riot API error:', error.response?.data || error.message)
    
    if (error.response?.status === 404) {
      return res.status(404).json({ message: 'Player not found' })
    }
    
    res.status(500).json({ 
      message: 'Failed to fetch match data',
      error: error.response?.data?.status?.message || error.message
    })
  }
}
