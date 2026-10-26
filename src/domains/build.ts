import { FunctionArgument } from '@v3rt3p/types/function-state-server'

import {
  numberMinMax,
  onOffVariants,
  renamedVariants,
  stringVariants
} from '../arguments'
import { hasFeature } from './features'
import { DeviceContext, DeviceFunction } from './types'

/**
named no-argument action, e.g. pause, next track, stop
*/
function actionFunction (context: DeviceContext, action: string, service: string,
  description: string): DeviceFunction {
  const { callService, domain, entity, slug } = context
  return function_(`${slug}_${action}`, description, {}, async () => {
    await callService(domain, service, { entity_id: entity.entityId })
  })
}

function asNumber (value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampPercent (value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function featuresOf (context: DeviceContext): number {
  return context.entity.features
}

function function_ (name: string, description: string, arguments_: Record<string, FunctionArgument>,
  invoke: (values: Record<string, number | string>) => Promise<string | undefined> | Promise<void>): DeviceFunction {
  return {
    arguments: arguments_,
    description,
    invoke: invoke as (values: Record<string, number | string>) => Promise<string | undefined>,
    name
  }
}

/**
single-argument service call, e.g. select_source { source: ... }
*/
function optionFunction (context: DeviceContext, action: string, service: string,
  argumentName: string, argument: FunctionArgument, description: string): DeviceFunction {
  const { callService, domain, entity, slug } = context
  return function_(`${slug}_${action}`, description, { [argumentName]: argument }, async values => {
    await callService(domain, service, {
      [argumentName]: values[argumentName],
      entity_id: entity.entityId
    })
  })
}

/**
 * Standard on/off function with `state` variants 0/off and 1/on.
 * This exact shape is what the NLP parser (matchesAction/buildArguments) matches
 * against, and the `_state` suffix enables the power-sound feedback in processor.
 */
function stateFunction (context: DeviceContext, onService: string, offService: string,
  description: string): DeviceFunction {
  const { callService, domain, entity, slug } = context
  return function_(`set_${slug}_state`, description, { state: onOffVariants() }, async values => {
    const service = asNumber(values.state) === 1 ? onService : offService
    await callService(domain, service, { entity_id: entity.entityId })
  })
}

// #MARK: light

const COLOR_NAMES = [
  { aliases: ['белый'], description: 'white', value: 'white' },
  { aliases: ['красный'], description: 'red', value: 'red' },
  { aliases: ['зелёный', 'зеленый'], description: 'green', value: 'green' },
  { aliases: ['синий'], description: 'blue', value: 'blue' },
  { aliases: ['жёлтый', 'желтый'], description: 'yellow', value: 'yellow' },
  { aliases: ['оранжевый'], description: 'orange', value: 'orange' },
  { aliases: ['фиолетовый'], description: 'purple', value: 'purple' },
  { aliases: ['розовый'], description: 'pink', value: 'pink' },
  { aliases: ['голубой'], description: 'cyan', value: 'cyan' }
]

function buildAlarm (context: DeviceContext): DeviceFunction[] {
  const features = featuresOf(context)

  return [
    ...(hasFeature(features, 'alarm_control_panel', 'ARM_HOME')
      ? [actionFunction(context, 'arm_home', 'alarm_arm_home',
        `arm ${context.name} in home mode`)]
      : []),

    ...(hasFeature(features, 'alarm_control_panel', 'ARM_AWAY')
      ? [actionFunction(context, 'arm_away', 'alarm_arm_away',
        `arm ${context.name} in away mode`)]
      : []),

    ...(hasFeature(features, 'alarm_control_panel', 'ARM_NIGHT')
      ? [actionFunction(context, 'arm_night', 'alarm_arm_night',
        `arm ${context.name} in night mode`)]
      : []),

    ...(hasFeature(features, 'alarm_control_panel', 'ARM_VACATION')
      ? [actionFunction(context, 'arm_vacation', 'alarm_arm_vacation',
        `arm ${context.name} in vacation mode`)]
      : []),

    actionFunction(context, 'disarm', 'alarm_disarm', `disarm ${context.name}`)
  ]
}

function buildButton (context: DeviceContext): DeviceFunction[] {
  return [
    actionFunction(context, 'press', 'press', `press ${context.name} button`)
  ]
}

// #MARK: switch / input_boolean

function buildClimate (context: DeviceContext): DeviceFunction[] {
  const { config, entity, slug } = context
  const attributes = entity.attributes
  const features = featuresOf(context)

  const hvacVariants = renamedVariants(config, 'hvac_mode', attributes.hvac_modes)
  const presetVariants = hasFeature(features, 'climate', 'PRESET_MODE')
    ? renamedVariants(config, 'preset_mode', attributes.preset_modes)
    : undefined
  const fanVariants = hasFeature(features, 'climate', 'FAN_MODE')
    ? renamedVariants(config, 'fan_mode', attributes.fan_modes)
    : undefined
  const swingVariants = hasFeature(features, 'climate', 'SWING_MODE')
    ? renamedVariants(config, 'swing_mode', attributes.swing_modes)
    : undefined

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    ...(hasFeature(features, 'climate', 'TARGET_TEMPERATURE')
      ? [function_(`set_${slug}_temperature`, `set ${context.name} target temperature`, {
          temperature: numberMinMax('target temperature in degrees',
            asNumber(attributes.min_temp) || 7,
            asNumber(attributes.max_temp) || 35)
        }, async values => {
          await context.callService(context.domain, 'set_temperature', {
            entity_id: entity.entityId,
            temperature: asNumber(values.temperature)
          })
        })]
      : []),

    ...(hvacVariants
      ? [optionFunction(context, 'hvac_mode', 'set_hvac_mode', 'hvac_mode',
          stringVariants('hvac mode', hvacVariants), `set ${context.name} hvac mode`)]
      : []),

    ...(presetVariants
      ? [optionFunction(context, 'preset_mode', 'set_preset_mode', 'preset_mode',
          stringVariants('preset mode', presetVariants), `set ${context.name} preset mode`)]
      : []),

    ...(fanVariants
      ? [optionFunction(context, 'fan_mode', 'set_fan_mode', 'fan_mode',
          stringVariants('fan mode', fanVariants), `set ${context.name} fan mode`)]
      : []),

    ...(swingVariants
      ? [optionFunction(context, 'swing_mode', 'set_swing_mode', 'swing_mode',
          stringVariants('swing mode', swingVariants), `set ${context.name} swing mode`)]
      : [])
  ]
}

// #MARK: media_player

function buildCover (context: DeviceContext): DeviceFunction[] {
  const { callService, domain, entity, slug } = context
  const features = featuresOf(context)

  return [
    stateFunction(context, 'open_cover', 'close_cover',
      `open or close ${context.name}`),

    ...(hasFeature(features, 'cover', 'STOP')
      ? [actionFunction(context, 'stop', 'stop_cover', `stop ${context.name}`)]
      : []),

    ...(hasFeature(features, 'cover', 'SET_POSITION')
      ? [function_(`set_${slug}_position`, `set ${context.name} open position percent`, {
          position: numberMinMax('position percent', 0, 100)
        }, async values => {
          await callService(domain, 'set_cover_position', {
            entity_id: entity.entityId,
            position: clampPercent(asNumber(values.position))
          })
        })]
      : []),

    ...(hasFeature(features, 'cover', 'SET_TILT_POSITION')
      ? [function_(`set_${slug}_tilt`, `set ${context.name} tilt position percent`, {
          tilt: numberMinMax('tilt position percent', 0, 100)
        }, async values => {
          await callService(domain, 'set_cover_tilt_position', {
            entity_id: entity.entityId,
            tilt_position: clampPercent(asNumber(values.tilt))
          })
        })]
      : [])
  ]
}

// #MARK: climate

function buildFan (context: DeviceContext): DeviceFunction[] {
  const { config, entity, slug } = context
  const attributes = entity.attributes
  const features = featuresOf(context)

  const presetVariants = hasFeature(features, 'fan', 'PRESET_MODE')
    ? renamedVariants(config, 'preset_mode', attributes.preset_modes)
    : undefined

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    ...(hasFeature(features, 'fan', 'SET_SPEED')
      ? [function_(`set_${slug}_speed`, `set ${context.name} fan speed percent`, {
          speed: numberMinMax('fan speed percent', 0, 100)
        }, async values => {
          await context.callService(context.domain, 'set_percentage', {
            entity_id: entity.entityId,
            percentage: clampPercent(asNumber(values.speed))
          })
        })]
      : []),

    ...(presetVariants
      ? [optionFunction(context, 'preset_mode', 'set_preset_mode', 'preset_mode',
          stringVariants('preset mode', presetVariants), `set ${context.name} preset mode`)]
      : [])
  ]
}

