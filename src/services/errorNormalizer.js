const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
const LONG_NUMBER_PATTERN = /\b\d{3,}\b/g;
const EXCEPTION_TYPE_PATTERN = /^([\w.$]+(?:Exception|Errors?))\b/;

function nonEmptyLines(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// First line of the message; when it is only an exception header ("x.y.SomeError:"),
// the actual detail is on the next line, so include it (unless that is a stack frame).
function headline(text) {
  const [first = '', second] = nonEmptyLines(text);
  if (first.endsWith(':') && second && !second.startsWith('at ')) {
    return `${first} ${second}`;
  }
  return first;
}

function normalizeErrorMessage(rawErrorMessage) {
  if (!rawErrorMessage || !rawErrorMessage.trim()) {
    return { signature: 'NO_ERROR_MESSAGE', displayText: '(no error message)', exceptionType: null };
  }

  const firstLine = headline(rawErrorMessage);
  const exceptionMatch = firstLine.match(EXCEPTION_TYPE_PATTERN);
  const exceptionType = exceptionMatch ? exceptionMatch[1] : null;

  const normalized = firstLine
    .replace(UUID_PATTERN, '<UUID>')
    .replace(TIMESTAMP_PATTERN, '<TS>')
    .replace(LONG_NUMBER_PATTERN, '<NUM>')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    signature: normalized.toLowerCase(),
    displayText: normalized,
    exceptionType,
  };
}

module.exports = { normalizeErrorMessage };
