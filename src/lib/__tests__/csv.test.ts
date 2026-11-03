import { describe, it, expect } from 'vitest';
import { parseCSV, parseCSVWithHeaders } from '../csv';

describe('parseCSV', () => {
  it('parses simple CSV', () => {
    const result = parseCSV('a,b,c\n1,2,3\n4,5,6');
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6']
    ]);
  });

  it('handles quoted fields', () => {
    const result = parseCSV('name,age\n"Smith, John",30');
    expect(result).toEqual([
      ['name', 'age'],
      ['Smith, John', '30']
    ]);
  });

  it('handles quoted fields with escaped quotes', () => {
    const result = parseCSV('note\n"He said ""hello"""');
    expect(result).toEqual([['note'], ['He said "hello"']]);
  });

  it('handles CRLF line endings', () => {
    const result = parseCSV('a,b\r\n1,2\r\n3,4');
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4']
    ]);
  });

  it('handles trailing newline', () => {
    const result = parseCSV('a,b\n1,2\n');
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
  });

  it('handles single field per row', () => {
    const result = parseCSV('a\nb\nc');
    expect(result).toEqual([['a'], ['b'], ['c']]);
  });

  it('handles empty fields', () => {
    const result = parseCSV('a,,c\n1,,3');
    expect(result).toEqual([
      ['a', '', 'c'],
      ['1', '', '3']
    ]);
  });
});

describe('parseCSVWithHeaders', () => {
  it('parses CSV with headers into objects', () => {
    const result = parseCSVWithHeaders('name,age\nAlice,30\nBob,25');
    expect(result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' }
    ]);
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCSVWithHeaders('name,age')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCSVWithHeaders('')).toEqual([]);
  });

  it('skips blank rows', () => {
    const result = parseCSVWithHeaders('name,age\nAlice,30\n\nBob,25');
    expect(result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' }
    ]);
  });

  it('handles missing fields as empty strings', () => {
    const result = parseCSVWithHeaders('name,age,extra\nAlice,30');
    expect(result).toEqual([{ name: 'Alice', age: '30', extra: '' }]);
  });

  it('trims header names', () => {
    const result = parseCSVWithHeaders(' name , age \nAlice,30');
    expect(result).toEqual([{ name: 'Alice', age: '30' }]);
  });
});

describe('parseCSV line endings', () => {
  it('handles a bare CR between rows', () => {
    expect(parseCSV('a\rb')).toEqual([['a'], ['b']]);
  });

  it('drops a byte order mark before the headers', () => {
    expect(parseCSVWithHeaders(String.fromCharCode(0xfeff) + 'name\nAna')).toEqual([
      { name: 'Ana' }
    ]);
  });
});