// #MARK: fan

function buildGeneric (context: DeviceContext): DeviceFunction[] {
  if (context.services.has(context.domain, 'turn_on') &&
      context.services.has(context.domain, 'turn_off')) {
    return [
      stateFunction(context, 'turn_on', 'turn_off', `set ${context.name} state (on or off)`)
    ]
  }
  return []
}

// #MARK: cover / valve

function buildHumidifier (context: DeviceContext): DeviceFunction[] {
  const { callService, config, domain, entity, slug } = context
  const attributes = entity.attributes
  const features = featuresOf(context)

  const modeVariants = hasFeature(features, 'humidifier', 'MODES')
    ? renamedVariants(config, 'mode', attributes.mode_list)
    : undefined

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    function_(`set_${slug}_humidity`, `set ${context.name} target humidity percent`, {
      humidity: numberMinMax('target humidity percent',
        asNumber(attributes.min_humidity) || 30,
        asNumber(attributes.max_humidity) || 99)
    }, async values => {
      await callService(domain, 'set_humidity', {
        entity_id: entity.entityId,
        humidity: clampPercent(asNumber(values.humidity))
      })
    }),

    ...(modeVariants
      ? [optionFunction(context, 'mode', 'set_mode', 'mode',
          stringVariants('mode', modeVariants), `set ${context.name} mode`)]
      : [])
  ]
}

