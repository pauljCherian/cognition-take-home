export class DeniedError extends Error {
  status = 403;
  constructor(
    public kind: "read_scope" | "write_scope" | "role" | "limit" | "self_approval" | "input" | "state",
    message: string,
  ) {
    super(message);
  }
}
