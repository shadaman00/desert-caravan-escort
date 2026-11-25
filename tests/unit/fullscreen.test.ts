import { describe, it, expect, vi } from 'vitest';
import {
  isFullscreenSupported,
  isFullscreenActive,
  toggleFullscreen,
  subscribeFullscreenChange,
} from '@/app/fullscreen';

function createMockFullscreenDoc(opts: {
  standard?: boolean;
  webkit?: boolean;
  active?: boolean;
  rejectRequest?: boolean;
  rejectExit?: boolean;
}) {
  const listeners = new Map<string, Set<() => void>>();

  const docObj: Record<string, unknown> = {
    fullscreenEnabled: opts.standard ? true : false,
    webkitFullscreenEnabled: opts.webkit ? true : undefined,
    fullscreenElement: opts.standard && opts.active ? ({} as Element) : null,
    webkitFullscreenElement: !opts.standard && opts.webkit && opts.active ? ({} as Element) : null,
    documentElement: {} as Record<string, unknown>,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      listeners.get(type)?.delete(cb);
    }),
    dispatch(type: string) {
      listeners.get(type)?.forEach((cb) => cb());
    },
  };

  const el = docObj.documentElement as Record<string, unknown>;

  if (opts.standard) {
    el.requestFullscreen = vi.fn(async () => {
      if (opts.rejectRequest) throw new Error('Fullscreen blocked');
      docObj.fullscreenElement = el;
    });
    docObj.exitFullscreen = vi.fn(async () => {
      if (opts.rejectExit) throw new Error('Exit blocked');
      docObj.fullscreenElement = null;
    });
  } else if (opts.webkit) {
    el.webkitRequestFullscreen = vi.fn(async () => {
      if (opts.rejectRequest) throw new Error('WebKit fullscreen blocked');
      docObj.webkitFullscreenElement = el;
    });
    docObj.webkitExitFullscreen = vi.fn(async () => {
      if (opts.rejectExit) throw new Error('WebKit exit blocked');
      docObj.webkitFullscreenElement = null;
    });
  }

  return docObj as unknown as Document & { dispatch: (type: string) => void };
}

describe('fullscreen.ts', () => {
  it('detects standard, WebKit-only, and unsupported (iPhone Safari) documents', () => {
    const stdDoc = createMockFullscreenDoc({ standard: true });
    const webkitDoc = createMockFullscreenDoc({ webkit: true });
    const unsupportedDoc = createMockFullscreenDoc({});

    expect(isFullscreenSupported(stdDoc)).toBe(true);
    expect(isFullscreenSupported(webkitDoc)).toBe(true);
    expect(isFullscreenSupported(unsupportedDoc)).toBe(false);
  });

  it('detects active state for both standard and webkitFullscreenElement', () => {
    expect(isFullscreenActive(createMockFullscreenDoc({ standard: true, active: false }))).toBe(
      false
    );
    expect(isFullscreenActive(createMockFullscreenDoc({ standard: true, active: true }))).toBe(
      true
    );
    expect(isFullscreenActive(createMockFullscreenDoc({ webkit: true, active: true }))).toBe(true);
  });

  it('toggles entering and exiting fullscreen on standard and WebKit documents', async () => {
    const stdDoc = createMockFullscreenDoc({ standard: true, active: false });
    expect(await toggleFullscreen(stdDoc)).toBe(true);
    expect(isFullscreenActive(stdDoc)).toBe(true);
    expect(await toggleFullscreen(stdDoc)).toBe(false);
    expect(isFullscreenActive(stdDoc)).toBe(false);

    const webkitDoc = createMockFullscreenDoc({ webkit: true, active: false });
    expect(await toggleFullscreen(webkitDoc)).toBe(true);
    expect(isFullscreenActive(webkitDoc)).toBe(true);
    expect(await toggleFullscreen(webkitDoc)).toBe(false);
    expect(isFullscreenActive(webkitDoc)).toBe(false);
  });

  it('handles rejected fullscreen promises and unsupported browsers safely without throwing', async () => {
    const blockedDoc = createMockFullscreenDoc({
      standard: true,
      active: false,
      rejectRequest: true,
    });
    expect(await toggleFullscreen(blockedDoc)).toBe(false);

    const blockedExitDoc = createMockFullscreenDoc({
      standard: true,
      active: true,
      rejectExit: true,
    });
    expect(await toggleFullscreen(blockedExitDoc)).toBe(true);

    const unsupportedDoc = createMockFullscreenDoc({});
    expect(await toggleFullscreen(unsupportedDoc)).toBe(false);
  });

  it('subscribes to fullscreenchange & webkitfullscreenchange and unsubscribes cleanly', () => {
    const doc = createMockFullscreenDoc({ webkit: true, active: false });
    const handler = vi.fn();
    const unsub = subscribeFullscreenChange(handler, doc);

    (doc as unknown as { webkitFullscreenElement: Element | null }).webkitFullscreenElement =
      doc.documentElement;
    doc.dispatch('webkitfullscreenchange');
    expect(handler).toHaveBeenCalledWith(true);

    (doc as unknown as { webkitFullscreenElement: Element | null }).webkitFullscreenElement = null;
    doc.dispatch('fullscreenchange');
    expect(handler).toHaveBeenCalledWith(false);

    unsub();
    doc.dispatch('fullscreenchange');
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
