import {waitUntil} from 'cloudflare:workers';
import {amanahMlConfig,startMlWarmup} from '@/lib/server/amanah-ml-analysis';
import {assertSameOrigin,errorResponse,jsonResponse,requestSession} from '@/lib/server/http';

export const dynamic='force-dynamic';
// Wakes a scale-to-zero AMANAH model endpoint before the first check (the new-analysis page calls it once when it opens).
// One minimal real request (verse 1:1) runs after the response through waitUntil, at most once every 4 minutes per isolate.
// The model answer is never returned or stored, no check is read or written, and the endpoint URL and token stay on the server.
export async function POST(request:Request){
 try{
  assertSameOrigin(request);await requestSession(request);
  const config=amanahMlConfig();
  return jsonResponse({started:config?startMlWarmup(config,waitUntil):false},202);
 }catch(error){return errorResponse(error);}
}
