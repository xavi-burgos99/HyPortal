import React from 'react';
import './BlockingOverlay.scss';
import Button from '../Button/Button';

type BlockingOverlayProps = {
  active: boolean;
  message: string;
  onCancel?: () => void;
  cancelLabel?: string;
};

const BlockingOverlay: React.FC<BlockingOverlayProps> = ({ active, message, onCancel, cancelLabel = 'Cancel' }) => {
  if (!active) return null;

  return (
    <div className="hp-blocking-overlay">
      <div className="hp-blocking-overlay__panel">
        <p className="hp-blocking-overlay__message">{message}</p>
        {onCancel && (
          <div className="hp-blocking-overlay__actions">
            <Button label={cancelLabel} variant="ghost" onClick={onCancel} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockingOverlay;
