import assert from 'node:assert/strict';
import test from 'node:test';
import { leftTag } from '../src/left.mjs';

test('leftTag wraps the supplied id', () => {
  assert.equal(leftTag('17'), 'L(17)');
});

test('leftTag preserves the 02a suffix', () => {
  assert.equal(leftTag('02a'), 'L(02a)');
});

test('leftTag preserves surrounding whitespace', () => {
  assert.equal(leftTag(' 02a '), 'L( 02a )');
});
