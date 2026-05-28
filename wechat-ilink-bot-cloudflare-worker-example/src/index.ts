import { Hono } from 'hono'
import { sendRunningStatusMessage } from './schedule'
import { sendMessage, useWeixinBot, type Bindings, type Env } from './weixin-bot'

const app = new Hono<Env>()

app.use(useWeixinBot)

app.get('/', async (c) => {
  await sendMessage(c, '机器人已上线')
  return c.text('机器人已上线')
})

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx): void {
    ctx.waitUntil(sendRunningStatusMessage(env))
  },
} satisfies ExportedHandler<Bindings>
