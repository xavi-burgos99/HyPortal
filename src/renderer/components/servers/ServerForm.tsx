import React, { useEffect, useMemo, useState } from 'react';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import Input from '../common/Input/Input';
import Select from '../common/Select/Select';
import Button from '../common/Button/Button';
import './ServerForm.scss';
import { DEFAULT_MEMORY_STEP } from '../../utils/serverSettings';

export type ServerFormValues = {
  name: string;
  version: string;
  port: number;
  path: string;
  memoryStep: number;
};

type ServerFormProps = {
  versionOptions: string[];
  onSubmit: (values: ServerFormValues) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
  existingNames: string[];
  defaultServersDir?: string;
  onGeneratePath?: (name: string) => Promise<string>;
  onBrowsePath?: () => Promise<string | null>;
  onValidatePath?: (path: string) => Promise<string | null>;
};

const ServerForm: React.FC<ServerFormProps> = ({
  versionOptions,
  onSubmit,
  onCancel,
  existingNames,
  defaultServersDir,
  onGeneratePath,
  onBrowsePath,
  onValidatePath
}) => {
  const { t } = useTranslation();
  const normalizedVersionOptions = useMemo(
    () => (versionOptions.length ? versionOptions : ['0.18.0-beta']),
    [versionOptions]
  );
  const [values, setValues] = useState<ServerFormValues>(() => ({
    name: '',
    version: normalizedVersionOptions[0] ?? '0.18.0-beta',
    port: 5520,
    path: defaultServersDir ?? '',
    memoryStep: DEFAULT_MEMORY_STEP
  }));
  const [isCustomPath, setIsCustomPath] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    setValues((prev) => {
      if (normalizedVersionOptions.includes(prev.version)) return prev;
      const fallbackVersion = normalizedVersionOptions[0] ?? prev.version;
      return { ...prev, version: fallbackVersion };
    });
  }, [normalizedVersionOptions]);

  useEffect(() => {
    if (!defaultServersDir) return;
    setValues((prev) => (prev.path ? prev : { ...prev, path: defaultServersDir }));
  }, [defaultServersDir]);

  useEffect(() => {
    if (!onGeneratePath || isCustomPath) return;
    const trimmed = values.name.trim();
    if (!trimmed) {
      if (defaultServersDir) {
        setValues((prev) => ({ ...prev, path: defaultServersDir }));
      }
      return;
    }
    let cancelled = false;
    onGeneratePath(trimmed)
      .then((path) => {
        if (!cancelled) {
          setValues((prev) => ({ ...prev, path }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [values.name, isCustomPath, onGeneratePath, defaultServersDir]);

  const handleBrowsePath = async () => {
    if (!onBrowsePath) return;
    const selected = await onBrowsePath();
    if (selected) {
      setIsCustomPath(true);
      setValues((prev) => ({ ...prev, path: selected }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const trimmedName = values.name.trim();
    const nameTaken = existingNames.some((n) => n.toLowerCase() === trimmedName.toLowerCase());
    if (!trimmedName) {
      setError(t('serversErrors.nameRequired'));
      return;
    }
    if (nameTaken) {
      setError(t('serversErrors.duplicateName'));
      return;
    }
    if (!values.path) {
      setError(t('serversErrors.pathRequired'));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (onValidatePath) {
        const validationError = await onValidatePath(values.path);
        if (validationError) {
          setError(validationError);
          setSubmitting(false);
          return;
        }
      }
      try {
        const result = await onSubmit({ ...values, name: trimmedName });
        if (result?.success === false && result.error) {
          setError(result.error);
        }
      } catch {
        setError(t('serversErrors.createFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="hp-server-form" onSubmit={handleSubmit}>
      <div className="hp-server-form__grid">
        <Input
          label={t('servers.detail.labels.name', { defaultValue: 'Name' })}
          value={values.name}
          required
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
        <Select
          label={t('servers.detail.labels.version', { defaultValue: 'Version' })}
          value={values.version}
          onChange={(e) => setValues({ ...values, version: e.target.value })}
          options={normalizedVersionOptions.map((value) => ({ value, label: value }))}
        />
        <Input
          label={t('servers.detail.labels.port', { defaultValue: 'Port' })}
          type="number"
          value={values.port}
          onChange={(e) => setValues({ ...values, port: Number(e.target.value) })}
        />
        <div className="hp-server-form__path-row">
          <div style={{flex: "1 1 0"}}>
            <Input
              label={t('servers.detail.labels.path', { defaultValue: 'Path' })}
              value={values.path}
              readOnly
              placeholder="C:/Hytale/servers/server-name"
            />
          </div>
          <Button
            type="button"
            variant="surface"
            label={faFolderOpen}
            onClick={handleBrowsePath}
            style={{ height: '37px' }}
          />
        </div>
      </div>
      {error && <p className="hp-server-form__error">{error}</p>}
      <div className="hp-server-form__actions">
        <Button type="button" label={t('servers.actions.cancel')} variant="ghost" onClick={onCancel} disabled={submitting} />
        <Button
          type="submit"
          label={t('servers.actions.createServer', { defaultValue: 'Create server' })}
          variant="primary"
          disabled={submitting}
        />
      </div>
    </form>
  );
};

export default ServerForm;
