/**
 * Normalize a path returned by native directory pickers.
 * On macOS, osascript can return hostname-prefixed paths for network volumes
 * (e.g. "HOSTNAME/Users/..." instead of "/Users/..."). This strips the
 * hostname prefix and cleans up trailing slashes.
 */
export function normalizeSelectedPath(selectedPath: string, platform: string): string {
  // On macOS/Linux, ensure the path is absolute.
  // osascript can return hostname-prefixed paths for network volumes
  // e.g. "AT-ALGKG9VR/Users/guy/Desktop" instead of "/Users/guy/Desktop"
  if ((platform === "darwin" || platform === "linux") && !selectedPath.startsWith("/")) {
    const firstSlash = selectedPath.indexOf("/");
    if (firstSlash >= 0) {
      selectedPath = selectedPath.substring(firstSlash);
    }
  }

  // Remove trailing slash/backslash (except root paths like "/" or "C:\")
  if (selectedPath.length > 1 && (selectedPath.endsWith("/") || selectedPath.endsWith("\\"))) {
    if (!(platform === "win32" && /^[A-Za-z]:[\\\/]$/.test(selectedPath))) {
      selectedPath = selectedPath.slice(0, -1);
    }
  }

  return selectedPath;
}
