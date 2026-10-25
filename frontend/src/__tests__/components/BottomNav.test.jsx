import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomNav from '../components/ui/BottomNav';
import { Calendar, User } from 'lucide-react';

describe('BottomNav Component', () => {
  const mockTabs = [
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  it('renders navigation tabs correctly', () => {
    render(
      <MemoryRouter>
        <BottomNav user={{ role: 'VIEWER' }} tabs={mockTabs} />
      </MemoryRouter>
    );

    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});
