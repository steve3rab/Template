import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LegalPage } from './LegalPage';

describe('LegalPage translations', () => {
  it('renders each legal page in English and keeps the navigation localized', () => {
    const onBack = vi.fn();
    const { rerender } = render(<LegalPage page="terms" language="en" onBack={onBack} />);
    expect(screen.getByRole('heading', { name: /terms and conditions of sale/i })).toBeInTheDocument();
    expect(screen.getByText(/template to be completed and reviewed/i)).toBeInTheDocument();
    expect(screen.getByText(/applicable consumer rights/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to shop/i }));
    expect(onBack).toHaveBeenCalledOnce();

    rerender(<LegalPage page="privacy" language="en" onBack={onBack} />);
    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByText(/data controller/i)).toBeInTheDocument();

    rerender(<LegalPage page="returns" language="en" onBack={onBack} />);
    expect(screen.getByRole('heading', { name: /delivery, returns and refunds/i })).toBeInTheDocument();
    expect(screen.getByText(/right of withdrawal/i)).toBeInTheDocument();
  });
});
