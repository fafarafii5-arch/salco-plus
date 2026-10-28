// SALCO+ inventory taxonomy and sales selectors
import React, { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getCurrentBranch, listProducts, createProduct, updateProductPrices, listCustomers, createCustomer, listSales, listCashTransactions, createCashTransaction, deactivateProduct } from './lib/salcoData';
import { createRoot } from 'react-dom/client';
import { LayoutDashboard, ShoppingCart, Package, Users, Wallet, BarChart3, Search, Plus, Bell, Shirt, ArrowUpLeft, ArrowDownRight, Menu, X, Trash2, Download, Database, ShieldCheck, Pencil, Tags } from 'lucide-react';
import './styles.css';

const productTaxonomy = {
 'کت': ['ساده','دبل‌برست','چهارخونه'],
 'کت‌وشلوار': ['ساده','کلاسیک','دامادی','یقه آرشال','ژیله‌دار','دبل‌برست','دبل‌برست دیپلمات','دبل‌فیس','دبل‌فیس دیپلمات','دبل‌فیس لیزری','جلیقه دبل‌فیس'],
 'کت تک': ['ساده','چهارخونه','دبل‌برست','آرشال'],
 'شلوار': ['ساده','پارچه‌ای','کتان هنسل','کتان کمربنددار درایور','پارچه‌ای دیپلمات نیم‌بگ (کمر انگلیسی، مک‌کنزی)','پارچه‌ای دیپلمات بگ (کمر انگلیسی، مک‌کنزی)','پارچه‌ای لینن (کمر انگلیسی، مک‌کنزی)','جین بگ (Black Denim)','جین راسته (Alexander McQueen)'],
 'شلوار کتان': ['ساده','هنسل','کمربنددار درایور'],
 'شلوار پارچه‌ای': ['ساده','دیپلمات نیم‌بگ (کمر انگلیسی، مک‌کنزی)','دیپلمات بگ (کمر انگلیسی، مک‌کنزی)','لینن (کمر انگلیسی، مک‌کنزی)'],
 'شلوار جین': ['ساده','بگ (Black Denim)','راسته (Alexander McQueen)'],
 'پیراهن': ['ساده','VIP'],
 'کفش': ['ساده','مجلسی بنددار','اسپرت','ونس','کالج','نیم‌بوت'],
 'کیف': ['ساده','دستی کوچک'],
 'ست کمربند و کیف': ['ساده'],
 'کراوات و پاپیون': ['ساده','کراوات','پاپیون'],
 'اکسسوری': ['ساده','ست گیره کراوات و دکمه سردست','دکمه سردست تکی'],
 'ست گیره کراوات و دکمه سردست': ['ساده'],
 'دکمه سردست': ['ساده','تکی'],
 'کمربند': ['ساده','VIP','پلاکی','پلاکی با سگک'],
 'بارانی': ['ساده','بلند','کوتاه'],
 'کاپشن': ['ساده','بهاره یقه‌ایستاده','چهار جیب','طرح‌دار','کلاه‌دار'],
 'سلانیک': ['ساده','یقه‌گرد','یقه ۷','۳ دکمه یقه‌دار'],
 'پولوشرت': ['ساده','یقه‌گرد','یقه ۷','۳ دکمه یقه‌دار'],
 'سویشرت': ['ساده','تمام زیپ فوتر'],
 'تیشرت': ['ساده','یقه‌گرد']
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
const num = n => new Intl.NumberFormat('fa-IR').format(n||0);\nconst digitsOnly = value => String(value ?? '').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g,'');
const formatDigits = value => { const digits=digitsOnly(value); return digits ? Number(digits).toLocaleString('en-US') : ''; };
const numericValue = value => Number(digitsOnly(value) || 0);

