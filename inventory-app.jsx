import { useState, useEffect, useRef, useCallback } from "react";

/* ─── In-Memory DB ─────────────────────────────────────────────────────────── */
let _db = [
  { product_id:1,  name:"Wireless Keyboard",  category:"Electronics",  price:49.99,  quantity:34 },
  { product_id:2,  name:"USB-C Hub",           category:"Electronics",  price:29.99,  quantity:7  },
  { product_id:3,  name:"Ergonomic Mouse",     category:"Electronics",  price:39.99,  quantity:18 },
  { product_id:4,  name:"Notebook A5",         category:"Stationery",   price:4.99,   quantity:5  },
  { product_id:5,  name:"Standing Desk Mat",   category:"Furniture",    price:89.99,  quantity:12 },
  { product_id:6,  name:"Ballpoint Pens x10",  category:"Stationery",   price:2.49,   quantity:3  },
  { product_id:7,  name:"Monitor Stand",       category:"Furniture",    price:59.99,  quantity:9  },
  { product_id:8,  name:"Webcam 1080p",        category:"Electronics",  price:74.99,  quantity:22 },
  { product_id:9,  name:"Sticky Notes Pack",   category:"Stationery",   price:3.99,   quantity:2  },
  { product_id:10, name:"Laptop Sleeve 15in",  category:"Accessories",  price:19.99,  quantity:15 },
];
let _nextId = 11;

const api = {
  getAll:  ()      => new Promise(r => setTimeout(() => r([..._db]), 80)),
  insert:  (p)     => new Promise(r => setTimeout(() => {
    const rec = { ...p, product_id:_nextId++, price:parseFloat(p.price), quantity:parseInt(p.quantity) };
    _db.push(rec); r({...rec});
  }, 150)),
  update:  (id, p) => new Promise(r => setTimeout(() => {
    _db = _db.map(x => x.product_id===id ? {...x,...p,price:parseFloat(p.price),quantity:parseInt(p.quantity)} : x);
    r(_db.find(x=>x.product_id===id));
  }, 150)),
  delete:  (id)    => new Promise(r => setTimeout(() => { _db=_db.filter(x=>x.product_id!==id); r(true); }, 100)),
};

