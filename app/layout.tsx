import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'أمانة | تحقق من المعنى',description:'أمانة لفحص الترجمة ومراجعة سلامة المعنى بالرجوع إلى النص الأصلي والمصدر.',icons:{icon:'/amanah-icon.svg',shortcut:'/amanah-icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="ar" dir="rtl"><body>{children}</body></html>}
