import { ApiError, DEFAULT_BASE_URL, buildTextMessage, getUpdates, sendMessage, getConfig, sendTyping as apiSendTyping } from './api.ts'
import { login, type Credentials } from './auth.ts'
import { delay } from './runtime.ts'
import {
  MessageItemType,
  MessageType,
  type IncomingMessage,
  type MessageItem,
  type WeixinMessage,
} from './types.ts'

type MessageHandler = (msg: IncomingMessage) => void | Promise<void>
type CredentialsDraft = Partial<Credentials>

export interface WeixinBotOptions {
  baseUrl?: string
  onError?: (error: unknown) => void
}

export class WeixinBot {
  private baseUrl: string
  private readonly onErrorCallback?: (error: unknown) => void
  private readonly handlers: MessageHandler[] = []
  private readonly contextTokens = new Map<string, string>()
  private readonly credentialDraft: CredentialsDraft = {}
  private credentials?: Credentials
  private cursor = ''
  private stopped = false
  private currentPollController: AbortController | null = null
  private runPromise: Promise<void> | null = null

  constructor(options: WeixinBotOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.onErrorCallback = options.onError
  }

  async login(): Promise<Credentials> {
    const credentials = await login({
      baseUrl: this.baseUrl,
    })

    const activeCredentials = this.applyCredentials(credentials)
    this.log(`Logged in as ${activeCredentials.userId}`)
    return activeCredentials
  }

  setBotToken(token: string): this {
    this.credentialDraft.token = requireNonEmpty(token, 'Bot token')
    console.log(`手动设置BotToken: ${this.credentialDraft.token}`)
    this.applyCredentialDraft()
    return this
  }

  setIlinkUserId(userId: string): this {
    this.credentialDraft.userId = requireNonEmpty(userId, 'iLink user id')
    console.log(`手动设置IlinkUserId: ${this.credentialDraft.userId}`)
    this.applyCredentialDraft()
    return this
  }
  setContextToken(contextToken: string): this {
    const userId = this.credentials?.userId ?? this.credentialDraft.userId
    const token = requireNonEmpty(contextToken, 'Context token')

    if (!userId) {
      throw new Error('User id is required before setting a context token.')
    }

    this.contextTokens.set(userId, token)
    console.log(`手动设置ContextToken: ${token}`)
    return this
  }
  setIlinkBotId(accountId: string): this {
    this.credentialDraft.accountId = requireNonEmpty(accountId, 'iLink bot id')
    console.log(`手动设置IlinkBotId: ${this.credentialDraft.accountId}`)
    this.applyCredentialDraft()
    return this
  }

  setBaseUrl(baseUrl: string): this {
    this.baseUrl = requireNonEmpty(baseUrl, 'Base URL')
    this.credentialDraft.baseUrl = this.baseUrl
    this.applyCredentialDraft()
    return this
  }

  onMessage(handler: MessageHandler): this {
    this.handlers.push(handler)
    return this
  }

  on(event: 'message', handler: MessageHandler): this {
    if (event !== 'message') {
      throw new Error(`Unsupported event: ${event}`)
    }

    return this.onMessage(handler)
  }

  async reply(message: IncomingMessage, text: string): Promise<void> {
    this.contextTokens.set(message.userId, message._contextToken)
    console.log(`新上下文令牌: ${message._contextToken}`)
    await this.sendText(message.userId, text, message._contextToken)
    // Auto-cancel typing indicator after reply
    this.stopTyping(message.userId).catch(() => {})
  }

  async sendTyping(userId: string): Promise<void> {
    const contextToken = this.contextTokens.get(userId)
    if (!contextToken) {
      throw new Error(`No cached context token for user ${userId}. Reply to an incoming message first.`)
    }

    const credentials = await this.ensureCredentials()
    const config = await getConfig(this.baseUrl, credentials.token, userId, contextToken)
    if (!config.typing_ticket) {
      this.log('sendTyping: no typing_ticket returned by getconfig')
      return
    }

    await apiSendTyping(this.baseUrl, credentials.token, userId, config.typing_ticket, 1)
  }

  async stopTyping(userId: string): Promise<void> {
    const contextToken = this.contextTokens.get(userId)
    if (!contextToken) return

    const credentials = await this.ensureCredentials()
    const config = await getConfig(this.baseUrl, credentials.token, userId, contextToken)
    if (!config.typing_ticket) return

    await apiSendTyping(this.baseUrl, credentials.token, userId, config.typing_ticket, 2)
  }

  async send(userId: string, text: string): Promise<void> {
    const contextToken = this.contextTokens.get(userId)
    if (!contextToken) {
      throw new Error(`No cached context token for user ${userId}. Reply to an incoming message first.`)
    }

    await this.sendText(userId, text, contextToken)
  }

  async getLatestToken(userId?: string): Promise<string> {
    const targetUserId = userId ?? this.credentials?.userId ?? this.credentialDraft.userId
    if (!targetUserId) {
      throw new Error('User id is required to get latest context token.')
    }

    const currentContextToken = this.contextTokens.get(targetUserId)
    const credentials = await this.ensureCredentials()
    const updates = await getUpdates(this.baseUrl, credentials.token, this.cursor)

    let latestContextToken = currentContextToken
    for (const raw of updates.msgs ?? []) {
      this.rememberContext(raw)

      if (getMessageUserId(raw) === targetUserId && raw.context_token) {
        latestContextToken = raw.context_token
      }
    }

    if (!latestContextToken) {
      throw new Error(`No cached context token for user ${targetUserId}. Receive a message or call setContextToken first.`)
    }

    return latestContextToken
  }