// #MARK: lock

function buildLawnMower (context: DeviceContext): DeviceFunction[] {
  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),
    actionFunction(context, 'start', 'start_mowing', `start ${context.name} mowing`),
    actionFunction(context, 'pause', 'pause_mowing', `pause ${context.name} mowing`),
    actionFunction(context, 'dock', 'dock', `send ${context.name} to dock`)
  ]
}

// #MARK: vacuum

function buildLight (context: DeviceContext): DeviceFunction[] {
  const { callService, config, domain, entity, slug } = context
  const attributes = entity.attributes
  const colorModes = colorModesOf(attributes)

  const effectVariants = renamedVariants(config, 'effect', attributes.effect_list)
  const customColors = renamedVariants(config, 'color', COLOR_NAMES.map(color => color.value))

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    function_(`set_${slug}_brightness`, `set ${context.name} brightness percent`, {
      brightness: numberMinMax('brightness percent', 1, 100)
    }, async values => {
      await callService(domain, 'turn_on', {
        brightness_pct: clampPercent(asNumber(values.brightness)),
        entity_id: entity.entityId
      })
    }),

    ...(colorModes.some(mode => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(mode))
      ? [function_(`set_${slug}_color`, `set ${context.name} color`, {
          color: stringVariants('color name', customColors ?? COLOR_NAMES)
        }, async values => {
          await callService(domain, 'turn_on', {
            color_name: values.color,
            entity_id: entity.entityId
          })
        })]
      : []),

    ...(colorModes.includes('color_temp')
      ? [function_(`set_${slug}_color_temperature`, `set ${context.name} color temperature`, {
          temperature: numberMinMax('color temperature in mireds',
            asNumber(attributes.min_mireds) || 153,
            asNumber(attributes.max_mireds) || 500)
        }, async values => {
          await callService(domain, 'turn_on', {
            color_temp_mireds: Math.round(asNumber(values.temperature)),
            entity_id: entity.entityId
          })
        })]
      : []),

    ...(effectVariants
      ? [function_(`set_${slug}_effect`, `set ${context.name} effect`, {
          effect: stringVariants('light effect', effectVariants)
        }, async values => {
          await callService(domain, 'turn_on', {
            effect: values.effect,
            entity_id: entity.entityId
          })
        })]
      : [])
  ]
}

// #MARK: humidifier

function buildLock (context: DeviceContext): DeviceFunction[] {
  const { callService, domain, entity, slug } = context

  return [
    stateFunction(context, 'unlock', 'lock', `lock or unlock ${context.name}`),

    ...(hasFeature(featuresOf(context), 'lock', 'OPEN')
      ? [function_(`${slug}_open`, `open ${context.name}`, {}, async () => {
          await callService(domain, 'open', { entity_id: entity.entityId })
        })]
      : [])
  ]
}

// #MARK: water_heater

