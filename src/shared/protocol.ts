import { z } from 'zod'

export const clientCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), project: z.string().min(1), executable: z.string().optional(), configDir: z.string().optional() }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('prompt'), requestId: z.string().min(1).max(100), message: z.string().min(1).max(200_000), intent: z.enum(['normal', 'followUp', 'steer']) }),
  z.object({ type: z.literal('abort') }),
  z.object({ type: z.literal('answer'), generation: z.string().uuid(), id: z.string(), value: z.string().optional(), confirmed: z.boolean().optional(), cancelled: z.boolean().optional() }),
  z.object({ type: z.literal('snapshot') })
])

export type ClientCommand = z.infer<typeof clientCommand>
export type DisplayMessage = { id: number; role: string; content: unknown[]; complete: boolean; timestamp?: number; error?: boolean; toolCallId?: string }
export type ToolCard = { id: string; name: string; arguments?: unknown; result?: unknown; status: 'running' | 'done' | 'error' }
export type Interaction = { id: string; method: string; title?: string; message?: string; options?: string[]; placeholder?: string; prefill?: string; timeout?: number; createdAt: number }
export type Submission = { id: string; text: string; intent: 'normal' | 'followUp' | 'steer'; status: 'submitting' | 'accepted' | 'processing' | 'rejected' | 'uncertain'; error?: string }
export type SessionView = {
  generation: string; seq: number; status: 'disconnected' | 'connecting' | 'idle' | 'running' | 'stopping' | 'interrupted';
  project?: string; executable?: string; configDir?: string; version?: string; sessionId?: string; recoverable?: boolean;
  model?: string; queuedCount: number; error?: string; notice?: string; messages: DisplayMessage[]; tools: ToolCard[];
  interactions: Interaction[]; submissions: Submission[]; ompPid?: number
}
export type HostEvent =
  | { type: 'snapshot'; view: SessionView }
  | { type: 'delta'; generation: string; seq: number; change: { kind: 'status'; value: Partial<SessionView> } | { kind: 'message'; value: DisplayMessage } | { kind: 'tool'; value: ToolCard } | { kind: 'interaction'; value: Interaction | { id: string; removed: true } } | { kind: 'submission'; value: Submission } }
  | { type: 'commandResult'; requestId: string; ok: boolean; error?: string }

export function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.filter((item): item is { type: string; text: string } => !!item && typeof item === 'object' && (item as any).type === 'text' && typeof (item as any).text === 'string').map(x => x.text).join('')
}
