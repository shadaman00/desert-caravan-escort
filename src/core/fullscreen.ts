/**
 * Cross-browser Fullscreen API helpers with WebKit prefix fallback and
 * silent rejection handling for restricted environments (e.g., iPhone Safari).
 */

interface FullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function getDoc(doc?: Document): FullscreenDocument | null {
  if (doc) return doc as FullscreenDocument;
  return typeof document !== 'undefined' ? (document as FullscreenDocument) : null;
}

/**
 * Returns whether the current browser context exposes standard or WebKit fullscreen support.
 */
export function isFullscreenSupported(doc?: Document): boolean {
  const d = getDoc(doc);
  if (!d) return false;
  const el = d.documentElement as FullscreenElement | null;
  if (!el) return false;
  const enabled = Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled);
  const canRequest =
    typeof el.requestFullscreen === 'function' ||
    typeof el.webkitRequestFullscreen === 'function';
  return enabled && canRequest;
}

/**
 * Returns whether the document currently has an active fullscreen element.
 */
export function isFullscreenActive(doc?: Document): boolean {
  const d = getDoc(doc);
  if (!d) return false;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * Toggles document fullscreen state and returns the resulting active state without throwing.
 */
export async function toggleFullscreen(doc?: Document): Promise<boolean> {
  const d = getDoc(doc);
  if (!d || !isFullscreenSupported(d)) {
    return false;
  }

  const el = d.documentElement as FullscreenElement;

  if (isFullscreenActive(d)) {
    try {
      const exitFn = d.exitFullscreen ?? d.webkitExitFullscreen;
      if (typeof exitFn === 'function') {
        await exitFn.call(d);
      }
      return false;
    } catch {
      return isFullscreenActive(d);
    }
  }

  try {
    const requestFn = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (typeof requestFn !== 'function') {
      return false;
    }
    await requestFn.call(el);

    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
      const orientation = (
        screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }
      )?.orientation;
      await orientation?.lock?.('landscape')?.catch(() => {});
    }

    return true;
  } catch {
    return isFullscreenActive(d);
  }
}

/**
 * Subscribes to standard and WebKit fullscreenchange events and returns an unsubscribe function.
 */
export function subscribeFullscreenChange(
  onChange: (active: boolean) => void,
  doc?: Document
): () => void {
  const d = getDoc(doc);
  if (!d) return () => {};

  const handleChange = () => {
    onChange(isFullscreenActive(d));
  };

  d.addEventListener('fullscreenchange', handleChange);
  d.addEventListener('webkitfullscreenchange', handleChange);

  return () => {
    d.removeEventListener('fullscreenchange', handleChange);
    d.removeEventListener('webkitfullscreenchange', handleChange);
  };
}
