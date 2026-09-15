import { waitUntil } from 'cloudflare:workers';
import { ApiRequestError, apiError, secureJson } from '../../../lib/api-security';
import { verifyWhatsAppSignature } from '../../../lib/channel-security';
import { processNativeWhatsAppMessage } from '../../../lib/native-whatsapp-service';
import { parseWhatsAppWebhook } from '../../../lib/whatsapp-transport';

export async function GET(request:Request){
  const url=new URL(request.url);
  const mode=url.searchParams.get('hub.mode');
  const token=url.searchParams.get('hub.verify_token');
  const challenge=url.searchParams.get('hub.challenge');
  if(mode!=='subscribe'||!challenge||!process.env.WHATSAPP_VERIFY_TOKEN||token!==process.env.WHATSAPP_VERIFY_TOKEN){
    return new Response('Forbidden',{status:403});
  }
  return new Response(challenge,{status:200,headers:{'content-type':'text/plain','cache-control':'no-store'}});
}

export async function POST(request:Request){
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>512_000) throw new ApiRequestError(413,'Webhook payload is too large.');
    verifyWhatsAppSignature(raw,request.headers.get('x-hub-signature-256'));
    const messages=parseWhatsAppWebhook(JSON.parse(raw) as unknown);
    for(const message of messages){
      waitUntil(processNativeWhatsAppMessage(message).catch((error)=>console.warn('[railsetu-whatsapp] message processing failed',error instanceof Error?error.name:'Error')));
    }
    return secureJson({received:true});
  }catch(error){
    return apiError(error,'WhatsApp webhook could not be accepted.');
  }
}

