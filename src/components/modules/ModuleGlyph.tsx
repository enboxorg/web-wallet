import { Link2, Share2, SlidersHorizontal, TriangleAlert, UserRound } from 'lucide-react';
import {
  ConnectDefinition,
  PreferencesDefinition,
  ProfileDefinition,
} from '@enbox/modules';

import { Monogram } from '@/components/ui/Monogram';
import type { ModuleDisplay } from '@/lib/module-names';

const CORE_ICONS: Record<string, React.ReactNode> = {
  [ProfileDefinition.module]     : <UserRound />,
  [ConnectDefinition.module]     : <Link2 />,
  [PreferencesDefinition.module] : <SlidersHorizontal />,
};

const LOOKALIKE_HUE = 38;

function glyphIcon(module: ModuleDisplay): React.ReactNode {
  if (module.isCore) return CORE_ICONS[module.uri];
  // A lookalike never gets an initial that could pass for the built-in tile.
  if (module.imitates) return <TriangleAlert />;
  if (module.companionOf) return <Share2 />;
  return undefined;
}

/** Visual anchor for a module row: a core icon, or a tint stable per module. */
export function ModuleGlyph({
  module,
  size = 'md',
}: {
  module: ModuleDisplay;
  size?: 'sm' | 'md';
}) {
  const icon = glyphIcon(module);

  return (
    <Monogram
      label={module.name}
      // Companions share their root's tint so the pair reads as one family.
      seed={module.companionOf ?? module.uri}
      // Lookalikes are always amber, matching their "Not the built-in" badge.
      hue={module.imitates ? LOOKALIKE_HUE : undefined}
      icon={icon}
      size={size}
    />
  );
}
