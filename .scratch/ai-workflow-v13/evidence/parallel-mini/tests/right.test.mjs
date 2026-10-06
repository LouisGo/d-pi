import assert from 'node:assert/strict';
import test from 'node:test';
import {rightTag} from '../src/right.mjs';

test('rightTag wraps an identifier in R()', () => {
  assert.equal(rightTag('02'), 'R(02)');
});

test('rightTag preserves the 02a suffix', () => {
  assert.equal(rightTag('02a'), 'R(02a)');
});

test('rightTag preserves whitespace', () => {
  assert.equal(rightTag(' 02a '), 'R( 02a )');
});
