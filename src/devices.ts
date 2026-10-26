import { EntityConfig, HomeFunctionsConfig } from './config'
import { buildDeviceFunctions } from './domains/build'
import { formatEntityState } from './domains/state'
import {
  DeviceContext,
  DeviceFunction,
  DeviceStateProvider,
  LooseEntityState
} from './domains/types'
import { HomeAssistantApi } from './home-assistant'
import { slugify } from './translit'

export interface DeviceEntry {
  entityId: string;
  functions: DeviceFunction[];
  slug: string;
  stateProvider: DeviceStateProvider;
}

const EXCLUDED_DOMAINS = new Set([
  // read-only or internal domains that should not be exposed to voice control
  'automation',
  'binary_sensor',
  'device_tracker',
  'event',
  'input_datetime',
  'persistent_notification',
  'schedule',
  'sensor',
  'sun',
  'text',
  'update',
  'zone'
])

const EMPTY_ENTITY_CONFIG: EntityConfig = { modes: {}, names: [] }

/**
 * Builds the list of exposed devices: every entity carrying one of the configured
 * labels, minus excluded domains. Function/state generation is driven by the live
 * entity state (domain, supported_features, attribute lists) with per-entity
 * mode renames from the config applied on top.
 */
export async function buildDevices (homeAssistant: HomeAssistantApi,
  config: HomeFunctionsConfig): Promise<Map<string, DeviceEntry>> {
  const devices = new Map<string, DeviceEntry>()
  if (config.labels.length === 0) {
    return devices
  }

  const registry = await homeAssistant.getRegistry()
  const labelSet = new Set(config.labels)

  for (const item of registry) {
    if (item.labels.every(label => !labelSet.has(label))) {
      continue
    }
    const state = homeAssistant.getEntityState(item.entityId)
    if (!state) {
      continue
    }
    const domain = item.entityId.split('.', 1)[0] ?? item.entityId
    if (EXCLUDED_DOMAINS.has(domain)) {
      continue
    }

    const entityConfig = config.entities[item.entityId] ?? EMPTY_ENTITY_CONFIG
    const name = entityConfig.description ?? item.name ?? state.name
    const slug = entityConfig.slug ?? slugify(name)

    const context: DeviceContext = {
      callService: (domain_, service, data) => homeAssistant.callService(domain_, service, data),
      config: entityConfig,
      domain,
      entity: {
        ...state,
        entityId: item.entityId,
        features: Number(state.attributes.supported_features ?? 0)
      },
      getHistory: (entityId, days) => homeAssistant.getEntityHistory(entityId, days),
      name,
      services: { has: (domain_, service) => homeAssistant.hasService(domain_, service) },
      slug
    }

    const functions = buildDeviceFunctions(context)

    const stateProvider: DeviceStateProvider = {
      description: `current state of ${name}`,
      format: entity => formatEntityState(entityConfig, entity),
      name: `current_${slug}_state`
    }

    devices.set(item.entityId, {
      entityId: item.entityId,
      functions,
      slug,
      stateProvider
    })
  }

  return devices
}

/**
live snapshot of a device's entity state
*/
export function snapshotEntity (homeAssistant: HomeAssistantApi,
  entityId: string): LooseEntityState | undefined {
  const state = homeAssistant.getEntityState(entityId)
  if (!state) {
    return undefined
  }
  return {
    ...state,
    entityId,
    features: Number(state.attributes.supported_features ?? 0)
  }
}
