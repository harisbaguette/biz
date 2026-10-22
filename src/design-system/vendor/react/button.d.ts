import type { ReactNode, ComponentType, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { count?: number; variant?: 'primary' | 'outline' | 'ghost'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; }
export const Button: ComponentType<ButtonProps>;
