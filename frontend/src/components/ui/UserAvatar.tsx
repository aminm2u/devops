import { cn } from '@/lib/utils';

interface UserAvatarProps {
  user: { id: number; name: string; email: string } | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export function UserAvatar({ user, size = 'md', className }: UserAvatarProps) {
  if (!user) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium',
          sizeClasses[size],
          className
        )}
      >
        ?
      </div>
    );
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/10 text-primary font-medium',
        sizeClasses[size],
        className
      )}
      title={`${user.name} (${user.email})`}
    >
      {initials}
    </div>
  );
}
