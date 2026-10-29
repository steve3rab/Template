import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the application heading in the active language', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /une base solide|a solid foundation/i }),
    ).toBeInTheDocument();
  });

  it('switches the interface language and updates the document language', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: /a solid foundation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increment/i })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('template-react-language')).toBe('en');

    await user.click(screen.getByRole('button', { name: 'French' }));
    expect(screen.getByRole('heading', { name: /une base solide/i })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('increments the counter in the active language', async () => {
    const user = userEvent.setup();
    render(<App />);

    const incrementButton = screen.getByRole('button', { name: /incrémenter|increment/i });
    expect(screen.getByTestId('counter-value')).toHaveTextContent('0');
    await user.click(incrementButton);
    expect(screen.getByTestId('counter-value')).toHaveTextContent('1');
  });
});
