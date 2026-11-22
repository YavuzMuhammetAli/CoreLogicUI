import { initialsFromFullName, userInitials } from './user-initials';

describe('userInitials', () => {
  it('first letters of first and last name', () => {
    expect(userInitials('Test', 'Kullanıcı', 'test@x.com')).toBe('TK');
  });

  it('uppercases lowercase letters per Turkish rules', () => {
    expect(userInitials('ismail', 'ışık')).toBe('İI');
  });

  it('a single letter when only the first name exists', () => {
    expect(userInitials('Ali', '', 'ali@x.com')).toBe('A');
  });

  it('first letter of the fallback when first and last name are empty', () => {
    expect(userInitials('', null, 'mehmet@x.com')).toBe('M');
    expect(userInitials('  ', undefined, 'mehmet@x.com')).toBe('M');
  });

  it('? when none exist', () => {
    expect(userInitials(null, null, null)).toBe('?');
    expect(userInitials('', '')).toBe('?');
  });
});

describe('initialsFromFullName', () => {
  it('first letters of the first and last words', () => {
    expect(initialsFromFullName('Test Kullanıcı')).toBe('TK');
    expect(initialsFromFullName('Ali Can Yılmaz')).toBe('AY');
  });

  it('ignores extra whitespace', () => {
    expect(initialsFromFullName('  Test   Kullanıcı  ')).toBe('TK');
  });

  it('a single letter for a single word', () => {
    expect(initialsFromFullName('Admin')).toBe('A');
  });

  it('falls back when the name is empty', () => {
    expect(initialsFromFullName('', 'zeynep@x.com')).toBe('Z');
    expect(initialsFromFullName(null, null)).toBe('?');
  });
});
