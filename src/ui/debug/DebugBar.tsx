import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { AdTierLevel } from '../../store/types';

export const DebugBar: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [timeScale, setTimeScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return (window as unknown as { __SANDWALKER_TIME_SCALE__?: unknown })
        .__SANDWALKER_TIME_SCALE__ === 4
        ? 4
        : 1;
    }
    return 1;
  });

  const currentAct = useGameStore((s) => s.meta.currentAct);
  const adTier = useGameStore((s) => s.monetization.adTier);

  const handleTierSwitch = (tier: AdTierLevel) => {
    useGameStore.getState().setAdTier(tier);
  };

  const toggleSpeed = () => {
    const nextSpeed = timeScale === 1 ? 4 : 1;
    setTimeScale(nextSpeed);
    (window as unknown as { __SANDWALKER_TIME_SCALE__?: number }).__SANDWALKER_TIME_SCALE__ =
      nextSpeed;
  };

  const handleResetSave = () => {
    if (
      window.confirm(
        '정말 세이브 데이터를 초기화하시겠습니까? (오프닝 스킵 기록은 보존됩니다)'
      )
    ) {
      useGameStore.getState().resetSaveData();
      window.location.reload();
    }
  };

  if (collapsed) {
    return (
      <button
        data-testid="debug-toggle-btn"
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 999,
          background: 'rgba(11, 12, 16, 0.85)',
          color: '#ecc94b',
          fontSize: '11px',
          fontWeight: 700,
          padding: '6px 12px',
          borderRadius: 20,
          border: '1px solid #d69e2e',
          cursor: 'pointer',
          fontFamily: 'monospace',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.6)',
        }}
      >
        ⚙️ DEV ({currentAct}막 / T{adTier} / {timeScale}x)
      </button>
    );
  }

  return (
    <DebugBarExpanded
      currentAct={currentAct}
      adTier={adTier}
      timeScale={timeScale}
      onCollapse={() => setCollapsed(true)}
      onTierSwitch={handleTierSwitch}
      onToggleSpeed={toggleSpeed}
      onResetSave={handleResetSave}
    />
  );
};

interface DebugBarExpandedProps {
  currentAct: number;
  adTier: AdTierLevel;
  timeScale: number;
  onCollapse: () => void;
  onTierSwitch: (tier: AdTierLevel) => void;
  onToggleSpeed: () => void;
  onResetSave: () => void;
}

