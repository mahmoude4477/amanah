'use client';
import type {ComponentProps} from 'react';
import {X} from './app-icons';
import {SheetContent as BaseSheetContent,SheetClose} from '@/components/ui/sheet';
export function SheetContent({children,...props}:ComponentProps<typeof BaseSheetContent>){return <BaseSheetContent {...props} showCloseButton={false}>{children}<SheetClose className="sheet-close-ar icon-button" aria-label="إغلاق النافذة"><X size={20}/></SheetClose></BaseSheetContent>}
