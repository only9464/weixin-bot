import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { WeixinBot } from '@sky9464/weixin-bot'

export type Bindings = {
  BOT_TOKEN: string
  ILINK_USER_ID: string
  CONTEXT_TOKEN: string
}

export type Env = {
  Bindings: Bindings
  Variables: {
    bot: WeixinBot
    ilinkUserId: string
  }
}

type AppContext = Context<Env>

export const useWeixinBot = createMiddleware<Env>(async (c, next) => {
  c.set('bot', createBot(c.env))
  c.set('ilinkUserId', c.env.ILINK_USER_ID)
  await next()
})

export function createBot(env: Bindings): WeixinBot {
  const bot = new WeixinBot()
    .setBotToken(env.BOT_TOKEN)
    .setIlinkUserId(env.ILINK_USER_ID)
    .setContextToken(env.CONTEXT_TOKEN)

  return bot
}

export async function sendMessage(c: AppContext, text: string, userId = c.var.ilinkUserId): Promise<void> {
  await c.var.bot.send(userId, text)
}
