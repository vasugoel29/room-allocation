import logger from "../utils/logger.js";
import * as bookingService from "../services/bookingService.js";

export const getBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getBookings(req.query);
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
      return res.status(result.status).json({ error: result.error });
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
