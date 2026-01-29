import React from 'react';
import classNames from 'classnames';
import Card from '../common/Card/Card';
import Input from '../common/Input/Input';
import './ServerDetail.scss';
import type { ImageAsset, Server } from './ServerCard';
import { useTranslation } from 'react-i18next';
import { faPencil } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from '../common/Button/Button';
import Select from '../common/Select/Select';
import ToggleSwitch from '../common/ToggleSwitch/ToggleSwitch';
import { DEFAULT_MEMORY_STEP, LOW_MEMORY_STEP, MEMORY_STEPS, clampMemoryStep, memoryLabel } from '../../utils/serverSettings';

type ServerRuntimeSettings = {
  memoryStep: number;
  disableSentry: boolean;
  useAotCache: boolean;
};

type ServerDetailProps = {
  server: Server | null;
  draft: Server | null;
  runtime: ServerRuntimeSettings | null;
  runtimeDraft: ServerRuntimeSettings | null;
  images: ImageAsset[];
  isEditing: boolean;
  versionOptions: string[];
  onChangeDraft: (changes: Partial<Server>) => void;
  onChangeRuntimeDraft: (changes: Partial<ServerRuntimeSettings>) => void;
  onImageChange: (imageKey: string) => void;
  lowMemoryWarningDismissed: boolean;
  onMemorySliderCommit?: (memoryStep: number) => void;
  onRequestDelete?: (serverId: string) => void;
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const units = [
    { value: days, label: 'd' },
    { value: hours, label: 'h' },
    { value: minutes, label: 'm' },
    { value: seconds, label: 's' }
  ];

  const parts: string[] = [];
  for (const unit of units) {
    if (unit.value > 0 || (unit.label === 's' && parts.length === 0)) {
      parts.push(`${unit.value}${unit.label}`);
    }
    if (parts.length === 2) break;
  }

  return parts.join(' ');
};

