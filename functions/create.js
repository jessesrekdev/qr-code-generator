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
export async function onRequest({request}){
 if(!['GET','HEAD'].includes(request.method))return respond(405,'GET and HEAD only',{'Allow':'GET, HEAD'});
 const p=new URL(request.url).searchParams;
 const q=p.get('q');
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
  const qr=QRCode.create(q,{errorCorrectionLevel:'H'}),count=qr.modules.size,modules=qr.modules.data,unit=size/(count+2*margin);
  const shapes=[];
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(modules[y*count+x]){
   const px=(x+margin)*unit,py=(y+margin)*unit;
   shapes.push(dots==='dots'?'<circle cx="'+(px+unit/2)+'" cy="'+(py+unit/2)+'" r="'+(unit*.43)+'"/>':'<rect x="'+px+'" y="'+py+'" width="'+(unit+.02)+'" height="'+(unit+.02)+'" rx="'+(dots==='rounded'?unit*.28:0)+'"/>');
  }
  const defs=gradient?'<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="'+fg+'"/><stop offset="100%" stop-color="'+second+'"/></linearGradient></defs>':'';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+defs+'<rect width="100%" height="100%" fill="'+bg+'"/><g fill="'+(gradient?'url(#ink)':fg)+'">'+shapes.join('')+'</g></svg>';
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
  const bytes=format==='png'?await png(size,size,rgba):new Uint8Array(jpeg.encode({data:rgba,width:size,height:size},90).data);
  return respond(200,bytes,{'Content-Type':format==='png'?'image/png':'image/jpeg'});
 }catch(e){console.error('QR API error',e);return respond(400,'Unable to generate QR image')}
}
