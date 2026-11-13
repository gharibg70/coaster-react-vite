import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { supabase } from '../../lib/supabase.js';

export default function BusMap({ reportError }) {
  const node=useRef(null), map=useRef(null), marker=useRef(null), [location,setLocation]=useState(null);
  useEffect(()=>{
    if(!node.current)return;
    const instance=L.map(node.current).setView([36.62,43.05],8); map.current=instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(instance);
    supabase.from('bus_location').select('*').eq('id',1).maybeSingle().then(({data,error})=>{if(error)reportError(error);if(data)setLocation(data);});
    const channel=supabase.channel('bus-loc').on('postgres_changes',{event:'UPDATE',schema:'public',table:'bus_location'},payload=>setLocation(payload.new)).subscribe();
    return()=>{supabase.removeChannel(channel);instance.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!location||!map.current||location.lat==null||location.lng==null)return;
    if(!location.is_sharing){marker.current?.remove();marker.current=null;return;}
    const icon=L.divIcon({className:'',html:'<div class="busmk"><i class="fa-solid fa-bus"></i></div>',iconSize:[40,40],iconAnchor:[20,20]});
    if(!marker.current){marker.current=L.marker([location.lat,location.lng],{icon}).addTo(map.current);map.current.setView([location.lat,location.lng],15);}else marker.current.setLatLng([location.lat,location.lng]).setIcon(icon);
  },[location]);
  const age=location?.updated_at?Math.max(0,Math.floor((Date.now()-new Date(location.updated_at))/1000)):null;
  const live=location?.is_sharing&&location?.lat!=null&&age<120;
  return <><div className={`alert ${live?'ok':''}`}>{!location?'جاري تحميل الموقع…':!location.is_sharing?'صاحب الكوستر لا يشارك موقعه حالياً.':live?`الموقع مباشر · آخر تحديث قبل ${age<60?'ثوانٍ':Math.floor(age/60)+' دقيقة'}`:`انقطع التحديث · آخر موقع قبل ${age<60?'ثوانٍ':Math.floor(age/60)+' دقيقة'}`}</div><div id="map" ref={node}/><button className="sm ghost full" style={{marginTop:12}} onClick={()=>location?.lat!=null&&map.current?.setView([location.lat,location.lng],15)}>الذهاب إلى الكوستر</button></>;
}
