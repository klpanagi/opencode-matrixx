const WINDOWS_APPDATA_SEGMENTS = ["\\appdata\\local", "\\appdata\\roaming", "\\appdata\\locallow"]

function normalizeWindowsPath(directory: string): string {
  return directory.replaceAll("/", "\\").toLowerCase()
}

export function isWindowsAppDataDirectory(directory: string): boolean {
  const normalizedDirectory = normalizeWindowsPath(directory)
  return WINDOWS_APPDATA_SEGMENTS.some((segment) => {
    return normalizedDirectory.endsWith(segment) || normalizedDirectory.includes(`${segment}\\`)
  })
}


