import {getQuranVerse,listQuranSuras,locateQuranVerse} from '@/lib/server/quran-source';
import {errorResponse,jsonResponse,requestUserId} from '@/lib/server/http';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  await requestUserId(request);
  const params=new URL(request.url).searchParams;
  const locator=params.get('locator');
  if(locator!==null){
   const location=locateQuranVerse(locator.slice(0,200));
   if(!location.ok)return jsonResponse({error:location.message,code:'INVALID_LOCATOR'},400);
   return jsonResponse({verse:getQuranVerse(location.sura.number,location.ayah)});
  }
  if(!params.has('sura')&&!params.has('ayah'))return jsonResponse({suras:listQuranSuras()});
  const sura=params.get('sura')??'';
  const ayah=params.get('ayah')??'';
  const verse=/^\d{1,3}$/.test(sura)&&/^\d{1,3}$/.test(ayah)?getQuranVerse(Number(sura),Number(ayah)):null;
  if(!verse)return jsonResponse({error:'لم يُعثر على الآية المحددة. اختر سورة من 1 إلى 114 ورقم آية موجودًا فيها.'},404);
  return jsonResponse({verse});
 }catch(error){return errorResponse(error);}
}
