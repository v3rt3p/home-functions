import fs from 'node:fs'
import { parse } from 'yaml'
import z from 'zod'

const renameType = z.union([z.string(), z.array(z.string())])
const modesType = z.record(z.string(), renameType)

const entityConfigType = z.object({
  description: z.string().optional(),
  modes: z.record(z.string(), modesType).default({}),
  names: z.array(z.string()).default([]),
  slug: z.string().optional()
})

const configType = z.object({
  entities: z.record(z.string(), entityConfigType).default({}),
  labels: z.array(z.string()).default([])
})

export type EntityConfig = z.infer<typeof entityConfigType>
export type HomeFunctionsConfig = z.infer<typeof configType>

export function loadConfig (path: string): HomeFunctionsConfig {
  const raw = fs.readFileSync(path).toString('utf8')
  return configType.parse(raw.trim() === '' ? {} : parse(raw))
}
