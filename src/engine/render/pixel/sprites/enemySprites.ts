import type { EnemyInstance, EnemyProjectile } from '@/engine/systems/SpawnSystem';
import {
  compileSprite,
  drawCompiledSprite,
  PIXEL_UPSCALE,
  type CompiledPixelSprite,
} from '../PixelCanvas';
import { ENEMY_PALETTE } from '../palettes';

// 13 x 13 Desert Bandit facing -X
const BANDIT_FRAMES_M: readonly (readonly string[])[] = [
  [
    '....KKKKK....',
    '...KDDDDDK...',
    '..KDDDOODDK..',
    '...KRRRRRK...',
    'SSSSRRRRRK...',
    'SK..KRRRRK...',
    '...KRRRRROK..',
    '...KRRRRRK...',
    '....KR.RK....',
    '....KO.OK....',
    '.KKKKKKKKKKK.',
    'KOOOOOOOOOOOK',
  ],
  [
    '....KKKKK....',
    '...KDDDDDK...',
    '..KDDDOODDK..',
    '...KRRRRRK...',
    '.SSSRRRRRK...',
    '..SSKRRRRK...',
    '...KRRRRROK..',
    '...KRRRRRK...',
    '...KR...RK...',
    '...KO...OK...',
    '.KKKKKKKKKKK.',
    'KOOOOOOOOOOOK',
  ],
];

// 19 x 13 Armored Scorpion with raised glowing tail stinger (facing -X)
const SCORPION_FRAMES_M: readonly (readonly string[])[] = [
  [
    '.......KKK.........',
    '......KYYYK....KK..',
    '.......KKK....KAAM.',
    '...........KKKKMMK.',
    '..KKK..KKKKMMMMMMK.',
    '.KAAAKKMMMMMMMMMMK.',
    'KAA.KMMBBBBMMMMMMK.',
    '....KMMMMMMMMMMMMK.',
    '...KKMMAKMMMAKMMK..',
    '..KA..KK.KA..KK.KA.',
    '.KK.......KK.....KK',
  ],
  [
    '.......KKK.........',
    '......KYYYK....KK..',
    '.......KKK....KAAM.',
    '...........KKKKMMK.',
    '.KKK...KKKKMMMMMMK.',
    'KAAAKKKMMMMMMMMMMK.',
    '.KAAKMMBBBBMMMMMMK.',
    '....KMMMMMMMMMMMMK.',
    '...KKMMAKMMMAKMMK..',
    '...KA..K..KA..K.KA.',
    '...KK.....KK....KK.',
  ],
];

// 13 x 15 Mirage Spirit diamond crystal
const MIRAGE_FRAMES_M: readonly (readonly string[])[] = [
  [
    '......C......',
    '.....KCK.....',
    '....KCPCK....',
    '...KCPWPCK...',
    '..KCPWWWPCK..',
    '.KCPWWWWWPCC.',
    'KCPWWCCCWWPCK',
    '.KCPWWWWWPCC.',
    '..KCPWWWPCK..',
    '...KCPWPCK...',
    '....KCPCK....',
    '.....KCK.....',
    '......C......',
  ],
  [
    '......W......',
    '.....KCK.....',
    '....KCPCK....',
    '...KCCWCCK...',
    '..KCPWWWPCK..',
    '.KCPWCCWPPCC.',
    'WCPWCCCCWWPCW',
    '.KCPWCCWPPCC.',
    '..KCPWWWPCK..',
    '...KCCWCCK...',
    '....KCPCK....',
    '.....KCK.....',
    '......W......',
  ],
];

