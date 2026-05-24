"use strict";(()=>{var e={};e.id=104,e.ids=[104],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,r){return r in t?t[r]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,r)):"function"==typeof t&&"default"===r?t:void 0}}})},1115:(e,t,r)=>{r.r(t),r.d(t,{config:()=>P,default:()=>p,routeModule:()=>b});var o={};r.r(o),r.d(o,{default:()=>f});var a=r(1802),n=r(7153),s=r(6249);let i=require("@supabase/supabase-js"),u=require("nodemailer");var c=r.n(u);let l=require("crypto");var h=r.n(l);let d=(0,i.createClient)(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),m=c().createTransport({host:"smtp.porkbun.com",port:465,secure:!0,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});async function f(e,t){if("POST"!==e.method)return t.status(405).end();let{name:r,quantity:o,date:a,amount:n,email:s}=e.body;if(!r||!o||!a||!n||!s)return t.status(400).json({error:"Missing fields"});let i=h().randomBytes(5).toString("hex").toUpperCase(),u={concert_name:"Brahms club - complete chamber works",date:a,name:r,quantity:o,email:s,address:"The Chapel, The Royal Foundation of St Katharine",amount:n,ticket_number:i},{error:c}=await d.from("tickets").insert([u]);if(c)return t.status(500).json({error:"Database error"});let l={from:process.env.SMTP_USER,to:s,subject:"Your Brahms Club Ticket",text:`
Dear ${r}

Thank you for booking this concert as part of the Brahms Club's cycle of complete chamber works, generously hosted by ${u.address}.

Ticket details:

Concert series: ${u.concert_name}
Date: ${a}
Time: 2pm
Name: ${r}
Number of tickets: ${o}
Email: ${s}
Venue: ${u.address}
Donation: \xa3${n}
Ticket Number: ${i}


We look forward to welcoming you at ${u.address} on ${a}.

Please show this email or state your name at the entrance. There is no separate ticket.

"It felt strange when I beheld the wooded heights once more and walked into the magnificent forest. I have not seen nature this beautiful for a year. 
Much has changed since then. 
Yet I was completely happy. 
I only thought of music. I am in love with music, I love music, I think of nothing but, and of other things only when they make music more beautiful for me...
If it continues like this I may evaporate into a chord and float off into the air." 
-- Johannes Brahms,9 October 1859
    `};try{return await m.sendMail(l),t.status(200).json({ok:!0})}catch(e){return t.status(500).json({error:"Email error"})}}let p=(0,s.l)(o,"default"),P=(0,s.l)(o,"config"),b=new a.PagesAPIRouteModule({definition:{kind:n.x.PAGES_API,page:"/api/book",pathname:"/api/book",bundlePath:"",filename:""},userland:o})},7153:(e,t)=>{var r;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return r}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(r||(r={}))},1802:(e,t,r)=>{e.exports=r(145)}};var t=require("../../webpack-api-runtime.js");t.C(e);var r=t(t.s=1115);module.exports=r})();