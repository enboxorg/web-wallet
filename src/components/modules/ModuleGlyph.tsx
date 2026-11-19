import { Link2, Share2, SlidersHorizontal, UserRound } from 'lucide-react';
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

/** Visual anchor for a module row: a core icon, or a tint stable per module. */
export function ModuleGlyph({
  module,
  size = 'md',
}: {
  module: ModuleDisplay;
  size?: 'sm' | 'md';
}) {
  const icon = module.isCore
    ? CORE_ICONS[module.uri]
    : module.companionOf ? <Share2 /> : undefined;

  return (
    <Monogram
      label={module.name}
      // Companions share their root's tint so the pair reads as one family.
      seed={module.companionOf ?? module.uri}
      icon={icon}
      size={size}
    />
  );
}
