import type { ConnectSessionMetadata } from '@enbox/agent';
import type { PermissionSessionGroup } from './permission-sessions';
import { truncateDid } from '@/lib/utils';

export interface SessionEnvironmentSummary {
  title: string;
  device?: string;
  browser?: string;
  os?: string;
  timezone?: string;
  language?: string;
  transport?: string;
  technicalDetails: Array<{ label: string; value: string }>;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function detectBrowser(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined;
  if (/\bEdg\//.test(userAgent)) return 'Edge';
  if (/\bOPR\//.test(userAgent)) return 'Opera';
  if (/\bCriOS\//.test(userAgent)) return 'Chrome';
  if (/\bFxiOS\//.test(userAgent)) return 'Firefox';
  if (/\bFirefox\//.test(userAgent)) return 'Firefox';
  if (/\bChrome\//.test(userAgent) || /\bChromium\//.test(userAgent)) return 'Chrome';
  if (/\bVersion\/[\d.]+.*\bSafari\//.test(userAgent)) return 'Safari';
  if (/\bSafari\//.test(userAgent)) return 'Safari';
  return undefined;
}

function detectOs(session: ConnectSessionMetadata): string | undefined {
  const source = `${session.platform ?? ''} ${session.userAgent ?? ''}`;
  if (/iPad/i.test(source)) return 'iPadOS';
  if (/iPhone/i.test(source)) return 'iOS';
  if (/Android/i.test(source)) return 'Android';
  if (/Macintosh|Mac OS X|MacIntel/i.test(source)) return 'macOS';
  if (/Windows|Win32|Win64/i.test(source)) return 'Windows';
  if (/Linux/i.test(source)) return 'Linux';
  return undefined;
}

function detectDevice(session: ConnectSessionMetadata, os: string | undefined): string | undefined {
  const source = `${session.platform ?? ''} ${session.userAgent ?? ''}`;
  if (/iPad/i.test(source)) return 'iPad';
  if (/iPhone/i.test(source)) return 'iPhone';
  if (/Android/i.test(source)) return 'Android device';
  if (/Macintosh|MacIntel/i.test(source)) return 'Mac';
  if (/Windows|Win32|Win64/i.test(source)) return 'Windows PC';
  if (/Linux/i.test(source)) return 'Linux device';
  return firstNonEmpty(session.platform, os);
}

function transportLabel(transport: ConnectSessionMetadata['transport']): string | undefined {
  switch (transport) {
    case 'postMessage':
      return 'Browser popup';
    case 'relay':
      return 'Relay';
    default:
      return undefined;
  }
}

function languageLabel(session: ConnectSessionMetadata): string | undefined {
  return firstNonEmpty(session.language, session.languages?.[0]);
}

function technicalDetails(session: ConnectSessionMetadata): Array<{ label: string; value: string }> {
  const details = [
    { label: 'Session ID', value: session.id },
    { label: 'Origin', value: session.origin },
    { label: 'Platform', value: session.platform },
    { label: 'Language', value: session.language },
    { label: 'Languages', value: session.languages?.join(', ') },
    { label: 'Timezone', value: session.timezone },
    { label: 'Transport', value: transportLabel(session.transport) ?? session.transport },
    { label: 'User agent', value: session.userAgent },
  ];

  return details.filter((detail): detail is { label: string; value: string } =>
    typeof detail.value === 'string' && detail.value.length > 0,
  );
}

export function sessionTitle(sessionGroup: PermissionSessionGroup): string {
  return sessionGroup.session.appName
    ?? sessionGroup.session.origin
    ?? truncateDid(sessionGroup.grantee);
}

export function describeConnectSession(session: ConnectSessionMetadata): SessionEnvironmentSummary {
  const browser = detectBrowser(session.userAgent);
  const os = detectOs(session);

  return {
    title            : firstNonEmpty(browser && os ? `${browser} on ${os}` : undefined, browser, os, session.platform) ?? 'Unknown device',
    device           : detectDevice(session, os),
    browser,
    os,
    timezone         : session.timezone,
    language         : languageLabel(session),
    transport        : transportLabel(session.transport),
    technicalDetails : technicalDetails(session),
  };
}