const BANDIT_SPRITES = BANDIT_FRAMES_M.map((m) => compileSprite(m, ENEMY_PALETTE));
const BANDIT_FLASH = BANDIT_FRAMES_M.map((m) =>
  compileSprite(m, ENEMY_PALETTE, { flashWhite: true })
);
const SCORPION_SPRITES = SCORPION_FRAMES_M.map((m) => compileSprite(m, ENEMY_PALETTE));
const SCORPION_FLASH = SCORPION_FRAMES_M.map((m) =>
  compileSprite(m, ENEMY_PALETTE, { flashWhite: true })
);
const MIRAGE_SPRITES = MIRAGE_FRAMES_M.map((m) => compileSprite(m, ENEMY_PALETTE));
const MIRAGE_FLASH = MIRAGE_FRAMES_M.map((m) =>
  compileSprite(m, ENEMY_PALETTE, { flashWhite: true })
);

function selectEnemySprite(e: EnemyInstance): CompiledPixelSprite {
  const frame = Math.floor(e.animPhase * 0.5) % 2;
  const flash = e.hitFlashTimer > 0;
  if (e.archetypeId === 'DESERT_BANDIT') {
    return (flash ? BANDIT_FLASH : BANDIT_SPRITES)[frame];
  }
  if (e.archetypeId === 'SCORPION') {
    return (flash ? SCORPION_FLASH : SCORPION_SPRITES)[frame];
  }
  return (flash ? MIRAGE_FLASH : MIRAGE_SPRITES)[frame];
}

export function drawPixelEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: readonly EnemyInstance[],
  projectiles: readonly EnemyProjectile[],
  manualAimTargetId: string | null,
  timeSec: number
): void {
  if (enemies.length === 0 && projectiles.length === 0) return;
  const px = PIXEL_UPSCALE;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;

    const sprite = selectEnemySprite(e);
    drawCompiledSprite(ctx, sprite, e.x, e.y, {
      anchorX: 0.5,
      anchorY: 0.5,
      pixelSize: px,
    });

    // Orbiting pixel shards around Mirage Spirit
    if (e.archetypeId === 'MIRAGE_SPIRIT') {
      for (let s = 0; s < 3; s++) {
        const a = timeSec * 3.5 + (s * Math.PI * 2) / 3;
        const sx = Math.round((e.x + Math.cos(a) * 14) / px) * px;
        const sy = Math.round((e.y + Math.sin(a) * 8) / px) * px;
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      }
    }

    // Crisp pixel HP & Armor bars
    const barW = 28;
    const barX = Math.round((e.x - barW * 0.5) / px) * px;
    const barY = Math.round((e.y - e.radius - 10) / px) * px;

    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, 6);
    const hpRatio = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
    const fillW = Math.round((barW * hpRatio) / px) * px;
    ctx.fillStyle = hpRatio > 0.4 ? '#48bb78' : '#f56565';
    ctx.fillRect(barX, barY, Math.max(hpRatio > 0 ? px : 0, fillW), 2);

    if (e.maxArmor > 0 && e.armor > 0) {
      const armorRatio = Math.max(0, Math.min(1, e.armor / e.maxArmor));
      const aFillW = Math.round((barW * armorRatio) / px) * px;
      ctx.fillStyle = '#0b0c10';
      ctx.fillRect(barX - 2, barY - 6, barW + 4, 4);
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(barX, barY - 4, Math.max(px, aFillW), 2);
    }

    if (manualAimTargetId && e.id === manualAimTargetId) {
      const wx = Math.round((e.x + e.weakPointOffset.x) / px) * px;
      const wy = Math.round((e.y + e.weakPointOffset.y) / px) * px;
      ctx.fillStyle = '#ecc94b';
      ctx.fillRect(wx - 6, wy - 6, 4, 2);
      ctx.fillRect(wx + 4, wy - 6, 4, 2);
      ctx.fillRect(wx - 6, wy + 6, 4, 2);
      ctx.fillRect(wx + 4, wy + 6, 4, 2);
    }
  }

  // Pixel projectiles
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.alive) continue;
    const sx = Math.round(p.x / px) * px;
    const sy = Math.round(p.y / px) * px;
    ctx.fillStyle = p.color;
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
}
