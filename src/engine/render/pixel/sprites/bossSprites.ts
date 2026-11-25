import type { BossAddInstance, BossRenderSnapshot } from '@/engine/systems/BossSystem';
import {
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
  drawPixelGroundShadow,
  PIXEL_UPSCALE,
  type CompiledPixelSprite,
} from '../PixelCanvas';
import { BOSS_PALETTE, ENEMY_PALETTE } from '../palettes';

// 36 x 20 Varka Armored Car facing -X
const VARKA_MATRIX: readonly string[] = [
  '.............KKKKKKKKKKKKKK.........',
  '.........KKKKLLLLLLLLLLLLLLKK.......',
  '........KLLLLMMMMMMMMMMMMMMMMK......',
  '.....KKKLLLMMMMMMMMMGGGGMMMMMMK.....',
  '..KKKKBBBBBBMMMMMMGGWWWWGGMMMMMK....',
  '.KMMMMBBBBBBMMMMMMGGWWWWGGMMMMMMK...',
  'KOOOOOOOOOOOMMMMMMMMGGGGMMMMMMMMMK..',
  'KOOKKMMMMMMBBBBBBBBBBBBBBBBBBBBMMMK.',
  '.KKKKMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK.',
  '..KDDMMMMMMMMMMMMMMMMMMMMMMMMMMMMDK.',
  '...KDDDKKKDDDDDDDDKKKKDDDDDDDDKKDDK.',
  '...KDDKLLLKDDDDDDKLLLKDDDDDDKLLLKDK.',
  '...KKKLLLLLKKKKKKLLLLLKKKKKKLLLLLKK.',
  '.....KLLLLLK....KLLLLLK....KLLLLLK..',
  '......KKKKK......KKKKK......KKKKK...',
];

// 38 x 24 Scorpion Rex Boss
const SCORPION_REX_MATRIX: readonly string[] = [
  '...........KKKKK......................',
  '..........KYYYYYK.......KKKK..........',
  '.........KYYWWWYYK.....KLLLMK.........',
  '..........KKKKKKK.....KLLLLMMK........',
  '.....................KLLLLLMMMK.......',
  '...........KKKKKKKKKKMMMMMMKMK........',
  '.....KKKKKKBBBBBBBBBBMMMMMMKK.........',
  '...KKMMMMMMBBBBBBBBBBMMMMMMMK.........',
  '.KKLLLLMMMMMMMMMMMMMMMMMMMMMMK........',
  'KLLLLMMMMMMMMMMMMMMMMMMMMMMMMK........',
  '.KKLLMMMMMMMMMMMMMMMMMMMMMMMMK........',
  '...KKMMMMMMMMMMMMMMMMMMMMMMMK.........',
  '.....KKKKKKKKMMMMMMMMKKKKKKK..........',
  '.....KLLM..KLLM..KLLM..KLLM...........',
  '....KLLK...KLLK...KLLK..KLLK..........',
  '...KKK.....KKK.....KKK...KKK..........',
];

// 24 x 26 Mirage Spirit King
const MIRAGE_KING_MATRIX: readonly string[] = [
  '.........KYYYYK.........',
  '........KYWWWWYK........',
  '.......KKCPPPPCKK.......',
  '.....KKPPPPVVPPPPKK.....',
  '....KPPPPVCCCCVPPPPK....',
  '...KPPPVCWWWWWWCVPPPK...',
  '..KPPPPVCWYYYYWCVPPPPK..',
  '..KPPPPVCWWYYWWCVPPPPK..',
  '...KPPPVCWWWWWWCVPPPK...',
  '....KPPPPVCCCCVPPPPK....',
  '.....KKPPPPVVPPPPKK.....',
  '....KPPPPPPKKPPPPPPK....',
  '...KPPPPPPK..KPPPPPPK...',
  '..KPPPKKK......KKKPPPK..',
  '.KCCK..............KCCK.',
];

