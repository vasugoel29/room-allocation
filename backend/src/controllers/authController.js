import { sendServerError } from '../utils/httpErrors.js';
import * as userService from "../services/userService.js";
import logger from "../utils/logger.js";
import { userRepository } from "../repositories/userRepository.js";
import { scopesFor, allows, OUT_OF_SCOPE } from "../auth/scopes.js";
import { PERMISSIONS as P } from "../auth/permissions.js";

export const getUsers = async (req, res) => {
  try {
    // Admins limited by ACL people scopes see only those people.
    const result = await userService.getUsers({ ...req.query, scopes: scopesFor(req.user, P.ADMIN) });
    res.json(result);
  } catch (err) {
    logger.error("Failed to fetch users", err);
    sendServerError(res, err, "Failed to fetch users");
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const target = await userRepository.findById(id);
    if (target && !allows(scopesFor(req.user, P.ADMIN), { person: target })) return res.status(403).json({ error: OUT_OF_SCOPE });
    const user = await userService.deleteUser(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deactivated" });
  } catch (err) {
    logger.error("Failed to delete user", err);
    sendServerError(res, err, "Failed to delete user");
  }
};

export const getFaculties = async (req, res) => {
  try {
    const faculties = await userService.getFaculties();
    res.json(faculties);
  } catch (err) {
    sendServerError(res, err, "Failed to fetch faculties");
  }
};

// ─── PROD-03: Password Reset ────────────────────────────────────

// ─── UX-C4: Student API Proxy ───────────────────────────────────

