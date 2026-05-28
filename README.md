# @sky9464/weixin-bot

WeChat iLink Bot API 的 Node.js SDK，用来接收微信 iLink Bot 消息、回复文本消息、主动发送文本消息，以及控制“正在输入”状态。

这个包是 ESM 包，要求 Node.js `>=22`。默认 API 地址是 `https://ilinkai.weixin.qq.com`。

## 安装

```bash
npm install @sky9464/weixin-bot
```

## 快速开始

### 方式一：扫码登录

第一次使用时可以直接运行机器人。`run()` 会在没有可用凭证时自动触发扫码登录，并在终端打印微信登录链接。

```ts
import { WeixinBot } from '@sky9464/weixin-bot'

const bot = new WeixinBot({
  onError(error) {
    console.error('bot error:', error)
  },
})

bot.onMessage(async (msg) => {
  console.log(`[${msg.timestamp.toLocaleTimeString()}] ${msg.userId}: ${msg.text}`)
  await bot.reply(msg, `你说了: ${msg.text}`)
})

await bot.run()
```

登录成功后，SDK 会在终端打印 `bot_token`、`baseUrl`、`accountId` 和 `userId`。这些凭证只保存在当前进程内，SDK 不会自动写入文件。

### 方式二：手动传入凭证

如果你已经拿到了 `bot_token`、`ilink_user_id` 和可用的 `context_token`，可以手动设置凭证并主动发送消息。

```ts
import { WeixinBot } from '@sky9464/weixin-bot'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

const userId = requireEnv('ILINK_USER_ID')

const bot = new WeixinBot()
  .setBotToken(requireEnv('BOT_TOKEN'))
  .setIlinkUserId(userId)
  .setIlinkBotId(requireEnv('ILINK_BOT_ID'))
  .setContextToken(requireEnv('CONTEXT_TOKEN'))

await bot.send(userId, '机器人已上线')

bot.onMessage(async (msg) => {
  await bot.reply(msg, `收到: ${msg.text}`)
})

await bot.run()
```

`setContextToken()` 必须在已有 user id 后调用，也就是先调用 `setIlinkUserId()`，或者先完成一次 `login()`。

## API

### `new WeixinBot(options?)`

创建一个机器人客户端。

```ts
const bot = new WeixinBot({
  baseUrl: 'https://ilinkai.weixin.qq.com',
  onError(error) {
    console.error(error)
  },
})
```

可选参数：

- `baseUrl?: string`：覆盖默认 iLink API 地址。
- `onError?: (error: unknown) => void`：接收轮询、登录重试或消息处理器中的错误。

### `await bot.login()`

启动扫码登录流程，等待微信确认后返回当前凭证。

```ts
const credentials = await bot.login()
console.log(credentials.token)
console.log(credentials.userId)
```

返回值结构：

```ts
interface Credentials {
  token: string
  baseUrl: string
  accountId: string
  userId: string
}
```

### 手动凭证

```ts
bot
  .setBotToken('bot-token')
  .setIlinkUserId('ilink-user-id')
  .setIlinkBotId('ilink-bot-id')
  .setContextToken('context-token')
```

- `setBotToken(token)`：设置 API 请求使用的 bot token。
- `setIlinkUserId(userId)`：设置 iLink user id。
- `setIlinkBotId(accountId)`：设置 iLink bot id。
- `setContextToken(contextToken)`：为当前 user id 缓存一个 `context_token`。
- `setBaseUrl(baseUrl)`：覆盖 API 地址。

这些值都只保存在当前 `WeixinBot` 实例中，不会自动持久化。

### `bot.onMessage(handler)`

注册消息处理器。处理器可以是同步函数，也可以是异步函数。

```ts
bot.onMessage(async (msg) => {
  console.log(msg.userId, msg.type, msg.text)
})
```

也可以使用事件风格：

```ts
bot.on('message', async (msg) => {
  console.log(msg.text)
})
```

收到的用户消息会被转换成 `IncomingMessage`：

```ts
interface IncomingMessage {
  userId: string
  text: string
  type: 'text' | 'image' | 'voice' | 'file' | 'video'
  raw: WeixinMessage
  _contextToken: string
  timestamp: Date
}
```

