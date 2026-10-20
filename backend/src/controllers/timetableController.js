import { sendServerError } from '../utils/httpErrors.js';
import * as timetable from '../services/timetableService.js';

/** HTTP layer for the timetable routes; the rules live in services/timetableService.js. */
const handle = (run, { status = 200, failure } = {}) => async (req, res) => {
  try {
    const result = await run(req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(status).json(result.data);
  } catch (err) {
    sendServerError(res, err, failure);
  }
};

export const getTimetable = handle((req) => timetable.sectionTimetable(req.user));
/** POST /api/timetable/upload { slots: [...] } — see services/timetableImport.js. */
export const uploadTimetable = handle((req) => timetable.importSections(req.body.slots, req.user));
export const getFacultyTimetable = handle((req) => timetable.ownFacultySlots(req.user, req.query.day));
/** GET /api/timetable/faculty/check/:id?date&hour */
export const checkFacultyAvailability = handle((req) => timetable.facultyAvailability(req.params.id, req.query.date, req.query.hour));
/** POST /api/timetable/faculty/override { date, hour, is_cancelled = true } */
export const overrideFacultySlot = handle(
  (req) => timetable.setOwnClassCancelled(req.user, { date: req.body.date, hour: req.body.hour, cancel: req.body.is_cancelled !== false }),
  { failure: 'Failed to update the class.' },
);
export const getFacultyOverrides = handle((req) => timetable.ownCancelledClasses(req.user));
export const createCancellationRequest = handle((req) => timetable.requestClassCancellation(req.user, req.body),
  { status: 201, failure: 'Failed to create cancellation request.' });
export const getPendingCancellationRequests = handle((req) => timetable.pendingCancellationRequests(req.user),
  { failure: 'Failed to load cancellation requests.' });
export const reviewCancellationRequest = handle((req) => timetable.reviewCancellationRequest(req.user, req.params.id, req.params.action),
  { failure: 'Failed to review cancellation request.' });
export const listBranches = handle(() => timetable.branches());
export const searchTimetable = handle((req) => timetable.search(req.query));
export const autocompleteFaculty = handle((req) => timetable.autocompleteFaculty(req.query.query));
export const listSlots = handle((req) => timetable.listFacultySlots(req.query));
export const createSlot = handle((req) => timetable.createFacultySlot(req.body), { status: 201 });
export const updateSlot = handle((req) => timetable.updateFacultySlot(req.params.id, req.body));
export const deleteSlot = handle((req) => timetable.deleteFacultySlot(req.params.id));
