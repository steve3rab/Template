import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('shared Button', () => {
  it('renders a semantic button and forwards native attributes', () => {
    render(<Button type="submit" name="save" value="yes">Enregistrer</Button>);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button')).toHaveAttribute('name', 'save');
  });

  it('prevents duplicate interaction while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button loading loadingLabel="Enregistrement… " onClick={onClick}>Enregistrer</Button>);

    const button = screen.getByRole('button', { name: /enregistrement/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports variants, sizes, custom classes, and disabled state', () => {
    render(<Button variant="danger" size="small" className="custom" disabled>Supprimer</Button>);
    const button = screen.getByRole('button', { name: 'Supprimer' });
    expect(button).toHaveClass('ui-button--danger', 'ui-button--small', 'custom');
    expect(button).toBeDisabled();
  });
});
