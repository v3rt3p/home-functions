import { FunctionArgument } from '@v3rt3p/types/function-state-server'

import { EntityConfig } from './config'

export interface RenamedVariant {
  aliases: string[];
  description: string;
  value: string;
}

export function numberMinMax (description: string, min: number, max: number): FunctionArgument {
  return {
    constraints: {
      argumentType: 'number',
      max,
      min,
      type: 'number-min-max'
    },
    description
  }
}

export function numberVariants (description: string,
  variants: { description: string, value: number }[]): FunctionArgument {
  return {
    constraints: {
      argumentType: 'number',
      type: 'number-variants',
      variants
    },
    description
  }
}

export function onOffVariants (onDescription = 'on', offDescription = 'off'): FunctionArgument {
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

export function stringVariants (description: string, variants: RenamedVariant[]): FunctionArgument {
  return {
    constraints: {
      argumentType: 'string',
      type: 'string-variants',
      variants: variants.map(variant => ({
        description: [variant.description, ...variant.aliases].join(', '),
        value: variant.value
      }))
    },
    description
  }
}
