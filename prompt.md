Update the existing Express.js codebase to fully support **Available Rooms** and **Bookings** as part of the database.  
We are using `db.json` as the database (via JSON server or similar).  

---

## Database Schema

### 1. Available Rooms
- Already defined in `db.json` under:
  - `rooms` (features per room)
  - `days`, `slots`
  - `availability` (rooms available per day and slot)

Keep these as the **source of truth** for availability.  
⚠️ When a booking is created, update `availability` accordingly (remove the booked room from the correct day+slot array).

### 2. Bookings
Add a new collection in `db.json`:

```json
"bookings": [
  {
    "id": 1,
    "date": "2025-10-01",
    "slot": "10:00-11:00",
    "roomId": "Room 101"
  }
]


⸻

Routes to Add / Update

1. Get Available Rooms
	•	GET /available-rooms?day=Mon&slot=09:00-10:00
	•	Returns list of available rooms for the given day+slot with features merged
	•	GET /available-rooms/all
	•	Returns all weekly availability with features included

2. Book a Room
	•	POST /book-room
	•	Body:

{
  "date": "2025-10-01",
  "slot": "10:00-11:00",
  "roomId": "Room 101"
}


	•	Validate:
	•	slot ∈ slots
	•	roomId ∈ rooms
	•	roomId ∈ availability[day][slot]
	•	If valid:
	•	Insert into bookings table in db.json
	•	Update availability[day][slot] by removing the room
	•	Return 201 Created with booking details
	•	If not valid → return 400 Bad Request

3. Get All Bookings
	•	GET /bookings
	•	Return the full bookings table from db.json

⸻

Implementation Notes
	•	Do not use in-memory arrays. Both bookings and availability must be stored in db.json.
	•	Use your existing database utilities to read and write to db.json (don’t overwrite other keys).
	•	Ensure atomic update:
	•	Add booking → persist in bookings
	•	Remove room from availability → persist in availability
	•	All responses must be JSON.

⸻

Example

GET /available-rooms?day=Mon&slot=09:00-10:00

[
  { "roomId": "Room 102", "features": ["AC"] },
  { "roomId": "Room 104", "features": [] },
  { "roomId": "Room 109", "features": ["AC"] }
]

POST /book-room

{
  "id": 1,
  "date": "2025-10-01",
  "slot": "10:00-11:00",
  "roomId": "Room 101"
}

---
