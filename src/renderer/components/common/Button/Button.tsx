import React from 'react';
import classNames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import './Button.scss';

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'surface' | 'danger';

type ButtonProps = {
  label: string | IconDefinition;
  variant?: ButtonVariant;
  iconLeft?: IconDefinition;
  iconRight?: IconDefinition;
  buttonRef?: React.Ref<HTMLButtonElement>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'surface',
  iconLeft,
  iconRight,
  className,
  buttonRef,
  ...props
}) => {
  const buttonClass = classNames('hp-button', `hp-button--${variant}`, className);

  return (
    <button className={buttonClass} ref={buttonRef} {...props}>
      {iconLeft && <FontAwesomeIcon icon={iconLeft} className="hp-button__icon hp-button__icon--left" />}
      <span className="hp-button__label">
        {typeof label === 'string' ? label : <FontAwesomeIcon icon={label} />}
      </span>
      {iconRight && (
        <FontAwesomeIcon icon={iconRight} className="hp-button__icon hp-button__icon--right" />
      )}
    </button>
  );
};

export default Button;
