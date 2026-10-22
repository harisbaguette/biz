import type { ReactNode, ComponentType, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";
export const Input: ComponentType<InputHTMLAttributes<HTMLInputElement> & {look?: 'box' | 'filled'}>;
export const InputGroup: ComponentType<HTMLAttributes<HTMLSpanElement>>;
export const InputTool: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
