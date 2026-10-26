import { CreateApplication, TServiceParams } from '@digital-alchemy/core'
import { LIB_HASS } from '@digital-alchemy/hass'
import { functionStateServerCallFunctionRequest } from '@v3rt3p/types/function-state-server'
import dotenv from 'dotenv'
import express from 'express'

import { loadConfig } from './config'
import { buildDevices, DeviceEntry, snapshotEntity } from './devices'
import { createHomeAssistantApi, HomeAssistantApi } from './home-assistant'
import { getLogger } from './logger'

const logger = getLogger()

dotenv.config({
  path: '.env.local'
})
dotenv.config()

const CONFIG_PATH = process.env.CONFIG_PATH ?? 'config.yaml'
const PORT = Number.parseInt(process.env.PORT || '8080')

/**
 * Device list cache TTL: registry updates arrive over websocket instantly, so
 * this only protects against pathological request rates.
 */
const DEVICE_CACHE_MS = 1000

function collectFunctions (devices: Map<string, DeviceEntry>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const device of devices.values()) {
    for (const function_ of device.functions) {
      result[function_.name] = {
        ...((function_.hasResponse === true) && { hasResponse: true }),
        arguments: function_.arguments,
        description: function_.description
      }
    }
  }
  return result
}

function collectState (homeAssistant: HomeAssistantApi,
  devices: Map<string, DeviceEntry>): Record<string, { description: string, value: string }> {
  const result: Record<string, { description: string, value: string }> = {}
  for (const device of devices.values()) {
    result[device.stateProvider.name] = {
      description: device.stateProvider.description,
      value: device.stateProvider.format(snapshotEntity(homeAssistant, device.entityId))
    }
  }
  return result
}

function findFunction (devices: Map<string, DeviceEntry>,
  name: string): DeviceEntry['functions'][number] | undefined {
  for (const device of devices.values()) {
    const function_ = device.functions.find(f => f.name === name)
    if (function_) {
      return function_
    }
  }
  return undefined
}

/**
 * home-functions exposes Home Assistant devices (selected by their HA labels) to the
 * processor, using the same function/state HTTP contract as function-state-server.
 */
function MainService ({ hass, lifecycle }: TServiceParams) {
  const homeAssistant: HomeAssistantApi = createHomeAssistantApi(hass, logger)

  /**
   * Rebuilt on demand from the live websocket-synced registry, so newly
   * labeled devices appear without a restart.
   */
  let devicesCache: undefined | { devices: Map<string, DeviceEntry>; updatedAt: number, }
  let devicesPromise: Promise<Map<string, DeviceEntry>> | undefined

  async function getDevices (): Promise<Map<string, DeviceEntry>> {
    const now = Date.now()
    if (devicesCache && now - devicesCache.updatedAt < DEVICE_CACHE_MS) {
      return devicesCache.devices
    }
    if (devicesPromise) {
      return devicesPromise
    }
    devicesPromise = (async () => {
      const devices = await buildDevices(homeAssistant, loadConfig(CONFIG_PATH))
      const previous = devicesCache?.devices
      for (const device of devices.values()) {
        if (!previous?.has(device.entityId)) {
          logger.info(`Exposed '${device.entityId}' as '${device.slug}' ` +
            `(${device.functions.length} functions)`)
        }
      }
      devicesCache = { devices, updatedAt: Date.now() }
      return devices
    })()
    try {
      return await devicesPromise
    } finally {
      devicesPromise = undefined
    }
  }

  lifecycle.onReady(async () => {
    try {
      await homeAssistant.loadServiceIndex()
    } catch (error: unknown) {
      logger.error(`Failed to load Home Assistant services: ${String(error)}`)
    }
    void getDevices()
    startHttpServer(homeAssistant, getDevices)
  })
}

function startHttpServer (homeAssistant: HomeAssistantApi,
  getDevices: () => Promise<Map<string, DeviceEntry>>): void {
  const app = express()
  app.use(express.json())

  app.put('/state', async (_, response) => {
    response.status(200).json(collectState(homeAssistant, await getDevices()))
  })

  app.post('/state', async (_, response) => {
    response.status(200).json(collectState(homeAssistant, await getDevices()))
  })

  app.get('/functions', async (_, response) => {
    response.status(200).json(collectFunctions(await getDevices()))
  })

  app.post('/functions', async (_, response) => {
    // same contract as GET: lets clients force a device list refresh via POST
    response.status(200).json(collectFunctions(await getDevices()))
  })

  app.patch('/functions', (request, response) => {
    const body = functionStateServerCallFunctionRequest.parse(request.body)
    logger.info(`Called function '${body.name}' with ${JSON.stringify(body)}`)
    void (async () => {
      const function_ = findFunction(await getDevices(), body.name)
      if (!function_) {
        response.status(500).json({ error: 'No such function exists' })
        return
      }
      try {
        const result = await function_.invoke(body.arguments)
        response.status(200).json(result === undefined ? {} : { response: result })
      } catch (error: unknown) {
        logger.warn(`Failed to call '${body.name}': ${String(error)}`)
        response.status(500).json({ error: String(error) })
      }
    })()
  })

  app.get('/health', (_, response) => {
    response.status(200).json({ status: 'ok' })
  })

  app.listen(PORT, error => {
    if (error) {
      logger.fatal(`Failed to start on :${PORT}: ${error}`)
      return
    }
    logger.info(`Serving functions and states on :${PORT}`)
  })
}

export const HOME_APPLICATION = CreateApplication({
  libraries: [LIB_HASS],
  name: 'home_functions',
  services: { main: MainService }
})

declare module '@digital-alchemy/core' {
  export interface LoadedModules {
    home_functions: typeof HOME_APPLICATION;
  }
}

void HOME_APPLICATION.bootstrap().catch((error: unknown) => {
  logger.fatal(`Failed to bootstrap: ${String(error)}`)
  process.exit(1)
})