  async run(): Promise<void> {
    if (this.runPromise) {
      return this.runPromise
    }

    this.stopped = false
    this.runPromise = this.runLoop()

    try {
      await this.runPromise
    } finally {
      this.runPromise = null
      this.currentPollController = null
    }
  }

  stop(): void {
    this.stopped = true
    this.currentPollController?.abort()
  }

  private async runLoop(): Promise<void> {
    await this.ensureCredentials()
    this.log('长轮询已启动')
    let retryDelayMs = 1_000

    while (!this.stopped) {
      try {
        const credentials = await this.ensureCredentials()
        this.currentPollController = new AbortController()
        const updates = await getUpdates(
          this.baseUrl,
          credentials.token,
          this.cursor,
          this.currentPollController.signal,
        )
        // console.log('收到新消息，完整数据:', updates)

        this.currentPollController = null
        this.cursor = updates.get_updates_buf || this.cursor
        retryDelayMs = 1_000

        for (const raw of updates.msgs ?? []) {
          this.rememberContext(raw)
          const incoming = this.toIncomingMessage(raw)
          if (!incoming) {
            continue
          }

          await this.dispatchMessage(incoming)
        }
      } catch (error) {
        this.currentPollController = null

        if (this.stopped && isAbortError(error)) {
          break
        }

        if (isSessionExpired(error)) {
          this.log('Session expired. Waiting for a fresh QR login...')
          this.credentials = undefined
          this.cursor = ''
          this.contextTokens.clear()

          try {
            await this.login()
            retryDelayMs = 1_000
            continue
          } catch (loginError) {
            this.reportError(loginError)
          }
        } else {
          this.reportError(error)
        }

        await delay(retryDelayMs)
        retryDelayMs = Math.min(retryDelayMs * 2, 10_000)
      }
    }

    this.log('Long-poll loop stopped.')
  }

  private async ensureCredentials(): Promise<Credentials> {
    if (this.credentials) {
      return this.credentials
    }

    return this.login()
  }

  private applyCredentialDraft(): void {
    const token = this.credentialDraft.token ?? this.credentials?.token
    if (!token) {
      return
    }

    this.applyCredentials({
      token,
      baseUrl: this.credentialDraft.baseUrl ?? this.credentials?.baseUrl ?? this.baseUrl,
      accountId: this.credentialDraft.accountId ?? this.credentials?.accountId ?? '',
      userId: this.credentialDraft.userId ?? this.credentials?.userId ?? '',
    })
  }

  private applyCredentials(credentials: Credentials): Credentials {
    const previousToken = this.credentials?.token
    this.credentials = credentials
    this.baseUrl = credentials.baseUrl

    if (previousToken && previousToken !== credentials.token) {
      this.cursor = ''
      this.contextTokens.clear()
    }

    return credentials
  }

  private async sendText(userId: string, text: string, contextToken: string): Promise<void> {
    if (text.length === 0) {
      throw new Error('Message text cannot be empty.')
    }

    const credentials = await this.ensureCredentials()
    for (const chunk of chunkText(text, 2_000)) {
      await sendMessage(this.baseUrl, credentials.token, buildTextMessage(userId, contextToken, chunk))
    }
  }

  private async dispatchMessage(message: IncomingMessage): Promise<void> {
    if (this.handlers.length === 0) {
      return
    }

    const results = await Promise.allSettled(this.handlers.map(async (handler) => handler(message)))
    for (const result of results) {
      if (result.status === 'rejected') {
        this.reportError(result.reason)
      }
    }
  }

  private rememberContext(message: WeixinMessage): void {
    const userId = getMessageUserId(message)
    if (userId && message.context_token) {
      this.contextTokens.set(userId, message.context_token)
    }
  }

  private toIncomingMessage(message: WeixinMessage): IncomingMessage | null {
    if (message.message_type !== MessageType.USER) {
      return null
    }

    return {
      userId: message.from_user_id,
      text: extractText(message.item_list),
      type: detectType(message.item_list),
      raw: message,
      _contextToken: message.context_token,
      timestamp: new Date(message.create_time_ms),
    }
  }

  private reportError(error: unknown): void {
    this.log(error instanceof Error ? error.message : String(error))
    this.onErrorCallback?.(error)
  }

  private log(message: string): void {
    console.error(`[weixin-bot] ${message}`)
  }
}

function detectType(items: MessageItem[]): IncomingMessage['type'] {
  const first = items[0]

  switch (first?.type) {
    case MessageItemType.IMAGE:
      return 'image'
    case MessageItemType.VOICE:
      return 'voice'
    case MessageItemType.FILE:
      return 'file'
    case MessageItemType.VIDEO:
      return 'video'
    default:
      return 'text'
  }
}

function extractText(items: MessageItem[]): string {
  const parts = items
    .map((item) => {
      switch (item.type) {
        case MessageItemType.TEXT:
          return item.text_item?.text ?? ''
        case MessageItemType.IMAGE:
          return item.image_item?.url ?? '[image]'
        case MessageItemType.VOICE:
          return item.voice_item?.text ?? '[voice]'
        case MessageItemType.FILE:
          return item.file_item?.file_name ?? '[file]'
        case MessageItemType.VIDEO:
          return '[video]'
        default:
          return ''
      }
    })
    .filter(Boolean)

  return parts.join('\n')
}

function getMessageUserId(message: WeixinMessage): string {
  return message.message_type === MessageType.USER ? message.from_user_id : message.to_user_id
}

function chunkText(text: string, limit: number): string[] {
  const chars = Array.from(text)
  const chunks: string[] = []

  for (let index = 0; index < chars.length; index += limit) {
    chunks.push(chars.slice(index, index + limit).join(''))
  }

  return chunks.length > 0 ? chunks : ['']
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`)
  }

  return trimmed
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === -14
}