// 38 x 28 Apophis Sandworm Head (P1 Shell / P2 Exposed Core)
const SANDWORM_ARMORED_MATRIX: readonly string[] = [
  '..........KKKKKKKKKKKKKK..............',
  '.......KKKSSSSSSSSSSSSSSKKK...........',
  '.....KKSSSNNNNNNNNNNNNNNSSSKK.........',
  '...KKSSNNBBBBBBBBBBNNNNNNNNSSK........',
  '..KSNNBBBWWWWBBBBBBNNNNNNNNSSSK.......',
  '.KSNNBBWWYYYYWWBBNNNNNNNNNNSSSSK......',
  'KSNNNBBBWWWWBBBBNNNNNNNNNNNSSSSSK.....',
  'KSNNNNNNNNNNNNNNNNNNNNNNNNNSSSSSK.....',
  'KRRRRNNNNNNNNNNNNNNNNNNNNNNNSSSSK.....',
  'KRRRRRKKKKKKKKKKKKKKKKKKKKKKSSSSK.....',
  'KRRRRRRRRNNNNNNNNNNNNNNNNNNNSSSSK.....',
  '.KKRRRRNNNNNNNNNNNNNNNNNNNNNSSSSK.....',
  '...KKKKKKSSSSSSSSSSSSSSSSSSSSKKK......',
  '.........KKKKKKKKKKKKKKKKKKKK.........',
];

const SANDWORM_CORE_MATRIX: readonly string[] = [
  '..........KKKKKKKKKKKKKK..............',
  '.......KKKRRRRRRRRRRRRRRKKK...........',
  '.....KKRRRROOOOOOOOOOOOORRRKK.........',
  '...KKRROOOYYYYYYYYYYOOOOORRRRK........',
  '..KROOYYWWWWWWYYYYYOOOOOORRRRRK.......',
  '.KROOYYWWWWWWWWYYYOOOOOOORRRRRRK......',
  'KRROOOYYWWWWWWYYYYOOOOOOORRRRRRRK.....',
  'KRRRROOOOOOOOOOOOOORRRRRRRRRRRRRK.....',
  'KRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRK.....',
  'KRRRRKKKKKKKKKKKKKKKKKKKKKKRRRRRK.....',
  'KRRRRRRRRROOOOOOOOOOOOOOORRRRRRRK.....',
  '.KKRRRRRROOOOOOOOOOOOOOOORRRRRRRK.....',
  '...KKKKKKRRRRRRRRRRRRRRRRRRRRKKK......',
  '.........KKKKKKKKKKKKKKKKKKKK.........',
];

const BOSS_CACHE = {
  VARKA: compileSprite(VARKA_MATRIX, { ...BOSS_PALETTE, G: '#ecc94b' }),
  VARKA_FLASH: compileSprite(VARKA_MATRIX, BOSS_PALETTE, { flashWhite: true }),
  SCORPION: compileSprite(SCORPION_REX_MATRIX, BOSS_PALETTE),
  SCORPION_FLASH: compileSprite(SCORPION_REX_MATRIX, BOSS_PALETTE, { flashWhite: true }),
  MIRAGE: compileSprite(MIRAGE_KING_MATRIX, BOSS_PALETTE),
  MIRAGE_FLASH: compileSprite(MIRAGE_KING_MATRIX, BOSS_PALETTE, { flashWhite: true }),
  WORM_SHELL: compileSprite(SANDWORM_ARMORED_MATRIX, BOSS_PALETTE),
  WORM_SHELL_FLASH: compileSprite(SANDWORM_ARMORED_MATRIX, BOSS_PALETTE, { flashWhite: true }),
  WORM_CORE: compileSprite(SANDWORM_CORE_MATRIX, BOSS_PALETTE),
  WORM_CORE_FLASH: compileSprite(SANDWORM_CORE_MATRIX, BOSS_PALETTE, { flashWhite: true }),
};

// Compact 14 x 15 Mirage Clone rendered cleanly at PIXEL_UPSCALE(2)
const CLONE_SPRITE = compileSprite(
  [
    '.....KCCK.....',
    '....KCWWCK....',
    '...KPPCCPPK...',
    '..KPPCCCCPPK..',
    '.KPPCWWWWCPPK.',
    'KPPWCWWWWCWPPK',
    'KPPWCWCCWCWPPK',
    'KPPWCWWWWCWPPK',
    '.KPPCWWWWCPPK.',
    '..KPPCCCCPPK..',
    '...KPPPPPPK...',
    '....KPKKPK....',
    '...KPK..KPK...',
    '..KCK....KCK..',
  ],
  {
    ...BOSS_PALETTE,
    Y: '#7dd3fc',
    W: '#e0f2fe',
  }
);

