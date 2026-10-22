import { scopesFor, allows, scopeSql, restricts } from '../../src/auth/scopes.js';

const principal = (scopes_by_permission = {}, permissions = ['cras.admin', 'cras.calendar'], allowed_scope = {}) =>
  ({ permissions: new Set(permissions), scopes_by_permission, allowed_scope });

const itStudent = { department_name: 'Information Technology', branch: 'IT', semester: 5, section: 1 };
const cseStudent = { department_name: 'Computer Science', branch: 'CSE', semester: 3, section: 2 };
const apj = { name: 'APJ-07', building: 'APJ Block' };
const block6 = { name: '6113', building: '6th Block' };

describe('scopesFor', () => {
  test('no entry or a list containing {} is unrestricted (every grant today)', () => {
    expect(scopesFor(principal(), 'cras.admin')).toBeNull();
    expect(scopesFor(principal({ 'cras.admin': [{}] }), 'cras.admin')).toBeNull();
    expect(scopesFor(principal({ 'cras.admin': [{ branch: 'IT' }, {}] }), 'cras.admin')).toBeNull();
  });

  test('any-of permissions: one unrestricted grant wins; otherwise the scopes add up', () => {
    const p = principal({ 'cras.admin': [{ branch: 'IT' }], 'cras.calendar': [{ building: 'APJ Block' }] });
    expect(scopesFor(p, 'cras.admin', 'cras.calendar')).toHaveLength(2);
    expect(scopesFor(principal({ 'cras.admin': [{ branch: 'IT' }] }), 'cras.admin', 'cras.calendar')).toBeNull();
    expect(scopesFor(p, 'cras.bookings')).toEqual([]); // not held: nothing
  });

  test('allowed_scope applies to permissions with no list of their own', () => {
    const p = principal({}, ['cras.admin'], { branch: 'IT' });
    expect(allows(scopesFor(p, 'cras.admin'), { person: itStudent })).toBe(true);
    expect(allows(scopesFor(p, 'cras.admin'), { person: cseStudent })).toBe(false);
  });
});

describe('allows', () => {
  const scoped = (list) => scopesFor(principal({ 'cras.admin': list }), 'cras.admin');

  test('people keys: all keys of one object must match, case-insensitively; lists of values', () => {
    expect(allows(scoped([{ branch: 'it', semester: 5 }]), { person: itStudent })).toBe(true);
    expect(allows(scoped([{ branch: 'IT', semester: 3 }]), { person: itStudent })).toBe(false);
    expect(allows(scoped([{ branch: ['CSE', 'IT'] }]), { person: itStudent })).toBe(true);
    expect(allows(scoped([{ department: 'information technology' }]), { person: itStudent })).toBe(true);
  });

  test('room keys; an object without room keys leaves rooms open, and the reverse', () => {
    expect(allows(scoped([{ building: 'apj block' }]), { room: apj })).toBe(true);
    expect(allows(scoped([{ building: 'APJ Block' }]), { room: block6 })).toBe(false);
    expect(allows(scoped([{ room: ['6113'] }]), { room: block6 })).toBe(true);
    expect(allows(scoped([{ branch: 'IT' }]), { room: block6 })).toBe(true);
    expect(allows(scoped([{ building: 'APJ Block' }]), { person: cseStudent })).toBe(true);
  });

  test('person and room must fit the same object (OR between objects)', () => {
    const s = scoped([{ branch: 'IT', building: 'APJ Block' }, { branch: 'CSE', building: '6th Block' }]);
    expect(allows(s, { person: itStudent, room: apj })).toBe(true);
    expect(allows(s, { person: itStudent, room: block6 })).toBe(false);
    expect(allows(s, { person: cseStudent, room: block6 })).toBe(true);
  });

  test('an unknown key or an empty value matches nothing (fail closed)', () => {
    expect(allows(scoped([{ campus: 'East' }]), { room: apj })).toBe(false);
    expect(allows(scoped([{ branch: [] }]), { person: itStudent })).toBe(false);
    expect(allows(scoped(['not an object']), { person: itStudent })).toBe(false);
  });

  test('restricts() says whether lists of people / rooms are limited', () => {
    expect(restricts(scoped([{ branch: 'IT' }]), 'people')).toBe(true);
    expect(restricts(scoped([{ branch: 'IT' }]), 'rooms')).toBe(false);
    expect(restricts(null, 'rooms')).toBe(false);
    expect(restricts([], 'rooms')).toBe(true);
  });
});

describe('scopeSql', () => {
  test('builds OR-of-AND conditions with parameters; skips keys of entities without an alias', () => {
    const params = [7];
    const s = scopesFor(principal({ 'cras.admin': [{ branch: 'IT', building: 'APJ Block' }, { section: 2 }] }), 'cras.admin');
    expect(scopeSql(s, { person: 'u', room: 'r' }, params))
      .toBe('((UPPER(TRIM(u.branch)) = ANY($2::text[]) AND UPPER(TRIM(r.building)) = ANY($3::text[])) OR (u.section::text = ANY($4::text[])))');
    expect(params).toEqual([7, ['IT'], ['APJ BLOCK'], ['2']]);
    expect(scopeSql(s, { room: 'r' }, [])).toBe('((UPPER(TRIM(r.building)) = ANY($1::text[])) OR TRUE)');
    expect(scopeSql(null, { room: 'r' }, [])).toBe('TRUE');
    expect(scopeSql([], { room: 'r' }, [])).toBe('FALSE');
  });
});
