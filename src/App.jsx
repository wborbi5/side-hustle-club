import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase Client ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_CODES = {
  member: "222222",
  mentor: "333333",
  admin: "000000",
};

// --- Theme ---
const T = {
  bg: "#0B0B0F",
  bgCard: "#141418",
  bgHover: "#1C1C22",
  bgInput: "#18181D",
  border: "#2A2A32",
  red: "#E8364E",
  redGlow: "rgba(232,54,78,0.25)",
  redSoft: "rgba(232,54,78,0.10)",
  text: "#F1F1F3",
  textMuted: "#8A8A96",
  textDim: "#555564",
  white: "#FFFFFF",
  success: "#34D399",
  successGlow: "rgba(52,211,153,0.25)",
};

// --- Supabase Data Layer ---
// Convert between JS camelCase and Postgres snake_case
function profileToRow(p) {
  return {
    role: p.role, name: p.name, photo: p.photo || null,
    experience: p.experience || null, skills: p.skills || [],
    interests: p.interests || [], highlights: p.highlights || null,
    stage: p.stage || null, needs_help: p.needsHelp || null,
    project_name: p.projectName || null, project_desc: p.projectDesc || null,
    project_status: p.projectStatus || null, project_url: p.projectUrl || null,
    project_files: p.projectFiles || [], linkedin: p.linkedin || null,
    phone: p.phone || null, focus_area: p.focusArea || null,
    how_to_help: p.howToHelp || null, help_methods: p.helpMethods || [],
    contact_info: p.contactInfo || null,
    email: p.email?.toLowerCase() || null, user_id: p.userId || null,
  };
}
function rowToProfile(r) {
  return {
    id: r.id, role: r.role, name: r.name, photo: r.photo,
    experience: r.experience, skills: r.skills || [],
    interests: r.interests || [], highlights: r.highlights,
    stage: r.stage, needsHelp: r.needs_help,
    projectName: r.project_name, projectDesc: r.project_desc,
    projectStatus: r.project_status, projectUrl: r.project_url,
    projectFiles: r.project_files || [], linkedin: r.linkedin,
    phone: r.phone, focusArea: r.focus_area,
    howToHelp: r.how_to_help, helpMethods: r.help_methods || [],
    contactInfo: r.contact_info,
    email: r.email, userId: r.user_id,
    createdAt: new Date(r.created_at).getTime(),
  };
}
function rowToPost(r) {
  return { id: r.id, title: r.title, content: r.content, type: r.type, link: r.link, createdAt: new Date(r.created_at).getTime() };
}

// Role stored in localStorage between access code entry and auth
function getStoredRole() { try { return localStorage.getItem("shc-role"); } catch { return null; } }
function setStoredRole(r) { try { localStorage.setItem("shc-role", r); } catch {} }
function clearStoredRole() { try { localStorage.removeItem("shc-role"); } catch {} }

const db = {
  // --- Auth / Codes ---
  async validateCode(code) {
    const { data, error } = await supabase.rpc("validate_code", { input_code: code });
    if (error) { console.error("validate_code error:", error); return null; }
    return data; // role string or null
  },

  async getCodes() {
    const { data } = await supabase.from("access_codes").select("*");
    const codes = {};
    (data || []).forEach(r => { codes[r.role] = r.code; });
    return { ...DEFAULT_CODES, ...codes };
  },

  async updateCodes(codes) {
    for (const [role, code] of Object.entries(codes)) {
      await supabase.from("access_codes").update({ code, updated_at: new Date().toISOString() }).eq("role", role);
    }
  },

  // --- Supabase Auth ---
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async getAuthUser() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  },

  // --- Profiles ---
  async getProfileByUserId(userId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    if (error) { console.error("getProfileByUserId error:", error); return null; }
    return data ? rowToProfile(data) : null;
  },

  async getProfileByEmail(email) {
    const { data, error } = await supabase.from("profiles").select("*").eq("email", email.toLowerCase()).maybeSingle();
    if (error) { console.error("getProfileByEmail error:", error); return null; }
    return data ? rowToProfile(data) : null;
  },

  async claimProfile(profileId, userId) {
    // Link an admin-created profile to an auth user
    const { data, error } = await supabase.from("profiles").update({ user_id: userId }).eq("id", profileId).select().single();
    if (error) throw error;
    return rowToProfile(data);
  },
  async getProfiles(role) {
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (role) query = query.eq("role", role);
    const { data } = await query;
    return (data || []).map(rowToProfile);
  },

  async getProfile(id) {
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
    return data ? rowToProfile(data) : null;
  },

  async createProfile(profileData) {
    const row = profileToRow(profileData);
    const { data, error } = await supabase.from("profiles").insert(row).select().single();
    if (error) { console.error("createProfile error:", error); throw error; }
    return rowToProfile(data);
  },

  async updateProfile(id, updates) {
    const row = profileToRow(updates);
    delete row.role; // never change role
    const { data, error } = await supabase.from("profiles").update(row).eq("id", id).select().single();
    if (error) { console.error("updateProfile error:", error); throw error; }
    return rowToProfile(data);
  },

  async deleteProfile(id) {
    await supabase.from("profiles").delete().eq("id", id);
  },

  // --- Posts ---
  async getPosts() {
    const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    return (data || []).map(rowToPost);
  },

  async createPost(post) {
    const { data, error } = await supabase.from("posts").insert({
      title: post.title, content: post.content, type: post.type, link: post.link || null,
    }).select().single();
    if (error) { console.error("createPost error:", error); throw error; }
    return rowToPost(data);
  },

  async deletePost(id) {
    await supabase.from("posts").delete().eq("id", id);
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function compressImage(file, maxW = 200, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxW / img.width, maxW / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Styles ---
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:${T.bg}; color:${T.text}; font-family:'Inter',sans-serif; overflow-x:hidden; }
  ::-webkit-scrollbar { width:6px; }
  ::-webkit-scrollbar-track { background:${T.bg}; }
  ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:3px; }
  ::selection { background:${T.red}44; color:${T.white}; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
  @keyframes slideIn { from{opacity:0;transform:translateX(-16px)} to{opacity:1;transform:translateX(0)} }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
  @keyframes glow { 0%,100%{box-shadow:0 0 20px ${T.redGlow}} 50%{box-shadow:0 0 40px ${T.redGlow}} }
  @keyframes scaleIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
  @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

  .shake { animation: shake 0.4s ease; }
  input:focus, textarea:focus { outline:none; }

  /* Landing  physics handles motion; CSS only for reveals */
  @keyframes codeSlotIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes textReveal { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes caretBlink { 0%,100%{opacity:0} 50%{opacity:0.8} }
  @keyframes screenWipe { 0%{opacity:0} 60%{opacity:0} 100%{opacity:1} }
`;

const ARROW_IMG = "data:image/png;base64,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";

// --- Shared UI Components ---
function Logo({ size = 32 }) {
  return <img src={ARROW_IMG} alt="SHC" style={{ width: size, height: size, objectFit: "contain" }} />;
}

function ArrowDecor({ style }) {
  return <div style={{ position: "absolute", opacity: 0.04, ...style }}><Logo size={300} /></div>;
}

const inputStyle = {
  width: "100%", padding: "12px 16px", borderRadius: 10,
  background: T.bgInput, border: `1.5px solid ${T.border}`,
  color: T.text, fontSize: 14, fontFamily: "Inter",
  transition: "border-color 0.2s ease",
};
const inputFocusStyle = { borderColor: T.red + "88" };

function Input({ label, placeholder, value, onChange, type = "text", textarea, optional }) {
  const [focused, setFocused] = useState(false);
  const props = {
    placeholder, value, onChange: e => onChange(e.target.value),
    onFocus: () => setFocused(true), onBlur: () => setFocused(false),
    style: { ...inputStyle, ...(focused ? inputFocusStyle : {}), ...(textarea ? { minHeight: 80, resize: "vertical" } : {}) },
  };
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
          {label} {optional && <span style={{ fontWeight: 400, color: T.textDim }}>(optional)</span>}
        </label>
      )}
      {textarea ? <textarea {...props} /> : <input type={type} {...props} />}
    </div>
  );
}

function TagInput({ label, tags, onChange, placeholder, suggestions }) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const add = (t) => {
    const trimmed = t.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setInput("");
  };
  const remove = (i) => onChange(tags.filter((_, idx) => idx !== i));
  const handleKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && tags.length) remove(tags.length - 1);
  };
  const filteredSugs = suggestions?.filter(s => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase())).slice(0, 5);

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>{label}</label>
      <div style={{
        ...inputStyle, display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px", minHeight: 46,
        ...(focused ? inputFocusStyle : {}), position: "relative",
      }}>
        {tags.map((tag, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: T.redSoft, color: T.red, border: `1px solid ${T.red}22`,
            animation: "scaleIn 0.15s ease",
          }}>
            {tag}
            <span onClick={() => remove(i)} style={{ cursor: "pointer", opacity: 0.6, fontSize: 14, lineHeight: 1 }}>×</span>
          </span>
        ))}
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length ? "" : placeholder}
          style={{
            flex: 1, minWidth: 80, background: "none", border: "none",
            color: T.text, fontSize: 13, fontFamily: "Inter", outline: "none",
          }}
        />
      </div>
      {focused && filteredSugs?.length > 0 && (
        <div style={{
          marginTop: 4, background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 8, overflow: "hidden", animation: "slideUp 0.15s ease",
        }}>
          {filteredSugs.map(s => (
            <div key={s} onMouseDown={() => add(s)} style={{
              padding: "8px 14px", fontSize: 13, color: T.textMuted, cursor: "pointer", transition: "all 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgHover; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMuted; }}
            >{s}</div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Press Enter or comma to add</p>
    </div>
  );
}

function SelectInput({ label, value, onChange, options }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          ...inputStyle, ...(focused ? inputFocusStyle : {}),
          cursor: "pointer", appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A8A96' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center",
        }}>
        <option value="" style={{ background: T.bgInput }}>Select...</option>
        {options.map(o => <option key={o} value={o} style={{ background: T.bgInput }}>{o}</option>)}
      </select>
    </div>
  );
}

function PhotoUpload({ photo, onUpload }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const handleFile = async (file) => {
    if (!file?.type.startsWith("image/")) return;
    const compressed = await compressImage(file, 200, 0.7);
    onUpload(compressed);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
      <div onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        style={{
          width: 110, height: 110, borderRadius: "50%",
          background: photo ? `url(${photo}) center/cover` : T.bgInput,
          border: `2.5px dashed ${dragging ? T.red : T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all 0.2s ease",
          boxShadow: photo ? `0 0 24px ${T.redGlow}` : "none",
          position: "relative", overflow: "hidden",
        }}>
        {!photo && (
          <div style={{ textAlign: "center", color: T.textDim }}>
            <div style={{ fontSize: 28, marginBottom: 2 }}>+</div>
            <div style={{ fontSize: 10 }}>Upload</div>
          </div>
        )}
        {photo && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0, transition: "opacity 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0}>
            <span style={{ color: T.white, fontSize: 12, fontWeight: 600 }}>Change</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => handleFile(e.target.files[0])} />
      <p style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>Click or drag to upload</p>
    </div>
  );
}

