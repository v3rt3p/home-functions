/**
 * Home Assistant `supported_features` bitmasks.
 * Mirrors the const.py files of the homeassistant components.
 */
export const FEATURES = {
  alarm_control_panel: {
    ARM_AWAY: 2,
    ARM_CUSTOM_BYPASS: 16,
    ARM_HOME: 1,
    ARM_NIGHT: 4,
    ARM_VACATION: 8
  },
  climate: {
    FAN_MODE: 8,
    PRESET_MODE: 16,
    SWING_MODE: 32,
    TARGET_HUMIDITY: 4,
    TARGET_TEMPERATURE: 1,
    TURN_OFF: 128,
    TURN_ON: 256
  },
  cover: {
    CLOSE: 2,
    OPEN: 1,
    SET_POSITION: 4,
    SET_TILT_POSITION: 128,
    STOP: 8
  },
  fan: {
    DIRECTION: 4,
    OSCILLATE: 2,
    PRESET_MODE: 8,
    SET_SPEED: 1,
    TURN_OFF: 16,
    TURN_ON: 32
  },
  humidifier: {
    MODES: 1
  },
  light: {
    EFFECT: 4,
    FLASH: 8,
    TRANSITION: 32
  },
  lock: {
    OPEN: 1
  },
  media_player: {
    BROWSE_MEDIA: 131_072,
    CLEAR_PLAYLIST: 8192,
    GROUPING: 524_288,
    MEDIA_ANNOUNCE: 1_048_576,
    MEDIA_ENQUEUE: 2_097_152,
    NEXT_TRACK: 32,
    PAUSE: 1,
    PLAY: 16_384,
    PLAY_MEDIA: 512,
    PREVIOUS_TRACK: 16,
    REPEAT_SET: 262_144,
    SEARCH_MEDIA: 4_194_304,
    SEEK: 2,
    SELECT_SOUND_MODE: 65_536,
    SELECT_SOURCE: 2048,
    SHUFFLE_SET: 32_768,
    STOP: 4096,
    TURN_OFF: 256,
    TURN_ON: 128,
    VOLUME_MUTE: 8,
    VOLUME_SET: 4,
    VOLUME_STEP: 1024
  },
  siren: {
    DURATION: 16,
    TONES: 4,
    TURN_OFF: 2,
    TURN_ON: 1,
    VOLUME_SET: 8
  },
  vacuum: {
    BATTERY: 64,
    CLEAN_SPOT: 1024,
    FAN_SPEED: 32,
    LOCATE: 512,
    PAUSE: 4,
    RETURN_HOME: 16,
    SEND_COMMAND: 256,
    START: 8192,
    STATE: 4096,
    STOP: 8
  },
  valve: {
    CLOSE: 2,
    OPEN: 1,
    SET_POSITION: 4,
    STOP: 8
  },
  water_heater: {
    AWAY_MODE: 4,
    ON_OFF: 8,
    OPERATION_MODE: 2,
    TARGET_TEMPERATURE: 1
  }
} as const

export function hasFeature (features: number, domain: keyof typeof FEATURES,
  feature: string): boolean {
  const domainFeatures = FEATURES[domain] as Record<string, number | undefined>
  const mask = domainFeatures[feature]
  return mask !== undefined && (features & mask) === mask
}
