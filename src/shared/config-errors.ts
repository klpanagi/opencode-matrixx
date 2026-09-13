export type ConfigLoadError = {
  path: string
  error: string
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

let configLoadErrors: ConfigLoadError[] = []

export function getConfigLoadErrors(): ConfigLoadError[] {
  return configLoadErrors
}

export function clearConfigLoadErrors(): void {
  configLoadErrors = []
}

export function addConfigLoadError(error: ConfigLoadError): void {
  configLoadErrors.push(error)
}