const PARASITE_SPRITE = compileSprite(
  [
    '..KKKKK..',
    '.KRRRRRK.',
    'KRYYRRRYK',
    'KRRRRRRRK',
    '.KKKKKKK.',
  ],
  ENEMY_PALETTE
);

const SWARM_SPRITE = compileSprite(
  [
    '..KKKK..',
    '.KDDDDK.',
    'KRRRRRRK',
    'KROOOORK',
    '.KRRRRK.',
    '..K..K..',
  ],
  ENEMY_PALETTE
);

function selectBossSprite(boss: BossRenderSnapshot): CompiledPixelSprite {
  const flash = boss.hitFlashTimer > 0;
  if (boss.id === 'VARKA_ARMORED_CAR') {
    return flash ? BOSS_CACHE.VARKA_FLASH : BOSS_CACHE.VARKA;
  }
  if (boss.id === 'SCORPION_REX') {
    return flash ? BOSS_CACHE.SCORPION_FLASH : BOSS_CACHE.SCORPION;
  }
  if (boss.id === 'MIRAGE_SPIRIT_KING') {
    return flash ? BOSS_CACHE.MIRAGE_FLASH : BOSS_CACHE.MIRAGE;
  }
  const hasShell = boss.phase === 1 && boss.armor > 0;
  if (hasShell) {
    return flash ? BOSS_CACHE.WORM_SHELL_FLASH : BOSS_CACHE.WORM_SHELL;
  }
  return flash ? BOSS_CACHE.WORM_CORE_FLASH : BOSS_CACHE.WORM_CORE;
}

function drawBossAdds(
  ctx: CanvasRenderingContext2D,
  adds: readonly BossAddInstance[],
  manualAimTargetId: string | null
): void {
  const px = PIXEL_UPSCALE;
  for (let i = 0; i < adds.length; i++) {
    const add = adds[i];
    if (!add.alive) continue;

    if (add.kind === 'MIRAGE_CLONE') {
      drawPixelGroundShadow(ctx, add.x, add.y + 18, 12, 2, 0.20);
      ctx.save();
      ctx.globalAlpha = 0.72;
      drawCompiledSprite(ctx, CLONE_SPRITE, add.x, add.y, { pixelSize: px });
      ctx.restore();
    } else if (add.kind === 'PARASITE') {
      drawPixelGroundShadow(ctx, add.x, add.y + 8, 9, 2, 0.28);
      drawCompiledSprite(ctx, PARASITE_SPRITE, add.x, add.y, { pixelSize: px });
    } else {
      drawPixelGroundShadow(ctx, add.x, add.y + 8, 8, 2, 0.28);
      drawCompiledSprite(ctx, SWARM_SPRITE, add.x, add.y, { pixelSize: px });
    }

    if (manualAimTargetId && add.id === manualAimTargetId) {
      const wx = Math.round((add.x + (add.weakPointOffset?.x ?? 0)) / px) * px;
      const wy = Math.round((add.y + (add.weakPointOffset?.y ?? 0)) / px) * px;
      ctx.fillStyle = '#ecc94b';
      ctx.fillRect(wx - 4, wy - 4, 8, 2);
      ctx.fillRect(wx - 4, wy + 4, 8, 2);
    }
  }
}

