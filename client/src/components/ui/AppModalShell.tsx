import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type AppModalShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Extra classes on the dialog surface (e.g. `modal-card--wide`, `modal-card--cli-params`) */
  contentClassName?: string;
  showCloseButton?: boolean;
};

/**
 * Reso modal chrome on top of shadcn {@link Dialog} — keeps `modal-*` / App.css form styles inside the panel.
 */
export function AppModalShell({
  open,
  onOpenChange,
  titleId,
  title,
  description,
  children,
  contentClassName,
  showCloseButton = false,
}: AppModalShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(
          'modal-card gap-0 p-[1.35rem_1.4rem_1.5rem] text-[var(--text)] shadow-[var(--shadow-md)] sm:max-w-[420px]',
          contentClassName
        )}
      >
        <DialogHeader className="gap-0 text-left">
          <DialogTitle
            id={titleId}
            className="modal-title font-sans text-[1.15rem] font-bold tracking-tight text-[var(--text)]"
          >
            {title}
          </DialogTitle>
          {description != null ? (
            <DialogDescription className="modal-desc text-[0.82rem] leading-snug text-[var(--text-muted)]">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
