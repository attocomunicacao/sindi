import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-center text-sm leading-5 font-medium transition-colors [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:pointer-events-none disabled:opacity-40', {
  variants: { variant: { default: 'bg-primary text-on-primary hover:bg-primary-hover', ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900', outline: 'border border-slate-300 bg-surface text-slate-800 hover:bg-slate-100' }, size: { default: 'min-h-10 px-4 py-2 pointer-coarse:min-h-11', icon: 'size-9 pointer-coarse:size-11' } },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
