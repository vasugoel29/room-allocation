import * as db from '../db.js';
import logger from '../utils/logger.js';

/**
 * Logs an activity into the audit_logs table
 * @param {Object} params - Activity parameters
 * @param {number} params.userId - ID of the user performing the action
 * @param {string} params.action - Action string (e.g., 'CREATE_BOOKING')
 * @param {string} [params.entityType] - Type of entity affected (e.g., 'booking')
 * @param {number} [params.entityId] - ID of the entity affected
 * @param {Object} [params.details] - Additional details as a JSON-serializable object
 * @param {Object} [client] - Optional database client for transactional logging
 */
export const logActivity = async ({ userId, action, entityType, entityId, details }, client = null) => {
  const queryText = `
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES ($1, $2, $3, $4, $5)
  `;
  const params = [userId, action, entityType, entityId, JSON.stringify(details || {})];

  try {
    if (client) {
      await client.query(queryText, params);
    } else {
      await db.query(queryText, params);
    }
  } catch (err) {
    // We log but don't throw, to avoid breaking core business logic if logging fails
    logger.error('Failed to log activity to database', { err, action, userId });
  }
};