function buildMediaPlayer (context: DeviceContext): DeviceFunction[] {
  const { config, entity, slug } = context
  const attributes = entity.attributes
  const features = featuresOf(context)

  const sourceVariants = renamedVariants(config, 'source', attributes.source_list)
  const soundModeVariants = renamedVariants(config, 'sound_mode', attributes.sound_mode_list)

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    ...(hasFeature(features, 'media_player', 'VOLUME_SET')
      ? [function_(`set_${slug}_volume`, `set ${context.name} volume percent`, {
          volume: numberMinMax('volume level percent', 0, 100)
        }, async values => {
          await context.callService(context.domain, 'volume_set', {
            entity_id: entity.entityId,
            volume_level: clampPercent(asNumber(values.volume)) / 100
          })
        })]
      : []),

    ...(hasFeature(features, 'media_player', 'PAUSE') || hasFeature(features, 'media_player', 'PLAY')
      ? [
          actionFunction(context, 'pause', 'media_pause', `pause ${context.name}`),
          actionFunction(context, 'play', 'media_play', `resume playback on ${context.name}`)
        ]
      : []),

    ...(hasFeature(features, 'media_player', 'NEXT_TRACK')
      ? [actionFunction(context, 'next', 'media_next_track', `next track on ${context.name}`)]
      : []),

    ...(hasFeature(features, 'media_player', 'PREVIOUS_TRACK')
      ? [actionFunction(context, 'previous', 'media_previous_track',
        `previous track on ${context.name}`)]
      : []),

    ...(sourceVariants
      ? [optionFunction(context, 'source', 'select_source', 'source',
          stringVariants('input source', sourceVariants), `set ${context.name} input source`)]
      : []),

    ...(soundModeVariants
      ? [optionFunction(context, 'sound_mode', 'select_sound_mode', 'sound_mode',
          stringVariants('sound mode', soundModeVariants), `set ${context.name} sound mode`)]
      : [])
  ]
}

// #MARK: select / input_select

function buildNumber (context: DeviceContext): DeviceFunction[] {
  const { callService, domain, entity, slug } = context
  const attributes = entity.attributes

  return [
    function_(`set_${slug}_value`, `set ${context.name} value`, {
      value: numberMinMax('numeric value',
        asNumber(attributes.min) || 0,
        asNumber(attributes.max) || 100)
    }, async values => {
      await callService(domain, 'set_value', {
        entity_id: entity.entityId,
        value: asNumber(values.value)
      })
    })
  ]
}

// #MARK: number / input_number

function buildScene (context: DeviceContext): DeviceFunction[] {
  return [
    actionFunction(context, 'activate', 'turn_on', `activate ${context.name} scene`)
  ]
}

// #MARK: scene / script / button

function buildScript (context: DeviceContext): DeviceFunction[] {
  return [
    actionFunction(context, 'run', 'turn_on', `run ${context.name} script`)
  ]
}

function buildSelect (context: DeviceContext): DeviceFunction[] {
  const { config, entity } = context
  const optionVariants = renamedVariants(config, 'option', entity.attributes.options)
  if (!optionVariants) {
    return []
  }
  return [
    optionFunction(context, 'option', 'select_option', 'option',
      stringVariants('option', optionVariants), `set ${context.name} option`)
  ]
}

function buildSiren (context: DeviceContext): DeviceFunction[] {
  const { config, entity } = context
  const toneVariants = hasFeature(featuresOf(context), 'siren', 'TONES')
    ? renamedVariants(config, 'tone', entity.attributes.available_tones)
    : undefined

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    ...(toneVariants
      ? [optionFunction(context, 'tone', 'turn_on', 'tone',
          stringVariants('tone', toneVariants), `set ${context.name} tone`)]
      : [])
  ]
}

// #MARK: siren

function buildSwitch (context: DeviceContext): DeviceFunction[] {
  return [
    stateFunction(context, 'turn_on', 'turn_off', `set ${context.name} state (on or off)`)
  ]
}

// #MARK: alarm_control_panel

function buildVacuum (context: DeviceContext): DeviceFunction[] {
  const { config, entity } = context
  const features = featuresOf(context)

  const fanVariants = hasFeature(features, 'vacuum', 'FAN_SPEED')
    ? renamedVariants(config, 'fan_speed', entity.attributes.fan_speed_list)
    : undefined

  return [
    stateFunction(context, 'turn_on', 'turn_off',
      `set ${context.name} state (on or off)`),

    ...(hasFeature(features, 'vacuum', 'START')
      ? [actionFunction(context, 'start', 'start', `start ${context.name} cleaning`)]
      : []),

    ...(hasFeature(features, 'vacuum', 'PAUSE')
      ? [actionFunction(context, 'pause', 'pause', `pause ${context.name} cleaning`)]
      : []),

    ...(hasFeature(features, 'vacuum', 'RETURN_HOME')
      ? [actionFunction(context, 'return_home', 'return_to_base',
        `send ${context.name} to dock`)]
      : []),

    ...(fanVariants
      ? [optionFunction(context, 'fan_speed', 'set_fan_speed', 'fan_speed',
          stringVariants('fan speed', fanVariants), `set ${context.name} fan speed`)]
      : [])
  ]
}

// #MARK: lawn_mower

