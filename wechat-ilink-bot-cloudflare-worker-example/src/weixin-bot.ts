import { WeixinBot } from '@sky9464/weixin-bot'
import { getWeixinBotEnv, saveContextToken } from './utils/env'

const RUNNING_STATUS_MESSAGE = '新的一天，新的开始！'
type WeixinBotSession = {
  bot: WeixinBot
  ilinkUserId: string
  contextToken: string
}

function getBeijingISOString(): string {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Shanghai',
  })
}

async function createBot(): Promise<WeixinBotSession> {
  const { botToken, ilinkUserId, contextToken } = await getWeixinBotEnv()

  const bot = new WeixinBot()
    .setBotToken(botToken)
    .setIlinkUserId(ilinkUserId)
    .setContextToken(contextToken)

  return { bot, ilinkUserId, contextToken }
}

async function sendMessage(text: string, userId?: string): Promise<void> {
  const { bot, ilinkUserId } = await createBot()
  await bot.send(userId ?? ilinkUserId, text)
}

export async function getLatestTokenOnce(): Promise<string> {
  try {
    const { bot, ilinkUserId } = await createBot()
    const latestContextToken = await bot.getLatestTokenOnce(ilinkUserId)

    if (latestContextToken) {
      console.log('获取到最新的上下文令牌:', latestContextToken)
      await saveContextToken(latestContextToken)
    }

    return latestContextToken
  } catch (error) {
    console.error('更新上下文令牌失败:', error instanceof Error ? error.message : String(error))
    throw error
  }
}

export async function sendRunningStatusMessage(): Promise<void> {
  const currentBeijingTime = getBeijingISOString()
  await sendMessage(`${currentBeijingTime}\n${RUNNING_STATUS_MESSAGE}`)
}
