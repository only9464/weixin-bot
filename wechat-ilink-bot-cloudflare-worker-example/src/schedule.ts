import { createBot, sendMessage, type Bindings } from './weixin-bot'
//获取当前的北京时间
const getCurrentBeijingTime = (): Date => {
  const now = new Date()
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000
  const beijingTime = new Date(utcTime + 8 * 3600000)
  return beijingTime
}

const currentBeijingTime = getCurrentBeijingTime()


export const RUNNING_STATUS_MESSAGE = `${currentBeijingTime.toLocaleString()}\n`+ '新的一天，新的开始！' 

export async function sendRunningStatusMessage(env: Bindings): Promise<void> {
  const { bot, ilinkUserId } = await createBot(env)

  await sendMessage({ bot, userId: ilinkUserId }, RUNNING_STATUS_MESSAGE)
}
