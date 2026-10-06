import {amanahConfiguration} from '@/lib/server/amanah-provider';
import {errorResponse,jsonResponse,requestUserId} from '@/lib/server/http';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{await requestUserId(request);return jsonResponse({amanah:amanahConfiguration()});}catch(error){return errorResponse(error);}
}
