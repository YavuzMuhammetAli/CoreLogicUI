import { PublishedColumnSchema } from '../../services/published-table.service';
import { isColumnRequired, isServerFilledAutoValue, mustStayVisible } from './column-required';

function rule(partial: Partial<PublishedColumnSchema>): PublishedColumnSchema {
  return { name: 'Alan', dataType: 'string', isRequired: false, ...partial } as PublishedColumnSchema;
}

describe('column-required', () => {
  describe('isColumnRequired', () => {
    it('ignores isNullable when a schema rule exists — a required text column comes as isNullable=true', () => {
      expect(isColumnRequired({ isNullable: true }, rule({ isRequired: true }))).toBeTrue();
      expect(isColumnRequired({ isNullable: false }, rule({ isRequired: false }))).toBeFalse();
    });

    it('uses isNullable when the rule has not loaded yet', () => {
      expect(isColumnRequired({ isNullable: false }, undefined)).toBeTrue();
      expect(isColumnRequired({ isNullable: true }, undefined)).toBeFalse();
    });
  });

  describe('mustStayVisible', () => {
    it('a required column cannot be hidden', () => {
      expect(mustStayVisible({ isNullable: true }, rule({ isRequired: true }))).toBeTrue();
    });

    it('an optional column can be hidden', () => {
      expect(mustStayVisible({ isNullable: true }, rule({ isRequired: false }))).toBeFalse();
    });

    it('a read-only auto value filled by the server can be hidden even if required', () => {
      const seq = rule({ isRequired: true, autoValueTrigger: 'create', autoValueExpression: "SEQ(3, 'x')" });
      const onSave = rule({ isRequired: true, autoValueTrigger: 'save', autoValueExpression: '[A] & [B]' });
      const readOnly = rule({ isRequired: true, autoValueTrigger: 'change', autoValueExpression: '[A]', isReadOnly: true });
      expect(mustStayVisible({ isNullable: true }, seq)).toBeFalse();
      expect(mustStayVisible({ isNullable: true }, onSave)).toBeFalse();
      expect(mustStayVisible({ isNullable: true }, readOnly)).toBeFalse();
    });

    it('a user-editable auto value stays visible if required', () => {
      const editable = rule({ isRequired: true, autoValueTrigger: 'create', autoValueExpression: 'TODAY()' });
      expect(mustStayVisible({ isNullable: true }, editable)).toBeTrue();
    });
  });

  describe('isServerFilledAutoValue', () => {
    it('a trigger without a formula is not an auto value', () => {
      expect(isServerFilledAutoValue(rule({ autoValueTrigger: 'save', autoValueExpression: '  ' }))).toBeFalse();
      expect(isServerFilledAutoValue(undefined)).toBeFalse();
    });

    it('recognizes SEQ regardless of case and whitespace', () => {
      expect(isServerFilledAutoValue(rule({ autoValueTrigger: 'create', autoValueExpression: "'A-' & seq (4, 'k')" }))).toBeTrue();
      expect(isServerFilledAutoValue(rule({ autoValueTrigger: 'create', autoValueExpression: '[SEQUENCE]' }))).toBeFalse();
    });
  });
});
