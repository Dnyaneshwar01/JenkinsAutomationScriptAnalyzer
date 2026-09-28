const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeErrorMessage } = require('../../src/services/errorNormalizer');

test('collapses timeout errors with different line numbers to the same signature', () => {
  const a = normalizeErrorMessage('org.openqa.selenium.TimeoutException: Waiting for element\n\tat Page.java:42');
  const b = normalizeErrorMessage('org.openqa.selenium.TimeoutException: Waiting for element\n\tat Page.java:99');
  assert.equal(a.signature, b.signature);
  assert.equal(a.exceptionType, 'org.openqa.selenium.TimeoutException');
});

test('collapses UUIDs and timestamps to the same signature', () => {
  const a = normalizeErrorMessage('RuntimeException: session 3f2504e0-4f89-11d3-9a0c-0305e82c3301 at 2024-01-01T10:00:00Z');
  const b = normalizeErrorMessage('RuntimeException: session 9c858901-8a57-4791-81fe-4c455b099bc9 at 2024-06-15T22:30:05Z');
  assert.equal(a.signature, b.signature);
});

test('keeps distinct exceptions in separate signatures', () => {
  const a = normalizeErrorMessage('java.lang.AssertionError: expected true but found false');
  const b = normalizeErrorMessage('org.openqa.selenium.TimeoutException: Waiting for element');
  assert.notEqual(a.signature, b.signature);
});

test('uses the next line when the first line is only an exception header', () => {
  const result = normalizeErrorMessage('x.errors.AutomationErrors: \nERROR: Timeout after 120s\nBuild info: version');
  assert.equal(result.displayText, 'x.errors.AutomationErrors: ERROR: Timeout after 120s');
  assert.equal(result.exceptionType, 'x.errors.AutomationErrors');
});

test('does not append a stack frame to a bare exception header', () => {
  const result = normalizeErrorMessage('java.lang.AssertionError:\n\tat org.junit.Assert.fail(Assert.java:87)');
  assert.equal(result.displayText, 'java.lang.AssertionError:');
});

test('handles missing error message', () => {
  const result = normalizeErrorMessage('');
  assert.equal(result.signature, 'NO_ERROR_MESSAGE');
});
