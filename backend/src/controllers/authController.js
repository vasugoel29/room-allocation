import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import * as userService from "../services/userService.js";
import { JWT_SECRET } from "../middleware/auth.js";
import * as departmentService from "../services/departmentService.js";
import logger from "../utils/logger.js";
import { userRepository } from "../repositories/userRepository.js";
import {
  notifyFacultyApproved,
  sendPasswordResetEmail,
} from "../utils/emailService.js";

export const signup = async (req, res) => {
  const { name, email, password, branch, year, section, role, departmentName } =
    req.body;
  try {
    const hash = await bcrypt.hash(password, 10);

    // Resolve department_id if name provided
    let department_id = null;
    if (departmentName) {
      department_id = await departmentService.ensureDepartment(departmentName);
    }

    // Whitelist allowed roles for signup
    const allowedRoles = ["VIEWER", "STUDENT_REP", "FACULTY"];
    const finalRole = allowedRoles.includes(role) ? role : "VIEWER";

    // Faculty requires approval
    const is_approved = finalRole === "FACULTY" ? false : true;

    const user = await userService.createUser({
      name,
      email,
      passwordHash: hash,
      role: finalRole,
      branch,
      year,
      section,
      department_id,
      is_approved,
    });

    res.status(201).json({
      ...user,
      message:
        role === "FACULTY"
          ? "Account created! Awaiting administrator approval."
          : "Account created successfully.",
    });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ error: "Email already exists" });
    logger.error("Signup failed", err);
    res.status(500).json({ error: "Signup failed" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await userService.findByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.is_approved === false) {
      return res
        .status(403)
        .json({ error: "Your account is awaiting administrator approval." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      message: "Logged in successfully",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        branch: user.branch,
        year: user.year,
        section: user.section,
        department_name: user.department_name,
      },
    });
  } catch (err) {
    logger.error("Login failed", err);
    res.status(500).json({ error: "Login failed" });
  }
};

export const logout = (req, res) => {
  res.json({ message: "Logged out successfully" });
};

export const getUsers = async (req, res) => {
  try {
    const result = await userService.getUsers(req.query);
    res.json(result);
  } catch (err) {
    logger.error("Failed to fetch users", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const approveUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await userService.updateUser(id, { is_approved: true });
    if (!user) return res.status(404).json({ error: "User not found" });

    // PROD-02 / PROD-04: Notify faculty when their account is approved
    if (user.role === "FACULTY" && user.email) {
      notifyFacultyApproved({
        facultyEmail: user.email,
        facultyName: user.name || "Professor",
      }).catch((err) =>
        logger.error("Faculty approval notification failed", err),
      );
    }

    res.json({ message: "User approved successfully", user });
  } catch (err) {
    logger.error("Failed to approve user", err);
    res.status(500).json({ error: "Failed to approve user" });
  }
};

export const createUser = async (req, res) => {
  const { name, email, password, role, branch, year, section, departmentName } =
    req.body;
  if (!password) {
    return res
      .status(400)
      .json({ error: "Password is required for user creation" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);

    let department_id = null;
    if (departmentName) {
      department_id = await departmentService.ensureDepartment(departmentName);
    }

    const user = await userService.createUser({
      name,
      email,
      passwordHash: hash,
      role: role || "VIEWER",
      branch,
      year,
      section,
      department_id,
      is_approved: true,
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ error: "Email already exists" });
    logger.error("Failed to create user", err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { departmentName, ...otherData } = req.body;
  try {
    if (req.user.role !== "ADMIN" && String(req.user.id) !== String(id)) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this profile" });
    }

    // Regular users cannot update role or approval status
    if (req.user.role !== "ADMIN") {
      delete otherData.role;
      delete otherData.is_approved;
    }

    let department_id = undefined;
    if (departmentName) {
      department_id = await departmentService.ensureDepartment(departmentName);
    }

    const user = await userService.updateUser(id, {
      ...otherData,
      department_id,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    logger.error("Failed to update user", err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await userService.deleteUser(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted successfully" });
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

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    // Always return 200 to prevent email enumeration
    const user = await userService.findByEmail(email);
    if (!user) {
      return res.json({
        message:
          "If an account with that email exists, a reset link has been sent.",
      });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await userRepository.setResetToken(email, tokenHash, expires);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    await sendPasswordResetEmail({
      userEmail: email,
      userName: user.name || "User",
      resetLink,
    });

    res.json({
      message:
        "If an account with that email exists, a reset link has been sent.",
    });
  } catch (err) {
    logger.error("Forgot password failed", err);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  try {
    if (!token || !password) {
      return res
        .status(400)
        .json({ error: "Token and new password are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await userRepository.findByResetToken(tokenHash);

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hash = await bcrypt.hash(password, 10);
    await userRepository.updatePassword(user.id, hash);
    await userRepository.clearResetToken(user.id);

    res.json({
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (err) {
    logger.error("Reset password failed", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

// ─── UX-C4: Student API Proxy ───────────────────────────────────

export const verifyStudent = async (req, res) => {
  const { rollNo } = req.params;
  try {
    if (!rollNo || rollNo.length < 5) {
      return res.status(400).json({ error: "Valid roll number required" });
    }

    const response = await fetch(
      `https://api.sujal.info/api/nsut/students/${rollNo}`,
    );
    if (!response.ok) {
      return res.status(404).json({ error: "Student not found in database" });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    logger.error("Failed to proxy student verification", err);
    res.status(500).json({
      error:
        "Verification service currently unavailable. Using manual entry fallback.",
    });
  }
};
