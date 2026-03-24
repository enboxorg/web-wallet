import { Link } from 'react-router';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <FileQuestion size={48} className="text-text-ghost" />
      <h1 className="text-2xl font-semibold text-text-primary">Page not found</h1>
      <p className="text-sm text-text-secondary max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/">
        <Button>Go to Identities</Button>
      </Link>
    </div>
  );
}
