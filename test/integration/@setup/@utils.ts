import * as v from 'villa';

export async function randomNap(duration = 10): Promise<void> {
  return v.sleep(duration);
}
