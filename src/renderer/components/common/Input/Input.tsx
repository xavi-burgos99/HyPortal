import React from 'react';
import classNames from 'classnames';
import './Input.scss';

type InputProps = {
  label?: string;
  description?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

const Input: React.FC<InputProps> = ({ label, description, className, ...props }) => {
  return (
    <label className={classNames('hp-input', className)}>
      {label && <span className="hp-input__label">{label}</span>}
      <input className="hp-input__field" {...props} />
      {description && <span className="hp-input__description">{description}</span>}
    </label>
  );
};

export default Input;
