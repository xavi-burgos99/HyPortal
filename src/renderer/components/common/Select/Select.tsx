import React from 'react';
import classNames from 'classnames';
import './Select.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAngleDown } from '@fortawesome/free-solid-svg-icons';

type Option = {
  value: string;
  label: string;
};

type SelectProps = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  label?: string;
  options: Option[];
} & Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value' | 'multiple' | 'defaultValue' | 'onClick' | 'onKeyDown'
>;

const Select: React.FC<SelectProps> = ({ label, options, className, value, onChange, disabled, ...restProps }) => {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const selected = options.find((opt) => opt.value === value) ?? options[0];

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const emitChange = (nextValue: string) => {
    if (disabled) return;
    if (onChange) {
      const syntheticEvent = {
        target: { value: nextValue },
        currentTarget: { value: nextValue }
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <label className={classNames('hp-select', className, { 'hp-select--disabled': disabled })}>
      {label && <span className="hp-select__label">{label}</span>}
      <div
        ref={wrapperRef}
        className={classNames('hp-select__wrapper', { 'hp-select__wrapper--open': open })}
      >
        <button
          type="button"
          className="hp-select__field"
          onClick={() => !disabled && setOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen((prev) => !prev);
            }
            if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          {...(restProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          <span className="hp-select__value">{selected?.label ?? value}</span>
          <span className="hp-select__arrow">
            <FontAwesomeIcon icon={faAngleDown} />
          </span>
        </button>
        {open && (
          <div role="listbox" className="hp-select__options">
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                role="option"
                aria-selected={option.value === selected?.value}
                className={classNames('hp-select__option', {
                  'hp-select__option--active': option.value === selected?.value
                })}
                onClick={(e) => {
                  e.preventDefault();
                  emitChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
};

export default Select;