// --- Project Files Upload ---
function ProjectFilesUpload({ files, onChange }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (fileList) => {
    const newFiles = [];
    for (const file of Array.from(fileList)) {
      if (files.length + newFiles.length >= 6) break;
      if (file.type.startsWith("image/")) {
        const compressed = await compressImage(file, 400, 0.65);
        newFiles.push({ id: uid(), type: "image", data: compressed, name: file.name, caption: "" });
      } else if (file.size < 500000) {
        const reader = new FileReader();
        const dataUrl = await new Promise(res => { reader.onload = e => res(e.target.result); reader.readAsDataURL(file); });
        newFiles.push({ id: uid(), type: "file", data: dataUrl, name: file.name, caption: "", fileType: file.name.split(".").pop()?.toUpperCase() || "FILE" });
      }
    }
    onChange([...files, ...newFiles]);
  };

  const removeFile = (id) => onChange(files.filter(f => f.id !== id));
  const updateCaption = (id, caption) => onChange(files.map(f => f.id === id ? { ...f, caption } : f));

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>
        Project Files <span style={{ fontWeight: 400, color: T.textDim }}>(up to 6 · screenshots, mockups, demos)</span>
      </label>

      {/* Uploaded files grid */}
      {files.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
          {files.map((f) => (
            <div key={f.id} style={{
              borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden",
              background: T.bgInput, animation: "scaleIn 0.2s ease", position: "relative",
            }}>
              {f.type === "image" ? (
                <div style={{ width: "100%", height: 100, background: `url(${f.data}) center/cover`, borderBottom: `1px solid ${T.border}` }} />
              ) : (
                <div style={{
                  width: "100%", height: 100, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${T.border}`,
                  background: T.bgHover,
                }}>
                  <span style={{ fontSize: 24, marginBottom: 4 }}>📄</span>
                  <span style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: "0.05em" }}>{f.fileType}</span>
                </div>
              )}
              {/* Remove button */}
              <button onClick={() => removeFile(f.id)} style={{
                position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%",
                background: "rgba(0,0,0,0.7)", border: "none", color: T.white, fontSize: 12,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.red}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}>×</button>
              {/* Caption */}
              <div style={{ padding: "6px 8px" }}>
                <p style={{ fontSize: 10, color: T.textDim, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</p>
                <input value={f.caption} onChange={e => updateCaption(f.id, e.target.value)}
                  placeholder="Add caption..."
                  style={{
                    width: "100%", background: "none", border: "none", borderBottom: `1px solid ${T.border}`,
                    color: T.text, fontSize: 11, fontFamily: "Inter", padding: "2px 0",
                    outline: "none",
                  }}
                  onFocus={e => e.currentTarget.style.borderBottomColor = T.red + "88"}
                  onBlur={e => e.currentTarget.style.borderBottomColor = T.border}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {files.length < 6 && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          style={{
            padding: 24, borderRadius: 12,
            border: `2px dashed ${dragging ? T.red : T.border}`,
            background: dragging ? T.redSoft : T.bgInput,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.2s ease",
            gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.red + "66"; e.currentTarget.style.background = T.bgHover; }}
          onMouseLeave={e => { if (!dragging) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bgInput; } }}
        >
          <span style={{ fontSize: 24 }}>📁</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.textMuted }}>
            {files.length === 0 ? "Upload screenshots, mockups, or files" : "Add more files"}
          </span>
          <span style={{ fontSize: 11, color: T.textDim }}>Click or drag · Images & docs · {6 - files.length} remaining</span>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.pptx,.txt" multiple style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)} />
    </div>
  );
}

// --- Suggestions ---
const SKILL_SUGGESTIONS = [
  "JavaScript","Python","React","Node.js","UI/UX Design","Marketing",
  "Sales","Finance","Data Analysis","Machine Learning","Mobile Dev",
  "iOS","Android","Product Management","Copywriting","SEO",
  "Video Editing","Graphic Design","Public Speaking","Leadership",
  "Fundraising","Operations","Project Management","3D Modeling",
  "Content Creation","Social Media","Branding","Web Design",
  "TypeScript","SQL","AWS","No-Code","Figma","Photoshop",
];
const INTEREST_SUGGESTIONS = [
  "AI/ML","FinTech","EdTech","HealthTech","E-commerce","SaaS",
  "Consumer Apps","Social Impact","Sustainability","Gaming",
  "Creator Economy","Web3","Real Estate","Food & Bev",
  "Fashion","Media","Music","Sports","Travel","Automation",
];
const STAGE_OPTIONS = [
  "Just exploring ideas","Validating a concept","Building an MVP",
  "Launched & getting users","Scaling / growing","Looking for my next thing",
];
const FOCUS_AREAS = [
  "Technical (Engineering / Dev)","Business / Strategy","Design / UX",
  "Marketing / Growth","Finance / Fundraising","Operations / Ops",
  "Product Management","General Mentorship",
];
const HELP_METHODS = [
  "1-on-1 calls","Async feedback","Office hours",
  "Project reviews","Workshops","Introductions / networking",
];

// --- Onboarding Flow ---
function Onboarding({ role, onComplete }) {
  const isMember = role === "member";
  const totalSteps = isMember ? 4 : 3;
  const [step, setStep] = useState(0);
  const [data, setData] = useState(
    isMember
      ? { photo:"",name:"",experience:"",skills:[],interests:[],highlights:"",stage:"",needsHelp:"",projectName:"",projectDesc:"",projectStatus:"",projectFiles:[],projectUrl:"",linkedin:"",phone:"" }
      : { photo:"",name:"",skills:[],focusArea:"",experience:"",helpMethods:[],contactInfo:"",howToHelp:"",phone:"" }
  );

  const up = (field, val) => setData(prev => ({ ...prev, [field]: val }));
  const next = () => step < totalSteps - 1 ? setStep(step + 1) : finish();
  const back = () => step > 0 && setStep(step - 1);

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");

  const finish = async () => {
    setFinishing(true);
    setFinishError("");
    try {
      const authUser = await db.getAuthUser();
      if (!authUser) {
        setFinishError("Session expired. Please go back and log in again.");
        setFinishing(false);
        return;
      }
      const email = authUser.email || "";
      // Check if admin pre-created a profile with this email
      const existing = email ? await db.getProfileByEmail(email) : null;
      if (existing && !existing.userId) {
        // Claim the admin-created profile and merge onboarding data
        const merged = { ...existing, ...data, role: existing.role, email, userId: authUser.id };
        const profile = await db.updateProfile(existing.id, merged);
        await db.claimProfile(existing.id, authUser.id);
        onComplete(profile);
      } else {
        // Create brand new profile
        const profile = await db.createProfile({ role, ...data, email, userId: authUser.id });
        onComplete(profile);
      }
    } catch (e) {
      console.error("Finish onboarding error:", e);
      setFinishError(e.message || "Something went wrong. Try again.");
      setFinishing(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return data.name.trim().length >= 2;
    return true;
  };

  const memberSteps = [
    {
      title: "Let's get you set up", subtitle: "This takes about 60 seconds. No pressure.", emoji: "👋",
      content: (<>
        <PhotoUpload photo={data.photo} onUpload={v => up("photo", v)} />
        <Input label="Your name" placeholder="What should people call you?" value={data.name} onChange={v => up("name", v)} />
        <Input label="Brief experience" placeholder="e.g. CS sophomore, built 2 side projects" value={data.experience} onChange={v => up("experience", v)} optional />
      </>),
    },
    {
      title: "What do you bring to the table?", subtitle: "These help other members find you.", emoji: "⚡",
      content: (<>
        <TagInput label="Skills" tags={data.skills} onChange={v => up("skills", v)} placeholder="Type a skill..." suggestions={SKILL_SUGGESTIONS} />
        <TagInput label="Interests" tags={data.interests} onChange={v => up("interests", v)} placeholder="What excites you?" suggestions={INTEREST_SUGGESTIONS} />
      </>),
    },
    {
      title: "Where are you at right now?", subtitle: "Helps mentors understand how to help you.", emoji: "🚀",
      content: (<>
        <SelectInput label="What stage are you in?" value={data.stage} onChange={v => up("stage", v)} options={STAGE_OPTIONS} />
        <Input label="What do you need help with?" textarea placeholder="e.g. Need a co-founder, looking for feedback on my landing page..." value={data.needsHelp} onChange={v => up("needsHelp", v)} />
      </>),
    },
    {
 title: "Show off a little", subtitle: "Totally optional — fill in what you want.", emoji: "✨",
      content: (<>
        <div style={{ padding:16, borderRadius:12, background:T.bgHover, border:`1px solid ${T.border}`, marginBottom:16 }}>
          <p style={{ fontSize:13, fontWeight:600, color:T.textMuted, marginBottom:12 }}>Project Spotlight</p>
          <Input label="Project name" placeholder="What are you building?" value={data.projectName} onChange={v => up("projectName", v)} optional />
          <Input label="Quick description" placeholder="One sentence about what it does" value={data.projectDesc} onChange={v => up("projectDesc", v)} optional />
          <SelectInput label="Project status" value={data.projectStatus} onChange={v => up("projectStatus", v)} options={["Idea stage","Building MVP","Live / Launched","Growing"]} />
          <Input label="Project URL" placeholder="https://yourproject.com" value={data.projectUrl||""} onChange={v => up("projectUrl", v)} optional />
          <ProjectFilesUpload files={data.projectFiles||[]} onChange={v => up("projectFiles", v)} />
        </div>
        <Input label="Highlights" textarea placeholder="Awards, achievements, cool stuff..." value={data.highlights} onChange={v => up("highlights", v)} optional />
        <Input label="LinkedIn profile URL" placeholder="https://linkedin.com/in/yourname" value={data.linkedin} onChange={v => up("linkedin", v)} optional />
        <Input label="Phone number" placeholder="(555) 123-4567" value={data.phone} onChange={v => up("phone", v)} optional />
      </>),
    },
  ];

  const mentorSteps = [
    {
      title: "Welcome, mentor!", subtitle: "Let's set up your profile so members can find you.", emoji: "🌟",
      content: (<>
        <PhotoUpload photo={data.photo} onUpload={v => up("photo", v)} />
        <Input label="Your name" placeholder="Full name" value={data.name} onChange={v => up("name", v)} />
        <Input label="Experience / Credentials" textarea placeholder="e.g. 10 years in product, founded 2 startups..." value={data.experience} onChange={v => up("experience", v)} />
      </>),
    },
    {
      title: "Your expertise", subtitle: "Help members find the right mentor.", emoji: "🎯",
      content: (<>
        <TagInput label="Skills & Expertise" tags={data.skills} onChange={v => up("skills", v)} placeholder="What are you great at?" suggestions={SKILL_SUGGESTIONS} />
        <SelectInput label="Primary area of focus" value={data.focusArea} onChange={v => up("focusArea", v)} options={FOCUS_AREAS} />
      </>),
    },
    {
      title: "How you want to help", subtitle: "Set expectations so members reach out the right way.", emoji: "🤝",
      content: (<>
        <Input label="How do you want to help?" textarea placeholder="e.g. I can review pitch decks, advise on go-to-market..." value={data.howToHelp} onChange={v => up("howToHelp", v)} />
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:600, color:T.textMuted, marginBottom:8 }}>Preferred methods</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {HELP_METHODS.map(m => {
              const sel = data.helpMethods?.includes(m);
              return (
                <button key={m} onClick={() => up("helpMethods", sel ? data.helpMethods.filter(x=>x!==m) : [...(data.helpMethods||[]),m])}
                  style={{
                    padding:"7px 14px", borderRadius:8, fontSize:13, fontFamily:"Inter",
                    border:`1.5px solid ${sel?T.red:T.border}`, background:sel?T.redSoft:"transparent",
                    color:sel?T.red:T.textMuted, cursor:"pointer", transition:"all 0.15s", fontWeight:sel?600:400,
                  }}>{m}</button>
              );
            })}
          </div>
        </div>
        <Input label="Best way to reach you" placeholder="e.g. email@example.com, Slack, etc." value={data.contactInfo} onChange={v => up("contactInfo", v)} />
        <Input label="Phone number" placeholder="(555) 123-4567" value={data.phone} onChange={v => up("phone", v)} optional />
      </>),
    },
  ];

  const steps = isMember ? memberSteps : mentorSteps;
  const current = steps[step];
  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24, position:"relative", overflow:"hidden" }}>
      <ArrowDecor style={{ top:-100, right:-120, transform:"rotate(12deg)" }} />
      <div style={{ width:"100%", maxWidth:520, animation:"fadeUp 0.4s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
          <div style={{ flex:1, height:4, borderRadius:4, background:T.border, overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:4, background:T.red, width:`${progress}%`, transition:"width 0.4s ease" }} />
          </div>
          <span style={{ fontSize:12, color:T.textDim, fontWeight:600, whiteSpace:"nowrap" }}>{step+1} / {totalSteps}</span>
        </div>
        <div key={step} style={{ background:T.bgCard, borderRadius:20, padding:"36px 32px", border:`1px solid ${T.border}`, animation:"fadeUp 0.35s ease" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>{current.emoji}</div>
          <h2 style={{ fontFamily:"DM Serif Display, serif", fontSize:26, fontWeight:400, letterSpacing:"-0.01em", marginBottom:6 }}>{current.title}</h2>
          <p style={{ color:T.textMuted, fontSize:14, marginBottom:28, lineHeight:1.5 }}>{current.subtitle}</p>
          {current.content}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:24 }}>
            {step > 0 ? (
              <button onClick={back} style={{
                padding:"10px 20px", borderRadius:10, fontSize:14, fontFamily:"Inter", fontWeight:500,
                background:"transparent", border:`1.5px solid ${T.border}`, color:T.textMuted, cursor:"pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor=T.textDim}
              onMouseLeave={e => e.currentTarget.style.borderColor=T.border}>← Back</button>
            ) : <div />}
            <button onClick={next} disabled={!canProceed()||finishing} style={{
              padding:"10px 28px", borderRadius:10, fontSize:14, fontFamily:"Inter", fontWeight:700,
              background:(canProceed()&&!finishing)?T.red:T.border, color:(canProceed()&&!finishing)?T.white:T.textDim,
              border:"none", cursor:(canProceed()&&!finishing)?"pointer":"default",
              boxShadow:(canProceed()&&!finishing)?`0 0 20px ${T.redGlow}`:"none", transition:"all 0.2s ease",
              opacity:finishing?0.7:1,
            }}
            onMouseEnter={e => { if(canProceed()&&!finishing) e.currentTarget.style.transform="scale(1.03)"; }}
            onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}
 >{finishing?"Creating...":(step===totalSteps-1?"Launch Profile ":"Continue →")}</button>
          </div>
          {finishError && (
            <div style={{
              marginTop:14, padding:"10px 14px", borderRadius:10, fontSize:13,
              background:T.red+"12", color:T.red, border:`1px solid ${T.red}22`,
              animation:"scaleIn 0.2s ease", textAlign:"center",
            }}>{finishError}</div>
          )}
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:20 }}>
          {Array.from({length:totalSteps}).map((_,i) => (
            <div key={i} style={{ width:i===step?24:8, height:8, borderRadius:4, background:i<=step?T.red:T.border, transition:"all 0.3s ease" }} />
          ))}
        </div>
      </div>
    </div>
  );
}



// --- Spring Physics Engine ---
function useSpringStripes(phase, filledCount, error, successFlag) {
  const svgRef = useRef(null);
  const stripeRefs = useRef([]);
  const glowRef = useRef(null);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const frameRef = useRef(0);
  const COUNT = 1;
  const BASE_OP = [1.0];
  const CX_MAP = [50];
  const CY_MAP = [50];
  const stateRef = useRef(
    Array(COUNT).fill(null).map((_, i) => ({
      x: 0, y: 0, vx: 0, vy: 0,
      opacity: 0,
      targetOpacity: BASE_OP[i],
      driftPhase: Math.random() * Math.PI * 2,
      driftFreqX: 0.12 + i * 0.025 + Math.random() * 0.06,
      driftFreqY: 0.10 + i * 0.02 + Math.random() * 0.05,
      driftAmpX: 1 + Math.random() * 1.5,
      driftAmpY: 0.7 + Math.random() * 1,
      scattered: false,
    }))
  );
  const phaseRef = useRef(phase);
  const filledRef = useRef(filledCount);
  const errorRef = useRef(error);
  const successRef = useRef(successFlag);
  const timeRef = useRef(0);

  phaseRef.current = phase;
  filledRef.current = filledCount;
  errorRef.current = error;
  successRef.current = successFlag;

  useEffect(() => {
    const onMove = (e) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (phase === "launching") {
      const angles = [-0.5];
      stateRef.current.forEach((s, i) => {
        const angle = angles[i] + (Math.random() - 0.5) * 0.3;
        const speed = (14 + Math.random() * 12) * 0.6; // 40% slower
        s.vx += Math.cos(angle) * speed;
        s.vy += Math.sin(angle) * speed - 12;
        s.scattered = true;
      });
    }
  }, [phase]);

  useEffect(() => {
    let running = true;
    const STIFF = 0.045, DAMP = 0.88, M_RAD = 180, M_FORCE = 0.8;

    const tick = () => {
      if (!running) return;
      timeRef.current += 0.016;
      const t = timeRef.current;
      const p = phaseRef.current;
      const filled = filledRef.current;
      const err = errorRef.current;
      const success = successRef.current;
      const svg = svgRef.current;
      if (!svg) { frameRef.current = requestAnimationFrame(tick); return; }

      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const scale = rect.width / 100;

      stateRef.current.forEach((s, i) => {
        const el = stripeRefs.current[i];
        if (!el) return;
        const isArrow = true;
        const baseOp = BASE_OP[i];

        if (s.scattered) {
          s.targetOpacity = Math.max(0, s.opacity - 0.015);
        } else if (success) {
          s.targetOpacity = 1;
        } else if (err) {
          s.targetOpacity = isArrow ? 0.25 : 0.06;
        } else if (p === "entering" || p === "checking") {
          const progress = filled / 6;
          const threshold = (i + 1) / COUNT;
          s.targetOpacity = progress >= threshold ? (isArrow ? 1 : Math.min(1, baseOp + 0.5)) : baseOp * 0.25;
        } else {
          s.targetOpacity = baseOp;
        }
        s.opacity += (s.targetOpacity - s.opacity) * (s.scattered ? 1 : 0.1);
        if (t < 2.5) s.opacity = Math.min(s.opacity, Math.max(0, (t - 0.15 - i * 0.09) / 0.5) * baseOp);

        if (s.scattered) {
          s.x += s.vx; s.y += s.vy;
          s.vx *= 0.97; s.vy *= 0.97; s.vy += 0.06;
        } else {
          let tx = 0, ty = 0;
          if (p === "idle" || p === "entering" || p === "checking") {
            tx += Math.sin(t * s.driftFreqX + s.driftPhase) * s.driftAmpX;
            ty += Math.cos(t * s.driftFreqY + s.driftPhase * 0.7) * s.driftAmpY;
          }
          if (p === "entering" || p === "checking") {
            tx += 0;
            ty -= 3;
          }
          if (err) {
            const shakeT = t * 40;
            tx += Math.sin(shakeT + i * 1.2) * 3 * Math.max(0, 1 - (t % 1) * 2);
          }
          if (success) { tx = 0; ty = 0; }

          if (p !== "success" && !success) {
            const scx = cx + (CX_MAP[i] - 50) * scale + s.x * scale;
            const scy = cy + (CY_MAP[i] - 50) * scale + s.y * scale;
            const dx = scx - mouse.current.x;
            const dy = scy - mouse.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < M_RAD && dist > 1) {
              const force = M_FORCE * (1 - dist / M_RAD) * (1 - dist / M_RAD);
              const depth = 1.0;
              tx += (dx / dist) * force * 8 * depth;
              ty += (dy / dist) * force * 6 * depth;
            }
          }
          const ax = (tx - s.x) * STIFF;
          const ay = (ty - s.y) * STIFF;
          s.vx = (s.vx + ax) * DAMP;
          s.vy = (s.vy + ay) * DAMP;
          s.x += s.vx; s.y += s.vy;
        }

        const rot = s.scattered ? (s.vx * 2) : 0;
        el.setAttribute("transform", `translate(${s.x.toFixed(2)}, ${s.y.toFixed(2)}) rotate(${rot.toFixed(1)} 50 50)`);
        el.setAttribute("opacity", Math.max(0, s.opacity).toFixed(3));
        const child = el.firstElementChild;
        if (child) child.style.filter = success && !s.scattered ? "brightness(10) saturate(0)" : "none";
      });

      if (glowRef.current) {
        const glowOp = success ? 0.25 : (p === "entering" ? 0.04 + (filled / 6) * 0.08 : 0.03);
        glowRef.current.style.opacity = glowOp.toFixed(3);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
  }, []);

  return { svgRef, stripeRefs, glowRef };
}

// --- Landing + Access: The Arrow IS the Interface ---
function LandingPage({ onSuccess }) {
  const [phase, setPhase] = useState("idle");
  const [code, setCode] = useState(["","","","","",""]);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [successRole, setSuccessRole] = useState(null);
  const inputsRef = useRef([]);
  const triedRef = useRef(false);

  const filled = code.filter(d => d).length;
  const isEntering = phase === "entering" || phase === "checking";
  const isSuccess = phase === "success" || phase === "launching";
  const isLaunching = phase === "launching";

  const { svgRef, stripeRefs, glowRef } = useSpringStripes(
    phase, filled, error, isSuccess
  );

  // Ready after mount
  useEffect(() => { setTimeout(() => setReady(true), 50); }, []);

  // Focus first input
  useEffect(() => {
    if (phase === "entering") setTimeout(() => inputsRef.current[0]?.focus(), 300);
  }, [phase]);

  // Validate code
  useEffect(() => {
    const entered = code.join("");
    if (entered.length < 6 || triedRef.current) return;
    triedRef.current = true;
    setPhase("checking");

    (async () => {
      const role = await db.validateCode(entered);

      if (role) {
        setSuccessRole(role);
        setPhase("success");
        setTimeout(() => setPhase("launching"), 500);
        setTimeout(() => onSuccess(role), 1600);
      } else {
        setError(true);
        setPhase("entering");
        setTimeout(() => {
          setError(false);
          setCode(["","","","","",""]);
          triedRef.current = false;
          inputsRef.current[0]?.focus();
        }, 500);
      }
    })();
  }, [code, onSuccess]);

  const handleDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code]; next[i] = val; setCode(next);
    triedRef.current = false;
    if (val && i < 5) inputsRef.current[i + 1]?.focus();
  };
  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === "Escape" && phase === "entering") {
      setPhase("idle"); setCode(["","","","","",""]); triedRef.current = false;
    }
  };
  const handlePaste = (e) => {
    e.preventDefault();
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) { setCode(p.split("")); inputsRef.current[5]?.focus(); }
  };

  // Arrow image used in landing

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: T.bg, overflow: "hidden",
      userSelect: "none",
    }}>

      {/* Grain */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        opacity: 0.02, mixBlendMode: "overlay", pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "150px 150px",
      }} />

      {/* Radial glow */}
      <div ref={glowRef} style={{
        position: "absolute", zIndex: 1,
        width: "50vmin", height: "50vmin",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${T.red} 0%, transparent 55%)`,
        filter: "blur(60px)",
        opacity: 0.03,
        pointerEvents: "none",
        transition: "opacity 0.3s ease",
      }} />

      {/* ===== THE ARROW ===== */}
      <div style={{
        position: "relative", zIndex: 10,
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <div
          onClick={() => phase === "idle" && setPhase("entering")}
          style={{
            width: "clamp(280px, 50vmin, 520px)",
            height: "clamp(280px, 50vmin, 520px)",
            cursor: phase === "idle" ? "pointer" : "default",
          }}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            fill="none"
            style={{ width: "100%", height: "100%", overflow: "visible" }}
          >
            <g ref={ref => stripeRefs.current[0] = ref} opacity="0">
              <image href={ARROW_IMG} x="5" y="5" width="90" height="90" />
            </g>
          </svg>
        </div>

        {/* Name + tagline */}
        {!isLaunching && (
          <div style={{
            textAlign: "center",
            marginTop: isEntering ? 20 : 28,
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(12px)",
            transition: "all 0.6s cubic-bezier(0.16,1,0.3,1) 1.8s, margin 0.4s ease",
          }}>
            <h1 style={{
              fontFamily: "DM Serif Display, serif",
              fontSize: "clamp(18px, 3vw, 32px)",
              fontWeight: 800,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: isSuccess ? T.white : T.text,
              transition: "color 0.3s ease",
              lineHeight: 1.2,
            }}>
              Side Hustle Club
            </h1>
            <p style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "clamp(12px, 1.3vw, 15px)",
              color: T.textMuted,
              marginTop: 10,
              fontWeight: 400,
              letterSpacing: "0.02em",
              opacity: isEntering ? 0.5 : 0.7,
              transition: "opacity 0.4s ease",
            }}>
              The group of student entrepreneurs building real projects.
            </p>
          </div>
        )}

        {/* Enter button  idle only */}
        {phase === "idle" && (
          <button
            onClick={() => setPhase("entering")}
            style={{
              marginTop: 32,
              fontFamily: "DM Serif Display, serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: T.red,
              background: "none",
              border: `1px solid ${T.red}18`,
              padding: "10px 30px",
              borderRadius: 100,
              cursor: "pointer",
              opacity: ready ? 1 : 0,
              transform: ready ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.5s ease 2.2s, transform 0.5s cubic-bezier(0.16,1,0.3,1) 2.2s, border-color 0.2s, background 0.2s, color 0.2s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = T.red + "44";
              e.currentTarget.style.background = T.red + "08";
              e.currentTarget.style.color = T.white;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = T.red + "18";
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = T.red;
            }}
          >
            get involved
          </button>
        )}

        {/* Code input */}
        {(isEntering || (isSuccess && !isLaunching)) && (
          <div style={{
            marginTop: 24,
            display: "flex", flexDirection: "column", alignItems: "center",
            opacity: isSuccess ? 1 : 1,
            transition: "opacity 0.3s ease",
          }}>
            <div style={{ display: "flex", gap: 8 }}>
              {code.map((d, i) => (
                <div key={i} style={{
                  position: "relative",
                  opacity: 0,
                  animation: `codeSlotIn 0.35s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.04}s forwards`,
                }}>
                  <input
                    ref={el => inputsRef.current[i] = el}
                    type="text" inputMode="numeric" maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKey(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    disabled={isSuccess}
                    style={{
                      width: 36, height: 44,
                      textAlign: "center",
                      fontSize: 18, fontFamily: "DM Serif Display, serif", fontWeight: 400,
                      background: isSuccess ? "rgba(74, 222, 128, 0.08)" : "transparent",
                      border: "none",
                      borderBottom: `2px solid ${
                        isSuccess ? "#4ade80"
                        : error ? T.red + "33"
                        : d ? T.red
                        : T.border + "88"
                      }`,
                      color: isSuccess ? "#4ade80" : T.text,
                      borderRadius: 0,
                      transition: "all 0.3s ease",
                      caretColor: "transparent",
                      boxShadow: isSuccess ? "0 4px 16px rgba(74, 222, 128, 0.2)" : "none",
                    }}
                  />
                  {/* Caret */}
                  {!d && phase === "entering" && i === filled && (
                    <div style={{
                      position: "absolute", bottom: 7, left: "50%",
                      width: 1.5, height: 16,
                      background: T.red,
                      transform: "translateX(-50%)",
                      animation: "caretBlink 0.9s ease infinite",
                    }} />
                  )}
                </div>
              ))}
            </div>

            {/* Error text */}
            {error && (
              <p style={{
                marginTop: 12,
                fontFamily: "DM Serif Display, serif",
                fontSize: 9, fontWeight: 600,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: T.red,
                opacity: 0.7,
                animation: "fadeIn 0.15s ease",
              }}>wrong code</p>
            )}

            {/* Hint */}
            {phase === "entering" && !error && filled === 0 && (
              <p style={{
                marginTop: 14,
                fontSize: 9,
                color: T.textMuted,
                letterSpacing: "0.1em",
                opacity: 0,
                animation: "textReveal 0.4s ease 0.5s forwards",
              }}>access code</p>
            )}
          </div>
        )}
      </div>

      {/* Screen transition wipe */}
      {isLaunching && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: T.bg,
          animation: "screenWipe 1.4s ease forwards",
          pointerEvents: "none",
        }} />
      )}

      {/* Corner: bottom left */}
      <div style={{
        position: "absolute", bottom: 22, left: 26,
        display: "flex", alignItems: "center", gap: 6,
        opacity: ready && !isLaunching ? 0.15 : 0,
        transition: "opacity 0.6s ease 2.5s",
        zIndex: 2,
      }}>
        <Logo size={11} />
        <span style={{
          fontFamily: "DM Serif Display, serif",
          fontSize: 8, fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: T.textDim,
        }}>2026</span>
      </div>

      {/* Corner: bottom right */}
      <div style={{
        position: "absolute", bottom: 22, right: 26,
        opacity: ready && !isLaunching ? 0.12 : 0,
        transition: "opacity 0.6s ease 2.8s",
        zIndex: 2,
      }}>
        <span style={{
          fontFamily: "Inter, sans-serif",
          fontStyle: "italic",
          fontSize: 10,
          color: T.textDim,
        }}>let's do something cool today</span>
      </div>
    </div>
  );
}

// --- Sidebar ---
const NAV_ITEMS = [
  { id:"dashboard", label:"Dashboard", icon:"◉" },
  { id:"members", label:"Members", icon:"○" },
  { id:"mentors", label:"Mentors", icon:"★" },
  { id:"resources", label:"Resources", icon:"◈" },
  { id:"myprofile", label:"My Profile", icon:"◉" },
];
const ADMIN_NAV = [{ id:"admin", label:"Admin Panel", icon:"⚙" }];

function Sidebar({ active, onNav, role, onLogout, profileName }) {
  const items = role === "admin" ? [...NAV_ITEMS, ...ADMIN_NAV] : NAV_ITEMS;
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{
      width:"100%", height:56, background:T.bgCard,
      borderBottom:`1px solid ${T.border}`,
      display:"flex", alignItems:"center",
      padding:"0 24px", gap:0,
      position:"sticky", top:0, zIndex:100,
      backdropFilter:"blur(16px)",
      WebkitBackdropFilter:"blur(16px)",
      animation:"fadeIn 0.4s ease",
    }}>
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:9, marginRight:36, flexShrink:0 }}>
        <Logo size={22} />
        <span style={{ fontFamily:"DM Serif Display, serif", fontWeight:400, fontSize:15, letterSpacing:"-0.02em", color:T.text }}>Side Hustle Club</span>
      </div>

      {/* Nav Items */}
      <nav style={{ display:"flex", alignItems:"center", gap:2, flex:1, height:"100%" }}>
        {items.map((item) => {
          const isActive = active === item.id;
          const isHov = hovered === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position:"relative",
                display:"flex", alignItems:"center",
                padding:"0 16px", height:"100%",
                border:"none", cursor:"pointer",
                fontFamily:"Inter", fontSize:13.5,
                fontWeight: isActive ? 600 : 450,
                color: isActive ? T.text : isHov ? T.text : T.textMuted,
                background: isHov && !isActive ? T.bgHover : "transparent",
                borderRadius:0,
                transition:"all 0.18s ease",
                letterSpacing:"0.005em",
              }}
            >
              {item.label}
              {/* Active indicator — bottom line */}
              {isActive && (
                <div style={{
                  position:"absolute", bottom:0, left:12, right:12,
                  height:2, borderRadius:"2px 2px 0 0",
                  background:T.red,
                  animation:"scaleIn 0.2s ease",
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right side — user + exit */}
      <div style={{ display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
        <span style={{ fontSize:12, color:T.textMuted, fontFamily:"Inter", fontWeight:500 }}>
          {profileName || <span style={{ color:T.red, fontWeight:600, textTransform:"capitalize" }}>{role}</span>}
        </span>
        <button onClick={onLogout} style={{
          background:"none", border:`1px solid ${T.border}`,
          color:T.textDim, fontSize:11, cursor:"pointer", fontFamily:"Inter",
          padding:"5px 14px", borderRadius:8, fontWeight:500,
          transition:"all 0.15s ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor=T.red+"66"; e.currentTarget.style.color=T.red; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textDim; }}>
          Exit
        </button>
      </div>
    </div>
  );
}

// --- Avatar & Tags ---
function Avatar({ photo, name, size = 48 }) {
  const initials = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  if (photo) return <div style={{ width:size, height:size, borderRadius:"50%", background:`url(${photo}) center/cover`, flexShrink:0, border:`2px solid ${T.border}` }} />;
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg, ${T.red}33, ${T.red}11)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.38, fontFamily:"Inter", fontWeight:700, color:T.red, flexShrink:0, border:`2px solid ${T.red}22`,
    }}>{initials}</div>
  );
}

function TagList({ items, color = T.red }) {
  if (!items?.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
      {items.map((t,i) => (
        <span key={i} style={{ padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:500, background:color+"12", color, border:`1px solid ${color}22` }}>{t}</span>
      ))}
    </div>
  );
}

// --- Profile View ---
function ProfileField({ label, children }) {
  return (
    <div>
      <p style={{ fontSize:12, fontWeight:600, color:T.textDim, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</p>
      {children}
    </div>
  );
}

function MyProfilePage({ profile, onEdit }) {
  if (!profile) return <PageShell title="My Profile" subtitle="No profile found"><PlaceholderCard text="Try logging out and back in." /></PageShell>;
  const isMember = profile.role === "member";
  return (
    <PageShell title="My Profile" subtitle="This is how others see you">
      <div style={{ background:T.bgCard, borderRadius:16, border:`1px solid ${T.border}`, padding:28, animation:"fadeUp 0.3s ease" }}>
        <div style={{ display:"flex", gap:20, alignItems:"center", marginBottom:24 }}>
          <Avatar photo={profile.photo} name={profile.name} size={80} />
          <div>
            <h2 style={{ fontFamily:"DM Serif Display, serif", fontSize:24, fontWeight:400, letterSpacing:"-0.01em" }}>{profile.name}</h2>
            <span style={{ display:"inline-block", marginTop:4, padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", background:T.redSoft, color:T.red, border:`1px solid ${T.red}22` }}>{profile.role}</span>
          </div>
        </div>
        <div style={{ display:"grid", gap:20 }}>
          {profile.experience && <ProfileField label={isMember?"Experience":"Experience / Credentials"}><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.experience}</p></ProfileField>}
          {profile.skills?.length > 0 && <ProfileField label="Skills"><TagList items={profile.skills} /></ProfileField>}
          {isMember && profile.interests?.length > 0 && <ProfileField label="Interests"><TagList items={profile.interests} color="#3B82F6" /></ProfileField>}
          {isMember && profile.stage && <ProfileField label="Current Stage"><p style={{ fontSize:14, color:T.textMuted }}>{profile.stage}</p></ProfileField>}
          {isMember && profile.needsHelp && <ProfileField label="Needs Help With"><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.needsHelp}</p></ProfileField>}
          {isMember && (profile.projectName || profile.projectFiles?.length > 0 || profile.projectUrl) && (
            <div style={{ padding:16, borderRadius:12, background:T.bgHover, border:`1px solid ${T.border}` }}>
              <p style={{ fontSize:12, fontWeight:600, color:T.textDim, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.04em" }}>Project Spotlight</p>
              <p style={{ fontFamily:"DM Serif Display, serif", fontSize:18, fontWeight:400 }}>{profile.projectName}</p>
              {profile.projectDesc && <p style={{ fontSize:13, color:T.textMuted, marginTop:4 }}>{profile.projectDesc}</p>}
              {profile.projectStatus && <span style={{ display:"inline-block", marginTop:8, padding:"3px 10px", borderRadius:6, fontSize:11, background:T.success+"15", color:T.success, border:`1px solid ${T.success}22` }}>{profile.projectStatus}</span>}
              {profile.projectUrl && (
                <button onClick={() => window.open(profile.projectUrl,"_blank")} style={{
                  display:"inline-flex", alignItems:"center", gap:6, marginTop:10, marginLeft:profile.projectStatus?8:0,
                  padding:"5px 14px", borderRadius:8, fontSize:12, fontWeight:600, fontFamily:"Inter",
                  background:T.redSoft, color:T.red, border:`1px solid ${T.red}22`, cursor:"pointer", transition:"all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background=T.red+"30"}
                onMouseLeave={e => e.currentTarget.style.background=T.redSoft}>
                  🔗 Visit Project
                </button>
              )}
              {profile.projectFiles?.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))", gap:8, marginTop:12 }}>
                  {profile.projectFiles.map((f,i) => (
                    <div key={i} style={{ borderRadius:10, overflow:"hidden", border:`1px solid ${T.border}`, background:T.bgInput }}>
                      {f.type==="image" ? (
                        <div style={{ width:"100%", height:90, background:`url(${f.data}) center/cover` }} />
                      ) : (
                        <div style={{ width:"100%", height:90, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:T.bg }}>
                          <span style={{ fontSize:20 }}>📄</span>
                          <span style={{ fontSize:9, color:T.red, fontWeight:700, marginTop:2 }}>{f.fileType}</span>
                        </div>
                      )}
                      {f.caption && <p style={{ fontSize:10, color:T.textMuted, padding:"4px 6px", lineHeight:1.3 }}>{f.caption}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isMember && profile.highlights && <ProfileField label="Highlights"><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.highlights}</p></ProfileField>}
          {!isMember && profile.focusArea && <ProfileField label="Area of Focus"><p style={{ fontSize:14, color:T.textMuted }}>{profile.focusArea}</p></ProfileField>}
          {!isMember && profile.howToHelp && <ProfileField label="How I Help"><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.howToHelp}</p></ProfileField>}
          {!isMember && profile.helpMethods?.length > 0 && <ProfileField label="Preferred Methods"><TagList items={profile.helpMethods} color="#A855F7" /></ProfileField>}
          {!isMember && profile.contactInfo && <ProfileField label="Contact"><p style={{ fontSize:14, color:T.textMuted }}>{profile.contactInfo}</p></ProfileField>}
          {profile.phone && <ProfileField label="Phone"><p style={{ fontSize:14, color:T.textMuted }}>{profile.phone}</p></ProfileField>}
          {isMember && profile.linkedin && (
            <button onClick={() => window.open(profile.linkedin,"_blank")} style={{
              display:"inline-flex", alignItems:"center", gap:8, padding:"10px 20px", borderRadius:10, fontSize:13, fontWeight:600,
              fontFamily:"Inter", background:"#0A66C2", color:T.white, border:"none", cursor:"pointer", width:"fit-content",
            }}
            onMouseEnter={e => e.currentTarget.style.transform="scale(1.03)"}
            onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </button>
          )}
        </div>
        <button onClick={onEdit} style={{
          marginTop:24, padding:"10px 24px", borderRadius:10, fontSize:13, fontWeight:600,
          fontFamily:"Inter", background:T.bgHover, color:T.textMuted, border:`1px solid ${T.border}`, cursor:"pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor=T.red; e.currentTarget.style.color=T.red; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textMuted; }}>
          Edit Profile
        </button>
      </div>
    </PageShell>
  );
}

// --- Edit Profile ---
function EditProfilePage({ profile, onSave, onCancel }) {
  const [data, setData] = useState({ ...profile });
  const [saving, setSaving] = useState(false);
  const up = (f, v) => setData(p => ({ ...p, [f]: v }));
  const isMember = profile.role === "member";

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await db.updateProfile(profile.id, data);
      onSave(updated);
    } catch (e) { console.error("Save failed:", e); }
    setSaving(false);
  };

  return (
    <PageShell title="Edit Profile" subtitle="Update your information">
      <div style={{ background:T.bgCard, borderRadius:16, border:`1px solid ${T.border}`, padding:28, maxWidth:560, animation:"fadeUp 0.3s ease" }}>
        <PhotoUpload photo={data.photo} onUpload={v => up("photo",v)} />
        <Input label="Name" value={data.name} onChange={v => up("name",v)} placeholder="Your name" />
        <Input label={isMember?"Experience":"Experience / Credentials"} value={data.experience||""} onChange={v => up("experience",v)} textarea />
        <TagInput label="Skills" tags={data.skills||[]} onChange={v => up("skills",v)} placeholder="Add skills..." suggestions={SKILL_SUGGESTIONS} />
        {isMember && (<>
          <TagInput label="Interests" tags={data.interests||[]} onChange={v => up("interests",v)} placeholder="Add interests..." suggestions={INTEREST_SUGGESTIONS} />
          <SelectInput label="Current stage" value={data.stage||""} onChange={v => up("stage",v)} options={STAGE_OPTIONS} />
          <Input label="Needs help with" textarea value={data.needsHelp||""} onChange={v => up("needsHelp",v)} />
          <Input label="Highlights" textarea value={data.highlights||""} onChange={v => up("highlights",v)} optional />
          <div style={{ padding:16, borderRadius:12, background:T.bgHover, border:`1px solid ${T.border}`, marginBottom:16 }}>
            <p style={{ fontSize:13, fontWeight:600, color:T.textMuted, marginBottom:12 }}>Project Spotlight</p>
            <Input label="Project name" value={data.projectName||""} onChange={v => up("projectName",v)} optional />
            <Input label="Description" value={data.projectDesc||""} onChange={v => up("projectDesc",v)} optional />
            <SelectInput label="Status" value={data.projectStatus||""} onChange={v => up("projectStatus",v)} options={["Idea stage","Building MVP","Live / Launched","Growing"]} />
            <Input label="Project URL" placeholder="https://yourproject.com" value={data.projectUrl||""} onChange={v => up("projectUrl",v)} optional />
            <ProjectFilesUpload files={data.projectFiles||[]} onChange={v => up("projectFiles",v)} />
          </div>
          <Input label="LinkedIn URL" value={data.linkedin||""} onChange={v => up("linkedin",v)} optional />
          <Input label="Phone number" placeholder="(555) 123-4567" value={data.phone||""} onChange={v => up("phone",v)} optional />
        </>)}
        {!isMember && (<>
          <SelectInput label="Area of Focus" value={data.focusArea||""} onChange={v => up("focusArea",v)} options={FOCUS_AREAS} />
          <Input label="How you want to help" textarea value={data.howToHelp||""} onChange={v => up("howToHelp",v)} />
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:600, color:T.textMuted, marginBottom:8 }}>Preferred methods</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {HELP_METHODS.map(m => {
                const sel = data.helpMethods?.includes(m);
                return <button key={m} onClick={() => up("helpMethods",sel?data.helpMethods.filter(x=>x!==m):[...(data.helpMethods||[]),m])}
                  style={{ padding:"7px 14px", borderRadius:8, fontSize:13, fontFamily:"Inter", border:`1.5px solid ${sel?T.red:T.border}`, background:sel?T.redSoft:"transparent", color:sel?T.red:T.textMuted, cursor:"pointer" }}>{m}</button>;
              })}
            </div>
          </div>
          <Input label="Contact info" value={data.contactInfo||""} onChange={v => up("contactInfo",v)} />
          <Input label="Phone number" placeholder="(555) 123-4567" value={data.phone||""} onChange={v => up("phone",v)} optional />
        </>)}
        <div style={{ display:"flex", gap:12, marginTop:20 }}>
          <button onClick={onCancel} style={{ padding:"10px 24px", borderRadius:10, fontSize:14, fontFamily:"Inter", background:"transparent", border:`1.5px solid ${T.border}`, color:T.textMuted, cursor:"pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding:"10px 28px", borderRadius:10, fontSize:14, fontFamily:"Inter", fontWeight:700, background:T.red, color:T.white, border:"none", cursor:"pointer", boxShadow:`0 0 20px ${T.redGlow}` }}>
            {saving?"Saving...":"Save Changes"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}

// --- Page Shells ---
function PageShell({ title, subtitle, children }) {
  return (
    <div style={{ flex:1, padding:32, overflowY:"auto", animation:"fadeUp 0.3s ease" }}>
      <h1 style={{ fontFamily:"DM Serif Display, serif", fontSize:28, fontWeight:400, letterSpacing:"-0.01em" }}>{title}</h1>
      {subtitle && <p style={{ color:T.textMuted, fontSize:14, marginTop:6 }}>{subtitle}</p>}
      <div style={{ marginTop:28 }}>{children}</div>
    </div>
  );
}
function PlaceholderCard({ text }) {
  return <div style={{ padding:32, borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, textAlign:"center", color:T.textDim, fontSize:14 }}>{text}</div>;
}

// --- Profile Detail Modal ---
function ProfileModal({ profile, onClose }) {
  if (!profile) return null;
  const isMember = profile.role === "member";
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.7)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:24,
      animation:"fadeIn 0.2s ease", backdropFilter:"blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width:"100%", maxWidth:560, maxHeight:"85vh", overflowY:"auto",
        background:T.bgCard, borderRadius:20, border:`1px solid ${T.border}`,
        padding:32, animation:"scaleIn 0.25s ease", position:"relative",
      }}>
        <button onClick={onClose} style={{
          position:"absolute", top:16, right:16, width:32, height:32, borderRadius:"50%",
          background:T.bgHover, border:`1px solid ${T.border}`, color:T.textMuted,
          fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        }}
        onMouseEnter={e => { e.currentTarget.style.background=T.red; e.currentTarget.style.color=T.white; }}
        onMouseLeave={e => { e.currentTarget.style.background=T.bgHover; e.currentTarget.style.color=T.textMuted; }}>×</button>

        <div style={{ display:"flex", gap:20, alignItems:"center", marginBottom:24 }}>
          <Avatar photo={profile.photo} name={profile.name} size={80} />
          <div>
            <h2 style={{ fontFamily:"DM Serif Display, serif", fontSize:24, fontWeight:400, letterSpacing:"-0.01em" }}>{profile.name}</h2>
            <span style={{ display:"inline-block", marginTop:4, padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", background:T.redSoft, color:T.red, border:`1px solid ${T.red}22` }}>{profile.role}</span>
          </div>
        </div>

        <div style={{ display:"grid", gap:18 }}>
          {profile.experience && <ProfileField label={isMember?"Experience":"Experience / Credentials"}><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.experience}</p></ProfileField>}
          {profile.skills?.length > 0 && <ProfileField label="Skills"><TagList items={profile.skills} /></ProfileField>}
          {isMember && profile.interests?.length > 0 && <ProfileField label="Interests"><TagList items={profile.interests} color="#3B82F6" /></ProfileField>}
          {isMember && profile.stage && <ProfileField label="Current Stage"><p style={{ fontSize:14, color:T.textMuted }}>{profile.stage}</p></ProfileField>}
          {isMember && profile.needsHelp && <ProfileField label="Needs Help With"><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.needsHelp}</p></ProfileField>}

          {isMember && (profile.projectName || profile.projectFiles?.length > 0 || profile.projectUrl) && (
            <div style={{ padding:16, borderRadius:12, background:T.bgHover, border:`1px solid ${T.border}` }}>
              <p style={{ fontSize:12, fontWeight:600, color:T.textDim, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.04em" }}>Project Spotlight</p>
              {profile.projectName && <p style={{ fontFamily:"DM Serif Display, serif", fontSize:18, fontWeight:400 }}>{profile.projectName}</p>}
              {profile.projectDesc && <p style={{ fontSize:13, color:T.textMuted, marginTop:4 }}>{profile.projectDesc}</p>}
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
                {profile.projectStatus && <span style={{ padding:"3px 10px", borderRadius:6, fontSize:11, background:T.success+"15", color:T.success, border:`1px solid ${T.success}22` }}>{profile.projectStatus}</span>}
                {profile.projectUrl && (
                  <button onClick={() => window.open(profile.projectUrl,"_blank")} style={{
                    display:"inline-flex", alignItems:"center", gap:4, padding:"3px 12px", borderRadius:6, fontSize:11, fontWeight:600,
                    fontFamily:"Inter", background:T.redSoft, color:T.red, border:`1px solid ${T.red}22`, cursor:"pointer",
                 }}>🔗 Visit</button>
                )}
              </div>
              {profile.projectFiles?.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(100px, 1fr))", gap:8, marginTop:12 }}>
                  {profile.projectFiles.map((f,i) => (
                    <div key={i} style={{ borderRadius:8, overflow:"hidden", border:`1px solid ${T.border}` }}>
                      {f.type==="image" ? <div style={{ width:"100%", height:80, background:`url(${f.data}) center/cover` }} />
                        : <div style={{ width:"100%", height:80, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:T.bg }}><span style={{ fontSize:18 }}>📄</span><span style={{ fontSize:9, color:T.red, fontWeight:700 }}>{f.fileType}</span></div>}
                      {f.caption && <p style={{ fontSize:9, color:T.textMuted, padding:"3px 5px" }}>{f.caption}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isMember && profile.highlights && <ProfileField label="Highlights"><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.highlights}</p></ProfileField>}
          {!isMember && profile.focusArea && <ProfileField label="Area of Focus"><p style={{ fontSize:14, color:T.textMuted }}>{profile.focusArea}</p></ProfileField>}
          {!isMember && profile.howToHelp && <ProfileField label="How I Help"><p style={{ fontSize:14, color:T.textMuted, lineHeight:1.5 }}>{profile.howToHelp}</p></ProfileField>}
          {!isMember && profile.helpMethods?.length > 0 && <ProfileField label="Preferred Methods"><TagList items={profile.helpMethods} color="#A855F7" /></ProfileField>}
          {!isMember && profile.contactInfo && <ProfileField label="Contact"><p style={{ fontSize:14, color:T.textMuted }}>{profile.contactInfo}</p></ProfileField>}
          {profile.phone && <ProfileField label="Phone"><p style={{ fontSize:14, color:T.textMuted }}>{profile.phone}</p></ProfileField>}

          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
            {isMember && profile.linkedin && (
              <button onClick={() => window.open(profile.linkedin,"_blank")} style={{
                display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:600,
                fontFamily:"Inter", background:"#0A66C2", color:T.white, border:"none", cursor:"pointer",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Search Bar ---
function SearchBar({ value, onChange, placeholder, filterTags, activeFilters, onToggleFilter }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{
        display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderRadius:12,
        background:T.bgInput, border:`1.5px solid ${focused ? T.red+"88" : T.border}`, transition:"border-color 0.2s",
      }}>
        <span style={{ color:T.textDim, fontSize:16 }}>🔍</span>
        <input value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{ flex:1, background:"none", border:"none", color:T.text, fontSize:14, fontFamily:"Inter", outline:"none" }} />
        {value && <span onClick={() => onChange("")} style={{ color:T.textDim, cursor:"pointer", fontSize:14 }}>✕</span>}
      </div>
      {filterTags?.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10 }}>
          <span style={{ fontSize:12, color:T.textDim, alignSelf:"center", marginRight:4 }}>Filter:</span>
          {filterTags.map(tag => {
            const active = activeFilters.includes(tag);
            return (
              <button key={tag} onClick={() => onToggleFilter(tag)} style={{
                padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:active?600:400, fontFamily:"Inter",
                border:`1px solid ${active?T.red:T.border}`, background:active?T.redSoft:"transparent",
                color:active?T.red:T.textDim, cursor:"pointer", transition:"all 0.15s",
              }}>{tag}</button>
            );
          })}
          {activeFilters.length > 0 && (
            <button onClick={() => activeFilters.forEach(f => onToggleFilter(f))} style={{
              padding:"4px 10px", borderRadius:6, fontSize:10, fontFamily:"Inter",
              border:"none", background:"transparent", color:T.red, cursor:"pointer", fontWeight:600,
            }}>Clear all</button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Profile Card (grid item) ---
function ProfileCard({ profile, onClick }) {
  const isMember = profile.role === "member";
  return (
    <div onClick={onClick} style={{
      background:T.bgCard, borderRadius:14, border:`1px solid ${T.border}`,
      padding:20, cursor:"pointer", transition:"all 0.2s ease",
      animation:"fadeUp 0.3s ease",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor=T.red+"55"; e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow=`0 8px 24px ${T.redGlow}`; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="none"; }}>
      <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:14 }}>
        <Avatar photo={profile.photo} name={profile.name} size={48} />
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontFamily:"DM Serif Display, serif", fontSize:16, fontWeight:400, letterSpacing:"-0.01em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{profile.name}</p>
          {isMember && profile.stage && <p style={{ fontSize:11, color:T.textDim, marginTop:2 }}>{profile.stage}</p>}
          {!isMember && profile.focusArea && <p style={{ fontSize:11, color:T.textDim, marginTop:2 }}>{profile.focusArea}</p>}
        </div>
      </div>
      {profile.skills?.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10 }}>
          {profile.skills.slice(0,4).map((s,i) => (
            <span key={i} style={{ padding:"2px 8px", borderRadius:5, fontSize:10, fontWeight:500, background:T.redSoft, color:T.red, border:`1px solid ${T.red}15` }}>{s}</span>
          ))}
          {profile.skills.length > 4 && <span style={{ fontSize:10, color:T.textDim, alignSelf:"center" }}>+{profile.skills.length-4}</span>}
        </div>
      )}
      {isMember && profile.projectName && (
        <div style={{ padding:"8px 10px", borderRadius:8, background:T.bgHover, border:`1px solid ${T.border}`, marginBottom:8 }}>
          <p style={{ fontSize:11, fontWeight:600, color:T.textMuted }}>{profile.projectName}</p>
          {profile.projectStatus && <span style={{ fontSize:10, color:T.success }}>{profile.projectStatus}</span>}
        </div>
      )}
      {isMember && profile.needsHelp && (
        <p style={{ fontSize:12, color:T.textMuted, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
          <span style={{ fontWeight:600, color:T.red, fontSize:11 }}>NEEDS: </span>{profile.needsHelp}
        </p>
      )}
      {!isMember && profile.howToHelp && (
        <p style={{ fontSize:12, color:T.textMuted, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
          {profile.howToHelp}
        </p>
      )}
    </div>
  );
}

// --- Dashboard Page ---
function DashboardPage({ role, onNav }) {
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [featuredIdx, setFeaturedIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const p = await db.getPosts();
      const pr = await db.getProfiles();
      setPosts(p);
      setProfiles(pr);
      setLoaded(true);
    })();
  }, []);

  const memberCount = profiles.filter(p => p.role==="member").length;
  const mentorCount = profiles.filter(p => p.role==="mentor").length;
  const projectMembers = profiles.filter(p => p.role==="member" && p.projectName);
  const recentMembers = [...profiles].sort((a,b) => b.createdAt - a.createdAt).slice(0, 8);

  useEffect(() => {
    if (projectMembers.length <= 1) return;
    const interval = setInterval(() => setFeaturedIdx(i => (i + 1) % projectMembers.length), 8000);
    return () => clearInterval(interval);
  }, [projectMembers.length]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (!loaded) return (
    <PageShell title="Dashboard" subtitle="Loading...">
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ height:100, borderRadius:16, background:T.bgCard, border:`1px solid ${T.border}`, animation:"pulse 1.5s ease infinite" }} />
        ))}
      </div>
    </PageShell>
  );

  const featured = projectMembers.length > 0 ? projectMembers[featuredIdx % projectMembers.length] : null;

  return (
    <div style={{ flex:1, padding:"48px 52px", overflowY:"auto", maxWidth:900, animation:"fadeUp 0.4s ease" }}>

      {/* Header — greeting left, stats right */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:56, gap:40 }}>
        <div>
          <h1 style={{
            fontFamily:"DM Serif Display, serif", fontSize:"clamp(32px, 4vw, 48px)", fontWeight:400,
            letterSpacing:"-0.025em", lineHeight:1.15, color:T.text,
          }}>
            {greeting}
          </h1>
          <p style={{ fontSize:15, color:T.textMuted, marginTop:12, lineHeight:1.7, maxWidth:440 }}>
            {profiles.length === 0
              ? "Your community is just getting started."
              : `${profiles.length} people building together.`
            }
          </p>
        </div>
        <div style={{ display:"flex", gap:36, flexShrink:0, paddingTop:8 }}>
          {[
            { label:"Members", val:memberCount },
            { label:"Mentors", val:mentorCount },
            { label:"Projects", val:projectMembers.length },
          ].map((s, i) => (
            <div key={s.label} style={{ textAlign:"right", animation:`fadeUp 0.4s ease ${i * 0.06}s both` }}>
              <p style={{ fontFamily:"DM Serif Display, serif", fontSize:28, fontWeight:400, letterSpacing:"-0.02em", color:T.text, lineHeight:1 }}>{s.val}</p>
              <p style={{ fontSize:10, color:T.textDim, marginTop:5, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height:1, background:T.border, marginBottom:48 }} />

      {/* Project Spotlight */}
      {featured && (
        <div style={{ marginBottom:48, animation:"fadeUp 0.4s ease 0.15s both" }}>
          <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim, marginBottom:20 }}>
            Project Spotlight
          </p>
          <div onClick={() => setSelectedProfile(featured)} style={{ cursor:"pointer", transition:"opacity 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity="0.8"}
            onMouseLeave={e => e.currentTarget.style.opacity="1"}>
            <h2 style={{
              fontFamily:"DM Serif Display, serif", fontSize:28, fontWeight:400,
              letterSpacing:"-0.02em", lineHeight:1.2, marginBottom:8,
            }}>
              {featured.projectName}
            </h2>
            <p style={{ fontSize:13, color:T.textDim, marginBottom:8 }}>
              by <span style={{ fontWeight:600, color:T.textMuted }}>{featured.name}</span>
              {featured.projectStatus && <span style={{ fontStyle:"italic" }}>{" \u2014 "}{featured.projectStatus}</span>}
            </p>
            {featured.projectDesc && (
              <p style={{ fontSize:14, color:T.textMuted, lineHeight:1.7, maxWidth:560 }}>{featured.projectDesc}</p>
            )}
            {featured.skills?.length > 0 && (
              <p style={{ fontSize:12, color:T.textDim, marginTop:12 }}>
                {featured.skills.slice(0,5).join(" \u00B7 ")}
              </p>
            )}
            {featured.projectFiles?.length > 0 && (
              <div style={{ display:"flex", gap:10, marginTop:16 }}>
                {featured.projectFiles.slice(0,3).map((f,fi) => (
                  f.type === "image" ? (
                    <div key={fi} style={{ width:120, height:72, borderRadius:4, background:`url(${f.data}) center/cover`, opacity:0.85, flexShrink:0 }} />
                  ) : null
                ))}
              </div>
            )}
          </div>
          {projectMembers.length > 1 && (
            <div style={{ display:"flex", gap:4, marginTop:20 }}>
              {projectMembers.slice(0, Math.min(6, projectMembers.length)).map((_, pi) => (
                <div key={pi} onClick={() => setFeaturedIdx(pi)} style={{
                  width: pi === featuredIdx % projectMembers.length ? 24 : 8, height:2,
                  background: pi === featuredIdx % projectMembers.length ? T.textMuted : T.border,
                  cursor:"pointer", transition:"all 0.3s ease",
                }} />
              ))}
            </div>
          )}
        </div>
      )}

      {featured && <div style={{ height:1, background:T.border, marginBottom:48 }} />}

      {/* Announcements */}
      <div style={{ marginBottom:48 }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim, marginBottom:24 }}>
          Announcements
        </p>
        {posts.length === 0 ? (
          <p style={{ fontSize:14, color:T.textDim, fontStyle:"italic", lineHeight:1.7 }}>
            No announcements yet.{" "}
            {role==="admin" ? "Head to Admin Panel to post updates." : "Check back soon."}
          </p>
        ) : (
          <div>
            {posts.map((post, pi) => (
              <div key={post.id} style={{
                paddingBottom:24, marginBottom:24,
                borderBottom: pi < posts.length - 1 ? `1px solid ${T.border}` : "none",
                animation:`fadeUp 0.3s ease ${pi * 0.04}s both`,
              }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:500, color:T.textDim, textTransform:"capitalize", fontStyle:"italic" }}>{post.type}</span>
                  <span style={{ fontSize:11, color:T.textDim }}>{new Date(post.createdAt).toLocaleDateString()}</span>
                </div>
                <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:20, fontWeight:400, lineHeight:1.3, marginBottom:6 }}>{post.title}</h3>
                <p style={{ fontSize:14, color:T.textMuted, lineHeight:1.7 }}>{post.content}</p>
                {post.link && (
                  <p onClick={() => window.open(post.link,"_blank")} style={{
                    marginTop:8, fontSize:13, color:T.textDim, cursor:"pointer",
                    textDecoration:"underline", textUnderlineOffset:3, textDecorationColor:T.border,
                    transition:"color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color=T.text}
                  onMouseLeave={e => e.currentTarget.style.color=T.textDim}>
                    Read more
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ height:1, background:T.border, marginBottom:48 }} />

      {/* Recent Joins */}
      <div style={{ marginBottom:48, animation:"fadeUp 0.4s ease 0.2s both" }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim, marginBottom:20 }}>
          Recent Joins
        </p>
        {recentMembers.length === 0 ? (
          <p style={{ fontSize:13, color:T.textDim, fontStyle:"italic" }}>No members yet.</p>
        ) : (
          <div>
            {recentMembers.map((p, i) => (
              <div key={p.id} onClick={() => setSelectedProfile(p)} style={{
                display:"flex", alignItems:"center", gap:12, padding:"10px 0",
                borderBottom: i < recentMembers.length - 1 ? `1px solid ${T.border}` : "none",
                cursor:"pointer", transition:"opacity 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity="0.7"}
              onMouseLeave={e => e.currentTarget.style.opacity="1"}>
                <Avatar photo={p.photo} name={p.name} size={28} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</p>
                </div>
                <p style={{ fontSize:11, color:T.textDim, fontStyle:"italic", textTransform:"capitalize" }}>{p.role}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedProfile && <ProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />}
    </div>
  );
}

function BrowsePage({ filterRole, title, subtitle }) {
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await db.getProfiles(filterRole);
      setProfiles(all);
      setLoaded(true);
    })();
  }, [filterRole]);

  // Collect all unique skills/interests/focus areas for filter chips
  const allTags = [...new Set(profiles.flatMap(p => [
    ...(p.skills || []),
    ...(filterRole === "member" ? (p.interests || []) : []),
    ...(p.focusArea ? [p.focusArea] : []),
  ]))].sort().slice(0, 20);

  const toggleFilter = (tag) => {
    setActiveFilters(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    const searchMatch = !q || [
      p.name, p.experience, p.stage, p.needsHelp, p.highlights, p.focusArea, p.howToHelp,
      ...(p.skills || []), ...(p.interests || []),
      p.projectName, p.projectDesc,
    ].some(field => field?.toLowerCase().includes(q));

    const filterMatch = activeFilters.length === 0 || activeFilters.some(f =>
      p.skills?.includes(f) || p.interests?.includes(f) || p.focusArea === f
    );

    return searchMatch && filterMatch;
  });

  if (!loaded) return <PageShell title={title} subtitle="Loading..."><div /></PageShell>;

  return (
    <PageShell title={title} subtitle={subtitle}>
      <SearchBar value={search} onChange={setSearch}
        placeholder={`Search by name, skills, ${filterRole==="member"?"interests, projects...":"expertise, focus area..."}`}
        filterTags={allTags} activeFilters={activeFilters} onToggleFilter={toggleFilter} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <p style={{ fontSize:13, color:T.textDim }}>
          {filtered.length} {filterRole}{filtered.length !== 1 ? "s" : ""} found
          {activeFilters.length > 0 && ` · ${activeFilters.length} filter${activeFilters.length>1?"s":""} active`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding:40, borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, textAlign:"center" }}>
          <p style={{ fontSize:28, marginBottom:8 }}>{filterRole==="member"?"👥":"🌟"}</p>
          <p style={{ color:T.textDim, fontSize:14 }}>
            {profiles.length === 0 ? `No ${filterRole}s have joined yet.` : "No results match your search."}
          </p>
          {(search || activeFilters.length > 0) && (
            <button onClick={() => { setSearch(""); setActiveFilters([]); }} style={{
              marginTop:12, padding:"8px 20px", borderRadius:8, fontSize:13, fontFamily:"Inter",
              background:T.redSoft, color:T.red, border:`1px solid ${T.red}22`, cursor:"pointer",
            }}>Clear search</button>
          )}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:14 }}>
          {filtered.map(p => (
            <ProfileCard key={p.id} profile={p} onClick={() => setSelectedProfile(p)} />
          ))}
        </div>
      )}

      {selectedProfile && <ProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />}
    </PageShell>
  );
}

function MembersPage() { return <BrowsePage filterRole="member" title="Members" subtitle="Browse and find fellow builders" />; }
function MentorsPage() { return <BrowsePage filterRole="mentor" title="Mentors" subtitle="Find guidance from experienced mentors" />; }
// --- Resources Page ---
function ResourcesPage() {
  const [activeTab, setActiveTab] = useState("validator");

  const tabs = [
    { id:"validator", label:"Idea Validator" },
    { id:"skills", label:"Skills to Learn" },
    { id:"pitchdeck", label:"Build Your Pitch Deck" },
    { id:"toolkit", label:"Founder Toolkit" },
  ];

  return (
    <PageShell title="Resources" subtitle="Tools and templates to build faster">
      {/* Tab bar */}
      <div style={{ display:"flex", gap:6, marginBottom:24, flexWrap:"wrap" }}>
        {tabs.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding:"9px 18px", borderRadius:10, fontSize:13, fontWeight:active?700:500, fontFamily:"Inter",
              background:active?T.redSoft:"transparent", color:active?T.red:T.textMuted,
              border:`1.5px solid ${active?T.red:T.border}`, cursor:"pointer", transition:"all 0.15s",
            }}
            onMouseEnter={e => { if(!active) e.currentTarget.style.borderColor=T.textDim; }}
            onMouseLeave={e => { if(!active) e.currentTarget.style.borderColor=T.border; }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "validator" && <IdeaValidator />}
      {activeTab === "skills" && <SkillsToLearn />}
      {activeTab === "pitchdeck" && <PitchDeckResources />}
      {activeTab === "toolkit" && <FounderToolkit />}
    </PageShell>
  );
}

function IdeaValidator() {
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [buildPlan, setBuildPlan] = useState("");
  const [slides, setSlides] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = problem.trim().length > 10 && solution.trim().length > 10;

  const generate = async () => {
    setLoading(true);
    setError(null);
    setSlides(null);
    setCurrentSlide(0);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: "You are a startup analyst. You always respond with ONLY raw JSON arrays. No markdown, no backticks, no explanation — just the JSON array.",
          messages: [{
            role: "user",
            content: `Analyze this startup idea. Produce exactly 6 JSON objects in an array. Be specific — use real numbers, real company names, real costs where possible. Max 4 points per slide, each point 1-2 sentences.

PROBLEM: ${problem}
SOLUTION: ${solution}
${buildPlan ? `BUILD PLAN: ${buildPlan}` : ""}

Return ONLY a JSON array in this exact format:
[
  {"title":"The Problem","subtitle":"Size & who has it","points":["...","...","..."]},
  {"title":"Potential Solutions","subtitle":"Approaches worth exploring","points":["...","...","..."]},
  {"title":"Competitive Landscape","subtitle":"Who you're up against","points":["...","...","..."]},
  {"title":"Cost to Launch","subtitle":"What it takes to start","points":["...","...","..."]},
  {"title":"Willingness to Pay","subtitle":"Revenue & customer pricing","points":["...","...","..."]},
  {"title":"First 5 Steps","subtitle":"Start here, this week","points":["1. ...","2. ...","3. ...","4. ...","5. ..."]}
]`
          }],
        }),
      });

      if (!response.ok) {
        throw new Error("API returned " + response.status);
      }

      const data = await response.json();
      const text = data.content?.filter(i => i.type === "text").map(i => i.text).join("") || "";
      
      // Robust JSON extraction — find the outermost [ ... ]
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON array found in response");
      }
      const jsonStr = text.slice(start, end + 1);
      const parsed = JSON.parse(jsonStr);
      
      if (Array.isArray(parsed) && parsed.length === 6 && parsed.every(s => s.title && s.points)) {
        setSlides(parsed);
      } else {
        setError("Unexpected response format. Try again.");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  // --- Input view ---
  if (!slides && !loading) {
    return (
      <div style={{ animation:"fadeUp 0.3s ease", maxWidth:580 }}>
        <div style={{ marginBottom:40 }}>
          <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:24, fontWeight:400, marginBottom:8 }}>
            Validate your idea
          </h3>
          <p style={{ fontSize:14, color:T.textMuted, lineHeight:1.7 }}>
            Describe what you're building. We'll break down the market, competition, costs, and give you a concrete plan to start.
          </p>
        </div>

        <div style={{ marginBottom:28 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:600, color:T.text, marginBottom:8 }}>
            What problem are you trying to solve?
          </label>
          <textarea value={problem} onChange={e => setProblem(e.target.value)}
            placeholder="Describe the pain point you've observed..."
            style={{ ...inputStyle, minHeight:100, resize:"vertical" }}
            onFocus={e => e.currentTarget.style.borderColor=T.red+"88"}
            onBlur={e => e.currentTarget.style.borderColor=T.border} />
        </div>

        <div style={{ marginBottom:28 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:600, color:T.text, marginBottom:8 }}>
            What is your idea for a solution?
          </label>
          <textarea value={solution} onChange={e => setSolution(e.target.value)}
            placeholder="How would you solve this problem..."
            style={{ ...inputStyle, minHeight:80, resize:"vertical" }}
            onFocus={e => e.currentTarget.style.borderColor=T.red+"88"}
            onBlur={e => e.currentTarget.style.borderColor=T.border} />
        </div>

        <div style={{ marginBottom:36 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:600, color:T.text, marginBottom:8 }}>
            How do you plan to build this? <span style={{ fontWeight:400, color:T.textDim }}>(optional)</span>
          </label>
          <textarea value={buildPlan} onChange={e => setBuildPlan(e.target.value)}
            placeholder="Tech stack, timeline, resources you have..."
            style={{ ...inputStyle, minHeight:70, resize:"vertical" }}
            onFocus={e => e.currentTarget.style.borderColor=T.red+"88"}
            onBlur={e => e.currentTarget.style.borderColor=T.border} />
        </div>

        {error && (
          <p style={{ fontSize:13, color:T.red, marginBottom:16, animation:"fadeIn 0.2s ease" }}>{error}</p>
        )}

        <div
          onClick={canSubmit ? generate : undefined}
          style={{
            display:"inline-block",
            fontSize:13, fontWeight:600, color:canSubmit ? T.text : T.textDim,
            cursor:canSubmit ? "pointer" : "default",
            borderBottom:canSubmit ? `1px solid ${T.textMuted}` : `1px solid ${T.border}`,
            paddingBottom:2, transition:"all 0.2s ease",
          }}
          onMouseEnter={e => { if(canSubmit) { e.currentTarget.style.color=T.red; e.currentTarget.style.borderBottomColor=T.red; } }}
          onMouseLeave={e => { if(canSubmit) { e.currentTarget.style.color=T.text; e.currentTarget.style.borderBottomColor=T.textMuted; } }}
        >
          Analyze my idea
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ animation:"fadeUp 0.3s ease", maxWidth:580, padding:"80px 0" }}>
        <p style={{ fontFamily:"DM Serif Display, serif", fontSize:22, fontWeight:400, marginBottom:12 }}>
          Analyzing...
        </p>
        <p style={{ fontSize:14, color:T.textMuted, lineHeight:1.7 }}>
          Researching market size, competitors, costs, and building your plan.
        </p>
        <div style={{ marginTop:24, height:1, background:T.border, position:"relative", overflow:"hidden" }}>
          <div style={{
            position:"absolute", top:0, left:0, height:"100%", width:"30%",
            background:T.red, borderRadius:1,
            animation:"slideLoading 1.4s ease infinite",
          }} />
        </div>
        <style>{`@keyframes slideLoading { 0%{left:-30%} 100%{left:100%} }`}</style>
      </div>
    );
  }

  // --- Slideshow ---
  const slide = slides[currentSlide];
  const total = slides.length;

  return (
    <div style={{ animation:"fadeUp 0.3s ease", maxWidth:620 }}>
      {/* Counter + text nav */}
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:32 }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim }}>
          {String(currentSlide + 1).padStart(2,"0")} / {String(total).padStart(2,"0")}
        </p>
        <div style={{ display:"flex", gap:20 }}>
          <span
            onClick={() => currentSlide > 0 && setCurrentSlide(currentSlide - 1)}
            style={{
              fontSize:12, color:currentSlide > 0 ? T.textMuted : T.border,
              cursor:currentSlide > 0 ? "pointer" : "default",
              transition:"color 0.15s", userSelect:"none",
            }}
            onMouseEnter={e => { if(currentSlide > 0) e.currentTarget.style.color=T.text; }}
            onMouseLeave={e => { if(currentSlide > 0) e.currentTarget.style.color=T.textMuted; }}
          >Previous</span>
          <span
            onClick={() => currentSlide < total - 1 && setCurrentSlide(currentSlide + 1)}
            style={{
              fontSize:12, color:currentSlide < total - 1 ? T.textMuted : T.border,
              cursor:currentSlide < total - 1 ? "pointer" : "default",
              transition:"color 0.15s", userSelect:"none",
            }}
            onMouseEnter={e => { if(currentSlide < total - 1) e.currentTarget.style.color=T.text; }}
            onMouseLeave={e => { if(currentSlide < total - 1) e.currentTarget.style.color=T.textMuted; }}
          >Next</span>
        </div>
      </div>

      {/* Progress lines */}
      <div style={{ display:"flex", gap:6, marginBottom:44 }}>
        {slides.map((_, i) => (
          <div key={i} onClick={() => setCurrentSlide(i)} style={{
            flex:1, height:2, cursor:"pointer",
            background: i <= currentSlide ? T.text : T.border,
            transition:"background 0.3s ease",
          }} />
        ))}
      </div>

      {/* Slide content */}
      <div key={currentSlide} style={{ animation:"fadeUp 0.25s ease" }}>
        <p style={{ fontSize:11, color:T.textDim, fontStyle:"italic", letterSpacing:"0.02em", marginBottom:10 }}>
          {slide.subtitle}
        </p>
        <h2 style={{
          fontFamily:"DM Serif Display, serif", fontSize:30, fontWeight:400,
          letterSpacing:"-0.02em", lineHeight:1.2, marginBottom:32,
        }}>
          {slide.title}
        </h2>

        <div>
          {slide.points.map((point, pi) => (
            <div key={pi} style={{
              padding:"14px 0",
              borderBottom: pi < slide.points.length - 1 ? `1px solid ${T.border}` : "none",
              animation:`fadeUp 0.2s ease ${pi * 0.05}s both`,
            }}>
              <p style={{ fontSize:14, color:T.textMuted, lineHeight:1.7 }}>{point}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Start over */}
      <div style={{ marginTop:48, paddingTop:20, borderTop:`1px solid ${T.border}` }}>
        <span
          onClick={() => { setSlides(null); setCurrentSlide(0); setProblem(""); setSolution(""); setBuildPlan(""); setError(null); }}
          style={{
            fontSize:12, color:T.textDim, cursor:"pointer",
            borderBottom:"1px solid transparent", paddingBottom:1, transition:"all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color=T.textMuted; e.currentTarget.style.borderBottomColor=T.textMuted; }}
          onMouseLeave={e => { e.currentTarget.style.color=T.textDim; e.currentTarget.style.borderBottomColor="transparent"; }}
        >Start over with a new idea</span>
      </div>
    </div>
  );
}
function SkillsToLearn() {
  const [expandedSkill, setExpandedSkill] = useState(null);
  const [completedSteps, setCompletedSteps] = useState({});

  const toggleStep = (skillId, stepIdx) => {
    const key = `${skillId}-${stepIdx}`;
    setCompletedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const skills = [
    {
      id: "landing-page",
      title: "Build a Landing Page",
      time: "30 minutes",
      why: "A landing page is the fastest way to make your idea real. It forces you to articulate your value proposition in one sentence, gives you a URL to share, and lets you start collecting interest before you write a single line of product code.",
      steps: [
        {
          title: "Write your one-liner",
          detail: "Before touching code, write one sentence that explains what you're building and who it's for. This becomes your headline. If you can't explain it in one sentence, the idea isn't clear enough yet. Example: 'Automated invoicing for freelancers who hate chasing payments.'"
        },
        {
          title: "Set up a blank project",
          detail: "Create an index.html file. Add the HTML5 boilerplate, link a style.css file, and set a max-width container at 720px centered on the page. Use a system font stack so you don't need to load anything: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif."
        },
        {
          title: "Build the hero section",
          detail: "Your headline (the one-liner), a 2-sentence subheadline expanding on the value, and one call-to-action button. That's it. No navigation bar, no images, no features grid. The hero should make someone understand what you do in under 5 seconds."
        },
        {
          title: "Add a waitlist form",
          detail: "One email input, one submit button. Use Formspree.io or Google Forms as the backend — both are free and take 2 minutes to set up. Every email you collect is a signal that your idea resonates. This is your first metric."
        },
        {
          title: "Add social proof or urgency",
          detail: "Below the form, add one of these: a short testimonial quote (even from a friend who tested it), a counter ('47 people on the waitlist'), or a deadline ('Launching March 2026'). Social proof converts visitors into signups at 2-3x the rate of a bare page."
        },
        {
          title: "Deploy in 60 seconds",
          detail: "Push your files to a GitHub repo. Go to vercel.com, import the repo, and click Deploy. You now have a live URL with automatic HTTPS. Share it everywhere — in DMs, group chats, Twitter, Reddit. The point isn't perfection, it's getting real feedback from real people."
        },
      ],
      resources: [
        { label: "Vercel — free hosting, deploy from GitHub", url: "https://vercel.com" },
        { label: "Formspree — free form backend", url: "https://formspree.io" },
        { label: "YC: How to build a great landing page", url: "https://www.youtube.com/watch?v=_lEkD8IGkwo" },
      ],
    },
    {
      id: "mvp-vibe",
      title: "Ship an MVP Through Vibe Coding",
      time: "One weekend",
      why: "Vibe coding means describing what you want in plain English and letting AI write the code. You don't need to be a developer. Tools like Cursor, Replit Agent, and Claude let you go from idea to working prototype in hours, not weeks. The goal isn't production-grade code — it's a working thing you can put in front of users.",
      steps: [
        {
          title: "Define one core action",
          detail: "Your MVP does ONE thing. Write it as a sentence: 'A user can [action] so that [result].' Everything else — settings, profiles, dashboards, onboarding — is version 2. The tighter your scope, the faster you ship. If your MVP has more than 3 screens, you're overbuilding."
        },
        {
          title: "Pick your AI coding tool",
          detail: "Cursor (cursor.com) is the best if you have some coding familiarity — it's VS Code with AI built in. Replit Agent works entirely in the browser and can scaffold full apps from a description. For pure no-code, Bolt.new generates and deploys full-stack apps from a prompt. All have free tiers."
        },
        {
          title: "Write a detailed spec as your prompt",
          detail: "Don't just say 'build me a task app.' Write 2-3 paragraphs describing exactly what the user sees, what they can do, and what happens when they do it. Include the tech stack you want (Next.js + Supabase is a solid default). The better your spec, the better the output. Treat the AI like a contractor who needs a clear brief."
        },
        {
          title: "Build in conversation, not in one shot",
          detail: "Start with the database schema and auth. Get that working. Then build the main screen. Then add the core action. Test each piece before moving on. When something breaks, paste the error back into the AI and ask it to fix it. This iterative loop is faster than trying to generate everything at once."
        },
        {
          title: "Add auth and a database",
          detail: "Supabase gives you a Postgres database + auth + API for free. Set up email/password auth and one or two tables. This is the minimum for a real app — users can sign up, do the core action, and their data persists. Supabase's docs are AI-friendly, so you can paste them into your coding tool for context."
        },
        {
          title: "Deploy and share the link",
          detail: "Deploy to Vercel (for Next.js) or use Replit's built-in hosting. Your MVP is now live. Send the link to 10 people who match your target user. Watch them use it — where do they get confused? What do they try to do that doesn't work? Those observations are worth more than any amount of planning."
        },
      ],
      resources: [
        { label: "Cursor — AI-first code editor", url: "https://cursor.com" },
        { label: "Bolt.new — prompt to deployed app", url: "https://bolt.new" },
        { label: "Supabase — free backend + auth + database", url: "https://supabase.com" },
        { label: "YC: How to build your MVP", url: "https://www.youtube.com/watch?v=QRZ_l7cVzzU" },
      ],
    },
    {
      id: "customer-interviews",
      title: "Validate Through Customer Interviews",
      time: "1 week",
      why: "Most startups fail because they build something nobody wants. Customer interviews are the cheapest, fastest way to find out if your idea solves a real problem before you invest months building it. Five good conversations will teach you more than any amount of market research.",
      steps: [
        {
          title: "Write down your riskiest assumption",
          detail: "Every idea has a core bet. 'Freelancers hate invoicing enough to pay $20/month for a tool.' That's your riskiest assumption. Your interviews should attack this directly. If this assumption is wrong, the whole idea falls apart — so validate it first, not the easy stuff."
        },
        {
          title: "Find 5 people to interview",
          detail: "You need people who actually have the problem, not friends being nice. Post in relevant Reddit communities, Slack groups, or LinkedIn. The message is simple: 'I'm researching how [target group] handles [problem]. Would you be open to a 20-minute call? Happy to send you a $10 coffee gift card as thanks.' You'll be surprised how many people say yes."
        },
        {
          title: "Ask about behavior, not opinions",
          detail: "The golden rule: ask about the past, not the future. 'Walk me through the last time you dealt with [problem]' beats 'Would you use an app that...' every time. People are terrible at predicting their own behavior. But they can accurately tell you what they've actually done, what frustrated them, and what they tried."
        },
        {
          title: "Master the follow-up question",
          detail: "When someone says something interesting, don't move to the next question. Go deeper. 'Why was that frustrating?' 'What did you do next?' 'How much time did that take?' 'Have you tried to solve it?' The best insights come from the third or fourth follow-up, not the initial answer. Silence is also a tool — pause and let them fill it."
        },
        {
          title: "Write down exact quotes",
          detail: "During or right after each call, write the person's actual words, not your interpretation. 'I spend 3 hours every Friday chasing late invoices' is data. 'They seem frustrated with invoicing' is opinion. Exact quotes become your marketing copy, your pitch deck stats, and your feature priorities."
        },
        {
          title: "Find the pattern across all 5",
          detail: "After 5 interviews, lay out your quotes and look for repeats. If 4 out of 5 people describe the same frustration in similar words, you've found a real problem. If everyone describes a different pain point, your target audience is too broad. If nobody seems that bothered, the problem might not be painful enough to pay to solve."
        },
      ],
      resources: [
        { label: "The Mom Test — the essential book on customer interviews", url: "https://www.momtestbook.com" },
        { label: "YC: How to talk to users", url: "https://www.youtube.com/watch?v=MT4Ig2uqjTc" },
        { label: "Lenny Rachitsky: questions to ask in user interviews", url: "https://www.lennysnewsletter.com/p/my-favorite-user-interview-questions" },
      ],
    },
  ];

  const getProgress = (skillId, totalSteps) => {
    let done = 0;
    for (let i = 0; i < totalSteps; i++) {
      if (completedSteps[`${skillId}-${i}`]) done++;
    }
    return Math.round((done / totalSteps) * 100);
  };

  return (
    <div style={{ animation: "fadeUp 0.3s ease", maxWidth: 640 }}>
      <div style={{ display: "grid", gap: 0 }}>
        {skills.map((skill, si) => {
          const isExpanded = expandedSkill === skill.id;
          const progress = getProgress(skill.id, skill.steps.length);
          return (
            <div key={skill.id} style={{
              borderBottom: si < skills.length - 1 ? `1px solid ${T.border}` : "none",
              animation: `fadeUp 0.3s ease ${si * 0.06}s both`,
            }}>
              {/* Header */}
              <div onClick={() => setExpandedSkill(isExpanded ? null : skill.id)} style={{
                padding: "28px 0", cursor: "pointer",
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
              }}>
                <div>
                  <h3 style={{
                    fontFamily: "DM Serif Display, serif", fontSize: 22, fontWeight: 400,
                    letterSpacing: "-0.02em", lineHeight: 1.3,
                    color: isExpanded ? T.text : T.textMuted,
                    transition: "color 0.2s ease",
                  }}>{skill.title}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>{skill.time}</span>
                    <span style={{ fontSize: 12, color: T.textDim }}>{skill.steps.length} steps</span>
                    {progress > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: progress === 100 ? T.success : T.text }}>
                        {progress}% done
                      </span>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, color: T.textDim, flexShrink: 0, marginLeft: 20,
                  transition: "color 0.15s",
                }}>{isExpanded ? "Close" : "Open"}</span>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ paddingBottom: 36, animation: "fadeUp 0.2s ease" }}>
                  {/* Why this matters */}
                  <p style={{
                    fontSize: 14, color: T.textMuted, lineHeight: 1.8,
                    marginBottom: 32, maxWidth: 560,
                  }}>
                    {skill.why}
                  </p>

                  {/* Steps */}
                  <div>
                    {skill.steps.map((step, i) => {
                      const isDone = completedSteps[`${skill.id}-${i}`];
                      return (
                        <div key={i} style={{
                          padding: "18px 0",
                          borderTop: `1px solid ${T.border}`,
                          animation: `fadeUp 0.2s ease ${i * 0.04}s both`,
                        }}>
                          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                            {/* Checkbox */}
                            <div onClick={() => toggleStep(skill.id, i)} style={{
                              width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 2,
                              border: `1.5px solid ${isDone ? T.success : T.border}`,
                              background: isDone ? T.success + "15" : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", transition: "all 0.2s ease",
                              color: T.success, fontSize: 11, fontWeight: 700,
                            }}>
                              {isDone && "\u2713"}
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{
                                fontSize: 14, fontWeight: 600,
                                color: isDone ? T.textDim : T.text,
                                textDecoration: isDone ? "line-through" : "none",
                                transition: "all 0.2s ease", lineHeight: 1.4,
                              }}>
                                {step.title}
                              </p>
                              <p style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.75, marginTop: 6 }}>
                                {step.detail}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resources */}
                  {skill.resources && (
                    <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
                      <p style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: T.textDim, marginBottom: 12,
                      }}>Resources</p>
                      <div style={{ display: "grid", gap: 6 }}>
                        {skill.resources.map((r, ri) => (
                          <span key={ri}
                            onClick={() => window.open(r.url, "_blank")}
                            style={{
                              fontSize: 13, color: T.textMuted, cursor: "pointer",
                              lineHeight: 1.6, transition: "color 0.15s",
                              borderBottom: `1px solid transparent`, display: "inline-block",
                              width: "fit-content",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderBottomColor = T.textMuted; }}
                            onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderBottomColor = "transparent"; }}
                          >
                            {r.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function PitchDeckResources() {
  const [expandedSlide, setExpandedSlide] = useState(null);
  const slides = [
    {
      id: "cover",
      title: "Cover Slide",
      purpose: "First impression — you get 3 seconds",
      tips: [
        "Your cover should do one thing: make someone lean in. Company name, a one-line description of what you do, and nothing else. No mission statements, no team photos, no 'Founded in 2025.' The one-liner should be concrete enough that someone who reads it knows exactly what category you're in.",
        "White space is a design choice, not wasted space. The more cluttered your cover, the less confident you look. Investors see 20+ decks a week — the ones that stand out are the ones that breathe.",
        "If you have a compelling stat, lead with it above your company name. '40% of freelancer invoices are paid late' immediately creates tension and curiosity.",
      ],
      mistakes: [
        "Putting your tagline, mission, vision, AND description all on one slide. Pick one sentence.",
        "Using a busy background image. A dark or white solid background with clean type signals competence.",
        "Including contact info on the cover. That goes on the last slide.",
      ],
      example: "Acme — Invoicing that gets freelancers paid 2x faster. That's the entire slide. Logo top-left, one-liner centered, nothing else. Maybe a stat above it: '$48B in freelancer invoices are paid late every year.'",
    },
    {
      id: "problem",
      title: "The Problem",
      purpose: "Make the audience feel the pain before you offer the cure",
      tips: [
        "The strongest problem slides use a real quote from a real person. 'I spent 6 hours last month chasing a $2,000 invoice' hits harder than 'Freelancers struggle with late payments.' Pull directly from your customer interviews.",
        "Quantify the pain. Time wasted, money lost, frequency of the problem. 'The average freelancer spends 8 hours per month on invoicing admin' gives the audience a concrete grasp of severity.",
        "One problem, explored deeply. Resist the temptation to list 5 problems. If you have to list multiple, your focus is too broad. Investors want to fund solutions to one specific, well-understood pain — not a vague bundle of annoyances.",
      ],
      mistakes: [
        "Describing the problem abstractly. 'Communication is broken' means nothing. 'Remote teams lose 5 hours per week to context-switching between 7 different messaging tools' means something.",
        "Making the problem about you. 'We noticed that...' puts you at the center. Put the customer at the center. 'Freelancers report that...'",
        "Listing problems as bullet points with no narrative. Tell a story. Walk through a day in your customer's life where this problem ruins something.",
      ],
      example: "'Last Tuesday, I invoiced a client for $3,200. By Friday, nothing. I sent a follow-up. Then another. Two weeks later I got paid — minus a 'late processing fee' they made up. This happens every month.' — Sarah M., UX Designer. 63% of freelancers report being paid late on at least one invoice per quarter.",
    },
    {
      id: "solution",
      title: "Your Solution",
      purpose: "Show what you built, and connect it directly to the pain",
      tips: [
        "Lead with the outcome, not the feature list. 'Freelancers get paid in 3 days instead of 30' is better than 'We built an automated invoicing platform with smart follow-ups and payment tracking.' The outcome makes someone care; the features explain how after they already care.",
        "Show a screenshot or short demo. A real product screenshot signals that this thing actually exists. If you're pre-product, show a mockup — but make it look real. Never describe software in words alone when you could just show it.",
        "Draw an explicit line from the problem slide. If the problem was 'chasing payments takes 8 hours/month,' the solution should be 'Acme reduces that to zero.' The audience should feel the relief.",
      ],
      mistakes: [
        "Feature dumping. Listing 12 features makes everything feel equally unimportant. Highlight the one or two that directly solve the problem from the previous slide.",
        "Using jargon. 'AI-powered smart workflow automation engine' tells an investor nothing. 'It sends follow-up emails automatically so you don't have to' tells them everything.",
        "Showing a solution that doesn't match the problem. If your problem slide was about late payments, your solution slide shouldn't lead with 'beautiful invoice templates.'",
      ],
      example: "A single product screenshot showing an invoice being auto-sent, with a caption: 'Acme auto-sends invoices on delivery, follows up at day 7 and day 14, and deposits payment the day it arrives. Average time to payment: 4 days.' Clean, specific, visual.",
    },
    {
      id: "whynow",
      title: "Why Now",
      purpose: "Explain what changed in the world that makes this the right moment",
      tips: [
        "Every good startup is riding a wave. Something changed recently — a new technology, a regulatory shift, a cultural behavior change, a market dislocation — that makes your solution possible or necessary in a way it wasn't three years ago. Identify that change and make it the centerpiece of this slide.",
        "The strongest 'why now' answers are external, not internal. 'Because we finally built it' is not a reason. 'Because GPT-4 made it possible to automate invoice follow-ups at near-zero cost' is a reason. The shift should be something happening in the world, not something happening inside your company.",
        "Stack multiple tailwinds if you have them. A technology shift plus a behavior change plus a regulatory window is a compelling convergence. 'The freelance workforce grew 40% since 2020, payment processing APIs dropped to near-zero cost, and new state laws now penalize late invoice payments.' Each tailwind makes the others more powerful.",
      ],
      mistakes: [
        "Skipping this slide entirely. A lot of founders do, and it's a missed opportunity. 'Why now' is the difference between 'interesting idea' and 'urgent opportunity.' Without it, an investor wonders why nobody built this already.",
        "Being too vague. 'AI is changing everything' is not a why-now. 'LLM costs dropped 97% in 18 months, making it viable to process invoices with AI for under $0.01 each' is a why-now.",
        "Confusing 'why now' with 'why us.' This slide is about timing and market conditions, not your team's qualifications. The team slide handles that separately.",
      ],
      example: "Three converging forces: (1) The US freelance workforce hit 76M in 2025, up 40% since 2020 (McKinsey). (2) Stripe and Plaid APIs now enable instant payment verification at near-zero cost. (3) Five states passed prompt-payment laws in 2024, creating legal urgency around invoice timing. The window for an automated invoicing tool has never been more open.",
    },
    {
      id: "market",
      title: "Market Size",
      purpose: "Prove this opportunity is worth pursuing at scale",
      tips: [
        "Bottom-up math is always more credible than top-down. Don't start with 'The global invoicing market is $10B.' Start with: '60M freelancers in the US. 12M send invoices monthly. At $10/month, our serviceable obtainable market is $1.44B.' An investor can follow your logic and decide if they believe each step.",
        "Show your wedge. You're not going after the whole market on day one. Which specific slice do you own first? 'Starting with US-based UX/UI freelancers earning $50K+ annually' is a wedge. 'All freelancers everywhere' is not.",
        "Cite your sources. Every number should have a small source attribution. 'Bureau of Labor Statistics, 2025' or 'Internal survey, n=200.' Unsourced stats look invented.",
      ],
      mistakes: [
        "'If we capture just 1% of a $100B market.' Every investor has heard this, and it signals that you haven't done real market sizing. It also accidentally implies you have no strategy for how to capture that 1%.",
        "Conflating TAM and SAM. Your total addressable market is theoretical. Your serviceable addressable market is who you could realistically reach. Your serviceable obtainable market is who you'll actually get in the next 2-3 years. Only the last one matters for a seed deck.",
        "Using market size as a substitute for demand evidence. A big market doesn't mean anyone wants your specific product.",
      ],
      example: "60M freelancers in the US (BLS, 2025). 12M send invoices at least monthly. 3.2M earn $50K+ and are most likely to pay for tools (Upwork Freelancer Survey). At $10/month, SOM = $384M. Wedge: starting with design freelancers on Upwork and Fiverr (420K users).",
    },
    {
      id: "competition",
      title: "Competition",
      purpose: "Show you understand the landscape and where you win",
      tips: [
        "Never say you have no competition. If you say 'there are no competitors,' an investor hears one of two things: you haven't looked, or the market doesn't exist. There is always competition — even if it's spreadsheets, manual processes, or doing nothing. Acknowledge the landscape honestly and explain where you fit.",
        "The best competition slides show a 2x2 matrix or a simple positioning chart with two axes that matter to your customer. Pick axes where you naturally win. If your advantage is simplicity, use 'simple vs. complex' as one axis. If it's price, use 'affordable vs. enterprise.' Place competitors on the chart and show the gap you fill.",
        "Focus on your unfair advantage, not on trashing competitors. 'FreshBooks is built for accountants; we're built for solo freelancers who don't know accounting' is a positioning statement. 'FreshBooks sucks' is not. Respect for competitors signals maturity.",
      ],
      mistakes: [
        "The feature checklist with all green checkmarks for you and all red X's for everyone else. Every investor has seen this, and nobody believes it. If you're better at literally everything, something is wrong with your analysis.",
        "Listing 15 competitors. If your market has that many relevant players, you haven't segmented tightly enough. Pick the 3-5 that your target customer is most likely to compare you against.",
        "Ignoring indirect competition. Your biggest competitor might not be another software tool — it might be a spreadsheet, a VA, or the customer just not solving the problem at all. 'Do nothing' is often the hardest competitor to beat.",
      ],
      example: "A 2x2 matrix. X-axis: Built for accountants vs. Built for freelancers. Y-axis: Manual setup vs. Fully automated. FreshBooks sits in 'accountants + manual.' Wave sits in 'accountants + automated.' Acme sits alone in 'freelancers + fully automated' — the underserved quadrant. Below: 'No tool today serves non-technical freelancers with zero-setup automation. That's our gap.'",
    },
    {
      id: "traction",
      title: "Traction & Validation",
      purpose: "Prove that real people actually want this",
      tips: [
        "The hierarchy of traction signals, from strongest to weakest: revenue, paying users, active users, waitlist signups, LOIs (letters of intent), user interviews. Show the strongest signal you have. If you have revenue, lead with revenue. If you're pre-launch, lead with waitlist numbers or interview insights.",
        "Growth rate matters more than absolute numbers. '200 users' is unimpressive. '200 users, growing 25% week-over-week for 6 consecutive weeks' is a story about momentum. Always contextualize numbers with a rate of change.",
        "Retention is the metric that matters most. If people come back, you've built something they need. Show weekly or monthly retention. If 60%+ of users are still active after 4 weeks, that's strong signal at an early stage.",
      ],
      mistakes: [
        "Showing vanity metrics. Page views, app downloads, social media followers — these don't prove product-market fit. Someone downloading your app and never opening it again is not traction.",
        "Hiding bad numbers behind good ones. If you have 5,000 signups but only 50 active users, the 5,000 number is misleading. Investors will ask, and it's worse to be caught than to be honest.",
        "No graph. Traction slides should always have a visual. A line going up and to the right — even if the numbers are small — communicates momentum faster than any paragraph.",
      ],
      example: "A simple line chart. X-axis: weeks. Y-axis: active users. Below it: 'Launched 8 weeks ago. 520 active users, 91% weekly retention. $2,100 MRR, growing 28% MoM. Zero paid acquisition — all organic and word of mouth.'",
    },
    {
      id: "gtm",
      title: "Go-to-Market Strategy",
      purpose: "Show how you'll actually acquire customers — not theoretically, but concretely",
      tips: [
        "Describe your first channel in detail, not five channels in generalities. 'We'll grow through content marketing, partnerships, social media, paid ads, and referrals' is a list, not a strategy. 'We're embedding in Upwork's freelancer community — posting weekly case studies, doing free invoice audits, and converting forum readers to waitlist signups at 8% rate' is a strategy. Depth on one channel beats breadth on five.",
        "Show that you've already tested it. If you've run a small experiment — cold outreach that converted at 12%, a Reddit post that drove 200 signups, a partnership conversation with a platform — include the data. Investors want evidence that your go-to-market isn't theoretical. Even a small proof point changes the conversation from 'will this work?' to 'how do we scale this?'",
        "Explain your CAC and how it scales. If it costs you $15 to acquire a customer through manual outreach today, what does that look like at 10,000 customers? At some point you need a channel that doesn't require you personally DMing people. Show that you've thought about the transition from founder-led sales to scalable acquisition.",
      ],
      mistakes: [
        "Saying 'we'll go viral.' Virality is an outcome, not a strategy. No investor has ever funded a company because the founder said it would go viral. Show the mechanics: what makes someone share it, what's the referral loop, what's the K-factor?",
        "Confusing marketing channels with go-to-market strategy. 'We'll use Instagram and TikTok' is a channel choice. A go-to-market strategy answers: who is the first customer, how do you reach them, what makes them convert, and how do you do it again 1,000 times?",
        "No mention of sales cycle or conversion funnel. How long does it take from first touch to paying customer? What are the steps? If you don't know yet, say so — but show that you're thinking about it.",
      ],
      example: "Phase 1 (now): Founder-led outreach in freelancer communities. Posting weekly in r/freelance (42K members), Freelancers Union Slack (8K members), and 3 niche Facebook groups. Current conversion: 200 visitors/week, 8% to waitlist, 14% waitlist-to-active. CAC: $0 (time only). Phase 2 (post-raise): Content SEO targeting 'freelance invoice template' keywords (12K monthly searches, low competition). Phase 3: Referral program — give a friend 3 free months, get 1 free month. Target: 5,000 users in 6 months.",
    },
    {
      id: "business",
      title: "Business Model",
      purpose: "Show how you make money — simply and credibly",
      tips: [
        "Answer three questions and nothing else: Who pays you? How much? How often? 'Freelancers pay $10/month for unlimited invoicing' is a complete business model slide. You can add details if they help, but the core must be instantly understandable.",
        "If you have unit economics, show them. Customer Acquisition Cost (CAC), Lifetime Value (LTV), and the ratio between them. An LTV:CAC ratio above 3:1 is the benchmark. If you don't have real data yet, say so — and show your assumptions.",
        "Compare to proven models. 'Same model as Mailchimp — free tier for small users, paid tiers that scale with usage' gives an investor an instant mental anchor.",
      ],
      mistakes: [
        "Showing 6 revenue streams. At your stage, you have one. Maybe two. Listing hypothetical future revenue streams (licensing, enterprise, marketplace fees, advertising) signals that you haven't focused on what actually works today.",
        "Overcomplicating pricing tiers. If an investor can't understand your pricing in 10 seconds, your customers can't either.",
        "Ignoring the free-to-paid conversion question. If you have a free tier, investors will immediately wonder what % convert. Have that number, or a plan to find out.",
      ],
      example: "Freemium SaaS. Free: up to 5 invoices per month. Pro ($10/mo): unlimited invoices, auto-follow-ups, payment tracking. Team ($25/mo): multi-user, reporting. Current ARPU: $8.50. Free-to-paid conversion: 12% within 30 days.",
    },
    {
      id: "team",
      title: "The Team",
      purpose: "Show why you're the people who should build this",
      tips: [
        "One impressive line per person beats a full resume. 'Jane — 8 years in payments at Stripe, built their invoicing API' tells an investor everything they need. They don't need to know where she went to college or that she interned at Google in 2014.",
        "Show founder-market fit. Why do YOU care about this problem? Did you experience it yourself? Did you work in the industry? The best teams have a personal connection to the problem they're solving.",
        "If you're solo, show your support system. Advisors, early employees, technical collaborators. Being solo isn't a dealbreaker, but having no one around you is.",
      ],
      mistakes: [
        "Listing everyone who's ever helped. The team slide is for co-founders and maybe key hires. Your college roommate who designed the logo is not a team member.",
        "Headshots that look like LinkedIn stock photos. Use real, recent photos that show personality. You're asking someone to bet on humans, not resumes.",
        "No explanation of role clarity. If you have two co-founders, it should be obvious who does what. 'CEO / Business' and 'CTO / Product' is sufficient.",
      ],
      example: "Two headshots side by side. Jane Kim, CEO — 8 years in payments at Stripe, built invoicing API serving 400K businesses. Led product at invoice startup (acq. 2022). Marc Chen, CTO — Full-stack engineer, prev. Square. Built payment processing systems handling $2B annually. Below: 'Advised by [Name], former CFO of Intuit.'",
    },
    {
      id: "ask",
      title: "The Ask",
      purpose: "Tell them exactly what you want and what it buys",
      tips: [
        "Be specific about the amount and what it achieves. 'Raising $500K pre-seed to hire 2 engineers and reach 5,000 users by December' is actionable. An investor can evaluate whether $500K is reasonable for those milestones and whether those milestones are ambitious enough.",
        "Show 2-3 milestones the money unlocks. Not a 12-month roadmap — just the major inflection points. 'Hire engineering team → launch v2 with payment integration → hit $10K MRR.' Each milestone should build toward the next fundraise or profitability.",
        "End with a clear next step. 'I'd love to schedule a 30-minute deep dive. [email]. [calendly link].' Make it frictionless for them to say yes.",
      ],
      mistakes: [
        "Being vague. 'We're raising capital to accelerate growth' is the single most common bad ask slide. It tells the investor nothing about your plan.",
        "Not showing what comes after the money. Investors want to know what the next milestone is and when you'll need to raise again (or won't).",
        "Asking for too wide a range. '$500K to $2M' says you don't know what you need. Pick a number.",
      ],
      example: "Raising $500K on a $5M post-money SAFE. Use of funds: 60% engineering (2 senior hires), 25% growth experiments, 15% ops. Milestones: 5,000 active users, $10K MRR, launch payment processing by Q4. Next step: 30-min call — jane@acme.com",
    },
  ];

  return (
    <div style={{ animation: "fadeUp 0.3s ease", maxWidth: 640 }}>
      {/* Intro */}
      <div style={{ marginBottom: 36, display: "flex", gap: 24, alignItems: "flex-start" }}>
        <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.8, flex: 1 }}>
          A pitch deck is a sequence of slides that tell a story: there's a painful problem, you have a solution, the timing is right, the market is big enough, you know who you're up against, people already want it, you have a plan to reach them, you know how to make money, and your team is the one to build it. Each slide below breaks down what belongs on it, what doesn't, and what good looks like.
        </p>
        <button
          onClick={() => window.open("https://gamma.app", "_blank")}
          style={{
            flexShrink: 0, padding: "12px 20px", borderRadius: 10,
            fontSize: 13, fontWeight: 700, fontFamily: "Inter, DM Sans, sans-serif",
            background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
            color: "#fff", border: "none", cursor: "pointer",
            boxShadow: "0 4px 20px rgba(139,92,246,0.25)",
            transition: "all 0.2s ease", lineHeight: 1.4,
            textAlign: "center", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(139,92,246,0.35)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(139,92,246,0.25)"; }}
        >
          Build with Gamma →
          <span style={{ display: "block", fontSize: 10, fontWeight: 400, opacity: 0.75, marginTop: 2 }}>
            Auto-generate your deck
          </span>
        </button>
      </div>

      <div style={{ display: "grid", gap: 0 }}>
        {slides.map((slide, si) => {
          const isExpanded = expandedSlide === slide.id;
          return (
            <div key={slide.id} style={{
              borderBottom: si < slides.length - 1 ? `1px solid ${T.border}` : "none",
              animation: `fadeUp 0.3s ease ${si * 0.04}s both`,
            }}>
              {/* Header */}
              <div onClick={() => setExpandedSlide(isExpanded ? null : slide.id)} style={{
                padding: "24px 0", cursor: "pointer",
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <span style={{
                    fontFamily: "DM Serif Display, serif", fontSize: 14,
                    color: T.textDim, minWidth: 24,
                  }}>{String(si + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 style={{
                      fontFamily: "DM Serif Display, serif", fontSize: 20, fontWeight: 400,
                      letterSpacing: "-0.02em",
                      color: isExpanded ? T.text : T.textMuted,
                      transition: "color 0.2s ease",
                    }}>{slide.title}</h3>
                    <p style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{slide.purpose}</p>
                  </div>
                </div>
                <span style={{
                  fontSize: 12, color: T.textDim, flexShrink: 0, marginLeft: 20,
                  transition: "color 0.15s",
                }}>{isExpanded ? "Close" : "Open"}</span>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ paddingBottom: 36, paddingLeft: 40, animation: "fadeUp 0.2s ease" }}>
                  {/* Key Tips */}
                  <div style={{ marginBottom: 28 }}>
                    <p style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: T.textDim, marginBottom: 14,
                    }}>Key Tips</p>
                    <div style={{ display: "grid", gap: 12 }}>
                      {slide.tips.map((tip, ti) => (
                        <p key={ti} style={{
                          fontSize: 13, color: T.textMuted, lineHeight: 1.75,
                          paddingLeft: 14, borderLeft: `2px solid ${T.border}`,
                          animation: `fadeUp 0.2s ease ${ti * 0.04}s both`,
                        }}>{tip}</p>
                      ))}
                    </div>
                  </div>

                  {/* Common Mistakes */}
                  <div style={{ marginBottom: 28 }}>
                    <p style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: T.textDim, marginBottom: 14,
                    }}>Common Mistakes</p>
                    <div style={{ display: "grid", gap: 10 }}>
                      {slide.mistakes.map((mistake, mi) => (
                        <p key={mi} style={{
                          fontSize: 13, color: T.textMuted, lineHeight: 1.75,
                          paddingLeft: 14, borderLeft: `2px solid ${T.red}33`,
                          animation: `fadeUp 0.2s ease ${mi * 0.04}s both`,
                        }}>{mistake}</p>
                      ))}
                    </div>
                  </div>

                  {/* Example */}
                  <div>
                    <p style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: T.textDim, marginBottom: 14,
                    }}>Example</p>
                    <p style={{
                      fontSize: 13, color: T.text, lineHeight: 1.75,
                      fontStyle: "italic", opacity: 0.85,
                    }}>{slide.example}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FounderToolkit() {
  const [hoveredTool, setHoveredTool] = useState(null);

  const categories = [
    {
      title: "Design & Prototype",
      icon: "\uD83C\uDFA8",
      color: "#EC4899",
      tools: [
        { name: "Figma", desc: "Design interfaces collaboratively", url: "https://figma.com", tag: "Free tier" },
        { name: "Mobbin", desc: "UI/UX design inspiration from real apps", url: "https://mobbin.com", tag: "Free tier" },
      ],
    },
    {
      title: "Build & Ship",
      icon: "\u2692\uFE0F",
      color: "#3B82F6",
      tools: [
        { name: "Cursor", desc: "AI-powered code editor \u2014 build 10x faster", url: "https://cursor.com", tag: "Free tier" },
        { name: "Vercel", desc: "Deploy websites & apps instantly", url: "https://vercel.com", tag: "Free tier" },
        { name: "Supabase", desc: "Backend, database, auth \u2014 all in one", url: "https://supabase.com", tag: "Free tier" },
        { name: "Railway", desc: "Deploy any backend with zero config", url: "https://railway.app", tag: "Free tier" },
        { name: "GitHub", desc: "Version control & collaboration", url: "https://github.com", tag: "Free" },
      ],
    },
    {
      title: "Marketing & Growth",
      icon: "\uD83D\uDCC8",
      color: "#F59E0B",
      tools: [
        { name: "Mailchimp", desc: "Email marketing & newsletters", url: "https://mailchimp.com", tag: "Free tier" },
        { name: "Buffer", desc: "Schedule social media posts", url: "https://buffer.com", tag: "Free tier" },
        { name: "Typefully", desc: "Write & schedule Twitter threads", url: "https://typefully.com", tag: "Free tier" },
        { name: "Google Trends", desc: "Validate demand & spot trends", url: "https://trends.google.com", tag: "Free" },
      ],
    },
    {
      title: "Analytics & Feedback",
      icon: "\uD83D\uDD0D",
      color: "#10B981",
      tools: [
        { name: "Hotjar", desc: "Heatmaps & user behavior recordings", url: "https://hotjar.com", tag: "Free tier" },
        { name: "Tally", desc: "Beautiful forms & surveys", url: "https://tally.so", tag: "Free" },
      ],
    },
  ];

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px", borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`,
        marginBottom: 20, display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{ fontSize: 28 }}>{"\uD83D\uDEE0\uFE0F"}</span>
        <div>
          <p style={{ fontFamily: "DM Serif Display, serif", fontSize: 18, fontWeight: 400 }}>Ship faster with the right tools</p>
          <p style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Curated apps and platforms to take your idea from zero to launched. Most have free tiers.</p>
        </div>
      </div>

      {/* Tool Grid */}
      <div style={{ display: "grid", gap: 20 }}>
        {categories.map((cat, ci) => (
          <div key={cat.title} style={{ animation: `fadeUp 0.3s ease ${ci * 0.05}s both` }}>
            <h3 style={{
              fontFamily: "DM Serif Display, serif", fontSize: 17, fontWeight: 400, marginBottom: 12,
              display: "flex", alignItems: "center", gap: 8, color: cat.color,
            }}>
              <span>{cat.icon}</span> {cat.title}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {cat.tools.map((tool) => {
                const isHovered = hoveredTool === tool.name;
                return (
                  <div key={tool.name}
                    onClick={() => window.open(tool.url, "_blank")}
                    onMouseEnter={() => setHoveredTool(tool.name)}
                    onMouseLeave={() => setHoveredTool(null)}
                    style={{
                      padding: "16px 18px", borderRadius: 12,
                      background: isHovered ? `linear-gradient(135deg, ${T.bgCard}, ${cat.color}06)` : T.bgCard,
                      border: `1px solid ${isHovered ? cat.color + "33" : T.border}`,
                      cursor: "pointer", transition: "all 0.2s ease",
                      transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                      boxShadow: isHovered ? `0 6px 24px ${cat.color}15` : "none",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <p style={{ fontFamily: "DM Serif Display, serif", fontSize: 15, fontWeight: 400 }}>{tool.name}</p>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                        background: cat.color + "12", color: cat.color, border: `1px solid ${cat.color}18`,
                      }}>{tool.tag}</span>
                    </div>
                    <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.4 }}>{tool.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Admin Create Profile ---
function AdminCreateProfile({ role, onSave, onCancel }) {
  const isMember = role === "member";
  const [data, setData] = useState(
    isMember
      ? { photo:"",name:"",email:"",experience:"",skills:[],interests:[],highlights:"",stage:"",needsHelp:"",projectName:"",projectDesc:"",projectStatus:"",projectFiles:[],projectUrl:"",linkedin:"",phone:"" }
      : { photo:"",name:"",email:"",skills:[],focusArea:"",experience:"",helpMethods:[],contactInfo:"",howToHelp:"",phone:"" }
  );
  const [saving, setSaving] = useState(false);
  const up = (f, v) => setData(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!data.name.trim()) return;
    setSaving(true);
    await onSave(data);
    setSaving(false);
  };

  return (
    <div style={{
      background:T.bgCard, borderRadius:16, border:`1px solid ${T.border}`,
      padding:28, maxWidth:560, animation:"fadeUp 0.3s ease",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <span style={{ fontSize:24 }}>{isMember ? "👤" : "🌟"}</span>
        <div>
          <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:20, fontWeight:400 }}>
            Create {isMember ? "Member" : "Mentor"} Profile
          </h3>
          <p style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>Fill in as much or as little as you want.</p>
        </div>
      </div>

      <PhotoUpload photo={data.photo} onUpload={v => up("photo",v)} />
      <Input label="Name" value={data.name} onChange={v => up("name",v)} placeholder="Full name" />
      <Input label="Email" type="email" value={data.email} onChange={v => up("email",v)} placeholder="Their email address (they'll use this to log in)" />
      <Input label={isMember?"Experience":"Experience / Credentials"} value={data.experience||""} onChange={v => up("experience",v)} placeholder="Brief background" textarea />
      <TagInput label="Skills" tags={data.skills||[]} onChange={v => up("skills",v)} placeholder="Add skills..." suggestions={SKILL_SUGGESTIONS} />

      {isMember && (<>
        <TagInput label="Interests" tags={data.interests||[]} onChange={v => up("interests",v)} placeholder="Add interests..." suggestions={INTEREST_SUGGESTIONS} />
        <SelectInput label="Current stage" value={data.stage||""} onChange={v => up("stage",v)} options={STAGE_OPTIONS} />
        <Input label="Needs help with" textarea value={data.needsHelp||""} onChange={v => up("needsHelp",v)} placeholder="What are they looking for?" />
        <Input label="Highlights" textarea value={data.highlights||""} onChange={v => up("highlights",v)} placeholder="Awards, achievements..." optional />
        <div style={{ padding:16, borderRadius:12, background:T.bgHover, border:`1px solid ${T.border}`, marginBottom:16 }}>
          <p style={{ fontSize:13, fontWeight:600, color:T.textMuted, marginBottom:12 }}>Project Spotlight</p>
          <Input label="Project name" value={data.projectName||""} onChange={v => up("projectName",v)} optional />
          <Input label="Description" value={data.projectDesc||""} onChange={v => up("projectDesc",v)} optional />
          <SelectInput label="Status" value={data.projectStatus||""} onChange={v => up("projectStatus",v)} options={["Idea stage","Building MVP","Live / Launched","Growing"]} />
          <Input label="Project URL" placeholder="https://yourproject.com" value={data.projectUrl||""} onChange={v => up("projectUrl",v)} optional />
          <ProjectFilesUpload files={data.projectFiles||[]} onChange={v => up("projectFiles",v)} />
        </div>
        <Input label="LinkedIn URL" value={data.linkedin||""} onChange={v => up("linkedin",v)} optional />
        <Input label="Phone number" placeholder="(555) 123-4567" value={data.phone||""} onChange={v => up("phone",v)} optional />
      </>)}

      {!isMember && (<>
        <SelectInput label="Area of Focus" value={data.focusArea||""} onChange={v => up("focusArea",v)} options={FOCUS_AREAS} />
        <Input label="How they want to help" textarea value={data.howToHelp||""} onChange={v => up("howToHelp",v)} />
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:600, color:T.textMuted, marginBottom:8 }}>Preferred methods</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {HELP_METHODS.map(m => {
              const sel = data.helpMethods?.includes(m);
              return <button key={m} onClick={() => up("helpMethods",sel?data.helpMethods.filter(x=>x!==m):[...(data.helpMethods||[]),m])}
                style={{ padding:"7px 14px", borderRadius:8, fontSize:13, fontFamily:"Inter", border:`1.5px solid ${sel?T.red:T.border}`, background:sel?T.redSoft:"transparent", color:sel?T.red:T.textMuted, cursor:"pointer" }}>{m}</button>;
            })}
          </div>
        </div>
        <Input label="Contact info" value={data.contactInfo||""} onChange={v => up("contactInfo",v)} placeholder="Email, Slack, etc." />
        <Input label="Phone number" placeholder="(555) 123-4567" value={data.phone||""} onChange={v => up("phone",v)} optional />
      </>)}

      <div style={{ display:"flex", gap:12, marginTop:20 }}>
        <button onClick={onCancel} style={{
          padding:"10px 24px", borderRadius:10, fontSize:14, fontFamily:"Inter", fontWeight:500,
          background:"transparent", border:`1.5px solid ${T.border}`, color:T.textMuted, cursor:"pointer",
        }}>Cancel</button>
        <button onClick={handleSave} disabled={!data.name.trim()||saving} style={{
          padding:"10px 28px", borderRadius:10, fontSize:14, fontFamily:"Inter", fontWeight:700,
          background:data.name.trim()?T.red:T.border, color:data.name.trim()?T.white:T.textDim,
          border:"none", cursor:data.name.trim()?"pointer":"default",
          boxShadow:data.name.trim()?`0 0 20px ${T.redGlow}`:"none",
 }}>{saving?"Creating...":"Create Profile "}</button>
      </div>
    </div>
  );
}

// --- Admin Page ---
function AdminPage() {
  const [tab, setTab] = useState("posts");
  const [codes, setCodes] = useState(DEFAULT_CODES);
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Post form
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postType, setPostType] = useState("highlight");
  const [postLink, setPostLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Profile editing / creating
  const [editingProfile, setEditingProfile] = useState(null);
  const [creatingRole, setCreatingRole] = useState(null); // "member" | "mentor" | null

  useEffect(() => {
    (async () => {
      setCodes(await db.getCodes());
      setPosts(await db.getPosts());
      setProfiles(await db.getProfiles());
      setLoaded(true);
    })();
  }, []);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(""), 2500); };

  const savePost = async () => {
    if (!postTitle.trim()) return;
    setSaving(true);
    try {
      const post = await db.createPost({ title: postTitle.trim(), content: postContent.trim(), type: postType, link: postLink.trim() });
      setPosts(prev => [post, ...prev]);
      setPostTitle(""); setPostContent(""); setPostLink("");
      flash("Post published!");
    } catch (e) { console.error(e); flash("Failed to publish."); }
    setSaving(false);
  };

  const deletePost = async (id) => {
    await db.deletePost(id);
    setPosts(prev => prev.filter(p => p.id !== id));
    flash("Post deleted.");
  };

  const saveCodes = async () => {
    await db.updateCodes(codes);
    flash("Access codes updated!");
  };

  const deleteProfile = async (id) => {
    await db.deleteProfile(id);
    setProfiles(prev => prev.filter(p => p.id !== id));
    flash("Profile deleted.");
  };

  const adminTabs = [
    { id:"posts", label:"Posts", icon:"📝" },
    { id:"codes", label:"Access Codes", icon:"🔑" },
    { id:"profiles", label:"Manage Profiles", icon:"👥" },
  ];

  if (!loaded) return <PageShell title="Admin Panel" subtitle="Loading..."><div /></PageShell>;

  return (
    <PageShell title="Admin Panel" subtitle="Manage your club">
      {/* Toast */}
      {msg && (
        <div style={{
          position:"fixed", top:20, right:20, zIndex:2000, padding:"12px 24px", borderRadius:10,
          background:T.success, color:T.bg, fontWeight:700, fontSize:13, fontFamily:"Inter",
          animation:"scaleIn 0.2s ease", boxShadow:`0 4px 20px ${T.successGlow}`,
        }}>{msg}</div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:24 }}>
        {adminTabs.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"9px 18px", borderRadius:10, fontSize:13, fontWeight:active?700:500, fontFamily:"Inter",
              background:active?T.redSoft:"transparent", color:active?T.red:T.textMuted,
              border:`1.5px solid ${active?T.red:T.border}`, cursor:"pointer", transition:"all 0.15s",
              display:"flex", alignItems:"center", gap:6,
            }}><span>{t.icon}</span>{t.label}</button>
          );
        })}
      </div>

      {/* Posts Tab */}
      {tab === "posts" && (
        <div style={{ animation:"fadeUp 0.3s ease" }}>
          {/* Create Post */}
          <div style={{ background:T.bgCard, borderRadius:16, border:`1px solid ${T.border}`, padding:24, marginBottom:20 }}>
            <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:18, fontWeight:400, marginBottom:16 }}>New Announcement</h3>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              {["highlight","opportunity","event"].map(t => (
                <button key={t} onClick={() => setPostType(t)} style={{
                  padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:postType===t?700:400, fontFamily:"Inter",
                  background:postType===t ? (t==="highlight"?"#F59E0B18":t==="opportunity"?"#3B82F618":"#8B5CF618") : "transparent",
                  color:postType===t ? (t==="highlight"?"#F59E0B":t==="opportunity"?"#3B82F6":"#8B5CF6") : T.textDim,
                  border:`1px solid ${postType===t ? (t==="highlight"?"#F59E0B":t==="opportunity"?"#3B82F6":"#8B5CF6")+"44" : T.border}`,
                  cursor:"pointer", textTransform:"capitalize",
                }}>{t==="highlight"?"⭐":t==="opportunity"?"💼":"📅"} {t}</button>
              ))}
            </div>
            <Input label="Title" value={postTitle} onChange={setPostTitle} placeholder="Announcement title..." />
            <Input label="Content" value={postContent} onChange={setPostContent} placeholder="What's the announcement about?" textarea />
            <Input label="Link" value={postLink} onChange={setPostLink} placeholder="https://... (optional)" optional />
            <button onClick={savePost} disabled={!postTitle.trim()||saving} style={{
              padding:"10px 28px", borderRadius:10, fontSize:14, fontWeight:700, fontFamily:"Inter",
              background:postTitle.trim()?T.red:T.border, color:postTitle.trim()?T.white:T.textDim,
              border:"none", cursor:postTitle.trim()?"pointer":"default",
            }}>{saving?"Publishing...":"Publish →"}</button>
          </div>

          {/* Existing Posts */}
          <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:18, fontWeight:400, marginBottom:12 }}>Published ({posts.length})</h3>
          {posts.length === 0 ? (
            <p style={{ color:T.textDim, fontSize:13 }}>No posts yet. Create your first announcement above.</p>
          ) : (
            <div style={{ display:"grid", gap:10 }}>
              {posts.map(post => {
                const tc = post.type==="highlight"?"#F59E0B":post.type==="opportunity"?"#3B82F6":"#8B5CF6";
                return (
                  <div key={post.id} style={{
                    padding:16, borderRadius:12, background:T.bgCard, border:`1px solid ${T.border}`,
                    borderLeft:`3px solid ${tc}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                  }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", color:tc }}>{post.type}</span>
                        <span style={{ fontSize:11, color:T.textDim }}>{new Date(post.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontFamily:"DM Serif Display, serif", fontSize:15, fontWeight:400 }}>{post.title}</p>
                      {post.content && <p style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>{post.content.slice(0,100)}{post.content.length>100?"...":""}</p>}
                    </div>
                    <button onClick={() => deletePost(post.id)} style={{
                      padding:"6px 12px", borderRadius:6, fontSize:11, fontFamily:"Inter",
                      background:"transparent", border:`1px solid ${T.border}`, color:T.textDim, cursor:"pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=T.red; e.currentTarget.style.color=T.red; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textDim; }}>
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Access Codes Tab */}
      {tab === "codes" && (
        <div style={{ animation:"fadeUp 0.3s ease" }}>
          <div style={{ background:T.bgCard, borderRadius:16, border:`1px solid ${T.border}`, padding:24, maxWidth:480 }}>
            <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:18, fontWeight:400, marginBottom:6 }}>Access Codes</h3>
            <p style={{ fontSize:13, color:T.textMuted, marginBottom:20 }}>Change these weekly. Share member code with members, mentor code with mentors.</p>

            <Input label="Member Code (6 digits)" value={codes.member} onChange={v => setCodes(p=>({...p,member:v.replace(/\D/g,"").slice(0,6)}))} placeholder="000000" />
            <Input label="Mentor Code (6 digits)" value={codes.mentor} onChange={v => setCodes(p=>({...p,mentor:v.replace(/\D/g,"").slice(0,6)}))} placeholder="000000" />
            <Input label="Admin Code (6 digits)" value={codes.admin} onChange={v => setCodes(p=>({...p,admin:v.replace(/\D/g,"").slice(0,6)}))} placeholder="000000" />

            <button onClick={saveCodes} style={{
              padding:"10px 28px", borderRadius:10, fontSize:14, fontWeight:700, fontFamily:"Inter",
              background:T.red, color:T.white, border:"none", cursor:"pointer",
              boxShadow:`0 0 20px ${T.redGlow}`,
            }}>Save Codes</button>

            <div style={{ marginTop:20, padding:14, borderRadius:10, background:T.bgHover, border:`1px solid ${T.border}` }}>
              <p style={{ fontSize:11, color:T.textDim }}>
                <span style={{ fontWeight:700, color:T.red }}>Tip:</span> Change codes each week for security. Members will need the new code if they log out.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Manage Profiles Tab */}
      {tab === "profiles" && (
        <div style={{ animation:"fadeUp 0.3s ease" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <p style={{ fontSize:13, color:T.textMuted }}>{profiles.length} profiles total</p>
            {!editingProfile && !creatingRole && (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setCreatingRole("member")} style={{
                  padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"Inter",
                  background:T.redSoft, color:T.red, border:`1px solid ${T.red}33`, cursor:"pointer",
                  display:"flex", alignItems:"center", gap:6, transition:"all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background=T.red+"30"}
                onMouseLeave={e => e.currentTarget.style.background=T.redSoft}>
                  + New Member
                </button>
                <button onClick={() => setCreatingRole("mentor")} style={{
                  padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"Inter",
                  background:"#A855F715", color:"#A855F7", border:"1px solid #A855F733", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:6, transition:"all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background="#A855F730"}
                onMouseLeave={e => e.currentTarget.style.background="#A855F715"}>
                  + New Mentor
                </button>
              </div>
            )}
          </div>

          {/* Creating new profile */}
          {creatingRole && !editingProfile && (
            <AdminCreateProfile role={creatingRole}
              onSave={async (profileData) => {
                const newProfile = await db.createProfile({ role: creatingRole, ...profileData });
                setProfiles(prev => [newProfile, ...prev]);
                setCreatingRole(null);
                flash(`${creatingRole.charAt(0).toUpperCase()+creatingRole.slice(1)} profile created!`);
              }}
              onCancel={() => setCreatingRole(null)}
            />
          )}

          {/* Editing existing profile */}
          {editingProfile && !creatingRole ? (
            <EditProfilePage profile={editingProfile}
              onSave={async (updatedProfile) => {
                setProfiles(prev => prev.map(p => p.id === editingProfile.id ? updatedProfile : p));
                setEditingProfile(null);
                flash("Profile updated!");
              }}
              onCancel={() => setEditingProfile(null)}
            />
          ) : !creatingRole && (
            <div style={{ display:"grid", gap:8 }}>
              {profiles.length === 0 && (
                <div style={{ padding:32, borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, textAlign:"center" }}>
                  <p style={{ fontSize:24, marginBottom:8 }}>👤</p>
                  <p style={{ color:T.textDim, fontSize:13 }}>No profiles yet. Create one using the buttons above.</p>
                </div>
              )}
              {profiles.map(p => (
                <div key={p.id} style={{
                  display:"flex", alignItems:"center", gap:14, padding:"12px 16px", borderRadius:12,
                  background:T.bgCard, border:`1px solid ${T.border}`,
                }}>
                  <Avatar photo={p.photo} name={p.name} size={36} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</p>
                    <p style={{ fontSize:11, color:T.textDim, textTransform:"capitalize" }}>{p.role}</p>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => setEditingProfile(p)} style={{
                      padding:"5px 12px", borderRadius:6, fontSize:11, fontFamily:"Inter",
                      background:T.bgHover, border:`1px solid ${T.border}`, color:T.textMuted, cursor:"pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=T.red; e.currentTarget.style.color=T.red; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textMuted; }}>Edit</button>
                    <button onClick={() => deleteProfile(p.id)} style={{
                      padding:"5px 12px", borderRadius:6, fontSize:11, fontFamily:"Inter",
                      background:"transparent", border:`1px solid ${T.border}`, color:T.textDim, cursor:"pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="#EF4444"; e.currentTarget.style.color="#EF4444"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textDim; }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

// --- Auth Screen (Login / Sign Up) ---
function AuthScreen({ role, onSuccess }) {
  const [mode, setMode] = useState("login"); // "login" or "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Email and password are required."); return; }
    if (mode === "signup" && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      let user;
      if (mode === "signup") {
        user = await db.signUp(email.trim(), password);
      } else {
        user = await db.signIn(email.trim(), password);
      }
      // Check if this user already has a profile
      const profile = await db.getProfileByUserId(user.id);
      if (profile) {
        // Existing profile — go straight to app
        onSuccess({ user, profile, needsOnboarding: false });
      } else if (mode === "login") {
        // Logging in but no profile — check for admin-created profile by email
        const emailProfile = await db.getProfileByEmail(email.trim());
        if (emailProfile && !emailProfile.userId) {
          // Claim admin-created profile
          const claimed = await db.claimProfile(emailProfile.id, user.id);
          onSuccess({ user, profile: claimed, needsOnboarding: false });
        } else {
          // No profile at all — need onboarding
          onSuccess({ user, profile: null, needsOnboarding: true });
        }
      } else {
        // Sign up — check for admin-created profile by email
        const emailProfile = await db.getProfileByEmail(email.trim());
        if (emailProfile && !emailProfile.userId) {
          onSuccess({ user, profile: emailProfile, needsOnboarding: true }); // will merge in onboarding
        } else {
          onSuccess({ user, profile: null, needsOnboarding: true });
        }
      }
    } catch (e) {
      console.error("Auth error:", e);
      if (e.message?.includes("Invalid login")) setError("Wrong email or password.");
      else if (e.message?.includes("already registered")) setError("An account with this email already exists. Try logging in.");
      else setError(e.message || "Something went wrong. Try again.");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, position: "relative", overflow: "hidden", background: T.bg,
    }}>
      <ArrowDecor style={{ top: -100, left: -120, transform: "rotate(-20deg)" }} />

      <div style={{
        width: "100%", maxWidth: 420, animation: "fadeUp 0.4s ease",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Logo size={36} />
          <h1 style={{
            fontFamily: "Outfit", fontSize: 24, fontWeight: 800,
            letterSpacing: "-0.02em", marginTop: 16,
          }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ color: T.textMuted, fontSize: 14, marginTop: 8 }}>
            {mode === "login"
              ? "Log in to access your profile."
              : "Sign up to join the club."
            }
          </p>
          <span style={{
            display: "inline-block", marginTop: 10, padding: "3px 12px", borderRadius: 6,
            fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            background: T.redSoft, color: T.red, border: `1px solid ${T.red}22`,
          }}>
            {role} access
          </span>
        </div>

        {/* Form */}
        <div style={{
          background: T.bgCard, borderRadius: 20, padding: "32px 28px",
          border: `1px solid ${T.border}`,
        }}>
          <Input label="Email" type="email" placeholder="you@example.com"
            value={email} onChange={setEmail} />
          <div onKeyDown={handleKeyDown}>
            <Input label="Password" type="password"
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              value={password} onChange={setPassword} />
          </div>

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: T.red + "12", color: T.red, border: `1px solid ${T.red}22`,
              marginBottom: 16, animation: "scaleIn 0.2s ease",
            }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            fontSize: 14, fontFamily: "DM Sans", fontWeight: 700,
            background: T.red, color: T.white, border: "none",
            cursor: loading ? "default" : "pointer",
            boxShadow: `0 0 20px ${T.redGlow}`,
            opacity: loading ? 0.7 : 1, transition: "all 0.2s ease",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = "scale(1.02)"; }}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>

          <div style={{ textAlign: "center", marginTop: 18 }}>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
              {" "}
              <span onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                style={{ color: T.red, fontWeight: 600, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                {mode === "login" ? "Sign up" : "Log in"}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- App Shell ---
function AppShell({ role, profile, onLogout, onProfileUpdate }) {
  const [page, setPage] = useState("dashboard");
  const [editing, setEditing] = useState(false);
  const pages = {
    dashboard: <DashboardPage role={role} onNav={setPage} />,
    members: <MembersPage />,
    mentors: <MentorsPage />,
    resources: <ResourcesPage />,
    admin: <AdminPage />,
    myprofile: editing
      ? <EditProfilePage profile={profile} onSave={(d) => { onProfileUpdate(d); setEditing(false); }} onCancel={() => setEditing(false)} />
      : <MyProfilePage profile={profile} onEdit={() => setEditing(true)} />,
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
      <Sidebar active={page} onNav={(p) => { setPage(p); setEditing(false); }} role={role} onLogout={onLogout} profileName={profile?.name} />
      <div style={{ flex:1, overflow:"auto" }}>
        {pages[page] || pages.dashboard}
      </div>
    </div>
  );
}

// --- Root ---
export default function SideHustleClub() {
  const [view, setView] = useState("loading");
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);

  // On mount: check if user is already logged in via Supabase Auth
  useEffect(() => {
    (async () => {
      try {
        const user = await db.getAuthUser();
        if (user) {
          // User is authenticated — find their profile
          const p = await db.getProfileByUserId(user.id);
          const storedRole = getStoredRole();
          if (p) {
            setRole(p.role);
            setStoredRole(p.role);
            setProfile(p);
            setView("app");
          } else if (storedRole === "admin") {
            setRole("admin");
            setView("app");
          } else if (storedRole) {
            setRole(storedRole);
            setView("onboarding");
          } else {
            // Logged in but no role stored — go to landing for code
            await db.signOut();
            setView("landing");
          }
        } else {
          setView("landing");
        }
      } catch (e) {
        console.error("Session restore failed:", e);
        setView("landing");
      }
    })();
  }, []);

  // Step 1: Access code entered → go to auth screen
  const handleAccessSuccess = (r) => {
    setRole(r);
    setStoredRole(r);
    setView("auth");
  };

  // Step 2: Auth complete → go to app or onboarding
  const handleAuthSuccess = ({ user, profile: foundProfile, needsOnboarding }) => {
    if (foundProfile && !needsOnboarding) {
      setProfile(foundProfile);
      setView("app");
    } else if (role === "admin" && !needsOnboarding) {
      setView("app");
    } else {
      setView("onboarding");
    }
  };

  // Step 3: Onboarding complete → go to app
  const handleOnboardingComplete = (p) => { setProfile(p); setView("app"); };

  const handleProfileUpdate = async (updatedProfile) => {
    setProfile(updatedProfile);
  };

  const handleLogout = async () => {
    await db.signOut();
    clearStoredRole();
    setRole(null); setProfile(null); setView("landing");
  };

  if (view === "loading") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:T.bg }}>
      <style>{GLOBAL_CSS}</style><Logo size={40} />
    </div>
  );

  return (
    <div style={{ background:T.bg, minHeight:"100vh" }}>
      <style>{GLOBAL_CSS}</style>
      {view === "landing" && <LandingPage onSuccess={handleAccessSuccess} />}
      {view === "auth" && <AuthScreen role={role} onSuccess={handleAuthSuccess} />}
      {view === "onboarding" && <Onboarding role={role} onComplete={handleOnboardingComplete} />}
      {view === "app" && <AppShell role={role} profile={profile} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />}
    </div>
  );
}
