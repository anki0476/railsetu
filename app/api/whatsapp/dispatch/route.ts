import { apiError, secureJson } from '../../../lib/api-security';
import { deliverPendingWhatsAppEvents, requireDispatcherAuthorization } from '../../../lib/native-whatsapp-service';

export async function POST(request:Request){
  try{
    requireDispatcherAuthorization(request);
    return secureJson(await deliverPendingWhatsAppEvents());
  }catch(error){
    return apiError(error,'WhatsApp event delivery failed.');
  }
}