const ServerDetail: React.FC<ServerDetailProps> = ({
  server,
  draft,
  runtime,
  runtimeDraft,
  images,
  isEditing,
  versionOptions,
  onChangeDraft,
  onChangeRuntimeDraft,
  onImageChange,
  onRequestDelete,
  onMemorySliderCommit
}) => {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerAreaRef = React.useRef<HTMLDivElement | null>(null);
  const [now, setNow] = React.useState(Date.now());

  const model = (isEditing && draft) || server;
  const currentImage = model ? images.find((img) => img.key === model.imageKey) ?? images[0] : undefined;
  const runtimeModel =
    (isEditing && runtimeDraft) || runtime || { memoryStep: DEFAULT_MEMORY_STEP, disableSentry: false, useAotCache: true };
  const lastSliderStepRef = React.useRef(runtimeDraft?.memoryStep ?? runtimeModel.memoryStep ?? DEFAULT_MEMORY_STEP);

  React.useEffect(() => {
    lastSliderStepRef.current = runtimeDraft?.memoryStep ?? runtimeModel.memoryStep ?? DEFAULT_MEMORY_STEP;
  }, [runtimeDraft?.memoryStep, runtimeModel.memoryStep]);
  const handleSliderCommit = React.useCallback(() => {
    if (typeof onMemorySliderCommit === 'function') {
      onMemorySliderCommit(lastSliderStepRef.current);
    }
  }, [onMemorySliderCommit]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!pickerAreaRef.current) return;
      if (pickerOpen && !pickerAreaRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  React.useEffect(() => {
    setPickerOpen(false);
  }, [model?.id, isEditing]);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    setNow(Date.now());
  }, [model?.statusSince, model?.status, model?.id]);

  if (!model) {
    return (
      <Card>
        <p className="hp-server-detail__empty">{t('servers.detail.empty')}</p>
      </Card>
    );
  }

  const statusSince = model.statusSince ?? Date.now();
  const statusDurationLabel =
    model.status === 'running'
      ? t('servers.status.runningFor', { time: formatDuration(now - statusSince) })
      : t('servers.status.stoppedFor', { time: formatDuration(now - statusSince) });

  return (
    <Card className="hp-server-detail">
      <div className="hp-server-detail__summary">
        <div className="hp-server-detail__visual-wrap" ref={pickerAreaRef}>
          <div
            className={classNames('hp-server-detail__visual', {
              'hp-server-detail__visual--readonly': !isEditing
            })}
            role={isEditing ? 'button' : undefined}
            tabIndex={isEditing ? 0 : -1}
            aria-disabled={!isEditing}
            onClick={() => {
              if (!isEditing) return;
              setPickerOpen((prev) => !prev);
            }}
            onKeyDown={(event) => {
              if (!isEditing) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPickerOpen((prev) => !prev);
              }
            }}
          >
            {currentImage && <img src={currentImage.src} alt={currentImage.label} className="hp-server-detail__image" />}
            {isEditing && (
              <div className="hp-server-detail__visual-edit">
                <span><FontAwesomeIcon icon={faPencil} /></span>
              </div>
            )}
          </div>
          {pickerOpen && isEditing && (
            <div className="hp-server-detail__image-picker">
              <p className="hp-server-detail__image-title">{t('servers.detail.imagePickerTitle')}</p>
              <div className="hp-server-detail__image-grid">
                {images.map((img) => (
                  <button
                    type="button"
                    key={img.key}
                    className={classNames('hp-server-detail__image-option', {
                      'hp-server-detail__image-option--active': img.key === model.imageKey
                    })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onImageChange(img.key);
                      setPickerOpen(false);
                    }}
                  >
                    <img src={img.src} alt={img.label} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hp-server-detail__meta">
          <div className="hp-server-detail__title-row">
            {isEditing ? (
              <Input
                label={t('servers.detail.labels.name')}
                value={draft?.name ?? ''}
                onChange={(event) => onChangeDraft({ name: event.target.value })}
              />
            ) : (
              <>
                <div>
                  <h3 className="hp-server-detail__title">{model.name}</h3>
                </div>
                <p className="hp-server-detail__status">{statusDurationLabel}</p>
              </>
            )}
          </div>

          <div className="hp-server-detail__grid">
            <div className="hp-server-detail__field">
              <p className="hp-server-detail__label">{t('servers.detail.labels.version')}</p>
              {isEditing ? (
                <Select
                  value={draft?.version ?? ''}
                  onChange={(event) => onChangeDraft({ version: event.target.value })}
                  options={versionOptions.map((value) => ({ value, label: value }))}
                />
              ) : (
                <p className="hp-server-detail__value">{t('servers.version', { version: model.version })}</p>
              )}
            </div>
            <div className="hp-server-detail__field">
              <p className="hp-server-detail__label">{t('servers.detail.labels.port')}</p>
              {isEditing ? (
                <Input
                  type="number"
                  value={draft?.port ?? 0}
                  onChange={(event) => onChangeDraft({ port: Number(event.target.value) || 0 })}
                />
              ) : (
                <p className="hp-server-detail__value">{model.port}</p>
              )}
            </div>
            <div className="hp-server-detail__field hp-server-detail__field--wide">
              <div className="hp-server-detail__label-row">
                <p className="hp-server-detail__label">
                  {t('servers.detail.labels.memory')}
                  <span className="hp-server-detail__value-inline" style={{ marginLeft: '12px' }}>
                    {memoryLabel(runtimeDraft?.memoryStep ?? runtimeModel.memoryStep ?? DEFAULT_MEMORY_STEP)}
                  </span>
                </p>
              </div>
              {isEditing ? (
                <div className="hp-server-detail__slider">
                  <input
                    type="range"
                    min={MEMORY_STEPS[0].step}
                    max={MEMORY_STEPS[MEMORY_STEPS.length - 1].step}
                    step={1}
                    value={runtimeDraft?.memoryStep ?? runtimeModel.memoryStep ?? DEFAULT_MEMORY_STEP}
                    onChange={(event) => {
                      const next = clampMemoryStep(Number(event.target.value));
                      onChangeRuntimeDraft({ memoryStep: next });
                      lastSliderStepRef.current = next;
                    }}
                    onMouseUp={handleSliderCommit}
                    onTouchEnd={handleSliderCommit}
                    onKeyUp={(event) => {
                      const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
                      if (keys.includes(event.key)) {
                        handleSliderCommit();
                      }
                    }}
                  />
                  <div className="hp-server-detail__slider-scale">
                    <span>{memoryLabel(MEMORY_STEPS[0].step)}</span>
                    <span>{memoryLabel(MEMORY_STEPS[MEMORY_STEPS.length - 1].step)}</span>
                  </div>
                </div>
              ) : (
                <></>
              )}
            </div>
            {isEditing ? '' : (
              <div className="hp-server-detail__field hp-server-detail__field--wide">
                <p className="hp-server-detail__label" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {t('servers.detail.labels.path')}
                  <span className="hp-server-detail__value-inline hp-server-detail__mono" title={model.path}
                    style={{ marginLeft: '12px' }}>
                    {model.path}
                  </span>
                </p>
              </div>
            )}
          </div>

          {isEditing && (
            <div className="hp-server-detail__toggles">
              <ToggleSwitch
                label={t('servers.detail.labels.aotCache')}
                checked={runtimeModel.useAotCache !== false}
                onToggle={(checked) => onChangeRuntimeDraft({ useAotCache: checked })}
              />
              <ToggleSwitch
                label={t('servers.detail.labels.disableSentry')}
                checked={runtimeModel.disableSentry}
                onToggle={(checked) => onChangeRuntimeDraft({ disableSentry: checked })}
              />
            </div>
          )}

          {!isEditing && runtimeModel.disableSentry && (
            <p className="hp-server-detail__notice hp-server-detail__notice--amber">
              {t('servers.detail.sentryDisabled', {
                defaultValue: 'Sentry esta desactivado (--disable-sentry)'
              })}
            </p>
          )}

          {isEditing && (
            <div>
              <Button
                label={t('servers.actions.deleteServer')}
                variant="danger"
                onClick={() => onRequestDelete?.(model.id)}
                disabled={!onRequestDelete}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ServerDetail;
