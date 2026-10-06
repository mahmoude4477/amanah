import {env} from 'cloudflare:workers';

export function runtimeValue(name:string):string{
 const value=(env as unknown as Record<string,unknown>)[name];
 if(typeof value==='string'&&value.trim())return value.trim();
 if(typeof process!=='undefined'){
  const fallback=process.env[name];
  if(fallback?.trim())return fallback.trim();
 }
 return '';
}

export class ConfigurationError extends Error{
 constructor(public missing:string[]){super(`Missing runtime configuration: ${missing.join(', ')}`);this.name='ConfigurationError';}
}

export function safeHttpsUrl(value:string,label:string):URL{
 let url:URL;
 try{url=new URL(value);}catch{throw new Error(`${label} is not a valid URL`);}
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error(`${label} must use HTTPS`);
 return url;
}