/* ─── SQL Engine ──────────────────────────────────────────────────────────── */
function runSQL(raw) {
  const sql = raw.trim();
  const up = sql.toUpperCase().replace(/\s+/g," ");

  if (up.startsWith("SELECT")) {
    let rows = [..._db];
    const wm = sql.match(/WHERE\s+(\w+)\s*(=|LIKE|<|>|<=|>=|!=|<>)\s*['"]?([^'";\s]+)['"]?/i);
    if (wm) {
      const [,col,op,val] = wm;
      const k = Object.keys(_db[0]||{}).find(k=>k.toLowerCase()===col.toLowerCase());
      if (k) rows = rows.filter(r=>{
        const rv = String(r[k]).toLowerCase(), v = val.toLowerCase();
        if(op==="=") return rv===v;
        if(op.toUpperCase()==="LIKE") return rv.includes(v.replace(/%/g,""));
        if(op==="<") return parseFloat(r[k])<parseFloat(val);
        if(op===">") return parseFloat(r[k])>parseFloat(val);
        if(op==="<=") return parseFloat(r[k])<=parseFloat(val);
        if(op===">=") return parseFloat(r[k])>=parseFloat(val);
        if(op==="!="||op==="<>") return rv!==v;
        return true;
      });
    }
    const om = sql.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i);
    if (om) {
      const col = Object.keys(_db[0]||{}).find(k=>k.toLowerCase()===om[1].toLowerCase());
      if(col) rows.sort((a,b)=>{
        const d = om[2]?.toUpperCase()==="DESC"?-1:1;
        return typeof a[col]==="string"?a[col].localeCompare(b[col])*d:(a[col]-b[col])*d;
      });
    }
    const lm = sql.match(/LIMIT\s+(\d+)/i);
    if(lm) rows=rows.slice(0,parseInt(lm[1]));
    if(up.includes("COUNT(*)")) return { cols:["COUNT(*)"], rows:[[rows.length]], affected:null };
    if(up.includes("SUM(")) {
      const cm = sql.match(/SUM\((\w+)\)/i);
      const col = cm&&Object.keys(_db[0]||{}).find(k=>k.toLowerCase()===cm[1].toLowerCase());
      const total = col?rows.reduce((s,r)=>s+parseFloat(r[col]||0),0):0;
      return { cols:[`SUM(${cm?.[1]})`], rows:[[total.toFixed(2)]], affected:null };
    }
    if(!rows.length) return { cols:["product_id","name","category","price","quantity"], rows:[], affected:null };
    return { cols:Object.keys(rows[0]), rows:rows.map(r=>Object.values(r)), affected:null };
  }

  if (up.startsWith("INSERT")) {
    const vm = sql.match(/VALUES\s*\(([^)]+)\)/i);
    const cm = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if(vm&&cm){
      const cols = cm[1].split(",").map(s=>s.trim());
      const vals = vm[1].split(",").map(s=>s.trim().replace(/^['"]|['"]$/g,""));
      const obj = {};
      cols.forEach((c,i)=>{ obj[c]=vals[i]; });
      const rec = { product_id:_nextId++, name:obj.name||"", category:obj.category||"", price:parseFloat(obj.price)||0, quantity:parseInt(obj.quantity)||0 };
      _db.push(rec);
      return { cols:null, rows:null, affected:1, msg:`1 row inserted. New product_id = ${rec.product_id}` };
    }
    return { cols:null, rows:null, affected:0, msg:"Syntax error in INSERT. Check column names and VALUES.", error:true };
  }

  if (up.startsWith("UPDATE")) {
    const sm = sql.match(/SET\s+(.+?)(?:\s+WHERE|;|$)/i);
    const wm = sql.match(/WHERE\s+(\w+)\s*=\s*['"]?([^'";\s]+)['"]?/i);
    if(sm){
      const sets = sm[1].split(",").map(s=>s.trim());
      const kvs = {};
      sets.forEach(s=>{
        const [k,...rest]=s.split("=");
        const v=rest.join("=").trim().replace(/^['"]|['"]$/g,"");
        const realKey = Object.keys(_db[0]||{}).find(rk=>rk.toLowerCase()===k.trim().toLowerCase());
        if(realKey) kvs[realKey]=isNaN(v)?v:parseFloat(v);
      });
      let count=0;
      _db = _db.map(r=>{
        if(!wm) { count++; return {...r,...kvs}; }
        const col = Object.keys(r).find(k=>k.toLowerCase()===wm[1].toLowerCase());
        if(col&&String(r[col])===wm[2]){ count++; return {...r,...kvs}; }
        return r;
      });
      return { cols:null, rows:null, affected:count, msg:`${count} row(s) updated.` };
    }
    return { cols:null, rows:null, affected:0, msg:"Syntax error in UPDATE statement.", error:true };
  }

  if (up.startsWith("DELETE")) {
    const wm = sql.match(/WHERE\s+(\w+)\s*=\s*['"]?([^'";\s]+)['"]?/i);
    const before = _db.length;
    if(wm){
      const col = Object.keys(_db[0]||{}).find(k=>k.toLowerCase()===wm[1].toLowerCase());
      if(col) _db=_db.filter(r=>String(r[col])!==wm[2]);
    } else { _db=[]; }
    const count = before-_db.length;
    return { cols:null, rows:null, affected:count, msg:`${count} row(s) deleted.` };
  }

  return { cols:null, rows:null, affected:null, msg:`Unknown: "${sql.split(" ")[0].toUpperCase()}". Use SELECT, INSERT, UPDATE, or DELETE.`, error:true };
}

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const CATS = ["Electronics","Stationery","Furniture","Accessories","Clothing","Tools","Other"];
const LOW  = 10;

/* ─── Design tokens (warm editorial) ────────────────────────────────────────── */
const T = {
  bg:       "#F6F2EC",
  surface:  "#FFFFFF",
  border:   "#E0D6C8",
  borderDk: "#C4B9A8",
  text:     "#1C1410",
  muted:    "#7A6B5D",
  faint:    "#A89C8E",
  primary:  "#2E5A1A",
  pLight:   "#EAF2DF",
  pMid:     "#B8D49A",
  accent:   "#C4521A",
  aLight:   "#FAE8DC",
  gold:     "#A07808",
  gLight:   "#FFF5D6",
  red:      "#992020",
  rLight:   "#FDECEA",
};

/* ─── Icons ──────────────────────────────────────────────────────────────────── */
const Ic = ({ n, s=16 }) => {
  const paths = {
    home:  ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","M9 22V12h6v10"],
    plus:  ["M12 5v14","M5 12h14"],
    list:  ["M9 6h11","M9 12h11","M9 18h11","M4 6h.01","M4 12h.01","M4 18h.01"],
    sql:   ["M4 7V4h16v3","M9 20h6","M12 4v16"],
    edit:  ["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"],
    trash: ["M3 6h18","M8 6V4h8v2","M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"],
    search:["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z","M21 21l-4.35-4.35"],
    warn:  ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z","M12 9v4","M12 17h.01"],
    ok:    ["M20 6L9 17l-5-5"],
    x:     ["M18 6L6 18","M6 6l12 12"],
    out:   ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4","M16 17l5-5-5-5","M21 12H9"],
    user:  ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2","M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
    box:   ["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"],
    play:  ["M5 3l14 9-14 9V3z"],
    chip:  ["M9 3H5a2 2 0 0 0-2 2v4","M15 3h4a2 2 0 0 1 2 2v4","M9 21H5a2 2 0 0 1-2-2v-4","M15 21h4a2 2 0 0 0 2-2v-4","M9 9h6v6H9z"],
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {(paths[n]||[]).map((d,i)=><path key={i} d={d}/>)}
    </svg>
  );
};

/* ─── Toast ──────────────────────────────────────────────────────────────────── */
const Toast = ({ toasts }) => (
  <div style={{ position:"fixed", bottom:28, right:28, zIndex:9999, display:"flex", flexDirection:"column", gap:8 }}>
    {toasts.map(t=>(
      <div key={t.id} style={{
        background: t.type==="ok"?T.primary:t.type==="err"?T.red:T.gold,
        color:"#fff", padding:"11px 18px", borderRadius:8, fontSize:13,
        fontFamily:"'Lato',sans-serif", display:"flex", alignItems:"center", gap:9,
        boxShadow:"0 4px 20px rgba(0,0,0,.18)", animation:"pop .25s ease",
      }}>
        <Ic n={t.type==="ok"?"ok":"x"} s={15}/>{t.msg}
      </div>
    ))}
  </div>
);

/* ─── Reusable Field wrapper ──────────────────────────────────────────────────── */
const Field = ({ label, error, children }) => (
  <div style={{ marginBottom:18 }}>
    <label style={{ display:"block", fontSize:11, fontWeight:700, color:T.muted,
      letterSpacing:".06em", textTransform:"uppercase", marginBottom:6 }}>{label}</label>
    {children}
    {error && <div style={{ fontSize:12, color:T.red, marginTop:4 }}>{error}</div>}
  </div>
);

const iStyle = (err) => ({
  width:"100%", padding:"9px 13px", borderRadius:7, fontSize:14,
  border:`1.5px solid ${err?T.red:T.border}`, background:"#fff",
  color:T.text, outline:"none", fontFamily:"'Lato',sans-serif",
  boxSizing:"border-box", transition:"border-color .15s",
});

/* ─── Btn ────────────────────────────────────────────────────────────────────── */
const Btn = ({ children, onClick, variant="primary", small, disabled }) => {
  const v = {
    primary:   { background:T.primary, color:"#fff", border:`1.5px solid ${T.primary}` },
    secondary: { background:"#fff",    color:T.text,  border:`1.5px solid ${T.borderDk}` },
    danger:    { background:T.red,     color:"#fff",  border:`1.5px solid ${T.red}` },
    ghost:     { background:"transparent", color:T.muted, border:`1.5px solid ${T.border}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...v[variant], padding:small?"6px 13px":"9px 18px",
      borderRadius:7, fontSize:small?12:13, fontWeight:600,
      fontFamily:"'Lato',sans-serif", cursor:disabled?"not-allowed":"pointer",
      display:"inline-flex", alignItems:"center", gap:6,
      opacity:disabled?.55:1, transition:"box-shadow .15s",
    }}
    onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,.12)"; }}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
    >{children}</button>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   ALL page-level components defined OUTSIDE App so they NEVER remount on state
   changes — this is the fix for the input losing focus bug.
══════════════════════════════════════════════════════════════════════════════ */

/* ─── ProductForm ─────────────────────────────────────────────────────────── */
const ProductForm = ({ initial, onSave, onCancel, saving }) => {
  const blank = { name:"", category:"Electronics", price:"", quantity:"" };
  const [form, setForm] = useState(initial || blank);
  const [errs, setErrs] = useState({});

  useEffect(()=>{ setForm(initial||blank); setErrs({}); }, [initial]);

  const set = k => e => setForm(p=>({...p,[k]:e.target.value}));

  const validate = () => {
    const e={};
    if(!form.name.trim())                        e.name     = "Product name is required";
    if(!form.price||isNaN(form.price)||+form.price<0)  e.price    = "Enter a valid price (≥ 0)";
    if(!form.quantity||isNaN(form.quantity)||+form.quantity<0) e.quantity = "Enter a valid quantity (≥ 0)";
    setErrs(e);
    return Object.keys(e).length===0;
  };

  return (
    <div>
      <Field label="Product Name" error={errs.name}>
        <input value={form.name} onChange={set("name")} placeholder="e.g. Mechanical Keyboard"
          style={iStyle(errs.name)}
          onFocus={e=>e.target.style.borderColor=T.primary}
          onBlur={e=>e.target.style.borderColor=errs.name?T.red:T.border}
        />
      </Field>

      <Field label="Category">
        <select value={form.category} onChange={set("category")}
          style={{...iStyle(false), appearance:"none", cursor:"pointer", background:"#fff"}}>
          {CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </Field>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="Price (USD)" error={errs.price}>
          <input type="number" min="0" step="0.01" value={form.price}
            onChange={set("price")} placeholder="0.00" style={iStyle(errs.price)}
            onFocus={e=>e.target.style.borderColor=T.primary}
            onBlur={e=>e.target.style.borderColor=errs.price?T.red:T.border}
          />
        </Field>
        <Field label="Quantity" error={errs.quantity}>
          <input type="number" min="0" step="1" value={form.quantity}
            onChange={set("quantity")} placeholder="0" style={iStyle(errs.quantity)}
            onFocus={e=>e.target.style.borderColor=T.primary}
            onBlur={e=>e.target.style.borderColor=errs.quantity?T.red:T.border}
          />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10, marginTop:6 }}>
        <Btn onClick={()=>{ if(validate()) onSave(form); }} disabled={saving}>
          {saving?"Saving…":initial?"Update Product":"Add Product"}
        </Btn>
        {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  );
};

/* ─── DeleteModal ─────────────────────────────────────────────────────────── */
const DeleteModal = ({ target, onConfirm, onCancel }) => {
  if(!target) return null;
  return (
    <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(28,20,16,.4)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center",
      backdropFilter:"blur(3px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:T.surface,
        border:`1.5px solid ${T.border}`, borderRadius:14, padding:"36px 40px",
        width:380, textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,.15)" }}>
        <div style={{ width:52,height:52,borderRadius:"50%",background:T.rLight,
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 16px",color:T.red }}>
          <Ic n="trash" s={22}/>
        </div>
        <div style={{ fontSize:18,fontWeight:700,color:T.text,marginBottom:8 }}>Delete Product</div>
        <div style={{ fontSize:14,color:T.muted,marginBottom:28,lineHeight:1.6 }}>
          Remove <strong style={{color:T.text}}>{target.name}</strong> from inventory?<br/>
          This cannot be undone.
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"center" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm}><Ic n="trash" s={13}/> Delete</Btn>
        </div>
      </div>
    </div>
  );
};

/* ─── Dashboard ───────────────────────────────────────────────────────────── */
const Dashboard = ({ products }) => {
  const totalVal = products.reduce((s,p)=>s+p.price*p.quantity,0);
  const low      = products.filter(p=>p.quantity<LOW&&p.quantity>0);
  const oos      = products.filter(p=>p.quantity===0);
  const cats     = [...new Set(products.map(p=>p.category))];
  const maxUnits = Math.max(1,...cats.map(c=>products.filter(p=>p.category===c).reduce((s,p)=>s+p.quantity,0)));

  const Card = ({label,val,sub,col,bg}) => (
    <div style={{ background:bg||T.surface, border:`1.5px solid ${T.border}`,
      borderRadius:12, padding:"22px 24px", flex:"1 1 150px" }}>
      <div style={{ fontSize:11,fontWeight:700,color:T.muted,letterSpacing:".06em",
        textTransform:"uppercase",marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:30,fontWeight:800,color:col||T.text,lineHeight:1 }}>{val}</div>
      {sub&&<div style={{ fontSize:12,color:T.faint,marginTop:6 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px" }}>Dashboard</h2>
      <p style={{ fontSize:14,color:T.muted,marginBottom:24 }}>Your inventory at a glance</p>

      <div style={{ display:"flex",gap:14,marginBottom:22,flexWrap:"wrap" }}>
        <Card label="Total Products"  val={products.length}  sub={`${cats.length} categories`} col={T.primary}/>
        <Card label="Stock Value"     val={`$${totalVal.toLocaleString(undefined,{maximumFractionDigits:0})}`} sub="total worth"/>
        <Card label="Low Stock"       val={low.length}       sub="below 10 units"   col={T.gold}    bg={T.gLight}/>
        <Card label="Out of Stock"    val={oos.length}       sub="need reordering"  col={T.red}     bg={T.rLight}/>
      </div>

      {low.length>0&&(
        <div style={{ background:T.gLight, border:`1.5px solid #E0C840`,
          borderRadius:12, padding:"18px 22px", marginBottom:20 }}>
          <div style={{ display:"flex",alignItems:"center",gap:7,color:T.gold,
            fontWeight:700,fontSize:13,marginBottom:12 }}>
            <Ic n="warn" s={15}/> Low Stock — {low.length} item{low.length>1?"s":""}
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
            {low.map(p=>(
              <span key={p.product_id} style={{ background:"#fff",border:`1px solid #E0C840`,
                borderRadius:6,padding:"5px 12px",fontSize:13,color:T.text }}>
                {p.name} <strong style={{color:T.gold}}>({p.quantity} left)</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ background:T.surface,border:`1.5px solid ${T.border}`,
        borderRadius:12,padding:"22px 24px" }}>
        <div style={{ fontSize:11,fontWeight:700,color:T.muted,letterSpacing:".06em",
          textTransform:"uppercase",marginBottom:18 }}>Stock by Category</div>
        {cats.map(cat=>{
          const items=products.filter(p=>p.category===cat);
          const units=items.reduce((s,p)=>s+p.quantity,0);
          return (
            <div key={cat} style={{ marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5 }}>
                <span style={{ fontWeight:600,color:T.text }}>{cat}</span>
                <span style={{ color:T.muted }}>{units} units · {items.length} SKU{items.length!==1?"s":""}</span>
              </div>
              <div style={{ height:8,background:T.bg,borderRadius:4,overflow:"hidden" }}>
                <div style={{ height:"100%",borderRadius:4,
                  width:`${(units/maxUnits)*100}%`,
                  background:`linear-gradient(90deg,${T.primary},${T.pMid})`,
                  transition:"width .7s ease" }}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─── ProductsTable ───────────────────────────────────────────────────────── */
const ProductsTable = ({ products, onEdit, onDelete }) => {
  const [q,   setQ]   = useState("");
  const [cat, setCat] = useState("All");
  const [sc,  setSc]  = useState("product_id");
  const [sd,  setSd]  = useState("asc");

  const rows = products
    .filter(p=>{
      const lq=q.toLowerCase();
      return (!lq||p.name.toLowerCase().includes(lq)||p.category.toLowerCase().includes(lq))
        &&(cat==="All"||p.category===cat);
    })
    .sort((a,b)=>{
      const v=sd==="asc"?1:-1;
      return typeof a[sc]==="string"?a[sc].localeCompare(b[sc])*v:(a[sc]-b[sc])*v;
    });

  const toggle = c=>{ if(sc===c) setSd(d=>d==="asc"?"desc":"asc"); else{setSc(c);setSd("asc");} };

  const TH = ({col,children}) => (
    <th onClick={()=>col&&toggle(col)}
      style={{ padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,
        color:T.muted,letterSpacing:".06em",textTransform:"uppercase",
        cursor:col?"pointer":"default",userSelect:"none",whiteSpace:"nowrap",
        background:T.bg,borderBottom:`1.5px solid ${T.border}` }}>
      {children}{sc===col?(sd==="asc"?" ↑":" ↓"):""}
    </th>
  );

  const badge = q=>{
    if(q===0)  return { t:"Out of Stock",  bg:T.rLight, c:T.red };
    if(q<LOW)  return { t:"Low Stock",     bg:T.gLight, c:T.gold };
    return           { t:"In Stock",      bg:T.pLight, c:T.primary };
  };

  return (
    <div>
      <h2 style={{ fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px" }}>Products</h2>
      <p style={{ fontSize:14,color:T.muted,marginBottom:20 }}>{rows.length} record{rows.length!==1?"s":""} shown</p>

      <div style={{ display:"flex",gap:10,marginBottom:14,flexWrap:"wrap" }}>
        <div style={{ position:"relative",flex:1,minWidth:200 }}>
          <span style={{ position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:T.faint }}>
            <Ic n="search" s={15}/>
          </span>
          <input value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search name or category…"
            style={{...iStyle(false),paddingLeft:34}}
            onFocus={e=>e.target.style.borderColor=T.primary}
            onBlur={e=>e.target.style.borderColor=T.border}
          />
        </div>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{...iStyle(false),width:"auto",cursor:"pointer"}}>
          <option>All</option>
          {CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ background:T.surface,border:`1.5px solid ${T.border}`,
        borderRadius:12,overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <TH col="product_id">ID</TH>
                <TH col="name">Product Name</TH>
                <TH col="category">Category</TH>
                <TH col="price">Price</TH>
                <TH col="quantity">Qty</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {rows.length===0
                ? <tr><td colSpan={7} style={{ textAlign:"center",padding:48,color:T.faint,fontSize:14 }}>
                    No products match your search.
                  </td></tr>
                : rows.map((p,i)=>{
                    const b=badge(p.quantity);
                    return (
                      <tr key={p.product_id}
                        style={{ borderBottom:`1px solid ${T.border}`,
                          background:i%2===0?"#fff":T.bg,transition:"background .1s" }}
                        onMouseEnter={e=>e.currentTarget.style.background=T.pLight}
                        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":T.bg}>
                        <td style={{ padding:"12px 14px",fontSize:12,color:T.faint }}>#{p.product_id}</td>
                        <td style={{ padding:"12px 14px",fontSize:14,fontWeight:600,color:T.text }}>{p.name}</td>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:12,color:T.muted,background:T.bg,
                            padding:"3px 10px",borderRadius:20,border:`1px solid ${T.border}` }}>
                            {p.category}
                          </span>
                        </td>
                        <td style={{ padding:"12px 14px",fontSize:14,fontWeight:700,color:T.primary }}>${p.price.toFixed(2)}</td>
                        <td style={{ padding:"12px 14px",fontSize:14,fontWeight:700,color:p.quantity<LOW?T.gold:T.text }}>{p.quantity}</td>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:12,fontWeight:600,padding:"4px 10px",
                            borderRadius:20,background:b.bg,color:b.c }}>{b.t}</span>
                        </td>
                        <td style={{ padding:"12px 14px" }}>
                          <div style={{ display:"flex",gap:7 }}>
                            <Btn small variant="secondary" onClick={()=>onEdit(p)}><Ic n="edit" s={13}/> Edit</Btn>
                            <Btn small variant="ghost"     onClick={()=>onDelete(p)}><Ic n="trash" s={13}/></Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ─── SQL Runner ──────────────────────────────────────────────────────────── */
const EXAMPLES = [
  { label:"Get all products",           sql:"SELECT * FROM products;" },
  { label:"Low stock (qty < 10)",        sql:"SELECT * FROM products WHERE quantity < 10;" },
  { label:"Electronics only",           sql:"SELECT * FROM products WHERE category = 'Electronics';" },
  { label:"Sort by price DESC",         sql:"SELECT * FROM products ORDER BY price DESC;" },
  { label:"Top 5 cheapest",            sql:"SELECT * FROM products ORDER BY price ASC LIMIT 5;" },
  { label:"Count all products",         sql:"SELECT COUNT(*) FROM products;" },
  { label:"Sum of all prices",          sql:"SELECT SUM(price) FROM products;" },
  { label:"Insert new product",         sql:"INSERT INTO products (name, category, price, quantity)\nVALUES ('USB Microphone', 'Electronics', 59.99, 20);" },
  { label:"Update price",              sql:"UPDATE products SET price = 34.99 WHERE product_id = 2;" },
  { label:"Delete a product",          sql:"DELETE FROM products WHERE product_id = 9;" },
];

const SQLRunner = ({ onDbChanged }) => {
  const [sql,     setSql]     = useState("SELECT * FROM products;");
  const [result,  setResult]  = useState(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);

  const run = useCallback(() => {
    const q=sql.trim(); if(!q) return;
    setRunning(true);
    setTimeout(()=>{
      const res = runSQL(q);
      const entry = { sql:q, ts:new Date().toLocaleTimeString(), ...res };
      setResult(entry);
      setHistory(h=>[entry,...h].slice(0,15));
      setRunning(false);
      const u=q.toUpperCase();
      if(u.startsWith("INSERT")||u.startsWith("UPDATE")||u.startsWith("DELETE")) onDbChanged();
    }, 100);
  },[sql,onDbChanged]);

  return (
    <div>
      <h2 style={{ fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px" }}>SQL Runner</h2>
      <p style={{ fontSize:14,color:T.muted,marginBottom:22 }}>
        Execute live SQL against the database — changes persist across all tabs
      </p>

      <div style={{ display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start" }}>
        {/* Editor + Results */}
        <div style={{ flex:"1 1 480px" }}>
          <div style={{ background:T.surface,border:`1.5px solid ${T.border}`,
            borderRadius:12,overflow:"hidden",marginBottom:16 }}>
            <div style={{ background:T.bg,padding:"10px 16px",
              borderBottom:`1px solid ${T.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,
                fontSize:11,fontWeight:700,color:T.muted,
                textTransform:"uppercase",letterSpacing:".06em" }}>
                <Ic n="sql" s={14}/> SQL Editor
              </div>
              <Btn small onClick={run} disabled={running}>
                <Ic n="play" s={13}/>{running?"Running…":"Run  (Ctrl+↵)"}
              </Btn>
            </div>
            <div style={{ padding:16 }}>
              <textarea
                value={sql}
                onChange={e=>setSql(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); run(); }}}
                rows={7}
                spellCheck={false}
                placeholder="Write a SQL query…"
                style={{ width:"100%",padding:"12px 14px",borderRadius:8,fontSize:13,
                  border:`1.5px solid ${T.border}`,background:"#FAFAF7",
                  color:T.text,outline:"none",resize:"vertical",lineHeight:1.65,
                  fontFamily:"'Fira Mono','Courier New',monospace",
                  boxSizing:"border-box",transition:"border-color .15s" }}
                onFocus={e=>e.target.style.borderColor=T.primary}
                onBlur={e=>e.target.style.borderColor=T.border}
              />
              <div style={{ fontSize:11,color:T.faint,marginTop:8 }}>
                Ctrl+Enter to run · SELECT supports WHERE, ORDER BY, LIMIT, COUNT(*), SUM()
              </div>
            </div>
          </div>

          {/* Result panel */}
          {result&&(
            <div style={{ background:T.surface,
              border:`1.5px solid ${result.error?T.red:result.affected!=null?T.primary:T.border}`,
              borderRadius:12,overflow:"hidden" }}>
              <div style={{
                background: result.error?T.rLight:result.affected!=null?T.pLight:T.bg,
                padding:"10px 16px",borderBottom:`1px solid ${T.border}`,
                display:"flex",alignItems:"center",gap:8,fontSize:12,fontWeight:700,
                color:result.error?T.red:result.affected!=null?T.primary:T.muted,
                textTransform:"uppercase",letterSpacing:".05em" }}>
                <Ic n={result.error?"x":result.affected!=null?"ok":"chip"} s={14}/>
                {result.error
                  ? `Error`
                  : result.affected!=null
                    ? result.msg
                    : `${result.rows?.length??0} row${result.rows?.length!==1?"s":""} returned`
                }
              </div>

              {result.cols&&result.rows&&(
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%",borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:T.bg }}>
                        {result.cols.map(c=>(
                          <th key={c} style={{ padding:"9px 14px",textAlign:"left",
                            fontSize:11,fontWeight:700,color:T.muted,
                            letterSpacing:".05em",textTransform:"uppercase",
                            borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap" }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.length===0
                        ? <tr><td colSpan={result.cols.length} style={{ padding:24,textAlign:"center",color:T.faint,fontSize:13 }}>Empty result set.</td></tr>
                        : result.rows.map((row,i)=>(
                          <tr key={i} style={{ borderBottom:`1px solid ${T.border}`,background:i%2===0?"#fff":T.bg }}>
                            {row.map((v,j)=>(
                              <td key={j} style={{ padding:"9px 14px",fontSize:13,color:T.text,fontFamily:typeof v==="number"?"'Fira Mono',monospace":"inherit" }}>{String(v)}</td>
                            ))}
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              )}

              {result.error&&(
                <div style={{ padding:"12px 18px",fontSize:13,color:T.red }}>{result.msg}</div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: examples + history */}
        <div style={{ flex:"0 0 220px",display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:12,overflow:"hidden" }}>
            <div style={{ background:T.bg,padding:"10px 14px",borderBottom:`1px solid ${T.border}`,
              fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em" }}>
              Example Queries
            </div>
            <div style={{ padding:8 }}>
              {EXAMPLES.map((ex,i)=>(
                <button key={i} onClick={()=>{ setSql(ex.sql); setResult(null); }}
                  style={{ width:"100%",textAlign:"left",padding:"7px 10px",fontSize:12,
                    color:T.muted,background:"none",border:"none",borderRadius:6,
                    cursor:"pointer",fontFamily:"'Lato',sans-serif",display:"block",
                    transition:"background .1s" }}
                  onMouseEnter={e=>e.target.style.background=T.pLight}
                  onMouseLeave={e=>e.target.style.background="none"}>
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {history.length>0&&(
            <div style={{ background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:12,overflow:"hidden" }}>
              <div style={{ background:T.bg,padding:"10px 14px",borderBottom:`1px solid ${T.border}`,
                fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em" }}>
                History
              </div>
              <div style={{ maxHeight:200,overflowY:"auto",padding:8 }}>
                {history.map((h,i)=>(
                  <button key={i} onClick={()=>setSql(h.sql)}
                    title={h.sql}
                    style={{ width:"100%",textAlign:"left",padding:"6px 10px",fontSize:11,
                      color:h.error?T.red:T.faint,background:"none",border:"none",borderRadius:6,
                      cursor:"pointer",fontFamily:"'Fira Mono','Courier New',monospace",
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                      display:"block",transition:"background .1s" }}
                    onMouseEnter={e=>e.target.style.background=T.bg}
                    onMouseLeave={e=>e.target.style.background="none"}>
                    <span style={{ color:h.error?T.red:T.primary,marginRight:5 }}>›</span>
                    {h.sql.replace(/\n/g," ").slice(0,34)}{h.sql.length>34?"…":""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Login ───────────────────────────────────────────────────────────────── */
const Login = ({ onLogin }) => {
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const CREDS = { admin:"admin123", manager:"mgr2024" };
  const go = () => { if(CREDS[u]===pw) onLogin(u); else setErr("Wrong credentials. Try admin / admin123"); };

  return (
    <div style={{ minHeight:"100vh",background:T.bg,display:"flex",
      alignItems:"center",justifyContent:"center",fontFamily:"'Lato',sans-serif",
      backgroundImage:`radial-gradient(ellipse at 15% 20%, #D8EDBE 0%,transparent 55%),
                       radial-gradient(ellipse at 85% 80%, #FAE8DC 0%,transparent 55%)` }}>
      <div style={{ background:T.surface,border:`1.5px solid ${T.border}`,
        borderRadius:16,padding:"48px 44px",width:380,
        boxShadow:"0 20px 60px rgba(0,0,0,.1)" }}>
        <div style={{ textAlign:"center",marginBottom:36 }}>
          <div style={{ width:56,height:56,borderRadius:14,background:T.primary,
            display:"flex",alignItems:"center",justifyContent:"center",
            margin:"0 auto 16px",color:"#fff" }}>
            <Ic n="box" s={26}/>
          </div>
          <div style={{ fontSize:24,fontWeight:800,color:T.text }}>Invex IMS</div>
          <div style={{ fontSize:13,color:T.muted,marginTop:4 }}>Inventory Management System</div>
        </div>

        <Field label="Username">
          <input value={u} onChange={e=>setU(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&go()} placeholder="admin"
            style={iStyle(false)}
            onFocus={e=>e.target.style.borderColor=T.primary}
            onBlur={e=>e.target.style.borderColor=T.border}
          />
        </Field>
        <Field label="Password" error={err}>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&go()} placeholder="••••••••"
            style={iStyle(!!err)}
            onFocus={e=>e.target.style.borderColor=T.primary}
            onBlur={e=>e.target.style.borderColor=err?T.red:T.border}
          />
        </Field>

        <Btn onClick={go}>Sign In →</Btn>
        <div style={{ textAlign:"center",marginTop:18,fontSize:12,color:T.faint }}>
          Demo: admin / admin123 · manager / mgr2024
        </div>
      </div>
    </div>
  );
};

/* ─── App ─────────────────────────────────────────────────────────────────── */
export default function App() {
  const [user,         setUser]         = useState(null);
  const [page,         setPage]         = useState("dashboard");
  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [toasts,       setToasts]       = useState([]);
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const tid = useRef(0);

  const toast = (msg,type="ok") => {
    const id=++tid.current;
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);
  };

  const refresh = useCallback(async()=>{
    setLoading(true);
    setProducts(await api.getAll());
    setLoading(false);
  },[]);

  useEffect(()=>{ if(user) refresh(); },[user]);

  if(!user) return <Login onLogin={u=>setUser(u)}/>;

  const handleAdd = async(form)=>{ setSaving(true); await api.insert(form); toast("Product added"); await refresh(); setSaving(false); setPage("products"); };
  const handleUpdate = async(form)=>{ setSaving(true); await api.update(editTarget.product_id,form); toast("Product updated"); setEditTarget(null); await refresh(); setSaving(false); setPage("products"); };
  const handleDelete = async()=>{ await api.delete(deleteTarget.product_id); toast(`"${deleteTarget.name}" deleted`,"err"); setDeleteTarget(null); await refresh(); };

  const NAV = [
    { id:"dashboard", label:"Dashboard",   icon:"home" },
    { id:"add",       label:"Add Product", icon:"plus" },
    { id:"products",  label:"Products",    icon:"list" },
    { id:"sql",       label:"SQL Runner",  icon:"sql"  },
  ];

  const nbStyle = active => ({
    width:"100%", display:"flex", alignItems:"center", gap:10,
    padding:"9px 14px", borderRadius:8, cursor:"pointer",
    fontFamily:"'Lato',sans-serif", fontSize:13, fontWeight:600,
    border:"none", textAlign:"left", transition:"all .15s",
    background: active ? T.pLight : "transparent",
    color:       active ? T.primary : T.muted,
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;600;700;800&family=Fira+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:${T.bg};font-family:'Lato',sans-serif;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${T.borderDk};border-radius:3px;}
        select option{background:#fff;color:${T.text};}
        @keyframes pop{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      <div style={{ display:"flex",minHeight:"100vh",background:T.bg }}>
        {/* Sidebar */}
        <div style={{ width:220,background:T.surface,borderRight:`1.5px solid ${T.border}`,
          display:"flex",flexDirection:"column",flexShrink:0 }}>
          <div style={{ padding:"22px 20px 18px",borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:36,height:36,borderRadius:9,background:T.primary,
                display:"flex",alignItems:"center",justifyContent:"center",color:"#fff" }}>
                <Ic n="box" s={18}/>
              </div>
              <div>
                <div style={{ fontSize:16,fontWeight:800,color:T.text }}>Invex</div>
                <div style={{ fontSize:10,color:T.faint,letterSpacing:".05em",textTransform:"uppercase" }}>IMS v2.0</div>
              </div>
            </div>
          </div>

          <nav style={{ padding:"14px 12px",flex:1 }}>
            {NAV.map(n=>(
              <button key={n.id}
                style={nbStyle(page===n.id||(page==="edit"&&n.id==="products"))}
                onClick={()=>{ setPage(n.id); if(n.id!=="edit") setEditTarget(null); }}>
                <Ic n={n.icon} s={16}/>{n.label}
              </button>
            ))}
          </nav>

          <div style={{ padding:"14px 12px",borderTop:`1px solid ${T.border}` }}>
            <div style={{ display:"flex",alignItems:"center",gap:9,padding:"8px 10px",
              background:T.bg,borderRadius:8,marginBottom:8 }}>
              <div style={{ width:30,height:30,borderRadius:"50%",background:T.primary,
                display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0 }}>
                <Ic n="user" s={13}/>
              </div>
              <div>
                <div style={{ fontSize:13,fontWeight:700,color:T.text }}>{user}</div>
                <div style={{ fontSize:10,color:T.faint,textTransform:"uppercase",letterSpacing:".04em" }}>Administrator</div>
              </div>
            </div>
            <button onClick={()=>setUser(null)} style={{ ...nbStyle(false),color:T.red }}>
              <Ic n="out" s={15}/> Sign Out
            </button>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ padding:"13px 28px",borderBottom:`1px solid ${T.border}`,
            background:T.surface,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <div style={{ fontSize:12,color:T.faint }}>
              {loading
                ? <span style={{color:T.primary}}>● Syncing…</span>
                : <span>● {products.length} products loaded</span>}
            </div>
            <div style={{ fontSize:11,color:T.faint,letterSpacing:".06em",textTransform:"uppercase" }}>
              MySQL · products · DBMS Demo
            </div>
          </div>

          <div style={{ flex:1,overflowY:"auto",padding:"28px 32px" }}>
            {page==="dashboard" && <Dashboard products={products}/>}

            {page==="add" && (
              <div>
                <h2 style={{ fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px" }}>Add Product</h2>
                <p style={{ fontSize:13,color:T.muted,marginBottom:22,fontFamily:"'Fira Mono',monospace" }}>
                  INSERT INTO products (name, category, price, quantity) VALUES (…)
                </p>
                <div style={{ maxWidth:520,background:T.surface,
                  border:`1.5px solid ${T.border}`,borderRadius:12,padding:28 }}>
                  <ProductForm onSave={handleAdd} saving={saving}/>
                </div>
              </div>
            )}

            {page==="products" && (
              <ProductsTable
                products={products}
                onEdit={p=>{ setEditTarget(p); setPage("edit"); }}
                onDelete={p=>setDeleteTarget(p)}
              />
            )}

            {page==="edit" && editTarget && (
              <div>
                <h2 style={{ fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px" }}>Edit Product</h2>
                <p style={{ fontSize:13,color:T.muted,marginBottom:22,fontFamily:"'Fira Mono',monospace" }}>
                  UPDATE products SET … WHERE product_id = {editTarget.product_id}
                </p>
                <div style={{ maxWidth:520,background:T.surface,
                  border:`1.5px solid ${T.border}`,borderRadius:12,padding:28 }}>
                  <ProductForm
                    initial={editTarget}
                    onSave={handleUpdate}
                    onCancel={()=>{ setEditTarget(null); setPage("products"); }}
                    saving={saving}
                  />
                </div>
              </div>
            )}

            {page==="sql" && <SQLRunner onDbChanged={refresh}/>}
          </div>
        </div>
      </div>

      <DeleteModal target={deleteTarget} onConfirm={handleDelete} onCancel={()=>setDeleteTarget(null)}/>
      <Toast toasts={toasts}/>
    </>
  );
}
