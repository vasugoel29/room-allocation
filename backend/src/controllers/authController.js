import * as userService from "../services/userService.js";
import logger from "../utils/logger.js";

export const getUsers = async (req, res) => {
  try {
    const result = await userService.getUsers(req.query);
    res.json(result);
  } catch (err) {
    logger.error("Failed to fetch users", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await userService.deleteUser(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deactivated" });
  } catch (err) {
    logger.error("Failed to delete user", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

export const getFaculties = async (req, res) => {
  try {
    const faculties = await userService.getFaculties();
    res.json(faculties);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch faculties" });
  }
};

// ─── PROD-03: Password Reset ────────────────────────────────────

// ─── UX-C4: Student API Proxy ───────────────────────────────────

