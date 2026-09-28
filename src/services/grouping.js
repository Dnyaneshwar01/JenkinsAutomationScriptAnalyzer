const { normalizeErrorMessage } = require('./errorNormalizer');

function signatureFor(failure) {
  if (failure.status === 'undefined') {
    return { signature: 'UNDEFINED_STEP', displayText: `Undefined step: ${failure.failedStep}`, exceptionType: 'Undefined' };
  }
  if (failure.status === 'pending') {
    return { signature: 'PENDING_STEP', displayText: `Pending step: ${failure.failedStep}`, exceptionType: 'Pending' };
  }
  return normalizeErrorMessage(failure.errorMessage);
}

function groupFailures(failures) {
  const groupsBySignature = new Map();

  for (const failure of failures) {
    const { signature, displayText, exceptionType } = signatureFor(failure);

    if (!groupsBySignature.has(signature)) {
      groupsBySignature.set(signature, {
        groupId: signature,
        exceptionType,
        sampleMessage: displayText,
        count: 0,
        failures: [],
      });
    }

    const group = groupsBySignature.get(signature);
    group.count += 1;
    group.failures.push(failure);
  }

  return Array.from(groupsBySignature.values()).sort((a, b) => b.count - a.count);
}

module.exports = { groupFailures };
