class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class JenkinsAuthError extends AppError {
  constructor(message) {
    super(message, 401, 'JENKINS_AUTH_ERROR');
  }
}

class JenkinsNotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'JENKINS_NOT_FOUND');
  }
}

class ArtifactNotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'ARTIFACT_NOT_FOUND');
  }
}

class BuildInProgressError extends AppError {
  constructor(message) {
    super(message, 409, 'BUILD_IN_PROGRESS');
  }
}

class JenkinsUnreachableError extends AppError {
  constructor(message) {
    super(message, 502, 'JENKINS_UNREACHABLE');
  }
}

class MalformedReportError extends AppError {
  constructor(message) {
    super(message, 422, 'MALFORMED_REPORT');
  }
}

module.exports = {
  AppError,
  ValidationError,
  JenkinsAuthError,
  JenkinsNotFoundError,
  ArtifactNotFoundError,
  BuildInProgressError,
  JenkinsUnreachableError,
  MalformedReportError,
};
