import { Badge } from '@/components/ui/Badge';

/**
 * Marks a module that is not one of the wallet's built-in definitions. A
 * module is keyed by its URI, so whatever it calls itself, this is what tells
 * it apart from Profile, Connect or Preferences.
 */
export function ThirdPartyBadge({ uri }: { uri?: string }) {
  return (
    <Badge
      variant="outline"
      title={`Not built into the wallet. Identified by its module URI${uri ? `: ${uri}` : '.'}`}
    >
      Third-party
    </Badge>
  );
}
