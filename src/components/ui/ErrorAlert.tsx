import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorAlertProps {
  message: string;
  className?: string;
}

export function ErrorAlert({ message, className }: ErrorAlertProps) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-2xl border border-error/30 bg-error/[0.07] p-4',
      className,
    )} role="alert">
      <AlertCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
      <p className="text-sm leading-relaxed text-error">{message}</p>
    </div>
  );
}
