// SEC-16: values interpolated into email HTML (student names, room labels, comments) are escaped.
import { escapeHtml } from '../../src/notifications/emailService.js';
import { csvCell } from '../../src/controllers/adminController.js';
import { closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

describe('escapeHtml (SEC-16)', () => {
  test('neutralises markup in names and comments', () => {
    expect(escapeHtml('<a href="//evil">Click to verify</a>')).toBe('&lt;a href=&quot;//evil&quot;&gt;Click to verify&lt;/a&gt;');
    expect(escapeHtml(`O'Brien & Sons`)).toBe('O&#39;Brien &amp; Sons');
  });
  test('null / undefined / numbers are safe', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(5013)).toBe('5013');
  });
});

describe('csvCell (SEC-22)', () => {
  test.each([
    ['=SUM(A1)', `"'=SUM(A1)"`],
    ['+1', `"'+1"`],
    ['-1', `"'-1"`],
    ['@cmd', `"'@cmd"`],
    ['\t=cmd', `"'\t=cmd"`],
    ['\r=cmd', `"'\r=cmd"`],
    ['Room, 5013', '"Room, 5013"'],
    ['say "hi"', '"say ""hi"""'],
    [null, '""'],
  ])('%j → %s', (input, out) => expect(csvCell(input)).toBe(out));
});
