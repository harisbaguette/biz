import type { ReactNode, ComponentType, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";
export const Select: ComponentType<import('react').SelectHTMLAttributes<HTMLSelectElement> & {label?:ReactNode; items?:Array<{value:string;label:string;disabled?:boolean}>;help?:ReactNode;error?:ReactNode}>;
