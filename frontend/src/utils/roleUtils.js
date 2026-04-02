export const ROLE_LABELS = {
  'VIEWER': 'Student (Viewer)',
  'STUDENT_REP': 'Student Representative',
  'FACULTY': 'Faculty Member',
  'ADMIN': 'Administrator'
};

export const getRoleLabel = (role) => {
  return ROLE_LABELS[role] || role;
};
