import{j as e}from"./index-o4lGSIZO.js";import{r as t}from"./vendor-react-CyvzqkFf.js";function r(e){try{const t=new URL(e);return"http:"===t.protocol||"https:"===t.protocol}catch{return!1}}function i(e,t){if(!e)return e;if(!r(e))return e;const i=Math.max(64,Math.min(1920,Number(t)||800));return`/img?u=${encodeURIComponent(e)}&w=${i}`}function o({src:o,alt:s="",className:a="",style:n,width:c,height:l,priority:d=!1,loading:h,fetchpriority:u,useProxy:m=!0,sizes:p="(max-width: 420px) 414px, (max-width: 800px) 768px, 1024px",...g}){const[f,w]=t.useState(!1),[x,v]=t.useState(!1),y=o||'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="100%" height="100%" fill="%23edf2f7"/></svg>',b=m?i(y,c||(null==n?void 0:n.width)||800):y,j=m&&r(y)?function(e,t=[414,768,1024]){return t.map(t=>`${i(e,t)} ${t}w`).join(", ")}(y):void 0,N=h||(d?"eager":"lazy"),k=u||(d?"high":"auto");return e.jsxs("div",{style:{position:"relative",...n},className:a,...g,children:[!x&&e.jsx("div",{style:{position:"absolute",inset:0,background:"#edf2f7"},"aria-hidden":"true"}),f?e.jsx("div",{style:{position:"absolute",inset:0,display:"grid",placeItems:"center",background:"#e5e7eb",color:"#64748b"},children:e.jsx("span",{children:"Image unavailable"})}):e.jsx("img",{src:b,alt:s,loading:N,decoding:"async",fetchpriority:k,width:c,height:l,srcSet:j,sizes:j?p:void 0,onLoad:()=>v(!0),onError:()=>{w(!0),v(!0)},style:{width:"100%",height:"100%",objectFit:"cover",opacity:x?1:0,transition:"opacity .2s ease"}})]})}
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=(...e)=>e.filter((e,t,r)=>Boolean(e)&&""!==e.trim()&&r.indexOf(e)===t).join(" ").trim();
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var a={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const n=t.forwardRef(({color:e="currentColor",size:r=24,strokeWidth:i=2,absoluteStrokeWidth:o,className:n="",children:c,iconNode:l,...d},h)=>t.createElement("svg",{ref:h,...a,width:r,height:r,stroke:e,strokeWidth:o?24*Number(i)/Number(r):i,className:s("lucide",n),...d},[...l.map(([e,r])=>t.createElement(e,r)),...Array.isArray(c)?c:[c]])),c=(e,r)=>{const i=t.forwardRef(({className:i,...o},a)=>{return t.createElement(n,{ref:a,iconNode:r,className:s(`lucide-${c=e,c.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()}`,i),...o});var c});return i.displayName=`${e}`,i};
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */export{o as I,c};
