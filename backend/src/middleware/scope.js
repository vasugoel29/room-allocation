import { roomRepository } from '../repositories/roomRepository.js';
import { scopesFor, allows, OUT_OF_SCOPE } from '../auth/scopes.js';
import { PERMISSIONS as P } from '../auth/permissions.js';

/**
 * Admin routes on one room (`:id`): refused with 403 when the room is outside the admin's ACL
 * room scope. An unknown id falls through to the handler's 404.
 */
export async function roomInAdminScope(req, res, next) {
  try {
    const room = await roomRepository.findById(req.params.id);
    if (room && !allows(scopesFor(req.user, P.ADMIN), { room })) return res.status(403).json({ error: OUT_OF_SCOPE });
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Whole-campus replacements (the faculty directory and faculty timetable CSV imports) need an
 * admin without ACL scope limits: a scoped admin would overwrite data outside their scope.
 */
export function requireUnscopedAdmin(req, res, next) {
  if (scopesFor(req.user, P.ADMIN) !== null) {
    return res.status(403).json({ error: `${OUT_OF_SCOPE} This import replaces data for the whole campus.` });
  }
  next();
}
