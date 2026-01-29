import React from 'react';
import Select from '../common/Select/Select';
import ToggleSwitch from '../common/ToggleSwitch/ToggleSwitch';
import Card from '../common/Card/Card';
import './SettingsPanel.scss';

type SettingsPanelProps = {
  language: string;
  onLanguageChange: (lang: string) => void;
  languageOptions: Array<{ value: string; label: string }>;
  autostart: boolean;
  onAutostartChange: (next: boolean) => void;
  languageLabel: string;
  languageDescription: string;
  autostartLabel: string;
  autostartDescription: string;
  confirmOnClose: boolean;
  onConfirmOnCloseChange: (next: boolean) => void;
  confirmOnCloseLabel: string;
  confirmOnCloseDescription: string;
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  language,
  onLanguageChange,
  languageOptions,
  autostart,
  onAutostartChange,
  languageLabel,
  languageDescription,
  autostartLabel,
  autostartDescription,
  confirmOnClose,
  onConfirmOnCloseChange,
  confirmOnCloseLabel,
  confirmOnCloseDescription
}) => {
  return (
    <div className="hp-settings">
      <Card>
        <div className="hp-settings__row">
          <div className="hp-settings__copy">
            <p className="hp-settings__label">{languageLabel}</p>
            <p className="hp-settings__description">{languageDescription}</p>
          </div>
          <Select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            options={languageOptions}
            style={{ minWidth: '150px' }}
          />
        </div>
        <div className="hp-settings__row">
          <div className="hp-settings__copy">
            <p className="hp-settings__label">{autostartLabel}</p>
            <p className="hp-settings__description">{autostartDescription}</p>
          </div>
          <ToggleSwitch checked={autostart} onToggle={onAutostartChange} />
        </div>
        <div className="hp-settings__row">
          <div className="hp-settings__copy">
            <p className="hp-settings__label">{confirmOnCloseLabel}</p>
            <p className="hp-settings__description">{confirmOnCloseDescription}</p>
          </div>
          <ToggleSwitch checked={confirmOnClose} onToggle={onConfirmOnCloseChange} />
        </div>
      </Card>
    </div>
  );
};

export default SettingsPanel;
