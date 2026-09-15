import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWhatsAppSignature } from '../app/lib/channel-security';
import { parseWhatsAppWebhook } from '../app/lib/whatsapp-transport';

const priorSecret=process.env.WHATSAPP_APP_SECRET;
process.env.WHATSAPP_APP_SECRET='test-meta-app-secret';

const payload=JSON.stringify({
  object:'whatsapp_business_account',
  entry:[{changes:[{value:{metadata:{phone_number_id:'123456789'},messages:[
    {id:'wamid.test_123',from:'919876543210',timestamp:'1789401600',type:'text',text:{body:'Book Delhi to Patna'}},
    {id:'wamid.button_456',from:'919876543210',timestamp:'1789401601',type:'interactive',interactive:{button_reply:{id:'confirm',title:'Confirm'}}},
  ]}}]}],
});
const signature=`sha256=${createHmac('sha256',process.env.WHATSAPP_APP_SECRET).update(payload).digest('hex')}`;
assert.doesNotThrow(()=>verifyWhatsAppSignature(payload,signature));
assert.throws(()=>verifyWhatsAppSignature(`${payload} `,signature));

const parsed=parseWhatsAppWebhook(JSON.parse(payload));
assert.equal(parsed.length,2);
assert.deepEqual(parsed[0],{
  id:'wamid.test_123',senderId:'919876543210',accountId:'123456789',conversationId:'919876543210',text:'Book Delhi to Patna',timestamp:1789401600000,
});
assert.equal(parsed[1].text,'Confirm');
assert.deepEqual(parseWhatsAppWebhook({object:'page',entry:[]}),[]);

if(priorSecret===undefined) delete process.env.WHATSAPP_APP_SECRET;
else process.env.WHATSAPP_APP_SECRET=priorSecret;
console.log('WhatsApp gateway signature and payload tests passed.');

