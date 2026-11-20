import type { TimeOfDay } from '@/store/types';

export type ParticleKind = 'SAND_DUST' | 'SPARK' | 'HEAT_HAZE' | 'SAND_STREAK';

export interface ParticleSlot {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  endSize: number;
  age: number;
  maxLife: number;
  alpha: number;
  startAlpha: number;
  color: string;
  phase: number;
}

export interface ParticleSpawnParams {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity?: number;
  size: number;
  endSize?: number;
  maxLife: number;
  startAlpha?: number;
  color: string;
}

export class ParticlePool {
  public readonly capacity: number;
  private readonly pool: ParticleSlot[];
  private activeCount = 0;

  constructor(capacity = 300) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.pool = new Array<ParticleSlot>(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.pool[i] = {
        kind: 'SAND_DUST',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        gravity: 0,
        size: 1,
        endSize: 1,
        age: 0,
        maxLife: 1,
        alpha: 0,
        startAlpha: 0,
        color: '#e6a15c',
        phase: 0,
      };
    }
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public clear(): void {
    this.activeCount = 0;
  }

  public spawn(params: ParticleSpawnParams): boolean {
    if (this.activeCount >= this.capacity) {
      return false;
    }
    if (!Number.isFinite(params.maxLife) || params.maxLife <= 0) {
      return false;
    }

    const slot = this.pool[this.activeCount];
    slot.kind = params.kind;
    slot.x = params.x;
    slot.y = params.y;
    slot.vx = params.vx;
    slot.vy = params.vy;
    slot.gravity = params.gravity ?? 0;
    slot.size = params.size;
    slot.endSize = params.endSize ?? params.size;
    slot.age = 0;
    slot.maxLife = params.maxLife;
    slot.startAlpha = params.startAlpha ?? 0.85;
    slot.alpha = slot.startAlpha;
    slot.color = params.color;
    slot.phase = (this.activeCount * 1.37) % (Math.PI * 2);

    this.activeCount += 1;
    return true;
  }

  public update(dt: number, windSpeedX = 0): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const wind = Number.isFinite(windSpeedX) ? windSpeedX : 0;

    for (let i = this.activeCount - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.age += dt;

      if (p.age >= p.maxLife) {
        const lastIdx = this.activeCount - 1;
        if (i !== lastIdx) {
          const expired = this.pool[i];
          this.pool[i] = this.pool[lastIdx];
          this.pool[lastIdx] = expired;
        }
        this.activeCount -= 1;
        continue;
      }

      p.vy += p.gravity * dt;
      p.x += (p.vx + wind) * dt;
      p.y += p.vy * dt;

      const t = p.age / p.maxLife;
      p.alpha = p.startAlpha * (1 - t);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.activeCount === 0) return;

