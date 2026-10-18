import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthenticatedLogisticsApp } from '../src/auth/AuthenticatedLogisticsApp';

describe('authenticated logistics application boundary (no auth)', () => {
  it('renders the operational application without requiring panel session', async () => {
    render(<AuthenticatedLogisticsApp><div>Рабочая область логистики</div></AuthenticatedLogisticsApp>);
    expect(await screen.findByText('Рабочая область логистики')).toBeVisible();
  });
});
