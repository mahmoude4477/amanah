import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAuth} from './auth';

export async function requirePageSession(){
 const session=await getAuth().api.getSession({headers:await headers()});
 if(!session)redirect('/login');
 return session;
}
