document.addEventListener("DOMContentLoaded",()=>{

const SUPABASE_URL = "https://vnxuwohqxqtzsmicddui.supabase.co";
const SUPABASE_KEY = "sb_publishable_iq5jEx_erfmKhVaa5wAjJg_pxkbEWw7";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const id = location.hash.replace("#","") || crypto.randomUUID();
if(!location.hash) location.hash=id;

const saveBtn=document.getElementById("saveBtn");
const loadBtn=document.getElementById("loadBtn");
const qrBox=document.getElementById("qr");
const view=document.getElementById("view");

saveBtn.onclick=async()=>{
  const data={
    nickname:nickname.value,
    blood:blood.value,
    zodiac:zodiac.value,
    hot:hot.value,
    oshi:oshi.value,
    usage:usage.value,
    future:future.value,
    avatar_data:null
  };

  try{
    await db.rpc("upsert_profile",{p_id:id,p_pin:pin.value,p_data:data});
    alert("保存成功");
    render(data);
    makeQR();
  }catch(e){
    alert("PINエラーまたは保存失敗");
  }
};

loadBtn.onclick=async()=>{
  const {data,error}=await db.from("profiles").select("*").eq("id",id).single();
  if(data) render(data);
};

function render(d){
  view.innerHTML=`
  <h3>${d.nickname}</h3>
  <p>血液型: ${d.blood}</p>
  <p>星座: ${d.zodiac}</p>
  <p>最近ハマってる: ${d.hot}</p>
  <p>推し: ${d.oshi}</p>
  <p>用途: ${d.usage}</p>
  <p>今後やりたい: ${d.future}</p>
  `;
}

function makeQR(){
  qrBox.innerHTML="";
  new QRCode(qrBox,{
    text:location.href,
    width:150,
    height:150
  });
}

});