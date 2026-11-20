import type { TimeOfDay } from '@/store/types';

export const MAX_DIALOGUE_CHARS = 35;

export type OpeningPhaseId = 1 | 2 | 3 | 4;

export type OpeningHighlight =
  | 'OVERDRIVE_SKILL'
  | 'RED_ALERT_VIGNETTE'
  | 'TURRET_SWITCH_GUIDE'
  | 'TURRET_UPGRADE_GUIDE';

export interface OpeningPhaseInfo {
  readonly phase: OpeningPhaseId;
  readonly badgeText: string;
  readonly timeOfDay: TimeOfDay;
  readonly highlight: OpeningHighlight;
}

export interface OpeningDialogueCue {
  readonly id: string;
  readonly triggerAtSec: number;
  readonly speaker: string;
  readonly text: string;
}

/**
 * 180s Opening Hook scripted dialogue cues.
 * Strictly adheres to AC-02: every line's Unicode codepoint length <= 35 (including spaces).
 */
export const OPENING_DIALOGUE_CUES: readonly OpeningDialogueCue[] = [
  {
    id: 'cue_p1_kasim',
    triggerAtSec: 0.2,
    speaker: '카심',
    text: '신전의 문이 코앞이다! 열선 레이저 최대 출력, 길을 뚫어라!',
  },
  {
    id: 'cue_p1_squad',
    triggerAtSec: 2.0,
    speaker: '용병단',
    text: '사막의 괴물들이 녹아내린다! 조금만 더 버텨!',
  },
  {
    id: 'cue_p2_kasim_quake',
    triggerAtSec: 30.5,
    speaker: '카심',
    text: '땅 밑에서 거대한 진동이...! 전원 충격에 대비해!',
  },
  {
    id: 'cue_p2_kasim_wreck',
    triggerAtSec: 35.0,
    speaker: '카심',
    text: '크윽... 동력로와 외장이 전부 부서졌다. 일단 후퇴한다!',
  },
  {
    id: 'cue_p3_harun',
    triggerAtSec: 76.0,
    speaker: '하룬',
    text: '목숨은 건졌군. 첫 오아시스에 생수를 팔아 군자금을 모으자!',
  },
  {
    id: 'cue_p3_sera',
    triggerAtSec: 82.0,
    speaker: '세라',
    text: '장갑차엔 작살포가 제격이야! 우측 하단 버튼으로 무기를 바꿔!',
  },
  {
    id: 'cue_p4_harun',
    triggerAtSec: 136.0,
    speaker: '하룬',
    text: '생수 시세가 200% 폭등했어! 이 금화로 주포를 강화하자!',
  },
];

export function getOpeningPhaseInfo(elapsedSec: number): OpeningPhaseInfo {
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  if (t < 30) {
    return {
      phase: 1,
      badgeText: 'Phase 1/4: 황금 신전 문 앞 (Lv.30 프리뷰)',
      timeOfDay: 'NIGHT',
      highlight: 'OVERDRIVE_SKILL',
    };
  }
  if (t < 75) {
    return {
      phase: 2,
      badgeText: 'Phase 2/4: 대사구 샌드웜 기습 및 파손',
      timeOfDay: 'STORM',
      highlight: 'RED_ALERT_VIGNETTE',
    };
  }
  if (t < 135) {
    return {
      phase: 3,
      badgeText: 'Phase 3/4: 제1 오아시스 행군 및 비석 해독',
      timeOfDay: 'DAY',
      highlight: 'TURRET_SWITCH_GUIDE',
    };
  }
  return {
    phase: 4,
    badgeText: 'Phase 4/4: 제1 오아시스 도착 및 200% 정산',
    timeOfDay: 'DAY',
    highlight: 'TURRET_UPGRADE_GUIDE',
  };
}

export function validateOpeningScript(): boolean {
  return OPENING_DIALOGUE_CUES.every((cue) => [...cue.text].length <= MAX_DIALOGUE_CHARS);
}
