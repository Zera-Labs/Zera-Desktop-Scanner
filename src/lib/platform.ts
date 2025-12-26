// Simple platform helpers to centralize mobile detection.
export function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}


