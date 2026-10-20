import { initialsFromFullName, userInitials } from './user-initials';

describe('userInitials', () => {
  it('ad ve soyadın ilk harfleri', () => {
    expect(userInitials('Test', 'Kullanıcı', 'test@x.com')).toBe('TK');
  });

  it('küçük harfi Türkçe kurala göre büyütür', () => {
    expect(userInitials('ismail', 'ışık')).toBe('İI');
  });

  it('yalnız ad varsa tek harf', () => {
    expect(userInitials('Ali', '', 'ali@x.com')).toBe('A');
  });

  it('ad ve soyad boşsa yedeğin ilk harfi', () => {
    expect(userInitials('', null, 'mehmet@x.com')).toBe('M');
    expect(userInitials('  ', undefined, 'mehmet@x.com')).toBe('M');
  });

  it('hiçbiri yoksa ?', () => {
    expect(userInitials(null, null, null)).toBe('?');
    expect(userInitials('', '')).toBe('?');
  });
});

describe('initialsFromFullName', () => {
  it('ilk ve son kelimenin ilk harfleri', () => {
    expect(initialsFromFullName('Test Kullanıcı')).toBe('TK');
    expect(initialsFromFullName('Ali Can Yılmaz')).toBe('AY');
  });

  it('fazla boşlukları yok sayar', () => {
    expect(initialsFromFullName('  Test   Kullanıcı  ')).toBe('TK');
  });

  it('tek kelimede tek harf', () => {
    expect(initialsFromFullName('Admin')).toBe('A');
  });

  it('ad boşsa yedeğe düşer', () => {
    expect(initialsFromFullName('', 'zeynep@x.com')).toBe('Z');
    expect(initialsFromFullName(null, null)).toBe('?');
  });
});
