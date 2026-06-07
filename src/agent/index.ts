import { runAgent } from './runAgent';
import type { RunAgentOptions } from '../types';

export { runAgent } from './runAgent';

/** @deprecated use runAgent */
export async function runWhaleSignalAgent(
  userQuery: string,
  options?: RunAgentOptions
): Promise<string> {
  const action =
    options?.action ??
    (options?.mode === 'trend' ? 'signal_trend' : options?.mode ? 'signal_snapshot' : undefined);

  return runAgent(userQuery, { ...options, action });
}
