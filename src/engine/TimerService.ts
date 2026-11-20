export type TimerHandle = number;

interface ScheduledTimer {
  id: TimerHandle;
  groupId: string;
  isInterval: boolean;
  callback: () => void;
  nativeId: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
}

export class TimerService {
  private nextId: TimerHandle = 1;
  private timers: Map<TimerHandle, ScheduledTimer> = new Map();
  private groupIndex: Map<string, Set<TimerHandle>> = new Map();

  /**
   * Schedules a one-shot timeout tagged with a groupId.
   */
  public setTimeout(groupId: string, callback: () => void, delayMs: number): TimerHandle {
    const id = this.nextId++;
    const nativeId = setTimeout(() => {
      this.cleanupTimer(id);
      callback();
    }, delayMs);

    const timer: ScheduledTimer = {
      id,
      groupId,
      isInterval: false,
      callback,
      nativeId,
    };

    this.timers.set(id, timer);
    this.addToGroup(groupId, id);
    return id;
  }

  /**
   * Schedules a recurring interval tagged with a groupId.
   */
  public setInterval(groupId: string, callback: () => void, intervalMs: number): TimerHandle {
    const id = this.nextId++;
    const nativeId = setInterval(() => {
      callback();
    }, intervalMs);

    const timer: ScheduledTimer = {
      id,
      groupId,
      isInterval: true,
      callback,
      nativeId,
    };

    this.timers.set(id, timer);
    this.addToGroup(groupId, id);
    return id;
  }

  /**
   * Cancels a specific timer by handle.
   */
  public cancelTimer(handle: TimerHandle): void {
    const timer = this.timers.get(handle);
    if (!timer) return;

    if (timer.isInterval) {
      clearInterval(timer.nativeId);
    } else {
      clearTimeout(timer.nativeId);
    }

    this.cleanupTimer(handle);
  }

  /**
   * Cancels all active timers registered under the specified groupId.
   * Invoked automatically on FSM state exit.
   */
  public cancelGroup(groupId: string): void {
    const handles = this.groupIndex.get(groupId);
    if (!handles) return;

    for (const handle of Array.from(handles)) {
      const timer = this.timers.get(handle);
      if (timer) {
        if (timer.isInterval) {
          clearInterval(timer.nativeId);
        } else {
          clearTimeout(timer.nativeId);
        }
        this.timers.delete(handle);
      }
    }

    this.groupIndex.delete(groupId);
  }

  /**
   * Cancels all timers across all groups.
   */
  public cancelAll(): void {
    for (const timer of this.timers.values()) {
      if (timer.isInterval) {
        clearInterval(timer.nativeId);
      } else {
        clearTimeout(timer.nativeId);
      }
    }
    this.timers.clear();
    this.groupIndex.clear();
  }

  /**
   * Returns active timer count for debugging and assertions.
   */
  public getActiveTimerCount(groupId?: string): number {
    if (groupId !== undefined) {
      return this.groupIndex.get(groupId)?.size ?? 0;
    }
    return this.timers.size;
  }

  private addToGroup(groupId: string, handle: TimerHandle): void {
    let handles = this.groupIndex.get(groupId);
    if (!handles) {
      handles = new Set();
      this.groupIndex.set(groupId, handles);
    }
    handles.add(handle);
  }

  private cleanupTimer(handle: TimerHandle): void {
    const timer = this.timers.get(handle);
    if (!timer) return;

    const handles = this.groupIndex.get(timer.groupId);
    if (handles) {
      handles.delete(handle);
      if (handles.size === 0) {
        this.groupIndex.delete(timer.groupId);
      }
    }
    this.timers.delete(handle);
  }
}

export const timerService = new TimerService();
