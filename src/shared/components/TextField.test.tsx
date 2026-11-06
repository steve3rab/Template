import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from './TextField';

describe('shared TextField', () => {
  it('associates the visible label with the input and forwards input attributes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Adresse e-mail" name="email" type="email" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Adresse e-mail' });
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('type', 'email');
    await user.type(input, 'test@example.com');
    expect(onChange).toHaveBeenCalled();
  });

  it('connects hint and error text to the field and marks invalid state', () => {
    render(
      <TextField
        id="password"
        label="Mot de passe"
        type="password"
        required
        hint="12 caractères minimum"
        error="Mot de passe trop court"
      />,
    );
    const input = screen.getByLabelText('Mot de passe *');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'password-hint password-error');
    expect(screen.getByText('12 caractères minimum')).toHaveAttribute('id', 'password-hint');
    expect(screen.getByText('Mot de passe trop court')).toHaveAttribute('id', 'password-error');
    expect(input).toBeRequired();
  });

  it('supports a custom id and does not announce absent error details', () => {
    render(<TextField id="city" label="Ville" />);
    expect(screen.getByLabelText('Ville')).toHaveAttribute('id', 'city');
    expect(screen.getByLabelText('Ville')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('Ville')).not.toHaveAttribute('aria-invalid');
  });
});
