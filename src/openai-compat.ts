// OpenAI Chat Completions → Anthropic Messages translation layer
import type { IncomingMessage, ServerResponse } from 'http'

export function isOpenAIRequest(path: string): boolean {
  return path === '/v1/chat/completions' || path === '/v1/models'
}

export function handleModelsRequest(res: ServerResponse) {
  const models = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    object: 'list',
    data: models.map(id => ({ id, object: 'model', owned_by: 'anthropic' })),
  }))
}

export function openaiToAnthropic(body: any): any {
  const messages: any[] = []
  let system: string | undefined

  for (const msg of body.messages || []) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : msg.content?.map((c: any) => c.text).join('\n')
    } else {
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })
    }
  }

  const out: any = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens || body.max_completion_tokens || 4096,
  }
  if (system) out.system = system
  if (body.temperature != null) out.temperature = body.temperature
  if (body.top_p != null) out.top_p = body.top_p
  if (body.stream) out.stream = true
  return out
}

export function anthropicToOpenai(body: any, model: string): any {
  const content = body.content?.map((c: any) => c.text).join('') || ''
  return {
    id: body.id || 'chatcmpl-proxy',
    object: 'chat.completion',
    model: body.model || model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: body.stop_reason === 'end_turn' ? 'stop' : body.stop_reason === 'max_tokens' ? 'length' : 'stop',
    }],
    usage: {
      prompt_tokens: body.usage?.input_tokens || 0,
      completion_tokens: body.usage?.output_tokens || 0,
      total_tokens: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0),
    },
    _fallback: body._fallback,
  }
}
