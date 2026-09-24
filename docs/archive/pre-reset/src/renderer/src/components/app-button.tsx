import React from 'react'
import { Button as UiButton } from '@/components/ui/button'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Props = Omit<React.ComponentProps<typeof UiButton>, 'variant'> & { variant?: Variant }

export function Button({ children, variant = 'secondary', className = '', ...props }: Props) {
  const uiVariant = variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : variant
  return <UiButton variant={uiVariant} className={`button ${variant} ${className}`} {...props}>{children}</UiButton>
}
