const utf8 = new TextDecoder('utf-8', { fatal: true })
const MAX_PHYSICAL = 1_048_576
const MAX_LOGICAL = 67_108_864

export class FrameDecoder {
  private pending = Buffer.alloc(0)
  private chunks: { id: string; count: number; byteLength: number; parts: Buffer[]; size: number } | undefined

  push(bytes: Buffer): Record<string, any>[] {
    this.pending = Buffer.concat([this.pending, bytes])
    const frames: Record<string, any>[] = []
    for (;;) {
      const end = this.pending.indexOf(10)
      if (end < 0) break
      if (end > MAX_PHYSICAL) throw Error('OMP frame exceeds physical limit')
      const line = this.pending.subarray(0, end)
      this.pending = this.pending.subarray(end + 1)
      if (!line.length) continue
      const frame = this.parse(line)
      if (frame.type === 'rpc_chunk') {
        const decoded = this.chunk(frame)
        if (decoded) frames.push(decoded)
      } else {
        if (this.chunks) throw Error('OMP chunk sequence interrupted')
        frames.push(frame)
      }
    }
    if (this.pending.length > MAX_PHYSICAL) throw Error('OMP partial frame exceeds physical limit')
    return frames
  }

  finish(): void {
    if (this.pending.length || this.chunks) throw Error('OMP stream ended mid-frame')
  }

  private parse(bytes: Buffer): Record<string, any> {
    const frame = JSON.parse(utf8.decode(bytes))
    if (!frame || typeof frame !== 'object' || Array.isArray(frame) || typeof frame.type !== 'string') throw Error('Invalid OMP frame')
    return frame
  }

  private chunk(frame: Record<string, any>): Record<string, any> | undefined {
    const { chunkId, index, count, byteLength, data } = frame
    if (typeof chunkId !== 'string' || !chunkId || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || !Number.isSafeInteger(byteLength) || count < 1 || count > 1024 || byteLength < 1 || byteLength > MAX_LOGICAL || typeof data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw Error('Invalid OMP chunk metadata')
    const part = Buffer.from(data, 'base64')
    if (part.toString('base64') !== data) throw Error('Invalid OMP chunk encoding')
    if (!this.chunks) {
      if (index !== 0) throw Error('OMP chunk sequence starts out of order')
      this.chunks = { id: chunkId, count, byteLength, parts: [], size: 0 }
    }
    const current = this.chunks
    if (current.id !== chunkId || current.count !== count || current.byteLength !== byteLength || index !== current.parts.length) throw Error('OMP chunk sequence mismatch')
    current.parts.push(part)
    current.size += part.length
    if (current.size > current.byteLength || current.size > MAX_LOGICAL) throw Error('OMP chunk length overflow')
    if (current.parts.length !== count) return
    this.chunks = undefined
    if (current.size !== current.byteLength) throw Error('OMP chunk length mismatch')
    const result = this.parse(Buffer.concat(current.parts, current.size))
    if (result.type === 'rpc_chunk') throw Error('Nested OMP chunks are invalid')
    return result
  }
}
