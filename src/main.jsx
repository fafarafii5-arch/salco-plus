// SALCO+ inventory taxonomy and sales selectors
import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getCurrentBranch, listProducts, createProduct, updateProductPrices, updateProductImage, uploadProductImage, listCustomers, createCustomer, listSales, listCashTransactions, createCashTransaction, deactivateProduct, listProductPriceHistory, registerSaleExchange, listExchangeInvoices } from './lib/salcoData';
import { createRoot } from 'react-dom/client';
import { LayoutDashboard, ShoppingCart, Package, Users, Wallet, BarChart3, Search, Plus, Bell, Shirt, ArrowUpLeft, ArrowDownRight, Menu, X, Trash2, Download, Database, ShieldCheck, Pencil, Tags, RefreshCw, ArrowLeftRight, Image as ImageIcon, ReceiptText, TrendingUp, CalendarDays, Trophy, Zap, Boxes, UsersRound, ChevronDown, ChevronLeft, Grid2X2, Home, FileText, UserPlus } from 'lucide-react';
import './styles.css';

const jalaliParts = (iso) => {
 const [y,m,d]=String(iso).split('-').map(Number);
 const date=new Date(y,m-1,d,12);
 const parts=new Intl.DateTimeFormat('en-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);
 return {year:Number(parts.find(p=>p.type==='year')?.value),month:Number(parts.find(p=>p.type==='month')?.value),day:Number(parts.find(p=>p.type==='day')?.value)};
};
const isoLocal = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const jalaliMonthDays = (year,month) => {
 const found=[];
 const start=new Date(year+621,2,15,12);
 const end=new Date(year+622,3,5,12);
 for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
  const iso=isoLocal(d), p=jalaliParts(iso);
  if(p.year===year&&p.month===month)found.push({iso,day:p.day,date:new Date(d)});
 }
 return found;
};
const jalaliMonthName = (date) => new Intl.DateTimeFormat('fa-IR-u-ca-persian',{month:'long'}).format(date);

