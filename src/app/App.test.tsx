import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the application heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /une base solide/i })).toBeInTheDocument();
  });

  it('increments the counter when the user activates the button', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId('counter-value')).toHaveTextContent('0');
    await user.click(screen.getByRole('button', { name: /incrémenter/i }));
    expect(screen.getByTestId('counter-value')).toHaveTextContent('1');
  });
});
