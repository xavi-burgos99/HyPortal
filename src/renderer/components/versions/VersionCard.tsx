import React from 'react';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import Card from '../common/Card/Card';
import Button from '../common/Button/Button';
import './VersionCard.scss';

export type Version = {
  id: string;
  name: string;
  channel: string;
  channelKey: 'stable' | 'pre-release' | 'unknown';
  size: string;
  date: string;
};

type VersionCardProps = {
  version: Version;
  onDelete?: (id: string) => void;
};

const VersionCard: React.FC<VersionCardProps> = ({ version, onDelete }) => {
  const { t } = useTranslation();

  return (
    <Card compact>
      <div>
        <p className={`hp-version-card__eyebrow hp-version-card__eyebrow--${version.channelKey}`}>{version.channel}</p>
        <h4 className="hp-version-card__title">{version.name}</h4>
        <p className="hp-version-card__meta">
          {t('versions.size', { size: version.size })} — {t('versions.date', { date: version.date })}
        </p>
      </div>
      <Button
        label={t('versions.actions.delete', { defaultValue: 'Delete' })}
        variant="ghost"
        iconLeft={faTrash}
        onClick={() => onDelete?.(version.id)}
      />
    </Card>
  );
};

export default VersionCard;
