import {env} from 'cloudflare:workers';
import {betterAuth} from 'better-auth';
import {admin} from 'better-auth/plugins';
import {defaultAc,userAc} from 'better-auth/plugins/admin/access';
import {workspaceDb} from '@/db/workspace';

// Deleting an account (by the user, or by an admin through the database hook) removes the user's checks, and the rows the
// earlier products (workspaces, nabd_runs) stored under the same user id. The legacy tables themselves are kept;
// drop their two statements here in the same change that drops the tables.
// Reviews the user made on other people's checks keep reviewed_by as a bare id; the reviewer join then returns null.
const userTables=['amanah_checks','workspaces','nabd_runs'] as const;
export async function deleteUserData(database:D1Database,userId:string){await database.batch(userTables.map(table=>database.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)));}

// The admin role keeps every default permission except impersonation: an impersonated reviewer could otherwise approve an
// official check in someone else's name. lib/server/http.ts also refuses any session that carries impersonatedBy.
const adminRole=defaultAc.newRole({user:['create','list','set-role','ban','delete','set-password','set-email','get','update'],session:['list','revoke','delete']});

// The client IP is read from Cloudflare's header only so Better Auth can rate-limit sign-in attempts in memory; it is never stored with a session.
const withoutIp=async<T extends Record<string,unknown>>(session:T)=>('ipAddress' in session?{data:{...session,ipAddress:''}}:undefined);
// Explicit, because Better Auth enables rate limiting by default only when NODE_ENV is 'production', which the Worker never sets.
// Sign-in keeps Better Auth's own rule (3 attempts per 10 s per address); deleting the account also checks the password, so it gets a rule too.
export const authRateLimit={enabled:true,window:10,max:100,customRules:{'/delete-user':{window:60,max:3}}};

export function createAuth(database:D1Database,secret:string){
 if(secret.length<32)throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
 return betterAuth({
  appName:'أمانة',
  database,
  secret,
  baseURL:{allowedHosts:['ma.mahmoude4477.workers.dev','*-ma.mahmoude4477.workers.dev','localhost:*','127.0.0.1:*'],protocol:'auto'},
  emailAndPassword:{enabled:true,disableSignUp:true},
  advanced:{ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
  rateLimit:authRateLimit,
  user:{deleteUser:{enabled:true,beforeDelete:async user=>{await deleteUserData(database,user.id);}}},
  databaseHooks:{user:{delete:{after:async user=>{await deleteUserData(database,user.id);}}},session:{create:{before:withoutIp},update:{before:withoutIp}}},
  plugins:[admin({roles:{admin:adminRole,user:userAc}})],
 });
}

export function getAuth(){return createAuth(workspaceDb(),env.BETTER_AUTH_SECRET||'');}
