import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import InteractiveTutorial from '../../components/tutorial/InteractiveTutorial';
import Profile from '../../pages/Profile';
import { renderWithContext, USERS } from '../utils/renderWithContext';

describe('InteractiveTutorial', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing when isTutorialOpen is false', () => {
    const { container } = renderWithContext(<InteractiveTutorial />, {
      ctx: { isTutorialOpen: false, user: USERS.VIEWER },
    });
    expect(container).toBeEmptyDOMElement();
  });

  describe('Role-Aware Curriculum', () => {
    it('presents Student / Viewer curriculum to a viewer user', async () => {
      const completeTutorial = vi.fn();
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.VIEWER, completeTutorial },
      });

      // Step 1: Welcome Viewer
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Student (Viewer)')).toBeInTheDocument();
      expect(screen.getByText(/Welcome to CRAS, Vik Viewer!/i)).toBeInTheDocument();

      // Advance to Step 2: Calendar & Room Availability
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Real-Time Room Availability')).toBeInTheDocument();

      // Advance to Step 3: Filters
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Smart Search & Room Filters')).toBeInTheDocument();

      // Advance to Step 4: Timetable
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Class Timetable')).toBeInTheDocument();

      // Advance to Step 5: Booking notes for viewer
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Reserving Classrooms')).toBeInTheDocument();
      expect(screen.getByText(/submitted through your Student Representative/i)).toBeInTheDocument();

      // Advance to Step 6: Completion
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('You are all set!')).toBeInTheDocument();

      // Click "Get Started"
      fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));
      expect(completeTutorial).toHaveBeenCalledTimes(1);
    });

    it('presents Student Representative curriculum with supervisor & transfer tips', async () => {
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.STUDENT_REP },
      });

      expect(screen.getByText('Student Representative')).toBeInTheDocument();
      expect(screen.getByText(/Welcome, Rita Rep!/i)).toBeInTheDocument();

      // Advance through CR steps
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Locate Available Classrooms')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Filter Smart Classrooms')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Booking & Faculty Supervisor')).toBeInTheDocument();
      expect(screen.getByText(/selecting an active Faculty Supervisor/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Room Transfers & History')).toBeInTheDocument();
      expect(screen.getByText(/Initiate a room transfer request to swap slots/i)).toBeInTheDocument();
    });

    it('presents Faculty curriculum highlighting overrides, portal & direct booking', async () => {
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.FACULTY },
      });

      expect(screen.getByText('Faculty Member')).toBeInTheDocument();
      expect(screen.getByText(/Welcome, Prof. Prof Fay!/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Faculty Dashboard & Approvals')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Teaching Timetable & Overrides')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Instant Room Reservations')).toBeInTheDocument();
      expect(screen.getByText(/direct booking privileges/i)).toBeInTheDocument();
    });

    it('presents Administrator curriculum highlighting console, import engine & oversight', async () => {
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.ADMIN },
      });

      expect(screen.getByText('Administrator')).toBeInTheDocument();
      expect(screen.getByText(/Welcome, Ada Admin!/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Admin Console & Overview')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Master Timetable Engine')).toBeInTheDocument();
      expect(screen.getByText(/Upload Excel\/CSV semester timetables/i)).toBeInTheDocument();
    });
  });

  describe('Interaction & Navigation', () => {
    it('supports Back button navigation', () => {
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.VIEWER },
      });

      // On step 1, "Back" is not shown (Skip Tour is shown instead)
      expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Skip Tour/i })).toBeInTheDocument();

      // Go to step 2
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Real-Time Room Availability')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();

      // Click Back
      fireEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(screen.getByText(/Welcome to CRAS/i)).toBeInTheDocument();
    });

    it('Skip button and X button call completeTutorial', () => {
      const completeTutorial = vi.fn();
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.VIEWER, completeTutorial },
      });

      // Skip Tour button
      fireEvent.click(screen.getByRole('button', { name: /Skip Tour/i }));
      expect(completeTutorial).toHaveBeenCalledTimes(1);

      // X button in header
      fireEvent.click(screen.getByRole('button', { name: /Skip tutorial/i }));
      expect(completeTutorial).toHaveBeenCalledTimes(2);
    });

    it('supports keyboard navigation: ArrowRight advances, ArrowLeft goes back, Escape completes', () => {
      const completeTutorial = vi.fn();
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.VIEWER, completeTutorial },
      });

      // ArrowRight advances
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('Real-Time Room Availability')).toBeInTheDocument();

      // ArrowLeft goes back
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText(/Welcome to CRAS/i)).toBeInTheDocument();

      // Escape completes
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(completeTutorial).toHaveBeenCalledTimes(1);
    });

    it('navigates to steps directly via progress dots', () => {
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.VIEWER },
      });

      const dot3 = screen.getByRole('button', { name: 'Go to step 3' });
      fireEvent.click(dot3);
      expect(screen.getByText('Smart Search & Room Filters')).toBeInTheDocument();
    });

    it('toggles screen peek mode to collapse and restore the tutorial card', () => {
      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.VIEWER },
      });

      // Initially full card is shown
      expect(screen.getByRole('button', { name: /Peek at screen/i })).toBeInTheDocument();

      // Click Peek
      fireEvent.click(screen.getByRole('button', { name: /Peek at screen/i }));

      // Minimized pill is visible
      expect(screen.getByRole('button', { name: /Expand tutorial card/i })).toBeInTheDocument();
      expect(screen.getByText(/Screen Peek Mode/i)).toBeInTheDocument();

      // Click to restore
      fireEvent.click(screen.getByRole('button', { name: /Expand tutorial card/i }));
      expect(screen.getByRole('button', { name: /Peek at screen/i })).toBeInTheDocument();
    });
  });

  describe('Mobile Quick Booking Step', () => {
    it('shows plus button booking step for student rep on mobile viewport', () => {
      window.innerWidth = 480;
      window.dispatchEvent(new Event('resize'));

      renderWithContext(<InteractiveTutorial />, {
        ctx: { isTutorialOpen: true, user: USERS.STUDENT_REP },
      });

      // Advance to Step 4
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // On mobile, step 4 should be the plus button step
      expect(screen.getByText('Quick Booking via Plus (+)')).toBeInTheDocument();
      expect(screen.getByText(/tap the large '\+' button in the bottom navigation/i)).toBeInTheDocument();

      // Restore window size
      window.innerWidth = 1280;
      window.dispatchEvent(new Event('resize'));
    });
  });

  describe('Cross-Tab Route Synchronization', () => {
    it('automatically navigates to /calendar when tutorial is started from /profile', async () => {
      const { useLocation } = await import('react-router-dom');
      const LocationProbe = () => {
        const location = useLocation();
        return <div data-testid="location-probe">{location.pathname}</div>;
      };

      renderWithContext(
        <>
          <LocationProbe />
          <InteractiveTutorial />
        </>,
        {
          route: '/profile',
          ctx: { isTutorialOpen: true, user: USERS.VIEWER },
        }
      );

      expect(screen.getByTestId('location-probe')).toHaveTextContent('/calendar');
    });

    it('navigates to /calendar when an admin tutorial step requires the calendar tab', async () => {
      const { useLocation } = await import('react-router-dom');
      const LocationProbe = () => {
        const location = useLocation();
        return <div data-testid="location-probe">{location.pathname}</div>;
      };

      renderWithContext(
        <>
          <LocationProbe />
          <InteractiveTutorial />
        </>,
        {
          route: '/admin',
          ctx: { isTutorialOpen: true, user: USERS.ADMIN },
        }
      );

      // Initially on /admin
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin');

      // Step 2: admin console (/admin)
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin');

      // Step 3: timetable import (/admin)
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin');

      // Step 4: calendar overview (/calendar)
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/calendar');
    });
  });

  describe('Profile Page Integration', () => {
    it('triggers startTutorial when clicking Revisit App Tutorial button in Profile', async () => {
      const startTutorial = vi.fn();
      renderWithContext(<Profile />, {
        ctx: { user: USERS.VIEWER, startTutorial },
      });

      const replayBtn = screen.getByRole('button', { name: /Revisit App Tutorial/i });
      expect(replayBtn).toBeInTheDocument();

      fireEvent.click(replayBtn);
      expect(startTutorial).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mobile Sidebar Coordination', () => {
    it('automatically opens sidebar on mobile when reaching room-filter step and closes on complete', () => {
      window.innerWidth = 480;
      window.dispatchEvent(new Event('resize'));
      const setIsSidebarOpen = vi.fn();

      const { unmount } = renderWithContext(
        <InteractiveTutorial isSidebarOpen={false} setIsSidebarOpen={setIsSidebarOpen} />,
        {
          ctx: { isTutorialOpen: true, user: USERS.STUDENT_REP },
        }
      );

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      // Step 2 -> Step 3 (Filter Smart Classrooms)
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText('Filter Smart Classrooms')).toBeInTheDocument();
      expect(setIsSidebarOpen).toHaveBeenCalledWith(true);

      // Complete / skip tour closes sidebar
      fireEvent.click(screen.getByRole('button', { name: /Skip tutorial/i }));
      expect(setIsSidebarOpen).toHaveBeenCalledWith(false);

      unmount();
      window.innerWidth = 1280;
      window.dispatchEvent(new Event('resize'));
    });
  });
});