export function drawPixelBoss(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot | null,
  _manualAimTargetId: string | null,
  timeSec: number
): void {
  if (!boss) return;
  const px = PIXEL_UPSCALE;

  // Boss floor contact shadow
  drawPixelGroundShadow(
    ctx,
    boss.x,
    boss.id === 'MIRAGE_SPIRIT_KING' ? boss.y + 40 : boss.y + boss.radius - 6,
    boss.radius * 1.15,
    5,
    boss.id === 'MIRAGE_SPIRIT_KING' ? 0.22 : 0.34
  );

  // Undulating Sandworm body segments behind head with crisp obsidian outline & dorsal ridge highlight
  if (boss.id === 'GREAT_SANDWORM') {
    const isCoreOpen = boss.phase >= 2 || boss.armor <= 0;
    for (let s = 5; s >= 1; s--) {
      const sx = Math.round((boss.x + s * 22) / px) * px;
      const sy = Math.round((boss.y + 4 + Math.sin(timeSec * 4 - s * 0.8) * 6) / px) * px;
      const half = Math.max(10, 24 - s * 2);

      drawPixelGroundShadow(ctx, sx, sy + half + 2, half * 0.9, 3, 0.28);

      // Outer 2px obsidian outline
      ctx.fillStyle = '#0f1219';
      ctx.fillRect(sx - half - px, sy - half - px, half * 2 + px * 2, half * 2 + px * 2);

      // Armored segment hull
      ctx.fillStyle = isCoreOpen ? '#9b2c2c' : '#744210';
      ctx.fillRect(sx - half, sy - half, half * 2, half * 2);

      // Mid dorsal band
      ctx.fillStyle = isCoreOpen ? '#dd6b20' : '#d69e2e';
      ctx.fillRect(sx - half + px, sy - half + px * 2, half * 2 - px * 2, px * 3);

      // Bright top rim crest
      ctx.fillStyle = isCoreOpen ? '#fef08a' : '#ecc94b';
      ctx.fillRect(sx - half + px * 2, sy - half, half * 2 - px * 4, px);

      // Segment seam shadow notch
      ctx.fillStyle = '#0f1219';
      ctx.fillRect(sx - half, sy - half + px * 5, px, half * 2 - px * 6);
    }
  }

  const sprite = selectBossSprite(boss);
  const floatY = boss.id === 'MIRAGE_SPIRIT_KING' ? Math.sin(timeSec * 3.2) * 5 : 0;
  drawCompiledSprite(ctx, sprite, boss.x, boss.y + floatY, {
    anchorX: 0.5,
    anchorY: 0.5,
    pixelSize: px,
  });

  // Weak-point lock indicator & Sandworm breath flare
  const wpX = Math.round((boss.x + boss.weakPointOffset.x) / px) * px;
  const wpY = Math.round((boss.y + floatY + boss.weakPointOffset.y) / px) * px;
  ctx.fillStyle = boss.isGroggy ? '#fef08a' : '#f56565';
  ctx.fillRect(wpX - 4, wpY - 4, 8, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wpX - 2, wpY - 2, 4, 4);

  if (boss.breathVisualTimer > 0) {
    drawBresenhamLine(ctx, boss.x - 24, boss.y - 6, 260, 276, px, '#f6ad55', 3);
    drawBresenhamLine(ctx, boss.x - 24, boss.y - 6, 260, 276, px, '#fef08a', 1);
  }

  if ((boss.specialVisualTimer ?? 0) > 0) {
    if (boss.specialKind === 'SMOKE_RUSH') {
      for (let s = 0; s < 4; s++) {
        const sx = Math.round((boss.x + 18 + s * 12) / px) * px;
        const sy = Math.round((boss.y + 4 - (s % 2) * 8) / px) * px;
        ctx.fillStyle = s % 2 === 0 ? '#718096' : '#4a5568';
        ctx.fillRect(sx, sy, 8, 8);
      }
    } else if (boss.specialKind === 'VENOM_BARRAGE') {
      drawBresenhamLine(ctx, boss.x - 24, boss.y - 44, 280, 282, px, '#48bb78', 2);
      drawBresenhamLine(ctx, boss.x - 24, boss.y - 44, 300, 302, px, '#9ae6b4', 1);
    } else if (boss.specialKind === 'MIRAGE_SWAP') {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(wpX - 18, wpY - 18, 36, 2);
      ctx.fillRect(wpX - 18, wpY + 16, 36, 2);
      ctx.fillRect(wpX - 18, wpY - 18, 2, 36);
      ctx.fillRect(wpX + 16, wpY - 18, 2, 36);
    }
  }

  if (boss.isGroggy) {
    for (let k = 0; k < 3; k++) {
      const sx = Math.round((boss.x - 16 + k * 16 + Math.sin(timeSec * 6 + k) * 4) / px) * px;
      const sy = Math.round((boss.y - 34) / px) * px;
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
  }

  drawBossAdds(ctx, boss.adds, _manualAimTargetId);
}
