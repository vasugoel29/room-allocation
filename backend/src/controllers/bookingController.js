import logger from "../utils/logger.js";
import * as bookingService from "../services/bookingService.js";
import { hasPermission, PERMISSIONS as P } from "../auth/permissions.js";

// Fields everyone may see on someone else's booking: when and where it is, and who holds it
// (name, branch, year, section) so they can coordinate or request a transfer. Never the purpose,
// contact details or the supervising faculty (product rule, SEC-10).
const PUBLIC_BOOKING_FIELDS = [
  "id", "room_id", "room_name", "start_time", "end_time", "status", "created_by",
  "user_name", "user_role", "branch", "year", "section", "class_name",
];

export function viewBookingFor(principal, booking, now = Date.now()) {
  const isOwner = String(booking.created_by) === String(principal.id);
  const isSupervisor = principal.faculty_id != null && String(booking.faculty_id) === String(principal.faculty_id);
  if (isOwner || isSupervisor || hasPermission(principal, P.BOOKINGS_MANAGE)) {
    return { ...booking, visibility: "full" };
  }
  const view = Object.fromEntries(PUBLIC_BOOKING_FIELDS.map((k) => [k, booking[k] ?? null]));
  view.visibility = "limited";
  view.can_request_transfer =
    booking.status === "ACTIVE" &&
    new Date(booking.start_time).getTime() > now &&
    hasPermission(principal, P.BOOKINGS_TRANSFER);
  return view;
}

export const getBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getBookings(req.query);
    const now = Date.now();
    bookings.data = bookings.data.map((b) => viewBookingFor(req.user, b, now));
    res.json(bookings);
  } catch (err) {
    logger.error("Failed to fetch bookings", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

export const createBooking = async (req, res) => {
  try {
    const result = await bookingService.createBookingHandler(
      req.body,
      req.user,
    );
    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.conflict ? { conflict: result.conflict } : {}),
      });
    }
    res.status(201).json(result.data);
  } catch (err) {
    logger.error("Booking creation failed", err);
    res.status(500).json({ error: "Database error" });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const result = await bookingService.cancelBookingHandler(
      req.params.id,
      req.user,
    );
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ status: "Success", message: "Booking cancelled" });
  } catch (err) {
    logger.error("Cancellation failed", err);
    res.status(500).json({ error: "Cancellation failed" });
  }
};

export const rescheduleBooking = async (req, res) => {
  try {
    const result = await bookingService.rescheduleBookingHandler(
      req.params.id,
      req.body,
      req.user,
    );
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (err) {
    logger.error("Rescheduling failed", err);
    res.status(500).json({ error: "Rescheduling failed" });
  }
};

export const quickBook = async (req, res) => {
  try {
    const result = await bookingService.quickBookHandler(req.body, req.user);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.status(201).json(result.data);
  } catch (err) {
    logger.error("Quick book error:", err);
    res.status(500).json({ error: "Quick booking failed" });
  }
};
