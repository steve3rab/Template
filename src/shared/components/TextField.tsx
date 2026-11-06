import { useId, type InputHTMLAttributes } from 'react';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'aria-describedby' | 'aria-invalid'
> {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
}

/** Labelled text input with consistent hint/error association and accessible validation state. */
export function TextField({
  label,
  hint,
  error,
  id,
  className,
  required,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const inputClassName = ['ui-text-field__input', error && 'is-invalid', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ui-text-field">
      <label className="ui-text-field__label" htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        {...inputProps}
        id={inputId}
        className={inputClassName}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p className="ui-text-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-text-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
