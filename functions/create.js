import QRCode from 'qrcode';
import jpeg from 'jpeg-js';

const respond=(status,body,headers={})=>new Response(body,{status,headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff',...headers}});
const color=(v,defaultValue)=>{if(!v)return defaultValue;return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)?v:null};
const rgb=(s)=>{let h=s.slice(1);if(h.length===3)h=[...h].map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16))};
const crc=(bytes)=>{let c=-1;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^-1)>>>0};
const u32=n=>new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
const join=(...arrays)=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){out.set(a,offset);offset+=a.length}return out};
const chunk=(type,data)=>{const tag=new TextEncoder().encode(type);return join(u32(data.length),tag,data,u32(crc(join(tag,data))))};
async function png(width,height,rgba){
 const rows=new Uint8Array(height*(1+width*4));
 for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const stream=new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'));
 const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
 return join(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',join(u32(width),u32(height),new Uint8Array([8,6,0,0,0]))),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
}

const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
function safeImageURL(input){
 let url;try{url=new URL(input)}catch{return null}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return null;
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example')||host.endsWith('.onion')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host))return null;
 return url;
}
async function fetchLogo(input){
 const url=safeImageURL(input);if(!url)throw new Error('Invalid logo URL. Use a public HTTPS image URL.');
 const response=await fetch(url.toString(),{redirect:'manual',signal:AbortSignal.timeout(5000),headers:{Accept:'image/png,image/jpeg,image/webp,image/gif'}});
 if(!response.ok)throw new Error('Logo image is unavailable (HTTP '+response.status+')');
 const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type))throw new Error('Logo must be PNG, JPG, WebP or GIF');
 if(Number(response.headers.get('content-length')||0)>1048576)throw new Error('Logo exceeds 1 MB');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length>1048576)throw new Error('Logo exceeds 1 MB');
 const signature=type==='image/png'&&bytes[0]===137&&bytes[1]===80||type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216||type==='image/gif'&&bytes[0]===71&&bytes[1]===73||type==='image/webp'&&bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70;
 if(!signature)throw new Error('Invalid logo image');
 return {type,bytes,data:'data:'+type+';base64,'+base64(bytes)};
}
async function decodePng(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let width=0,height=0,depth=0,mode=0,interlace=0,palette=null,transparency=null;
 const chunks=[];let offset=8;
 while(offset+12<=bytes.length){
  const len=view.getUint32(offset),tag=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
  if(offset+12+len>bytes.length)throw new Error('Invalid PNG');
  const data=bytes.subarray(offset+8,offset+8+len);
  if(tag==='IHDR'){width=view.getUint32(offset+8);height=view.getUint32(offset+12);depth=data[8];mode=data[9];interlace=data[12]}
  if(tag==='PLTE')palette=data;
  if(tag==='tRNS')transparency=data;
  if(tag==='IDAT')chunks.push(data);
  offset+=len+12;if(tag==='IEND')break;
 }
 if(!width||!height||width*height>4000000||depth!==8||interlace!==0||![0,2,3,4,6].includes(mode))throw new Error('Unsupported PNG logo encoding');
 const channels={0:1,2:3,3:1,4:2,6:4}[mode],stride=width*channels;
 const inflated=new Uint8Array(await new Response(new Blob([join(...chunks)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
 if(inflated.length<(stride+1)*height)throw new Error('Incomplete PNG');
 const rgba=new Uint8Array(width*height*4),prev=new Uint8Array(stride);let position=0;
 for(let y=0;y<height;y++){
  const filter=inflated[position++],row=new Uint8Array(stride);
  for(let i=0;i<stride;i++){
   const a=i>=channels?row[i-channels]:0,b=prev[i],d=i>=channels?prev[i-channels]:0;
   let predictor=0;
   if(filter===1)predictor=a;else if(filter===2)predictor=b;else if(filter===3)predictor=Math.floor((a+b)/2);
   else if(filter===4){const p=a+b-d,pa=Math.abs(p-a),pb=Math.abs(p-b),pd=Math.abs(p-d);predictor=pa<=pb&&pa<=pd?a:pb<=pd?b:d}
   else if(filter!==0)throw new Error('Unsupported PNG filter');
   row[i]=(inflated[position++]+predictor)&255;
  }
  for(let x=0;x<width;x++){
   const i=x*channels,o=(y*width+x)*4;
   if(mode===6){rgba.set(row.subarray(i,i+4),o)}
   else if(mode===2){rgba.set([row[i],row[i+1],row[i+2],255],o)}
   else if(mode===0){rgba.set([row[i],row[i],row[i],255],o)}
   else if(mode===4){rgba.set([row[i],row[i],row[i],row[i+1]],o)}
   else{const idx=row[i],p=idx*3;if(!palette||p+2>=palette.length)throw new Error('Invalid PNG palette');rgba.set([palette[p],palette[p+1],palette[p+2],transparency?.[idx]??255],o)}
  }
  prev.set(row);
 }
 return {width,height,data:rgba};
}
function overlayLogo(target,size,logo,percent){
 const width=Math.max(1,Math.round(size*percent/100)),height=width;
 const left=Math.floor((size-width)/2),top=Math.floor((size-height)/2),pad=Math.max(2,Math.round(width*.08));
 // White backing preserves scan reliability.
 for(let y=Math.max(0,top-pad);y<Math.min(size,top+height+pad);y++)for(let x=Math.max(0,left-pad);x<Math.min(size,left+width+pad);x++){
  const r=Math.min(width,height)*.16+pad,ax=Math.max(left-pad+r,Math.min(left+width+pad-r,x)),ay=Math.max(top-pad+r,Math.min(top+height+pad-r,y));
  if((x-ax)**2+(y-ay)**2<=r*r){const i=(y*size+x)*4;target.set([255,255,255,255],i)}
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const r=Math.min(width,height)*.15,ax=Math.max(r,Math.min(width-r,x)),ay=Math.max(r,Math.min(height-r,y));
  if((x-ax)**2+(y-ay)**2>r*r)continue;
  const sx=Math.min(logo.width-1,Math.floor(x*logo.width/width)),sy=Math.min(logo.height-1,Math.floor(y*logo.height/height));
  const src=(sy*logo.width+sx)*4,dst=((top+y)*size+left+x)*4,alpha=logo.data[src+3]/255;
  for(let k=0;k<3;k++)target[dst+k]=Math.round(logo.data[src+k]*alpha+target[dst+k]*(1-alpha));
  target[dst+3]=255;
 }
}

export async function onRequest({request}){
 if(!['GET','HEAD'].includes(request.method))return respond(405,'GET and HEAD only',{'Allow':'GET, HEAD'});
 const p=new URL(request.url).searchParams;
 const q=p.get('q');
 const logoURL=p.get('logo')||p.get('image');
 const logoSize=Number(p.get('logoSize')||p.get('imageSize')||25);
 if(logoURL&&(!Number.isInteger(logoSize)||logoSize<10||logoSize>30))return respond(400,'logoSize must be an integer from 10 to 30');
 const rawFormat=(p.get('format')||p.get('type')||(p.has('_png')?'png':p.has('_jpg')?'jpg':'svg')).toLowerCase();
 const format=rawFormat==='jpeg'?'jpg':rawFormat;
 if(!['svg','png','jpg'].includes(format))return respond(400,'format must be svg, png or jpg');
 if(!q?.trim())return respond(400,'Missing required query parameter: q');
 if(new TextEncoder().encode(q).length>2200)return respond(413,'QR content is too long');
 const fg=color(p.get('foreground')||p.get('fg'),'#151a35'),bg=color(p.get('background')||p.get('bg'),'#ffffff'),second=color(p.get('second'),'#1463e8');
 if(!fg||!bg||!second)return respond(400,'Invalid color; use URL-encoded #RGB or #RRGGBB');
 const size=Number(p.get('size')||320),margin=Number(p.get('margin')||4),dots=p.get('dots')||'rounded',gradient=p.get('gradient')==='true';
 if(!Number.isInteger(size)||size<96||size>1200||!Number.isInteger(margin)||margin<0||margin>12)return respond(400,'Invalid size or margin');
 if(!['square','rounded','dots'].includes(dots))return respond(400,'Invalid dots pattern');
 try{
  const logo=logoURL?await fetchLogo(logoURL):null;
  if(logo&&format!=='svg'&&!['image/png','image/jpeg'].includes(logo.type))return respond(400,'PNG and JPG QR outputs currently support PNG or JPG logos; use SVG output for GIF/WebP logos');
  const qr=QRCode.create(q,{errorCorrectionLevel:'H'}),count=qr.modules.size,modules=qr.modules.data,unit=size/(count+2*margin);
  const shapes=[];
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(modules[y*count+x]){
   const px=(x+margin)*unit,py=(y+margin)*unit;
   shapes.push(dots==='dots'?'<circle cx="'+(px+unit/2)+'" cy="'+(py+unit/2)+'" r="'+(unit*.43)+'"/>':'<rect x="'+px+'" y="'+py+'" width="'+(unit+.02)+'" height="'+(unit+.02)+'" rx="'+(dots==='rounded'?unit*.28:0)+'"/>');
  }
  const defs=gradient?'<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="'+fg+'"/><stop offset="100%" stop-color="'+second+'"/></linearGradient></defs>':'';
  const logoWidth=size*logoSize/100,logoPos=(size-logoWidth)/2,logoPad=size*.015;
  const logoMarkup=logo?'<rect x="'+(logoPos-logoPad)+'" y="'+(logoPos-logoPad)+'" width="'+(logoWidth+2*logoPad)+'" height="'+(logoWidth+2*logoPad)+'" rx="'+(logoWidth*.15+logoPad)+'" fill="#ffffff"/><image x="'+logoPos+'" y="'+logoPos+'" width="'+logoWidth+'" height="'+logoWidth+'" preserveAspectRatio="xMidYMid meet" href="'+logo.data+'" clip-path="url(#logoClip)"/>':'';
  const logoDefs=logo?'<defs><clipPath id="logoClip"><rect x="'+logoPos+'" y="'+logoPos+'" width="'+logoWidth+'" height="'+logoWidth+'" rx="'+(logoWidth*.15)+'"/></clipPath></defs>':'';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+defs+logoDefs+'<rect width="100%" height="100%" fill="'+bg+'"/><g fill="'+(gradient?'url(#ink)':fg)+'">'+shapes.join('')+'</g>'+logoMarkup+'</svg>';
  if(format==='svg')return respond(200,request.method==='HEAD'?null:svg,{'Content-Type':'image/svg+xml; charset=utf-8'});
  if(request.method==='HEAD')return respond(200,null,{'Content-Type':format==='png'?'image/png':'image/jpeg'});
  const rgba=new Uint8Array(size*size*4),background=rgb(bg),start=rgb(fg),end=rgb(second);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const mx=x/unit-margin,my=y/unit-margin,ix=Math.floor(mx),iy=Math.floor(my),fx=mx-ix,fy=my-iy;
   let filled=ix>=0&&iy>=0&&ix<count&&iy<count&&!!modules[iy*count+ix];
   if(filled&&dots==='dots')filled=(fx-.5)**2+(fy-.5)**2<=.43**2;
   if(filled&&dots==='rounded'){const r=.28,cx=Math.max(r,Math.min(1-r,fx)),cy=Math.max(r,Math.min(1-r,fy));filled=(fx-cx)**2+(fy-cy)**2<=r*r}
   const t=gradient?Math.max(0,Math.min(1,(x+y)/(2*size))):0;
   const index=(y*size+x)*4;
   for(let k=0;k<3;k++)rgba[index+k]=filled?Math.round(start[k]*(1-t)+end[k]*t):background[k];
   rgba[index+3]=255;
  }
  if(logo){const decoded=logo.type==='image/png'?await decodePng(logo.bytes):jpeg.decode(logo.bytes,{useTArray:true});overlayLogo(rgba,size,decoded,logoSize)}
  const bytes=format==='png'?await png(size,size,rgba):new Uint8Array(jpeg.encode({data:rgba,width:size,height:size},90).data);
  return respond(200,bytes,{'Content-Type':format==='png'?'image/png':'image/jpeg'});
 }catch(e){console.error('QR API error',e);return respond(400,e instanceof Error?e.message:'Unable to generate QR image')}
}
