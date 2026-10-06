import {workspaceDb} from '@/db/workspace';
import {ApiError,assertSameOrigin,errorResponse,jsonResponse,requestUserId} from '@/lib/server/http';

export const dynamic='force-dynamic';
// Only the creator may delete a check; another user's id answers 404 so existence is not revealed.
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  assertSameOrigin(request);const userId=await requestUserId(request);const {id}=await params;
  const result=await workspaceDb().prepare('DELETE FROM amanah_checks WHERE id = ? AND user_id = ?').bind(id,userId).run();
  if(!result.meta.changes)throw new ApiError(404,'CHECK_NOT_FOUND','الفحص غير موجود.');
  return jsonResponse({id,deleted:true});
 }catch(error){return errorResponse(error);}
}
