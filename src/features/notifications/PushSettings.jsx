import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
const VAPID_PUBLIC_KEY='BFtCcBjsSsNv7fGWMimDNQ8EM8KzhVGCb3LmxLER7doM5d1RVNqtDJvN0RKWkqnoCtWr5XpTiRtPpzQJ_2Ykdes';
const decodeKey=value=>Uint8Array.from(atob((value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export default function PushSettings({userId,showToast,reportError}){
 const [supported,setSupported]=useState(false),[subscribed,setSubscribed]=useState(false),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false);
 const refresh=async()=>{const ok='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;setSupported(ok);if(!ok)return;setBlocked(Notification.permission==='denied');const reg=await navigator.serviceWorker.ready;setSubscribed(!!(await reg.pushManager.getSubscription())&&Notification.permission==='granted');};
 useEffect(()=>{refresh().catch(reportError);},[]);
 const enable=async()=>{setBusy(true);try{if(await Notification.requestPermission()!=='granted')throw new Error('لم يُسمح بالإشعارات. فعّلها من إعدادات المتصفح.');const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(VAPID_PUBLIC_KEY)});const {error}=await supabase.from('push_subscriptions').upsert({user_id:userId,endpoint:sub.endpoint,subscription_data:sub.toJSON()},{onConflict:'endpoint'});if(error)throw error;showToast('تم تفعيل الإشعارات');await refresh();}catch(e){reportError(e);}finally{setBusy(false);}};
 const disable=async()=>{setBusy(true);try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub){const {error}=await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)throw error;await sub.unsubscribe();}showToast('تم إيقاف الإشعارات');await refresh();}catch(e){reportError(e);}finally{setBusy(false);}};
 if(!supported)return <p className="mu">{/iphone|ipad|ipod/i.test(navigator.userAgent)&&!navigator.standalone?'على الأيفون: افتح الموقع بسفاري، اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من الشاشة الرئيسية لتفعيل الإشعارات.':'متصفحك لا يدعم الإشعارات.'}</p>;
 if(blocked)return <p className="mu">الإشعارات محظورة. فعّلها من إعدادات المتصفح لهذا الموقع.</p>;
 return subscribed?<><p className="success-text">الإشعارات مفعّلة على هذا الجهاز</p><button className="sm ghost" disabled={busy} onClick={disable}>إيقاف</button></>:<><p className="mu">فعّل الإشعارات حتى تصلك تنبيهات الكوستر وهذا التطبيق مغلق.</p><button className="full" disabled={busy} onClick={enable}>تفعيل الإشعارات</button></>;
}
