import { describe, it, expect } from 'vitest';
import { getRoleLabel } from '../utils/roleUtils';

describe('roleUtils - getRoleLabel', () => {
  it('should return custom labels for known roles', () => {
    expect(getRoleLabel('VIEWER')).toBe('Student (Viewer)');
    expect(getRoleLabel('STUDENT_REP')).toBe('Student Representative');
    expect(getRoleLabel('FACULTY')).toBe('Faculty Member');
    expect(getRoleLabel('ADMIN')).toBe('Administrator');
  });

  it('should return input string as fallback for unknown roles', () => {
    expect(getRoleLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(getRoleLabel('')).toBe('');
    expect(getRoleLabel(null)).toBe(null);
  });
});
