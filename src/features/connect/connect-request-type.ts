export type ConnectRequestType = 'connect' | 'refresh';

/** Reads the optional request type without requiring the latest Connect typings. */
export function getConnectRequestType(request: unknown): ConnectRequestType | undefined {
  if (typeof request !== 'object' || request === null) return undefined;

  const requestType = (request as { requestType?: unknown }).requestType;
  return requestType === 'connect' || requestType === 'refresh'
    ? requestType
    : undefined;
}

/** Validates the forward-compatible field at the wallet request boundary. */
export function assertConnectRequestType(request: unknown): ConnectRequestType | undefined {
  if (typeof request !== 'object' || request === null) return undefined;

  const requestType = (request as { requestType?: unknown }).requestType;
  if (requestType === undefined || requestType === 'connect' || requestType === 'refresh') {
    return requestType;
  }

  throw new Error("The connection request type must be 'connect' or 'refresh'.");
}
