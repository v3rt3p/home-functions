import { FunctionArgument } from '@v3rt3p/types/function-state-server'

import { EntityConfig } from '../config'

export interface DeviceContext {
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<void>;
  config: EntityConfig;
  domain: string;
  entity: LooseEntityState;
  getHistory: (entityId: string, days: number) => Promise<Array<{ lastChanged: string, state: string }>>;
  /**
  human-readable device name used in descriptions
  */
  name: string;
  services: ServiceIndex;
  slug: string;
}

export interface DeviceFunction {
  arguments: Record<string, FunctionArgument>;
  description: string;
  /**
  true when invoke() returns a meaningful result that should be spoken back
  */
  hasResponse?: boolean;
  /**
  optional human-readable result returned to the assistant (hasResponse flow)
  */
  invoke (argumentValues: Record<string, number | string>): Promise<string | undefined>;
  name: string;
}

export interface DeviceStateProvider {
  description: string;
  format (entity: LooseEntityState | undefined): string;
  name: string;
}

export interface LooseEntityState {
  attributes: Record<string, unknown>;
  entityId: string;
  /**
  numeric supported_features bitmask from attributes
  */
  features: number;
  state: string;
}

export interface ServiceIndex {
  has (domain: string, service: string): boolean;
}
