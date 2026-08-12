import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';

export interface RefreshUnavailableReason {
  appName: string;
  detection: ConnectRefreshDetection;
  lookupError: boolean;
  ownerSupported: boolean;
}

export function refreshUnavailableMessage({
  appName,
  detection,
  lookupError,
  ownerSupported,
}: RefreshUnavailableReason): string {
  if (lookupError) {
    return `The wallet could not verify the previous connection, so access for ${appName} cannot be renewed. Ask the app to start a new connection.`;
  }

  switch (detection.matchState) {
    case 'not-found':
      return `${appName} is trying to renew a connection that does not exist in this wallet. It may have been approved in a different wallet, or the profile it used was deleted. Ask the app to sign out and connect again.`;
    case 'ambiguous':
      return `The previous connection for ${appName} is linked to more than one profile in this wallet, so the wallet cannot safely choose which one to renew. Ask the app to start a new connection.`;
    case 'profile-mismatch':
      return `This request names a different profile than the one ${appName} connected with before, so the connection cannot be renewed. Ask the app to start a new connection.`;
    default:
      return ownerSupported
        ? `This connection cannot be renewed. Ask ${appName} to start a new connection.`
        : `${appName} no longer supports the profile used by the previous connection, so it cannot be renewed. Ask the app to start a new connection.`;
  }
}
