import type { ReactNode, ComponentType, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";
export const Dialog: ComponentType<{title?:string;children?:ReactNode;trigger?:ReactNode;confirmLabel?:string;open?:boolean;defaultOpen?:boolean;onOpenChange?:(value:boolean)=>void;onConfirm?:()=>void;drawer?:boolean}>;
