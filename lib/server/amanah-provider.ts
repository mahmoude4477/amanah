import type {AmanahAnalyzeRequest,AmanahAnalysisResult,IntegrationStatus} from '@/lib/contracts';
import {ConfigurationError} from './env';
import {ApiError} from './http';
import {getQuranVerse,locateQuranVerse,resolveQuranSource} from './quran-source';
import {amanahMlConfig,mlEndpointState,runAmanahMlQuranAnalysis} from './amanah-ml-analysis';
import {instructionLikePhrases} from './instruction-patterns';

// Amanah analyses the Qur'an only, with the AMANAH model (measured scope v0.2: Arabic → English). Hadith and tafsir are not analysed;
// their stored checks stay readable but are never approved (app/api/amanah/checks/[id]/review/route.ts).
// Only the transport and a wake-up hint are reported; the endpoint URL and token never leave the server.
export function amanahConfiguration():IntegrationStatus['amanah']{
 const ml=amanahMlConfig();
 return {ready:Boolean(ml),mode:ml?'live':'unavailable',missing:ml?[]:['AMANAH_ML_URL'],provider:ml?'Amanah ML':'غير متصل',supportedContentTypes:['quran'],transport:ml?.transport??null,endpointState:mlEndpointState(ml)};
}

// Instruction-like or endorsement phrases in the submitted texts are attached to every result (م-13). They never change the decision.
export async function runAmanahAnalysis(input:AmanahAnalyzeRequest):Promise<AmanahAnalysisResult>{
 const result=await analyze(input);
 const warnings=instructionLikePhrases(input.title,input.translation);
 return warnings.length?{...result,instructionWarnings:warnings}:result;
}

// The verse reference decides the source: the trusted Tanzil text of that ayah is used when no Arabic text is sent, and a text that is
// sent must match it exactly (D2), otherwise the check abstains before the model is called. An unknown reference is a 400, not a check.
async function analyze(input:AmanahAnalyzeRequest):Promise<AmanahAnalysisResult>{
 const location=locateQuranVerse(input.source.locator);
 if(!location.ok)throw new ApiError(400,'INVALID_LOCATOR',location.message,{formErrors:[],fieldErrors:{locator:[location.message]}});
 const ml=amanahMlConfig();
 if(!ml)throw new ConfigurationError(['AMANAH_ML_URL']);
 const originalText=input.originalText||getQuranVerse(location.sura.number,location.ayah)?.uthmani||'';
 const resolved=resolveQuranSource({source:input.source,originalText});
 if(resolved.result)return resolved.result;
 if(!resolved.source)throw new Error('Resolved Quran source is missing');
 return runAmanahMlQuranAnalysis(input,resolved.source,ml);
}
