import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { errorMessage } from "@/lib/api-client";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyContent>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          {description && <EmptyDescription>{description}</EmptyDescription>}
        </EmptyHeader>
        {action}
      </EmptyContent>
    </Empty>
  );
}

type ErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description={errorMessage(error)}
      className={className}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}
