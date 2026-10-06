'use client';
import type {CSSProperties} from 'react';
import Link from 'next/link';
import {Activity,BookOpen,ChevronLeft,CircleHelp,Clock3,FlaskConical,LayoutGrid,Menu,ShieldCheck} from './app-icons';
import {Sidebar,SidebarProvider,SidebarContent,SidebarHeader,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,useSidebar} from '@/components/ui/sidebar';
import {Sheet,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {SheetContent} from './localized-sheet';
import {Toaster} from 'sonner';
import {AmanahMark} from './product-mark';
import {amanah,pageNames,type AmanahPage as Page} from '@/lib/products';
import {AmanahBenchmarkProduction,AmanahDashboardProduction,AmanahNewAnalysisProduction,AmanahReviewsProduction,AmanahSourcesProduction} from './amanah-production';
import {IntegrationSettings} from './integration-settings';
import {ProductAboutProduction} from './product-about-production';
import {authClient} from '@/lib/auth-client';
import {useRouter} from 'next/navigation';

function AppNavigation({page}:{page:Page}){
 const {setOpenMobile,openMobile,isMobile}=useSidebar();const app=amanah;
 // Workflow order (B5): dashboard → new analysis → history and reviews. 'verify' is the former name of the new-analysis page.
 const navigation=[{id:'dashboard' as const,href:app.home,icon:LayoutGrid},{id:'new' as const,href:app.newAnalysis,icon:ShieldCheck},{id:'reviews' as const,href:app.history,icon:Clock3},{id:'sources' as const,href:'/amanah/sources',icon:BookOpen},{id:'settings' as const,href:'/amanah/settings',icon:Activity}];
 const active=(id:Page)=>page===id||(id==='new'&&page==='verify');
 const close=()=>setOpenMobile(false);
 const content=<><SidebarHeader><Link href={app.home} className="brand" onClick={close}><AmanahMark/><span><strong>{app.name}</strong><small>{app.tagline}</small></span></Link></SidebarHeader><SidebarContent><div className="nav-caption">{app.name}</div><SidebarMenu>{navigation.map(({id,href,icon:Icon})=><SidebarMenuItem key={id}><SidebarMenuButton asChild isActive={active(id)}><Link href={href} onClick={close} aria-current={active(id)?'page':undefined}><Icon/><span>{pageNames[id]}</span>{active(id)&&<span className="active-nav-line"/>}</Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="nav-divider"/><div className="nav-caption">معلومات</div><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={page==='benchmarks'}><Link href="/amanah/examples" onClick={close}><FlaskConical/><span>قراءة النتائج</span></Link></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton asChild isActive={page==='about'}><Link href={app.home+'/about'} onClick={close}><CircleHelp/><span>عن {app.name}</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarContent><SidebarFooter><Link href={app.home} className="sidebar-brand" onClick={close}><AmanahMark small/><span>{app.name}</span></Link><div className="px-3"><Link href={app.privacy} className="text-link" onClick={close}>سياسة الخصوصية</Link></div></SidebarFooter></>;
 return isMobile?<Sheet open={openMobile} onOpenChange={setOpenMobile}><SheetContent side="right" data-mobile="true" className="mobile-navigation product-amanah"><SheetHeader className="sr-only"><SheetTitle>التنقل في {app.name}</SheetTitle><SheetDescription>{app.description}</SheetDescription></SheetHeader><div className="mobile-nav-content">{content}</div></SheetContent></Sheet>:<Sidebar side="right" className="app-sidebar">{content}</Sidebar>;
}

function Topbar({page}:{page:Page}){const {toggleSidebar}=useSidebar();const router=useRouter();return <header className="topbar"><div className="breadcrumbs"><button aria-label="فتح القائمة" onClick={toggleSidebar} className="icon-button mobile-menu"><Menu/></button><Link href={amanah.home} className="crumb-muted">{amanah.name}</Link><ChevronLeft/><strong>{pageNames[page]}</strong></div><div className="topbar-actions"><button type="button" className="topbar-signout" onClick={async()=>{await authClient.signOut();router.replace('/login');router.refresh();}}>تسجيل الخروج</button></div></header>}

export function AmanahApp({page}:{page:Page}){
 const app=amanah;
 const content=page==='dashboard'?<AmanahDashboardProduction/>:page==='new'||page==='verify'?<AmanahNewAnalysisProduction/>:page==='reviews'?<AmanahReviewsProduction/>:page==='sources'?<AmanahSourcesProduction/>:page==='settings'?<IntegrationSettings/>:page==='benchmarks'?<AmanahBenchmarkProduction/>:<ProductAboutProduction/>;
 return <SidebarProvider className="product-shell product-amanah" style={{'--sidebar-width':'254px'} as CSSProperties}><AppNavigation page={page}/><a className="skip-link" href="#main-content">تخطي إلى المحتوى</a><div className="app-main"><Topbar page={page}/><main className="main-content" id="main-content"><div className="workspace-content">{content}</div><footer className="app-footer"><span>{app.name} <span className="footer-dot">·</span> {app.tagline}</span><span className="flex flex-wrap justify-center gap-x-4"><Link href={app.home+'/about'}>عن {app.name}</Link><Link href={app.privacy}>سياسة الخصوصية</Link></span></footer></main></div><Toaster position="bottom-center" dir="rtl" richColors closeButton/></SidebarProvider>;
}
