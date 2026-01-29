import React from 'react';
import classNames from 'classnames';
import './ToggleSwitch.scss';

type ToggleSwitchProps = {
  label?: string;
  description?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'>;

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  description,
  checked,
  onToggle,
  className,
  ...props
}) => {
  return (
    <label className={classNames('hp-toggle', className)}>
      <div className="hp-toggle__copy">
        {label && <span className="hp-toggle__label">{label}</span>}
        {description && <span className="hp-toggle__description">{description}</span>}
      </div>
      <div className="hp-toggle__control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          {...props}
        />
        <span className="hp-toggle__slider" />
      </div>
    </label>
  );
};

export default ToggleSwitch;
