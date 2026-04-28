import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  pill?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, pill, children, disabled, ...props }, ref) => {
    const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:   'primary',
      secondary: 'outline',
      outline:   'outline',
      ghost:     'ghost',
      danger:    '',            // handled via inline
      accent:    'accent',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'brand-btn',
          variantClass[variant],
          size === 'sm' && 'sm',
          size === 'lg' && 'text-[14px]',
          pill && 'pill',
          className
        )}
        style={
          variant === 'danger'
            ? {
                background: 'var(--danger)',
                color: '#fff',
                borderColor: 'var(--ink)',
              }
            : undefined
        }
        {...props}
      >
        {loading ? (
          <span
            className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