function load(key, fallback){try {const v=localStorage.getItem('salco_'+key);return v?JSON.parse(v):fallback}catch{return fallback}}
function cleanText(value){return String(value||'').trim().replace(/\s+/g,' ');}
function productBase(p){return cleanText(p.category||'متفرقه');}
function productVariant(p){
 if(cleanText(p.variant)) return cleanText(p.variant);
 let n=cleanText(p.name);
 const c=cleanText(p.category);
 const color=cleanText(p.color);
 if(c && n.toLowerCase().startsWith(c.toLowerCase())) n=cleanText(n.slice(c.length));
 if(color && color!=='-' && color!=='سایر' && n.toLowerCase().endsWith(color.toLowerCase())) n=cleanText(n.slice(0,n.length-color.length));
 n=n.replace(/^(کت\s*شلوار|کت‌وشلوار)\s*/,'');
 return n||'ساده';
}
function App(){
 const [page,setPage]=useState('داشبورد'); const [mobileOpen,setMobileOpen]=useState(false);
 const [products,setProducts]=useState([]); const [sales,setSales]=useState([]); const [customers,setCustomers]=useState([]); const [cash,setCash]=useState([]);
 const [session,setSession]=useState(null); const [authLoading,setAuthLoading]=useState(true); const [authBusy,setAuthBusy]=useState(false); const [authEmail,setAuthEmail]=useState(''); const [authPassword,setAuthPassword]=useState(''); const [branch,setBranch]=useState(null); const [dataLoading,setDataLoading]=useState(false);
 const [query,setQuery]=useState(''); const [categoryQuery,setCategoryQuery]=useState(''); const [saleCategorySearch,setSaleCategorySearch]=useState(''); const [saleVariantSearch,setSaleVariantSearch]=useState(''); const [notice,setNotice]=useState('');
 const [showProduct,setShowProduct]=useState(false); const [editingPrice,setEditingPrice]=useState(null); const [priceBusy,setPriceBusy]=useState(false); const [priceDrafts,setPriceDrafts]=useState({}); const [priceSearch,setPriceSearch]=useState(''); const [priceOnlyUnpriced,setPriceOnlyUnpriced]=useState(false); const [savingPriceId,setSavingPriceId]=useState(null); const [showSale,setShowSale]=useState(false); const [showCash,setShowCash]=useState(false);
 const [form,setForm]=useState({name:'',sku:'',category:'کت‌وشلوار',variant:'ساده',size:'50',color:'مشکی',stock:'1',price:''});
 const [saleForm,setSaleForm]=useState({productId:'',category:'',variant:'',color:'',qty:1,customer:'',discount:0,payment:'کارت‌خوان'});
 const [cashForm,setCashForm]=useState({type:'دریافت',title:'',amount:0});
 const persist=(key,val,setter)=>{setter(val);};
 const loadRemote = async (activeSession) => {
   if (!activeSession || !supabase) return;
   setDataLoading(true);
   try {
     const b = await getCurrentBranch(); setBranch(b);
     const [p,c,ss,cc] = await Promise.all([listProducts(b.id),listCustomers(b.id),listSales(b.id),listCashTransactions(b.id)]);
     setProducts(p); setCustomers(c); setSales(ss); setCash(cc);
   } catch (err) { toast(err.message || 'خواندن اطلاعات از پایگاه داده ناموفق بود.'); }
   finally { setDataLoading(false); }
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
     setAuthLoading(false);
     if (data.session) loadRemote(data.session);
   });
   const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,nextSession) => {
     activeSession = nextSession;
     setSession(nextSession);
     if (nextSession) loadRemote(nextSession);
     else { setBranch(null); setProducts([]); setCustomers([]); setSales([]); setCash([]); }
   });
   window.addEventListener('focus', refreshOnReturn);
   document.addEventListener('visibilitychange', refreshOnReturn);
   window.addEventListener('online', refreshOnReturn);
   return () => {
     alive = false;
     subscription.unsubscribe();
     window.removeEventListener('focus', refreshOnReturn);
     document.removeEventListener('visibilitychange', refreshOnReturn);
     window.removeEventListener('online', refreshOnReturn);
   };
 }, []); 
 const signIn = async e => { e.preventDefault(); if (!supabase) return; setAuthBusy(true); const {error} = await supabase.auth.signInWithPassword({email:authEmail,password:authPassword}); setAuthBusy(false); if(error) toast(error.message); };
 const signOut = async () => { if(supabase) await supabase.auth.signOut(); };
 const toast=m=>{setNotice(m);setTimeout(()=>setNotice(''),3200)};
 const totalRevenue=sales.reduce((s,x)=>s+x.total,0); const totalCost=sales.reduce((s,x)=>s+x.cost,0);
 const lowStock=products.filter(p=>p.stock<=5).length;
 const nav=[['داشبورد',LayoutDashboard],['ثبت فروش',ShoppingCart],['موجودی کالا',Package],['قیمت‌گذاری کالاها',Tags],['مشتریان',Users],['صندوق',Wallet],['گزارش‌ها',BarChart3]];
 const filteredProducts=products.filter(p=>(p.name+' '+p.sku+' '+p.category+' '+p.color).toLowerCase().includes(query.toLowerCase()) && (!categoryQuery.trim() || (p.category+' '+p.name).toLowerCase().includes(categoryQuery.toLowerCase())));
 const inventoryCategories=[...new Set([...Object.keys(productTaxonomy),...products.map(p=>productBase(p))])].sort((a,b)=>a.localeCompare(b,'fa'));
 const saleCategory=saleForm.category || inventoryCategories[0] || '';
 const visibleInventoryCategories=inventoryCategories.filter(c=>c.toLocaleLowerCase('fa').includes(saleCategorySearch.trim().toLocaleLowerCase('fa')));
 if(saleCategory && !visibleInventoryCategories.includes(saleCategory)) visibleInventoryCategories.unshift(saleCategory);
 const categoryProducts=products.filter(p=>productBase(p)===saleCategory);
 const variantOptions=[...new Set([...(productTaxonomy[saleCategory]||['ساده']),...categoryProducts.map(productVariant)])];
 const saleVariant=saleForm.variant || variantOptions[0] || '';
 const visibleVariantOptions=variantOptions.filter(v=>v.toLocaleLowerCase('fa').includes(saleVariantSearch.trim().toLocaleLowerCase('fa')));
 if(saleVariant && !visibleVariantOptions.includes(saleVariant)) visibleVariantOptions.unshift(saleVariant);
 const variantProducts=categoryProducts.filter(p=>productVariant(p)===saleVariant);
 const colorOptions=[...new Set(variantProducts.map(p=>cleanText(p.color)).filter(c=>c&&c!=='-'))];
 const saleColor=saleForm.color || colorOptions[0] || '';
 const matchingSaleProducts=variantProducts.filter(p=>cleanText(p.color)===saleColor);
 const selectedSaleProduct=matchingSaleProducts.find(p=>String(p.id)===String(saleForm.productId))||matchingSaleProducts[0]||null;
 
 const addProduct=async e=>{e.preventDefault();try{if(!branch)throw new Error('شعبه هنوز بارگذاری نشده است.');const productName=[form.category,form.variant&&form.variant!=='ساده'?form.variant:'',form.color&&form.color!=='-'?form.color:''].filter(Boolean).join(' ');const productSku='SAL-'+Date.now().toString(36).toUpperCase();const p=await createProduct(branch.id,{...form,stock:numericValue(form.stock),buy:0,price:numericValue(form.price),name:productName,sku:productSku});setProducts([p,...products]);setShowProduct(false);setForm({name:'',sku:'',category:'کت‌وشلوار',variant:'ساده',size:'50',color:'مشکی',stock:'1',price:''});toast('کالا در پایگاه داده ذخیره شد.');}catch(err){toast(err.message||'ذخیره کالا ناموفق بود.');}};
 const addSale=async e=>{e.preventDefault();toast('ثبت فروش امن هنوز تا فعال‌شدن تابع تراکنشی پایگاه داده غیرفعال است؛ هیچ اطلاعاتی ثبت نشد.');};
 const addCash=async e=>{e.preventDefault();try{if(!branch)throw new Error('شعبه هنوز بارگذاری نشده است.');const item=await createCashTransaction(branch.id,branch.userId,{...cashForm,amount:Number(cashForm.amount)});setCash([item,...cash]);setShowCash(false);toast('تراکنش صندوق در پایگاه داده ذخیره شد.');}catch(err){toast(err.message||'ثبت تراکنش ناموفق بود.');}};
 const cashBalance=cash.reduce((s,x)=>s+(x.type==='دریافت'?x.amount:-x.amount),0);
 const exportCsv=()=>{const rows=[['نام کالا','کد','دسته','سایز','رنگ','موجودی','قیمت فروش'],...products.map(p=>[p.name,p.sku,p.category,p.size,p.color,p.stock,p.price])];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='salco-inventory.csv';a.click();URL.revokeObjectURL(a.href);};
 const resetDemo=()=>{if(confirm('اطلاعات آزمایشی و ثبت‌های همین مرورگر به حالت اولیه برگردند؟')){['products','sales','customers','cash'].forEach(k=>localStorage.removeItem('salco_'+k));location.reload();}};
 if (authLoading) return <div className="auth-screen" dir="rtl"><div className="auth-card"><h1>SALCO⁺</h1><p>در حال بررسی نشست کاربری…</p></div></div>;
 if (!isSupabaseConfigured) return <div className="auth-screen" dir="rtl"><div className="auth-card"><h1>SALCO⁺</h1><h2>تنظیم اتصال پایگاه داده</h2><p>برای فعال‌شدن برنامه، متغیرهای VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY را در تنظیمات محیطی میزبان سایت ثبت کنید.</p><p>کلید service_role را هرگز در فرانت‌اند قرار ندهید.</p></div></div>;
 if (!session) return <div className="auth-screen" dir="rtl"><form className="auth-card" onSubmit={signIn}><img className="salco-logo-login" src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="لوگوی SALCO+" /><h2>ورود به پنل مدیریت</h2><p>با حساب کاربری Supabase وارد شوید.</p><label>ایمیل<input type="email" autoComplete="username" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required /></label><label>رمز عبور<input type="password" autoComplete="current-password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required /></label><button className="btn btn-gold" disabled={authBusy} type="submit">{authBusy?'در حال ورود…':'ورود امن'}</button></form>{notice&&<div className="toast">{notice}</div>}</div>;
 return <div className="app-shell"><aside className={'sidebar '+(mobileOpen?'open':'')}><div className="brand"><img className="salco-logo-sidebar" src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="لوگوی SALCO+" /><div className="brand-caption"><small>STORE MANAGEMENT</small></div><button className="close-nav" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div><div className="branch"><span className="status-dot"/> {branch?.name || 'شعبه پلاس'} <small>{branch?.city || 'خرم‌آباد'}</small></div><div className="nav-label">منوی اصلی</div><nav>{nav.map(([label,Icon])=><button key={label} onClick={()=>{setPage(label);setMobileOpen(false);if((label==='قیمت‌گذاری کالاها'||label==='موجودی کالا')&&session)loadRemote(session)}} className={page===label?'active':''}><Icon size={19}/><span>{label}</span>{label==='موجودی کالا'&&lowStock>0&&<i>{num(lowStock)}</i>}</button>)}</nav><div className="sidebar-bottom"><div className="secure-icon"><ShieldCheck size={18}/></div><div><b>فضای مدیریت فروشگاه</b><small>{session?.user?.email || 'کاربر واردشده'}</small></div><button className="text-link" onClick={signOut}>خروج</button></div></aside>
 <main className="main"><header className="topbar"><button className="menu-btn" onClick={()=>setMobileOpen(true)}><Menu/></button><img className="salco-logo-topbar" src={`${import.meta.env.BASE_URL}images/salco-logo.webp`} alt="لوگوی SALCO+" /><div className="breadcrumb">مدیریت فروشگاه <span>/</span> <b>{page}</b></div><div className="top-actions"><span className="today">{new Intl.DateTimeFormat('fa-IR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</span><button className="icon-btn" title="اعلان‌ها"><Bell size={18}/><i/></button><div className="avatar">س</div></div></header><div className="content"><div className={page==='داشبورد'?'page-heading dashboard-heading-hidden':'page-heading'}><div><div className="eyebrow">SALCO⁺ / MANAGEMENT</div>{page!=='داشبورد'&&<h1>{page}</h1>}<p>{page==='داشبورد'?'':'اطلاعات را ثبت و پیگیری کن؛ تغییرات این نسخه فعلاً در همین مرورگر ذخیره می‌شوند.'}</p></div></div>
 {page==='داشبورد'&&<><section className="panel best-panel"><div className="panel-head"><div><h2>پرفروش‌ترین کالاها</h2><p>بر اساس تعداد فروش ثبت‌شده</p></div><span className="mini-badge">TOP ITEMS</span></div>{[...products].sort((a,b)=>b.sold-a.sold).slice(0,4).map((p,i)=><div className="best-item" key={p.id}><div className="product-thumb"><Shirt size={20}/></div><div className="best-info"><b>{p.name}</b><small>{p.category} · {p.color}</small><div className="progress"><span style={{width:`${Math.max(5,p.sold/Math.max(1,...products.map(x=>x.sold))*100)}%`}}/></div></div><strong>{num(p.sold)} <small>عدد</small></strong></div>)}</section><section className="stats-grid"><Stat icon={ShoppingCart} title="فروش ثبت‌شده" value={money(totalRevenue)} sub={`${num(sales.length)} فاکتور ثبت‌شده`} trend="فروش‌های این نسخه"/><Stat icon={Package} title="تعداد کالاها" value={num(products.length)} sub={`${num(products.reduce((s,p)=>s+p.stock,0))} عدد موجودی`} trend={lowStock?`${num(lowStock)} کالای کم‌موجودی`:'موجودی مناسب'} warn={lowStock>0}/><Stat icon={Wallet} title="مانده صندوق" value={money(cashBalance)} sub="بر اساس تراکنش‌های ثبت‌شده" trend="دریافت منهای پرداخت"/></section><div className="dashboard-grid"><section className="panel sales-panel"><div className="panel-head"><div><h2>آخرین فروش‌ها</h2><p>فاکتورهای ثبت‌شده در این مرورگر</p></div><button className="text-link" onClick={()=>setPage('گزارش‌ها')}>مشاهده گزارش‌ها <ArrowUpLeft size={15}/></button></div>{sales.length===0?<Empty icon={ShoppingCart} title="هنوز فروشی ثبت نشده" text="با ثبت اولین فروش، خلاصه آن اینجا نمایش داده می‌شود."/>:<div className="table-wrap"><table><thead><tr><th>کالا</th><th>مشتری</th><th>تعداد</th><th>مبلغ نهایی</th></tr></thead><tbody>{sales.slice(0,5).map(s=><tr key={s.id}><td><b>{s.product}</b><small>{new Date(s.date).toLocaleDateString('fa-IR')}</small></td><td>{s.customer}</td><td>{num(s.qty)}</td><td className="gold-text">{money(s.total)}</td></tr>)}</tbody></table></div>}</section></div></>}
 {page==='قیمت‌گذاری کالاها'&&<section className="panel">
   <div className="panel-head"><div><h2>قیمت‌گذاری کالاها</h2><p>قیمت فروش هر مدل را یک‌بار وارد کن؛ قیمت برای تمام رنگ‌های همان مدل ذخیره می‌شود.</p></div><span className="mini-badge">{num(products.length)} کالا</span></div>
   <div className="inline-actions pricing-toolbar">
     <div className="searchbox"><Search size={16}/><input value={priceSearch} onChange={e=>setPriceSearch(e.target.value)} placeholder="جست‌وجوی نام کالا، سرفصل، مدل یا رنگ..."/></div>
     <label className="pricing-filter"><input type="checkbox" checked={priceOnlyUnpriced} onChange={e=>setPriceOnlyUnpriced(e.target.checked)}/> فقط کالاهای بدون قیمت</label>
     <button type="button" className="btn btn-ghost" onClick={()=>{setPriceDrafts({});setPriceSearch('');setPriceOnlyUnpriced(false);if(session)loadRemote(session)}}><ArrowDownRight size={15}/> تازه‌سازی کالاها</button>
   </div>
   {products.length===0?<Empty icon={Tags} title="کالایی برای قیمت‌گذاری نیست" text="ابتدا مطمئن شو کالاها از پایگاه داده بارگذاری شده‌اند."/>:<div className="pricing-list">
   {Object.values(products.filter(p=>([p.name,p.category,p.variant,p.color,p.size,p.sku].join(' ').toLocaleLowerCase('fa')).includes(priceSearch.trim().toLocaleLowerCase('fa'))&&(!priceOnlyUnpriced||Number(p.price)<=0)).reduce((groups,p)=>{const model=productVariant(p);const key=cleanText(p.category)+'::'+model; if(!groups[key])groups[key]={key,category:cleanText(p.category)||'متفرقه',model,items:[]};groups[key].items.push(p);return groups;},{})).map(group=>{const first=group.items[0];const buyDraft=priceDrafts['group:'+group.key]||{};const buy=buyDraft.buy??String(first.buy??0);const price=buyDraft.price??String(first.price??0);const missing=Number(price)<=0||Number(buy)<=0;const saving=group.items.some(p=>savingPriceId===p.id);return <article className="pricing-card pricing-group-card" key={group.key}>
     <div className="pricing-card-head"><div className="pricing-product"><b>{group.category} {group.model!=='ساده'?group.model:''}</b><small>{group.items.length} رنگ / کالا · {group.items.map(p=>cleanText(p.color)||'بدون رنگ').filter((c,i,a)=>a.indexOf(c)===i).join('، ')}</small></div><span className="pricing-stock">{num(group.items.reduce((n,p)=>n+Number(p.stock||0),0))} عدد</span></div>
     <div className="pricing-group-edit"><div className="pricing-fields pricing-fields-single"><label>قیمت فروش کل مدل <small>(تومان)</small><input className="price-cell-input" aria-label={'قیمت فروش '+group.category+' '+group.model} type="text" inputMode="numeric" min="0" value={price} onChange={e=>setPriceDrafts(prev=>({...prev,['group:'+group.key]:{price:formatDigits(e.target.value)}}))}/></label></div>
       <div className="pricing-card-footer"><span className={missing?'pill-yellow':'pill-green'}>{missing?'نیازمند قیمت':'قیمت‌گذاری شده'}</span><button className="btn btn-gold" type="button" disabled={saving||!buyDraft.price} onClick={async()=>{try{setSavingPriceId(first.id);const savedValues={price:numericValue(price)};for(const p of group.items){await updateProductPrices(p.id,savedValues);}setProducts(prev=>prev.map(item=>group.items.some(p=>String(p.id)===String(item.id))?{...item,...savedValues}:item));setPriceDrafts(prev=>{const next={...prev};delete next['group:'+group.key];return next;});toast('قیمت برای همه رنگ‌های '+group.category+' '+group.model+' ذخیره شد.');}catch(err){toast(err.message||'ذخیره قیمت ناموفق بود.');}finally{setSavingPriceId(null);}}}>{saving?'در حال ذخیره…':'ذخیره قیمت'}</button></div>
     </div>
   </article>})}
   </div>}
 </section>}
 {page==='موجودی کالا'&&<section className="panel"><div className="panel-head"><div><h2>فهرست کالاها</h2><p>مشخصات، سایز، رنگ، قیمت و تعداد موجودی</p></div><div className="inline-actions"><div className="searchbox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جست‌وجوی کالا، کد یا رنگ..."/></div><div className="searchbox"><Search size={16}/><input value={categoryQuery} onChange={e=>setCategoryQuery(e.target.value)} placeholder="جست‌وجوی سرفصل یا مدل..."/></div><button className="btn btn-gold" onClick={()=>setShowProduct(true)}><Plus size={16}/> افزودن کالا</button></div></div><ProductTable products={filteredProducts} groupVariants onEditPrice={p=>setEditingPrice({id:p.id,ids:p.ids||[p.id],category:p.category,variant:p.variant||productVariant(p),color:p.color,size:p.size,price:formatDigits(p.price??0)})} onDelete={async ids=>{const idsToDelete=Array.isArray(ids)?ids:[ids];if(!confirm(idsToDelete.length>1?'همه رنگ‌ها و سایزهای این مدل از فهرست موجودی حذف شوند؟':'این کالا از فهرست موجودی حذف شود؟'))return;try{if(session){for(const id of idsToDelete)await deactivateProduct(id);}setProducts(prev=>prev.filter(p=>!idsToDelete.some(id=>String(id)===String(p.id))));toast('کالا از فهرست موجودی حذف شد.');}catch(err){toast(err.message||'حذف کالا ناموفق بود.');}}}/></section>}
 {page==='ثبت فروش'&&<section className="panel"><div className="panel-head"><div><h2>ثبت فاکتور فروش</h2><p>پس از ثبت، موجودی کالا و صندوق محلی به‌روزرسانی می‌شوند.</p></div></div><form className="form-grid" onSubmit={addSale}><label>جست‌وجوی سرفصل<input type="search" value={saleCategorySearch} onChange={e=>setSaleCategorySearch(e.target.value)} placeholder="نام سرفصل را جست‌وجو کن…"/></label><label>سرفصل جنس<select value={saleCategory} onChange={e=>{const category=e.target.value;const firstVariant=(productTaxonomy[category]||['ساده'])[0];const firstProduct=products.find(p=>productBase(p)===category&&productVariant(p)===firstVariant);setSaleForm({...saleForm,category,variant:firstVariant,color:firstProduct?.color||'',productId:firstProduct?String(firstProduct.id):''});setSaleVariantSearch('');}}>{visibleInventoryCategories.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>جست‌وجوی مدل / انتخابی<input type="search" value={saleVariantSearch} onChange={e=>setSaleVariantSearch(e.target.value)} placeholder="مدل را جست‌وجو کن…"/></label><label>انتخابی / مدل<select value={saleVariant} onChange={e=>{const variant=e.target.value;const firstProduct=categoryProducts.find(p=>productVariant(p)===variant);setSaleForm({...saleForm,variant,color:firstProduct?.color||'',productId:firstProduct?String(firstProduct.id):''});}}>{visibleVariantOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>رنگ<select value={saleColor} onChange={e=>{const color=e.target.value;const firstProduct=variantProducts.find(p=>cleanText(p.color)===color);setSaleForm({...saleForm,color,productId:firstProduct?String(firstProduct.id):''});}}>{colorOptions.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>تعداد<input type="number" min="1" value={saleForm.qty} onChange={e=>setSaleForm({...saleForm,qty:e.target.value})} required/></label><label>نام مشتری (اختیاری)<input value={saleForm.customer} onChange={e=>setSaleForm({...saleForm,customer:e.target.value})} placeholder="مشتری حضوری"/></label><label>تخفیف (تومان)<input type="text" inputMode="numeric" value={formatDigits(saleForm.discount)} onChange={e=>setSaleForm({...saleForm,discount:numericValue(e.target.value)})}/></label><label>روش پرداخت<select value={saleForm.payment} onChange={e=>setSaleForm({...saleForm,payment:e.target.value})}><option>کارت‌خوان</option><option>نقدی</option><option>کارت‌به‌کارت</option><option>اعتباری</option></select></label><div className="form-total"><span>مبلغ نهایی تخمینی</span><b>{money((selectedSaleProduct?.price||0)*Number(saleForm.qty)-Number(saleForm.discount||0))}</b></div><div className="form-footer"><button className="btn btn-gold" type="submit">ثبت فروش</button></div></form></section>}
 {page==='مشتریان'&&<section className="panel"><div className="panel-head"><div><h2>فهرست مشتریان</h2><p>سابقه خرید مشتریان نمونه</p></div><span className="demo-tag">DEMO DATA</span></div><div className="table-wrap"><table><thead><tr><th>مشتری</th><th>شماره تماس</th><th>تعداد مراجعه</th><th>مجموع خرید</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.phone}</td><td>{num(c.visits)}</td><td className="gold-text">{money(c.total)}</td></tr>)}</tbody></table></div><p className="footnote">اطلاعات مشتریان این صفحه نمونه است؛ قبل از استفاده واقعی باید مشتریان حقیقی ثبت و دسترسی‌ها ایمن شوند.</p></section>}
 {page==='صندوق'&&<section className="panel"><div className="panel-head"><div><h2>گردش صندوق</h2><p>دریافت‌ها و پرداخت‌های ثبت‌شده</p></div><button className="btn btn-gold" onClick={()=>setShowCash(true)}><Plus size={16}/> ثبت تراکنش</button></div><div className="cash-summary"><div><small>مانده محاسبه‌شده</small><b>{money(cashBalance)}</b></div><div><small>تعداد تراکنش‌ها</small><b>{num(cash.length)}</b></div></div>{cash.length===0?<Empty icon={Wallet} title="تراکنشی ثبت نشده" text="دریافت‌ها و پرداخت‌ها پس از ثبت در این فهرست ظاهر می‌شوند."/>:<div className="table-wrap"><table><thead><tr><th>شرح</th><th>نوع</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>{cash.map(c=><tr key={c.id}><td><b>{c.title}</b></td><td><span className={c.type==='دریافت'?'pill-green':'pill-red'}>{c.type}</span></td><td>{new Date(c.date).toLocaleDateString('fa-IR')}</td><td className={c.type==='دریافت'?'gold-text':'red-text'}>{money(c.amount)}</td></tr>)}</tbody></table></div>}</section>}
 {page==='گزارش‌ها'&&<><section className="stats-grid"><Stat icon={ShoppingCart} title="مجموع فروش ثبت‌شده" value={money(totalRevenue)} sub="همه فروش‌های محلی"/><Stat icon={Package} title="تعداد اقلام فروخته‌شده" value={num(sales.reduce((s,x)=>s+x.qty,0))} sub="بر اساس فاکتورها"/><Stat icon={BarChart3} title="سود ناخالص تخمینی" value={money(totalRevenue-totalCost)} sub="قبل از اجاره، حقوق و هزینه‌ها"/></section><section className="panel"><div className="panel-head"><div><h2>رتبه‌بندی کالاها</h2><p>فروش و موجودی فعلی</p></div><button className="btn btn-ghost" onClick={exportCsv}><Download size={16}/> خروجی موجودی</button></div><ProductTable products={[...products].sort((a,b)=>b.sold-a.sold)} onDelete={()=>{}} showSold/></section><section className="panel reset-panel"><div><h3>مدیریت داده‌های آزمایشی</h3><p>این دکمه فقط اطلاعات محلی همین مرورگر را به نمونه اولیه برمی‌گرداند.</p></div><button className="btn btn-danger" onClick={resetDemo}><Trash2 size={16}/> بازنشانی داده‌های محلی</button></section></>}
 </div></main>
 {showProduct&&<Modal title="افزودن کالای جدید" close={()=>setShowProduct(false)}><form className="form-grid modal-form" onSubmit={addProduct}><label>سرفصل اصلی<select value={form.category} onChange={e=>{const category=e.target.value;const variant=(productTaxonomy[category]||['ساده'])[0];setForm({...form,category,variant,name:category+' '+variant});}}>{Object.keys(productTaxonomy).map(category=><option key={category}>{category}</option>)}</select></label><label>مدل / انتخابی<select value={form.variant} onChange={e=>setForm({...form,variant:e.target.value,name:form.category+' '+e.target.value})}>{(productTaxonomy[form.category]||['ساده']).map(variant=><option key={variant}>{variant}</option>)}</select></label><label>سایز<input value={form.size} onChange={e=>setForm({...form,size:e.target.value})}/></label><label>رنگ<input list="salco-color-options" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} placeholder="رنگ کالا را انتخاب یا تایپ کن"/><datalist id="salco-color-options"><option value="مشکی"/><option value="سورمه‌ای"/><option value="طوسی"/><option value="نوک‌مدادی"/><option value="سبز"/><option value="سبزآبی"/><option value="آبی"/><option value="کرم"/><option value="قهوه‌ای"/><option value="سفید"/><option value="بادمجونی"/><option value="زرشکی"/><option value="مشکی شاین"/><option value="سورمه‌ای برفکی"/></datalist></label><label>موجودی اولیه<input type="text" inputMode="numeric" value={formatDigits(form.stock)} onChange={e=>setForm({...form,stock:digitsOnly(e.target.value)})}/></label><label>قیمت فروش (تومان)<input type="text" inputMode="numeric" value={formatDigits(form.price)} onChange={e=>setForm({...form,price:formatDigits(e.target.value)})}/></label><div className="form-footer"><button className="btn btn-gold" type="submit">ذخیره کالا</button><button type="button" className="btn btn-ghost" onClick={()=>setShowProduct(false)}>انصراف</button></div></form></Modal>}
 {editingPrice&&<Modal title="اصلاح قیمت کالا" close={()=>setEditingPrice(null)}><form className="form-grid modal-form" onSubmit={async e=>{e.preventDefault();if(priceBusy)return;setPriceBusy(true);try{let saved;for(const productId of (editingPrice.ids||[editingPrice.id])) saved=await updateProductPrices(productId,{price:numericValue(editingPrice.price)});setProducts(prev=>prev.map(p=>(editingPrice.ids||[editingPrice.id]).some(id=>String(id)===String(p.id))?{...p,...saved}:p));setEditingPrice(null);toast('قیمت فروش برای همه رنگ‌های این مدل ذخیره شد.');}catch(err){toast(err.message||'ذخیره قیمت ناموفق بود.');}finally{setPriceBusy(false);}}}><div className="form-total"><span>{editingPrice.category} · {editingPrice.variant} · {editingPrice.color} · سایز {editingPrice.size}</span></div><label>قیمت فروش (تومان)<input type="text" inputMode="numeric" required value={editingPrice.price} onChange={e=>setEditingPrice({...editingPrice,price:formatDigits(e.target.value)})}/></label><div className="form-footer"><button className="btn btn-gold" type="submit" disabled={priceBusy}>{priceBusy?'در حال ذخیره…':'ذخیره قیمت'}</button><button type="button" className="btn btn-ghost" onClick={()=>setEditingPrice(null)}>انصراف</button></div></form></Modal>}
 {showCash&&<Modal title="ثبت تراکنش صندوق" close={()=>setShowCash(false)}><form className="form-grid modal-form" onSubmit={addCash}><label>نوع تراکنش<select value={cashForm.type} onChange={e=>setCashForm({...cashForm,type:e.target.value})}><option>دریافت</option><option>پرداخت</option></select></label><label>شرح تراکنش<input required value={cashForm.title} onChange={e=>setCashForm({...cashForm,title:e.target.value})} placeholder="مثلاً هزینه بسته‌بندی"/></label><label>مبلغ (تومان)<input type="text" inputMode="numeric" min="1" required value={formatDigits(cashForm.amount)} onChange={e=>setCashForm({...cashForm,amount:numericValue(e.target.value)})}/></label><div className="form-footer"><button className="btn btn-gold" type="submit">ثبت تراکنش</button><button type="button" className="btn btn-ghost" onClick={()=>setShowCash(false)}>انصراف</button></div></form></Modal>}
 {notice&&<div className="toast">{notice}</div>}</div>
}
function Stat({icon:Icon,title,value,sub,trend,warn}){return <div className="stat-card"><div className="stat-top"><span>{title}</span><div className="stat-icon"><Icon size={19}/></div></div><strong className="stat-value">{value}</strong><div className="stat-bottom"><span>{sub}</span>{trend&&<em className={warn?'warn':''}>{trend}</em>}</div></div>}
function ProductTable({products,onDelete,showSold=false,onEditPrice,groupVariants=false}){
 const displayProducts=groupVariants?Object.values(products.reduce((groups,p)=>{const category=cleanText(p.category)||'متفرقه';const variant=p.variant||productVariant(p);const key=category+'::'+variant;if(!groups[key])groups[key]={...p,id:key,ids:[],category,variant,sku:'',color:'رنگ‌های مختلف',size:'',stock:0,sold:0,items:[]};groups[key].ids.push(p.id);groups[key].items.push(p);groups[key].stock+=Number(p.stock||0);groups[key].sold+=Number(p.sold||0);return groups;},{})).map(g=>{const sizes={};g.items.forEach(item=>{String(item.size||'').match(/\d+\s*:\s*\d+/g)?.forEach(pair=>{const [size,count]=pair.split(':').map(v=>Number(v.trim()));sizes[size]=(sizes[size]||0)+count;});});const sizeSummary=Object.keys(sizes).length?Object.keys(sizes).sort((a,b)=>Number(a)-Number(b)).map(size=>size+':'+sizes[size]).join('، '):'سایزبندی متنوع';return {...g,buy:g.items[0]?.buy??0,price:g.items[0]?.price??0,sku:g.items.length+' رنگ',size:sizeSummary};}):products;
 return displayProducts.length===0?<Empty icon={Package} title="کالایی پیدا نشد" text="جست‌وجو را تغییر بده یا کالای جدید اضافه کن."/>:<div className="table-wrap"><table><thead><tr><th>سرفصل / جنس</th><th>مدل / انتخابی</th><th>سایزها</th><th>موجودی کل</th><th>قیمت فروش</th>{showSold&&<th>تعداد فروش</th>}<th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{displayProducts.map(p=><tr key={p.id}><td><div className="table-product"><div className="product-thumb"><Shirt size={18}/></div><b>{p.category}</b></div><small>{p.sku}</small></td><td>{p.variant||productVariant(p)}</td><td>{groupVariants?'همه رنگ‌ها':(p.color+' / ')} {p.size}</td><td><b>{num(p.stock)}</b> عدد</td><td className="gold-text">{money(p.price)}</td>{showSold&&<td>{num(p.sold)}</td>}<td><span className={p.stock<=3?'pill-red':p.stock<=5?'pill-yellow':'pill-green'}>{p.stock<=3?'رو به اتمام':p.stock<=5?'کم‌موجودی':'موجود'}</span></td><td><div className="inline-actions"><button className="btn btn-ghost" type="button" onClick={()=>onEditPrice?.(p)}><Pencil size={14}/> اصلاح قیمت</button>{onDelete&&<button className="row-delete" type="button" onClick={()=>onDelete(groupVariants?(p.ids||[p.id]):p.id)} title={groupVariants?'حذف همه رنگ‌های این مدل':'حذف کالا'} aria-label={groupVariants?'حذف همه رنگ‌های این مدل':'حذف کالا'}><Trash2 size={16}/></button>}</div></td></tr>)}</tbody></table></div>}
function Empty({icon:Icon,title,text}){return <div className="empty"><div><Icon size={24}/></div><b>{title}</b><p>{text}</p></div>}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</section></div>}

createRoot(document.getElementById('root')).render(<App/>);
