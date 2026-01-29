import React from 'react';
import classNames from 'classnames';
import Button from '../Button/Button';
import './Modal.scss';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

type ModalProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
};

const Modal: React.FC<ModalProps> = ({ title, description, isOpen, onClose, children, footer, size = 'md' }) => {
  if (!isOpen) return null;

  return (
    <div className="hp-modal">
      <div className="hp-modal__backdrop" onClick={onClose} />
      <div className={classNames('hp-modal__dialog', `hp-modal__dialog--${size}`)}>
        <div className="hp-modal__header">
          <div>
            <h3 className="hp-modal__title">{title}</h3>
            {description && <p className="hp-modal__description">{description}</p>}
          </div>
          <Button label={faXmark} variant="ghost" onClick={onClose} style={{transform: "translate(10px, -10px)"}} />
        </div>
        <div className="hp-modal__body">{children}</div>
        {footer && <div className="hp-modal__footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
