import { EntityConfig } from './config'

/**
 * JSON Schema describing a function's whole arguments object
 * (the `arguments` field of the function-state-server contract).
 */
export type JsonSchema = Record<string, unknown>

export interface RenamedVariant {
  aliases: string[];
  description: string;
  value: string;
}

/**
 * Wrap per-argument schemas into the arguments JSON Schema.
 * Zero-argument functions get an empty (permissive) schema.
 */
export function argumentsSchema (properties: Record<string, JsonSchema>): JsonSchema {
  const keys = Object.keys(properties)
  if (keys.length === 0) {
    return {}
  }
  return {
    properties,
    required: keys,
    type: 'object'
  }
}

export function numberMinMax (description: string, min: number, max: number): JsonSchema {
  return {
    description,
    maximum: max,
    minimum: min,
    type: 'number'
  }
}

export function numberVariants (description: string,
  variants: { description: string, value: number }[]): JsonSchema {
  return {
    anyOf: variants.map(variant => ({ const: variant.value, description: variant.description })),
    description
  }
}

export function onOffVariants (onDescription = 'on', offDescription = 'off'): JsonSchema {
  return numberVariants('device state', [
    { description: offDescription, value: 0 },
    { description: onDescription, value: 1 }
  ])
}

export function prettify (value: string): string {
  const spaced = value.replaceAll(/[_-]+/gu, ' ').trim()
  return spaced.length === 0 ? value : spaced.charAt(0).toLocaleUpperCase() + spaced.slice(1)
}

/**
 * Read a list attribute (effect_list, source_list, hvac_modes, options, ...) and apply
 * the configured renames for this entity.
 *
 * A rename value can be a single string or a list: the first entry becomes the primary
 * display name, the remaining entries are extra aliases. The raw value stays the same,
 * only what the assistant sees changes.
 */
export function renamedVariants (config: EntityConfig, listName: string,
  rawValues: unknown): RenamedVariant[] | undefined {
  if (!Array.isArray(rawValues)) {
    return undefined
  }
  const renames = config.modes[listName] ?? {}
  const variants: RenamedVariant[] = []
  for (const raw of rawValues) {
    if (typeof raw !== 'string') {
      continue
    }
    const rename = renames[raw]
    if (typeof rename === 'string') {
      variants.push({ aliases: [], description: rename, value: raw })
      continue
    }
    if (Array.isArray(rename) && typeof rename[0] === 'string') {
      variants.push({ aliases: rename.slice(1), description: rename[0], value: raw })
      continue
    }
    variants.push({ aliases: [], description: prettify(raw), value: raw })
  }
  return variants.length === 0 ? undefined : variants
}

export function stringVariants (description: string, variants: RenamedVariant[]): JsonSchema {
  return {
    anyOf: variants.map(variant => ({
      const: variant.value,
      description: [variant.description, ...variant.aliases].join(', ')
    })),
    description
  }
}
