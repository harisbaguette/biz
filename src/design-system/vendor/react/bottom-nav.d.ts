import type { ReactNode, ComponentType, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";
export const BottomNav: ComponentType<{items:Array<{href:string;icon?:ReactNode;label:string}>;current?:string;variant?:string;label?:string;onCreate?:()=>void;createLabel?:string;createIcon?:ReactNode}>;
