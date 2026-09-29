import type { GestureConfig } from '../../src/config';
import type { HandFrame } from '../../src/engine/types';
import { GestureController } from '../../src/gestures/controller';
import type { GestureEventMap, GestureEventType } from '../../src/gestures/events';

export interface Recorded {
  type: GestureEventType;
  payload: GestureEventMap[GestureEventType];
  t: number;
}

/** Replay frames through a (new or given) controller and collect every event. */
export function run(
  frames: HandFrame[],
  cfgOrController: Partial<GestureConfig> | GestureController = {},
): {
  events: Recorded[];
  controller: GestureController;
  count: (type: GestureEventType) => number;
} {
  const controller =
    cfgOrController instanceof GestureController
      ? cfgOrController
      : new GestureController(cfgOrController);
  const events: Recorded[] = [];
  let now = 0;
  const off = controller.onAny((type, payload) => events.push({ type, payload, t: now }));
  for (const f of frames) {
    now = f.t;
    controller.update(f);
  }
  off();
  return { events, controller, count: (type) => events.filter((e) => e.type === type).length };
}

/** Event types in order, ignoring the chatty ones. */
export function actions(events: Recorded[]): string[] {
  return events
    .filter((e) => !['holdProgress', 'laserMove', 'stateChange'].includes(e.type))
    .map((e) => e.type);
}
