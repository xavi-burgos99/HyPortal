import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCirclePlay, faCircleStop } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import Card from '../common/Card/Card';
import Button from '../common/Button/Button';
import Badge from '../common/Badge/Badge';
import './ServerCard.scss';

export type ServerStatus = 'running' | 'stopped';

export type Server = {
  id: string;
  name: string;
  version: string;
  status: ServerStatus;
  statusSince: number;
  port: number;
  path: string;
  imageKey: string;
};

export type ImageAsset = {
  key: string;
  src: string;
  label: string;
};

type ServerCardProps = {
  server: Server;
  onView?: (id: string) => void;
  onToggle?: (id: string) => void;
  images: ImageAsset[];
  hasNewVersion?: boolean;
};

const ServerCard: React.FC<ServerCardProps> = ({ server, onView, onToggle, images, hasNewVersion }) => {
  const { t } = useTranslation();
  const isRunning = server.status === 'running';
  const currentImage = images.find((img) => img.key === server.imageKey) ?? images[0];

  return (
    <Card className="hp-server-card hp-server-card--compact" onClick={() => onView?.(server.id)}>
      <div className="hp-server-card__compact">
        <div className="hp-server-card__image-square">
          {currentImage && <img src={currentImage.src} alt={currentImage.label} className="hp-server-card__image-thumb" />}
        </div>
        <div className="hp-server-card__info">
          <div className="hp-server-card__header">
            <div>
              <h4 className="hp-server-card__title">{server.name}</h4>
              <p className="hp-server-card__version">
                {t('servers.version', { version: server.version })}
              </p>
            </div>
          </div>
          <div className="hp-server-card__actions">
            <Button
              label={isRunning ? t('servers.actions.stop') : t('servers.actions.start')}
              variant="primary"
              iconLeft={isRunning ? faCircleStop : faCirclePlay}
              style={{
                background: isRunning ? 'linear-gradient(135deg, #ff8b7f, #ff5f52)' : 'linear-gradient(135deg, #5af29b, #3bd879)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.(server.id);
              }}
            />
          </div>
        </div>
      </div>
      {hasNewVersion && (
        <Badge className="hp-server-card__badge">
          {t('servers.newVersionTag', { defaultValue: 'New version' })}
        </Badge>
      )}
    </Card>
  );
};

export default ServerCard;
