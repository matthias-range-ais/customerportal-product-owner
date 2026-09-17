import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.tsx';

describe('App', () => {
  it('renders the landing page', () => {
    render(<App />);

    expect(screen.getByText('customerportal-product-owner')).toBeInTheDocument();
    expect(screen.getByText('Grundgerüst läuft.')).toBeInTheDocument();
  });
});
