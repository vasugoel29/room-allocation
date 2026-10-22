import { sendServerError } from '../utils/httpErrors.js';
import logger from "../utils/logger.js";
import * as bookingService from "../services/bookingService.js";
import { hasPermission, PERMISSIONS as P } from "../auth/permissions.js";
import zlib from "zlib";
import { sharedCached } from "../utils/sharedCache.js";
import { scopesFor, ROOM_VIEW_PERMISSIONS } from "../auth/scopes.js";
import { roomRepository } from "../repositories/roomRepository.js";

// Fields everyone may see on someone else's booking: when and where it is, and who holds it
// (name, branch, year, section) so they can coordinate or request a transfer. Never the purpose,
// contact details or the supervising faculty (product rule, SEC-10).
const PUBLIC_BOOKING_FIELDS = [
  "id", "room_id", "room_name", "start_time", "end_time", "status", "created_by",
  "user_name", "user_role", "branch", "year", "section", "class_name",
];

function limitedView(booking, canTransfer, now) {
  const view = Object.fromEntries(PUBLIC_BOOKING_FIELDS.map((k) => [k, booking[k] ?? null]));
  view.visibility = "limited";
  view.can_request_transfer =
    canTransfer && booking.status === "ACTIVE" && new Date(booking.start_time).getTime() > now;
  return view;
}

export function viewBookingFor(principal, booking, now = Date.now()) {
  const isOwner = String(booking.created_by) === String(principal.id);
  const isSupervisor = principal.faculty_id != null && String(booking.faculty_id) === String(principal.faculty_id);
  if (isOwner || isSupervisor || hasPermission(principal, P.ADMIN)) {
    return { ...booking, visibility: "full" };
  }
  return limitedView(booking, hasPermission(principal, P.BOOKINGS), now);
}

export const getBookings = async (req, res) => {
  try {
    // ACL scopes: the admin list (/admin/all) by booker and room; the calendar list by room.
    const adminList = req.route?.path === '/admin/all';
    const scope = adminList
      ? { scopes: scopesFor(req.user, P.ADMIN), people: true }
      : { scopes: scopesFor(req.user, ...ROOM_VIEW_PERMISSIONS), people: false };
    const bookings = await bookingService.getBookings({ ...req.query, scope });
    const now = Date.now();
    bookings.data = bookings.data.map((b) => viewBookingFor(req.user, b, now));
    res.json(bookings);
  } catch (err) {
    logger.error("Failed to fetch bookings", err);
    sendServerError(res, err, "Failed to fetch bookings");
  }
};

// The calendar is the same for everyone with the same permissions, so its JSON is built once per
// window and view and shared (PERF-01/06). Rows are limited for non-managers — the viewer's own and
// supervised bookings arrive in full from /bookings/mine, which the client merges over these.
export const getCalendar = async (req, res) => {
  try {
    const range = bookingService.calendarRange(req.query);
    if (range.error) return res.status(range.status).json({ error: range.error });
    const manage = hasPermission(req.user, P.ADMIN);
    const transfer = hasPermission(req.user, P.BOOKINGS);
    const variant = manage ? "full" : transfer ? "transfer" : "view";
    const key = `calendar|${range.from}|${range.to}`;
    // Viewers limited to some rooms (ACL room scopes) get their own copy; everyone else shares one.
    const visible = await roomRepository.visibleRoomIds(scopesFor(req.user, ...ROOM_VIEW_PERMISSIONS));
    const build = async () => {
      let rows = await sharedCached(`${key}|rows`, () => bookingService.getCalendarRows(range));
      if (visible) rows = rows.filter((b) => visible.has(b.room_id));
      const now = Date.now();
      const data = manage
        ? rows.map((b) => ({ ...b, visibility: "full" }))
        : rows.map((b) => limitedView(b, transfer, now));
      const json = JSON.stringify({ data, meta: { from: range.from, to: range.to } });
      // Compressed once here rather than by the compression middleware on every response.
      return { json, gzip: zlib.gzipSync(json, { level: 6 }) };
    };
    const body = visible ? await build() : await sharedCached(`${key}|${variant}`, build);
    res.type("application/json").vary("Accept-Encoding");
    if (req.acceptsEncodings("gzip", "identity") === "gzip") {
      res.set("Content-Encoding", "gzip");
      return res.send(body.gzip);
    }
    res.send(body.json);
  } catch (err) {
    logger.error("Failed to fetch the calendar", err);
    sendServerError(res, err, "Failed to fetch the calendar");
  }
};

export const getMyBookings = async (req, res) => {
  try {
    const rows = await bookingService.getMine(req.user, req.query);
    const now = Date.now();
    res.json({ data: rows.map((b) => viewBookingFor(req.user, b, now)) });
  } catch (err) {
    logger.error("Failed to fetch bookings", err);
    sendServerError(res, err, "Failed to fetch bookings");
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
    sendServerError(res, err, "Could not create the booking");
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
    sendServerError(res, err, "Cancellation failed");
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
      return res.status(result.status).json({ error: result.error, ...(result.conflict ? { conflict: result.conflict } : {}) });
    }
    res.json(result.data);
  } catch (err) {
    logger.error("Rescheduling failed", err);
    sendServerError(res, err, "Rescheduling failed");
  }
};

export const quickBook = async (req, res) => {
  try {
    const result = await bookingService.quickBookHandler(req.body, req.user);
    if (result.error) {
      return res.status(result.status).json({ error: result.error, ...(result.conflict ? { conflict: result.conflict } : {}) });
    }
    res.status(201).json(result.data);
  } catch (err) {
    logger.error("Quick book error:", err);
    sendServerError(res, err, "Quick booking failed");
  }
};
