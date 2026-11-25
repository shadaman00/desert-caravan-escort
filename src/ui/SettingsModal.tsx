import type { AutoInvestPolicy } from '../store/types';
import type { ToastDensity, UserSettings } from '../game/settings';

export interface SettingsModalProps {
  isOpen: boolean;
  settings: UserSettings;
  autoInvestPolicy: AutoInvestPolicy;
  saveJsonInput: string;
  saveBackupStatus: string | null;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onChangeAutoInvestPolicy: (policy: AutoInvestPolicy) => void;
  onChangeSaveJsonInput: (value: string) => void;
  onExportSave: () => void;
  onImportSave: () => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  settings,
  autoInvestPolicy,
  saveJsonInput,
  saveBackupStatus,
  onUpdateSettings,
  onChangeAutoInvestPolicy,
  onChangeSaveJsonInput,
  onExportSave,
  onImportSave,
  onClose,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" data-testid="settings-modal">
      <div className="modal-dialog settings-modal-dialog">
        <div className="modal-title">🎛️ 환경 설정 & 백업</div>
        <div className="modal-body settings-modal-body">
          <div className="settings-section-title">오디오</div>
          <label className="settings-slider-row">
            <span>마스터 볼륨 ({Math.round(settings.masterVolume * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.masterVolume * 100)}
              data-testid="slider-master-volume"
              onChange={(e) =>
                onUpdateSettings({ masterVolume: Number(e.target.value) / 100 })
              }
            />
          </label>
          <label className="settings-slider-row">
            <span>배경음(BGM) ({Math.round(settings.bgmVolume * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.bgmVolume * 100)}
              data-testid="slider-bgm-volume"
              onChange={(e) =>
                onUpdateSettings({ bgmVolume: Number(e.target.value) / 100 })
              }
            />
          </label>
          <label className="settings-slider-row">
            <span>효과음(SFX) ({Math.round(settings.sfxVolume * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              data-testid="slider-sfx-volume"
              onChange={(e) =>
                onUpdateSettings({ sfxVolume: Number(e.target.value) / 100 })
              }
            />
          </label>

          <div className="settings-toggle-row">
            <label className="settings-check-label">
              <input
                type="checkbox"
                checked={settings.muted}
                data-testid="toggle-settings-mute"
                onChange={(e) => onUpdateSettings({ muted: e.target.checked })}
              />
              <span>전체 음소거</span>
            </label>
            <label className="settings-check-label">
              <input
                type="checkbox"
                checked={settings.hapticsEnabled}
                data-testid="toggle-settings-haptics"
                onChange={(e) => onUpdateSettings({ hapticsEnabled: e.target.checked })}
              />
              <span>진동(햅틱) 활성</span>
            </label>
          </div>

          <div className="settings-section-title">성장 & 알림 UX</div>
          <label className="settings-select-row">
            <span>자동 강화 토스트 밀도</span>
            <select
              data-testid="select-toast-density"
              className="auto-policy-select"
              value={settings.toastDensity}
              onChange={(e) =>
                onUpdateSettings({ toastDensity: e.target.value as ToastDensity })
              }
            >
              <option value="ALL">전체 표시</option>
              <option value="IMPORTANT">핵심 승급만</option>
              <option value="OFF">표시 끄기</option>
            </select>
          </label>
          <label className="settings-select-row">
            <span>자동 투자 전략</span>
            <select
              data-testid="settings-auto-invest-select"
              className="auto-policy-select"
              value={autoInvestPolicy}
              onChange={(e) => onChangeAutoInvestPolicy(e.target.value as AutoInvestPolicy)}
            >
              <option value="MANUAL">수동 유지</option>
              <option value="BALANCED">균형 자동 투자</option>
              <option value="COMBAT">화력 우선 투자</option>
              <option value="ECONOMY">기동/교역 우선</option>
            </select>
          </label>

          <div className="settings-section-title">세이브 JSON 백업 / 복원</div>
          <div className="dash-actions">
            <button
              type="button"
              data-testid="settings-btn-export-save"
              className="dash-btn secondary"
              onClick={onExportSave}
            >
              📤 내보내기
            </button>
            <button
              type="button"
              data-testid="settings-btn-import-save"
              className="dash-btn"
              onClick={onImportSave}
            >
              📥 가져오기
            </button>
          </div>
          <textarea
            data-testid="settings-save-textarea"
            className="save-json-textarea"
            rows={2}
            placeholder="내보내기 JSON 또는 백업 JSON 붙여넣기"
            value={saveJsonInput}
            onChange={(e) => onChangeSaveJsonInput(e.target.value)}
          />
          {saveBackupStatus && (
            <div data-testid="settings-save-status" className="dash-sub">
              {saveBackupStatus}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            data-testid="btn-close-settings"
            className="modal-btn modal-btn-primary"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
