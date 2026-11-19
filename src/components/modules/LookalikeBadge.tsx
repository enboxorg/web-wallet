import { TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';

/**
 * Marks a module whose own name would pass for a built-in one. Its name is
 * already replaced by the literal short URI; this says why.
 */
export function LookalikeBadge({ coreName }: { coreName: string }) {
  return (
    <Badge
      tone="warning"
      icon={<TriangleAlert />}
      title={`Named like the wallet's built-in ${coreName} module, but it is a different module. Its address is shown instead of its name.`}
    >
      Not the built-in {coreName}
    </Badge>
  );
}
