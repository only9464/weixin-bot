import { env } from 'cloudflare:workers'

const CONTEXT_TOKEN_KEY = 'CONTEXT_TOKEN'

export type WorkerEnv = {
  BOT_TOKEN: SecretsStoreSecret
  ILINK_USER_ID: SecretsStoreSecret
  WECHAT_BOT_KV: KVNamespace
}

export type WeixinBotEnv = {
  botToken: string
  ilinkUserId: string
  contextToken: string
}

function getWorkerEnv(): WorkerEnv {
  return env as unknown as WorkerEnv
}

export async function getWeixinBotEnv(): Promise<WeixinBotEnv> {
  const env = getWorkerEnv()
  const [botToken, ilinkUserId, contextToken] = await Promise.all([
    env.BOT_TOKEN.get(),
    env.ILINK_USER_ID.get(),
    env.WECHAT_BOT_KV.get(CONTEXT_TOKEN_KEY),
  ])

  if (!contextToken) {
    throw new Error(`Missing KV key: ${CONTEXT_TOKEN_KEY}`)
  }

  return { botToken, ilinkUserId, contextToken }
}

export async function saveContextToken(contextToken: string): Promise<void> {
  const env = getWorkerEnv()
  await env.WECHAT_BOT_KV.put(CONTEXT_TOKEN_KEY, contextToken)
}