`text` 字段会尽量提取可读内容：

- 文本消息：文本内容。
- 图片消息：图片 URL；没有 URL 时为 `[image]`。
- 语音消息：语音识别文本；没有识别文本时为 `[voice]`。
- 文件消息：文件名；没有文件名时为 `[file]`。
- 视频消息：`[video]`。

完整原始协议数据可以从 `msg.raw` 读取。

### `await bot.reply(msg, text)`

回复一条收到的消息。

```ts
bot.onMessage(async (msg) => {
  await bot.reply(msg, `回复: ${msg.text}`)
})
```

`reply()` 会使用这条入站消息里的 `context_token`，并把它缓存到当前实例中。发送完成后，SDK 会自动尝试停止该用户的 typing 状态。

### `await bot.send(userId, text)`

主动向用户发送文本消息。

```ts
await bot.send('ilink-user-id', '你好')
```

`send()` 需要该用户已有缓存的 `context_token`。通常有两种来源：

- SDK 已经收到过这个用户的消息。
- 你已经手动调用过 `setContextToken()`。

发送空字符串会抛出错误。长文本会按 2000 个字符自动分片发送。

### `await bot.sendTyping(userId)`

向指定用户发送“正在输入”状态。

```ts
await bot.sendTyping('ilink-user-id')
```

这个方法会先通过 `getconfig` 获取 `typing_ticket`。它同样依赖已缓存的 `context_token`，所以需要先收到该用户消息，或者先手动设置 `context_token`。

### `await bot.stopTyping(userId)`

取消指定用户的“正在输入”状态。

```ts
await bot.stopTyping('ilink-user-id')
```

如果当前没有该用户的 `context_token`，这个方法会直接返回。

### `await bot.getLatestToken(userId?)`

尝试从最新的 `getupdates` 返回结果中刷新并返回指定用户的 `context_token`。

```ts
const contextToken = await bot.getLatestToken('ilink-user-id')
console.log(contextToken)
```

如果没有传入 `userId`，SDK 会使用当前凭证中的 `userId`。如果仍然没有 user id，或者没有任何可用的 `context_token`，会抛出错误。

### `await bot.run()`

启动长轮询循环，持续接收消息并分发给已注册的消息处理器。

```ts
await bot.run()
```

关键行为：

- 没有凭证时会自动调用 `login()`。
- 同一个实例重复调用 `run()` 时，会复用已经运行中的 promise。
- 临时错误会自动退避重试，重试间隔最高 10 秒。
- session 过期时会清空旧凭证、游标和缓存的 `context_token`，然后重新扫码登录。

### `bot.stop()`

停止长轮询循环。

```ts
bot.stop()
```

如果当前正在等待一次长轮询请求，SDK 会尝试中止它。

## 类型导出

根入口会导出 `WeixinBot` 和协议相关类型：

```ts
import {
  WeixinBot,
  MessageItemType,
  MessageState,
  MessageType,
  type IncomingMessage,
  type MessageItem,
  type WeixinMessage,
} from '@sky9464/weixin-bot'
```

`MessageType`、`MessageState`、`MessageItemType`、`WeixinMessage`、`MessageItem` 等属于底层协议类型，主要用于读取 `msg.raw` 或做更细的消息判断。底层请求函数不是稳定公共 API。

## 常见注意事项

- 凭证只保存在内存里。进程退出后需要重新扫码登录，或者由你自己保存并在下次启动时手动传入。
- `bot_token`、`context_token`、`.env` 等敏感信息不要提交到仓库，也不要发布到 npm 包里。
- 主动发送消息前必须有有效的 `context_token`。最稳妥的方式是在收到用户消息后再回复或发送。
- 当前 SDK 只实现了文本发送。图片、语音、文件、视频等消息可以通过 `msg.raw` 读取底层结构。
- 如果需要了解 iLink API 的请求和响应结构，可以查看 [PROTOCOL.md](./PROTOCOL.md)。

## 示例项目

仓库里的 `wechat-ilink-bot-cloudflare-worker-example` 是 Cloudflare Worker 示例项目，可作为边缘运行环境的参考。主 README 只介绍 npm SDK 的用法，Worker 的具体部署流程请以示例项目内配置为准。

## License

MIT
