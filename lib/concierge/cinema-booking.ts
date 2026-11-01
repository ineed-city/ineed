// Cinema City's feed still includes an obsolete /api/order entry point.
// Normalize saved answers too, without allowing arbitrary redirect destinations.
export function cinemaBookingUrl(value:string|undefined):string|undefined {
  if(!value)return undefined;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return undefined;
    if(u.hostname==='www.cinemacity.ro'&&/^\/ro\/booking-router\/launch\/\d+\/\d+$/.test(u.pathname))return u.href;
    if(u.hostname==='tickets.cinemacity.ro'&&/^\/(?:api\/)?order\/\d+$/.test(u.pathname)) {
      u.pathname=u.pathname.replace('/api/order/','/order/');return u.href;
    }
  }catch{}
  return undefined;
}
