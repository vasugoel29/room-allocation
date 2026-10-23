import React, { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import { 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Check, 
  Calendar as CalendarIcon, 
  Filter, 
  Clock, 
  Shield, 
  GraduationCap, 
  Bell, 
  Layers, 
  BookmarkCheck, 
  Compass,
  CheckCircle2
} from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import { getRoleLabel } from '../../utils/roleUtils';
import { P, can, isAdmin as checkIsAdmin, teaches as checkTeaches } from '../../utils/permissions';

export default function InteractiveTutorial() {
  const { user, isTutorialOpen, completeTutorial } = useContext(AppContext);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const cardRef = useRef(null);

  const isAdmin = checkIsAdmin(user);
  const isFaculty = checkTeaches(user);
  const isStudentRep = !isAdmin && !isFaculty && (user?.role === 'STUDENT_REP' || can(user, P.BOOKINGS));

  // Build role-specific curriculum
  const steps = useMemo(() => {
    const roleBadge = getRoleLabel(user?.role || 'VIEWER');

    if (isAdmin) {
      return [
        {
          id: 'welcome-admin',
          target: null,
          title: `Welcome, ${user?.name || 'Administrator'}!`,
          badge: roleBadge,
          badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          icon: Shield,
          description: 'You have full administrative oversight of CRAS. This quick orientation highlights your core institutional management capabilities.',
          tip: 'Tip: You can re-open this orientation anytime from your Profile page.',
        },
        {
          id: 'admin-console',
          target: 'nav-admin',
          title: 'Admin Console & Overview',
          badge: 'System Control',
          badgeColor: 'bg-primary/10 text-primary-accent border-primary/20',
          icon: Shield,
          description: 'Access centralized oversight for all campus bookings, user access lists, live occupancy metrics, and audit logs.',
          tip: 'Use this tab to review real-time booking volume and resolve cross-department scheduling needs.',
        },
        {
          id: 'timetable-import',
          target: 'nav-timetable',
          title: 'Master Timetable Engine',
          badge: 'Automation',
          badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          icon: Clock,
          description: 'Upload Excel/CSV semester timetables to automatically provision recurring classes and teacher allocations across all blocks.',
          tip: 'Uploaded schedules automatically sync with classroom availability across the entire portal.',
        },
        {
          id: 'calendar-overview',
          target: 'calendar-grid',
          title: 'Global Classroom Occupancy',
          badge: 'Live Schedules',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CalendarIcon,
          description: 'Monitor daily and weekly room occupancy across campus. Admins can directly reserve or override any room slot.',
          tip: 'Emerald indicators represent available slots; purple shows active reservations.',
        },
        {
          id: 'notifications',
          target: 'notification-bell',
          title: 'Administrative Alerts & Log',
          badge: 'Alerts',
          badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: Bell,
          description: 'Stay updated on critical system events, access requests, and transfer resolution notices in real time.',
          tip: 'Click the bell icon anytime to inspect unread updates.',
        },
        {
          id: 'finish-admin',
          target: null,
          title: 'You are all set!',
          badge: 'Ready to Manage',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2,
          description: 'CRAS gives you comprehensive institutional control over room allocation and schedule synchronization.',
          tip: 'Enjoy using CRAS! Access your Profile whenever you need to revisit this tour.',
        }
      ];
    }

    if (isFaculty) {
      return [
        {
          id: 'welcome-faculty',
          target: null,
          title: `Welcome, Prof. ${user?.name || 'Faculty'}!`,
          badge: roleBadge,
          badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
          icon: GraduationCap,
          description: 'Welcome to your CRAS portal. Manage your teaching classes, cancel or reschedule lectures, and approve student room reservations.',
          tip: 'Tip: You can revisit this tutorial anytime from your Profile page.',
        },
        {
          id: 'faculty-portal',
          target: 'nav-faculty',
          title: 'Faculty Dashboard & Approvals',
          badge: 'Supervision',
          badgeColor: 'bg-primary/10 text-primary-accent border-primary/20',
          icon: GraduationCap,
          description: 'Review pending booking requests from student representatives seeking your supervision, as well as room transfer requests.',
          tip: 'Approve or reject requests with one click directly from this portal.',
        },
        {
          id: 'faculty-classes',
          target: 'nav-timetable',
          title: 'Teaching Timetable & Overrides',
          badge: 'Class Management',
          badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          icon: Clock,
          description: 'View your scheduled teaching lectures. If you need to cancel a class, mark it here to immediately release the classroom for campus use.',
          tip: 'Cancelling an unheld class frees up the room instantly for students and colleagues.',
        },
        {
          id: 'direct-booking',
          target: 'calendar-grid',
          title: 'Instant Room Reservations',
          badge: 'Direct Booking',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CalendarIcon,
          description: 'Faculty members enjoy direct booking privileges. Click any open slot to reserve a classroom instantly without waiting for approvals.',
          tip: 'Switch between Day and Week views in the header to check scheduling windows.',
        },
        {
          id: 'faculty-notifications',
          target: 'notification-bell',
          title: 'Real-Time Requests & Alerts',
          badge: 'Notifications',
          badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: Bell,
          description: 'Receive instant notifications whenever a student representative requests your faculty endorsement for a room reservation.',
          tip: 'Never miss an urgent venue endorsement request.',
        },
        {
          id: 'finish-faculty',
          target: null,
          title: 'Ready to Teach & Manage',
          badge: 'Setup Complete',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2,
          description: 'You now have full visibility into campus classrooms, your personal teaching schedule, and student supervisor workflows.',
          tip: 'Have a productive semester! Retake this tour anytime from your Profile.',
        }
      ];
    }

    if (isStudentRep) {
      return [
        {
          id: 'welcome-cr',
          target: null,
          title: `Welcome, ${user?.name || 'Representative'}!`,
          badge: roleBadge,
          badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: Compass,
          description: 'As a Student Representative, you can book classrooms for extra lectures, society events, and initiate room transfers.',
          tip: 'Tip: You can re-open this orientation whenever you want from your Profile.',
        },
        {
          id: 'cr-calendar',
          target: 'calendar-grid',
          title: 'Locate Available Classrooms',
          badge: 'Discovery',
          badgeColor: 'bg-primary/10 text-primary-accent border-primary/20',
          icon: CalendarIcon,
          description: 'Explore classroom availability by hour and day. Green badges indicate free rooms ready for reservation.',
          tip: 'Use the building and floor filters to quickly narrow down preferred venues.',
        },
        {
          id: 'cr-filters',
          target: 'room-filter',
          title: 'Filter Smart Classrooms',
          badge: 'Equipment Search',
          badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          icon: Filter,
          description: 'Filter rooms with AC and Projectors, select specific blocks, or find rooms matching your batch capacity.',
          tip: 'Toggle "AC & Projector Only" for presentation-ready spaces.',
        },
        {
          id: 'cr-booking',
          target: 'calendar-grid',
          title: 'Booking & Faculty Supervisor',
          badge: 'Reservation Workflow',
          badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          icon: BookmarkCheck,
          description: 'Click an available slot to book. Student requests require selecting an active Faculty Supervisor who endorses your session.',
          tip: 'Once your supervisor approves, the room is confirmed and marked reserved.',
        },
        {
          id: 'cr-transfers',
          target: 'nav-bookings',
          title: 'Room Transfers & History',
          badge: 'Swaps & Transfers',
          badgeColor: 'bg-tertiary/10 text-tertiary border-tertiary/20',
          icon: Layers,
          description: 'Need a classroom that is already booked? Initiate a room transfer request to swap slots with the current booking owner.',
          tip: 'Track all your active bookings, approvals, and transfer requests in this tab.',
        },
        {
          id: 'cr-notifications',
          target: 'notification-bell',
          title: 'Instant Approval Alerts',
          badge: 'Live Status',
          badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: Bell,
          description: 'Receive real-time notifications as soon as your faculty supervisor approves or updates your booking request.',
          tip: 'Check notifications whenever you submit a time-sensitive reservation.',
        },
        {
          id: 'finish-cr',
          target: null,
          title: 'All set to represent!',
          badge: 'Ready to Go',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2,
          description: 'You are now equipped to manage room allocations and event spaces for your batch efficiently.',
          tip: 'Remember: You can retake this walkthrough from the Profile screen at any time.',
        }
      ];
    }

    // Default: Student / Viewer
    return [
      {
        id: 'welcome-viewer',
        target: null,
        title: `Welcome to CRAS, ${user?.name || 'Student'}!`,
        badge: roleBadge,
        badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        icon: Compass,
        description: 'CRAS is your institutional portal to discover real-time classroom occupancy, find quiet study venues, and check your timetable.',
        tip: 'Tip: You can replay this interactive walkthrough at any time from your Profile.',
      },
      {
        id: 'viewer-calendar',
        target: 'calendar-grid',
        title: 'Real-Time Room Availability',
        badge: 'Room Schedules',
        badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        icon: CalendarIcon,
        description: 'See every classroom on campus organized by hour. Quickly spot vacant rooms for self-study, group discussions, or meetings.',
        tip: 'Slots are color coded: Green = Free, Purple = Booked, Blue = Scheduled Class.',
      },
      {
        id: 'viewer-filters',
        target: 'room-filter',
        title: 'Smart Search & Room Filters',
        badge: 'Discovery',
        badgeColor: 'bg-primary/10 text-primary-accent border-primary/20',
        icon: Filter,
        description: 'Easily filter by Building (e.g., 5th Block), Floor, or toggle "AC & Projector Only" to find comfortable working spaces.',
        tip: 'Use the quick search box to find any specific room by number.',
      },
      {
        id: 'viewer-timetable',
        target: 'nav-timetable',
        title: 'Class Timetable',
        badge: 'Academic Schedule',
        badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
        icon: Clock,
        description: 'Check your semester section timetable and class locations so you always know where your next lecture or lab is scheduled.',
        tip: 'Timetable schedules update automatically when faculty make rescheduling adjustments.',
      },
      {
        id: 'viewer-bookings-note',
        target: null,
        title: 'Reserving Classrooms',
        badge: 'Batch Bookings',
        badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
        icon: BookmarkCheck,
        description: 'Official room bookings for batch activities, guest lectures, or club events are submitted through your Student Representative (CR) or Faculty.',
        tip: 'Contact your Class Representative if you need a room reserved for a student group.',
      },
      {
        id: 'finish-viewer',
        target: null,
        title: 'You are all set!',
        badge: 'Orientation Complete',
        badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        icon: CheckCircle2,
        description: 'Explore the schedule, find empty rooms whenever you need them, and check your daily class locations with ease.',
        tip: 'Enjoy using CRAS! You can re-open this guide from your Profile at any time.',
      }
    ];
  }, [user, isAdmin, isFaculty, isStudentRep]);

  const currentStep = steps[currentStepIndex] || steps[0];

  // Update spotlight target bounding box
  const updateTargetRect = useCallback(() => {
    if (!currentStep?.target) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right
        });
        return;
      }
    }
    setTargetRect(null);
  }, [currentStep?.target]);

  useEffect(() => {
    if (!isTutorialOpen) {
      setCurrentStepIndex(0);
      setTargetRect(null);
      return;
    }
    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [isTutorialOpen, currentStepIndex, updateTargetRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!isTutorialOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        completeTutorial();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStepIndex < steps.length - 1) {
          setCurrentStepIndex(prev => prev + 1);
        } else {
          completeTutorial();
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentStepIndex > 0) {
          setCurrentStepIndex(prev => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTutorialOpen, currentStepIndex, steps.length, completeTutorial]);

  // Focus trap / manage
  useEffect(() => {
    if (isTutorialOpen && cardRef.current) {
      cardRef.current.focus();
    }
  }, [isTutorialOpen, currentStepIndex]);

  if (!isTutorialOpen) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;
  const StepIcon = currentStep.icon || Sparkles;

  // Determine card placement
  let cardPositionStyle = {};
  if (targetRect && typeof window !== 'undefined' && window.innerWidth >= 768) {
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceRight = window.innerWidth - targetRect.right;
    const spaceLeft = targetRect.left;

    if (spaceBelow > 320) {
      // Place below target
      cardPositionStyle = {
        top: Math.min(targetRect.bottom + 16, window.innerHeight - 340),
        left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 440)),
      };
    } else if (spaceRight > 420) {
      // Place to the right of target
      cardPositionStyle = {
        top: Math.max(16, Math.min(targetRect.top, window.innerHeight - 340)),
        left: targetRect.right + 16,
      };
    } else if (spaceLeft > 420) {
      // Place to the left of target
      cardPositionStyle = {
        top: Math.max(16, Math.min(targetRect.top, window.innerHeight - 340)),
        left: Math.max(16, targetRect.left - 436),
      };
    } else {
      cardPositionStyle = {};
    }
  }

  const isAnchored = Object.keys(cardPositionStyle).length > 0;

  return (
    <div 
      className="fixed inset-0 z-[120] pointer-events-auto overflow-hidden animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-step-title"
      aria-describedby="tutorial-step-desc"
    >
      {/* Dark overlay backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-300" 
        onClick={completeTutorial}
      />

      {/* Target element spotlight cutout / glowing focus ring */}
      {targetRect && (
        <div 
          className="absolute pointer-events-none transition-all duration-300 ease-out z-[121] rounded-2xl ring-4 ring-primary-accent ring-offset-4 ring-offset-transparent shadow-[0_0_40px_rgba(93,95,239,0.5)] animate-pulse"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tutorial Floating Card */}
      <div 
        className={`fixed z-[122] transition-all duration-300 ease-out p-4 ${
          isAnchored 
            ? 'w-full max-w-[420px]' 
            : 'inset-0 flex items-center justify-center p-4'
        }`}
        style={isAnchored ? cardPositionStyle : undefined}
      >
        <div 
          ref={cardRef}
          tabIndex={-1}
          className="relative w-full max-w-md bg-surface-low dark:bg-surface-mid border border-border/40 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5 animate-in zoom-in-95 duration-200 outline-none"
        >
          {/* Header Row: Badge, Step Counter, Close Button */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border tracking-wide font-display ${currentStep.badgeColor || 'bg-primary/10 text-primary-accent border-primary/20'}`}>
                {currentStep.badge}
              </span>
              <span className="text-[11px] font-bold text-text-secondary opacity-70 font-mono">
                {currentStepIndex + 1} / {steps.length}
              </span>
            </div>

            <button 
              onClick={completeTutorial}
              aria-label="Skip tutorial"
              className="p-1.5 rounded-xl hover:bg-surface-highest/20 text-text-secondary hover:text-text-primary transition-colors"
              title="Skip Tutorial"
            >
              <X size={18} />
            </button>
          </div>

          {/* Title & Icon */}
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-primary-accent/15 text-primary-accent flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <StepIcon size={22} />
            </div>
            <div className="space-y-1">
              <h3 id="tutorial-step-title" className="text-lg sm:text-xl font-black text-text-primary font-display tracking-tight leading-snug">
                {currentStep.title}
              </h3>
              <p id="tutorial-step-desc" className="text-xs sm:text-sm text-text-secondary font-medium leading-relaxed">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Practical Tip Callout */}
          {currentStep.tip && (
            <div className="p-3 rounded-2xl bg-surface-highest/10 border border-border/20 text-text-secondary text-xs font-semibold flex items-center gap-2">
              <Sparkles size={15} className="text-primary-accent shrink-0" />
              <span className="opacity-90">{currentStep.tip}</span>
            </div>
          )}

          {/* Step Progress Dots */}
          <div className="flex items-center justify-center gap-1.5 py-1">
            {steps.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStepIndex(idx)}
                aria-label={`Go to step ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStepIndex 
                    ? 'w-6 bg-primary-accent' 
                    : 'w-1.5 bg-surface-highest/30 hover:bg-surface-highest/60'
                }`}
              />
            ))}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/20">
            {/* Left Action: Skip or Back */}
            <div>
              {isFirstStep ? (
                <button
                  type="button"
                  onClick={completeTutorial}
                  className="px-3 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors font-display"
                >
                  Skip Tour
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentStepIndex(prev => prev - 1)}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-highest/15 transition-all font-display active:scale-95"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
            </div>

            {/* Right Action: Next or Finish */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isLastStep) {
                    completeTutorial();
                  } else {
                    setCurrentStepIndex(prev => prev + 1);
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-accent text-white text-xs font-bold font-display shadow-ambient hover:brightness-110 active:scale-95 transition-all"
              >
                <span>{isLastStep ? 'Get Started' : 'Next'}</span>
                {isLastStep ? <Check size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
