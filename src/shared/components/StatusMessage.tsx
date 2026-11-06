import type { HTMLAttributes, ReactNode } from 'react';

export type StatusTone = 'info' | 'success' | 'warning' | 'error';

export interface StatusMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  tone?: StatusTone;
  title?: string;
  children: ReactNode;
}

/** Consistent live-region feedback for form, network, and workflow outcomes. */
export function StatusMessage({
  tone = 'info',
  title,
  className,
  children,
  ...props
}: StatusMessageProps) {
  const isUrgent = tone === 'warning' || tone === 'error';
  const classes = ['ui-status-message', `ui-status-message--${tone}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...props}
      className={classes}
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
    >
      {title ? <strong className="ui-status-message__title">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}
