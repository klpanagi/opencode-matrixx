import * as fs from "node:fs"
import * as path from "node:path"
import type { EvolutionState, TraceRecord } from "./types"

export const EVOLUTION_DIR = ".matrixx/evolution"
export const TRACES_DIR = ".matrixx/evolution/traces"
export const DISTILLED_DIR = ".matrixx/evolution/distilled"
export const SKILLS_DIR = ".matrixx/evolution/skills"
export const PENDING_DIR = ".matrixx/evolution/pending"
export const STATE_FILE = ".matrixx/evolution/state.json"
export const AUDIT_FILE = ".matrixx/evolution/audit.log"

const RING_BUFFER_MAX = 500

export class TraceStore {
  private ringBuffer: TraceRecord[] = []
  private evolutionDir: string

  constructor(evolutionDir: string = EVOLUTION_DIR) {
    this.evolutionDir = evolutionDir
  }

  async append(record: TraceRecord): Promise<void> {
    this.ringBuffer.push(record)
    if (this.ringBuffer.length > RING_BUFFER_MAX) {
      this.ringBuffer.shift()
    }
    const tracesDir = path.join(this.evolutionDir, "traces")
    try {
      fs.mkdirSync(tracesDir, { recursive: true })
    } catch {}
    const filePath = path.join(tracesDir, `${record.sessionID}.jsonl`)
    const line = `${JSON.stringify(record)}\n`
    try {
      await fs.promises.appendFile(filePath, line, "utf-8")
    } catch {}
  }

  getRecent(count = 50): TraceRecord[] {
    if (count >= this.ringBuffer.length) return [...this.ringBuffer]
    return this.ringBuffer.slice(-count)
  }

  async readSession(sessionID: string): Promise<TraceRecord[]> {
    const filePath = path.join(this.evolutionDir, "traces", `${sessionID}.jsonl`)
    try {
      const content = await fs.promises.readFile(filePath, "utf-8")
      const records: TraceRecord[] = []
      for (const line of content.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          records.push(JSON.parse(trimmed) as TraceRecord)
        } catch {}
      }
      return records
    } catch {
      return []
    }
  }

  async getAllTraces(sessionID: string): Promise<TraceRecord[]> {
    const disk = await this.readSession(sessionID)
    if (disk.length > 0) return disk
    return this.ringBuffer.filter((r) => r.sessionID === sessionID)
  }

  async cleanup(retentionDays: number): Promise<void> {
    const tracesDir = path.join(this.evolutionDir, "traces")
    let files: string[] = []
    try {
      files = await fs.promises.readdir(tracesDir)
    } catch {
      return
    }
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    for (const file of files) {
      const filePath = path.join(tracesDir, file)
      try {
        const stat = await fs.promises.stat(filePath)
        if (stat.mtimeMs < cutoff) {
          await fs.promises.unlink(filePath)
        }
      } catch {}
    }
  }

  async getState(): Promise<EvolutionState> {
    const filePath = path.join(this.evolutionDir, "state.json")
    try {
      const content = await fs.promises.readFile(filePath, "utf-8")
      return JSON.parse(content) as EvolutionState
    } catch {
      return { totalTraces: 0, totalCompressions: 0 }
    }
  }

  async updateState(patch: Partial<EvolutionState>): Promise<void> {
    const current = await this.getState()
    const next: EvolutionState = { ...current, ...patch }
    try {
      fs.mkdirSync(this.evolutionDir, { recursive: true })
    } catch {}
    const filePath = path.join(this.evolutionDir, "state.json")
    const tmpPath = `${filePath}.tmp`
    try {
      await fs.promises.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf-8")
      await fs.promises.rename(tmpPath, filePath)
    } catch {}
  }

  async appendAudit(entry: Record<string, unknown>): Promise<void> {
    const filePath = path.join(this.evolutionDir, "audit.log")
    try {
      fs.mkdirSync(this.evolutionDir, { recursive: true })
    } catch {}
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`
    try {
      await fs.promises.appendFile(filePath, line, "utf-8")
    } catch {}
  }
}

export const traceStore = new TraceStore()
