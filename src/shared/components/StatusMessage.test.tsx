import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusMessage } from './StatusMessage';

describe('shared StatusMessage', () => {
  it.each([
    ['info', 'status', 'polite'],
    ['success', 'status', 'polite'],
    ['warning', 'alert', 'assertive'],
    ['error', 'alert', 'assertive'],
  ] as const)('announces %s messages with the appropriate live region', (tone, role, live) => {
    render(<StatusMessage tone={tone}>Opération terminée</StatusMessage>);
    expect(screen.getByRole(role)).toHaveTextContent('Opération terminée');
    expect(screen.getByRole(role)).toHaveAttribute('aria-live', live);
  });

  it('renders an optional title and forwards custom attributes', () => {
    render(<StatusMessage title="Attention" data-testid="notice">Détail</StatusMessage>);
    expect(screen.getByTestId('notice')).toHaveTextContent('Attention');
    expect(screen.getByTestId('notice')).toHaveTextContent('Détail');
  });
});
