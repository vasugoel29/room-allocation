Here is a complete Product Requirements Document (PRD) in Markdown format.

You can copy this directly into a .md file (e.g., room-allocation-prd.md).

⸻

📘 Product Requirements Document (PRD)

Campus Room Allocation & Scheduling System

⸻

1. Overview

1.1 Product Name

Campus Room Allocation System (CRAS)

1.2 Problem Statement

The university currently operates on a fixed static timetable for room allocation. However, frequent rescheduling of classes is handled informally via WhatsApp groups, leading to:
	•	Booking conflicts
	•	Double allocations
	•	Lack of transparency
	•	No historical tracking
	•	Manual coordination overhead

There is no centralized, real-time system to manage room availability and booking.

⸻

1.3 Objective

Build a centralized web application that:
	•	Displays weekly room availability in hourly slots
	•	Allows student representatives to book and reschedule rooms
	•	Prevents booking conflicts automatically
	•	Filters rooms by attributes (AC, projector, capacity, etc.)
	•	Provides a reliable, transparent scheduling system

⸻

2. Users & Roles

2.1 User Roles

1. Student Representative
	•	Can book rooms
	•	Can reschedule bookings
	•	Can cancel bookings
	•	Can view all bookings
	•	Can filter/search available rooms

2. Viewer (Default Role)
	•	Can view weekly schedule
	•	Can filter/search rooms
	•	Cannot modify bookings

⸻

3. Product Scope

3.1 In Scope (MVP)
	•	Weekly calendar view
	•	Hourly time slots
	•	Real-time availability display
	•	Room booking
	•	Booking rescheduling
	•	Conflict prevention
	•	Attribute-based filtering
	•	Basic authentication
	•	Booking history tracking

⸻

3.2 Out of Scope (Phase 1)
	•	Admin approval workflows
	•	Multi-campus support
	•	Payment integration
	•	Equipment booking beyond rooms
	•	AI-based scheduling optimization

⸻

4. Functional Requirements

⸻

4.1 Weekly Calendar View
	•	Display week (Mon–Sat)
	•	Show hourly slots (configurable, default 8 AM – 6 PM)
	•	Show:
	•	Booked slots (room name + booking owner)
	•	Available slots
	•	Color-coded visualization

⸻

4.2 Room Search & Filtering

Users can filter rooms by:
	•	Capacity
	•	AC (Yes/No)
	•	Projector (Yes/No)
	•	Building (optional)
	•	Floor (optional)

Search by Time & Duration

Input:
	•	Day
	•	Start time
	•	Duration

Output:
	•	List of available rooms that satisfy criteria
	•	Sorted by best capacity match

⸻

4.3 Booking Creation

Input Required:
	•	Room
	•	Date
	•	Start time
	•	End time
	•	Purpose (optional note)

System Behavior:
	•	Validate slot availability
	•	Prevent overlapping bookings
	•	Confirm booking upon success
	•	Reject and notify on conflict

⸻

4.4 Conflict Prevention (Critical Requirement)

The system must:
	•	Prevent double bookings
	•	Prevent overlapping time ranges
	•	Ensure atomic booking creation
	•	Be concurrency safe

If two student reps attempt to book the same room at the same time:
	•	Only one request succeeds
	•	The other receives a conflict error

⸻

4.5 Rescheduling

Student reps can:
	•	Modify time
	•	Modify date
	•	Change room

System must:
	•	Re-check availability
	•	Prevent overlaps
	•	Execute update atomically
	•	Preserve booking history

⸻

4.6 Recurring Bookings (Phase 2 but Designed Early)

Support:
	•	Weekly recurrence
	•	End date selection

System must:
	•	Validate availability across all occurrences
	•	Reject if any slot conflicts
	•	Show conflict details

⸻

4.7 Booking History & Audit

Track:
	•	Created by
	•	Created at
	•	Modified at
	•	Previous time/date if rescheduled
	•	Cancellation log

Purpose:
	•	Transparency
	•	Misuse tracking
	•	Debugging

⸻

5. Non-Functional Requirements

⸻

5.1 Performance
	•	System must handle concurrent booking attempts
	•	Response time < 500ms for booking requests
	•	Weekly schedule loads in < 1s

⸻

5.2 Reliability
	•	No booking overlap allowed
	•	Database-level constraints enforced
	•	Transaction-safe operations

⸻

5.3 Usability
	•	Clean minimal interface
	•	Dark mode default
	•	Responsive design (desktop-first)
	•	Easy filtering and search

⸻

5.4 Security
	•	Role-based access control (RBAC)
	•	Authenticated booking endpoints
	•	Input validation
	•	Protection against injection attacks

⸻

6. Data Model (High-Level)

6.1 Entities

Users
	•	id
	•	name
	•	email
	•	role (STUDENT_REP | VIEWER)

⸻

Rooms
	•	id
	•	name
	•	building
	•	floor
	•	capacity
	•	has_ac (boolean)
	•	has_projector (boolean)

⸻

Bookings
	•	id
	•	room_id
	•	start_time
	•	end_time
	•	created_by
	•	created_at
	•	updated_at
	•	status (ACTIVE | CANCELLED)

⸻

Booking History
	•	booking_id
	•	previous_start_time
	•	previous_end_time
	•	modified_by
	•	modified_at

⸻

7. User Flow

⸻

7.1 Book a Room
	1.	Open weekly view OR search by duration
	2.	Filter by attributes
	3.	Select available room
	4.	Confirm booking
	5.	System validates & saves
	6.	Booking appears on calendar

⸻

7.2 Reschedule
	1.	Open existing booking
	2.	Click “Reschedule”
	3.	Select new slot
	4.	System checks conflict
	5.	Update booking
	6.	Log change

⸻

8. Edge Cases
	•	Concurrent booking attempts
	•	Partial conflict in recurring booking
	•	Timezone handling
	•	Booking spanning multiple hours
	•	Cancellation during high traffic
	•	Network failure during transaction

⸻

9. Metrics for Success
	•	Reduction in WhatsApp rescheduling messages
	•	Zero double-booking incidents
	•	Adoption by majority of student reps
	•	Weekly active usage
	•	System uptime > 99%

⸻

10. Future Enhancements
	•	Utilization analytics dashboard
	•	Heatmap of peak usage
	•	Auto-suggest optimal room
	•	Calendar export (ICS)
	•	Notification system
	•	QR display outside rooms
	•	Exam scheduling optimization
	•	Mobile app version

⸻

11. Technical Direction (Recommendation)

Frontend:
	•	Next.js
	•	FullCalendar
	•	TailwindCSS

Backend:
	•	NestJS or Go
	•	PostgreSQL

Critical:
	•	Database-level time range conflict constraints
	•	Transaction-based booking logic

⸻

12. Risks
	•	Adoption resistance
	•	Misuse by student reps
	•	Poor initial UX causing drop-off
	•	Scaling issues if not designed properly
	•	Lack of official institutional support

⸻

13. Release Plan

Phase 1 (MVP – 3–4 Weeks)
	•	Auth
	•	Weekly view
	•	Booking creation
	•	Conflict prevention
	•	Filtering

Phase 2
	•	Recurring bookings
	•	Booking history
	•	Analytics
	•	Smart suggestions

⸻

Final Vision

This system should not just replace WhatsApp coordination.

It should become:

A reliable, centralized infrastructure scheduling platform for the campus.

If you want, next I can give you:
	•	A detailed DB schema with constraints
	•	API contract definition
	•	Technical Design Document (TDD)
	•	System architecture diagram in markdown
	•	Or a lean startup-style product roadmap

Your move.