import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { WeixinBot } from '@sky9464/weixin-bot'

export const CONTEXT_TOKEN_KEY = 'CONTEXT_TOKEN'

export type Bindings = {
  WECHAT_BOT_KV: KVNamespace
  BOT_TOKEN: SecretsStoreSecret
  ILINK_USER_ID: SecretsStoreSecret
}

export type Env = {
  Bindings: Bindings
  Variables: {
    bot: WeixinBot
    ilinkUserId: string
  }
}

type AppContext = Context<Env>
type MessageTarget = {
  bot: WeixinBot
  userId: string
}

export const useWeixinBot = createMiddleware<Env>(async (c, next) => {
  const { bot, ilinkUserId } = await createBot(c.env)

  c.set('bot', bot)
  c.set('ilinkUserId', ilinkUserId)
  await next()
})

export async function createBot(env: Bindings): Promise<{ bot: WeixinBot; ilinkUserId: string; contextToken: string }> {
  const [botToken, ilinkUserId, contextToken] = await Promise.all([
    env.BOT_TOKEN.get(),
    env.ILINK_USER_ID.get(),
    env.WECHAT_BOT_KV.get(CONTEXT_TOKEN_KEY),
  ])

  if (!contextToken) {
    throw new Error(`Missing KV key: ${CONTEXT_TOKEN_KEY}`)
  }

  const bot = new WeixinBot()
    .setBotToken(botToken)
    .setIlinkUserId(ilinkUserId)
    .setContextToken(contextToken)

  return { bot, ilinkUserId, contextToken }
}

export async function sendMessage(c: AppContext, text: string, userId?: string): Promise<void>
export async function sendMessage(target: MessageTarget, text: string): Promise<void>
export async function sendMessage(target: AppContext | MessageTarget, text: string, userId?: string): Promise<void> {
  if ('bot' in target) {
    await target.bot.send(target.userId, text)
    return
  }

  await target.var.bot.send(userId ?? target.var.ilinkUserId, text)
}
