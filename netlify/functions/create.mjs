import QRCode from 'qrcode';

// Public, read-only image endpoint. No user data is stored.
const reply=(status,body,headers={})=>new Response(body,{status,headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff',...headers}});
const parseColor=(value,fallback)=>{if(!value)return fallback;const v=value.trim();return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)?v:null};
const xml=(value)=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export default async (request)=>{
 if(request.method!=='GET'&&request.method!=='HEAD')return reply(405,'GET only',{'Content-Type':'text/plain; charset=utf-8','Allow':'GET, HEAD'});
 const params=new URL(request.url).searchParams;
 const q=params.get('q');
 const logoURL=params.get('logo')||params.get('image');
 const logoSize=Number(params.get('logoSize')||params.get('imageSize')||25);
 if(logoURL&&(!Number.isInteger(logoSize)||logoSize<10||logoSize>30))return reply(400,'logoSize must be an integer from 10 to 30');
 const requestedFormat=(params.get('format')||params.get('type')||(params.has('_png')?'png':params.has('_jpg')?'jpg':params.has('_svg')?'svg':'svg')).toLowerCase();
 const format=requestedFormat==='jpeg'?'jpg':requestedFormat;
 if(!['svg','png','jpg'].includes(format))return reply(400,'format must be svg, png, or jpg',{'Content-Type':'text/plain; charset=utf-8'});
 if(!q||!q.trim())return reply(400,'Missing required query parameter: q',{'Content-Type':'text/plain; charset=utf-8'});
 if(new TextEncoder().encode(q).length>2200)return reply(413,'QR content is too long',{'Content-Type':'text/plain; charset=utf-8'});
 const foreground=parseColor(params.get('foreground')||params.get('fg'),'#151a35');
 const background=parseColor(params.get('background')||params.get('bg'),'#ffffff');
 const second=parseColor(params.get('second'),'#1463e8');
 if(!foreground||!background||!second)return reply(400,'Colors must be #RGB or #RRGGBB (URL-encode # as %23)',{'Content-Type':'text/plain; charset=utf-8'});
 const size=Number(params.get('size')||320),margin=Number(params.get('margin')||4);
 if(!Number.isInteger(size)||size<96||size>1200||!Number.isInteger(margin)||margin<0||margin>12)return reply(400,'size must be 96–1200; margin must be 0–12',{'Content-Type':'text/plain; charset=utf-8'});
 const dots=params.get('dots')||'rounded';
 if(!['square','rounded','dots'].includes(dots))return reply(400,'dots must be square, rounded or dots',{'Content-Type':'text/plain; charset=utf-8'});
 const gradient=params.get('gradient')==='true';
 try{
  let logo=null;
  if(logoURL){
   let url;try{url=new URL(logoURL)}catch{return reply(400,'Invalid logo URL')}
   const host=url.hostname.toLowerCase().replace(/\\.$/,'');
   if(url.protocol!=='https:'||url.username||url.password||!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.onion')||host.includes(':')||/^\\d+(?:\\.\\d+){3}$/.test(host))return reply(400,'Logo must use a public HTTPS image URL');
   const response=await fetch(url.toString(),{redirect:'manual',signal:AbortSignal.timeout(5000),headers:{Accept:'image/png,image/jpeg,image/webp,image/gif'}});
   if(!response.ok)return reply(400,'Could not fetch logo image');
   const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type)||Number(response.headers.get('content-length')||0)>1048576)return reply(400,'Logo must be a PNG, JPG, WebP or GIF under 1 MB');
   const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>1048576)return reply(400,'Logo exceeds 1 MB');
   logo={type,bytes};
  }
  const qr=QRCode.create(q,{errorCorrectionLevel:'H'});
  const count=qr.modules.size,modules=qr.modules.data,total=count+margin*2,unit=size/total;
  const shapes=[];
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(modules[y*count+x]){
   const px=(x+margin)*unit,py=(y+margin)*unit;
   if(dots==='dots'){shapes.push('<circle cx="'+(px+unit/2)+'" cy="'+(py+unit/2)+'" r="'+(unit*.43)+'"/>')}
   else{const radius=dots==='rounded'?unit*.28:0;shapes.push('<rect x="'+px+'" y="'+py+'" width="'+(unit+.02)+'" height="'+(unit+.02)+'" rx="'+radius+'"/>')}
  }
  const defs=gradient?'<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="'+xml(foreground)+'"/><stop offset="100%" stop-color="'+xml(second)+'"/></linearGradient></defs>':'';
  const logoWidth=size*logoSize/100,logoPos=(size-logoWidth)/2,logoPad=size*.015;
  const logoMarkup=logo?'<rect x="'+(logoPos-logoPad)+'" y="'+(logoPos-logoPad)+'" width="'+(logoWidth+logoPad*2)+'" height="'+(logoWidth+logoPad*2)+'" rx="'+(logoWidth*.15+logoPad)+'" fill="#ffffff"/><image x="'+logoPos+'" y="'+logoPos+'" width="'+logoWidth+'" height="'+logoWidth+'" preserveAspectRatio="xMidYMid meet" href="data:'+logo.type+';base64,'+logo.bytes.toString('base64')+'" clip-path="url(#logoClip)"/>':'';
  const logoDefs=logo?'<defs><clipPath id="logoClip"><rect x="'+logoPos+'" y="'+logoPos+'" width="'+logoWidth+'" height="'+logoWidth+'" rx="'+(logoWidth*.15)+'"/></clipPath></defs>':'';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" role="img" aria-label="QR code">'+defs+logoDefs+'<rect width="100%" height="100%" fill="'+xml(background)+'"/><g fill="'+(gradient?'url(#ink)':xml(foreground))+'">'+shapes.join('')+'</g>'+logoMarkup+'</svg>';
  if(format==='svg')return reply(200,request.method==='HEAD'?null:svg,{'Content-Type':'image/svg+xml; charset=utf-8','Content-Disposition':'inline; filename="open-qr.svg"'});
  // Convert the same styled SVG into a raster image, retaining the QR design.
  const {default:sharp}=await import('sharp');
  const raster=sharp(Buffer.from(svg));
  const output=format==='png'?await raster.png().toBuffer():await raster.flatten({background}).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer();
  return reply(200,request.method==='HEAD'?null:output,{'Content-Type':format==='png'?'image/png':'image/jpeg','Content-Disposition':'inline; filename="open-qr.'+format+'"'});
 }catch(error){console.error('QR generation failed',error);return reply(400,'Unable to encode this QR content',{'Content-Type':'text/plain; charset=utf-8'})}
};
export const config={path:'/create'};
