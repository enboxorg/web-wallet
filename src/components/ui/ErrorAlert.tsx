import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorAlertProps {
  message: string;
  className?: string;
}

export function ErrorAlert({ message, className }: ErrorAlertProps) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4',
      className,
    )} role="alert">
      <AlertCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
      <p className="text-sm text-error">{message}</p>
    </div>
  );
}
