# home-functions

[Home Assistant](https://www.home-assistant.io/) function and state server for the v3rt3p processor, built on [`@digital-alchemy/hass`](https://github.com/Digital-Alchemy-TS/hass).

Devices are **selected by Home Assistant labels**: every entity carrying one of the configured labels is exposed automatically, with functions generated from its domain, `supported_features`, and attribute lists. All Home Assistant device types are supported (light, switch, media player, climate, fan, cover, lock, vacuum, humidifier, water heater, select, number, scene, script, button, siren, alarm control panel, valve, lawn mower, and a generic fallback for anything else).

## How it works

- Connects to Home Assistant over websocket (live state cache) and REST via `@digital-alchemy/hass`.
- Exposes the same HTTP contract as `function-state-server` (`GET /functions`, `PATCH /functions`, `POST /state`, `PUT /state`), so the processor can use both side by side — just add `http://home-functions:8080` to `PROCESSOR_FUNCTION_SERVER_URLS` and `PROCESSOR_STATE_SERVER_URLS`.
- Per device it generates a `set_<device>_state` function (with `state` variants `0=off` / `1=on`) plus domain-specific functions: brightness, color, color temperature, effect (lights); volume, play/pause/next/previous, source, sound mode (media players); temperature, hvac/preset/fan/swing modes (climate); positions (covers); speeds, modes, and so on.
- Every on/off device also gets a `<device>_history(days)` function that answers usage questions ("сколько раз за неделю кипятился чайник?") from the Home Assistant history: number of activations and total active time.
- Mode/input names (effects, sources, hvac modes, presets, options, ...) are taken from the entity's live attributes and can be renamed per entity in `config.yaml`.

## Configuration

`config.yaml`:

```yaml
labels: [alice]

entities:
  media_player.tv:
    description: TV
    modes:
      source:
        HDMI 1: [playstation, приставка]
```

Connection details come from the environment (`HASS_BASE_URL`, `HASS_TOKEN`).

## Running

```bash
cp config.example.yaml config.yaml
pnpm install
HASS_BASE_URL=http://homeassistant.local:8123 HASS_TOKEN=... pnpm start
```

Docker (see the stack `docker-compose.yml`):

```yaml
home-functions:
  build: ./home-functions
  restart: unless-stopped
  environment:
    PORT: 8080
    CONFIG_PATH: /app/config.yaml
    HASS_BASE_URL: ${HASS_BASE_URL}
    HASS_TOKEN: ${HASS_TOKEN}
  volumes:
    - ./home-functions/config.yaml:/app/config.yaml:ro
  expose: ["8080"]
```

## Environment

- `PORT` (default `8080`)
- `CONFIG_PATH` (default `config.yaml`)
- `HASS_BASE_URL` - Home Assistant URL
- `HASS_TOKEN` - long-lived access token

## API

Same contract as `function-state-server`:

- `GET /functions` (also `POST /functions`) - the full function catalog; functions that return a result are marked with `hasResponse: true`
- `PATCH /functions` - call a function; for `hasResponse` functions the response body is `{ "response": "..." }`
- `GET /state`-style `PUT /state` and `POST /state` - current device states
- `GET /health` - `{ "status": "ok" }`

The device list is rebuilt on every request from the live websocket-synced entity registry, so newly labeled devices appear without a restart.

Processor wiring (`.env` / compose):

```dotenv
PROCESSOR_FUNCTION_SERVER_URLS=http://function-state-server:8080,http://home-functions:8080
PROCESSOR_STATE_SERVER_URLS=http://function-state-server:8080,http://home-functions:8080
```
