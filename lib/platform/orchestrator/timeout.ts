export class StepTimeoutError extends Error {
  constructor(
    readonly timeoutMs: number,
    readonly agentId: string
  ) {
    super(`Step timeout setelah ${timeoutMs}ms (agent: ${agentId})`);
    this.name = "StepTimeoutError";
  }
}

/** Race agent execute vs timeout — reject dengan StepTimeoutError. */
export function withStepTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  agentId: string
): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new StepTimeoutError(timeoutMs, agentId));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
