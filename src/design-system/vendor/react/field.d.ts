import type { ReactNode, ComponentType, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";
export const FieldLabel: ComponentType<HTMLAttributes<HTMLLabelElement> & {htmlFor?:string}>;
export const FieldDescription: ComponentType<HTMLAttributes<HTMLParagraphElement>>;
export const Field: ComponentType<Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {label:ReactNode;help?:ReactNode;error?:ReactNode;state?:string;children?:(props:InputHTMLAttributes<HTMLInputElement>)=>ReactNode}>;
