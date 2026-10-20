// A small, fixed section timetable for development and tests only (never seeded in production —
// the real timetable arrives every semester through the admin timetable import). Two sections,
// real room names from ./rooms.js and real faculty from ./faculties.js, so booking clashes,
// faculty availability and class cancellations can be exercised end to end.
//
// slot_time follows the import format (12-hour source data: 01:00–07:59 means afternoon).
const IT = { department: 'INFORMATION TECHNOLOGY', semester: '5', section: '1' };
const CSE = { department: 'COMPUTER SCIENCE AND ENGINEERING', semester: '3', section: '2' };

const slot = (section, day_of_week, slot_time, subject_code, subject_name, room_name, faculty_name) =>
  ({ ...section, day_of_week, slot_time, subject_code, subject_name, room_name, faculty_name });

export const DEMO_TIMETABLE = Object.freeze([
  slot(IT, 'Mon', '09:00-10:00', 'ITC501', 'Computer Networks', '5013', 'Aarti Jain'),
  slot(IT, 'Mon', '10:00-11:00', 'ITC502', 'Database Systems', '5013', 'Abhinav Tomar'),
  slot(IT, 'Tue', '11:00-12:00', 'ITC503', 'Operating Systems', '5014', 'Aashima'),
  slot(IT, 'Wed', '02:00-03:00', 'ITC501', 'Computer Networks', '5014', 'Aarti Jain'),
  slot(IT, 'Thu', '09:00-10:00', 'ITC502', 'Database Systems', '6008', 'Abhinav Tomar'),
  slot(IT, 'Fri', '12:00-01:00', 'ITC503', 'Operating Systems', '6008', 'Aashima'),
  slot(CSE, 'Mon', '11:00-12:00', 'CSC301', 'Data Structures', '4012', 'Abhinav Tomar'),
  slot(CSE, 'Tue', '09:00-10:00', 'CSC302', 'Discrete Mathematics', '4013', 'Aarti Jain'),
  slot(CSE, 'Wed', '10:00-11:00', 'CSC303', 'Digital Logic', '4014', 'Aashima'),
  slot(CSE, 'Thu', '03:00-04:00', 'CSC301', 'Data Structures', '4012', 'Abhinav Tomar'),
  slot(CSE, 'Fri', '10:00-11:00', 'CSC302', 'Discrete Mathematics', '4013', 'Aarti Jain'),
]);
