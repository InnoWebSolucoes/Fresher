/** Simulated network latency for the mock API (SPEC §4: 300–800 ms). */
export function latency(min = 300, max = 800): Promise<void> {
  const ms = import.meta.env.MODE === 'test' ? 0 : min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
