// src/components/ui/tooltip.tsx
"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/lib/utils";  // 假設你有 cn 工具函式（合併 className）

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
    <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
            // 核心美觀樣式
            "z-50 overflow-hidden rounded-lg border border-gray-700/60 bg-gray-900/95 px-3 py-2 text-lg font-medium text-gray-100 shadow-xl",
            "backdrop-blur-sm",                    // 毛玻璃效果（很潮）
            "transition-all duration-150 ease-out",
            // 支援暗黑/亮模式（如果有 light theme 可再調整）
            "dark:bg-gray-950/95 dark:text-gray-100 dark:border-gray-700/70",
            // 動畫（fade in + scale）
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            className
        )}
        {...props}
    >
        {children}
    </TooltipPrimitive.Content>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const TooltipArrow = TooltipPrimitive.Arrow;  // 可選：加小箭頭

export {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
    TooltipArrow,   // 如果想要小箭頭
};