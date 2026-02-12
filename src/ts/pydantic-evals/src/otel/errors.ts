/**
 * An error used to provide the reason why a SpanTree was not recorded.
 * This will either be due to missing dependencies or because a tracer provider had not been set.
 */
export class SpanTreeRecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpanTreeRecordingError';
  }
}
