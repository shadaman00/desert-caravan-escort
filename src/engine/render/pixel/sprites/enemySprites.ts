import type { EnemyInstance, EnemyProjectile } from '@/engine/systems/SpawnSystem';
import {
  compileSprite,
  drawCompiledSprite,
  drawPixelGroundShadow,
  PIXEL_UPSCALE,
  type CompiledPixelSprite,
} from '../PixelCanvas';
import { ENEMY_PALETTE } from '../palettes';

// 15 x 14 Desert Bandit facing -X with bright turban highlight & raised scimitar
const BANDIT_FRAMES_M: readonly (readonly string[])[] = [
  [
    '.....HHHHK.....',
    '....KOOOODK....',
    '...KOOODDDDK...',
    '....KRRRRRK....',
    '.HHHKRRRRROK...',
    'SSH.KRRRRRRK...',
    'SK..KRRRRROK...',
    '....KRRRRRK....',
    '....KRRRRRK....',
    '.....KR.RK.....',
    '.....KO.OK.....',
    '.KKKKKKKKKKKKK.',
    'KOOOOOOOOOOOOOK',
    '.KKKKKKKKKKKKK.',
  ],
  [
    '.....HHHHK.....',
    '....KOOOODK....',
    '...KOOODDDDK...',
    '....KRRRRRK....',
    '..HHKRRRRROK...',
    '.SSHKRRRRRRK...',
    '..SKKRRRRROK...',
    '....KRRRRRK....',
    '....KRRRRRK....',
    '....KR...RK....',
    '....KO...OK....',
    '.KKKKKKKKKKKKK.',
    'KOOOOOOOOOOOOOK',
    '.KKKKKKKKKKKKK.',
  ],
];

// 21 x 13 Armored Scorpion with cyan-rimmed shell & glowing venom stinger (facing -X)
const SCORPION_FRAMES_M: readonly (readonly string[])[] = [
  [
    '.......KGGK..........',
    '......KYYYYK....KK...',
    '.......KKKK....KAAM..',
    '............KKKKMMK..',
    '..KKK...KKKKBBBBMMK..',
    '.KBBBK.KBBBBMMMMMMMK.',
    'KHH.KMMBBBBMMMMMMMMK.',
    '....KMMMMMMMMMMMMMMK.',
    '...KKMMAAKMMMAAKMMK..',
    '..KA...KK.KA...KK.KA.',
    '.KK........KK.....KK.',
  ],
  [
    '.......KGGK..........',
    '......KYYYYK....KK...',
    '.......KKKK....KAAM..',
    '............KKKKMMK..',
    '.KKK....KKKKBBBBMMK..',
    'KBBBKK.KBBBBMMMMMMMK.',
    '.KHHKMMBBBBMMMMMMMMK.',
    '....KMMMMMMMMMMMMMMK.',
    '...KKMMAAKMMMAAKMMK..',
    '...KA...K..KA...K.KA.',
    '...KK......KK.....KK.',
  ],
];

// 15 x 15 Mirage Spirit bright crystal core
const MIRAGE_FRAMES_M: readonly (readonly string[])[] = [
  [
    '.......H.......',
    '......KCK......',
    '.....KCPCK.....',
    '....KCPWPCK....',
    '...KCPWWWPCK...',
    '..KCPWWWWWPCK..',
    '.KCPWWCCCWWPCK.',
    'KCPWWCHHHWCWPCK',
    '.KCPWWCCCWWPCK.',
    '..KCPWWWWWPCK..',
    '...KCPWWWPCK...',
    '....KCPWPCK....',
    '.....KCPCK.....',
    '......KCK......',
    '.......H.......',
  ],
  [
    '.......W.......',
    '......KHK......',
    '.....KCPCK.....',
    '....KCCWCCK....',
    '...KCPWWWPCK...',
    '..KCPWCCWPPCC..',
    '.KCPWCCCCWWPCK.',
    'WCPWCHHHHHWCPCW',
    '.KCPWCCCCWWPCK.',
    '..KCPWCCWPPCC..',
    '...KCPWWWPCK...',
    '....KCCWCCK....',
    '.....KCPCK.....',
    '......KHK......',
    '.......W.......',
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
  _manualAimTargetId: string | null,
  timeSec: number
): void {
  if (enemies.length === 0 && projectiles.length === 0) return;
  const px = PIXEL_UPSCALE;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;

    const sprite = selectEnemySprite(e);
    const shadowY = e.archetypeId === 'MIRAGE_SPIRIT' ? e.y + e.radius + 8 : e.y + e.radius - 2;
    drawPixelGroundShadow(
      ctx,
      e.x,
      shadowY,
      Math.max(10, e.radius * 0.85),
      3,
      e.archetypeId === 'MIRAGE_SPIRIT' ? 0.18 : 0.30
    );
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
