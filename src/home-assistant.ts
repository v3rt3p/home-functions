import { Logger } from 'tslog'

export interface EntityHistoryEntry {
  lastChanged: string;
  state: string;
}

export interface EntityState {
  attributes: Record<string, unknown>;
  name: string;
  state: string;
}

export interface HassServiceDTO {
  domain: string;
  services: Record<string, unknown>;
}

export interface HomeAssistantApi {
  callService (domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  getEntityHistory (entityId: string, days: number): Promise<EntityHistoryEntry[]>;
  getEntityState (entityId: string): EntityState | undefined;
  getRegistry (): Promise<RegistryEntry[]>;
  hasService (domain: string, service: string): boolean;
  loadServiceIndex (): Promise<void>;
}

export interface RegistryEntry {
  entityId: string;
  labels: string[];
  name?: string;
}

/**
minimal structural type of the parts of @digital-alchemy/hass used here
*/
interface HassLike {
  entity: {
    getCurrentState (entityId: never): unknown;
    registry: {
      current: { entity_id: string, labels?: string[], name?: string }[];
      list (): Promise<{ entity_id: string, labels?: string[], name?: string }[]>;
    };
  };
  fetch: {
    fetch<T> (options: Record<string, unknown>): Promise<T>;
    listServices (): Promise<HassServiceDTO[]>;
  };
  socket: {
    sendMessage (data: Record<string, unknown>): Promise<unknown>;
  };
}

/**
 * Thin wrapper around @digital-alchemy/hass exposing exactly what home-functions needs.
 * All entity states come from the library's live websocket-synced cache.
 */
export function createHomeAssistantApi (hass: HassLike, logger: Logger<unknown>): HomeAssistantApi {
  const serviceIndex = new Set<string>()

  async function loadServiceIndex (): Promise<void> {
    const services = await hass.fetch.listServices()
    serviceIndex.clear()
    for (const domain of services) {
      for (const service of Object.keys(domain.services)) {
        serviceIndex.add(`${domain.domain}.${service}`)
      }
    }
    logger.info(`Loaded ${serviceIndex.size} Home Assistant services`)
  }

  function hasService (domain: string, service: string): boolean {
    return serviceIndex.has(`${domain}.${service}`)
  }

  async function getEntityHistory (entityId: string, days: number): Promise<EntityHistoryEntry[]> {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const result = await hass.fetch.fetch<unknown>({
      params: {
        end_time: new Date().toISOString(),
        filter_entity_id: entityId,
        minimal_response: ''
      },
      url: `/api/history/period/${encodeURIComponent(from.toISOString())}`
    })
    if (!Array.isArray(result) || result.length === 0) {
      return []
    }
    const entries = result[0] as Array<{ last_changed?: string, state?: string }>
    return entries
      .filter(entry => typeof entry.state === 'string')
      .map(entry => ({
        lastChanged: entry.last_changed ?? '',
        state: entry.state as string
      }))
  }

  async function getRegistry (): Promise<RegistryEntry[]> {
    const raw = hass.entity.registry.current.length > 0
      ? hass.entity.registry.current
      : await hass.entity.registry.list()
    return raw.map(item => ({
      entityId: item.entity_id,
      labels: item.labels ?? [],
      ...(item.name !== undefined && { name: item.name })
    }))
  }
  function getEntityState (entityId: string): EntityState | undefined {
    const raw = hass.entity.getCurrentState(entityId as never) as
      | undefined
      | { attributes?: Record<string, unknown>, state?: string }
    if (!raw || raw.state === undefined) {
      return undefined
    }
    const attributes = raw.attributes ?? {}
    const friendlyName = attributes.friendly_name
    return {
      attributes,
      name: typeof friendlyName === 'string' && friendlyName.length > 0
        ? friendlyName
        : entityId,
      state: raw.state
    }
  }

  async function callService (domain: string, service: string,
    data: Record<string, unknown>): Promise<void> {
    await hass.socket.sendMessage({
      domain,
      service,
      service_data: data,
      type: 'call_service'
    })
  }

  return { callService, getEntityHistory, getEntityState, getRegistry, hasService, loadServiceIndex }
}