    ctx.save();
    for (let i = 0; i < this.activeCount; i++) {
      const p = this.pool[i];
      if (p.alpha <= 0.01) continue;

      const t = p.maxLife > 0 ? p.age / p.maxLife : 0;
      const radius = p.size + (p.endSize - p.size) * t;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      switch (p.kind) {
        case 'SAND_DUST': {
          if (radius <= 2) {
            ctx.fillRect(p.x - radius * 0.5, p.y - radius * 0.5, radius, radius);
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'SPARK': {
          ctx.fillRect(p.x - radius, p.y - 0.8, radius * 2.2, 1.6);
          break;
        }
        case 'HEAT_HAZE': {
          const shimmerX = p.x + Math.sin(p.age * 8 + p.phase) * 3;
          ctx.beginPath();
          ctx.ellipse(shimmerX, p.y, radius * 2.4, radius * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'SAND_STREAK': {
          ctx.fillRect(p.x, p.y, Math.max(4, radius * 3.5), 1.3);
          break;
        }
      }
    }
    ctx.restore();
  }
}

export function emitFootfallDust(
  pool: ParticlePool,
  x: number,
  y: number,
  isHighSpeedQuicksand: boolean,
  rng: () => number = Math.random
): void {
  const dustCount = isHighSpeedQuicksand ? 6 : 4;
  for (let i = 0; i < dustCount; i++) {
    pool.spawn({
      kind: 'SAND_DUST',
      x: x + (rng() - 0.5) * 8,
      y: y - 1,
      vx: -35 - rng() * 45,
      vy: -14 - rng() * 24,
      gravity: 48,
      size: 2.2 + rng() * 2.0,
      endSize: 5 + rng() * 3,
      maxLife: 0.35 + rng() * 0.25,
      startAlpha: 0.65,
      color: '#e2a96a',
    });
  }

  if (isHighSpeedQuicksand) {
    for (let i = 0; i < 3; i++) {
      pool.spawn({
        kind: 'SPARK',
        x: x + (rng() - 0.5) * 6,
        y: y - 2,
        vx: -60 - rng() * 65,
        vy: -28 - rng() * 32,
        gravity: 95,
        size: 2.2 + rng() * 1.4,
        endSize: 0.8,
        maxLife: 0.25 + rng() * 0.15,
        startAlpha: 0.95,
        color: i % 2 === 0 ? '#7dd3fc' : '#fef08a',
      });
    }
  }
}

export function emitWheelDust(
  pool: ParticlePool,
  x: number,
  y: number,
  rng: () => number = Math.random
): void {
  const count = rng() > 0.45 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    pool.spawn({
      kind: 'SAND_DUST',
      x: x - 2 + (rng() - 0.5) * 4,
      y: y - 1,
      vx: -28 - rng() * 30,
      vy: -8 - rng() * 14,
      gravity: 30,
      size: 1.6 + rng() * 1.4,
      endSize: 3.5 + rng() * 2,
      maxLife: 0.3 + rng() * 0.2,
      startAlpha: 0.45,
      color: '#d69e66',
    });
  }
}

export function emitAmbientWind(
  pool: ParticlePool,
  dt: number,
  isStorm: boolean,
  timeOfDay: TimeOfDay,
  viewportWidth = 430,
  groundY = 412,
  rng: () => number = Math.random
): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;

  const multiplier = isStorm || timeOfDay === 'STORM' ? 3.0 : 1.0;
  const baseRate = 12; // particles/sec at 1x -> 36 particles/sec at 3x STORM
  const expected = baseRate * multiplier * dt;
  const whole = Math.floor(expected);
  const count = whole + (rng() < expected - whole ? 1 : 0);

  let spawned = 0;
  for (let i = 0; i < count; i++) {
    if (isStorm || timeOfDay === 'STORM' || rng() < 0.45) {
      const ok = pool.spawn({
        kind: 'SAND_STREAK',
        x: viewportWidth + 10,
        y: 120 + rng() * (groundY - 90),
        vx: -(isStorm ? 260 : 145) - rng() * 90,
        vy: 8 + rng() * 18,
        gravity: 0,
        size: 2 + rng() * 2.5,
        endSize: 2.5,
        maxLife: 1.1 + rng() * 0.6,
        startAlpha: isStorm ? 0.55 : 0.28,
        color: isStorm ? '#f6ad55' : '#fef3c7',
      });
      if (ok) spawned++;
    } else if (timeOfDay === 'DAY' && rng() < 0.35) {
      const ok = pool.spawn({
        kind: 'HEAT_HAZE',
        x: 40 + rng() * (viewportWidth - 80),
        y: groundY - 25 - rng() * 45,
        vx: -18 - rng() * 16,
        vy: -12 - rng() * 10,
        gravity: 0,
        size: 5 + rng() * 4,
        endSize: 9 + rng() * 5,
        maxLife: 0.9 + rng() * 0.5,
        startAlpha: 0.16,
        color: '#fefcbf',
      });
      if (ok) spawned++;
    } else {
      const ok = pool.spawn({
        kind: 'SAND_DUST',
        x: viewportWidth + 6,
        y: groundY - 80 + rng() * 90,
        vx: -85 - rng() * 55,
        vy: -4 + rng() * 12,
        gravity: 0,
        size: 1.5 + rng() * 1.5,
        endSize: 2.5,
        maxLife: 1.4 + rng() * 0.6,
        startAlpha: 0.35,
        color: timeOfDay === 'NIGHT' ? '#90cdf4' : '#fbd38d',
      });
      if (ok) spawned++;
    }
  }

  return spawned;
}
