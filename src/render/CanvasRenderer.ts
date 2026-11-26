import {
  CAMERA_LERP_LAMBDA,
  GROUND_Y,
  HEAT_MAX,
  LAYER2_HEIGHT,
  LOGICAL_WIDTH,
  MERCENARY_TABLE,
  PARALLAX_FACTORS,
  WAGON_SPACING_PX,
  WALKER_ANCHOR_X,
  Z_ORDER,
  type AssetKey,
  type TurretId,
} from '@/data/masterData';
import type { AssetLoader } from '@/core/AssetLoader';
import type { ObjectPool } from '@/core/ObjectPool';
import type { BiomeRenderState } from '@/systems/BiomeSystem';
import type {
  EnemyEntity,
  FloatingTextEntity,
  ProjectileEntity,
  RelicEntity,
} from '@/systems/CombatSystem';
import {
  drawFallbackBoss,
  drawFallbackMercenary,
  drawFallbackRaider,
  drawFallbackSandwalker,
  drawFallbackTurret,
  drawFallbackWagon,
} from './FallbackShapes';

export interface AmbientParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

export interface CanvasRenderFrameInput {
  dt: number;
  scrollPx: number;
  walkPhase: number;
  biome: BiomeRenderState;
  equippedTurret: TurretId;
  wagonCount: number;
  unlockedMercIds: readonly string[];
  heatValue: number;
  isOverdrive: boolean;
  isShieldActive: boolean;
  aimAngleRad: number;
  cameraTargetOffsetX: number;
  shakePx: number;
  particlePool: ObjectPool<AmbientParticle>;
  enemyPool: ObjectPool<EnemyEntity>;
  projectilePool: ObjectPool<ProjectileEntity>;
  floatingTextPool: ObjectPool<FloatingTextEntity>;
  relicPool: ObjectPool<RelicEntity>;
  lockedEnemyId: number | null;
  lockedWeakPoint: boolean;
  bossTelegraphActive: boolean;
  telegraphX: number;
  speechBubble?: {
    text: string;
    speakerName: string;
    colorHex: string;
    remainingSec: number;
  } | null;
}

const MERC_ASSET_KEYS: Record<string, AssetKey> = {
  kasim: 'CHAR_KASIM',
  harun: 'CHAR_HARUN',
  sera: 'CHAR_SERA',
  tarek: 'CHAR_TAREK',
  zara: 'CHAR_ZARA',
  lili: 'CHAR_LILI',
};

const BIOME_ASSET_KEYS: readonly AssetKey[] = [
  'BIOME_ZONE1',
  'BIOME_ZONE2',
  'BIOME_ZONE3',
  'BIOME_ZONE4',
];

/**
 * Dual-mode Z-Order 10-Layer Landscape Canvas Renderer (960x404 Layer 2).
 * Draws AssetLoader PNGs when present and falls back cleanly to FallbackShapes.
 */
export class CanvasRenderer {
  private readonly assetLoader: AssetLoader;
  private cameraOffsetX = 0;

  constructor(assetLoader: AssetLoader) {
    this.assetLoader = assetLoader;
  }

  public resetCamera(): void {
    this.cameraOffsetX = 0;
  }

  public render(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    const safeDt = Math.max(0, Math.min(0.05, input.dt));
    const camAlpha = 1 - Math.exp(-CAMERA_LERP_LAMBDA * safeDt);
    this.cameraOffsetX += (input.cameraTargetOffsetX - this.cameraOffsetX) * camAlpha;

    const shakeX = input.shakePx > 0 ? (Math.random() * 2 - 1) * input.shakePx : 0;
    const shakeY = input.shakePx > 0 ? (Math.random() * 2 - 1) * input.shakePx : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const layerOrder = [
      Z_ORDER.SKY_BACKDROP,
      Z_ORDER.PARALLAX_FAR,
      Z_ORDER.PARALLAX_MID,
      Z_ORDER.GROUND_TILE,
      Z_ORDER.CARAVAN_CONVOY,
      Z_ORDER.PLAYER_MECH,
      Z_ORDER.ENEMY_BOSS,
      Z_ORDER.PROJECTILE_VFX,
      Z_ORDER.WEATHER_FILTER,
      Z_ORDER.WORLD_UI_TEXT,
    ];

    for (let i = 0; i < layerOrder.length; i++) {
      const z = layerOrder[i];
      if (z === Z_ORDER.SKY_BACKDROP) this.drawSkyBackdrop(ctx, input);
      else if (z === Z_ORDER.PARALLAX_FAR) this.drawParallaxFar(ctx, input);
      else if (z === Z_ORDER.PARALLAX_MID) this.drawParallaxMid(ctx, input);
      else if (z === Z_ORDER.GROUND_TILE) this.drawGroundTile(ctx, input);
      else if (z === Z_ORDER.CARAVAN_CONVOY) this.drawCaravanConvoy(ctx, input);
      else if (z === Z_ORDER.PLAYER_MECH) this.drawPlayerMech(ctx, input);
      else if (z === Z_ORDER.ENEMY_BOSS) this.drawEnemyBoss(ctx, input);
      else if (z === Z_ORDER.PROJECTILE_VFX) this.drawProjectileVfx(ctx, input);
      else if (z === Z_ORDER.WEATHER_FILTER) this.drawWeatherFilter(ctx, input);
      else if (z === Z_ORDER.WORLD_UI_TEXT) this.drawWorldUiText(ctx, input);
    }

    ctx.restore();
  }