function buildWaterHeater (context: DeviceContext): DeviceFunction[] {
  const { config, domain, entity, slug } = context
  const attributes = entity.attributes
  const features = featuresOf(context)

  const operationVariants = hasFeature(features, 'water_heater', 'OPERATION_MODE')
    ? renamedVariants(config, 'operation_mode', attributes.operation_list)
    : undefined

  return [
    ...(hasFeature(features, 'water_heater', 'ON_OFF')
      ? [stateFunction(context, 'turn_on', 'turn_off',
        `set ${context.name} state (on or off)`)]
      : []),

    ...(hasFeature(features, 'water_heater', 'TARGET_TEMPERATURE')
      ? [function_(`set_${slug}_temperature`, `set ${context.name} temperature`, {
          temperature: numberMinMax('temperature in degrees',
            asNumber(attributes.min_temp) || 30,
            asNumber(attributes.max_temp) || 90)
        }, async values => {
          await context.callService(domain, 'set_temperature', {
            entity_id: entity.entityId,
            temperature: asNumber(values.temperature)
          })
        })]
      : []),

    ...(operationVariants
      ? [optionFunction(context, 'operation_mode', 'set_operation_mode',
          'operation_mode', stringVariants('operation mode', operationVariants),
        `set ${context.name} operation mode`)]
      : [])
  ]
}

// #MARK: generic fallback

function colorModesOf (attributes: Record<string, unknown>): string[] {
  const modes = attributes.supported_color_modes
  return Array.isArray(modes) ? modes.map(String) : []
}

// #MARK: registry

const BUILDERS: Record<string, (context: DeviceContext) => DeviceFunction[]> = {
  alarm_control_panel: buildAlarm,
  button: buildButton,
  climate: buildClimate,
  cover: buildCover,
  fan: buildFan,
  humidifier: buildHumidifier,
  input_boolean: buildSwitch,
  input_button: buildButton,
  input_number: buildNumber,
  input_select: buildSelect,
  lawn_mower: buildLawnMower,
  light: buildLight,
  lock: buildLock,
  media_player: buildMediaPlayer,
  number: buildNumber,
  scene: buildScene,
  script: buildScript,
  select: buildSelect,
  siren: buildSiren,
  switch: buildSwitch,
  vacuum: buildVacuum,
  valve: buildCover,
  water_heater: buildWaterHeater
}

export function buildDeviceFunctions (context: DeviceContext): DeviceFunction[] {
  const builder = BUILDERS[context.domain]
  const functions = builder ? builder(context) : buildGeneric(context)
  const withHistory = functions.some(f => f.name.endsWith('_state'))
    ? [...functions, buildHistoryFunction(context)]
    : functions
  const seen = new Set<string>()
  return withHistory.filter(deviceFunction => {
    if (seen.has(deviceFunction.name)) {
      return false
    }
    seen.add(deviceFunction.name)
    return true
  })
}

/**
 * `<slug>_history(days)` — device usage statistics over the recent period,
 * answered from the Home Assistant history (counts of on/off transitions and
 * total "on" time). Returns a human-readable result string for the assistant.
 */
function buildHistoryFunction (context: DeviceContext): DeviceFunction {
  const { entity, name, slug } = context
  return {
    arguments: {
      days: numberMinMax('period in days, e.g. 7 for the last week', 1, 31)
    },
    description: `how often ${name} was used: returns number of activations and ` +
      'total active time for the requested period',
    hasResponse: true,
    invoke: async values => {
      const days = Number(values.days ?? 1)
      const history = await context.getHistory(entity.entityId, Math.min(31, Math.max(1, days)))
      let activations = 0
      let activeMs = 0
      let lastOn: number | undefined
      for (const entry of history) {
        const isOn = ['home', 'on', 'open', 'opening', 'playing'].includes(entry.state)
        const time = entry.lastChanged ? Date.parse(entry.lastChanged) : NaN
        if (isOn) {
          activations += 1
          lastOn = time
        } else if (lastOn !== undefined && Number.isFinite(time)) {
          activeMs += Math.max(0, time - lastOn)
          lastOn = undefined
        }
      }
      if (lastOn !== undefined) {
        activeMs += Math.max(0, Date.now() - lastOn)
      }
      const hours = Math.round(activeMs / 3_600_000 * 10) / 10
      const humanPeriod = days === 1 ? 'за сутки' : `за ${days} ${pluralizeDays(days)}`
      return `${name}: ${activations} включений, суммарно ${hours} ч в активном состоянии ${humanPeriod}`
    },
    name: `${slug}_history`
  }
}

function pluralizeDays (days: number): string {
  const module10 = days % 10
  const module100 = days % 100
  if (module10 === 1 && module100 !== 11) {
    return 'день'
  }
  return module10 >= 2 && module10 <= 4 && (module100 < 12 || module100 > 14) ? 'дня' : 'дней'
}
