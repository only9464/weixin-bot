import { Hono } from 'hono'
import { sendRunningStatusMessage,updateContextToken } from './schedule'
import { sendMessage, useWeixinBot, type Bindings, type Env } from './weixin-bot'

const app = new Hono<Env>();

app.use(useWeixinBot)

app.get('/', async (c) => {
  await sendMessage(c, '机器人已上线')
  return c.text('机器人已上线')
})

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env,
    ctx: ExecutionContext,
  ) {
    // Check which cron schedule triggered this execution
    switch (controller.cron) {
      case "*/1 * * * *":
        // 每分钟执行
        // console.log("11111111111111111111111111111111111111111111111111");
        ctx.waitUntil(updateContextToken(env));
        break;
      case "0 16 * * *":
        // 每天
        ctx.waitUntil(sendRunningStatusMessage(env));
        break;
    }
    // ctx.waitUntil(sendRunningStatusMessage(env))
  },
} satisfies ExportedHandler<Bindings>
