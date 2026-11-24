import type { BossAddInstance, BossRenderSnapshot } from '@/engine/systems/BossSystem';
import {
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
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

const CLONE_SPRITE = compileSprite(MIRAGE_KING_MATRIX, {
  ...BOSS_PALETTE,
  Y: '#7dd3fc',
  W: '#bae6fd',
});

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
      ctx.save();
      ctx.globalAlpha = 0.65;
      drawCompiledSprite(ctx, CLONE_SPRITE, add.x, add.y, { pixelSize: 1 });
      ctx.restore();
    } else if (add.kind === 'PARASITE') {
      drawCompiledSprite(ctx, PARASITE_SPRITE, add.x, add.y, { pixelSize: px });
    } else {
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
  manualAimTargetId: string | null,
  timeSec: number
): void {
  if (!boss) return;
  const px = PIXEL_UPSCALE;

  // Undulating Sandworm body segments behind head
  if (boss.id === 'GREAT_SANDWORM') {
    const isCoreOpen = boss.phase >= 2 || boss.armor <= 0;
    for (let s = 5; s >= 1; s--) {
      const sx = Math.round((boss.x + s * 22) / px) * px;
      const sy = Math.round((boss.y + 4 + Math.sin(timeSec * 4 - s * 0.8) * 6) / px) * px;
      const half = Math.max(10, 24 - s * 2);
      ctx.fillStyle = isCoreOpen ? '#9b2c2c' : '#744210';
      ctx.fillRect(sx - half, sy - half, half * 2, half * 2);
      ctx.fillStyle = isCoreOpen ? '#f6ad55' : '#b7791f';
      ctx.fillRect(sx - half + 4, sy - half + 4, half * 2 - 8, 6);
    }
  }

  // Telegraph stepped warning line
  if (boss.telegraphActive) {
    drawBresenhamLine(
      ctx,
      boss.x + boss.weakPointOffset.x,
      boss.y + boss.weakPointOffset.y,
      268,
      276,
      px,
      '#e53e3e',
      1
    );
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

  if (manualAimTargetId && boss.targetId === manualAimTargetId) {
    ctx.fillStyle = '#ecc94b';
    ctx.fillRect(wpX - 10, wpY - 10, 6, 2);
    ctx.fillRect(wpX + 6, wpY - 10, 6, 2);
    ctx.fillRect(wpX - 10, wpY + 8, 6, 2);
    ctx.fillRect(wpX + 6, wpY + 8, 6, 2);
  }

  drawBossAdds(ctx, boss.adds, manualAimTargetId);
}
