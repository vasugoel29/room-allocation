export const ROLE_LABELS = {
  'VIEWER': 'Student (Viewer)',
  'STUDENT_REP': 'Student Representative',
  'FACULTY': 'Faculty Member',
  'ADMIN': 'Administrator'
};

export const getRoleLabel = (role) => {
  return ROLE_LABELS[role] || role;
};
export const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

export const DEPT_ABBREVIATIONS = {
  'INFORMATION TECHNOLOGY': 'IT',
  'COMPUTER SCIENCE AND ENGINEERING': 'CS',
  'INSTRUMENTATION AND CONTROL ENGINEERING': 'ICE',
  'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  'MECHANICAL ENGINEERING': 'ME',
  'MANUFACTURING PROCESS AND AUTOMATION ENGINEERING': 'MPAE',
  'ELECTRICAL ENGINEERING': 'EE',
  'BIOTECHNOLOGY': 'BT'
};

export const getShortDept = (dept) => {
  if (!dept) return '';
  return DEPT_ABBREVIATIONS[dept.toUpperCase()] || dept;
};