  private drawSkyBackdrop(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, input.biome.skyTopHex);
    grad.addColorStop(1, input.biome.skyBottomHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LAYER2_HEIGHT);

    // Solar disc positioned in upper sky
    ctx.fillStyle = 'rgba(254, 240, 138, 0.72)';
    ctx.beginPath();
    ctx.arc(LOGICAL_WIDTH * 0.78, 72, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParallaxFar(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    const imgKey = BIOME_ASSET_KEYS[input.biome.biomeIndex];
    const farImg = this.assetLoader.getImage(imgKey);
    const offset =
      ((input.scrollPx * PARALLAX_FACTORS.PARALLAX_FAR + this.cameraOffsetX * 0.15) %
        LOGICAL_WIDTH +
        LOGICAL_WIDTH) %
      LOGICAL_WIDTH;

    if (farImg) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(farImg, -offset, 0, LOGICAL_WIDTH, GROUND_Y);
      ctx.drawImage(farImg, LOGICAL_WIDTH - offset, 0, LOGICAL_WIDTH, GROUND_Y);
      ctx.restore();
      return;
    }

    // Fallback silhouettes distinct per biome
    ctx.save();
    ctx.fillStyle = 'rgba(45, 28, 18, 0.24)';
    const span = 240;
    for (let tile = -1; tile < 5; tile++) {
      const bx = tile * span - (offset % span);
      if (input.biome.biomeIndex === 1) {
        // Canyon mesas
        ctx.fillRect(bx + 20, GROUND_Y - 120, 75, 120);
        ctx.fillRect(bx + 130, GROUND_Y - 90, 88, 90);
      } else if (input.biome.biomeIndex === 3) {
        // Golden pyramid + temple pillars
        ctx.beginPath();
        ctx.moveTo(bx + 20, GROUND_Y);
        ctx.lineTo(bx + 90, GROUND_Y - 115);
        ctx.lineTo(bx + 160, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      } else {
        // Distant dunes & obelisk
        ctx.beginPath();
        ctx.moveTo(bx, GROUND_Y);
        ctx.quadraticCurveTo(bx + 120, GROUND_Y - 82, bx + 240, GROUND_Y);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawParallaxMid(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    const offset =
      ((input.scrollPx * PARALLAX_FACTORS.PARALLAX_MID + this.cameraOffsetX * 0.45) % 320 + 320) %
      320;
    ctx.save();
    ctx.fillStyle = input.biome.accentGroundHex;
    ctx.globalAlpha = 0.55;
    for (let i = -1; i < 4; i++) {
      const mx = i * 320 - offset;
      ctx.beginPath();
      ctx.moveTo(mx, GROUND_Y);
      ctx.quadraticCurveTo(mx + 160, GROUND_Y - 46, mx + 320, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Glowing touchable battlefield relics with golden pulsing aura
    input.relicPool.forEachActive((r) => {
      const pulse = 14 + Math.sin(r.pulsePhase) * 3;
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#B7791F';
      ctx.fillRect(r.x - 8, r.y - 7, 16, 14);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(r.x - 6, r.y - 4, 12, 4);
      ctx.restore();
    });
  }

  private drawGroundTile(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    ctx.fillStyle = input.biome.groundHex;
    ctx.fillRect(0, GROUND_Y, LOGICAL_WIDTH, LAYER2_HEIGHT - GROUND_Y);

    // Horizon line & desert track texture
    ctx.fillStyle = input.biome.accentGroundHex;
    ctx.fillRect(0, GROUND_Y, LOGICAL_WIDTH, 4);

    const tileOffset =
      ((input.scrollPx * PARALLAX_FACTORS.GROUND_TILE + this.cameraOffsetX) % 160 + 160) % 160;
    ctx.fillStyle = input.biome.accentGroundHex;
    for (let i = -1; i < 7; i++) {
      const gx = i * 160 - tileOffset;
      if (input.biome.hasQuicksand) {
        ctx.fillStyle = '#5C3317';
        ctx.beginPath();
        ctx.ellipse(gx + 75, GROUND_Y + 26, 46, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (input.biome.biomeIndex === 3) {
        ctx.fillStyle = 'rgba(26, 188, 156, 0.38)';
        ctx.fillRect(gx + 30, GROUND_Y + 28, 86, 12);
      } else {
        ctx.fillRect(gx + 24, GROUND_Y + 22, 34, 3);
        ctx.fillRect(gx + 96, GROUND_Y + 42, 42, 3);
      }
    }
  }

  private drawCaravanConvoy(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    const wagonCount = Math.min(5, Math.max(1, input.wagonCount));
    const wagonImg = this.assetLoader.getImage('CAMEL_WAGON');
    const wheelAngle = input.scrollPx * 0.08;

    for (let i = wagonCount - 1; i >= 0; i--) {
      const wx = WALKER_ANCHOR_X - 58 - i * WAGON_SPACING_PX;
      const wy = GROUND_Y;
      if (wagonImg) {
        ctx.drawImage(wagonImg, wx - 22, wy - 32, 44, 32);
      } else {
        drawFallbackWagon(ctx, wx, wy, wheelAngle);
      }
    }

    // Draw unlocked mercenaries accompanying the caravan
    let slotIdx = 0;
    for (let m = 0; m < MERCENARY_TABLE.length; m++) {
      const spec = MERCENARY_TABLE[m];
      if (!input.unlockedMercIds.includes(spec.id)) continue;
      const mx = WALKER_ANCHOR_X - 38 - slotIdx * 24;
      const my = GROUND_Y;
      const mercKey = MERC_ASSET_KEYS[spec.id];
      const mercImg = mercKey ? this.assetLoader.getImage(mercKey) : null;
      if (mercImg) {
        const bobY = Math.sin(input.walkPhase + slotIdx) * 1.5;
        ctx.drawImage(mercImg, mx - 13, my - 34 + bobY, 26, 34);
      } else {
        drawFallbackMercenary(ctx, mx, my, spec.colorHex, input.walkPhase + slotIdx);
      }
      slotIdx += 1;
    }
  }

  private drawPlayerMech(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    const wx = WALKER_ANCHOR_X - this.cameraOffsetX * 0.1;
    const wy = GROUND_Y;
    const bodyImg = this.assetLoader.getImage('SANDWALKER_BODY');

    if (bodyImg) {
      ctx.drawImage(bodyImg, wx - 36, wy - 48, 72, 48);
    } else {
      drawFallbackSandwalker(
        ctx,
        wx,
        wy,
        input.walkPhase,
        input.heatValue / HEAT_MAX,
        input.isOverdrive
      );
    }

    const turretKey: AssetKey =
      input.equippedTurret === 'TUR_01'
        ? 'TURRET_HARPOON'
        : input.equippedTurret === 'TUR_02'
          ? 'TURRET_LASER'
          : 'TURRET_MORTAR';
    const turretImg = this.assetLoader.getImage(turretKey);
    const turretX = wx + 4;
    const turretY = wy - 50;

    if (turretImg) {
      ctx.save();
      ctx.translate(turretX, turretY);
      ctx.rotate(Math.max(-0.45, Math.min(0.45, input.aimAngleRad)));
      ctx.drawImage(turretImg, -9, -7, 32, 14);
      ctx.restore();
    } else {
      drawFallbackTurret(ctx, turretX, turretY, input.equippedTurret, input.aimAngleRad);
    }

    // Overheat Gauge Bar directly above Sandwalker (PRD Section 4.2 Layer 50)
    const barW = 54;
    const barH = 6;
    const bx = wx - barW / 2;
    const by = wy - 68;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const fillRatio = Math.max(0, Math.min(1, input.heatValue / HEAT_MAX));
    ctx.fillStyle = input.isOverdrive
      ? '#00E5FF'
      : input.heatValue >= 75
        ? '#FF7043'
        : '#F59E0B';
    ctx.fillRect(bx, by, barW * fillRatio, barH);
  }

  private drawEnemyBoss(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    input.enemyPool.forEachActive((e) => {
      const flashWhite = e.flashTimer > 0;
      if (e.kind === 'BOSS_SANDWORM' && e.sandwormState === 'SUBMERGE') {
        // Underground burrow sand mound
        ctx.save();
        ctx.fillStyle = '#78350F';
        ctx.beginPath();
        ctx.ellipse(e.x, GROUND_Y, 44, 10, 0, Math.PI, 0);
        ctx.fill();
        ctx.restore();
        return;
      }

      const key: AssetKey =
        e.kind === 'BOSS_SCORPION'
          ? 'BOSS_SCORPION'
          : e.kind === 'BOSS_MIRAGE'
            ? 'BOSS_MIRAGE'
            : e.kind === 'BOSS_SANDWORM'
              ? 'BOSS_SANDWORM'
              : 'ENEMY_RAIDER';
      const spriteImg = this.assetLoader.getImage(key);
      if (spriteImg && !flashWhite) {
        ctx.drawImage(spriteImg, e.x - e.width * 0.5, e.y - e.height, e.width, e.height);
      } else if (e.kind === 'RAIDER') {
        drawFallbackRaider(ctx, e.x, e.y, flashWhite);
      } else {
        drawFallbackBoss(ctx, e.kind, e.x, e.y, flashWhite);
      }

      // Enemy / Boss HP Bar
      const barW = e.isBoss ? 86 : 30;
      const barH = e.isBoss ? 6 : 4;
      const bx = e.x - barW * 0.5;
      const by = e.y - e.height - 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = e.isBoss && e.sandwormState === 'COUNTERED_STUN' ? '#FDE047' : '#EF4444';
      ctx.fillRect(bx, by, barW * Math.max(0, Math.min(1, e.hp / e.maxHp)), barH);

      // Red lock-on reticle on targeted enemy or boss weakpoint
      if (input.lockedEnemyId === e.id) {
        const rx = input.lockedWeakPoint ? e.x + e.weakPointOffsetX : e.x;
        const ry = input.lockedWeakPoint ? e.y + e.weakPointOffsetY : e.y - e.height * 0.5;
        ctx.save();
        ctx.strokeStyle = '#FF3B30';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, 18, 0, Math.PI * 2);
        ctx.moveTo(rx - 22, ry);
        ctx.lineTo(rx + 22, ry);
        ctx.moveTo(rx, ry - 22);
        ctx.lineTo(rx, ry + 22);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  private drawProjectileVfx(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    input.projectilePool.forEachActive((p) => {
      ctx.save();
      ctx.fillStyle = p.color;
      if (p.turretId === 'TUR_02') {
        ctx.fillRect(p.x - 10, p.y - 2, 20, 4);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.turretId === 'TUR_03' ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    if (!input.isShieldActive) return;
    ctx.save();
    ctx.strokeStyle = '#38BDF8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(WALKER_ANCHOR_X, GROUND_Y - 26, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawWeatherFilter(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    // Active pooled weather particles (zero heap allocation via forEachActive)
    input.particlePool.forEachActive((p) => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fillRect(p.x, p.y, p.size, Math.max(1.5, p.size * 0.6));
    });
    ctx.globalAlpha = 1;

    // Zone 3 dark-amber sandstorm vignette (alpha <= 0.42)
    if (input.biome.vignetteAlpha > 0) {
      ctx.fillStyle = `rgba(93, 78, 43, ${input.biome.vignetteAlpha})`;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LAYER2_HEIGHT);
    }

    // Boss red telegraph ground warning line (TELEGRAPH_WARN)
    if (input.bossTelegraphActive) {
      ctx.save();
      ctx.strokeStyle = '#EF4444';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.fillRect(WALKER_ANCHOR_X - 40, GROUND_Y - 6, input.telegraphX - WALKER_ANCHOR_X + 90, 10);
      ctx.lineWidth = 2;
      ctx.strokeRect(WALKER_ANCHOR_X - 40, GROUND_Y - 6, input.telegraphX - WALKER_ANCHOR_X + 90, 10);
      ctx.restore();
    }
  }

  private drawWorldUiText(ctx: CanvasRenderingContext2D, input: CanvasRenderFrameInput): void {
    input.floatingTextPool.forEachActive((t) => {
      ctx.save();
      ctx.font = t.isManual ? '900 16px Pretendard, sans-serif' : '700 12px Pretendard, sans-serif';
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.max(0, Math.min(1, t.remainingSec * 1.6));
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });

    if (input.speechBubble && input.speechBubble.remainingSec > 0) {
      const bubble = input.speechBubble;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, bubble.remainingSec * 1.4));
      ctx.font = '700 12px Pretendard, sans-serif';
      const label = `${bubble.speakerName}: ${bubble.text}`;
      const metrics = ctx.measureText(label);
      const boxW = Math.min(340, Math.max(150, metrics.width + 24));
      const boxH = 30;
      const bx = Math.max(12, WALKER_ANCHOR_X - boxW * 0.35);
      const by = GROUND_Y - 116;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = bubble.colorHex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FEF9C3';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 12, by + boxH * 0.5);
      ctx.restore();
    }
  }
}
