export const metadata={icons:{icon:'/amanah-icon.svg',shortcut:'/amanah-icon.svg'}};
import {requirePageSession} from '@/lib/server/page-session';
export default async function ProductLayout({children}:{children:React.ReactNode}){await requirePageSession();return children;}