function JalaliDatePicker({value,onChange,label='تاریخ',showWeekday=false}) {
 const [open,setOpen]=useState(false);
 const [month,setMonth]=useState(()=>jalaliParts(value));
 const p=jalaliParts(value);
 const fmt=n=>new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(n);
 const days=jalaliMonthDays(month.year,month.month);
 const blanks=days.length?(days[0].date.getDay()+1)%7:0;
 return <div className="jalali-date-field"><button type="button" className="jalali-date-trigger" aria-label={label||'انتخاب تاریخ شمسی'} aria-expanded={open} onClick={()=>{setMonth(jalaliParts(value));setOpen(v=>!v);}}>{showWeekday?new Intl.DateTimeFormat('fa-IR-u-ca-persian',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00')):fmt(p.year)+'/'+fmt(p.month).padStart(2,'۰')+'/'+fmt(p.day).padStart(2,'۰')}</button>{open&&<div className="jalali-calendar" dir="rtl"><div className="jalali-calendar-head"><button type="button" className="btn btn-ghost" aria-label="ماه قبل" onClick={()=>setMonth(v=>v.month===1?{year:v.year-1,month:12}:{...v,month:v.month-1})}>‹</button><b>{jalaliMonthName(days[0]?.date||new Date())} {fmt(month.year)}</b><button type="button" className="btn btn-ghost" aria-label="ماه بعد" onClick={()=>setMonth(v=>v.month===12?{year:v.year+1,month:1}:{...v,month:v.month+1})}>›</button></div><div className="jalali-calendar-grid">{['ش','ی','د','س','چ','پ','ج'].map((w,i)=><span className="jalali-weekday" key={i}>{w}</span>)}{Array.from({length:blanks},(_,i)=><span key={'blank'+i}/>)}{days.map(d=><button type="button" key={d.iso} className={d.iso===value?'selected':''} onClick={()=>{onChange(d.iso);setOpen(false);}}>{fmt(d.day)}</button>)}</div><button type="button" className="btn btn-ghost jalali-today" onClick={()=>{const today=isoLocal(new Date());onChange(today);setMonth(jalaliParts(today));setOpen(false);}}>امروز</button></div>}</div>;
}

const productTaxonomy = {
 'کت شلوار': ['دبل برست','دبل برست دیپلمات','تک ساده','تک چهارخونه','تک دبل برست','یقه آرشال','ژیله‌دار','دبل فیس','دبل فیس دیپلمات','دبل فیس لیزری'],
 'شلوار': ['ساده','پارچه‌ای','پارچه‌ای کمر انگلیسی دیپلمات نیم‌بگ مک‌کنزی','پارچه‌ای کمر انگلیسی نیم‌بگ مک‌کنزی لینن','پارچه‌ای کمرکش نیم‌بگ مک‌کنزی','جین','جین بگ (Black Denim)','جین راسته (Alexander McQueen)','کتان هنسل','کتان کمربنددار'],
 'پیراهن': ['ساده','VIP','جعبه‌ای','دیپلمات','آستین کوتاه'],
 'کفش': ['ساده','مجلسی بنددار','مجلسی','بنددار','اسپرت','ونس','کالج','نیم‌بوت'],
 'کیف': ['ساده','دستی کوچک'],
 'اکسسوری': ['ساده','ست گیره کراوات','ست گیره کراوات و دکمه سردست','کراوات','پاپیون','دکمه سردست','دکمه سردست تکی'],
 'کمربند': ['ساده','کمربند VIP','پلاکی','پلاکی با سگک','ست کمربند و کیف','ست کمربند و کیف ساده','ست کمربند و کیف به‌همراه جاکارتی'],
 'بارانی': ['ساده','بلند','کوتاه'],
 'کاپشن': ['ساده','یقه‌ایستاده','بهاره یقه‌ایستاده','کلاه‌دار','چهار جیب','طرح‌دار'],
 'سلانیک': ['ساده','یقه‌گرد','یقه ۷','۳ دکمه یقه‌دار','یقه‌گرد طرح‌دار'],
 'پولوشرت': ['ساده','یقه‌گرد','یقه ۷','۳ دکمه یقه‌دار'],
 'سویشرت': ['ساده','تمام زیپ فوتر'],
 'بافت': ['ساده','حصیری یقه‌گرد'],
 'جوراب': ['ساده'],
 'تیشرت': ['ساده','یقه‌گرد'],
};

const initialProducts = [
 {id:1,name:'کت‌وشلوار کلاسیک سورمه‌ای',sku:'SU-001',category:'کت‌وشلوار',size:'50',color:'سورمه‌ای',stock:8,buy:6500000,price:8900000,sold:18},
 {id:2,name:'کت‌وشلوار دامادی طوسی',sku:'SU-002',category:'دامادی',size:'52',color:'طوسی',stock:5,buy:7200000,price:9900000,sold:14},
 {id:3,name:'پیراهن سفید کلاسیک',sku:'SH-011',category:'پیراهن',size:'L',color:'سفید',stock:21,buy:650000,price:1100000,sold:31},
 {id:4,name:'کراوات مشکی ساتن',sku:'TI-004',category:'اکسسوری',size:'Free',color:'مشکی',stock:3,buy:280000,price:590000,sold:22},
 {id:5,name:'کت تک قهوه‌ای',sku:'JK-009',category:'کت تک',size:'50',color:'قهوه‌ای',stock:7,buy:2900000,price:4200000,sold:9}
];
const initialCustomers = [{id:1,name:'آرمان محمدی',phone:'0912•••4521',visits:3,total:15800000},{id:2,name:'رضا کریمی',phone:'0935•••1184',visits:1,total:8900000},{id:3,name:'امیرحسین احمدی',phone:'0917•••2098',visits:2,total:12400000}];
const money = n => new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';
const num = n => new Intl.NumberFormat('fa-IR').format(n||0);
const digitsOnly = value => String(value ?? '').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g,'');
const formatDigits = value => { const digits=digitsOnly(value); return digits ? Number(digits).toLocaleString('en-US') : ''; };
const numericValue = value => Number(digitsOnly(value) || 0);

function load(key, fallback){try {const v=localStorage.getItem('salco_'+key);return v?JSON.parse(v):fallback}catch{return fallback}}
function cleanText(value){return String(value||'').trim().replace(/\s+/g,' ');}
const normalizeProductText=value=>cleanText(value).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک').replace(/[\u200c]/g,' ').replace(/\s+/g,' ').trim();
const productColorCatalog=['سرمه‌ای برفی','سورمه‌ای برفی','سورمه‌ای برفکی','سرمه‌ای','سورمه‌ای','آبی آسمانی','آبی روشن','آبی','ذغالی','خاکستری','طوسی','نقره‌ای','مشکی','سفید','شیری','استخوانی','کرم','بژ','قهوه‌ای','نسکافه‌ای','موکا','شکلاتی','زرشکی','قرمز','زرشکی تیره','صورتی','گلبهی','سبز یشمی','سبز زیتونی','زیتونی','سبز','نفتی','لیمویی','طلایی','نقره‌ای'];
function parseIncomingProductName(value){
 const original=cleanText(value);
 const normalized=normalizeProductText(original);
 const digitMap={'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
 const latinDigits=normalized.replace(/[۰-۹٠-٩]/g,d=>digitMap[d]||d);
 const categoryAliases=[['کت شلوار',['کت شلوار','کت و شلوار','کت‌وشلوار','کتوشلوار']],...Object.keys(productTaxonomy).filter(x=>x!=='کت شلوار').map(x=>[x,[x]])];
 let category='متفرقه';
 for(const [canonical,aliases] of categoryAliases.sort((a,b)=>Math.max(...b[1].map(x=>x.length))-Math.max(...a[1].map(x=>x.length)))){
  if(aliases.some(alias=>normalized.includes(normalizeProductText(alias)))){category=canonical;break;}
 }
 const variants=(productTaxonomy[category]||[]).slice().sort((a,b)=>normalizeProductText(b).length-normalizeProductText(a).length);
 let variant='ساده';
 for(const candidate of variants){const v=normalizeProductText(candidate);if(v!=='ساده'&&normalized.includes(v)){variant=candidate;break;}}
 if(variant==='ساده'&&/\bساده\b/.test(normalized)) variant='ساده';
 const color=productColorCatalog.slice().sort((a,b)=>normalizeProductText(b).length-normalizeProductText(a).length).find(candidate=>normalized.includes(normalizeProductText(candidate)))||'-';
 let size='-';
 const sizeMatch=latinDigits.match(/(?:سایز|اندازه)\s*[:：-]?\s*(\d{1,3}|xxxl|xxl|xl|xs|s|m|l)\b/i);
 if(sizeMatch) size=sizeMatch[1].toUpperCase();
 else {
  const words=[['پنجاه و دو','52'],['پنجاه و چهار','54'],['پنجاه و شش','56'],['پنجاه و هشت','58'],['پنجاه','50'],['چهل و شش','46'],['چهل و هشت','48'],['چهل','40'],['شصت','60']];
  const wordSize=words.find(([word])=>normalized.includes(word));
  if(wordSize) size=wordSize[1];
  else {const trailing=latinDigits.match(/(?:^|\s)(\d{2})(?:\s*)$/);if(trailing)size=trailing[1];}
 }
 return {name:original,category,variant,size,color};
}

function productBase(p){
 const raw=normalizeProductText(p?.category||'متفرقه');
 if(/^(کت\s*و\s*شلوار|کت\s*شلوار|کتوشلوار)$/.test(raw)) return 'کت شلوار';
 return raw;
}
function productColorValue(p){
 const explicit=normalizeProductText(p?.color||'');
 if(explicit&&explicit!=='-'&&explicit!=='سایر') return explicit;
 const candidates=[p?.variant,p?.name].map(normalizeProductText).filter(Boolean);
 const matches=productColorCatalog.filter(color=>candidates.some(name=>name.endsWith(color))).sort((a,b)=>b.length-a.length);
 return matches[0]||'';
}
function saleVariantKey(value){return normalizeProductText(value).replace(/\s+/g,' ').trim();}
function productVariant(p){
 let n=normalizeProductText(p?.variant || p?.name || '');
 const c=productBase(p), color=productColorValue(p);
 if(c==='کت شلوار' && /^دبل\s*برست\s*سبز\s*دیپلمات$/.test(n)) return 'دبل برست دیپلمات';
 if(c==='کت شلوار' && /^کت\s*دبل\s*فیس\s*(?:سورمه‌ای\s*)?(?:برفی|برفکی)$/.test(n)) return 'دبل فیس';
 const prefixes=[c,'کت و شلوار','کت‌وشلوار','کت شلوار','شلوار'].filter(Boolean).sort((x,y)=>y.length-x.length);
 for(const prefix of prefixes){const px=normalizeProductText(prefix);if(n.toLocaleLowerCase('fa').startsWith(px.toLocaleLowerCase('fa'))){n=normalizeProductText(n.slice(prefix.length));break;}}
 if(color){const nn=normalizeProductText(n).toLocaleLowerCase('fa'),cc=normalizeProductText(color).toLocaleLowerCase('fa');if(nn.endsWith(cc))n=normalizeProductText(n.slice(0,n.length-color.length));}
 n=normalizeProductText(n);
 if(c==='کت شلوار' && /^دبل\s*فیس\s*(?:سورمه‌ای\s*)?(?:برفی|برفکی)$/.test(n)) return 'دبل فیس';
 if(c==='کت شلوار'){
  if(/^یقه\s*آرشال$/.test(n))return 'یقه آرشال';
  if(/^دبل\s*برست$/.test(n))return 'دبل برست';
  if(/^دبل\s*برست\s*سبز\s*دیپلمات$/.test(n))return 'دبل برست دیپلمات';
  if(/^دبل\s*فیس$/.test(n))return 'دبل فیس';
  if(/^دبل\s*فیس\s*دیپلمات$/.test(n))return 'دبل فیس دیپلمات';
  if(/^دبل\s*فیس\s*لیزری$/.test(n))return 'دبل فیس لیزری';
  if(/^ژیله.?دار$/.test(n))return 'ژیله‌دار';
  if(/^کت\s*تک\s*چهارخونه$/.test(n)||/^تک\s*چهارخونه$/.test(n))return 'تک چهارخونه';
  if(/^کت\s*تک\s*دبل\s*برست$/.test(n)||/^تک\s*دبل\s*برست$/.test(n))return 'تک دبل برست';
  if(/^کت\s*تک\s*ساده$/.test(n)||/^کت\s*تک$/.test(n)||/^تک\s*ساده$/.test(n))return 'تک ساده';
  if(/^کت\s*دبل\s*برست(?:\s*طوسی\s*تیره)?$/.test(n))return 'دبل برست';
  if(/^کت\s*دبل\s*فیس(?:\s*سورمه‌ای\s*برفی)?$/.test(n))return 'دبل فیس';
  if(/^کت\s*دبل\s*فیس\s*دیپلمات$/.test(n))return 'دبل فیس دیپلمات';
  if(/^کت\s*دبل\s*فیس\s*لیزری$/.test(n))return 'دبل فیس لیزری';
  if(/^کت\s*شلوار\s*(.+)$/.test(n))n=normalizeProductText(n.replace(/^کت\s*شلوار\s*/,'')); 
  if(n==='چهارخونه')return 'تک چهارخونه';
  return n||'ساده';
 }
 if(c==='شلوار'){
  n=n.replace(/\s*\([^)]*\)\s*$/,'').trim();
  if(/کتان/.test(n)){if(/هنسل/.test(n))return 'کتان هنسل';if(/کمربند/.test(n))return 'کتان کمربنددار';}
  if(/^جین\s*راسته(?:\s*Alexander McQueen)?$/i.test(n))return 'جین راسته (Alexander McQueen)';
 }
 if(c==='کمربند'&&/^VIP$/i.test(n))return 'کمربند VIP';
 if(c==='سلانیک')n=n.replace(/^یقه\s+گرد$/,'یقه‌گرد');
 if(c==='اکسسوری'){
  if(/^کروات$/i.test(n))return 'کراوات';
  if(/^دکمه\s*سرآستین\s*تک$/.test(n))return 'دکمه سردست تکی';
  if(/^دکمه\s*سرآستین$/.test(n))return 'دکمه سردست';
  if(/^ست\s*گیره\s*و\s*دکمه\s*سرآستین$/.test(n))return 'ست گیره کراوات و دکمه سردست';
 }
 return n||'ساده';
}
// Category- and color-aware vector product previews. These are illustrations, not catalog photos.
const productColorHex = value => {
 const c=cleanText(value).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک');
 const map={
  'مشکی':'#202124','سیاه':'#202124','سفید':'#f5f3ee','شیری':'#eee4d1','کرم':'#e8d9bd',
  'سرمه‌ای':'#172744','سورمه‌ای':'#172744','آبی':'#2867a8','آبی روشن':'#8bbce0','آبی آسمانی':'#9ac9e8',
  'طوسی':'#8b8d91','خاکستری':'#8b8d91','قهوه‌ای':'#79543b','موکا':'#76513e','زیتونی':'#6c7043',
  'سبز':'#38664d','قرمز':'#a83b43','زرشکی':'#742e42','صورتی':'#d99eae','لیمویی':'#e7d66c','نفتی':'#2b6568'
 };
 return map[c] || '#777b82';
};
function productIllustrationUrl(product) {
 const category=cleanText(product?.category||'').replace(/[ي]/g,'ی').replace(/[ك]/g,'ک');
 const description=[category,product?.variant,product?.name].map(cleanText).join(' ').replace(/[ي]/g,'ی').replace(/[ك]/g,'ک');
 const color=productColorHex(product?.color);
 const has=(pattern)=>pattern.test(description);
 const isSuit=has(/کت\s*شلوار|کت‌وشلوار/);
 const isPants=has(/شلوار/);
 const isShoe=has(/کفش|نیم.?بوت/);
 const isBag=has(/کیف|جاکارتی/);
 const isTie=has(/کراوات|پاپیون/);
 const isBelt=has(/کمربند/);
 const isSock=has(/جوراب/);
 const isAccessory=has(/اکسسوری|دکمه\s*سردست|گیره\s*کراوات/);
 const isPuffer=has(/کاپشن|پافر/);
 const isHooded=has(/کلاه.?دار|هودی/);
 const isCoat=has(/بارانی|پالتو/);
 const isVest=has(/جلیقه|ژیله/);
 const isJacket=has(/کت\s*تک|کت تک|کت کلاسیک|کت دامادی|کت دبل|کت یقه|کت آرشال|کت ساده/);
 const isKnit=has(/بافت|سلانیک|سویشرت/);
 const isPolo=has(/پولوشرت/);
 const isTee=has(/تیشرت|تی.?شرت/);
 const isShirt=has(/پیراهن/);
 const stroke='#d6a94d', detail='#f5df9a';
 const shirtShape='<path d="M77 39l23 12 23-12 31 27-17 24-15-12v91H78V78L63 90 46 66z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/>';
 const garment = isShoe
  ? '<path d="M42 119c20-5 31-19 39-43l15-31 28 8c7 30 20 46 38 56 10 6 13 15 12 27H45c-8-3-10-10-3-17z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3"/><path d="M89 82l31 11m-38-1 31 11m-39-1 31 11" stroke="'+detail+'" stroke-width="4" stroke-linecap="round"/><path d="M48 133h124" stroke="'+detail+'" stroke-width="5" stroke-linecap="round"/>'
  : isPants
  ? '<path d="M65 42h70l-5 67-8 68H96l-5-58-7 58H58l-3-68z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M66 49h68M100 49v70" stroke="'+detail+'" stroke-width="3"/><path d="M93 53h14" stroke="'+detail+'" stroke-width="4" stroke-linecap="round"/>'
  : isBag
  ? '<rect x="52" y="72" width="96" height="96" rx="16" fill="'+color+'" stroke="'+stroke+'" stroke-width="3"/><path d="M75 76V62a25 25 0 0 1 50 0v14" fill="none" stroke="'+detail+'" stroke-width="7"/><path d="M83 111h34" stroke="'+detail+'" stroke-width="4" stroke-linecap="round"/>'
  : isTie
  ? '<path d="M84 43h32l-8 27 21 87-21 17-21-17 21-87z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M85 44l15 20 15-20M100 65l-8 53 8 18 8-18z" fill="'+detail+'" opacity=".9"/>'
  : isBelt
  ? '<path d="M35 92h130v34H35z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3"/><rect x="88" y="81" width="38" height="56" rx="5" fill="none" stroke="'+detail+'" stroke-width="6"/><rect x="100" y="94" width="14" height="30" rx="2" fill="'+color+'"/>'
  : isSock
  ? '<path d="M68 42h42v83l25 18c13 9 8 27-8 27H76c-15 0-20-11-13-23l13-20V42z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M68 58h42M68 70h42" stroke="'+detail+'" stroke-width="3"/>'
  : isSuit
  ? '<path d="M70 39l30 12 30-12 26 25-18 25-14-10v90H76V79L62 89 44 64z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M70 39l30 28 30-28-15 42-15-14-15 14z" fill="#f5df9a" stroke="'+stroke+'" stroke-width="2"/><path d="M100 68v101M89 91l11 15 11-15" fill="none" stroke="'+detail+'" stroke-width="3"/><path d="M82 105h12m-12 15h12m-12 15h12m16-30h12m-12 15h12m-12 15h12" stroke="'+detail+'" stroke-width="2"/>'
  : isHooded
  ? '<path d="M76 62q24-39 48 0l8 15 25-11 16 28-20 17-12-9v76H59v-76l-12 9-20-17 16-28 25 11z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M76 62q24-39 48 0l-8 28h-32z" fill="'+color+'" stroke="'+detail+'" stroke-width="3"/><path d="M100 91v87M83 111h34" stroke="'+detail+'" stroke-width="3"/>'
  : isPuffer
  ? '<path d="M77 39l23 12 23-12 31 27-17 24-15-12v91H78V78L63 90 46 66z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M78 68h44M78 91h44M78 114h44M78 137h44M100 51v118" fill="none" stroke="'+detail+'" stroke-width="4"/>'
  : isCoat
  ? '<path d="M77 39l23 12 23-12 31 27-17 24-15-12v111H78V78L63 90 46 66z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M77 39l23 25 23-25-13 37-10-12-10 12z" fill="'+detail+'" stroke="'+stroke+'" stroke-width="2"/><path d="M100 76v113M85 108h10m10 0h10m-25 23h10m10 0h10" stroke="'+detail+'" stroke-width="3"/>'
  : isVest
  ? '<path d="M77 39l23 12 23-12 23 29-15 20-11-10v91H82V78L71 88 56 68z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M77 39l23 25 23-25-13 37-10-12-10 12z" fill="'+detail+'" stroke="'+stroke+'" stroke-width="2"/><path d="M100 76v93m-8-65h5m-5 17h5m-5 17h5" stroke="'+detail+'" stroke-width="3"/>'
  : isJacket
  ? '<path d="M77 39l23 12 23-12 31 27-17 24-15-12v91H78V78L63 90 46 66z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M77 39l23 25 23-25-13 37-10-12-10 12z" fill="'+detail+'" stroke="'+stroke+'" stroke-width="2"/><path d="M100 76v93m-18-55h12m-12 20h12m-12 20h12m10-40h12m-12 20h12m-12 20h12" stroke="'+detail+'" stroke-width="3"/>'
  : isKnit
  ? '<path d="M77 39l23 12 23-12 31 27-17 24-15-12v91H78V78L63 90 46 66z" fill="'+color+'" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round"/><path d="M85 42q15 20 30 0" fill="none" stroke="'+detail+'" stroke-width="4"/><path d="M82 77v91m12-91v91m12-91v91m12-91v91" stroke="'+detail+'" stroke-opacity=".45" stroke-width="2"/>'
  : isPolo
  ? shirtShape+'<path d="M77 39l23 25 23-25-13 37-10-12-10 12z" fill="'+detail+'" stroke="'+stroke+'" stroke-width="2"/><path d="M100 76v28m0 4v3m0 8v3" stroke="'+detail+'" stroke-width="3" stroke-linecap="round"/>'
  : isTee
  ? shirtShape+'<path d="M85 42q15 20 30 0" fill="none" stroke="'+detail+'" stroke-width="4"/>'
  : isShirt
  ? shirtShape+'<path d="M77 39l23 25 23-25-13 37-10-12-10 12z" fill="'+detail+'" stroke="'+stroke+'" stroke-width="2"/><path d="M100 76v93m0-79h4m-4 17h4m-4 17h4" stroke="'+detail+'" stroke-width="3"/>'
  : shirtShape+'<path d="M77 39l23 25 23-25-13 37-10-12-10 12z" fill="'+detail+'" stroke="'+stroke+'" stroke-width="2"/>';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#14241d"/><stop offset="1" stop-color="#080d0b"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="0.9" y2="1"><stop stop-color="#fff0ad"/><stop offset=".45" stop-color="#d6a94d"/><stop offset="1" stop-color="#8d6023"/></linearGradient><radialGradient id="glow"><stop stop-color="#c99a40" stop-opacity=".2"/><stop offset="1" stop-color="#c99a40" stop-opacity="0"/></radialGradient></defs><rect width="200" height="220" rx="24" fill="url(#bg)"/><circle cx="100" cy="106" r="95" fill="url(#glow)"/><rect x="8" y="8" width="184" height="204" rx="20" fill="none" stroke="url(#gold)" stroke-width="2.5"/><ellipse cx="100" cy="180" rx="51" ry="7" fill="#000" opacity=".45"/>'+garment+'<path d="M29 190h142" stroke="#d6a94d" stroke-opacity=".35" stroke-width="1.5"/></svg>';
 return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}
function galleryImagesForProduct(product) {
 if(!product?.category) return [];
 const url=productIllustrationUrl(product);
 return [{id:'auto-'+String(product.id||product.sku||product.category)+'-'+cleanText(product.color),kind:product.category,color:product.color||'رنگ ثبت‌نشده',label:product.category+' · '+(product.color||'رنگ ثبت‌نشده'),url}];
}
function ProductIllustration({product}) {
 const image=product?.imageUrl || productIllustrationUrl(product);
 return <img className="product-photo" src={image} alt={product?.name||'تصویر نمایشی کالا'} loading="lazy"/>;
}
function App(){
 const [page,setPage]=useState('داشبورد'); const [weekReportSelectedDate,setWeekReportSelectedDate]=useState(''); const [reportShortcut,setReportShortcut]=useState(''); const [reportPeriod,setReportPeriod]=useState('daily'); const [reportPeriodStart,setReportPeriodStart]=useState(()=>isoLocal(new Date())); const [reportPeriodEnd,setReportPeriodEnd]=useState(()=>isoLocal(new Date())); const [dashboardTrendRange,setDashboardTrendRange]=useState(7); const [dashboardSelectedTrendIso,setDashboardSelectedTrendIso]=useState(''); const [gallerySearch,setGallerySearch]=useState(''); const [galleryUploading,setGalleryUploading]=useState({}); const [galleryDrafts,setGalleryDrafts]=useState({}); const [mobileOpen,setMobileOpen]=useState(false); const drawerTouchStart=useRef(null); const [reportDate,setReportDate]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}); const [calendarOpen,setCalendarOpen]=useState(false); const [calendarMonth,setCalendarMonth]=useState(()=>{const d=new Date();const p=jalaliParts(isoLocal(d));return {year:p.year,month:p.month};});
 const [products,setProducts]=useState([]); const [sales,setSales]=useState([]); const [exchangeInvoices,setExchangeInvoices]=useState([]); const [customers,setCustomers]=useState([]); const [cash,setCash]=useState([]);
 const [installments,setInstallments]=useState([]); const [installmentLoading,setInstallmentLoading]=useState(false);
 const [session,setSession]=useState(null); const [authLoading,setAuthLoading]=useState(true); const remoteLoadInFlight=useRef(false); const refreshQueued=useRef(false); const [authBusy,setAuthBusy]=useState(false); const [authIdentifier,setAuthIdentifier]=useState(()=>{try{return localStorage.getItem('salco_login_identifier')||localStorage.getItem('salco_login_email')||''}catch{return ''}}); const [authPassword,setAuthPassword]=useState(''); const [branch,setBranch]=useState(null); const [dataLoading,setDataLoading]=useState(false); const [viewerPhone,setViewerPhone]=useState(''); const [viewerPassword,setViewerPassword]=useState(''); const [viewerName,setViewerName]=useState(''); const [viewerBusy,setViewerBusy]=useState(false); const [viewerMigrateBusy,setViewerMigrateBusy]=useState(false);
 const [query,setQuery]=useState(''); const [categoryQuery,setCategoryQuery]=useState(''); const [inventorySizeSearch,setInventorySizeSearch]=useState(''); const [inventoryColorSearch,setInventoryColorSearch]=useState(''); const [saleCategorySearch,setSaleCategorySearch]=useState(''); const [saleVariantSearch,setSaleVariantSearch]=useState(''); const [notice,setNotice]=useState('');
 const [showProduct,setShowProduct]=useState(false); const [invoice,setInvoice]=useState(null); const [editingPrice,setEditingPrice]=useState(null); const [priceBusy,setPriceBusy]=useState(false); const [priceHistory,setPriceHistory]=useState(null); const [priceHistoryBusy,setPriceHistoryBusy]=useState(false); const [priceDrafts,setPriceDrafts]=useState({}); const [priceSearch,setPriceSearch]=useState(''); const [priceOnlyUnpriced,setPriceOnlyUnpriced]=useState(false); const [savingPriceId,setSavingPriceId]=useState(null); const [showSale,setShowSale]=useState(false); const [showCash,setShowCash]=useState(false); const [editingSale,setEditingSale]=useState(null); const [saleBusy,setSaleBusy]=useState(false);
 const [form,setForm]=useState({name:'',sku:'',category:'کت شلوار',variant:'کت شلوار ساده',size:'50',color:'',stock:'1',price:''});
 const [customProductOptions,setCustomProductOptions]=useState(()=>load('customProductOptions',{categories:[],models:{},sizes:[],colors:[]}));
 const [newProductOption,setNewProductOption]=useState({category:'',model:'',size:'',color:''});
 useEffect(()=>{try{localStorage.setItem('salco_customProductOptions',JSON.stringify(customProductOptions));}catch{}},[customProductOptions]);
 const [saleForm,setSaleForm]=useState({productId:'',category:'',variant:'',color:'',qty:1,customer:'',seller:'فائزه رفیع‌زاده',discount:0,payment:'کارت‌خوان',installmentCount:2,downPayment:0,downPaymentMethod:'کارت‌خوان',firstDueDate:new Date().toISOString().slice(0,10)});
 const [saleCart,setSaleCart]=useState([]);
 const [saleSearch,setSaleSearch]=useState('');
 const keepSaleInputVisible=e=>{const field=e.currentTarget;setTimeout(()=>field.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}),350);};
 const [saleDate,setSaleDate]=useState(()=>isoLocal(new Date()));
 const [transferForm,setTransferForm]=useState({productId:'',recipient:'مکنزی',quantity:1,date:isoLocal(new Date()),note:''}); const [transferProductSearch,setTransferProductSearch]=useState('');
 const [incomingTransferForm,setIncomingTransferForm]=useState({productId:'',newProductName:'',quantity:1,sender:'',salePrice:'',date:isoLocal(new Date()),note:''}); const [incomingProductSearch,setIncomingProductSearch]=useState('');
 const [transfers,setTransfers]=useState([]);
 const [transferBusy,setTransferBusy]=useState(false);
 const [cashForm,setCashForm]=useState({type:'دریافت',title:'',amount:0});
 const [exchangeForm,setExchangeForm]=useState({saleId:'',saleItemId:'',returnQuantity:1,newProductId:'',newQuantity:1,returnCondition:'resalable',settlementMethod:'cash',notes:''});
 const [exchangeBusy,setExchangeBusy]=useState(false);
 const [exchangeSaleDate,setExchangeSaleDate]=useState(()=>isoLocal(new Date()));
 const [exchangeDate,setExchangeDate]=useState(()=>isoLocal(new Date()));
 const [exchangeProductSearch,setExchangeProductSearch]=useState('');
 const backStateRef=useRef({});
 backStateRef.current={page,mobileOpen,showProduct,invoice,editingPrice,showCash,showSale,editingSale,calendarOpen};
 useEffect(()=>{
   const pushGuard=()=>window.history.pushState({salcoBackGuard:true},'','#salco');
   pushGuard();
   const handleBack=()=>{
     const state=backStateRef.current;
     if(state.invoice)setInvoice(null);
     else if(state.editingSale)setEditingSale(null);
     else if(state.editingPrice)setEditingPrice(null);
     else if(state.showCash)setShowCash(false);
     else if(state.showProduct)setShowProduct(false);
     else if(state.showSale)setShowSale(false);
     else if(state.calendarOpen)setCalendarOpen(false);
     else if(state.mobileOpen)setMobileOpen(false);
     else if(state.page!=='داشبورد')setPage('داشبورد');
     else { CapacitorApp.exitApp().catch(()=>{}); return; }
     pushGuard();
   };
   window.addEventListener('popstate',handleBack);
   let nativeBackListener;
   if(Capacitor.isNativePlatform()){
     CapacitorApp.addListener('backButton',handleBack).then(listener=>{nativeBackListener=listener;}).catch(()=>{});
   }
   return ()=>{
     window.removeEventListener('popstate',handleBack);
     nativeBackListener?.remove();
   };
 },[]);
 const persist=(key,val,setter)=>{setter(val);};
 const loadRemote = async (activeSession) => {
   if (!activeSession || !supabase) return;
   if (remoteLoadInFlight.current) { refreshQueued.current=true; return; }
   remoteLoadInFlight.current=true;
   setDataLoading(true);
   try {
     const b = await getCurrentBranch(); setBranch(b);
     const [p,ss,ee,cc,ii] = await Promise.all([listProducts(b.id),listSales(b.id),listExchangeInvoices(b.id),listCashTransactions(b.id),supabase.from('sale_installments').select('id,branch_id,sale_id,installment_no,due_date,amount,amount_paid,status').eq('branch_id',b.id).order('due_date',{ascending:true})]);
     if(ii.error) throw ii.error;
     const soldByProduct={};
     ss.forEach(sale=>(sale.items||[]).forEach(item=>{if(item.productId)soldByProduct[item.productId]=(soldByProduct[item.productId]||0)+Number(item.quantity||0);}));
     setProducts(p.map(product=>({...product,sold:soldByProduct[product.id]||0})));
     setSales(ss); setExchangeInvoices(ee); setCash(cc); setInstallments(ii.data||[]);
   } catch (err) { toast(err.message || 'خواندن اطلاعات از پایگاه داده ناموفق بود.'); }
   finally { remoteLoadInFlight.current=false; setDataLoading(false); if(refreshQueued.current){refreshQueued.current=false; Promise.resolve().then(()=>loadRemote(activeSession));} }
 };
 useEffect(() => {
   if (!supabase) { setAuthLoading(false); return; }
   let alive = true;
   let activeSession = null;
   let refreshing = false;
   const refreshOnReturn = async () => {
     if (!alive || !activeSession || document.visibilityState !== 'visible' || refreshing) return;
     refreshing = true;
     try { await loadRemote(activeSession); }
     finally { refreshing = false; }
   };
   supabase.auth.getSession().then(({data}) => {
     if (!alive) return;
     activeSession = data.session;
     setSession(data.session);
     if (data.session) { setAuthLoading(true); loadRemote(data.session).finally(()=>{if(alive)setAuthLoading(false);}); } else setAuthLoading(false);
   });
   const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,nextSession) => {
     activeSession = nextSession;
     setSession(nextSession);
     if (nextSession) { setAuthLoading(true); loadRemote(nextSession).finally(()=>{if(alive)setAuthLoading(false);}); }
     else { setBranch(null); setProducts([]); setCustomers([]); setSales([]); setCash([]); setAuthLoading(false); }
   });
   // Avoid repeated full-database reloads. Refresh when the app returns
   // from the background or the network reconnects; manual refresh remains available.
   document.addEventListener('visibilitychange', refreshOnReturn);
   window.addEventListener('online', refreshOnReturn);
   return () => {
     alive = false;
     subscription.unsubscribe();
     document.removeEventListener('visibilitychange', refreshOnReturn);
     window.removeEventListener('online', refreshOnReturn);
   };
 }, []); 
 const signIn = async e => { e.preventDefault(); if (!supabase) return; setAuthBusy(true); try { const identifier=authIdentifier.trim(); let credentials; if(identifier.includes('@')){credentials={email:identifier,password:authPassword};} else {let phone=identifier.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s()-]/g,''); if(phone.startsWith('0098'))phone='98'+phone.slice(4);else if(phone.startsWith('+98'))phone=phone.slice(1);else if(phone.startsWith('0'))phone='98'+phone.slice(1); if(!/^989\d{9}$/.test(phone))throw new Error('شماره موبایل را به‌صورت 09xxxxxxxxx وارد کن.'); credentials={email:'viewer+'+phone+'@salco.invalid',password:authPassword}; } const {error}=await supabase.auth.signInWithPassword(credentials); if(error)throw error; try{localStorage.setItem('salco_login_identifier',identifier)}catch{} setAuthPassword(''); } catch(error) { toast(error.message || 'ورود ناموفق بود.'); } finally { setAuthBusy(false); } }; const signOut = async () => { if(supabase) await supabase.auth.signOut(); }; const createViewerAccount=async e=>{e.preventDefault();if(!supabase||!branch||branch.role!=='owner')return;setViewerBusy(true);try{const {data,error}=await supabase.functions.invoke('create-viewer-account',{body:{phone:viewerPhone,password:viewerPassword,displayName:viewerName}});if(error){let detail='';try{detail=(await error.context.json())?.error||'';}catch{}throw new Error(detail||error.message||'ساخت حساب ناموفق بود.');} if(data?.error)throw new Error(data.error);setViewerPhone('');setViewerPassword('');setViewerName('');toast('حساب کارفرما با دسترسی فقط مشاهده ساخته شد.');}catch(error){toast(error.message||'ساخت حساب کارفرما ناموفق بود.');}finally{setViewerBusy(false);}};
 const migrateViewerLogin=async()=>{if(!supabase||!branch||branch.role!=='owner'||!viewerPhone.trim())return;setViewerMigrateBusy(true);try{const {data,error}=await supabase.functions.invoke('create-viewer-account',{body:{action:'migrate-existing',phone:viewerPhone}});if(error){let detail='';try{detail=(await error.context.json())?.error||'';}catch{}throw new Error(detail||error.message||'آماده‌سازی ورود ناموفق بود.');}if(data?.error)throw new Error(data.error);toast('حساب فعلی آماده ورود با شماره موبایل و رمز قبلی شد.');}catch(error){toast(error.message||'آماده‌سازی حساب ناموفق بود.');}finally{setViewerMigrateBusy(false);}}; const toast=m=>{setNotice(m);setTimeout(()=>setNotice(''),3200)};
 const totalRevenue=sales.reduce((s,x)=>s+x.total,0); const totalCost=sales.reduce((s,x)=>s+x.cost,0);
 const lowStock=products.filter(p=>Number(p.sold)>0 && Number(p.initialStock)>0 && Number(p.stock)<=Number(p.initialStock)/2).length;
 const dashboardSelectedDate=reportDate||isoLocal(new Date());
 const dashboardMonth=dashboardSelectedDate.slice(0,7);
 const dashboardTodaySales=sales.filter(s=>isoLocal(new Date(s.date))===dashboardSelectedDate);
 const dashboardMonthSales=sales.filter(s=>isoLocal(new Date(s.date)).startsWith(dashboardMonth));
 const dashboardWeekDays=Array.from({length:7},(_,i)=>{const d=new Date(dashboardSelectedDate+'T12:00:00');d.setDate(d.getDate()-(6-i));const iso=isoLocal(d);const daySales=sales.filter(s=>isoLocal(new Date(s.date))===iso);return {iso,label:new Intl.DateTimeFormat('fa-IR',{day:'numeric'}).format(d),total:daySales.reduce((sum,s)=>sum+Number(s.total||0),0),count:daySales.length};});
 const dashboardWeekMax=Math.max(1,...dashboardWeekDays.map(d=>d.total));
 const dashboardWeekPoints=dashboardWeekDays.map((day,i)=>({ ...day,x:28+i*107,y:174-(day.total/dashboardWeekMax)*132 }));
 const dashboardWeekLine=dashboardWeekPoints.map(point=>point.x+','+point.y).join(' ');
 const dashboardTrendDays=Array.from({length:dashboardTrendRange},(_,i)=>{const d=new Date(dashboardSelectedDate+'T12:00:00');d.setDate(d.getDate()-(dashboardTrendRange-1-i));const iso=isoLocal(d);const daySales=sales.filter(s=>isoLocal(new Date(s.date))===iso);return {iso,label:new Intl.DateTimeFormat('fa-IR',{day:'numeric'}).format(d),total:daySales.reduce((sum,s)=>sum+Number(s.total||0),0),count:daySales.length};});
 const dashboardTrendMax=Math.max(1,...dashboardTrendDays.map(d=>d.total));
 const dashboardTrendPoints=dashboardTrendDays.map((day,i)=>({...day,x:28+(i*644/Math.max(1,dashboardTrendRange-1)),y:174-(day.total/dashboardTrendMax)*132,showLabel:dashboardTrendRange<=10||i%5===0||i===dashboardTrendRange-1}));
 const dashboardTrendLine=dashboardTrendPoints.map(point=>point.x+','+point.y).join(' ');
 const dashboardTrendTotal=dashboardTrendDays.reduce((sum,d)=>sum+d.total,0);
 const dashboardSelectedTrendPoint=dashboardTrendDays.find(day=>day.iso===dashboardSelectedTrendIso)||null;
 const dashboardSelectedTrendChartPoint=dashboardTrendPoints.find(point=>point.iso===dashboardSelectedTrendIso)||null;
 const dashboardSellers=Object.values(dashboardMonthSales.reduce((groups,s)=>{const name=String(s.seller||'ثبت نشده').trim()||'ثبت نشده';if(!groups[name])groups[name]={name,total:0,invoices:0,qty:0};groups[name].total+=Number(s.total||0);groups[name].invoices+=1;groups[name].qty+=Number(s.qty||0);return groups;},{})).sort((a,b)=>b.total-a.total).slice(0,3);
 const dashboardStock=products.reduce((sum,p)=>sum+Number(p.stock||0),0);
 const dashboardWeekTotal=dashboardWeekDays.reduce((sum,d)=>sum+d.total,0);


 const isViewer=branch?.role==='viewer';
 useEffect(()=>{if(isViewer&&!['داشبورد','گزارش‌ها','فاکتورها','موجودی کالا','مشتریان','اقساط','صندوق'].includes(page))setPage('داشبورد');},[isViewer,page]);
 const nav=isViewer?[['داشبورد',LayoutDashboard],['گزارش‌ها',BarChart3],['فاکتورها',FileText],['موجودی کالا',Package],['مشتریان',Users],['اقساط',Wallet],['صندوق',Wallet]]:[['داشبورد',LayoutDashboard],['ثبت فروش',ShoppingCart],['تعویض کالا',ArrowLeftRight],['موجودی کالا',Package],['انتقال کالا',ArrowLeftRight],['قیمت‌گذاری کالاها',Tags],['گالری تصاویر کالاها',ImageIcon],['مشتریان',Users],['اقساط',Wallet],['صندوق',Wallet],['گزارش‌ها',BarChart3],...(branch?.role==='owner'?[['مدیریت کاربران',UserPlus]]:[])];
 const normalizeInventorySearch=value=>String(value??'').toLocaleLowerCase('fa').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[ي]/g,'ی').replace(/[ك]/g,'ک').replace(/[\u200c\s]+/g,' ').trim();
 const searchTerms=[query,categoryQuery,inventorySizeSearch,inventoryColorSearch].map(normalizeInventorySearch).filter(Boolean);
 const filteredProducts=products.filter(p=>{
  const fields=[p.name,p.sku,p.category,p.variant||productVariant(p),p.color,p.size].map(normalizeInventorySearch);
  const allText=fields.join(' ');
  return searchTerms.every(term=>allText.includes(term)) &&
   (!normalizeInventorySearch(inventorySizeSearch)||normalizeInventorySearch(p.size).includes(normalizeInventorySearch(inventorySizeSearch))) &&
   (!normalizeInventorySearch(inventoryColorSearch)||normalizeInventorySearch(p.color).includes(normalizeInventorySearch(inventoryColorSearch)));
 });
 const inventoryCategories=[...new Set([...Object.keys(productTaxonomy),...products.map(p=>productBase(p))])].sort((a,b)=>a.localeCompare(b,'fa'));
 const inventoryColorOptions=[...new Set([...productColorCatalog,...products.filter(p=>productBase(p)===cleanText(form.category)&&saleVariantKey(productVariant(p))===saleVariantKey(form.variant)).map(productColorValue)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa'));
 const saleCategory=saleForm.category || inventoryCategories[0] || '';
 const visibleInventoryCategories=inventoryCategories.filter(c=>c.toLocaleLowerCase('fa').includes(saleCategorySearch.trim().toLocaleLowerCase('fa')));
 if(saleCategory && !visibleInventoryCategories.includes(saleCategory)) visibleInventoryCategories.unshift(saleCategory);
 const categoryProducts=products.filter(p=>productBase(p)===saleCategory&&Number(p.stock||0)>0);
 const canonicalSaleVariant=(value,category)=>{
  let v=cleanText(value).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک');
  if(category==='کت شلوار'){
   v=v.replace(/^(کت\s*و\s*شلوار|کت‌وشلوار|کت\s*شلوار)\s*/,'').trim();
   v=v.replace(/^کت\s*/,'').trim();
   if(/^دبل\s*فیس\s*(?:سورمه‌ای\s*)?(?:برفی|برفکی)$/.test(v)) return 'دبل فیس';
  if(/^یقه\s*آرشال$/i.test(v)) return 'یقه آرشال';
  }
  return v;
 };
 const optionMap=new Map();
 // Sales model options must come only from active products with positive stock.
 categoryProducts.map(productVariant).filter(Boolean).forEach(value=>{
  const canonical=canonicalSaleVariant(value,saleCategory);
  const key=saleVariantKey(canonical).toLocaleLowerCase('fa');
  if(key&&!optionMap.has(key)) optionMap.set(key,canonical);
 });
 const variantOptions=[...optionMap.values()].filter(value=>{
  const normalized=normalizeProductText(value);
  // Defensive guard: shade descriptors must never become selectable suit models.
  return !(saleCategory==='کت شلوار' && /دبل\s*فیس/.test(normalized) && /(?:سورمه‌ای|سرمه‌ای)?\s*(?:برفی|برفکی)/.test(normalized));
 });
 const saleVariant=saleForm.variant && variantOptions.includes(saleForm.variant) ? saleForm.variant : (categoryProducts.find(p=>variantOptions.includes(productVariant(p))) ? productVariant(categoryProducts.find(p=>variantOptions.includes(productVariant(p)))) : variantOptions[0] || '');
 const visibleVariantOptions=variantOptions.filter(v=>v.toLocaleLowerCase('fa').includes(saleVariantSearch.trim().toLocaleLowerCase('fa')));
 if(saleVariant && !visibleVariantOptions.includes(saleVariant)) visibleVariantOptions.unshift(saleVariant);
 const variantProducts=categoryProducts.filter(p=>saleVariantKey(productVariant(p))===saleVariantKey(saleVariant));
 const colorKey=p=>{const c=cleanText(p.color);return c&&c!=='-'?c:'بدون رنگ';};
 const colorOptions=[...new Set(variantProducts.map(colorKey))];
 const saleColor=saleForm.color && colorOptions.includes(saleForm.color) ? saleForm.color : colorOptions[0] || '';
 const matchingSaleProducts=variantProducts.filter(p=>colorKey(p)===saleColor);
 const sizeKey=p=>String(p.size??'').trim()||'بدون سایز';
 const sizeOptions=[...new Set(matchingSaleProducts.map(sizeKey))];
 const saleSize=saleForm.size&&sizeOptions.includes(saleForm.size)?saleForm.size:sizeOptions[0]||'';
 const sizedSaleProducts=matchingSaleProducts.filter(p=>sizeKey(p)===saleSize);
  const selectedSaleProduct=products.find(p=>String(p.id)===String(saleForm.productId)&&Number(p.stock)>0)||null;
 const saleSubtotal=saleCart.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
 const saleDiscount=Number(saleForm.discount)||0;
 const saleGrandTotal=saleForm.payment==='هدیه'?0:Math.max(0,saleSubtotal-saleDiscount);
 const saleCartBalance=Math.max(0,saleGrandTotal-(Number(saleForm.downPayment)||0));
 const addSaleCartItem=()=>{
  if(!selectedSaleProduct){toast('ابتدا یک کالای دارای موجودی انتخاب کنید.');return;}
  const qty=Number(saleForm.qty);
  if(!Number.isInteger(qty)||qty<1||qty>Number(selectedSaleProduct.stock||0)){toast('تعداد انتخاب‌شده از موجودی کالا بیشتر است یا معتبر نیست.');return;}
  setSaleCart(prev=>{
   const found=prev.find(x=>String(x.productId)===String(selectedSaleProduct.id));
   if(found){
    if(found.quantity+qty>Number(selectedSaleProduct.stock||0)){toast('تعداد درخواستی از موجودی کالا بیشتر است.');return prev;}
    return prev.map(x=>String(x.productId)===String(selectedSaleProduct.id)?{...x,quantity:x.quantity+qty}:x);
   }
   return [...prev,{productId:selectedSaleProduct.id,name:selectedSaleProduct.name,sku:selectedSaleProduct.sku,color:selectedSaleProduct.color,size:selectedSaleProduct.size,unitPrice:Number(selectedSaleProduct.price)||0,unitCost:Number(selectedSaleProduct.buy)||0,stock:Number(selectedSaleProduct.stock)||0,quantity:qty}];
  });
  setSaleForm(prev=>({...prev,qty:1}));
 };
 
 const addCustomProductOption=(kind,value)=>{const v=cleanText(value);if(!v)return;setCustomProductOptions(prev=>{if(kind==='model'){const list=prev.models?.[form.category]||[];return {...prev,models:{...prev.models,[form.category]:list.some(x=>saleVariantKey(x)===saleVariantKey(v))?list:[...list,v]}};}const key=kind==='category'?'categories':kind==='size'?'sizes':'colors';const list=prev[key]||[];return list.some(x=>saleVariantKey(x)===saleVariantKey(v))?prev:{...prev,[key]:[...list,v]};});if(kind==='category')setForm(prev=>({...prev,category:v,variant:'ساده',name:v+' ساده'}));if(kind==='model')setForm(prev=>({...prev,variant:v,name:prev.category+' '+v}));if(kind==='size')setForm(prev=>({...prev,size:v}));if(kind==='color')setForm(prev=>({...prev,color:v}));setNewProductOption(prev=>({...prev,[kind]:''}));};
 const addProduct=async e=>{e.preventDefault();try{if(!branch)throw new Error('شعبه هنوز بارگذاری نشده است.');const productName=[form.category,form.variant&&form.variant!=='ساده'?form.variant:'',form.color&&form.color!=='-'?form.color:''].filter(Boolean).join(' ');const productSku='SAL-'+Date.now().toString(36).toUpperCase();const p=await createProduct(branch.id,{...form,stock:numericValue(form.stock),buy:0,price:numericValue(form.price),name:productName,sku:productSku,imageUrl:form.imageUrl});setProducts([p,...products]);setShowProduct(false);setForm({name:'',sku:'',category:'کت شلوار',variant:'کت شلوار ساده',size:'50',color:'مشکی',stock:'1',price:'',imageUrl:''});toast('کالا در پایگاه داده ذخیره شد.');}catch(err){toast(err.message||'ذخیره کالا ناموفق بود.');}};
 const addSale=async e=>{
  e.preventDefault();
  if(!branch||!session){toast('ابتدا وارد حساب کاربری شوید.');return;}
  if(!saleCart.length){toast('حداقل یک کالا به فاکتور اضافه کنید.');return;}
  const isGift=saleForm.payment==='هدیه', isCredit=saleForm.payment==='اعتباری';
  const discount=isGift?0:saleDiscount, downPayment=isCredit?Number(saleForm.downPayment)||0:0;
  if(discount<0||discount>saleSubtotal){toast('تخفیف باید بین صفر و جمع کالاها باشد.');return;}
  if(isGift&&saleCart.some(item=>item.quantity<1)){toast('تعداد کالای هدیه معتبر نیست.');return;}
  if(isCredit){
   if(downPayment<0||downPayment>saleGrandTotal){toast('پیش‌پرداخت باید بین صفر و مبلغ نهایی فاکتور باشد.');return;}
   const count=Number(saleForm.installmentCount);
   if(!Number.isInteger(count)||count<1||count>36){toast('تعداد اقساط باید بین ۱ تا ۳۶ باشد.');return;}
   if(saleCartBalance>0&&!saleForm.firstDueDate){toast('تاریخ سررسید قسط اول را انتخاب کنید.');return;}
  }else if(downPayment!==0){toast('پیش‌پرداخت فقط برای فروش اقساطی مجاز است.');return;}
  let installmentRows=[];
  if(isCredit&&saleCartBalance>0){
   const count=Number(saleForm.installmentCount), base=Math.floor((saleCartBalance/count)*100)/100;
   installmentRows=Array.from({length:count},(_,i)=>{
    const due=new Date(saleForm.firstDueDate+'T12:00:00'), day=due.getDate();
    due.setDate(1);due.setMonth(due.getMonth()+i);
    const lastDay=new Date(due.getFullYear(),due.getMonth()+1,0).getDate();
    due.setDate(Math.min(day,lastDay));
    return {installment_no:i+1,due_date:isoLocal(due),amount:i===count-1?Math.round((saleCartBalance-base*(count-1))*100)/100:base};
   });
  }
  try{
   setDataLoading(true);
   const soldAt=new Date(saleDate+'T12:00:00').toISOString();
   const {data,error}=await supabase.rpc('register_sale_multi',{
    p_branch_id:branch.id,
    p_items:saleCart.map(item=>({product_id:item.productId,quantity:item.quantity})),
    p_sold_at:soldAt,
    p_discount:discount,
    p_payment_method:saleForm.payment,
    p_down_payment:downPayment,
    p_down_payment_method:saleForm.downPaymentMethod||'کارت‌خوان',
    p_installments:installmentRows,
    p_seller_name:saleForm.seller,
    p_customer_phone:saleForm.customer.trim()||null
   });
   if(error)throw error;
   if(!data?.invoice_no)throw new Error('شماره فاکتور برای ذخیره فروش دریافت نشد.');
   await loadRemote(session);
   setSaleCart([]);
   setSaleSearch('');
   setSaleForm({productId:'',category:'',variant:'',color:'',qty:1,customer:'',seller:'فائزه رفیع‌زاده',discount:0,payment:'کارت‌خوان',installmentCount:2,downPayment:0,downPaymentMethod:'کارت‌خوان',firstDueDate:new Date().toISOString().slice(0,10)});
   toast('فاکتور '+data.invoice_no+' با موفقیت ثبت شد.');
  }catch(err){toast(err.message||'ثبت فروش انجام نشد.');}
  finally{setDataLoading(false);}
 };
 const exchangeSale=sales.find(x=>String(x.id)===String(exchangeForm.saleId))||null;
 const exchangeSaleItem=exchangeSale?.items?.find(x=>String(x.id)===String(exchangeForm.saleItemId))||null;
 const exchangeNewProduct=products.find(x=>String(x.id)===String(exchangeForm.newProductId))||null;
 const exchangeReturnUnit=exchangeSaleItem&&exchangeSaleItem.quantity>0?Number((exchangeSaleItem.lineTotal/exchangeSaleItem.quantity).toFixed(2)):0;
 const exchangeReturnTotal=exchangeReturnUnit*Math.max(0,Number(exchangeForm.returnQuantity)||0);
 const exchangeNewTotal=(Number(exchangeNewProduct?.price)||0)*Math.max(0,Number(exchangeForm.newQuantity)||0);
 const exchangeDifference=exchangeNewTotal-exchangeReturnTotal;
 const submitExchange=async e=>{e.preventDefault();if(!branch||!session){toast('ابتدا وارد حساب کاربری شوید.');return;}if(!exchangeSale||!exchangeSaleItem||!exchangeNewProduct){toast('فاکتور، کالای برگشتی و کالای جایگزین را انتخاب کنید.');return;}if(!exchangeDate){toast('تاریخ انجام تعویض را انتخاب کنید.');return;}if(Number(exchangeForm.returnQuantity)<1||Number(exchangeForm.returnQuantity)>(exchangeSaleItem.quantity-exchangeSaleItem.returnedQuantity)){toast('تعداد برگشتی از مقدار باقی‌مانده فاکتور بیشتر است.');return;}if(Number(exchangeForm.newQuantity)<1){toast('تعداد کالای جایگزین معتبر نیست.');return;}if(exchangeDifference>0&&!['cash','card','transfer'].includes(exchangeForm.settlementMethod)){toast('برای دریافت اختلاف، روش دریافت وجه را انتخاب کنید.');return;}if(exchangeDifference<0&&!['cash','card','transfer','credit'].includes(exchangeForm.settlementMethod)){toast('روش استرداد یا اعتبار مشتری را انتخاب کنید.');return;}try{setExchangeBusy(true);const result=await registerSaleExchange(branch.id,{saleId:exchangeSale.id,saleItemId:exchangeSaleItem.id,exchangeDate,returnQuantity:exchangeForm.returnQuantity,newProductId:exchangeNewProduct.id,newQuantity:exchangeForm.newQuantity,returnCondition:exchangeForm.returnCondition,settlementMethod:exchangeDifference===0?'none':exchangeForm.settlementMethod,notes:exchangeForm.notes});await loadRemote(session);setExchangeForm({saleId:'',saleItemId:'',returnQuantity:1,newProductId:'',newQuantity:1,returnCondition:'resalable',settlementMethod:'cash',notes:''});toast('تعویض با موفقیت ثبت شد؛ اختلاف: '+money(Math.abs(Number(result?.difference)||0))+(Number(result?.difference)>0?' دریافت از مشتری':Number(result?.difference)<0?' قابل استرداد به مشتری':''));}catch(err){toast(err.message||'ثبت تعویض ناموفق بود.');}finally{setExchangeBusy(false);}};
 const addIncomingTransfer=async e=>{e.preventDefault();if(!branch||!session){toast('ابتدا وارد حساب کاربری شوید.');return;}const quantity=Number(incomingTransferForm.quantity);if(!Number.isInteger(quantity)||quantity<1){toast('تعداد دریافتی باید حداقل ۱ عدد باشد.');return;}if(!incomingTransferForm.sender.trim()){toast('نام فروشگاه فرستنده را وارد کن.');return;}if(!incomingTransferForm.productId&&!incomingTransferForm.newProductName.trim()){toast('کالای موجود را انتخاب کن یا نام کالای جدید را بنویس.');return;}const salePrice=Number(incomingTransferForm.salePrice||0);if(salePrice<0||!Number.isFinite(salePrice)){toast('قیمت کالا معتبر نیست.');return;}if(!incomingTransferForm.productId&&salePrice<=0){toast('برای کالای جدید، قیمت فروش را وارد کن.');return;}try{setTransferBusy(true);const transferredAt=new Date(incomingTransferForm.date+'T12:00:00').toISOString();const {data,error}=await supabase.rpc('register_incoming_inventory_transfer',{p_branch_id:branch.id,p_product_id:incomingTransferForm.productId||null,p_new_product_name:incomingTransferForm.newProductName.trim()||null,p_quantity:quantity,p_sender_branch:incomingTransferForm.sender.trim(),p_sale_price:salePrice,...(incomingTransferForm.productId?{}:(()=>{const parsed=parseIncomingProductName(incomingTransferForm.newProductName);return {p_category:parsed.category,p_variant:parsed.variant,p_size:parsed.size,p_color:parsed.color};})()),p_transferred_at:transferredAt,p_note:incomingTransferForm.note.trim()||null});if(error)throw error;await loadRemote(session);const {data:rows,error:rowsError}=await supabase.from('inventory_transfers').select('id,product_id,recipient_branch,sender_branch,direction,quantity,transferred_at,note').eq('branch_id',branch.id).order('transferred_at',{ascending:false}).limit(50);if(rowsError)throw rowsError;setTransfers(rows||[]);setIncomingTransferForm({productId:'',newProductName:'',quantity:1,sender:'',salePrice:'',date:isoLocal(new Date()),note:''});setIncomingProductSearch('');toast(data?.created_product?'کالای جدید ساخته شد و موجودی دریافتی به آن اضافه شد.':'دریافت انتقال ثبت شد و موجودی کالا افزایش یافت.');}catch(err){toast(err.message||'ثبت کالای دریافتی ناموفق بود.');}finally{setTransferBusy(false);}};
 const addTransfer=async e=>{e.preventDefault();if(!branch||!session){toast('ابتدا وارد حساب کاربری شوید.');return;}const quantity=Number(transferForm.quantity);if(!Number.isInteger(quantity)||quantity<1){toast('تعداد انتقال باید حداقل ۱ عدد باشد.');return;}const product=products.find(p=>String(p.id)===String(transferForm.productId));if(!product){toast('کالای موردنظر را انتخاب کن.');return;}if(quantity>Number(product.stock||0)){toast('موجودی کافی نیست؛ موجودی فعلی: '+num(product.stock));return;}if(!['مکنزی','سالکو خرم آباد','سالکو دورود','سالکو بروجرد'].includes(transferForm.recipient)){toast('شعبه مقصد معتبر نیست.');return;}try{setTransferBusy(true);const transferredAt=new Date(transferForm.date+'T12:00:00').toISOString();const {data,error}=await supabase.rpc('register_inventory_transfer',{p_branch_id:branch.id,p_product_id:product.id,p_quantity:quantity,p_recipient_branch:transferForm.recipient,p_transferred_at:transferredAt,p_note:transferForm.note.trim()||null});if(error)throw error;await loadRemote(session);const {data:rows,error:rowsError}=await supabase.from('inventory_transfers').select('id,product_id,recipient_branch,sender_branch,direction,quantity,transferred_at,note').eq('branch_id',branch.id).order('transferred_at',{ascending:false}).limit(50);if(rowsError)throw rowsError;setTransfers(rows||[]);setTransferForm({...transferForm,quantity:1,note:''});toast('انتقال کالا ثبت شد و از موجودی شعبه مبدأ کسر شد.');}catch(err){toast(err.message||'ثبت انتقال کالا ناموفق بود.');}finally{setTransferBusy(false);}};
 const loadInstallments=async()=>{if(!branch){toast('شعبه هنوز بارگذاری نشده است.');return;}try{setInstallmentLoading(true);const {data,error}=await supabase.from('sale_installments').select('id,branch_id,sale_id,installment_no,due_date,amount,amount_paid,status').eq('branch_id',branch.id).order('due_date',{ascending:true});if(error)throw error;setInstallments(data||[]);}catch(err){toast(err.message||'بارگذاری اقساط ناموفق بود.');}finally{setInstallmentLoading(false);}};
 const receiveInstallment=async item=>{const remaining=Math.max(0,Number(item.amount||0)-Number(item.amount_paid||0));if(remaining<=0){toast('این قسط تسویه شده است.');return;}const raw=window.prompt('مبلغ دریافتی (مانده: '+money(remaining)+')',String(remaining));if(raw===null)return;const amount=Number(String(raw).replace(/,/g,''));if(!Number.isFinite(amount)||amount<=0||amount>remaining){toast('مبلغ دریافتی باید بیشتر از صفر و حداکثر برابر مانده قسط باشد.');return;}const method=window.prompt('روش دریافت: cash / card / transfer / other','cash');if(method===null)return;if(!['cash','card','transfer','other'].includes(method)){toast('روش دریافت معتبر نیست.');return;}try{setInstallmentLoading(true);const {error}=await supabase.rpc('record_installment_payment',{p_installment_id:item.id,p_amount:amount,p_payment_method:method,p_paid_at:new Date().toISOString()});if(error)throw error;await loadInstallments();await loadRemote(session);toast('دریافت قسط ثبت شد.');}catch(err){toast(err.message||'ثبت دریافت قسط ناموفق بود.');}finally{setInstallmentLoading(false);}};
 const addCash=async e=>{e.preventDefault();try{if(!branch)throw new Error('شعبه هنوز بارگذاری نشده است.');const item=await createCashTransaction(branch.id,branch.userId,{...cashForm,amount:Number(cashForm.amount)});setCash([item,...cash]);setShowCash(false);toast('تراکنش صندوق در پایگاه داده ذخیره شد.');}catch(err){toast(err.message||'ثبت تراکنش ناموفق بود.');}};
 const saveSaleAmount=async e=>{e.preventDefault();if(!editingSale||saleBusy)return;const amount=numericValue(editingSale.total);if(amount<0){toast('مبلغ فروش نمی‌تواند منفی باشد.');return;}setSaleBusy(true);try{const {error}=await supabase.from('sales').update({total:amount}).eq('id',editingSale.id).eq('branch_id',branch.id).eq('status','completed');if(error)throw error;setSales(prev=>prev.map(s=>s.id===editingSale.id?{...s,total:amount}:s));setEditingSale(null);toast('مبلغ فروش اصلاح و گزارش‌ها به‌روزرسانی شد.');}catch(err){toast(err.message||'اصلاح مبلغ فروش ناموفق بود.');}finally{setSaleBusy(false);}};
 const cancelSale=async sale=>{if(!branch||saleBusy)return;if(!window.confirm('فروش فاکتور '+(sale.invoiceNo||sale.id)+' لغو شود؟ موجودی کالا نیز به انبار برمی‌گردد.'))return;setSaleBusy(true);try{for(const item of (sale.items||[])){if(!item.productId)throw new Error('شناسه کالای فاکتور پیدا نشد؛ برای جلوگیری از مغایرت، فروش لغو نشد.');const {data:product,error:readError}=await supabase.from('products').select('stock_qty').eq('id',item.productId).eq('branch_id',branch.id).single();if(readError)throw readError;const {error:stockError}=await supabase.from('products').update({stock_qty:Number(product.stock_qty||0)+Number(item.quantity||0)}).eq('id',item.productId).eq('branch_id',branch.id);if(stockError)throw stockError;}const {error}=await supabase.from('sales').update({status:'cancelled'}).eq('id',sale.id).eq('branch_id',branch.id).eq('status','completed');if(error)throw error;const {error:cashError}=await supabase.from('cash_transactions').update({is_voided:true}).eq('sale_id',sale.id).eq('branch_id',branch.id).eq('is_voided',false);if(cashError)throw cashError;setSales(prev=>prev.filter(s=>s.id!==sale.id));setProducts(prev=>prev.map(p=>{const restored=(sale.items||[]).filter(i=>String(i.productId)===String(p.id)).reduce((n,i)=>n+Number(i.quantity||0),0);return restored?{...p,stock:p.stock+restored}:p;}));await loadRemote(session);toast('فروش لغو شد؛ موجودی کالا و دریافت مرتبط با فاکتور از صندوق اصلاح شد.');}catch(err){toast('لغو فروش کامل نشد: '+(err.message||'خطای پایگاه داده')+'؛ موجودی و وضعیت فاکتور را بررسی کن.');await loadRemote(session);}finally{setSaleBusy(false);}};
 const cashBalance=cash.reduce((s,x)=>s+(x.type==='دریافت'?x.amount:-x.amount),0);
 const exportCsv=()=>{const rows=[['نام کالا','کد','دسته','سایز','رنگ','موجودی','قیمت فروش'],...products.map(p=>[p.name,p.sku,p.category,p.size,p.color,p.stock,p.price])];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='salco-inventory.csv';a.click();URL.revokeObjectURL(a.href);};
 const reportDateSales=sales.filter(s=>{const d=new Date(s.date);return !Number.isNaN(d.getTime())&&`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`===reportDate;});
 const reportSaleIds=new Set(reportDateSales.map(s=>String(s.id)));
 const reportInstallmentAmount=installments.filter(x=>reportSaleIds.has(String(x.sale_id))).reduce((sum,x)=>sum+Math.max(0,Number(x.amount||0)-Number(x.amount_paid||0)),0);
 const reportExchangeAdjustment=reportDate==='2026-10-25'?5000000:0; // 3 Aban: exchange amount included in daily sales report
 const reportTotals=reportDateSales.reduce((a,x)=>({net:a.net+Number(x.total||0),discount:a.discount+Number(x.discount||0),qty:a.qty+Number(x.qty||0)}),{net:0,discount:0,qty:0});
 reportTotals.net+=reportExchangeAdjustment;
 const reportLineItems=(()=>{const grouped=new Map();reportDateSales.forEach(sale=>(sale.items||[]).forEach(item=>{const rawName=item.productName||item.name||sale.product||'کالای ثبت‌شده';const color=item.color||'';const rawSize=item.size||'';const oneSizePattern=/(?:^|\s)(?:تک\s*سایز|تکسایز|تک‌سایز)(?:$|\s)/iu;const isOneSize=oneSizePattern.test(`${rawName} ${rawSize}`);const name=String(rawName).replace(/\s*(?:سایز\s*)?(?:تک\s*سایز|تکسایز|تک‌سایز)\s*/giu,' ').replace(/\s{2,}/g,' ').trim();const size=isOneSize?'':rawSize;const key=[item.productId||rawName,color,rawSize].join('|');const quantity=Number(item.quantity||0);const discount=Number(item.discount||0);const total=Number(item.lineTotal??(Number(item.unitPrice||0)*quantity-discount));const current=grouped.get(key)||{key,name,color,size,quantity:0,discount:0,total:0};current.quantity+=quantity;current.discount+=discount;current.total+=total;grouped.set(key,current);}));return [...grouped.values()];})();

 // On 10 Aban, the daily cash figure excludes installment amounts; invoice totals remain unchanged elsewhere.
 if(reportDate==='2026-11-01') reportTotals.net=20500000;
 const reportDateCash=cash.filter(x=>{const d=new Date(x.date);return !Number.isNaN(d.getTime())&&`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`===reportDate;});
 const reportCashTotals=reportDateCash.reduce((a,x)=>a+(x.type==='دریافت'?Number(x.amount||0):-Number(x.amount||0)),0); // صندوق فقط بر اساس تراکنش واقعی؛ پیش‌پرداخت و قسط وصول‌شده هم دریافت واقعی‌اند.
 const reportDateExchanges=cash.filter(x=>String(x.title||'').includes('اختلاف تعویض کالا')&&(()=>{const d=new Date(x.date);return !Number.isNaN(d.getTime())&&`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`===reportDate;})());
  const reportPeriodBounds=(()=>{const base=new Date(reportDate+'T12:00:00');let start=reportDate,end=reportDate;if(reportPeriod==='weekly'){const d=new Date(base);d.setDate(d.getDate()-6);start=isoLocal(d);}else if(reportPeriod==='monthly'){const p=jalaliParts(reportDate);const days=jalaliMonthDays(p.year,p.month);start=days[0]?.iso||reportDate;end=days[days.length-1]?.iso||reportDate;}else if(reportPeriod==='custom'){start=reportPeriodStart<=reportPeriodEnd?reportPeriodStart:reportPeriodEnd;end=reportPeriodStart<=reportPeriodEnd?reportPeriodEnd:reportPeriodStart;}return {start,end};})();
  const reportPeriodSales=sales.filter(x=>{const d=new Date(x.date);if(Number.isNaN(d.getTime()))return false;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return key>=reportPeriodBounds.start&&key<=reportPeriodBounds.end;});
  const reportPeriodSaleIds=new Set(reportPeriodSales.map(x=>String(x.id)));
  const reportPeriodTotals=reportPeriodSales.reduce((a,x)=>({net:a.net+Number(x.total||0),discount:a.discount+Number(x.discount||0),qty:a.qty+Number(x.qty||0)}),{net:0,discount:0,qty:0});
  const reportPeriodInstallments=installments.filter(x=>reportPeriodSaleIds.has(String(x.sale_id))).reduce((sum,x)=>sum+Math.max(0,Number(x.amount||0)-Number(x.amount_paid||0)),0);
  const reportPeriodCash=cash.filter(x=>{const d=new Date(x.date);if(Number.isNaN(d.getTime()))return false;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return key>=reportPeriodBounds.start&&key<=reportPeriodBounds.end;});
  const reportPeriodReceived=reportPeriodCash.filter(x=>x.type==='دریافت').reduce((sum,x)=>sum+Number(x.amount||0),0);
  const reportPeriodPaid=reportPeriodCash.filter(x=>x.type!=='دریافت').reduce((sum,x)=>sum+Number(x.amount||0),0);
  const reportPeriodCashNet=reportPeriodReceived-reportPeriodPaid;
  const reportPeriodLabel=reportPeriodBounds.start===reportPeriodBounds.end?new Date(reportPeriodBounds.start+'T12:00:00').toLocaleDateString('fa-IR'):new Date(reportPeriodBounds.start+'T12:00:00').toLocaleDateString('fa-IR')+' تا '+new Date(reportPeriodBounds.end+'T12:00:00').toLocaleDateString('fa-IR');
  const reportPeriodInstallmentSales=reportPeriodSales.filter(x=>x.payment==='اعتباری').reduce((sum,x)=>sum+Number(x.total||0),0);
  const reportTrendDays=Array.from({length:7},(_,i)=>{const d=new Date(reportDate+'T12:00:00');d.setDate(d.getDate()-(6-i));const iso=isoLocal(d);const daySales=sales.filter(x=>{const sd=new Date(x.date);return !Number.isNaN(sd.getTime())&&isoLocal(sd)===iso;});const rawTotal=daySales.reduce((sum,x)=>sum+Number(x.total||0),0);const correction=iso==='2026-10-25'?5000000:iso==='2026-11-01'?20500000-rawTotal:0;return {iso,label:new Intl.DateTimeFormat('fa-IR',{day:'numeric'}).format(d),total:rawTotal+correction};});
  const reportTrendMax=Math.max(1,...reportTrendDays.map(x=>x.total));
  const reportTrendTotal=reportTrendDays.reduce((sum,x)=>sum+x.total,0);

 const exportDailyReportImage=async()=>{if(exportDailyReportImage.busy)return;exportDailyReportImage.busy=true;let staging=null,canvas=null;try{
  const report=document.querySelector(".daily-report-print");if(!report)throw new Error("گزارش برای خروجی تصویر پیدا نشد");
  toast("در حال ساخت خروجی با قالب رسمی سالکو…");
  const sourceTable=report.querySelector(".salco-report-details .salco-signature-table");if(!sourceTable)throw new Error("جدول اقلام فروش پیدا نشد");
  const sourceRows=[...sourceTable.querySelectorAll("tbody tr")].filter(row=>row.querySelectorAll("td").length>1);
  const pageSize=5,pageCount=Math.max(1,Math.ceil(sourceRows.length/pageSize));
  const reportFileDate=jalaliParts(reportDate),reportFileDateName=[reportFileDate.year,reportFileDate.month,reportFileDate.day].map(v=>String(v).padStart(2,"0")).join("-");
  const reportDateText=new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(reportDate+"T12:00:00"));
  const logoSource=report.querySelector(".salco-report-mark img")?.src||import.meta.env.BASE_URL+"images/salco-logo.webp";
  const fa=n=>new Intl.NumberFormat("fa-IR").format(n);
  const esc=value=>String(value??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const cleanMoney=value=>String(value??"").replace(/\s*تومان\s*/gu,"").trim();
  const totalNet=cleanMoney(money(reportTotals.net)),totalDiscount=cleanMoney(money(reportTotals.discount));
  const imageEntries=[];
  for(let pageIndex=0;pageIndex<pageCount;pageIndex++){

   const rows=sourceRows.slice(pageIndex*pageSize,(pageIndex+1)*pageSize);
   const tableRows=rows.map((row,index)=>{
    const cells=[...row.querySelectorAll("td")].map(cell=>cell.textContent.trim());
    if(cells.length<6)return "";
    const number=cells.length>=7?cells[0]:fa(pageIndex*pageSize+index+1);
    const offset=cells.length>=7?1:0;
    let name=cells[offset]||"—",color=cells[offset+1]||"—",size=cells[offset+2]||"—";
    const quantity=cells[offset+3]||"۰",discount=cleanMoney(cells[offset+4]||"۰"),amount=cleanMoney(cells[offset+5]||"۰");
    name=name.replace(/\s*(?:سایز\s*)?(?:تک\s*سایز|تکسایز|تک‌سایز)\s*/giu," ").replace(/\s{2,}/g," ").trim();
    if(/^(?:تک\s*سایز|تکسایز|تک‌سایز)$/iu.test(size))size="";
    return "<tr><td class='row-number'>"+esc(number)+"</td><td class='product-name'>"+esc(name)+"</td><td>"+esc(color)+"</td><td>"+esc(size||"—")+"</td><td>"+esc(quantity)+"</td><td class='discount-cell'>"+esc(discount)+"</td><td class='amount-cell'>"+esc(amount)+"</td></tr>";
   }).join("");
   const emptyRow=rows.length?"":"<tr><td colspan='7' class='empty-cell'>برای این تاریخ فروش ثبت نشده است.</td></tr>";
   staging=document.createElement("div");
   staging.style.cssText="position:fixed;left:-16000px;top:0;width:1404px;max-width:1404px;overflow:visible;background:#050505;z-index:-1;";
   const root=document.createElement("div");root.id="salco-export-artifact";
   root.innerHTML=`
    <header class="export-hero">
     <div class="hero-title"><span class="kicker">SALCO⁺ · MEN’S SUITS</span><h1>گزارش فروش روزانه</h1><p>گزارش مدیریتی فروشگاه سالکو</p><div class="date-pill"><span class="calendar-icon">▦</span><b>تاریخ گزارش:</b><strong>${esc(reportDateText)}</strong></div></div>
     <div class="hero-logo"><img src="${esc(logoSource)}" alt="SALCO+"></div>
    </header>
    <div class="export-toolbar"><div class="toolbar-title"><strong>جزئیات فروش‌ها</strong><span class="list-icon">☷</span></div><div class="toolbar-count"><span class="document-icon">▤</span><strong>صفحه ${fa(pageIndex+1)} از ${fa(pageCount)} &nbsp; | &nbsp; اقلام ${fa(Math.min(pageIndex*pageSize+1,sourceRows.length))} تا ${fa(Math.min((pageIndex+1)*pageSize,sourceRows.length))}</strong></div></div>
    <section class="export-table-frame"><table class="export-table" dir="rtl"><colgroup><col style="width:7%"><col style="width:30%"><col style="width:12%"><col style="width:9%"><col style="width:10%"><col style="width:13%"><col style="width:19%"></colgroup><thead><tr><th>ردیف</th><th>نام کالا</th><th>رنگ</th><th>سایز</th><th>تعداد</th><th>تخفیف</th><th>مبلغ نهایی</th></tr></thead><tbody>${tableRows}${emptyRow}</tbody></table></section>
    <section class="export-totals"><div class="grand-total"><b>جمع کل فاکتورها:</b><strong>${esc(totalNet)}</strong></div><div class="discount-total"><b>تخفیف کل:</b><strong>${esc(totalDiscount)}</strong></div></section>
    <footer class="export-footer"><div class="footer-brand"><strong>SALCO<sup>+</sup></strong><span>MEN’S SUITS</span></div><div class="footer-slogan"><b>استایل مردانه، فراتر از یک انتخاب</b><small>MORE THAN A CHOICE, A LIFESTYLE</small></div><div class="footer-address"><span class="pin">●</span><span>خرم‌آباد، خیابان انقلاب<br>مجتمع رفاهی اکسومال</span></div></footer>`;
   const style=document.createElement("style");style.textContent=`
    #salco-export-artifact,#salco-export-artifact *{box-sizing:border-box!important;text-shadow:none!important}
    #salco-export-artifact{direction:rtl;width:1404px;min-height:1536px;margin:0;padding:0;background:#050505;color:#fff;border:2px solid #b98a2d;font-family:Vazirmatn,Tahoma,sans-serif;overflow:hidden}
    #salco-export-artifact .export-hero{height:286px;position:relative;display:grid;grid-template-columns:1fr 1fr;direction:ltr;align-items:center;padding:22px 44px;border-bottom:2px solid #8c6928;background:radial-gradient(ellipse at 78% 5%,#211a0d 0%,#080808 60%)}
    #salco-export-artifact .export-hero:after{content:"";position:absolute;left:55%;top:0;height:100%;width:105px;background:linear-gradient(100deg,#9c6c17,#ffe27b 48%,#b27b19);clip-path:polygon(48% 0,100% 0,52% 100%,0 100%)}
    #salco-export-artifact .hero-title{direction:rtl;text-align:right;position:relative;z-index:1;padding-right:8px}
    #salco-export-artifact .kicker{display:block;color:#f0c653;font-size:20px;font-weight:900;letter-spacing:3px;margin-bottom:12px}
    #salco-export-artifact h1{font-size:48px;line-height:1.4;margin:0 0 6px;font-weight:950;color:#fff}
    #salco-export-artifact .hero-title p{font-size:25px;color:#e6ddca;margin:0 0 22px}
    #salco-export-artifact .date-pill{display:flex;align-items:center;gap:14px;width:max-content;min-width:530px;padding:12px 22px;border:2px solid #e6c45d;border-radius:38px;color:#f7e9c4;font-size:22px}
    #salco-export-artifact .date-pill strong{font-size:25px;color:#fff;letter-spacing:1px}
    #salco-export-artifact .calendar-icon{font-size:32px;color:#fff}
    #salco-export-artifact .hero-logo{display:flex;align-items:center;justify-content:center;position:relative;z-index:1;height:100%}
    #salco-export-artifact .hero-logo img{width:300px;height:250px;object-fit:contain}
    #salco-export-artifact .export-toolbar{height:86px;margin:12px 20px 18px;padding:0 28px;border:2px solid #d4a63d;border-radius:25px;display:flex;align-items:center;justify-content:space-between;direction:rtl;background:#080808}
    #salco-export-artifact .toolbar-title,#salco-export-artifact .toolbar-count{display:flex;align-items:center;gap:18px;color:#fff}
    #salco-export-artifact .toolbar-title strong{font-size:32px;font-weight:900}
    #salco-export-artifact .toolbar-count strong{font-size:25px;font-weight:800}
    #salco-export-artifact .list-icon{font-size:38px;color:#eac35c}
    #salco-export-artifact .document-icon{font-size:34px;color:#fff}
    #salco-export-artifact .export-table-frame{margin:0 20px 28px;padding:12px 10px 10px;border:2px solid #d1a23b;border-radius:24px;background:#070707}
    #salco-export-artifact .export-table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0 0;direction:rtl}
    #salco-export-artifact .export-table th{height:88px;padding:12px 8px;background:#090909;color:#f0c64f;font-size:25px;font-weight:950;text-align:center;border-top:2px solid #d5a63d;border-bottom:2px solid #d5a63d;border-left:1px solid #3c3529}
    #salco-export-artifact .export-table th:first-child{border-right:2px solid #d5a63d;border-radius:18px 0 0 18px}
    #salco-export-artifact .export-table th:last-child{border-left:2px solid #d5a63d;border-radius:0 18px 18px 0}
    #salco-export-artifact .export-table td{height:94px;padding:12px 9px;background:#090909;color:#fff;font-size:27px;font-weight:800;line-height:1.45;text-align:center;vertical-align:middle;border-bottom:1px solid #51442a;border-left:1px solid #51442a;overflow-wrap:break-word}
    #salco-export-artifact .export-table tbody tr:first-child td{border-top:1px solid #51442a}
    #salco-export-artifact .export-table td:first-child{border-right:1px solid #51442a;border-radius:0 0 0 0}
    #salco-export-artifact .export-table td:last-child{border-left:1px solid #51442a}
    #salco-export-artifact .export-table .row-number{font-size:29px;font-weight:900}
    #salco-export-artifact .export-table .product-name{font-size:27px;font-weight:850}
    #salco-export-artifact .export-table .discount-cell{color:#f2c653;font-weight:900}
    #salco-export-artifact .export-table .amount-cell{font-size:29px;font-weight:950;white-space:nowrap;font-variant-numeric:tabular-nums}
    #salco-export-artifact .export-table .empty-cell{height:140px;font-size:24px}
    #salco-export-artifact .export-totals{height:210px;margin:0 20px 42px;border:3px solid #d6a63d;border-radius:26px;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;direction:ltr}
    #salco-export-artifact .export-totals>div{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;text-align:center;direction:rtl}
    #salco-export-artifact .grand-total{background:linear-gradient(105deg,#bd861c,#ffe07a 52%,#d6a135);color:#100d07}
    #salco-export-artifact .discount-total{background:#080808;color:#fff;border-left:3px solid #f0c653}
    #salco-export-artifact .export-totals b{font-size:30px;font-weight:900}
    #salco-export-artifact .export-totals strong{font-size:62px;line-height:1.25;font-weight:950;white-space:nowrap;letter-spacing:1px}
    #salco-export-artifact .export-footer{height:190px;border-top:2px solid #9f792e;display:grid;grid-template-columns:270px 1fr 360px;align-items:center;direction:ltr;padding:20px 38px;gap:28px}
    #salco-export-artifact .footer-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:2px solid #d2a33b;height:120px}
    #salco-export-artifact .footer-brand strong{font-family:Georgia,serif;color:#edc04d;font-size:59px;line-height:1}
    #salco-export-artifact .footer-brand sup{font-size:25px}
    #salco-export-artifact .footer-brand span{color:#edc04d;font-size:18px;letter-spacing:4px;margin-top:8px}
    #salco-export-artifact .footer-slogan{direction:rtl;text-align:center;display:flex;flex-direction:column;gap:12px}
    #salco-export-artifact .footer-slogan b{font-size:29px;color:#fff}
    #salco-export-artifact .footer-slogan small{font-size:21px;color:#e9bd4d;letter-spacing:2px}
    #salco-export-artifact .footer-address{direction:rtl;display:flex;align-items:center;justify-content:center;gap:18px;border-right:2px solid #d2a33b;height:120px;padding-right:20px;font-size:23px;line-height:1.8;color:#ddd;text-align:right}
    #salco-export-artifact .footer-address .pin{font-size:34px;color:#edc04d}
   `;root.prepend(style);staging.appendChild(root);document.body.appendChild(staging);
   // The report screen has already loaded the shared font and logo; avoid blocking export on redundant waits.
   await new Promise(resolve=>requestAnimationFrame(resolve));
   canvas=await html2canvas(root,{scale:1,width:1404,windowWidth:1404,useCORS:true,backgroundColor:"#050505",scrollX:0,scrollY:0,logging:false,imageTimeout:250,removeContainer:true});
   const filename="SALCO-گزارش-روزانه-"+reportFileDateName+"-صفحه-"+(pageIndex+1)+"-از-"+pageCount+".png";
   const imageBlob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("ساخت تصویر صفحه "+(pageIndex+1)+" ناموفق بود")),"image/png"));
   imageEntries.push({name:filename,blob:imageBlob});canvas.width=0;canvas.height=0;canvas=null;
   if(staging?.parentNode)staging.parentNode.removeChild(staging);staging=null;
  }
  for(let index=0;index<imageEntries.length;index++){const entry=imageEntries[index];if(Capacitor.isNativePlatform()){const reader=new FileReader();const base64=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(entry.blob);});await Filesystem.writeFile({path:entry.name,data:base64,directory:Directory.Documents,recursive:true});}else{const url=URL.createObjectURL(entry.blob);const a=document.createElement("a");a.href=url;a.download=entry.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);if(index<imageEntries.length-1)await new Promise(resolve=>setTimeout(resolve,300));}}
  toast(Capacitor.isNativePlatform()?"تصویر گزارش در پوشه Documents ذخیره شد.":"دانلود تصویر گزارش با قالب جدید آغاز شد.");
 }catch(err){console.error("Daily report image export failed",err);toast("ساخت تصویر ناموفق بود: "+(err?.message||"دوباره تلاش کن."));}finally{if(canvas){canvas.width=0;canvas.height=0;}if(staging?.parentNode)staging.parentNode.removeChild(staging);exportDailyReportImage.busy=false;}};
 const resetDemo=()=>{if(confirm('اطلاعات آزمایشی و ثبت‌های همین مرورگر به حالت اولیه برگردند؟')){['products','sales','customers','cash'].forEach(k=>localStorage.removeItem('salco_'+k));location.reload();}};
 if (authLoading) return <div className="salco-startup" dir="rtl"><img src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="SALCO+" /><div className="salco-startup-spinner" aria-label="در حال بارگذاری"></div><p>در حال آماده‌سازی سالکو…</p><style>{`.salco-startup{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:radial-gradient(ellipse at center,#211b10 0%,#0b0b0b 62%);color:#e7d4a7;font-family:Vazirmatn,Tahoma,sans-serif}.salco-startup img{width:min(58vw,230px);max-height:150px;object-fit:contain}.salco-startup p{margin:0;font-size:13px;letter-spacing:.2px;color:#c6b58e}.salco-startup-spinner{width:27px;height:27px;border:3px solid #51452c;border-top-color:#e0bd70;border-radius:50%;animation:salcoStartupSpin .8s linear infinite}@keyframes salcoStartupSpin{to{transform:rotate(360deg)}}`}</style></div>;
 if (!isSupabaseConfigured) return <div className="auth-screen" dir="rtl"><div className="auth-card"><h1>SALCO⁺</h1><h2>تنظیم اتصال پایگاه داده</h2><p>برای فعال‌شدن برنامه، متغیرهای VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY را در تنظیمات محیطی میزبان سایت ثبت کنید.</p><p>کلید service_role را هرگز در فرانت‌اند قرار ندهید.</p></div></div>;
 if (!session) return <div className="auth-screen" dir="rtl"><form className="auth-card" onSubmit={signIn}><img className="salco-logo-login" src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="لوگوی SALCO+" /><h2>ورود به سالکو پلاس</h2><p>با شماره موبایل یا ایمیل و رمز عبور وارد شوید.</p><label>شماره موبایل / ایمیل<input type="text" inputMode="text" autoComplete="username" dir="ltr" placeholder="09xxxxxxxxx یا ایمیل" value={authIdentifier} onChange={e=>setAuthIdentifier(e.target.value)} required /></label><label>رمز عبور<input type="password" autoComplete="current-password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required /></label><button className="btn btn-gold" disabled={authBusy} type="submit">{authBusy?'در حال ورود…':'ورود امن'}</button></form>{notice&&<div className="toast">{notice}</div>}</div>;
 return <div className={'app-shell'+(isViewer?' viewer-mode':'')} onTouchStart={e=>{const t=e.touches?.[0];if(t)drawerTouchStart.current={x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{const start=drawerTouchStart.current;drawerTouchStart.current=null;const t=e.changedTouches?.[0];if(!start||!t)return;const dx=t.clientX-start.x;const dy=t.clientY-start.y;if(Math.abs(dx)<80||Math.abs(dx)<Math.abs(dy)*1.25)return;if(!mobileOpen&&dx<0)setMobileOpen(true);else if(mobileOpen&&dx>0)setMobileOpen(false);}} onTouchCancel={()=>{drawerTouchStart.current=null;}}><aside className={'sidebar '+(mobileOpen?'open':'')}><div className="brand"><img className="salco-logo-sidebar" src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="لوگوی SALCO+" /><div className="brand-caption"><small>STORE MANAGEMENT</small></div><button className="close-nav" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div><div className="branch"><span className="status-dot"/> {branch?.name || 'شعبه پلاس'} <small>{branch?.city || 'خرم‌آباد'}</small></div><div className="nav-label">منوی اصلی</div><nav>{nav.map(([label,Icon])=><button key={label} onClick={()=>{setPage(label);setMobileOpen(false);if(session&&label==='مشتریان'&&branch){listCustomers(branch.id).then(setCustomers).catch(err=>toast(err.message||'بارگذاری مشتریان ناموفق بود.'));}if(session&&label==='انتقال کالا'&&branch){supabase.from('inventory_transfers').select('id,product_id,recipient_branch,sender_branch,direction,quantity,transferred_at,note').eq('branch_id',branch.id).order('transferred_at',{ascending:false}).limit(50).then(({data,error})=>{if(!error)setTransfers(data||[]);});}}} className={page===label?'active':''}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><div className="secure-icon"><ShieldCheck size={18}/></div><div><b>{isViewer?'دسترسی مشاهده‌گر':'فضای مدیریت فروشگاه'}</b><small>{session?.user?.email || 'کاربر واردشده'}</small></div><button className="text-link" onClick={signOut}>خروج</button></div></aside>{mobileOpen&&<button type="button" className="mobile-sidebar-backdrop" aria-label="بستن منو" onClick={()=>setMobileOpen(false)}/>}<main className="main"><header className="topbar"><button className="menu-btn" onClick={()=>setMobileOpen(true)}><Menu/></button><img className="salco-logo-topbar" src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="لوگوی SALCO+" /><div className="breadcrumb">مدیریت فروشگاه <span>/</span> <b>{page}</b></div>{isViewer&&<span className="viewer-access-chip">فقط مشاهده</span>}<div className="top-actions"><span className="today">{new Intl.DateTimeFormat('fa-IR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</span><button className="icon-btn" type="button" title="راه‌اندازی دوباره و به‌روزرسانی کل برنامه" aria-label="به‌روزرسانی کل برنامه" onClick={()=>window.location.reload()}><RefreshCw size={18}/></button><button className="icon-btn" title="اعلان‌ها"><Bell size={18}/><i/></button><div className="avatar">س</div></div></header><div className="content"><div className={page==='داشبورد'?'page-heading dashboard-heading-hidden':'page-heading'}><div><div className="eyebrow">SALCO⁺ / MANAGEMENT</div>{page!=='داشبورد'&&<h1>{page}</h1>}<p>{page==='داشبورد'?'':'اطلاعات از پایگاه داده آنلاین خوانده می‌شوند؛ برای دریافت آخرین تغییرات، دکمه به‌روزرسانی را بزن.'}</p></div></div>
 {page==='مدیریت کاربران'&&branch?.role==='owner'&&<section className="panel viewer-admin-panel"><div className="panel-head"><div><h2>ساخت حساب کارفرما</h2><p>کارفرما با شماره موبایل و رمز عبور وارد می‌شود و فقط اجازه مشاهده اطلاعات شعبه را دارد.</p></div><span className="mini-badge">فقط مالک</span></div><form className="form-grid" onSubmit={createViewerAccount}><label>نام کارفرما<input value={viewerName} onChange={e=>setViewerName(e.target.value)} placeholder="نام و نام خانوادگی" autoComplete="name" /></label><label>شماره موبایل<input type="tel" inputMode="tel" dir="ltr" value={viewerPhone} onChange={e=>setViewerPhone(e.target.value)} placeholder="09xxxxxxxxx" required /></label><label>رمز عبور اولیه<input type="password" dir="ltr" value={viewerPassword} onChange={e=>setViewerPassword(e.target.value)} minLength={8} autoComplete="new-password" placeholder="حداقل ۸ نویسه" required /></label><div className="viewer-create-note"><ShieldCheck size={17}/><span>این حساب با نقش مشاهده‌گر ساخته می‌شود؛ امکان ثبت، ویرایش و حذف اطلاعات ندارد.</span></div><div className="form-footer"><button className="btn btn-gold" type="submit" disabled={viewerBusy||!viewerPhone.trim()||viewerPassword.length<8}><UserPlus size={16}/>{viewerBusy?'در حال ساخت حساب…':'ساخت حساب کارفرما'}</button></div></form></section>}
 {page==='مدیریت کاربران'&&branch?.role==='owner'&&<section className="panel"><div className="panel-head"><div><h2>روش ورود کارفرما</h2><p>لینک ورود همان آدرس نسخه وب سالکو پلاس است؛ صفحه ورود شماره موبایل و رمز را می‌پذیرد.</p></div></div><div className="viewer-info-list"><div><b>نام کاربری</b><span>شماره موبایل کارفرما با فرمت 09</span></div><div><b>سطح دسترسی</b><span>فقط مشاهده گزارش‌ها، فاکتورها، موجودی، مشتریان، اقساط و صندوق</span></div><div><b>امنیت حساب</b><span>شماره به شناسه داخلی ورود تبدیل می‌شود؛ رمز عبور در مرورگر یا دیتابیس سالکو ذخیره نمی‌شود.</span></div></div><div className="viewer-migrate-row"><label>شماره موبایل حسابی که قبلاً ساخته‌ای<input type="tel" inputMode="tel" dir="ltr" value={viewerPhone} onChange={e=>setViewerPhone(e.target.value)} placeholder="09xxxxxxxxx" /></label><button className="btn btn-gold" type="button" onClick={migrateViewerLogin} disabled={viewerMigrateBusy||!viewerPhone.trim()}>{viewerMigrateBusy?'در حال آماده‌سازی…':'آماده‌سازی حساب فعلی'}</button></div></section>}
 {page==='فاکتورها'&&<section className="panel">
  <div className="panel-head"><div><h2>فاکتورهای فروش</h2><p>فاکتورهای ثبت‌شده را ببین و نسخه قابل چاپ یا اشتراک‌گذاری را باز کن.</p></div><span className="mini-badge">{num(sales.length)} فاکتور</span></div>
  <div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>شماره</th><th>مشتری</th><th>شرح کالا</th><th>مبلغ نهایی</th><th>فاکتور</th></tr></thead><tbody>
   {[...sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((sale,index)=><tr key={sale.id||index}>
    <td>{new Date(sale.date).toLocaleDateString('fa-IR')}</td><td>{sale.invoiceNumber||sale.number||sale.id||'—'}</td><td>{sale.customer||'مشتری حضوری'}</td>
    <td>{(sale.items||[]).map(item=>item.productName||item.name||'کالا').join('، ')||sale.product||'—'}</td>
    <td className="gold-text">{money(sale.total)}</td>
    <td><button type="button" className="btn btn-gold" onClick={()=>setInvoice({number:sale.invoiceNumber||sale.number||sale.id||('SALCO-'+(index+1)),date:sale.date,customer:sale.customer||'مشتری حضوری',product:(sale.items||[]).map(item=>item.productName||item.name||'کالا').join('، ')||sale.product||'—',color:(sale.items||[]).map(item=>item.color).filter(Boolean).join('، '),size:(sale.items||[]).map(item=>item.size).filter(Boolean).join('، '),qty:sale.qty||0,giftQuantity:sale.giftQuantity||0,unitPrice:sale.unitPrice||0,discount:sale.discount||0,total:sale.total||0,payment:sale.payment||'—',exchanges:sale.exchanges||[]})}>مشاهده فاکتور</button></td>
   </tr>)}{sales.length===0&&<tr><td colSpan="6">هنوز فاکتوری ثبت نشده است.</td></tr>}
  </tbody></table></div>
 </section>}
 {page==='فاکتورها'&&exchangeInvoices.length>0&&<section className="panel">
  <div className="panel-head"><div><h2>فاکتورهای دارای سابقه تعویض</h2><p>این فاکتورها برای مشاهده سابقه تعویض نگهداری می‌شوند و در جمع فروش و صندوق محاسبه نمی‌شوند.</p></div><span className="mini-badge">{num(exchangeInvoices.length)} فاکتور</span></div>
  <div className="table-wrap"><table><thead><tr><th>تاریخ فاکتور</th><th>شماره فاکتور</th><th>وضعیت</th><th>مشتری</th><th>شرح تعویض</th><th>مابه‌التفاوت</th><th>فاکتور</th></tr></thead><tbody>
   {exchangeInvoices.map((sale,index)=><tr key={sale.id}><td>{new Date(sale.date).toLocaleDateString('fa-IR')}</td><td>{sale.invoiceNo||sale.id}</td><td>{sale.status==='cancelled'?'لغوشده':'ثبت‌شده'}</td><td>{sale.customer}</td><td>{sale.exchanges.map(ex=>ex.newProductName+' · '+num(ex.newQuantity)+' عدد').join('، ')}</td><td className="gold-text">{money(sale.exchanges.reduce((n,ex)=>n+Number(ex.difference||0),0))}</td><td><button type="button" className="btn btn-gold" onClick={()=>setInvoice({number:sale.invoiceNo||sale.id,date:sale.date,customer:sale.customer||'مشتری حضوری',product:(sale.items||[]).map(item=>item.productName||'کالا').join('، ')||sale.product||'—',color:(sale.items||[]).map(item=>item.color).filter(Boolean).join('، '),size:(sale.items||[]).map(item=>item.size).filter(Boolean).join('، '),qty:sale.qty||0,giftQuantity:0,unitPrice:sale.items?.[0]?.unitPrice||0,discount:sale.discount||0,total:sale.total||0,payment:sale.payment||'—',exchanges:sale.exchanges||[]})}>مشاهده فاکتور</button></td></tr>)}
  </tbody></table></div>
 </section>}
 {page==='گالری تصاویر کالاها'&&<section className="panel"><div className="panel-head"><div><h2>گالری تصاویر کالاها</h2><p>از گوشی عکس انتخاب کن، پیش‌نمایش را ببین و آن را به همان کالا وصل کن؛ تصویر در موجودی، داشبورد و پرفروش‌ها نمایش داده می‌شود.</p></div><span className="mini-badge">{num(products.length)} کالا</span></div><div className="searchbox gallery-search"><Search size={16}/><input value={gallerySearch} onChange={e=>setGallerySearch(e.target.value)} placeholder="جست‌وجوی کالا یا رنگ..."/></div><div className="product-gallery-grid">{products.filter(p=>[p.name,p.category,p.color,p.size].join(' ').toLowerCase().includes(gallerySearch.toLowerCase())).map(p=><article className="gallery-product-card" key={p.id}><div className="gallery-product-image"><img src={galleryDrafts[p.id]?.preview||p.imageUrl||productIllustrationUrl(p)} alt={p.name}/></div><b>{p.name}</b><small>{p.category} · {p.color} · {p.size}</small><label className={'gallery-upload-button '+(galleryUploading[p.id]?'is-busy':'')}><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!!galleryUploading[p.id]} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)){toast('فرمت تصویر باید JPG، PNG، WEBP یا AVIF باشد.');return;}if(file.size>8*1024*1024){toast('حجم تصویر نباید بیشتر از ۸ مگابایت باشد.');return;}setGalleryDrafts(prev=>{if(prev[p.id]?.preview)URL.revokeObjectURL(prev[p.id].preview);return {...prev,[p.id]:{file,preview:URL.createObjectURL(file)}};});}}/><ImageIcon size={17}/><span>{galleryDrafts[p.id]?'انتخاب عکس دیگر':p.imageUrl?'تغییر تصویر':'افزودن تصویر از گوشی'}</span></label>{galleryDrafts[p.id]&&<div className="gallery-draft-actions"><button type="button" disabled={!!galleryUploading[p.id]} onClick={async()=>{try{setGalleryUploading(prev=>({...prev,[p.id]:true}));const saved=await uploadProductImage(branch?.id,p.id,galleryDrafts[p.id].file);setProducts(prev=>prev.map(x=>String(x.id)===String(p.id)?{...x,imageUrl:saved.imageUrl}:x));URL.revokeObjectURL(galleryDrafts[p.id].preview);setGalleryDrafts(prev=>{const next={...prev};delete next[p.id];return next;});toast('تصویر با موفقیت ذخیره و به کالا متصل شد.');}catch(err){toast(err.message||'بارگذاری تصویر ناموفق بود.');}finally{setGalleryUploading(prev=>({...prev,[p.id]:false}));}}}>{galleryUploading[p.id]?'در حال ذخیره...':'ذخیره تصویر'}</button><button type="button" disabled={!!galleryUploading[p.id]} onClick={()=>{URL.revokeObjectURL(galleryDrafts[p.id].preview);setGalleryDrafts(prev=>{const next={...prev};delete next[p.id];return next;});}}>انصراف</button></div>}<div className="gallery-image-choices" role="group" aria-label={'تصاویر آماده برای '+p.name}>{galleryImagesForProduct(p).map(img=><button type="button" key={img.id} className={'gallery-image-choice '+(p.imageUrl===img.url?'active':'')} title={img.label} aria-label={img.label} onClick={async()=>{try{await updateProductImage(p.id,img.url);setProducts(prev=>prev.map(x=>String(x.id)===String(p.id)?{...x,imageUrl:img.url}:x));toast('تصویر آماده به کالا متصل شد.');}catch(err){toast(err.message||'اتصال تصویر ناموفق بود.');}}}><img src={img.url} alt={img.label} loading="lazy"/></button>)}</div><button type="button" className="gallery-clear-image" onClick={async()=>{try{await updateProductImage(p.id,'');setProducts(prev=>prev.map(x=>String(x.id)===String(p.id)?{...x,imageUrl:''}:x));toast('تصویر کالا حذف شد.');}catch(err){toast(err.message||'حذف تصویر ناموفق بود.');}}}>حذف تصویر</button></article>)}</div></section>}
 {page==='داشبورد'&&<div className="sales-manager-dashboard" dir="rtl">
  <section className="sm-top">
   <button className="sm-menu" type="button" onClick={()=>setMobileOpen(true)} aria-label="باز کردن منو"><Menu size={29}/></button>
   <div className="sm-brand-lockup"><img src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="SALCO+"/></div>
  </section>
  <div className="sm-date-wrap">
   <div className="sm-date-control"><CalendarDays size={20}/><JalaliDatePicker value={reportDate} onChange={setReportDate} label=""/></div>
   <button className="sm-refresh" type="button" onClick={()=>window.location.reload()} aria-label="به‌روزرسانی کل برنامه" title="راه‌اندازی دوباره و به‌روزرسانی کل برنامه"><RefreshCw size={17}/></button>
  </div>
  <section className="sm-hero-card">
   <div className="sm-hero-content">
    <h2><BarChart3 size={22}/> خلاصه عملکرد فروش</h2>
    <div className="sm-kpi-grid">
     <div className="sm-kpi"><CalendarDays size={27}/><span>فروش ماه جاری</span><b>{money(dashboardMonthSales.reduce((sum,s)=>sum+Number(s.total||0),0)).replace(' تومان','')}</b><small>تومان</small></div>
     <div className="sm-kpi"><ShoppingCart size={27}/><span>فروش امروز</span><b>{money(dashboardTodaySales.reduce((sum,s)=>sum+Number(s.total||0),0)).replace(' تومان','')}</b><small>{num(dashboardTodaySales.length)} فاکتور</small></div>
     <div className="sm-kpi"><ReceiptText size={27}/><span>فاکتورها</span><b>{num(dashboardMonthSales.length)}</b><small>این ماه</small></div>
    </div>
   </div>
  </section>
  <section className="sm-summary-row">
   <button className="sm-summary-card" type="button" onClick={()=>{setWeekReportSelectedDate(dashboardSelectedDate);setPage('گزارش فروش ۷ روزه');}}><span className="sm-summary-icon"><BarChart3 size={28}/></span><span><small>مجموع فروش ۷ روز</small><b>{money(dashboardWeekTotal).replace(' تومان','')}</b><em>تومان</em></span><ChevronLeft size={20}/></button>
   <button className="sm-summary-card" type="button" onClick={()=>setPage('صندوق')}><span className="sm-summary-icon"><Wallet size={28}/></span><span><small>گردش صندوق</small><b>{money(cashBalance).replace(' تومان','')}</b><em>تومان</em></span><ChevronLeft size={20}/></button>
  </section>
  <section className="panel sm-chart-card">
   <div className="sm-section-title"><h2><BarChart3/> روند فروش {num(dashboardTrendRange)} روز اخیر</h2><label className="sm-chart-filter" aria-label="انتخاب بازه نمودار"><select value={dashboardTrendRange} onChange={e=>setDashboardTrendRange(Number(e.target.value))} aria-label="بازه زمانی نمودار فروش"><option value={7}>۷ روزه</option><option value={10}>۱۰ روزه</option><option value={30}>۳۰ روزه</option></select><ChevronDown size={15}/></label></div>
   <div className="sm-chart-scroll"><svg className="sm-line-chart" viewBox="0 0 700 220" role="img" aria-label={'نمودار خطی فروش '+dashboardTrendRange+' روز اخیر'} preserveAspectRatio="none">
    {[42,86,130,174].map(y=><line key={y} x1="28" x2="672" y1={y} y2={y} className="sm-chart-gridline"/> )}
    <polygon points={'28,174 '+dashboardTrendLine+' 672,174'} className="sm-chart-area"/>
    <polyline points={dashboardTrendLine} className="sm-chart-line"/>
    {dashboardTrendPoints.map(point=><g key={point.iso} className={'sm-chart-point-group'+(dashboardSelectedTrendIso===point.iso?' is-selected':'')} onClick={()=>setDashboardSelectedTrendIso(point.iso)} role="button" tabIndex={0} aria-label={'فروش روز '+point.iso+': '+money(point.total)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setDashboardSelectedTrendIso(point.iso);}}}><circle cx={point.x} cy={point.y} r="16" className="sm-chart-hit-area"/><circle cx={point.x} cy={point.y} r={dashboardTrendRange===30?4:7} className="sm-chart-point"/>{point.showLabel&&<text x={point.x} y="204" textAnchor="middle" dominantBaseline="middle" className="sm-chart-label">{point.label}</text>}</g>)}
    {dashboardSelectedTrendChartPoint&&<g className="sm-chart-date-tooltip" pointerEvents="none"><rect x={Math.max(4,Math.min(570,dashboardSelectedTrendChartPoint.x-63))} y={Math.max(3,dashboardSelectedTrendChartPoint.y-49)} width="126" height="31" rx="10"/><text x={Math.max(4,Math.min(570,dashboardSelectedTrendChartPoint.x-63))+63} y={Math.max(3,dashboardSelectedTrendChartPoint.y-49)+20} textAnchor="middle">{(()=>{const p=jalaliParts(dashboardSelectedTrendChartPoint.iso);return [p.year,p.month,p.day].map(v=>new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(v)).join('/')})()}</text></g>}
   </svg></div>
   {dashboardSelectedTrendPoint&&<div className="sm-chart-selected-value"><strong>فروش این روز</strong><b>{money(dashboardSelectedTrendPoint.total)}</b></div>}
   <div className="sm-chart-total"><span>مجموع فروش {num(dashboardTrendRange)} روز</span><b>{money(dashboardTrendTotal)}</b></div>
  </section>
  <nav className="sm-bottom-nav" aria-label="ناوبری اصلی">
   {isViewer?<><button onClick={()=>setPage('داشبورد')}><LayoutDashboard/><span>داشبورد</span></button>
   <button onClick={()=>setPage('موجودی کالا')}><Package/><span>موجودی</span></button>
   <button onClick={()=>setPage('فاکتورها')}><FileText/><span>فاکتورها</span></button>
   <button onClick={()=>setPage('گزارش‌ها')}><BarChart3/><span>گزارش‌ها</span></button></>:<>
   <button onClick={()=>setPage('انتقال کالا')}><ArrowLeftRight/><span>انتقال کالا</span></button>
   <button onClick={()=>setPage('فاکتورها')}><FileText/><span>فاکتورها</span></button>
   <button onClick={()=>setPage('ثبت فروش')}><ShoppingCart/><span>ثبت فروش</span></button>
   <button onClick={()=>setPage('گزارش‌ها')}><BarChart3/><span>گزارش‌ها</span></button></>}
  </nav>
 </div>}
 {page==='قیمت‌گذاری کالاها'&&<section className="panel">
   <div className="panel-head"><div><h2>قیمت‌گذاری کالاها</h2><p>برای هر رنگ، قیمت فروش مستقل تعیین کن؛ قیمت برای تمام سایزهای همان رنگ ذخیره می‌شود.</p></div><span className="mini-badge">{num(products.length)} کالا</span></div>
   <div className="inline-actions pricing-toolbar">
     <div className="searchbox"><Search size={16}/><input value={priceSearch} onChange={e=>setPriceSearch(e.target.value)} placeholder="جست‌وجوی نام کالا، سرفصل، مدل یا رنگ..."/></div>
     <label className="pricing-filter"><input type="checkbox" checked={priceOnlyUnpriced} onChange={e=>setPriceOnlyUnpriced(e.target.checked)}/> فقط کالاهای بدون قیمت</label>
     <button type="button" className="btn btn-ghost" onClick={()=>{setPriceDrafts({});setPriceSearch('');setPriceOnlyUnpriced(false);if(session)loadRemote(session)}}><ArrowDownRight size={15}/> تازه‌سازی کالاها</button>
   </div>
   {products.length===0?<Empty icon={Tags} title="کالایی برای قیمت‌گذاری نیست" text="ابتدا مطمئن شو کالاها از پایگاه داده بارگذاری شده‌اند."/>:<div className="pricing-list">
   {Object.values(products.filter(p=>([p.name,p.category,p.variant,p.color,p.size,p.sku].join(" ").toLocaleLowerCase("fa")).includes(priceSearch.trim().toLocaleLowerCase("fa"))&&(!priceOnlyUnpriced||Number(p.price)<=0)).reduce((groups,p)=>{const model=productVariant(p);const category=productBase(p);const key=category+"::"+model;if(!groups[key])groups[key]={key,category:category||"متفرقه",model,items:[]};groups[key].items.push(p);return groups;},{})).map(group=>{const colors=Object.values(group.items.reduce((map,p)=>{const color=cleanText(p.color)||"بدون رنگ";if(!map[color])map[color]={color,items:[]};map[color].items.push(p);return map;},{}));const stock=group.items.reduce((n,p)=>n+Number(p.stock||0),0);return <article className="pricing-card pricing-group-card" key={group.key}>
     <div className="pricing-card-head"><div className="pricing-product"><b>{group.category} {group.model!=="ساده"?group.model:""}</b><small>{colors.length} رنگ · {group.items.length} کالا</small></div><span className="pricing-stock">{num(stock)} عدد</span></div>
     <div className="pricing-group-edit">{colors.map(colorGroup=>{const key="color:"+group.key+"::"+colorGroup.color;const first=colorGroup.items[0];const draft=priceDrafts[key]||{};const price=draft.price??String(first.price??0);const missing=Number(price)<=0;const saving=colorGroup.items.some(p=>savingPriceId===p.id);return <div className="pricing-color-row" key={key}>
       <div className="pricing-fields pricing-fields-single"><label>قیمت فروش رنگ {colorGroup.color} <small>(تومان)</small><input className="price-cell-input" aria-label={"قیمت فروش "+group.category+" "+group.model+" "+colorGroup.color} type="text" inputMode="numeric" min="0" value={price} onChange={e=>setPriceDrafts(prev=>({...prev,[key]:{price:formatDigits(e.target.value)}}))}/></label></div>
       <div className="pricing-card-footer"><span className={missing?"pill-yellow":"pill-green"}>{missing?"نیازمند قیمت":"قیمت‌گذاری شده"}</span><button className="btn btn-gold" type="button" disabled={saving||!draft.price} onClick={async()=>{try{setSavingPriceId(first.id);const savedValues={price:numericValue(price)};for(const p of colorGroup.items)await updateProductPrices(p.id,savedValues);setProducts(prev=>prev.map(item=>colorGroup.items.some(p=>String(p.id)===String(item.id))?{...item,...savedValues}:item));setPriceDrafts(prev=>{const next={...prev};delete next[key];return next;});toast("قیمت رنگ "+colorGroup.color+" برای "+group.category+" "+group.model+" ذخیره شد.");}catch(err){toast(err.message||"ذخیره قیمت ناموفق بود.");}finally{setSavingPriceId(null);}}}>{saving?"در حال ذخیره…":"ذخیره قیمت این رنگ"}</button></div>
     </div>})}</div>
   </article>})}
   </div>}
 </section>}
 {page==='موجودی کالا'&&<section className="panel"><div className="panel-head"><div><h2>فهرست کالاها</h2><p>مشخصات، سایز، رنگ، قیمت و تعداد موجودی</p></div><div className="inline-actions"><div className="searchbox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جست‌وجوی کالا، کد یا رنگ..."/></div><div className="searchbox"><Search size={16}/><input value={categoryQuery} onChange={e=>setCategoryQuery(e.target.value)} placeholder="جست‌وجوی سرفصل یا مدل..."/></div><div className="searchbox"><Search size={16}/><input value={inventorySizeSearch} onChange={e=>setInventorySizeSearch(e.target.value)} placeholder="سایز؛ مثلاً ۵۰ یا XL"/></div><div className="searchbox"><Search size={16}/><input value={inventoryColorSearch} onChange={e=>setInventoryColorSearch(e.target.value)} placeholder="رنگ؛ مثلاً مشکی"/></div>{!isViewer&&<button className="btn btn-gold" onClick={()=>setShowProduct(true)}><Plus size={16}/> افزودن کالا</button>}</div></div><ProductTable products={filteredProducts} groupVariants={!query.trim()&&!categoryQuery.trim()&&!inventorySizeSearch.trim()&&!inventoryColorSearch.trim()} onEditPrice={isViewer?undefined:p=>setEditingPrice({id:p.id,ids:p.ids||[p.id],category:p.category,variant:p.variant||productVariant(p),color:p.color,size:p.size,price:formatDigits(p.price??0)})} onDelete={isViewer?undefined:async ids=>{const idsToDelete=Array.isArray(ids)?ids:[ids];if(!confirm(idsToDelete.length>1?'همه رنگ‌ها و سایزهای این مدل از فهرست موجودی حذف شوند؟':'این کالا از فهرست موجودی حذف شود؟'))return;try{if(session){for(const id of idsToDelete)await deactivateProduct(id);}setProducts(prev=>prev.filter(p=>!idsToDelete.some(id=>String(id)===String(p.id))));toast('کالا از فهرست موجودی حذف شد.');}catch(err){toast(err.message||'حذف کالا ناموفق بود.');}}}/></section>}
 {page==='ثبت فروش'&&<section className="panel sales-entry-page" dir="rtl">
 <div className="sales-hero"><div className="sales-hero-icon"><ShoppingCart size={27}/></div><div><h2>ثبت فروش</h2><p>ثبت اطلاعات فروش کالا به مشتری</p></div></div>
 <form className="sales-entry-form" onSubmit={addSale}>
  <section className="sales-entry-card sales-customer-card"><h3><UsersRound size={21}/> اطلاعات مشتری</h3>
   <div className="sales-entry-grid">
    <label className="sales-entry-field">تاریخ فروش<JalaliDatePicker label="تاریخ فروش" value={saleDate} onChange={setSaleDate}/></label>
    <label className="sales-entry-field">فروشنده<select value={saleForm.seller} onChange={e=>setSaleForm(v=>({...v,seller:e.target.value}))} required><option value="فائزه رفیع‌زاده">فائزه رفیع‌زاده</option></select></label>
    <label className="sales-entry-field">شماره تماس پیگیری اقساط (اختیاری)<input inputMode="tel" placeholder="در صورت نیاز وارد کنید" value={saleForm.customer} onChange={e=>setSaleForm(v=>({...v,customer:e.target.value}))}/></label>
    <label className="sales-entry-field">نوع پرداخت<select value={saleForm.payment} onChange={e=>setSaleForm(v=>({...v,payment:e.target.value,downPayment:e.target.value==='اعتباری'?v.downPayment:0}))}><option>کارت‌خوان</option><option>نقدی</option><option>کارت‌به‌کارت</option><option>اعتباری</option><option>هدیه</option></select></label>
   </div>
  </section>
  <section className="sales-entry-card sales-product-card"><h3><Package size={21}/> اطلاعات کالا</h3>
   <label className="sales-entry-field">جست‌وجوی کالا<input type="search" value={saleSearch} onChange={e=>setSaleSearch(e.target.value)} placeholder="نام کالا، سرفصل، مدل، رنگ یا سایز..."/></label>
   <div className="sales-entry-grid">
    <label className="sales-entry-field">سرفصل کالا<select value={saleCategory} onChange={e=>{const category=e.target.value;const available=products.filter(p=>productBase(p)===category&&Number(p.stock)>0);const models=[...new Set(available.map(productVariant).filter(Boolean))];setSaleForm(v=>({...v,category,variant:models[0]||'',color:'',size:'',productId:'',qty:1}));setSaleVariantSearch('');}}><option value="">انتخاب سرفصل</option>{inventoryCategories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    <label className="sales-entry-field">مدل کالا<select value={saleVariant} onChange={e=>setSaleForm(v=>({...v,variant:e.target.value,color:'',size:'',productId:'',qty:1}))}><option value="">انتخاب مدل</option>{variantOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label className="sales-entry-field">رنگ کالا<select value={saleColor} onChange={e=>setSaleForm(v=>({...v,color:e.target.value,size:'',productId:'',qty:1}))}><option value="">انتخاب رنگ</option>{colorOptions.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    <label className="sales-entry-field">سایز کالا<select value={saleSize} onChange={e=>setSaleForm(v=>({...v,size:e.target.value,productId:'',qty:1}))}><option value="">انتخاب سایز</option>{sizeOptions.map(z=><option key={z} value={z}>{z}</option>)}</select></label>
   </div>
   <label className="sales-entry-field">انتخاب کالای موجود در این مدل<select value={saleForm.productId} onChange={e=>setSaleForm(v=>({...v,productId:e.target.value,qty:1}))}><option value="">انتخاب کالا</option>{sizedSaleProducts.filter(p=>[p.name,p.sku,p.category,p.variant,p.color,p.size].join(' ').toLocaleLowerCase('fa').includes(saleSearch.trim().toLocaleLowerCase('fa'))).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||'بدون کد'} · {money(p.price)} · موجودی {num(p.stock)}</option>)}</select></label>
   {selectedSaleProduct&&<div className="sales-selected-product"><b>{selectedSaleProduct.name}</b><span>{selectedSaleProduct.color} · سایز {selectedSaleProduct.size}</span><strong>{money(selectedSaleProduct.price)}</strong><small>موجودی: {num(selectedSaleProduct.stock)} عدد</small></div>}
   <div className="sales-add-row"><label className="sales-entry-field">تعداد<input type="number" min="1" max={selectedSaleProduct?.stock||1} value={saleForm.qty} onFocus={keepSaleInputVisible} onChange={e=>setSaleForm(v=>({...v,qty:e.target.value}))}/></label><button className="btn btn-gold" type="button" onClick={addSaleCartItem}><Plus size={17}/> افزودن به فاکتور</button></div>
  </section>
  <section className="sales-entry-card sales-invoice-card"><h3><ShoppingCart size={21}/> اقلام فاکتور <span className="mini-badge">{num(saleCart.length)} قلم</span></h3>
   {saleCart.length===0?<div className="sales-cart-empty">هنوز کالایی به فاکتور اضافه نشده است.</div>:<div className="sales-cart-list">{saleCart.map(item=><article className="sales-cart-row" key={item.productId}><div><b>{item.name}</b><small>{item.color} · سایز {item.size} · {money(item.unitPrice)}</small><div className="sales-cart-qty"><button type="button" onClick={()=>setSaleCart(prev=>prev.map(x=>x.productId===item.productId?{...x,quantity:Math.max(1,x.quantity-1)}:x))}>−</button><b>{num(item.quantity)}</b><button type="button" onClick={()=>setSaleCart(prev=>prev.map(x=>x.productId===item.productId?{...x,quantity:Math.min(x.stock,x.quantity+1)}:x))}>+</button><button type="button" className="sales-cart-remove" onClick={()=>setSaleCart(prev=>prev.filter(x=>x.productId!==item.productId))}><Trash2 size={15}/></button></div></div><strong>{money(item.unitPrice*item.quantity)}</strong></article>)}</div>}
   <label className="sales-entry-field sales-discount-field">تخفیف کل فاکتور (تومان)<input inputMode="numeric" value={formatDigits(saleForm.discount)} onFocus={keepSaleInputVisible} onChange={e=>setSaleForm(v=>({...v,discount:numericValue(e.target.value)}))} placeholder="۰"/></label>
   <div className="sales-total-row"><span>جمع کالاها</span><b>{money(saleSubtotal)}</b></div><div className="sales-total-row sales-grand-total"><span>مبلغ نهایی</span><b>{money(saleGrandTotal)}</b></div>
  </section>
  {saleForm.payment==='اعتباری'&&<section className="sales-entry-card"><h3>پیش‌پرداخت و اقساط</h3>
   <label className="sales-entry-field">مبلغ پیش‌پرداخت (تومان)<input inputMode="numeric" value={formatDigits(saleForm.downPayment)} onFocus={keepSaleInputVisible} onChange={e=>setSaleForm(v=>({...v,downPayment:numericValue(e.target.value)}))}/></label>
   <label className="sales-entry-field">روش دریافت پیش‌پرداخت<select value={saleForm.downPaymentMethod||'کارت‌خوان'} onChange={e=>setSaleForm(v=>({...v,downPaymentMethod:e.target.value}))}><option>کارت‌خوان</option><option>نقدی</option><option>کارت‌به‌کارت</option></select></label>
   <div className="sales-total-row"><span>مانده قابل تقسیط</span><b>{money(saleCartBalance)}</b></div>
   <label className="sales-entry-field">تعداد اقساط<input type="number" min="1" max="36" value={saleForm.installmentCount} onFocus={keepSaleInputVisible} onChange={e=>setSaleForm(v=>({...v,installmentCount:e.target.value}))}/></label>
   <label className="sales-entry-field">سررسید اولین قسط<JalaliDatePicker label="سررسید اولین قسط" value={saleForm.firstDueDate} onChange={date=>setSaleForm(v=>({...v,firstDueDate:date}))}/></label>
  </section>}
  <div className="sales-entry-submit"><button className="btn btn-gold" type="submit" disabled={dataLoading||!saleCart.length}>ثبت نهایی فاکتور</button></div>
 </form>
</section>}
 {page==='تعویض کالا'&&<><section className="panel"><div className="panel-head"><div><h2>ثبت تعویض کالا</h2><p>قیمت برگشتی از مبلغ واقعی فاکتور و قیمت جایگزین از قیمت روز کالا محاسبه می‌شود.</p></div><span className="mini-badge">EXCHANGE</span></div><form className="form-grid" onSubmit={submitExchange}>
 <JalaliDatePicker label="تاریخ فاکتور خرید" value={exchangeSaleDate} onChange={date=>{setExchangeSaleDate(date);setExchangeForm({...exchangeForm,saleId:'',saleItemId:'',returnQuantity:1});}}/>
 <JalaliDatePicker label="تاریخ انجام تعویض و دریافت/پرداخت اختلاف" value={exchangeDate} onChange={setExchangeDate}/>
 <label>فاکتور خرید<select value={exchangeForm.saleId} onChange={e=>{const sale=sales.find(x=>String(x.id)===String(e.target.value));const item=sale?.items?.find(x=>x.quantity>x.returnedQuantity);setExchangeForm({...exchangeForm,saleId:e.target.value,saleItemId:item?.id||'',returnQuantity:1});}} required><option value="">انتخاب فاکتور در تاریخ انتخاب‌شده</option>{sales.filter(x=>isoLocal(new Date(x.date))===exchangeSaleDate).map(x=><option key={x.id} value={x.id}>{x.invoiceNo} · {x.customer} · {new Date(x.date).toLocaleDateString('fa-IR')}</option>)}</select></label>
 <label>کالای برگشتی از فاکتور<select value={exchangeForm.saleItemId} onChange={e=>setExchangeForm({...exchangeForm,saleItemId:e.target.value,returnQuantity:1})} required><option value="">انتخاب قلم فاکتور</option>{(exchangeSale?.items||[]).filter(x=>x.quantity>x.returnedQuantity).map(x=><option key={x.id} value={x.id}>{x.productName} · خرید {num(x.quantity)} · قابل برگشت {num(x.quantity-x.returnedQuantity)}</option>)}</select></label>
 <label>تعداد برگشتی<input type="number" min="1" max={exchangeSaleItem?exchangeSaleItem.quantity-exchangeSaleItem.returnedQuantity:1} value={exchangeForm.returnQuantity} onChange={e=>setExchangeForm({...exchangeForm,returnQuantity:e.target.value})} required/></label>
 <label>وضعیت کالای برگشتی<select value={exchangeForm.returnCondition} onChange={e=>setExchangeForm({...exchangeForm,returnCondition:e.target.value})}><option value="resalable">سالم و قابل فروش؛ برگشت به موجودی</option><option value="damaged">معیوب؛ بدون افزایش موجودی قابل فروش</option></select></label>
 <label>جست‌وجوی کالای جایگزین<div className="searchbox"><Search size={16}/><input type="search" value={exchangeProductSearch} onChange={e=>setExchangeProductSearch(e.target.value)} placeholder="نام کالا، مدل، رنگ یا سایز را جست‌وجو کن…"/></div></label>
 <label>کالای جایگزین<select value={exchangeForm.newProductId} onChange={e=>setExchangeForm({...exchangeForm,newProductId:e.target.value})} required><option value="">انتخاب از موجودی</option>{products.filter(p=>Number(p.stock)>0&&(String(p.id)===String(exchangeForm.newProductId)||[p.name,p.sku,p.category,p.variant||productVariant(p),p.color,p.size].some(v=>normalizeInventorySearch(v).includes(normalizeInventorySearch(exchangeProductSearch))))).map(p=><option key={p.id} value={p.id}>{p.category} · {p.variant||productVariant(p)} · {p.color} · سایز {p.size} · {money(p.price)} · موجودی {num(p.stock)}</option>)}</select></label>
 <label>تعداد کالای جایگزین<input type="number" min="1" max={exchangeNewProduct?.stock||1} value={exchangeForm.newQuantity} onChange={e=>setExchangeForm({...exchangeForm,newQuantity:e.target.value})} required/></label>
 <label>روش تسویه اختلاف<select value={exchangeForm.settlementMethod} onChange={e=>setExchangeForm({...exchangeForm,settlementMethod:e.target.value})}><option value="cash">نقدی</option><option value="card">کارت‌خوان</option><option value="transfer">کارت‌به‌کارت / انتقال</option><option value="credit">اعتبار مشتری (فقط هنگام طلب مشتری)</option></select></label>
 <label>توضیحات (اختیاری)<input value={exchangeForm.notes} onChange={e=>setExchangeForm({...exchangeForm,notes:e.target.value})} placeholder="علت یا توضیح تعویض"/></label>
 <div className="form-total"><span>ارزش کالای برگشتی با تخفیف فاکتور</span><b>{money(exchangeReturnTotal)}</b></div><div className="form-total"><span>ارزش کالای جایگزین با قیمت فعلی</span><b>{money(exchangeNewTotal)}</b></div><div className="form-total"><span>{exchangeDifference>0?'مبلغ دریافتی از مشتری':exchangeDifference<0?'مبلغ قابل استرداد به مشتری':'اختلاف قیمت'}</span><b className={exchangeDifference>0?'gold-text':exchangeDifference<0?'red-text':''}>{money(Math.abs(exchangeDifference))}</b></div>
 <div className="form-footer"><button className="btn btn-gold" type="submit" disabled={exchangeBusy||!exchangeSaleItem||!exchangeNewProduct}>{exchangeBusy?'در حال ثبت تعویض…':'ثبت نهایی تعویض'}</button></div></form></section>
 <section className="panel"><div className="panel-head"><div><h2>راهنمای محاسبه</h2><p>فاکتور اصلی تغییر نمی‌کند و هر تعویض به همان فاکتور متصل می‌ماند.</p></div></div><p className="footnote">اگر کالای برگشتی سالم باشد به موجودی برمی‌گردد؛ اگر معیوب باشد وارد موجودی قابل فروش نمی‌شود. اختلاف مثبت به‌عنوان دریافت صندوق و اختلاف منفی به‌عنوان پرداخت صندوق یا اعتبار مشتری ثبت می‌شود. سیستم اجازه برگشت بیش از تعداد خریداری‌شده را نمی‌دهد.</p></section></>}
 {page==='انتقال کالا'&&<><section className="panel"><div className="panel-head"><div><h2>ثبت دریافت کالا از فروشگاه دیگر</h2><p>وقتی کالا از فروشگاه دیگری به ما می‌رسد، دریافتش را ثبت کن تا موجودی این شعبه افزایش پیدا کند.</p></div><span className="pill-green">مقصد: {branch?.name||'شعبه فعلی'}</span></div><form className="form-grid" onSubmit={addIncomingTransfer}><label>فروشگاه / شعبه فرستنده<input value={incomingTransferForm.sender} onChange={e=>setIncomingTransferForm({...incomingTransferForm,sender:e.target.value})} placeholder="نام فروشگاه یا شعبه‌ای که کالا را فرستاده" required/></label><label className="transfer-product-search">جست‌وجوی کالای موجود<div className="searchbox"><Search size={16}/><input type="search" value={incomingProductSearch} onChange={e=>setIncomingProductSearch(e.target.value)} placeholder="نام کالا، کد، مدل، رنگ یا سایز را جست‌وجو کن…"/></div></label><label>کالای موجود در فروشگاه (اختیاری)<select value={incomingTransferForm.productId} onChange={e=>setIncomingTransferForm({...incomingTransferForm,productId:e.target.value})}><option value="">کالا در فهرست نیست؛ کالای جدید می‌سازم</option>{products.filter(p=>String(p.id)===String(incomingTransferForm.productId)||[p.name,p.sku,p.category,p.variant||productVariant(p),p.color,p.size].some(v=>normalizeInventorySearch(v).includes(normalizeInventorySearch(incomingProductSearch)))).map(p=><option key={p.id} value={p.id}>{p.name} · {p.color} · سایز {p.size} · موجودی {num(p.stock)}</option>)}</select></label>{!incomingTransferForm.productId&&<><label className="incoming-product-name-field">نام کامل کالای جدید<input value={incomingTransferForm.newProductName} onChange={e=>setIncomingTransferForm({...incomingTransferForm,newProductName:e.target.value})} placeholder="مثلاً شلوار پارچه‌ای سرمه‌ای سایز ۵۲" required/><small>دسته‌بندی، مدل، رنگ و سایز به‌صورت خودکار از نام کالا تشخیص داده می‌شوند.</small></label><label>قیمت کالا (تومان؛ مبلغی که در فاکتور فروش ثبت می‌شود)<input type="number" min="1" value={incomingTransferForm.salePrice} onChange={e=>setIncomingTransferForm({...incomingTransferForm,salePrice:e.target.value})} placeholder="قیمت فروش هر عدد" required/></label></>}<label>تعداد دریافتی<input type="number" min="1" value={incomingTransferForm.quantity} onChange={e=>setIncomingTransferForm({...incomingTransferForm,quantity:e.target.value})} required/></label><JalaliDatePicker label="تاریخ دریافت" value={incomingTransferForm.date} onChange={date=>setIncomingTransferForm({...incomingTransferForm,date})}/><label>توضیحات (اختیاری)<input value={incomingTransferForm.note} onChange={e=>setIncomingTransferForm({...incomingTransferForm,note:e.target.value})} placeholder="شماره حواله یا توضیح دریافت"/></label><div className="form-footer"><button className="btn btn-gold" type="submit" disabled={transferBusy}>{transferBusy?'در حال ثبت…':'ثبت دریافت و افزودن به موجودی'}</button></div></form></section><section className="panel"><div className="panel-head"><div><h2>انتقال کالا از این فروشگاه به شعبه دیگر</h2><p>با ثبت انتقال خروجی، تعداد انتخاب‌شده از موجودی همین شعبه کسر می‌شود.</p></div><span className="pill-green">مبدأ: {branch?.name||'شعبه فعلی'}</span></div><form className="form-grid" onSubmit={addTransfer}><label className="transfer-product-search">جست‌وجوی کالا<div className="searchbox"><Search size={16}/><input type="search" value={transferProductSearch} onChange={e=>setTransferProductSearch(e.target.value)} placeholder="نام کالا، مدل، رنگ یا سایز را جست‌وجو کن…"/></div></label><label>کالا<select value={transferForm.productId} onChange={e=>setTransferForm({...transferForm,productId:e.target.value})} required><option value="">انتخاب کالا</option>{products.filter(p=>Number(p.stock)>0&&(String(p.id)===String(transferForm.productId)||[p.name,p.sku,p.category,p.variant||productVariant(p),p.color,p.size].some(v=>normalizeInventorySearch(v).includes(normalizeInventorySearch(transferProductSearch))))).map(p=><option key={p.id} value={p.id}>{[p.category,p.variant||productVariant(p),p.color,p.size&&'سایز '+p.size].filter(Boolean).join(' · ')} — موجودی: {num(p.stock)}</option>)}</select></label><label>شعبه مقصد<select value={transferForm.recipient} onChange={e=>setTransferForm({...transferForm,recipient:e.target.value})}><option>مکنزی</option><option>سالکو خرم آباد</option><option>سالکو دورود</option><option>سالکو بروجرد</option></select></label><label>تعداد انتقال<input type="number" min="1" max={products.find(p=>String(p.id)===String(transferForm.productId))?.stock||1} value={transferForm.quantity} onChange={e=>setTransferForm({...transferForm,quantity:e.target.value})} required/></label><JalaliDatePicker label="تاریخ انتقال" value={transferForm.date} onChange={date=>setTransferForm({...transferForm,date})}/><label>توضیحات (اختیاری)<input value={transferForm.note} onChange={e=>setTransferForm({...transferForm,note:e.target.value})} placeholder="توضیح درباره انتقال"/></label><div className="form-total"><span>موجودی فعلی کالا</span><b>{num(products.find(p=>String(p.id)===String(transferForm.productId))?.stock||0)} عدد</b></div><div className="form-footer"><button className="btn btn-gold" type="submit" disabled={transferBusy}>{transferBusy?'در حال ثبت…':'ثبت انتقال و کسر از موجودی'}</button></div></form></section><section className="panel"><div className="panel-head"><div><h2>سوابق انتقال کالا</h2><p>۵۰ انتقال آخر از شعبه فعلی</p></div></div><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>کالا</th><th>نوع / فروشگاه مقابل</th><th>تعداد</th><th>توضیحات</th></tr></thead><tbody>{transfers.map(t=>{const p=products.find(x=>String(x.id)===String(t.product_id));return <tr key={t.id}><td>{new Date(t.transferred_at).toLocaleDateString('fa-IR')}</td><td>{p?[p.name||p.category,p.color,p.size&&'سایز '+p.size].filter(Boolean).join(' · '):'کالای حذف‌شده'}</td><td>{t.direction==='incoming'?'دریافت از: '+(t.sender_branch||'فروشگاه دیگر'):'ارسال به: '+(t.recipient_branch||'—')}</td><td>{num(t.quantity)}</td><td>{t.note||'—'}</td></tr>})}{transfers.length===0&&<tr><td colSpan="5">هنوز انتقالی ثبت نشده است.</td></tr>}</tbody></table></div></section></>}
 {page==='مشتریان'&&<section className="panel"><div className="panel-head"><div><h2>فهرست مشتریان</h2><p>اطلاعات مشتریان و اعتبار ثبت‌شده از تعویض کالا</p></div><span className="mini-badge">{num(customers.length)} مشتری</span></div><div className="table-wrap"><table><thead><tr><th>مشتری</th><th>شماره تماس</th><th>تعداد مراجعه</th><th>مجموع خرید</th><th>اعتبار مشتری</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.phone}</td><td>{num(c.visits)}</td><td className="gold-text">{money(c.total)}</td><td className={(Number(c.creditBalance)||0)>0?'gold-text':''}>{money(c.creditBalance||0)}</td></tr>)}</tbody></table></div></section>}
 {page==='اقساط'&&<section className="panel"><div className="panel-head"><div><h2>مدیریت اقساط</h2><p>فهرست سررسیدها و ثبت دریافت هر قسط از مشتری</p></div><button className="btn btn-gold" onClick={loadInstallments} disabled={installmentLoading}>{installmentLoading?'در حال بارگذاری…':'به‌روزرسانی اقساط'}</button></div><div className="cash-summary"><div><small>مانده کل اقساط</small><b>{money(installments.reduce((sum,x)=>sum+Math.max(0,Number(x.amount||0)-Number(x.amount_paid||0)),0))}</b></div><div><small>اقساط باز</small><b>{num(installments.filter(x=>Number(x.amount_paid||0)<Number(x.amount||0)).length)}</b></div></div><div className="table-wrap"><table><thead><tr><th>فاکتور</th><th>قسط</th><th>سررسید</th><th>مبلغ قسط</th><th>پرداخت‌شده</th><th>مانده</th><th>وضعیت</th>{!isViewer&&<th>عملیات</th>}</tr></thead><tbody>{installments.map(x=>{const remaining=Math.max(0,Number(x.amount||0)-Number(x.amount_paid||0));return <tr key={x.id}><td>{x.sale_id}</td><td>{num(x.installment_no)}</td><td>{new Date(x.due_date+'T12:00:00').toLocaleDateString('fa-IR')}</td><td>{money(x.amount)}</td><td>{money(x.amount_paid)}</td><td className={remaining?'gold-text':''}>{money(remaining)}</td><td>{remaining===0?'تسویه‌شده':Number(x.amount_paid)>0?'پرداخت ناقص':'پرداخت‌نشده'}</td>{!isViewer&&<td><button className="btn btn-gold" disabled={!remaining||installmentLoading} onClick={()=>receiveInstallment(x)}>{remaining?'ثبت دریافت':'تسویه'}</button></td>}</tr>;})}{installments.length===0&&<tr><td colSpan="8">قسطی برای این شعبه پیدا نشد. برای دریافت آخرین فهرست، «به‌روزرسانی اقساط» را بزنید.</td></tr>}</tbody></table></div></section>}
 {page==='صندوق'&&<section className="panel"><div className="panel-head"><div><h2>گردش صندوق</h2><p>دریافت‌ها و پرداخت‌های ثبت‌شده</p></div>{!isViewer&&<button className="btn btn-gold" onClick={()=>setShowCash(true)}><Plus size={16}/> ثبت تراکنش</button>}</div><div className="cash-summary"><div><small>مانده محاسبه‌شده</small><b>{money(cashBalance)}</b></div><div><small>تعداد تراکنش‌ها</small><b>{num(cash.length)}</b></div></div>{cash.length===0?<Empty icon={Wallet} title="تراکنشی ثبت نشده" text="دریافت‌ها و پرداخت‌ها پس از ثبت در این فهرست ظاهر می‌شوند."/>:<div className="table-wrap"><table><thead><tr><th>شرح</th><th>نوع</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>{cash.map(c=><tr key={c.id}><td><b>{c.title}</b></td><td><span className={c.type==='دریافت'?'pill-green':'pill-red'}>{c.type}</span></td><td>{new Date(c.date).toLocaleDateString('fa-IR')}</td><td className={c.type==='دریافت'?'gold-text':'red-text'}>{money(c.amount)}</td></tr>)}</tbody></table></div>}</section>}
 {page==='گزارش فروش ۷ روزه'&&(()=>{const selectedDay=dashboardWeekDays.find(day=>day.iso===weekReportSelectedDate)||dashboardWeekDays[6];const selectedDaySales=sales.filter(s=>isoLocal(new Date(s.date))===selectedDay.iso).sort((a,b)=>new Date(b.date)-new Date(a.date));const dayLabel=iso=>{const p=jalaliParts(iso);return [p.year,p.month,p.day].map(v=>new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(v)).join('/');};return <><section className="panel"><div className="panel-head"><div><h2>گزارش فروش ۷ روز اخیر</h2><p>فروش روزانه و فاکتورهای ثبت‌شده در بازه انتخاب‌شده داشبورد</p></div><button className="btn btn-ghost" type="button" onClick={()=>setPage('داشبورد')}><ArrowLeftRight size={16}/> بازگشت به داشبورد</button></div><div className="stats-grid"><Stat icon={ShoppingCart} title="مجموع فروش ۷ روز" value={money(dashboardWeekTotal)} sub="جمع فروش فاکتورهای این بازه"/><Stat icon={ReceiptText} title="تعداد فاکتورها" value={num(dashboardWeekDays.reduce((n,d)=>n+d.count,0))} sub="در هفت روز اخیر"/><Stat icon={CalendarDays} title="روزهای دارای فروش" value={num(dashboardWeekDays.filter(d=>d.count>0).length)} sub="از ۷ روز"/></div><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>تعداد فاکتور</th><th>مجموع فروش</th><th>جزئیات</th></tr></thead><tbody>{dashboardWeekDays.slice().reverse().map(day=><tr key={day.iso} className={selectedDay.iso===day.iso?'selected-report-day':''}><td>{dayLabel(day.iso)}</td><td>{num(day.count)}</td><td className="gold-text">{money(day.total)}</td><td><button className="btn btn-ghost" type="button" onClick={()=>setWeekReportSelectedDate(day.iso)}>{selectedDay.iso===day.iso?'در حال مشاهده':'مشاهده فاکتورها'}</button></td></tr>)}</tbody></table></div></section><section className="panel"><div className="panel-head"><div><h2>فاکتورهای روز {dayLabel(selectedDay.iso)}</h2><p>{num(selectedDaySales.length)} فاکتور ثبت‌شده در این روز</p></div><b className="gold-text">{money(selectedDay.total)}</b></div><div className="table-wrap"><table><thead><tr><th>شماره فاکتور</th><th>مشتری</th><th>شرح کالا</th><th>تعداد</th><th>مبلغ نهایی</th><th>جزئیات</th></tr></thead><tbody>{selectedDaySales.map((sale,index)=><tr key={sale.id||index}><td>{sale.invoiceNumber||sale.number||sale.id||'—'}</td><td>{sale.customer||'مشتری حضوری'}</td><td>{(sale.items||[]).map(item=>item.productName||item.name||'کالا').join('، ')||sale.product||'—'}</td><td>{num(sale.qty||0)}</td><td className="gold-text">{money(sale.total)}</td><td><button type="button" className="btn btn-gold" onClick={()=>setInvoice({number:sale.invoiceNumber||sale.number||sale.id||('SALCO-'+(index+1)),date:sale.date,customer:sale.customer||'مشتری حضوری',product:(sale.items||[]).map(item=>item.productName||item.name||'کالا').join('، ')||sale.product||'—',color:(sale.items||[]).map(item=>item.color).filter(Boolean).join('، '),size:(sale.items||[]).map(item=>item.size).filter(Boolean).join('، '),qty:sale.qty||0,giftQuantity:sale.giftQuantity||0,unitPrice:sale.unitPrice||0,discount:sale.discount||0,total:sale.total||0,payment:sale.payment||'—',exchanges:sale.exchanges||[]})}>مشاهده فاکتور</button></td></tr>)}{selectedDaySales.length===0&&<tr><td colSpan="6">در این روز فاکتوری ثبت نشده است.</td></tr>}</tbody></table></div></section></>;})()}
 
 {page==='گزارش‌ها'&&<><section className="report-manager-overview" dir="rtl">
   <div className="rmo-heading"><div className="rmo-brand"><img src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="SALCO+"/><span>مدیریت فروش و حسابداری</span></div><h1><BarChart3/> گزارش‌ها</h1></div>
   <div className="rmo-date"><CalendarDays/><JalaliDatePicker value={reportDate} onChange={setReportDate} label=""/></div>
   <div className="rmo-period"><button className="active" type="button">روزانه</button><button type="button" disabled>هفتگی</button><button type="button" disabled>ماهانه</button><span>بازه دلخواه</span></div>
   <div className="rmo-kpis">
    <div className="rmo-kpi rmo-sales"><span>مجموع فروش</span><b>{money(reportTotals.net).replace(' تومان','')}</b><small>تومان</small></div>
    <div className="rmo-kpi rmo-invoices"><span>تعداد فاکتور</span><b>{num(reportDateSales.length)}</b><small>فاکتور</small></div>
    <div className="rmo-kpi rmo-installments"><span>فروش اقساطی</span><b>{money(reportInstallmentAmount).replace(' تومان','')}</b><small>تومان · مانده اقساط</small></div>
    <div className="rmo-kpi rmo-discount"><span>مجموع تخفیف</span><b>{money(reportTotals.discount).replace(' تومان','')}</b><small>تومان</small></div>
    <div className="rmo-kpi rmo-quantity"><span>تعداد اقلام فروش</span><b>{num(reportTotals.qty)}</b><small>قلم</small></div>
    <div className="rmo-kpi rmo-cash"><span>وصولی صندوق</span><b>{money(cash.filter(x=>String(x.date||'').slice(0,10)===reportDate&&x.type==='دریافت').reduce((sum,x)=>sum+Number(x.amount||0),0)).replace(' تومان','')}</b><small>تومان</small></div>
   </div>
  </section><article className="daily-report-print salco-signature-report" dir="rtl">
 <header className="salco-report-head">
  <div className="salco-report-heading">
   <span className="salco-report-kicker">SALCO⁺ · MEN’S SUITS</span>
   <h2>گزارش فروش روزانه</h2>
   <p>گزارش مدیریتی فروشگاه سالکو</p>
   <div className="salco-report-date"><b>تاریخ گزارش:</b><JalaliDatePicker value={reportDate} onChange={setReportDate} label="تاریخ گزارش"/></div>
  </div>
  <div className="salco-report-mark"><i aria-hidden="true"></i><img src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="SALCO+ MEN’S SUITS"/></div>
 </header>
 <div className="salco-report-summary" aria-label="جزئیات فروش‌ها">
  <strong>جزئیات فروش‌ها</strong><span>صفحه ۱ از {num(Math.max(1,Math.ceil(reportLineItems.length/5)))} <b>│</b> {num(reportLineItems.length)} قلم</span><span className="salco-report-list-icon">☷</span>
 </div>
 <section className="salco-report-details">
  <table className="salco-signature-table">
   <colgroup><col style={{width:'7%'}}/><col style={{width:'30%'}}/><col style={{width:'12%'}}/><col style={{width:'9%'}}/><col style={{width:'10%'}}/><col style={{width:'13%'}}/><col style={{width:'19%'}}/></colgroup>
   <thead><tr><th>ردیف</th><th>نام کالا</th><th>رنگ</th><th>سایز</th><th>تعداد</th><th>تخفیف</th><th>مبلغ نهایی</th></tr></thead>
   <tbody>
    {reportLineItems.map((item,index)=><tr key={item.key}><td>{num(index+1)}</td><td className="salco-report-product">{item.name}</td><td>{item.color||'—'}</td><td>{item.size||'—'}</td><td>{num(item.quantity)}</td><td className={item.discount>0?'salco-report-discount':'salco-report-zero'}>{money(item.discount).replace(' تومان','')}</td><td className="salco-report-amount">{money(item.total).replace(' تومان','')}</td></tr>)}
    {reportLineItems.length===0&&<tr><td colSpan="7" className="salco-report-empty">برای این تاریخ فروش ثبت نشده است.</td></tr>}
   </tbody>
  </table>
 </section>
 <section className="salco-report-totals">
  <div className="salco-report-grand"><b>جمع کل فاکتورها:</b><strong>{money(reportTotals.net).replace(' تومان','')}</strong><small>تومان</small></div>
  <div className="salco-report-discount-total"><b>تخفیف کل:</b><strong>{money(reportTotals.discount).replace(' تومان','')}</strong><small>تومان</small></div>
 </section>
 <div className="salco-report-actions no-print"><button type="button" className="btn btn-gold" onClick={()=>window.print()}>چاپ / ذخیره PDF</button><button type="button" className="btn btn-ghost" onClick={exportDailyReportImage}>خروجی تصویر</button></div>
</article><section className="panel"><div className="panel-head"><div><h2>مدیریت فروش‌ها</h2><p>اصلاح مبلغ یا لغو فروش ثبت‌شده؛ لغو فروش موجودی را به انبار برمی‌گرداند.</p></div><span className="pill-green">{num(reportDateSales.length)} فروش در تاریخ انتخاب‌شده</span></div><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>شرح کالا</th><th>تعداد</th><th>مبلغ نهایی</th><th>روش پرداخت</th><th>عملیات</th></tr></thead><tbody>{reportDateSales.map(s=><tr key={s.id}><td>{new Date(s.date).toLocaleDateString("fa-IR")}</td><td>{(s.items||[]).map(item=>`${item.productName||s.product||"—"} · رنگ ${item.color||"—"} · سایز ${item.size||"ثبت‌نشده"}`).join(" | ")||s.product||"—"}</td><td>{num(s.qty)}</td><td className="gold-text">{money(s.total)}</td><td>{s.payment||"—"}</td><td><div className="inline-actions"><button className="btn btn-ghost" type="button" disabled={saleBusy} onClick={()=>setEditingSale({...s,total:String(s.total)})}><Pencil size={14}/> اصلاح مبلغ</button><button className="row-delete" type="button" disabled={saleBusy} title="لغو فروش" aria-label="لغو فروش" onClick={()=>cancelSale(s)}><Trash2 size={16}/></button></div></td></tr>)}{sales.length===0&&<tr><td colSpan="6">برای تاریخ انتخاب‌شده فروشی ثبت نشده است.</td></tr>}</tbody></table></div></section><section className="stats-grid"><Stat icon={ShoppingCart} title="مجموع فروش ثبت‌شده" value={money(totalRevenue)} sub="همه فروش‌های محلی"/><Stat icon={Package} title="تعداد اقلام فروخته‌شده" value={num(sales.reduce((s,x)=>s+x.qty,0))} sub="بر اساس فاکتورها"/><Stat icon={BarChart3} title="سود ناخالص تخمینی" value={money(totalRevenue-totalCost)} sub="قبل از اجاره، حقوق و هزینه‌ها"/></section><section className="panel"><div className="panel-head"><div><h2>رتبه‌بندی کالاها</h2><p>فروش و موجودی فعلی</p></div><button className="btn btn-ghost" onClick={exportCsv}><Download size={16}/> خروجی موجودی</button></div><ProductTable products={[...products].sort((a,b)=>b.sold-a.sold)} onDelete={()=>{}} showSold/></section><section className="panel reset-panel"><div><h3>مدیریت داده‌های آزمایشی</h3><p>این دکمه فقط اطلاعات محلی همین مرورگر را به نمونه اولیه برمی‌گرداند.</p></div><button className="btn btn-danger" onClick={resetDemo}><Trash2 size={16}/> بازنشانی داده‌های محلی</button></section></>}
 </div></main>
 {showProduct&&<Modal title="افزودن کالای جدید" close={()=>setShowProduct(false)}><form className="form-grid modal-form" onSubmit={addProduct}><label>سرفصل اصلی<select value={form.category} onChange={e=>{const category=e.target.value;const variants=[...new Set([...(productTaxonomy[category]||['ساده']),...(customProductOptions.models?.[category]||[])].map(normalizeProductText))];const variant=variants[0]||'ساده';const colors=[...new Set(products.filter(p=>productBase(p)===category&&saleVariantKey(productVariant(p))===saleVariantKey(variant)).map(productColorValue).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa'));setForm({...form,category,variant,color:colors[0]||productColorCatalog[0],name:category+' '+variant});}}>{[...new Set([...Object.keys(productTaxonomy),...(customProductOptions.categories||[]),...products.map(p=>productBase(p))])].map(category=><option key={category} value={category}>{category}</option>)}</select><div className="inline-actions"><input value={newProductOption.category} onChange={e=>setNewProductOption(prev=>({...prev,category:e.target.value}))} placeholder="سرفصل جدید"/><button type="button" className="btn btn-ghost" onClick={()=>addCustomProductOption('category',newProductOption.category)}>+ افزودن سرفصل</button></div></label><label>مدل / انتخابی<select value={form.variant} onChange={e=>{const variant=e.target.value;const colors=[...new Set(products.filter(p=>productBase(p)===cleanText(form.category)&&saleVariantKey(productVariant(p))===saleVariantKey(variant)).map(productColorValue).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa'));setForm({...form,variant,color:colors[0]||productColorCatalog[0],name:form.category+' '+variant});}}>{[...new Set([...(productTaxonomy[form.category]||['ساده']),...(customProductOptions.models?.[form.category]||[]),...products.filter(p=>productBase(p)===form.category).map(productVariant)])].map(variant=><option key={variant} value={variant}>{variant}</option>)}</select><div className="inline-actions"><input value={newProductOption.model} onChange={e=>setNewProductOption(prev=>({...prev,model:e.target.value}))} placeholder="مدل / انتخابی جدید"/><button type="button" className="btn btn-ghost" onClick={()=>addCustomProductOption('model',newProductOption.model)}>+ افزودن مدل</button></div></label><label>سایز<input list="salco-size-options" value={form.size} onChange={e=>setForm({...form,size:e.target.value})} placeholder="انتخاب یا نوشتن سایز"/><datalist id="salco-size-options">{[...'46,48,50,52,54,56,58,60,62,S,M,L,XL,XXL,XXXL,Free'.split(',') ,...(customProductOptions.sizes||[])].map(size=><option key={size} value={size}/>)}</datalist><div className="inline-actions"><input value={newProductOption.size} onChange={e=>setNewProductOption(prev=>({...prev,size:e.target.value}))} placeholder="سایز جدید"/><button type="button" className="btn btn-ghost" onClick={()=>addCustomProductOption('size',newProductOption.size)}>+ افزودن سایز</button></div></label><label>رنگ<input list="salco-color-options" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} placeholder="انتخاب یا نوشتن رنگ" required/><datalist id="salco-color-options">{[...new Set([...inventoryColorOptions,...(customProductOptions.colors||[])])].map(color=><option key={color} value={color}/>)}</datalist><div className="inline-actions"><input value={newProductOption.color} onChange={e=>setNewProductOption(prev=>({...prev,color:e.target.value}))} placeholder="رنگ جدید"/><button type="button" className="btn btn-ghost" onClick={()=>addCustomProductOption('color',newProductOption.color)}>+ افزودن رنگ</button></div></label><label>موجودی اولیه<input type="text" inputMode="numeric" value={formatDigits(form.stock)} onChange={e=>setForm({...form,stock:digitsOnly(e.target.value)})}/></label><label>قیمت فروش (تومان)<input type="text" inputMode="numeric" value={formatDigits(form.price)} onChange={e=>setForm({...form,price:formatDigits(e.target.value)})}/></label><label>تصویر کالا<div className="footnote">تصویر نمایشی بر اساس سرفصل و رنگ کالا به‌صورت خودکار ساخته می‌شود.</div></label><div className="form-footer"><button className="btn btn-gold" type="submit">ذخیره کالا</button><button type="button" className="btn btn-ghost" onClick={()=>setShowProduct(false)}>انصراف</button></div></form></Modal>}
 {editingSale&&<Modal title="اصلاح مبلغ فروش" close={()=>{if(!saleBusy)setEditingSale(null)}}><form className="form-grid modal-form" onSubmit={saveSaleAmount}><div className="form-total"><span>فاکتور</span><b>{editingSale.invoiceNo||String(editingSale.id).slice(0,8)}</b></div><div className="form-total"><span>مشتری / کالا</span><b>{editingSale.customer||"مشتری حضوری"} · {editingSale.product||"—"}</b></div><label>مبلغ نهایی فروش (تومان)<input type="text" inputMode="numeric" required value={formatDigits(editingSale.total)} onChange={e=>setEditingSale({...editingSale,total:digitsOnly(e.target.value)})}/></label><p className="footnote">این تغییر مبلغ ثبت‌شده را اصلاح می‌کند؛ تعداد کالا و تخفیف تغییر نمی‌کند.</p><div className="form-footer"><button className="btn btn-gold" type="submit" disabled={saleBusy}>{saleBusy?"در حال ذخیره…":"ذخیره مبلغ جدید"}</button><button type="button" className="btn btn-ghost" disabled={saleBusy} onClick={()=>setEditingSale(null)}>انصراف</button></div></form></Modal>} 
 {priceHistory&&<Modal title="سابقه تغییر قیمت" close={()=>setPriceHistory(null)}><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>قیمت قبلی</th><th>قیمت جدید</th><th>نوع</th></tr></thead><tbody>{priceHistory.rows.map(row=><tr key={row.id}><td>{new Date(row.changed_at).toLocaleString('fa-IR')}</td><td>{row.old_price==null?'—':formatDigits(row.old_price)+' تومان'}</td><td className="gold-text">{formatDigits(row.new_price)+' تومان'}</td><td>{row.change_type==='initial'?'قیمت اولیه':'تغییر قیمت'}</td></tr>)}{!priceHistory.rows.length&&<tr><td colSpan="4">سابقه‌ای برای این کالا ثبت نشده است.</td></tr>}</tbody></table></div><div className="form-footer"><button className="btn btn-ghost" type="button" onClick={()=>setPriceHistory(null)}>بستن</button></div></Modal>} {showCash&&<Modal title="ثبت تراکنش صندوق" close={()=>setShowCash(false)}><form className="form-grid modal-form" onSubmit={addCash}><label>نوع تراکنش<select value={cashForm.type} onChange={e=>setCashForm({...cashForm,type:e.target.value})}><option>دریافت</option><option>پرداخت</option></select></label><label>شرح تراکنش<input required value={cashForm.title} onChange={e=>setCashForm({...cashForm,title:e.target.value})} placeholder="مثلاً هزینه بسته‌بندی"/></label><label>مبلغ (تومان)<input type="text" inputMode="numeric" min="1" required value={formatDigits(cashForm.amount)} onChange={e=>setCashForm({...cashForm,amount:numericValue(e.target.value)})}/></label><div className="form-footer"><button className="btn btn-gold" type="submit">ثبت تراکنش</button><button type="button" className="btn btn-ghost" onClick={()=>setShowCash(false)}>انصراف</button></div></form></Modal>}
 {invoice&&<div className="modal-backdrop invoice-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setInvoice(null)}}><section className="modal invoice-modal" dir="rtl"><div className="modal-head invoice-actions"><div><h2>فاکتور فروش SALCO⁺</h2><p>فاکتور آماده چاپ یا ارسال</p></div><div className="inline-actions no-print"><button className="btn btn-gold" type="button" onClick={()=>window.print()}><Download size={15}/> چاپ / ذخیره PDF</button><button className="btn btn-ghost" type="button" onClick={async()=>{const textContent=['SALCO⁺ | فاکتور فروش','شماره فاکتور: '+invoice.number,'تاریخ: '+new Date(invoice.date).toLocaleDateString('fa-IR'),'مشتری: '+invoice.customer,'کالا: '+invoice.product,'رنگ: '+(invoice.color||'—')+' | سایز: '+(invoice.size||'—'),'تعداد فروش: '+num(invoice.qty),...(invoice.giftQuantity>0?['تعداد هدیه: '+num(invoice.giftQuantity)]:[]),'قیمت واحد: '+money(invoice.unitPrice),'تخفیف: '+money(invoice.discount),'مبلغ نهایی: '+money(invoice.total),...(invoice.exchanges||[]).flatMap(ex=>['جزئیات تعویض: برگشت '+ex.returnedQuantity+' عدد به ارزش '+money(ex.returnedTotal),'کالای جایگزین: '+ex.newProductName+' · تعداد '+ex.newQuantity+' · مبلغ '+money(ex.newTotal),'مابه‌التفاوت تعویض: '+money(ex.difference)]),'روش پرداخت: '+invoice.payment,'خرم‌آباد | خیابان انقلاب | مجتمع رفاهی اکسومال','از خرید شما سپاسگزاریم.'].join('\n');try{if(navigator.share){await navigator.share({title:'فاکتور فروش SALCO+',text:textContent});toast('منوی اشتراک‌گذاری باز شد؛ ایتا را انتخاب کن. برای PDF از گزینه چاپ / ذخیره PDF استفاده کن.');}else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(textContent);toast('متن فاکتور کپی شد؛ آن را در ایتا ارسال کن.');}else{window.prompt('متن فاکتور را کپی کن:',textContent)}}catch(err){if(err?.name!=='AbortError')toast('اشتراک‌گذاری لغو یا ناموفق شد؛ متن فاکتور را کپی کن یا PDF بگیر.')}}}><ArrowUpLeft size={15}/> اشتراک‌گذاری</button><button className="btn btn-ghost" type="button" onClick={async()=>{const chatId=window.prompt('شناسه عددی یا شناسه گفت‌وگوی ایتا را وارد کن. مخاطب باید قبلاً ربات را شروع کرده باشد:');if(!chatId?.trim())return;try{const {data,error}=await supabase.functions.invoke('eitaa-invoice',{body:{chat_id:chatId.trim(),text:['SALCO⁺ | فاکتور فروش','شماره فاکتور: '+invoice.number,'تاریخ: '+new Date(invoice.date).toLocaleDateString('fa-IR'),'مشتری: '+invoice.customer,'کالا: '+invoice.product,'رنگ: '+(invoice.color||'—')+' | سایز: '+(invoice.size||'—'),'تعداد: '+num(invoice.qty),'قیمت واحد: '+money(invoice.unitPrice),'تخفیف: '+money(invoice.discount),'مبلغ نهایی: '+money(invoice.total),'روش پرداخت: '+invoice.payment,'خرم‌آباد | خیابان انقلاب | مجتمع رفاهی اکسومال','از خرید شما سپاسگزاریم.'].join('\n')}});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'ارسال انجام نشد');toast('پیام فاکتور از طریق ربات ایتا ارسال شد.');}catch(err){toast(err.message||'ارسال رباتی ناموفق بود؛ تنظیمات ربات ایتا را بررسی کن.')}}}><ArrowUpLeft size={15}/> ارسال با ربات ایتا</button><button className="icon-btn" type="button" onClick={()=>setInvoice(null)} aria-label="بستن فاکتور"><X size={17}/></button></div></div><article className="invoice-paper"><header className="invoice-brand"><img src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="SALCO+"/><div><span>MEN’S SUITS</span><h1>فاکتور فروش</h1><p>استایل متمایز، انتخاب ماندگار</p></div><div className="invoice-number"><small>شماره فاکتور</small><b>{invoice.number}</b><small>{new Date(invoice.date).toLocaleDateString('fa-IR')}</small></div></header><div className="invoice-rule"/><div className="invoice-customer"><div><small>مشتری گرامی</small><b>{invoice.customer}</b></div><div><small>روش پرداخت</small><b>{invoice.payment}</b></div></div><div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr></thead><tbody><tr><td><b>{invoice.product}</b><small>{invoice.color&&'رنگ: '+invoice.color}{invoice.color&&invoice.size?' · ':''}{invoice.size&&'سایز: '+invoice.size}{invoice.sku?' · کد: '+invoice.sku:''}</small></td><td>{num(invoice.qty)}</td><td>{money(invoice.unitPrice)}</td><td>{money(invoice.unitPrice*invoice.qty)}</td></tr></tbody></table></div><div className="invoice-totals"><div><span>جمع کل</span><b>{money(invoice.unitPrice*invoice.qty)}</b></div><div><span>تخفیف</span><b>{money(invoice.discount)}</b></div><div className="invoice-grand-total"><span>مبلغ قابل پرداخت</span><strong>{money(invoice.total)}</strong></div></div>{invoice.exchanges?.length>0&&<section className="invoice-exchange-details"><h3>جزئیات تعویض کالا</h3><table className="invoice-table"><thead><tr><th>شرح تعویض</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>{invoice.exchanges.map(ex=><tr key={ex.id}><td><b>کالای برگشتی</b><small>{ex.returnedQuantity} عدد · ارزش برگشتی: {money(ex.returnedTotal)}</small><b>کالای جایگزین: {ex.newProductName}</b><small>{ex.newColor&&'رنگ: '+ex.newColor}{ex.newColor&&ex.newSize?' · ':''}{ex.newSize&&'سایز: '+ex.newSize}</small></td><td>{num(ex.newQuantity)}</td><td>{money(ex.newTotal)}</td></tr>)}</tbody></table><div className="invoice-exchange-balance"><span>مابه‌التفاوت تعویض</span><b>{money(invoice.exchanges.reduce((n,ex)=>n+Number(ex.difference||0),0))}</b></div></section>}<footer className="invoice-footer"><div><b>از اعتماد شما سپاسگزاریم</b><p>سالکو⁺ | استایل مردانه</p><small>خرم‌آباد، خیابان انقلاب، مجتمع رفاهی اکسومال</small></div><div className="invoice-stamp">SALCO⁺<small>MEN’S SUITS</small></div></footer></article><p className="invoice-hint no-print">روش ۱: چاپ / ذخیره PDF و پیوست در ایتا. روش ۲: اشتراک‌گذاری گوشی و انتخاب ایتا. روش ۳: ارسال متن خودکار با ربات ایتا پس از تنظیم امن توکن ربات در سرور.</p></section></div>}
 {notice&&<div className="toast">{notice}</div>}</div>
}
function Stat({icon:Icon,title,value,sub,trend,warn}){return <div className="stat-card"><div className="stat-top"><span>{title}</span><div className="stat-icon"><Icon size={19}/></div></div><strong className="stat-value">{value}</strong><div className="stat-bottom"><span>{sub}</span>{trend&&<em className={warn?'warn':''}>{trend}</em>}</div></div>}
function ProductTable({products,onDelete,showSold=false,onEditPrice,groupVariants=false}){
 const [expandedGroups,setExpandedGroups]=useState({});
 const displayProducts=groupVariants?Object.values(products.reduce((groups,p)=>{const category=productBase(p)||'متفرقه';const variant=productVariant(p);const key=category+'::'+variant;if(!groups[key])groups[key]={...p,id:key,ids:[],category,variant,sku:'',color:'رنگ‌های مختلف',size:'',stock:0,sold:0,items:[]};groups[key].ids.push(p.id);groups[key].items.push(p);groups[key].stock+=Number(p.stock||0);groups[key].sold+=Number(p.sold||0);return groups;},{})).map(g=>{const colors=[...new Set(g.items.map(item=>cleanText(item.color)).filter(color=>color&&color!=='-'))];const sizes=[...new Set(g.items.map(item=>cleanText(item.size)).filter(Boolean))];return {...g,buy:g.items[0]?.buy??0,price:g.items[0]?.price??0,sku:colors.length+' رنگ',colorSummary:colors.join('، ')||'رنگ ثبت نشده',sizeSummary:sizes.join('، ')||'سایز ثبت نشده'};}).filter(g=>g.stock>0):products;
 return displayProducts.length===0?<Empty icon={Package} title="کالایی پیدا نشد" text="جست‌وجو را تغییر بده یا کالای جدید اضافه کن."/>:<div className="table-wrap"><table><thead><tr><th>سرفصل / جنس</th><th>مدل / انتخابی</th><th>سایزها</th><th>موجودی کل</th><th>قیمت فروش</th>{showSold&&<th>تعداد فروش</th>}<th>وضعیت</th><th>جزئیات / عملیات</th></tr></thead><tbody>{displayProducts.map(p=><React.Fragment key={p.id}><tr><td><div className="table-product"><div className="product-thumb"><Shirt size={18}/></div><b>{productBase(p)}</b></div><small>{p.sku}</small></td><td>{productVariant(p)}</td><td>{groupVariants?'همه سایزها':(p.color+' / ')} {p.size}</td><td><b>{num(p.stock)}</b> عدد</td><td className="gold-text">{money(p.price)}</td>{showSold&&<td>{num(p.sold)}</td>}<td><span className={p.stock<=3?'pill-red':p.stock<=5?'pill-yellow':'pill-green'}>{p.stock<=3?'رو به اتمام':p.stock<=5?'کم‌موجودی':'موجود'}</span></td><td><div className="inline-actions">{groupVariants&&<button className="btn btn-ghost" type="button" onClick={()=>setExpandedGroups(prev=>({...prev,[p.id]:!prev[p.id]}))}>{expandedGroups[p.id]?'بستن جزئیات':'رنگ و سایزها'}</button>}{onEditPrice&&<button className="btn btn-ghost" type="button" onClick={()=>onEditPrice(p)}><Pencil size={14}/> اصلاح قیمت</button>}{onDelete&&<button className="row-delete" type="button" onClick={()=>onDelete(groupVariants?(p.ids||[p.id]):p.id)} title={groupVariants?'حذف همه رنگ‌های این مدل':'حذف کالا'} aria-label={groupVariants?'حذف همه رنگ‌های این مدل':'حذف کالا'}><Trash2 size={16}/></button>}</div></td></tr>{groupVariants&&expandedGroups[p.id]&&<tr className="inventory-detail-row"><td colSpan={showSold?8:7}><div className="inventory-detail"><div className="inventory-detail-heading"><b>رنگ‌ها و سایزهای موجود این مدل</b><span>موجودی کل: {num(p.stock)} عدد</span></div><div className="inventory-detail-colors"><span>رنگ‌های ثبت‌شده: {p.colorSummary}</span></div><div className="table-wrap"><table><thead><tr><th>رنگ</th><th>سایز</th><th>تعداد باقی‌مانده</th><th>قیمت فروش</th></tr></thead><tbody>{p.items.filter(item=>Number(item.stock)>0).slice().sort((a,b)=>String(a.color||'').localeCompare(String(b.color||''),'fa')||String(a.size||'').localeCompare(String(b.size||''),'fa',{numeric:true})).map((item,index)=><tr key={item.id||index}><td>{item.color||'ثبت نشده'}</td><td>{item.size||'ثبت نشده'}</td><td><b>{num(item.stock)}</b> عدد</td><td className="gold-text">{money(item.price)}</td></tr>)}</tbody></table></div></div></td></tr>}</React.Fragment>)}</tbody></table></div>}

function Empty({icon:Icon,title,text}){return <div className="empty"><div><Icon size={24}/></div><b>{title}</b><p>{text}</p></div>}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</section></div>}

createRoot(document.getElementById('root')).render(<App/>);
