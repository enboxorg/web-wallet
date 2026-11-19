import { Link } from 'react-router';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="eyebrow mb-4">Error 404</p>
      <span className="surface-card mb-3 flex size-16 items-center justify-center rounded-[20px] border border-border-default bg-surface-2 text-text-secondary">
        <FileQuestion className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-text-primary">Page not found</h1>
      <p className="mb-4 max-w-md text-[15px] leading-relaxed text-text-secondary">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/">
        <Button>Go to profiles</Button>
      </Link>
    </div>
  );
}
