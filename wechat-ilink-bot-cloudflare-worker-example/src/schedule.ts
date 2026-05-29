import { CONTEXT_TOKEN_KEY, createBot, sendMessage, type Bindings } from './weixin-bot'
//获取当前的北京时间
function getBeijingISOString(): string {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Shanghai',
  })
}

export const RUNNING_STATUS_MESSAGE = '新的一天，新的开始！' 

export async function sendRunningStatusMessage(env: Bindings): Promise<void> {
  const { bot, ilinkUserId } = await createBot(env)
  const currentBeijingTime = getBeijingISOString()
  await sendMessage({ bot, userId: ilinkUserId }, `${currentBeijingTime}\n` + RUNNING_STATUS_MESSAGE)
}

// 刷新最新上下文令牌；只在发生变化时覆盖 KV，避免泄露 token 到日志。
export async function updateContextToken(env: Bindings): Promise<void> {
  try {
    const { bot, ilinkUserId} = await createBot(env)
    const latestContextToken = await bot.getLatestTokenOnce(ilinkUserId)
    console.log('最新上下文令牌:', latestContextToken)
    if (!latestContextToken) {
      console.log('没更新新的上下文令牌')
      return
    }

    // console.log('最新上下文令牌:', latestContextToken)
    // if (latestContextToken === contextToken) {
    //   console.log('上下文令牌未变化')
    //   return
    // }
    await env.WECHAT_BOT_KV.put(CONTEXT_TOKEN_KEY, latestContextToken)
    // console.log('上下文令牌已更新')
  } catch (error) {
    console.error('更新上下文令牌失败:', error instanceof Error ? error.message : String(error))
    throw error
  }
}