const DebugBarExpanded: React.FC<DebugBarExpandedProps> = ({
  currentAct,
  adTier,
  timeScale,
  onCollapse,
  onTierSwitch,
  onToggleSpeed,
  onResetSave,
}) => {
  const totalPlaySeconds = useGameStore((s) => s.meta.totalPlaySeconds);
  const routeProgress = useGameStore((s) => s.meta.routeProgress);
  const setAct = useGameStore((s) => s.setAct);
  const setRouteProgress = useGameStore((s) => s.setRouteProgress);
  const setPlayTime = useGameStore((s) => s.setPlayTime);
  const addCurrencies = useGameStore((s) => s.addCurrencies);

  const [fpsValue, setFpsValue] = useState<number>(60);
  const [kpiExportStatus, setKpiExportStatus] = useState<string>('');

  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let lastMeasure = performance.now();

    const sampleFps = (now: number) => {
      frames += 1;
      const elapsed = now - lastMeasure;
      if (elapsed >= 350) {
        const measured = Math.round((frames * 1000) / elapsed);
        const loopFps = (window as unknown as { __SANDWALKER_FPS__?: number })
          .__SANDWALKER_FPS__;
        setFpsValue(
          typeof loopFps === 'number' && loopFps > 1
            ? Math.round(loopFps)
            : Math.max(1, measured)
        );
        frames = 0;
        lastMeasure = now;
      }
      rafId = requestAnimationFrame(sampleFps);
    };

    rafId = requestAnimationFrame(sampleFps);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleExportKpi = () => {
    const state = useGameStore.getState();
    const kpiPayload = {
      exportedAt: new Date().toISOString(),
      currentAct: state.meta.currentAct,
      currentOasisIndex: state.meta.currentOasisIndex,
      oasisArrivalCount: state.meta.oasisArrivalCount,
      totalPlaySeconds: state.meta.totalPlaySeconds,
      adTier: state.monetization.adTier,
      sunGold: state.currencies.sunGold,
      ancientGear: state.currencies.ancientGear,
      mapFragments: state.currencies.mapFragments,
      averageFps: fpsValue,
    };
    const jsonText = JSON.stringify(kpiPayload, null, 2);

    try {
      void navigator.clipboard?.writeText?.(jsonText)?.catch(() => undefined);
    } catch {
      // Ignore clipboard permission errors
    }

    try {
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sandwalker-kpi.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Clipboard & DOM fallback still confirm export
    }

    setKpiExportStatus(`KPI 내보내기 완료 (${state.currencies.sunGold}G)`);
  };

  return (
    <div
      data-testid="debug-bar"
      className="debug-bar"
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 999,
        background: 'rgba(20, 24, 34, 0.96)',
        color: '#e2e8f0',
        padding: '12px',
        borderRadius: 8,
        border: '1px solid #4a5568',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.9)',
        fontSize: '11px',
        fontFamily: 'monospace',
        width: 280,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: '1px solid #2d3748',
        }}
      >
        <span style={{ fontWeight: 'bold', color: '#ecc94b' }}>
          🛠️ Developer Debug Bar
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            data-testid="debug-fps-readout"
            className="debug-fps-readout"
            style={{ color: '#68d391', fontWeight: 'bold' }}
          >
            {fpsValue} FPS
          </span>
          <button
            data-testid="debug-toggle-btn"
            onClick={onCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Act Jump */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#a0aec0',
            marginBottom: 4,
          }}
        >
          <span>Act Jump:</span>
          <select
            data-testid="debug-act-select"
            name="act"
            value={currentAct}
            onChange={(e) => setAct(Number(e.target.value))}
            style={{
              background: '#2d3748',
              color: '#fff',
              border: '1px solid #4a5568',
              borderRadius: 4,
              fontSize: '10px',
              padding: '2px 4px',
            }}
          >
            {[1, 2, 3, 4].map((act) => (
              <option key={act} value={act}>
                Act {act}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {[1, 2, 3, 4].map((act) => (
            <button
              key={act}
              data-testid={`debug-act-${act}`}
              onClick={() => setAct(act)}
              style={{
                padding: '4px',
                borderRadius: 4,
                border: '1px solid #4a5568',
                fontWeight: 'bold',
                cursor: 'pointer',
                background: currentAct === act ? '#dd6b20' : '#2d3748',
                color: currentAct === act ? '#fff' : '#cbd5e0',
              }}
            >
              Act {act}
            </button>
          ))}
        </div>
      </div>

      {/* Ad Tier Switch */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#a0aec0',
            marginBottom: 4,
          }}
        >
          <span>Ad Tier (0~3):</span>
          <select
            data-testid="debug-tier-select"
            name="tier"
            value={adTier}
            onChange={(e) => onTierSwitch(Number(e.target.value) as AdTierLevel)}
            style={{
              background: '#2d3748',
              color: '#fff',
              border: '1px solid #4a5568',
              borderRadius: 4,
              fontSize: '10px',
              padding: '2px 4px',
            }}
          >
            {([0, 1, 2, 3] as AdTierLevel[]).map((tier) => (
              <option key={tier} value={tier}>
                T{tier}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {([0, 1, 2, 3] as AdTierLevel[]).map((tier) => (
            <button
              key={tier}
              data-testid={`debug-tier-${tier}`}
              onClick={() => onTierSwitch(tier)}
              style={{
                padding: '4px',
                borderRadius: 4,
                border: '1px solid #4a5568',
                fontWeight: 'bold',
                cursor: 'pointer',
                background: adTier === tier ? '#319795' : '#2d3748',
                color: adTier === tier ? '#fff' : '#cbd5e0',
              }}
            >
              T{tier}
            </button>
          ))}
        </div>
      </div>

      {/* Play Time Override */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#a0aec0',
            marginBottom: 4,
            gap: 4,
          }}
        >
          <span>
            Play: {totalPlaySeconds}s (
            {totalPlaySeconds >= 900 ? '≥15분' : '<15분'})
          </span>
          <input
            data-testid="debug-playtime-input"
            name="playtime"
            type="number"
            min={0}
            value={totalPlaySeconds}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v) && v >= 0) {
                setPlayTime(v);
              }
            }}
            style={{
              width: 66,
              background: '#2d3748',
              color: '#ecc94b',
              border: '1px solid #4a5568',
              borderRadius: 4,
              fontSize: '10px',
              padding: '2px 4px',
              textAlign: 'right',
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <button
            data-testid="debug-playtime-0"
            onClick={() => setPlayTime(0)}
            style={{
              padding: '4px',
              background: '#2d3748',
              color: '#e2e8f0',
              border: '1px solid #4a5568',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            0s (초기화)
          </button>
          <button
            data-testid="debug-playtime-1200"
            onClick={() => setPlayTime(1200)}
            style={{
              padding: '4px',
              background: '#b7791f',
              color: '#fff',
              border: '1px solid #d69e2e',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            1200s (20분 강제)
          </button>
        </div>
      </div>

      {/* Route Progress Slider */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#a0aec0',
            marginBottom: 4,
          }}
        >
          <span>Route Progress:</span>
          <span style={{ fontWeight: 'bold', color: '#ecc94b' }}>
            {Math.round(routeProgress)}%
          </span>
        </div>
        <input
          data-testid="debug-progress-slider"
          type="range"
          min="0"
          max="100"
          value={routeProgress}
          onChange={(e) => setRouteProgress(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9px',
            color: '#718096',
            marginTop: 2,
          }}
        >
          <button
            data-testid="debug-progress-0"
            onClick={() => setRouteProgress(0)}
            style={{
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
            }}
          >
            0%
          </button>
          <button
            data-testid="debug-progress-40"
            onClick={() => setRouteProgress(40)}
            style={{
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
            }}
          >
            40%(위기)
          </button>
          <button
            data-testid="debug-progress-70"
            onClick={() => setRouteProgress(70)}
            style={{
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
            }}
          >
            70%(탈출)
          </button>
          <button
            data-testid="debug-progress-95"
            onClick={() => setRouteProgress(95)}
            style={{
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
            }}
          >
            95%(보스)
          </button>
          <button
            data-testid="debug-progress-100"
            onClick={() => setRouteProgress(100)}
            style={{
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
            }}
          >
            100%
          </button>
        </div>
      </div>

      {/* Speed & Currency Cheats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          marginBottom: 8,
        }}
      >
        <button
          data-testid="debug-speed-btn"
          onClick={onToggleSpeed}
          style={{
            padding: '5px',
            borderRadius: 4,
            border: '1px solid #4a5568',
            fontWeight: 'bold',
            cursor: 'pointer',
            background: timeScale === 4 ? '#805ad5' : '#2d3748',
            color: '#fff',
          }}
        >
          Speed: {timeScale}x
        </button>
        <button
          data-testid="debug-add-currency-btn"
          onClick={() => addCurrencies(1000, 10)}
          style={{
            padding: '5px',
            borderRadius: 4,
            border: '1px solid #4a5568',
            cursor: 'pointer',
            background: '#2d3748',
            color: '#ecc94b',
            fontWeight: 'bold',
          }}
        >
          +1000G/+10태엽
        </button>
      </div>

      {/* KPI Export & Reset Save */}
      <div
        style={{
          paddingTop: 8,
          borderTop: '1px solid #2d3748',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          data-testid="debug-export-kpi-btn"
          onClick={handleExportKpi}
          style={{
            width: '100%',
            padding: '5px',
            background: '#2c5282',
            color: '#ebf8ff',
            fontWeight: 'bold',
            borderRadius: 4,
            border: '1px solid #63b3ed',
            cursor: 'pointer',
          }}
        >
          📊 Export KPI JSON
        </button>
        {kpiExportStatus && (
          <div
            data-testid="debug-kpi-status"
            style={{ color: '#68d391', fontSize: '10px', textAlign: 'center' }}
          >
            {kpiExportStatus}
          </div>
        )}
        <button
          data-testid="debug-reset-save-btn"
          onClick={onResetSave}
          style={{
            width: '100%',
            padding: '6px',
            background: '#9b2c2c',
            color: '#fed7d7',
            fontWeight: 'bold',
            borderRadius: 4,
            border: '1px solid #e53e3e',
            cursor: 'pointer',
          }}
        >
          ⚠️ 세이브 초기화 (Intro 유지)
        </button>
      </div>
    </div>
  );
};
