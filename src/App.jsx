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

// Role stored in localStorage between access code entry and getting started
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

  // --- Profiles ---
  async getProfiles(role) {
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (role) query = query.eq("role", role);
    const { data } = await query;
    return (data || []).map(rowToProfile);
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
  @keyframes heroFadeIn { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
  @keyframes specItemIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
  @keyframes memberCardIn { from{opacity:0;transform:scale(0.9) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes arrowFlyIn {
    0% { opacity:0; transform:translate(-50%,-50%) scale(0.1) rotate(-30deg); }
    60% { opacity:1; transform:translate(-50%,-50%) scale(1.15) rotate(5deg); }
    80% { transform:translate(-50%,-50%) scale(0.95) rotate(-2deg); }
    100% { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
  }
  @keyframes arrowGlow {
    0% { box-shadow: 0 0 0px rgba(231,110,110,0); }
    50% { box-shadow: 0 0 80px rgba(231,110,110,0.4), 0 0 160px rgba(231,110,110,0.15); }
    100% { box-shadow: 0 0 40px rgba(231,110,110,0.2), 0 0 80px rgba(231,110,110,0.08); }
  }
  @keyframes arrowLaunchOff {
    0% { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
    30% { opacity:1; transform:translate(-50%,-45%) scale(1.3) rotate(-8deg); }
    100% { opacity:0; transform:translate(-50%,-250%) scale(0.3) rotate(15deg); }
  }
  @keyframes flashWhite {
    0% { opacity:0; }
    15% { opacity:0.6; }
    100% { opacity:0; }
  }
`;

const ARROW_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAADsCAYAAABdY7u7AACi7ElEQVR42uz9ebRdV37fB35/e+9zzp3vfe++ecJIAHwgCZLgAIIDQJBFlebBRtmOnUiRHUmxLbu7V7vTSZaLhJ10ujtZq1fH9vKSktWrHauXE0FtrSS2VaUqFvE4T+AIgCSIGQ9vHu58pr1/v/7jXJAstRRVSUVZrrqfxbf4ePEmPuzv+Q37NwADBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwY8MMODX4FA34UeBZQU4cP62h0VAHApUuXMHzpUnoK4MFvZ8CAf8c5Cehnjx0zgpP6D1o1ARSyt4FFHzDg37Uz/eyzz9LBCxfo5OnTTIB89if3jBd/liZGdZJ470abratX11a/oAMZCH3AgH93zvJ3C/bwYe9nOp3ciFJ7R7R+vGbpQea4suXR5Q55v/mb585dOnkScvo03EDoAwb8eY+/Ab0PkBOA/VzpO3L/3k7zs3PG/+qcyj86zTIz3Osq0YnZqlfpLZf8m9e2t/7hdxZX3/ztkyf1106f/qEVuxkckwH/rop7+Ktf9XDpEu65dMk9CaQAgJnK8C8P73lmF6cPDSfxbMXxwUkX7+d282quG71RT1JPqzQohL3S0nD5sSPDtfu/s7j65vm1NXoWUKcyj0AGQh8w4N8SJ0+e1PPnz+upfF5+7ezZVL7xjfj2nx07cOCug6IO1T3v0Z2iv1qNk6l8K2qP2iQeTZMV1WneJOa2D1Qs0EMULVbKudFyYKYA4ODCgpwE5NTAog8Y8G/HcuPYMYWFBf4Hp3/HCSRzr+fh/5w5sHPO6eq4lTtKzv5Cge1RP3F6liM90e6uFhvNjTzHEWBJgYZIezsAkAhvxcpjeL7W2iMAOAkI/RAn5AZCH/DnFQKA5wChhQWbvSTqnnvG85NJUJmm4Ngc01+tJrx3NEmLM5yMDCeRoNF+28TRegV6OACNG1IlgQZEOceIBC62kK7TuoB8oZavVCIAeK7/MBkIfcCAP0OR/8bhw2apVBL1mciBnz4w/dBcL/cLk8bcP2Vp726HHcV2FJlO4xMvbn+SF1fygUpO0YSBy+wzESJwNyYKlVIlI0yWiW0Q1CMotEXiH4Vf6EDoA/58uOfz86ZVqegDaWp/7ezZ9FfPnk0B4MCDB/Y9nuif29vlmemYHhp17t6gE1sVdq5UbfxmPrWpl0bWhxQCIK8Az0A0AXACyxCrCEqReFBMsOJYmVxSKe5quXTzWqezAgAXxsZkIPQBA74Eq30SUPPHjtFzC8eZLpxKbv/B6N7RPQ+Mz+0+nOCeqTT98XLKh/O9OBwLk2japhv5qBdT2tkGRATwiFDUREUN5UHEkUhKEGUAEoFWAGkBMeAJI3a+Yj1ULbict7mZ2nb2XU8COD0Q+oABf1oEoNMnT6qT8/Py3KlTOAU4LCzgFBaw7/DkyCHnjc2GXq0g+i/XG8ljo9btGYvj8nhst0yzuZjrdTaLsIEBqho0ahSVNWCsSDcWFVpoJjgtgCiI1QC5TOyiAVYCiYEk1SrKjY7Ygu+3JGpHADA/f/6HuqZkIPQBf6ZkZal0203W99xzT253uDa3Iyn8wlDCT4yFaXknY/dE2h2pdFuLurP1JsBOgwKPaForFQiLhQgRI9EAMZQmRcaRQAnYQawDOP3CA8YBjojiFJK4gJQ3Mqwrhfxi0vTXAWBqankg9AED/rRu+m9nzSOsAAEEe/fuDfaJPrq7kzw1qYYf3h26eyfC0K80OzfKUXyr6OxNIuuJkrphpDmSioYEKSOxgE0VlINWqZCFKOWx+B6xCMSlEIA+r5BzgGMhB0FiAaVMUPPKZVUsl1akFTYAYGlpeyD0AQO+H54F1MH5eXMewHMXLlgC+GuAw45q7Veqo4+XOlEp32sP7wgqf2HK0v2FsNcshp2r1TSyuTRyRpigECiFwAhIA4kAWgQJAZYAYSB1BE4I8MBeXsQnYaQg54FIICoF2FEmdKUoYJZGCpDLBTtVIUAoqVtd+zT7oS/8cP+dDIQ+4AdmtZ89Bj3VOUy/evZsigsXEgA4BWDv3on5E7p675zxn7gjcceqvW5kur1mIXZ7hlPuFnpRw9iwA4gAyJNGDoRACUgzCQiGISkDTrLCFmgBRJiFAJ19IqdAmhCsD/IhUERiHUFDIArkW+EkJNKmUqkEQ1Xk2XVTG2XXa/MDoQ8Y8IciAH0NUCcB/CXAnVqABc4CQP7Yjh3j9SDIDeX0oXHn/uJkKg/VO1F+V5zmhjrRthf2rOl2l4Q5MorKpNW0zjLmrAQaLAzAot8zTkDK/co1ArTK9A0jEAKUAJwSsSOAhWAACASSZec0AGUB6zxPSvVRqU1OEjY3pqqoDAO4NTU1NLheGzDgD1rv2+/8DuBO337t2I7g2C07cof1Tsyp4Gk/Skpl63bOanXfdDeMi6vbbwQubFqIThTyilTNKFPQEOMxGAIiwChAMUhJNv1FADBL9j4R6S+eW0KWVgcATfABsiQAZXfpWjNSAyghsAM8lMqFwsQElcYnsL28/HhgzCEAHy4tTQ6EPmDAd7voxzQAPLewwNK3so8enpydbuKnJgrBVw6k3l3zCe2tdqIlr9O8XhD3diBcM+BxURhhICIAGpI3IqKESAOagOwfEQEgFnAMcf2pEILMbSf6wqAIwXf1WosCKQUoECki8TUACCkIhQmognJ5wpuaBuojjHx+PFcIxrNPPTNw3Qf8aCfWpg4f1kNhSOcvjPI/xIL9BwsLn2W0f3733IlhD3dNddW9u0h9pZLa4XyjeW4oTN4cjmLKuUQZgB3QAUEppQoOMCKSGhFSAjZQEIBui1kA5v5/qkzY+ILb/odGEQxACZFASAHEgBMCKyDQIEpZd2PfG9PV6pSemGTU65Kr1FCu1vr17ccBLAyEPuBHU+C/cnY3q7On08/82v318gNRsPf+YuHOeZh7y3FyJGjF+VoSe2NwXLXxst/qhEYkMUCRFfJpljEHoFJhdIlgKOv6ThkQR0wEcpyJXARwAJHKdN1PpvU1Lujr/ou5AhIAnDkCpBnCDuJYwJqgNbQXi7JJLtCF+rAxI6OMchXiB0J+8CMxHHIg9AGfJ9ZOZoMS509DTgGMs2f5V3EWGEL1cG6y+rAplMfZ//Gyccf8KN1bt0ltV5jSRDtsVqJwmxBfBZADqSnRUCKwDhI5wIGUduQZMFtfrGRxOJz0w+zb6hWAs8y69BPqUAAcZRb/tssuf/Bn77/LlLn3zBBhwClGCCKTwCVcKUVmckz0yAgQFOBIk8u+9UDoA350+O3fBhN9JiKamZnJPZzjA3PIPVNKZc9onBRmQE9MAbP5bve6v739TlmcV4SaVJC6EImGiAgzM0ACpwGyIMVZRlwpEr//HZgyVzxLnWXvc/+OPMuYf6FHXD7T9B+RHCRoAokRIYY4IQKTiBNYJ8qGsFbXqijPTJMeGhZoD8bkkM+VBxZ9wI9Icu22pezbtsOANzU3+dAk1NHdJv+ze5R/ZMImYb7dulyLttd9Sda0WCckY0pRwCK+FmglSGMgZiJmglZE0CCjBKSE2bgEmfUmCEjhC9dlmcUWDQBavss1/x6FSKRBqp+sEyFxrMg3IA9MNgUFulwM8mMTMMUKnBPJl8sYGxvTA6EP+KHjJKB/4tgxr7i+zif7VWunshFK+vDM8OG/Xig+ulv7h6ecOTSVypzZ7rbz0fa7Q3HqSkkY5Dgh1ig4AydMrAQBiTgWOAs4C4qcwBFRQCCfBeQJQ0M+O2tZpzj13z4LsvuiF1KAvu3G4/uY+tL3EBQBJARNmnzFlFq4pvP8vdVqrR6MjwnlctTu9VwhnzcudfMA6s8999zWhQsX9OnTp7+v7zkQ+oA/X1b72DF9HMCJhQV7emHhs2mnD+6YuveRauHwLtJHhuP07kIUzhXi0B+yxBOWE7/b3ZAk2tRZkQqJQp4UBSSwShATJHGC2EHgMh9aDERltSpiCTAC0dK3ugCECcIQp/rZM/SvxdDPvGcX5p8l374HgZMoISiQJggJQWsAygmBycWg0BZLpdLouB+MjrENNLVbTeE0glZ2z/79+3cppTb/4l/8izh58qQ6/UM4DXYg9B9SngXUwZMn6fTp0/gdwJ1aWLCnAGAepa/WDo/vbthyObX35JX9+aHYPjwq6eRsEqej7c5aodG55DlpG8BjQl40zSgBhCUmgSOLdt/vFgexKZAqQGtAAWIIIBJRBCgoUgCRE0hmzMEMOJfpmQhQ/YeI6vvozFls/n1tUKHsIaIYsK7/yeQkYZFuD6qnRkZCf3yi5FVraCug2WlRp9OEZVsp18pTIoL5+dNy4cLJH8rk3EDoP2SWu//vLGt++rNBCuro0f3Fu1retNH847u79qFiL5zOC3bUNcaGelGn2Gm9FfQ6mx6Lc0AAqIIo5JQwIJISoPrXYg5ZG+jtRDkrgBSRR4CGiENWweYRUZB9jFghgLOv4/qiFwBGgRSI/OynzgY/fr9KEwCWBAqwEEkEksX7RDaCxF0Syk+M6NLUBKGQk9gxWlGMdhSjE0Zhs9VsAMCpU8DJk4MYfcCfc44dO6bHFhbkt/vZ69uvP7F3x6FDTfqlOzz9U7udt2O609O5Vqvper2bit1ygV3ecwlpoWEi5QlALIiFJRGC0fLd1lWQmW7uV6lJFhcr9fkVmCKAsmkvsA5IBcL9O/LPs2d9Tcv/X4Hb9/VkE8k8d2eFnAKEWZiINIMoJqi4EOwoTYwUMTGKmDR1Y4vYCXqxg3X46NOPPn1NRNTXvvY1On36tAyEPuDPZew9nM/r3Po6/9rCQnpbMffu2XP0br/06Iyomd2efmKnTQ4Gmy0v1+l8XA67rUKaFIyIgXBBAWQEFQ2Iy6pVnAPAIAchEUgqgDZ9Efe/hdOACMEwQZMI5IvZchEWZAk6yu7LwbeTawRDWRGNMISVSAqQ+ZOIvX83l9XDZ+G/KIBIoBjiYuN5GK7tMKMjgRuqiTMeOj2LThTrTjdkY/xLANLnnnvO9GPzgdAH/PkQ968cPmwmw5CeO3nSqlOnrGRdXsBTU/WfblWfmk+Dx+9I1CP1ON5rur24CglGOV7V7daGRN0tAsgCCSmUFVGOIcxMLCKc5cqy5BiBdF96aV9MmkCmH58rEIQBUSLSvy/T/dstl5WxwiIrgAH377rV5w0qBCJNIgpApvksIfd9u+0gUgQSyn5GMoAhgVgRK772aKiaC0bHSFWGJSKDdthBL0lpfbOhllc3BQCdOXMGGMx1H/Bv3XL3N4SeP31aTvUnpJ46dQoolUZ+fNf05F2mMlZpyM8URX5+2LrZ6W433NXuNMrtRsekvXYP0rMK7Hw9okABWe46liQz0aRcthiB+ldUpEgMiImRtZFJZpn1bXe73xoKBVgWpArkI6tkY2QuPKOfZBNA+j3juv8xqWThhU9EhkTsn1Rh/Uq4/kMGkjkZUAQiC3GJVjYYG0lz4+O+LlaQOCW9XkhRFNPW1tbm0tLKJgDB8ePAwqDWfcC/JYH3XXH5B6dOfR7fHoZ3GLsLh5jmR0L6iXzkHqmgOzED7849IGtaG1d4bekChK0m7PQUhqqgoRSSJonEChQrkK+/cIclgAH15zkAQkpMvzYtFSFREPXFjJ9kn0SgvitPEAGsiNj+h5Am8pAJ3eGzijeASD57oBCREUBI8CeuUFNZTzoIgqzOHaki5cUCG/o6Hp4cp+L4OODnkCRO4jikbrejbBy9vLG2eBYA9k9N0cIP8UEaCP3PuYv+mwDk7Fl723pNHp4sPNQLfnpcy1N3+PkfP+hhutJut7ztzQ99m37HkAtyYoOCwowHyhPgpyJWiSRGQB4Q3O74JAAOYAFxX/KaAIaAhcXR7X5RAvHtsrX+fTpn4kXfShOLpPju1cWZhSUiAB76wT0ETohIINLPwsln9999N//7dt0BlX2+sFVZg4uCNEMgdYVgJJgYV97wCGLlI0xaiKMetbc20Wo2Pr726aeLSimc/c3f/KE+TAOh/zni2DGY4zhmhm/dknsuXXInzp5NfxPArw7trh4ZL9z7617+yT2sj4367mCl1xrmra2L5W739+pRXKwmiQdIwQnEIxityBehNIWyDLaKwD5glAAgJgeR29a4r0ZRQgxRWXVZVhCbNX5mL7o/EMF+FlTfnvByW/wK0H2BC0Skn1rnLJwGucwdsCyAEnFMKtBEKutD+b5dd/ST+ewIkhooMJFY3uhp5PPDlT2FkSEt1bLEIhKFMbGNsb290fEC7zsAtv/+3//7/qlTp9KB0Ad8aTx77JjB2JiaunJF/uOFs+kCPl9BNHn3/Ye/6tND84i/OqW83Wh3h/PbkTfFgnq3u2yaW0sEm2igRApFj6ioBJYBhyy8FkUggVIAjCMogNmRcNr3dVU/a62yy2cQoLOGEnYESN/wixCYAW1AIJDWmSvvWISFoCBZXEyUxcvZMEdhyuJxots161nwzo7g+gE9KxFyII1+15oAWosi139SfJ6K/4O3c9/1utakcooBq8n2LBLOBfmhsfGgODQE5PPoOItG1KFur4eV1WUVN5vbAPjMmTPqhzkRNxD6v63EGkA4dkwdHBuTv3T69BcTUebJB+/cf4D9sWkODhqhn85F4ZFR183tEmoXttvr5bWNWwUIPMAANEJa7xEIs0hoGE5ls9GyghSChrDr13/rLMgWgoA1+hfbmUm/Ha2r7GXhhIRBEM2UpdfltrJIqSzzrhQkSYCYKatkyyrjMleeANevcOO+vm/fmTvOEnEkBEUCFkjMgN//fPTv5MHfrewveut/2DWcNoDymBL2FEXKlahSyuXHJiVXGyExPpqdSDbDDrV7PReH0fm1lZUEAI2Njf3Qd7ANhP5nKPDbB/UUIF/Y3OkfmZ8vHSqXK4btsWFxf7kcRfMz1o7uhcqZZrOLteV/pTjdKoKmclpN+yKeykJcRcxhf/iSYsAK3S5EESUiKYskmSj7pejZ9ZPwZz2gBCWfWUclWXmaCJFiElYkAiG63RWGfr84Mlc96yUXMLLKONO/hnP8haTcH/w99DPx9MUec519lGYhVpnAbxfg/HHFNCLZnSALxAKwAiWJQl3KhWp+coJ0rYYegcI0sWGcBHGapkqbf71y9eoNADI/P4+B0Af8oOJvfXwB/FzfbH42iml+/mcn/fzJ3azvmhHsm4oSHWxuLwXbjfdLnLLPquCQmyUyk3mSkoErADZOSVgAViAyoowGlAOnfYF9l6WTLHl22xqKAilNKkD2gLB9yTMA9AcxKC0kCqQVhBWY+l+Dsyt4lZWS98cva5BHyIQukPR2Yo7+8Kedup3oz0roKLht8fv3diQCywqBSDZj6o9LujOROJJQRJxSqqgdb1lPj5hKdYeaGBMpFyhmC3YWcA7tTlsWl5aWbzSbkVIKp0+fHgh9wJ+ckzipJ/CuuetwlX9t4Wy6AOAUUDy2Y+bxxyfrdwfMT8x4pcOzMSbN6laSazXeH047LohCBjvHBr7S4gWp8w0ESqw4diErEVHQAiiXpblYQMxC3G8r/6IVJPoDAahQ9oQQAMKZMSRFvoJSmkipLC0HEYYTF9+epZ5dUgsx+LN6dQVSSkhzdrVlCRBF5An+yNEt/VoWOAJpyr64BuBctsI4iyYEcZZN/2PdJEqzxhqniTwNQmpdVwrFemlsjGh8VFyljK5LOYkiFXU7sr29vUhEvw8g+qf/9J96v/qrv5oOhD7gT+yq/zZ+mwkU4yyAPbnZn6/NHHlQ176yV8yjw3FnImpvDxeluT0VyzVvs9nzw9YaATkCPGhVEaI8AzFJmvT7R3ytoIWUFQ0tBCWcueyWJTQizFmQ/FmpqiJSWcVbNnQRAKcQ1U+Di5AISDnHvGrFgQHlA7oAXVTQAZQETjglEauJfIFkJWgE6Sf8tAIMCywBaV99qm+5v6vm/vMAm1R/BpzK7tDF9r0Dm9WuQzGESfo185/dzH0+Roq++8v2O1tBJHCWxXnlCpcmp8Ubm0AU5NFsdjnsdk2n1aRbt26t5PP5ZQBy7ty5H/pE3EDoX248LgQyOydq0ydmZ/cOe/ir40n61FwYzdyZIBpqb6Vua+W9KOIVAjztUY18Pa0dKcXiDCNQDGVFnIAZhDyIDIu0Y+Zm7KAyiwrP05QzRDnJLqgSBpzqx8LUH+IAIGGAQVnsq0WMBdJI0A4h0vO9KlUK5Pu+sBMv6qUFdHvWZ2kYBRihkgY8JUgcYERl9Sn6M8v+2ZQIgYD7VTX8RyTTPou/++L9rB7+dpjRz9xDfWHCzO2mmNvVcF98cOh+HoIBJJA4V67Z2tQcmdqodKHR7SWchrGJOr3e1tbG+eXlVQ9APLyyIj8KB3Ig9C+BZwE6BdDf3nXnI0XIfzjcto9MF719O6M0Ld9c/rjSat4EULCg0CeVz2sagVAA5zrEknpZzCsaSAHJsRblQGni0GxDhc7znTJGWJxT1opYqw0JkaKSUiBiienzeJhUFk9DCEoRBUagPUGOBb0u0O6VSqP+jpnDo3fsQn6sDpWm2Lp+C+ufXm7Iyto71dSmZa1KwiIkUP27Mspu7wQiWcGNZMk8/uK9+R/mavdNMONzsd4eECl9cVNWv47bnTLyBzOat19Tn7e7kghSq+A6APK1YZUfnwLnK4gdwTpxSZzAJcktZvu7Fy5cCAWgX71yZSD0Ad+3wNVzEFEgni6X79ibL/wf7rPqZyqLy1cpbr6gJUzLwkM50rMgzQqqrCDGsPNIOIWIUoABCTEkTTNX1gipWtvJxXXS5E1O3V/ffcdoeaQOSSOX3riuGzdvrCeN7bfKgmlfUQlZJ5nNUl5i+26tvu2jMkFCQbsHWe0VqkPe3n33TZ54ArV774YeG4LEIejTy0hef6PWeP3NufDmyhWfaSMATRqI75gT6Wfms2/1vbed3c7Yf1G3X5jffDufQCJZBpD/mC/Ntz9diBzgQsVRJDRTqJXGZXQM4hfRC1Ok1kkvDtEJezdfeOGlbwPgr5086QNwOHt2IPQB36/Pns1BOzE0dKTcae0Z66SNeqfRFXT9LomvPASaVGCYSVjSrOVKLIMdEbQlKICsEySSVa6lCfBpM5+/I5jbMVp95Gh58pEjypscBzodZT88h/TVV0c3zp074je2bhrhGJoCwyDwF66iM5fdWZG055EXCt3YNIXJ4o5dd44/dkLVjj0F7JiU1IC0TaWQH6KJhKFvLu3Y2mjENna3svIZ8ZSIJRHLWXGL46zYBfiu4pbv4ZfUt/AinzfKZH3kWS/77TraP+qS+3a4QALHBGUh0gW3zURtd3WiXqFKVRx51It63EtTb7W5jWanee32l1xbW+OFL4zVGgh9wPfNnaPDJ7yNVtHbWnkblE6yRt15ysJJwowIJGUmG5NQJhjKCkj6842JQYpBnIg0Vy3foh1j9xx45kQt99UfF2/fHYxKkdDrwYwP84hx2kbtEX6/syJRFPtKGUB8IrAImCFWgMRmcXHcE7m+lvNmC3Oz+8Yfeyw//PgTTHN7VLuYoyQNUTAeFYfGUZrYye3qsEdBMMwubUrKTLAKWU28RRZcE2Xew/fcS/4FD+B2os19JnTAU7efGoB1tx8Gn7v2dPtaQQTc71TTBNIiHHUs1r3xMQzNTJOuVF3iWIe9mHtRZNa2NtzVxcUWsgcKj42NyY/KeVQDSX45JKQLEvhT4vsFFtdUItqwgCwSJyqOQLHNLo8o0woJAwkE1gBGaRRicLwp3E2nxvbXnzjilX78hAsOHRQuVpVlQ4kfEMbrKrd3TvLTY4kzhkUgmrUjJtEQo5UKhEgiBYoN4jbQ7IAqwejI/MwjD5SGn37M6l0zKtEe4hSIyCDxfIA04BTECphZsgo23C6cUfJ5Mczt1tM/yYSYz7x2+nxrqvTfTGass4dA/yaBGBCrwInKymj71so3EJVAop4i7Y3PiD85BxRLiNmiE3YkCntkk+T66vr6eQD8o3YeB0L/kvik2f3XIdH66ujQwz2jEuXQKSSCHKisSHkQSj3owCNdzkEFOjPprESDRCkR6bUhcTpem5o4+shD0185UXF756gHVr0wQa9tEfccLBOgfBLlIWVpJYB1JARw0p/1BiFSqdbUBvUampQaG3185v7DucoTR5n2zZpW0SBWAFjgawVfCdBuIVpcVNHGlpUo3lbOduhzYWZ33X1pa4JnsrP0PVlIun1JJmBItkQx62AjEsm650BETKSZPrPmSvfbYVNAXFYvT9kTQbSCcKoAFHIHcvWxihqbgPO0Cl2KyMUSRj0YT7/d63S+RURgZpqfnx9Y9AHfP6f6luLZZ59V+z79+LcuG/yjc5WcuzUxds8tX22nQM+HyucE+YJQwXcgXxB4QNEH8r6oYiBewYofbVla7A3VcsP33n//9NNPwtx5h7RzRq27BA0IIlIQp8BdJ8lWgl6TkTi0Y6AbGnYpwVkgduISRfBZVLsjWqQ+cmD4oYf06DNPgw7sp61CHi3fIPQFxhOUYJFvNMR+chEbb51FY+nWJS9NljxChZCyExcxxPXHrooSymposok09ANTjsBlk26y0c1fcPnJSPaWrWwi5UgRgwBjKn6teld+ZLjoahWJlFAr6SElRjsM0Q7jSx999NH1r3/96+ZrX/uaOnXq1I+M0Acx+pch+OwAyVfj9DdQ9lY6pvrfH87nHnTXll+ZTVP2jTdvbbLoAC0kIAgxCQtIOUXFmL3lRqEyVzlw4I6J4ycod/fdaJbL1CAFUR4Cp+GnDrkwhr25ye0Prqjep7d846RAGrDEAiUChg4UBUym2Xa2l9SHxuqH7pkefeIEmfn7JaxWKfI0GBqILXznEERtsZc+obXXXsHae+/cko2NWyWCeOLyBGYHSZmgnAIJZx1vfZcb9HmX2p96ZDIhu0jnLBFvbpfO6s+u5IT7yxcVK0jiOE5V4IL6qA7GxkDVMiKtuGljRGli1jfXOo1W6yoATE1N0alTp35o58MNLPqfHfKLx47lvnHpUuu/fuej37qZ8//2hVqt2tgzd/9GPtfrueSD2Oh8T3HUIW52tSShT6XIJ9OCfLTp+8ND+/btnzn2VKH0wCPshqaQqCLEechZoGoZpTCGWVpz9vWzZvW1N629tfRu3nE+0LoCIUVEAWnKpaTTtrONXrE6Xj14996pp59S+UMPAOUJQIrQ4iNgQlEcCmkk6fWruP7Si7L4+isNWb11sSZW5YlqJKyEslZXVvhskKPKtp6azPiK/GnFffutnwPQOhO5/kIMr25XwPVnxDGIjIOoVOuwNDFpi2OTkEIJHWa0oh7COKTV5eVk8erVCAAtLS3Rj5LIBxb9S+SfHT+e/EqnU3iazsZfw4f/3d9+9PBMYbT6dUcuiD+99vIQO/IU1QTkp0Y8q6kXWVlvEvvFHdM7Zp44mss/cdTx1IyOTBHCDgWJUWKHfLcDrGxw/NYbeuWVFzvp5QtXJ5P2tkcYFkeBhVhF4hyIu86tbxdLtdr8/O6pJ46VSw8+yG5sQgkVSYhhXILAORTTCFhbks03X1fXX3mp59+48vEIOy4rVSMWv78G8XbGuz/6KTOyChDbnw7zv1Hj/oeG6l8skeXvFj33ha76ptfdLoFVIiLy2VYXFkAiQFLjY3R0ggqjE4i9AN0wRNgLySWxhO3urcXL1zcAyIULF/D582Rg0Qf86fx3nvypn4rOn5zXCsA/fuXss29T8l+3hkqUzkw/3BVZV5asYQKstJoxX1mFNPWOyUennzxazB9/xCUzY3q7mENPG4gVFBkopRZYW0LvnVfVrRd/P1799N1z5XjzcsHjvZ6kvnGSGiGxgvaWk5WNfE4HB/bvnTvxeLl89GGXjIyqdi7AZqDRMYAmQd7GcCuLWH3tJXXz5QV2N64tD7t0rQwe9kR8LSIa0JR1pbESpBDYvttOLsuPWfneXfZs1hxlWXSHbOyzQNztN86GVcptN50hNlsMI0wCrYhyAOBIKIFs94CQC7lxb2RcY2gUKRlEUSouSSlutZWv1LcuX798TkRobW2N8SNm0QdC/xJ57rnn5LnfPp8lxgH8kxc/+D+Fc3O/UTh871gwt+fpjspvtti73kTuyiopSacmHxp98glUnz4O3jWrGjkPba2QwiEQi3wSQ22tS++j93Ft4fdx/dzbbwbNjRXfp1nr7LaDWAtOLBkdiu+2crmY9+55cPzY48XCY0eZZ6Z0L19AMzDYNiliShC4BHprFVtn35Yb3/4Wmh9/sjIe26UyY4qYhUTkdt15VudKTEKkhZQRIQUWBjv+bGXaD4bPliVm7zsG2PZ76jWU6le7a0fEPXYbXZ9UUK/dkZucVKgOSc8KelGMNImxvLSIQi74VwAWf+mXfilYWFiwP2pnceC6f0kcO3bMKFJWILmpkdmf/qmf/PHR6YmhuytTI18Z8jy4Yr2y9ub7D4Vbm+zyhv2xIVO9585K7fhxyM4dSItlEuODHODZGAWXwG83mT+6oFZeegmrH35wxlvfXh7xaDrHVBFI5Ag21SqXMi9tGs8Pdux4dOL4E0H52COI5iYpKuTgPB/sLHzLGGZGYashnbffw9a3vkPdcxffG2u110e0N5VjChRR6gDbd9pVv6TNAaQ0RN8eHsnUb2T5AdLPuN9evOiywRIgAYGl3wuTTYqnJHWpK+XSodlJ8kdHIYUChSyuF8cq7IUSx+FbcXd7CQCGh4fpR/E8DoT+ZWTiRNRzzz3HC58uzP71X/jrf+Wxex//xYO7DxQDF+6YGi7Cl0SisTrquyYrnesrIADF3TMo3H0naOdOtIMCHDx4lINKU5TZIRf1mD+5qK6/sBDdevPtc8XVRmMEXr3saFiLcw5widG5hOhW27mgPDq1f+zw4Url0SNid+9Ap1ykVHtQDJQTRj5KUWy12L5zTq3+3gK23z333tR2uz2ivBFKradAwkoplqxSLVudlom53ylmkG10sY6ygrXbY5e/UEwj8t2JNunvShYSMH1eCtt/lny+Prn/ony24K3fscYQVlk7rBIiDYLEgoTLuag0OyV+rUJOGXTjSDpRQu1uV24uLidXP7loANDi4iIGQh/wA+HMmTPq1KlT9t/763/pyOFD9/3vfuanf3KyGpSAJOLUdaWXdLUqF1Gem+XiRgMqTRHUh0Ajo9QzOYpFwyMF7VIY7sFLWuDLn9LGmZeTlZdfv843bn1cMd5kgWnEMCsHpKnSAOmoCxTTibE9k4cPjw09dszpHXt0L8ijpwlEDoXUoWwVglZb3LsfqJVvPo/Gux8sVrYa10eUuSOA1IVlIyHhRAE+qUCxIhIREvFuh3sMSR3AQv0qNgIjqznvD3zsL4L4rJechAlgIqU4q34TMBRAjqAlq7xzf6Dyrt8wo7TOOuMgEFgCZQU2MAQ0ewp1Xa5O5KYniYaKiLRDt9dF1O0hCRPe2thevbGy0gUgb775pgyEPuAHJXQAwIPz9++c37V/Mp/3eyvbqxSnqUeeMgSDwK+iMFxWueFRaEnhyCBUOSQSgBUBksLjEDrdQvf6RbFnXqGtM6+ul24sLXq+N6El1SAiItJMwonWzqaU2rHh+6oPP5hTzzxj9cF7jJQqSEnAnMKXFEWnEHQjJJc/wurLz9vVd95YKzY2Pi0avRsCD+w6CvAFEvbjYtHZhFjSgE9Z8i1MIAkTlCF4HuBBJHUEyUbHgiGwut8Pn62AIrbZlCqYbGglIJIKQRFBMXB7xbpWX+hic0QkINICA5BLFcNq8QxDa4EISw95f0exNrJDj4wKDxWojQhh1BYOIySdOAx08D+urq4uiQgdP37cXr9+fSD0AT84VpfX3fZcA4lNfSusoBVB6/7yMYUEWQCczTlWSEiDSCOwFnmXoOBCuFsrWH3hNWp856Ve/sbNZl2ZPCOtQsC+iGdAORaEkXXNdq00nzt8V1D76nGU779LR+Uq2PcBY5GHRSF1KLR7wKWr0nz+27T8+itXzcrip2WlJj1xmkViJzAGyvMFPpgtEztH7DK3nfpxslgClJcl7QFBQll1fLaPjeCJzpYoCmfDJRQYXpbNEw2lAMlm0AmcFaSZI6CyZRBgVgAJCTsCs8Bm8/EgTFAOYA1xApLYAapYpvzoGPzhOpArYLvTljCOKIpirK2vr1ZHq88DSJ772nP+mYUzKYEGQh/wp2dqaooA4Pe/9Y1F45uVew/fP5HLFyS2iTjJcvBWBMbTsOzBOsnOuNbQ1iFvU5SSGG75lmy9/AaiM2+QXF++VWLb9DRVEieWRFiTroI823NJL8rna7l77qxPHH+Ucofukmh4mCLobOC6CPKJRb7dAa7eQnPhBdp89aUt/+b1Rh00XAQPpyINEaQOyu8XumXrHIitkEiqgARiVX+fmscgJTDI7rLldleLysbDCFM26op1NjNeCVR/F7rKcngiCvAhSDVIWcAJyCH7ACIIZfF/NlpKM0REnHBWfqtAHkhzzK6nS+WoPDEFM1SH0wZRHNleGJtOt5e0W62zW1v1HgBsTWx9IS3wo8Xgeu1LYGlpyT377LPmnffPvfzxxU/+b7//rW+v9aIQQRAQM5iFwURIiJBqg9TPITYGDoDPFgW2UGvr3HntdVp5/gVKrly9VI2jtUBTQWB9EbYEglMm2nbpreW8J/78njumHz3qDd99n3hDY4jIR+IUYBn5xKEUp6IXb8nq66+7qy+9uBZev36lyhIXFA0biK9IfAuRRMEmitKEKGWIVSKsBMyAsIHu726S2wk5AmkGUgvEDpRNm2Y4xXD99lUjSgVOUZQKr4bsFmPiRqrJ9afEkAYZBW2oX+nq+ha3v/pJZZtbSfdHQLPHt9dBGZ2KqGBomCozc1CVYUSi0OklEkYxtTrtcOnW0s1z535XAcCnn376I3smB0L/Ejh16hQvLy/7RLT0O7/zu//im9/85pVWqwVjfFKkmYhARiMVQQqCGAMFBc+mKNkUZn1donfOqvWXX0bv0sXlQq+9WCKXV7BFhnNKwWeldMOml254OpL9u3fUjx8tDx9+ELo+BaEcKfLgQ6PggEIYwyytSufsu7T6yis6vHF9I+e45xnywU6UwAWgsqdU0QJJhHQjht2wJG1N5GtQISuYgaG+pccXFjI4IhtpQqzgEoIlAEay0TiO0ew4Xt2EYNlQeS1QlRUl1HS8HgEbDpRmPeekCMp8cRQcZUsdfA1oJVAGMB4QGJAhJsdCcaq8Ob9aG9VjkyLFMroWCC1LlMQSRp3N5bXllxcXF1MRofX1df5RPZMD1/3LgYIgcCKi9u7du6tSqRTCXkjdTlcAkGd8sMt6PxQRtGX41qGYWPib2+i+/RbWX1ywnU8ubtY7vStlxpBPUiFIDIEVEEWMrXXRsd69Z//U0aMzhaNHmXfuVHGuQL3+qMS8ZhRSB6yuYvv1N9TSwksSXrrUqTiOc56ukGVPiTgl4jzSxgrpSARhFifDA2IfFPtKVTwIZducAN0/NxZIGbBMZKwGOZY0cMIGlCeI76DiDqTdymmSocqcV6+N542HTrO5vb26+VHYTZrDRMaAAurPm5Pb6976m1+Cfs+qFjgDeA5QDiQklCTglhQKd+crtTLX6yxBTrXjGImziHo96rS7N8999P6/zn5UqLffftsS0UDoA34wnDx5Uv3jf/yPYwCThw8/+PN333XPwa3NbQgTV4eGdLFShkstNAS+EALLKCYpcs0meh+8JxsLL9DKO+/eLG6sX6sKj+WdaE2wWamoYsvo9ShompnZR6cfODJWefQ4q117VLNeQVd5sKyQA8OXFKq5icYH78vKwgI1PrywWWt13y1YR55SI0YUIRsRHbPoNIJpJ7lgWPLejCUX2jBaRJxslkBOkVQ1gzXE11l6PLVZLK4EpC1LjxWYhYxzlDJp0xVaa5YLM8GOyd3+XftQ27cH2vOlemtlaP29D+9pfnjhk6CXxDWloATaiQ0zS54tpyABawfKbuaECGIIYBJhB3KhUJeGh5Lc9AS80TpCz0Nje4ujKDSb62vYWl+7hv4I6q997Wt0+vTpgUUf8INjfm2eRAQ/9zM/87O7d+z4lfrQkL5+7QZvbjZodm4W40Qo5HIIhBH0YhREkGu14d5/H40zL1Djw3cb+Y319Zp1Jqeo4GUbVWKnlQqZO1tKN2R64pHZRx4aHXnyBLB3nrrFEjq+h54AOk3huwR+q4nGB++6rRfP6O3zF5fLzfZHNaZyIJQjB48VVKxU2mW9aXW+yiNje/K7Z4tmZtRXRhWijfVidPlSurayeqMc2utlqEkN1kySxgTu71yDytYxG+fAAFECSlLy1tdyZlewe9fs6IlHqfbQ/VDTUxBtoFY3kauMlGzM+7rnP3k3n8ZhUemSFiFLIv15cbd3uGVroIiMCCxIPCFSkeNGixCa0WEXTE9AykVE4tCLQxf1el7Y697stFtvAdl8gH4jCwZCH/CnRj6fjej+q+C/unNqevInd8zO1MJOL0rjNOiBaOnGEmxkMTs9gVKxgJLS8NsdSS5dxtLLL2Pj7beX/NXVRhVO5SFF5ZAwwYu1KvaU3FwhDt3kyD1zRw+NDj99FOrufRzVhlWkPSTdBDkS1JyHQrMpvfMfY33hjF57/8PF3Nbm9RrpwADVAOwRRLpapE1kO6S0Gh+bmH7woaHaEw8Du2ZEQ5FbXcnFb7ycu/TSy5PbV251c86khhNyQJwoOCEoI2J8FuNBDCvymVQSgZrbhAJPjU6MPfagVznxONPstLKlKggeqUJdCjFoam2rfGtxeW+6vtoCkILYEBAJgai/D86RiO1PmLDZ9ZokCi5hcGrUUHl8JAgm6pBAIbIxoiSWJA7RaTXDa9cutwanciD0HzjPPfcc9f8tIqIVjCGtIUSp9uA7Zmq2m4hdBHCIYHwcFc+T5OZ1rL32Gq29826IpVvXSkmqfaI8Z7uL2SqNkGRpmV3kRqo7J+87NDt0/LioOw8iLldVVxskQsjHDlVFKKaJJJev0OrCi1g6++4Srax+OMyS94nmFElKBI8IEjOvbRnleLK+Z+zBe4crzzwp5vAhSatl5VjEzE6C8o4r68u1zZWtHa4VXwGI+rG5Y4HRDFYEPxsCodg6iVpgRVMTd0weeSioHT0q3sxO6uQCxEpBUoei71OuPoJ8fVi8nJmyhJ6D9ADKEYOYREt/j3o/5QEGOSgYKPJIOExB4kr5vYWx8aKqj4hVSsWpRRiFKg57kiTxta3tzY9FhIhInn322YHQB/zgsu23f69pmp67tbL6zUKtdmzX/n1l141YwljIT8lGPawttVHpbEKnDvbdD2nj9ddCdfPWtaFYXBEqLyLCpClV8K1WvW2brMe1/J0zBw/uHT32Y66w/wHtSuNIEcAxoClG1QjyYRfxlU+x9NJ3ZOnNVxrm5uI743GKvNZ1I04IBCZSTOh0heJkpDZav+/usfEfOyHqrrvRCUoqiRlGMQWBgtkxSeUdO1Q3/3HONCMmkCeKHETgC2AEziqCU1pi5rUmHKeTIzMjRx6oz5z4CmHX3ZLoClmlkSoLhxAFIlDUQ29znSTurYsgtEJOi3YG4jmwOGIoQIwQcVZV5wDSBqI8B2YDUqNDY/mJaa2GJrhHPnXDFjhO0Gk0icW+vbiy8tbp06c1APejNDZqIPQ/I86cOQOlFH73d3/n//vjf+EX7sgNVf7mZG2EyKYujjs6YFChZxHfWMTi1ZuUfngh0VeuXh7qdC8F4uqayMvWppFOIXFb7Gq7Vnp45J4DY0NfeYpL996v49ExRH4xqxmVGEVlkXMh4sWrvLHwglpeeHGz8OmVt8bStF5SVFPiDAOxhbIJqaQD3QlHh3aN33NweuT4E1K87z5ql+voOsAogVbJZzNdNDRyMKRAfkpCTsFTmcihAJOAbEq+3UTYi6Zq9cmj9+2e/PHjwF0HJSyPUVd8WHbQNkKRDHKtpqRXrlDjymXL7e5ND4AQ+czKaqiCQYqU2GYjnQUQEUcaADs4dJwgha8L+bER8canoMp1ihxJo9mEpI7W1tawsbG+AQDnz/8TGpzIwT36l8LCwoK77777PACLl69df/bcW2//+o2PP6Z64JuZUimqdEKpLm9Av3sB8toHcfDp4qVKJ7oVkCsxsefEhb5ABQLELJtb5AX+/jtKU08/hdIjR9CdGsVGwWAzYHS9FJpj5NoduMVr3Hn9dbXx8lvr5Y+ufTqbyFAVGCmAakZIM4DEKNryzPUbpfxUfv7A5PSJp6hy733UKpfRCQzSQIO1g48UfhxBFlfRvnIj7W5tb1tILyWxqYYSuj3WibRWirsuWe6N1CZGDt9zcPipx4G7DqBTH6bNwEczCCBeDvlEo9gUSS9ex63XXrebn1zeMFHSyilSSsRTcKTgQFmRjiJAOQKsglbEGoAwkYsAm3qBzY9NIDdahwt8pCyc2pTDONbdTved1dWN8wAION5vvhvE6AO+hLzc2bNnXT8+3Lh49ux//8tf+2vb5zutr98xNbGvlkaOr14T+fjTbnFx7WYtjrZFcS5VIpYgAauikC70rN3cJG39Ow7eNffk037hyKOcjE2rMFdCQgapcvAQIY8Ien0Fq6+9qlZeONPQH3+6OeFcMaeoZoEkJOlC6ZwT2W6k7sZqpXCwdODA9NiJp3TxoUc4HBlTbePBGQ1fUuTSFEESgm/c5OTVt1Tz409XddK9oTxvwmY159CAr4nIgqIu26VWuTw7ds89e2aeOpHT990n3aE6RcpHKhpEBM8JCp0U6tqS6774qll58+3U39j6pAyUjUKRnSQC7k+YcawkK7OTLBGXrYcWEVbgCEDP89XIxCT80VFEnkGv00OnE6puN5RGq/Xxhx9evEZE8sYbbwws+kDoXypMROoXf/EXc//8n//z6P/127/1//nxgwetOXTo790fmPv41k2l15cvVuJuowhUIziKIV0hMmK0aqV2fVMj0Xfs2T3z5JOjY0cfRzg1J7EugVyAAgQ5naJMDkFjE80P3pVbZ15Ieh+euzzbi1LP86YjONfTErPAeYJeL+Xmpmcqxd279u1+6isYevBR5qFJFfoFsPGgUkY+SVFKUlG3Vmh94RW19fJrDbt06/KQokiDixBpkxPyoYpCKuqJ9Nby3lhx/s79M08+GfgPHXHx6JBOqQiTaFQgUJSiELYht65J+8UXzNIrr4RYWr46Bqg8UVUEmgk9EjiLbBVMvzxWATAEgWF2QkSW0Q2JCMXKVG5kXKFSRQwgSi3S1NHWdgNxL3yn3d5YERFNRG5wFAdC/9LF/v/+Z/8s3nnypF8KAu/v/dZv/U8/UR/dK0SH/Y3N1SDurhXIjXiCohXulkA1JcpPHTVWBV27Z3Zu57GjO8aeeEzSmTl0ghIx5RCkBN/GMF4M09mU7vvv0a0XXqDe+fNXKp3eZoGo4lzS63iSRhpKO5UkKW01PX84v2vmrukTx6X+6KOg0QnVhQdncjBE0FEb+SSE3lxH7+w7uHXmFdf75NLHw2HS8pWeJJs2ciIggg+lbIdVuJkLKsG+nXfPPHkMwUNHOKyP6pbxYNhD3jkE3INGCqxex+ab36GVF38/bF+7fHGS3XoeskcLnIVElm630sARSLl+x6sGPA0hApSFgmV0Ej8olUbGx/3hOiTIS5xapM4iYYvFW7diML8OoPVLv/RLOQDR4BgOhP6l87X+brHTv/Vb6dO7Z+4uN9pf8cMkzV2/9WpR0pEc6WEjwj6oQKJyTjzXZe0Hc7M7R448MJk/+rDIrjnqlUtoGQMFwGeGl0ZQjTVsfviObH3r96n57gdpcbt7fQgoBYQJB7HaIQ5IK2dVI0FuJJiaurP6+NFg7IlHwTtnEHo5hKSREsN3jCLHCLbWJHr3LC2++BJHV69fL0VJWDJ63BMaMkDsQRkrikPWK8vaK4UzU3fv+7GvoPrYY3Djk6rjeehqQg6Mgo6gbQi3tSLN916jm9/51+he+uit0Sht+drsMo57AlFpv0uNlGji/jbVfi+pFjglMEQwgPR6cI5LQzo/NQOvPgrK5Sh1zjY7bbPVasnm5vbbV27e3AaASqUigxM4EPqXzsmTJ/VvA6DTpx0APOqXfrHQbO+dXN9+P29dpaBVDcJWAPKULsaieyGrpXRo7OD0/Q9OVJ46ATmwH51igK5RgKehrANJBN910LjykVt5/lt66/U3m/WN9rkhR7UioSIiqRJiH1pz6m1Z9qs0Orpz7IGHcvUTJ5DumEE3UHCehkBB2Qi5NEahsy3djz6gGy98h7c/PL/qNdvXS0KBBjywawgo5zyvHFn96YoOymrHzL7J44+h9tjjkB1zCL0AVmkQOZCLoDiBdNZ5673X1JXv/B746sVLw2nqFRTqHjtLQMD9BU0qGzrVb1ElApGWbKDM7YkzkkJaHcBTtaHh0twc9NAQWGn0Oh3ebrTQbvfsaqNx8ZNPPmkBwFtvvTVINg+E/iWLHNB/c22Nji8s4MnaxI5HJsd/eW8U/cTU9naz0tts+YQhwwIHSUTrUgrV2hJe6pSr+yYOHxwbevIxovmD3B0qq65nkLJDPlYosSDfaSP85JxrfvvbuvHm2XZxffvimDUUkKqLcOJAFspQItjqMHfSseE9E488UBv56nFWB/ZSs1igiABPgMABppeg2G2g+/F5uXnmDLbee3+rsNG8XrcU+FBFCDMr8lPSfhfy6aaCH03Wd009fiQ3/NVnxO3YRWE+j1RpaAhKoUMxTpBvNDh67wO1+PwCtz/86NOxRrRaEz0MEg3mWEEZBjFBUhLAA5Qn4gtEsZBjEGcBtqQWYiNFva7yxgvV8qQ/NSGqVKQYLGESSacXSqcX9kThfwrDcOPZZ581p/sP2AGD67UvjZmZGf/JhQW7ANBd9fqv7bf4z3Y2Q3+u09z2DE0DrJ1Iz5KiSGFzjdPN7VphqnT/gT1Dzzxm3H3z3CkVVdMYRL6GFkY5TFFphaIv35DOtxb0xsIba6XF9Ytz8CQHjCuGhZBzSqsOeGtN0tXu6PCO0gN31WvPPA5z/0F0q2VKjQePNHKWUUwsyp0Q9vIV3jzzgtp4651uYX3r+pQlNSR6MscwGgiIKBfCra8Kh73xoV3jR+4vDz/5BOf27KGwUEFLa6SKkXMO1dChtNkT994FWv7WS2HvrQuXx9bi60M28I14ns4y6j5ApEFageCBWAu0AnwDKC2AgiJWxAkQRkAnJlhXDEreUDlQw0NAPofQJUjYUpLGtLGxGc3t2/cagGhra0tfOH8+HZzEgUX/0vhtQJ9cXIy/efKk/wsXL/7EZJT+jf1bjc2xxuZKTmzZkC5HhJRJPCaEXeuacTE/Xt9/4NDYV58R/6EHEQ2PqI7xkCgDy0AJjELSg1y/Qc1XX8H2a++Eucvr58YZyvNkPyvXFUaiSAVWpLnFbiMZro8N3XNofvr4CXh33cNhsaq6xoMTh7wQfFjopId0+TJWXjmj1l5/O/SX1q6NOWr7wtMCaIIYQ+TFjpvbQCMZqx8aevD+kcmnn5bc/jupZ/KwKg8nEQKXoOAEfq+D+PKntPryS1h9552lysrmxRHl1w2oxBBQNiKeJJsUrbVAM0QomxntAIBB/b3pLEKiGMQhRFSp4LzREfFqVbi8j26acJjEptfrutbW2sXlW7cUAFpZWZEf5M7HgUUf8F0IQDh5UhPAP3Xjxk9NifyTO8NWIb998+08d5UhVUJKW4ABlM6nIs0k7+0c3rvn0OixJ2XoocfIjs9R1y/BeXkQ+fBYIR9HwPJlbrz1Hdx8+QXbvXz9rTpLsUhmJ4lLY8MGhvIJIdxmt9KrF+tDh+afmHvqBPL3PySoTalIckg4u5w2zsHEPURLV2TpjTNYfvlFpFdvvj0Rueu+Rd0Jd0K4TatFWeFWmxHycH1f8b77xsa/8jT8Q4fAtWFiLw9rBTkLVJyC3+4gvXwRi6+9gKvvvdG1myubNYVCQewQOElYOLJQDFGpAyzAzmTZgoAJSBSSRBErIk1gAkQpRXnRlItFjKkOqdrUDPnDQ7CeQTuxabsbqqQXbsRh+L+sr6/38CO2hWUg9D9rS37ypAagvnb6dPITd+z+yR2t3j880E4mRlY2X6tYzjsNP1IcpoohIpF1uN4OzN7C7rndI8eOYviRw0hHhhAHPpznwwJgThFAYFodTt75UN0883Kz9dGFM37SS7VWQw7snOOW56CUUpVI3NLKkB7PH9xx//CTD6PwyCFEkzXaLABhQDAkyNsUhagH/+aSc2fepO1vvAK+vPjiaGpRUHqnEibqj2APodY2GSvblVLRu/vOudmvPqWCw3dLe6RE24bRRQLlUhScRdDrifv0mmw9/6o0vvNGiGtLb5VDXvYIw4rY03DaE0taxDkS54jZAZYBK5SNbxcBKxarmQUQsqTEgRIR6VmBFwzVgtLsFHStikgptKOetNodNLa37eWLF7cvXLjABMK77747KJQZCP0Hz2HAA7L1QUcmR+5/yvP+87mwt29ueeXseBL7Rei6gMQpEWsYVrjRJlWi2dmp0SceNZVjjzm3e45aeQ8dZKtCHTFEMQKxsDeXaP2N96Puex8t1Tpht+q5YaGUYrgOEXmeKIqt/Wg1oOnq/l3zE8cfy1cePszp1AiaRYVWXpAaC98mKKYR9PaG6734mt78V2dS7+NrF8a7sS2SqjLEgECiVCVRWhrOLW1XK9XiofndE8cf19UH7ocbH0fbM2gqhxgJymRR5hi9W9dk8+VXqb3wOgVXFz+ZC21aB40CYiwkBqAUmAjM2VoGEYHYbCikEkCRzrazQkEURDiz+mARROz5s5VqdcgbG5OkEFAzTZEyIw670ut0bm63WmcA8Nef/bq6dOnSID4fxOg/+Az7EICvnT7tvrp3756HlPp7d4Tx3bu2ty/5UbOjlZnxGOQ57WIS2yXXbCmdw+T4naMPP+QXn3iC0927dStfQs/k4ciAhEGKYIyBF/WYl1fU1q3lS4Vu96PRwJ/XnBZZbATSHoNsbPnWlqdywc7ZO2ceeTQoH3ncBeM7dFcCWNHZlgV2KCYp9PY2t947q9dffjFJP/741riLGqIxlRCnDEmElIlFNpvKbm0XilOVA/sOTD/6eLl8+GFW1TFFkiMlBIUUvliUmJGsL/HW22+o1ddecYXr1z8dcTYKtJpJSHwHiVMARpEnEAsSpQCthFRmdgn9chlkU6QcgUBZgC4pC8ESWa9QGaoMjwV6ZJR7QUDNdk9sar3m5jZtrG1cuXnz5mUAuHDhgkY/1h8wsOg/KGh+fl7/JpAere+fephyf+uwxU9ObW5eqbWbDZWn2Ri2S0ReQF6NnbQ3BFE0M7K3fOSB+tixY4ru2E/tYhU9CkDwkSMPJht8Ck8ZILXgNEGiqBsT2uycsEgsRJpJoct6c4vyTk/OPTJ79LGg+sgxF0zs0c4MgWwOJlHIpQ7llJFvdNB59wN17dvPJxufXrhW5XjJaB53RpQ1AvKoYAnhJrvrW4Hv+3v23D995JGh0oMPOz02rZg96FQhZ4GyY1RdAl69ha3XXlUrL75oG9cuXw5s93xOYRSgHCCJInjZQkRwIugmDj1mRCwUA1oLlIF8FlmTZLPbbbbvDcaJhKkoyteGUn9kXHSlBmt89NLUtTtds7G20Vi6cfPj2+d5fn5+EKMPLPoPll8BzD+8cCEBUH6sKl/b5/DXprZbraGol5JGRTvRAignKoqU6m5BReFErT5y5P6JqR97Bt49d0unXKVY5eCrPLTT0CyIBUgFsBB0ewl1jUFczN3dK5fzKuleLTkUcopGU0ebDS9fzE1MPDT8yGFUHz8havdB3S3UwCqfDXXjCOXUodTqSPThR3Tr33wLjbPvfji8vrWulR5NiJNECSmiEjmVplba4udHzdTUYxMPPeiVjz7CZsecDnN5OG0gikA2QU5i5FoNNN5+Sza/8S3qfnjuk7Fm70JOyc4UkgqYIYASWBGKI6g0JGk7rcRj8gIhFUCRhngEx0TQUPAdFFnhHpQqBkS5kF0rVTrv10f93Ng4wc8jcZA4Sm1ru2U4Td/rNJvfBoGf/frAeA2E/iUwOT9PfOECfu3OnT+3I+W/sbvRTHK91g0olMmRDlIJFXS5TVhfV3pza2RkV/3++V3jTz6J3H33oFeqURsGFh58zkwfnANJdtncjUN017aoFaeSzswU4k7rjhu3Lpta2FvLp7QYkT+KsfF9Qw89hJGnn4Y5cCe1y0No+j4YGr6zyNkUuV6L+eNP1NrzL6Dz5gdvVja21sdI1QwkiEUSCBnlNFtLSz3l6/zk5IPjDzzkDT/6OHJ79lKvVEDL6GzPEhKUbYJCoynRh+ew8Z3nqf3+udfHtltLdaV3ekRVy67FCqSgCyLoxtBxO5c/kJSLgSqW4RJH3fXNzUIcf1KACwykoCFGgTwRWCcUGUFBQWwKhGEQTBXHxwMzPgHn5ZCkgjhMJQxD6cXJteWPG++JCGVDIE8NLPpA6D+4uHz+GOjUwoXkl2cmnjgU42/uj7tzI9ub77GynlPSg4PxRdUcETU1bd8YLczW753fOfXk00Hl0P3SKZQp9QoAeRABnGNYMBgMaAO2Dmur27h1YxkcOxQmZwCFfFz29m40NsZLznSDQq02vG++Un38CTF330VhuYKuySE1BmJTlJCilHYEn1ygm996Plx75eVLlY3N7hAF4x6cceISoygHR8o5ut4Qr0hjo3tH77+vUD/xpNCdd6JXrFBsCOxpOHLwXAo/6nB47pxa/DffRPO9c7dK282tOlAKBGUwO1IqcNrkQ8uXukypPzJ+pHbP/nrlzv0wQ+PgrRYaH53LNc59qLfXVz8sg1s5wiQEPRIoERIlBDAnHUIaV0vT/tSYr0dHJVIeemGCOErNdrtFkaTXFrEYnj59Wv8oT3odCP0HLvKT+ndw2skC8GM7795/P0X/+z29zr7dza3LPic+K1VJUrUFNjoFem1JN5sFM13fP3tg5/HHTO3ww06qdd1jAyIfZAKwS5FQgpRTKJVtK9zcauHmzTWst7rIq4C8yih04EtupOQPuag+Uxuql0YmYaZ2Sm5uFzUrJcTKgEUhiAV5x6gkIfT1a7z2wnfUysJ3Nsyt5SsVk99HQjpy6TYUKSWwYqUVE+VluHpH7b754eJXHnXqvjt1u1pBYgk5SyhTVuZiupHI+U/VyrdfwsYbZ9cKm1s3C1rVBCg65oQAsaT9WLC4JkjykxM76w/cP1p95nF4h+5x8KuEza4Ud0xqw9H04nutzV6rfd2AIhLOGyilYTwFURYsqacCDJdKuakRwsgQR1DU7UZIrdVLm+tYbmxtAaDz588TBnfoA6H/IHgWMMAaBMDP7t+x84BL/vMdkXtsd6u3nA/jltE0A0bqizdsYcJ12OXtfD4I9uy8a/aRx1C/7xGnquO6DR/keUjFgdMIohTEaLA4WJtia3sbNxdXsb7dRKp8+DlfIgZ0TqE2PSS7987IzNQYlF+imHxqwkO2uMHAs4xi6lCLu+Abl7H1wgt6+aVXQm95eXvUUzUFaxJxTShAg0zCbiUEpXGt9MTIvQfLxa8ct4V77ja9Wg0dzwcRkIstCnECnfSQXLmE5edftOtvvLNVabQuF61TSklOsvFXnoCsZdraZLvhxsfvm374vj1DP/G0w937dViva7g8fK8Ebe+Q4vV5qS5e2xu1O8zABhPKIiQAaYKwg2jJ5Wp6bIRpYlyjWKTEWXR7PfTSkLa7nWvXb91aHgh8IPQfKMNf3av/7jcW4pPzM3t3wv03D9jwsZlG8+pIL9JKBXsjibc04BvNxdDFKxs5rxDs3f3ozIlnMPzQcVG1GZ2qEjjIgXUCph4gAp9zUJRDDB9rzQ1cWrqC1e0GHDwQfNjAk9WwAaOYpvfspYn77yF2Fs1eCGsMYmi41IM4hq8scjqEW7uM9Ze+jaVvfxt8fXGrDpUGjmuAtD2ANKmqsLSaQNSqVfZ7dx/IFZ45gdoDD+uoUoeVEoR8UMAQYrhmE8nli7L94gLdev2lJdy4eqUoqlxiGDApRTAelGdFu4R0nI4MPzly/z11/5knWd97j+6VC+iKhtYGqqhBlSp5w6Oo+NUCxNQ8pFsg4oREFKxiEpswyAb5Ym56TmFiFomfp7QTum7Uoc1eS7Gvv3F1aeltIuA0LgwScQOh/+mv0Z7dgeDv/N6n8d8tl0fu7OE/vI/009Ob29fr3dAqmJpidoZIO6VMSnRjFdZzk9P7xp44iuHHHwPt3EnNoIhIG4gwlDgUKQWJhecIFAlWm5toLl9Bb3MFkjJg8/B10Rnfx5XrK7qQUxiZmgVyZXS7LXSZwC5LbReJ4ZMgF3egVhal9fZbWHvhDHUvXX9nPHbbgVaTGmJFQAogELmIKBcX8nv1Hbt3TT113Cs98qD0JkappXNIlAFZRs6lKCQx9Moqtl57i5bPvNrkS1c36uI4cGwMRIPIc4q8WFSvQ9Tbyuf2FOfvHJ586hhK996DTrWM2Piw0IAQGA6kCcRAmrpIiYuVIsMQB4jWBAUo64AE2stVJ6bg14aQkELsHHpJpFrdDja3Npaa16+vaa2A0+cHp/SPYPAE/B4Tb7++d6//X1xHRESlr9fr/9Hd7P3l/Wvd63OtuFeEVFJlPUc2AYFjosaaUlWenZ2ffOTo6NBjj4rdNYtmJcBWAWj5DIFFIUlQiRJUWm0Jlm5x+sl5F59/z8mlTyS/uYFSFEtJsasVPbl59SP19uuvLoad6Prw0Dh6vRTdnhURDZJsf1vBhajFLRSWl9m+9jZtf+tFSj69eWkk5GYFOlAMEjKeAHBaFbrO3dpQZiO/d++e3U895Y8cOSLR+Aht5g3aRR+hdvDjHiq9EN7imoQvv8tb334twafXN8YTsVVQxYgTUeJZg2LsSXddp731cm7WP3jHzMxTT1L54YclHK2rTRA6SoN8H0YxdNwT2t5E4+plaja2rmrwCoiKyLazKA8UKJZeDxCTy09VR0dVrlqRhBmdOKbYOrSajZ7S/AGA6F/8i//Rv3Dhgh2c1oFF/5PG5Oo5QOjSpRhA7T/ZN/1rBxP5j+9o9lS127mWA00LBJZsEhsyiaNow9qtcGT8/tkHHx4eefJp8XcfoIafQ4cAIUHOOZQcUOqFiJeuYPvix9S7vkJxq4d21EaQV6gNDUthNCdxDnpt4yaWbl7+jQ/ffefik8dP/Lwy+R1hGotlDU9pKHFQLkHORVDbGxy//65aO/MyNz+8sFztRKtlRRUF9lkQO9Im1VqlcEtrCpLfNTcx8eijQfWRJyQdn0WXPKTQMAJoa1G0EbztbY7ffldtPr9A8SefXhmO41ZJQcE6TxN8m01qbbQdd1p5M5zbPTs5deIYRo4cQTIxRS1PwQqg+3vmCmksWF3C2ttvY+nDD3tobjYroJQhCgAZARtSgRUXplqbythYpVivQxUK0ktSbsQ9FaYxVleWe0kvuQmAX3vtNQ0gGZzYgdD/RCK/kFkYd/fc3NBRLb90kOjvzoVdr9bYPpdor2bYxRqiWZEXk7SaoLBbH63XD98XjBw/zsH+u2CLNWJSMFZQsIJiapFr98DXL+PWy8/j+puvpb3lzdg4WEeOzEStWNp7h7LlEbrFDffxJxdeNSPxf7b/zruqQ6P1kzELCEZI+9CcUuCyxWdoNdH66CO1+fJrvHnu3FKuuX0uIJkUEWGRmEl5VmzY0+htCFreztlDOx95eGf16GMsE7Mq8UsAKeQShUKUIogtdGNLtt97W6298Dy3P7mwWYq713LkKsJSIkCEyEtBSZjyes+jenF6dnb00SNSf/hhuPEpasBDQgY5TyPopSiEIfzNVdo4+xaufueMpZuL10cdG0VUZWGnCDkSMAEuAhjVKudnZ8XUauSUQehCbsWhaoVt3tpsXLh88WoEANbawbXaQOh/Mrb27vVOX7oUY25u6H7f/9Wjin5999ZGOLS9fS42MAEncQhqBkbNkZK0HbvVbq1aHXn4gXvmnnnaBIfuER6qUez5IF+jYGPkkxR+NwJfuoJbL3wbt17+TlMtLS5PWXXLxeEGa1HN3vZ9Kl+cjasTwTLj03qp+vP/1//HP9n6+Z8/+Ui+VDIwBi4OQTaFcQmKLoXudNH46LKsvfgmbbx7frmwtvWJL5yHYusISoMMCNoK2zawxtNTj889dnSi9sxTDjt3ay6UIH4OGg5+mqKcOujtJpoXzvPS88/r1XffXh9ttl4KkA4LoQCivAIhFXSt1randMXMTExOHj1SqD/xmGBuB7WDHGJoMBNMwiiFKYLNprTeeJtufePb7D6+tDHS7mwVmY0iKTiCzpazKYpB7RZgUBkay8/Okh6qISKiKE25m8TodLuR55vTl9577wYArKysDLLuA6F///wK4P23ly4l/wjI/WXP+8oh6J/fv9FWU43uJgtM6qGgWJwW5FhUN0qTVlKu1ofuuvfgxKNHTe7+Q4hG69QVwCqBkEWBLHTSFbd4E+uvvSKr31nYpmtXP5gUkZI2kyJUS8SF6VZ4KUk5397aHv10dXPhny0MNwCAiZRSUEQMcTFM3EVOBKbblvCTi9g68xptvfLeqn9t+fKwkPG1mXaShIZgDFHOOr4VQtZlaPT49P0PjAw9+SQwf6eKclVEUIhsAjKCvLKgzjbiSxdd58UF3X7vw6XhrdalOuwcQ1IRxIYor2GKqVCrmdoL8ez047sff7Q+/GNfYbt3twrLJcTaAwQwbBGkFn67Ib0P35OV51/oxe+8tzrScZvDLEUPklMkngWIhURI+ZHIShMqp6rlKTM9CSmXETmHOLWSOIdut0urSzebAGKlFM6fHyTiBsm47zO7fhLQwd696lGg9LfumPm5h2D/xqFmqzbdaG8MsysUQWNGoFjD+NqMwWJj3S/mcgcO7J85fixXPHy/tMfqsp0zCH0D0gJle1BxG9HmEm++9yatvvGySq9fOz/NqR1VaiIQVzCEvFKqnCNww0pxu9Pd/Hh57X+ePHwlUEQ4+86braUb12KyIcqeUBUO+W4LuHaVmq+9QVuvvtWiK4uXJ9jxEMlMIE4RIyFRPoS2OkKJGxq5f+q+B0ZnTjxD5uDd3CoVqRkYpL4CwcGXBCppSPvGx1h6+Xm99sbZ5fyttcsTwroIjOWAEgk0oJQT1e2JCePR6QfqDx+ZrJ54UqUHDmCrUkbLUxAwirCocYJCZwuNjz/gzYXnVfP9D1q1ZvtKTRLtweWVEg8EzwiMxyQsFMZESVwql73x8SKNj0oaBOhFCcdRpGyainO8rNmdBeCef/55M0jEDYT+/cbleh6gf3TpUjw9s/P+PeL/6oEwnt+xvbkUcCyazHBAuqCIAqfg99gtbnt+ubh33+7RRx4r5R54kN2OOWqW8tTRBKUIJRAqqQWtrHD39bf00osvufblTy8NSRQPEU0HIsMEzQko7iTumq4Gs1HYqy02Gq+8Yf1Xl8+ejdxbb3mL165dam9vfGvt+iWUtVAZFrx4XbZff1NWXn29kyzeuF5HxDWSScOpceLaoihIFNa2nTRapaFd1UOHdgx95RkJ7j0svdqQ2vA1Qq1gRFCBoBSHgmtXaf2Vl7H06msr6Y2bHw87djm4MSWcsoLHhiqWVbvNvNUZqs2MP/rAndPPPB24Ow5IM1dQvVwOjgE/SlEOUxSbbYkufiRrC9/Rt86eXfe3txZr2ssbciWnHSVKmAHrMcQIFAnFMYmn6uVCbnocql6F5ANEYShht2d6nQ6tr65unPzZk5cB8L/8l/9SI2twHzBw3f94sp2BYAL4F+fnJw7G/O/vjnoHdzTbN32b2AC6YMkgIQNiUZZcc9Ootr9r9tCORx+tlR95zKrJSdPL59HzFDhl+OxQiC2w0cDWOx+q7e+8YuP3P75RbzbPVwi7tXBemLtOG0mhklTppFks7wij7rmPu93/ga7ebDJA/82/+Bc+Ed0aKxd+78Lbb3/9QKWQ9YCffdusvfJ62Pn400/KkvYKnowgsUUH7jlAxCjqWgqToDJd2H9wV+7pp7jwwIPK1kfQ8hWiACimBD+1yEcx7NKibL/4BjVffKNXvLZ4Lmc5MVrPGmbPQmKriFJF3Qi2nRaGxyr33Lmz8hPH2dx3N6KgrCLSgAoQ2BS5KIUXhRLfvJTNj3vzjba5tfReNU1FabWHBDYlCGcN6exnwyJ9AnoJw+hKVRcmxqCrZThjEEYRp3Gqu612vLq8fOE3LlzwAMTDw8OD+Hxg0b93Ts/PGwL4l/fvL+909N/uS5K/uKfTbARJN/K0nvKJciQ2EtjUObfVBTXVjtlnJh9/pFZ44gnWu3aZtJRHKBY2jhDAoUApZGMJzbNvy/qLL2LzowvXy43mxRrMrC+kE6XirhYbuXg9EjSToeEHr3i53pKi//v/fPXm//rW4cMeAeIniRURXPnoY3/t0hVpfPQxll59k66+9Aoaly5uDcfRjSEnVVgRC+6QRl4T5ZKEl61fOlA9MH9g/KkTMnz4QcX1UcTGg0DDsM62I5AAjYZsvfa2WvzWS5G6uni9kqT5PKkhCJQTlUDIKSEVO15uVIpjhXvvvLP2zAnJHbhLdQtlFQUFaFOCigmBE3guBFauSOvNBay//mqibtx6qZ6kcUBU18wpMUE7SpWQEyF2RGKJ4ISi1EFytbquTM/BFCpoJymaSeLi1MKHue6LOn1hYaEHAGfOnBlY84HQv0eX/dix3MmTJ+1TBw7Uh1L13H0J/8x0Y/tKtdlaLECNQiQJ4VqWRAncapsAjI8em3roYb/+6OPw9+6hqFpA11cgBRSsRTmJ4TW2pPPRedl+cYE23nnvXX995VLVk6kCqK7hFRKlqK14O1WSxuXigSvD9dlP/fx/9+3t8HcB4H89e9YJQJVWiwBgtpRDLYpo9czr3PjGgu58dHGx2m5+NErYUxHU8gIDwKZAJwXSnucNy9xcrX78UQw9/gh4agod30OoCICCYYAgcJzANbakd+kSOlevtU27e9kH+75WowAQg9sJoRNDrjdy3l25+T17yz/2JKpHjhBVp5GYCmIvB4hGLlHwrYXdWuXNt19U184836aPLr803ou9mjKTCpQjARshLxCV8x2cEogjQgRp9CAbCXTBL9UqudEpwM9TN7HoiJMwjdFtbNuVi5c2s/wkYWxsbGDRB0L/XuLyef+/ePHFiE6dMg8kyV97kOTXJhpbV4bbnfW86KEcK48glGoyXYUrS0oomR6dH334oVL9icdEH7hDWpUcbRtBbAhKBDUnKLc6jAufUOOFV6j55vtXqrfWNqacqviMcgrXTeEiApFKJWwXSrXO2MjUZY++9e3E/tbC+nrnWcz7pwD+1cOHTWt1Ve6Yq+5ubG3+9ESSCl5/R0XvfXyhvtH5aFh0iUgKJGwVhKB1PmKEm6AG79m1u/7kI7nck0c42T1FjZxBL1CIPCCiFDFZiAGgrHRbm7Td2u4ijZt5Tw0pwDNioZTLxVrsuiet6xWzTx3cOzv61HGv+sgR5rFJxF4BpHLQYqAtEFgHbDZk/a336NpLbzftJzcvjfesq4uZyIOGFECO4ASZ2+5AJASVQuJQZDvSilStPFEaHc6ZoZpYrdEKe0htqnpRD2EU3mw2Ny4BwNe//nU1aE0dCP2P/f8/efKk/oe4kDiRwt+9Y88v3i349f2d7bDWWLtSIBrydDBmHKwCTOxpXva0vzlc31O967567fhTzr/7boqGa9T1NBJNEKJsj1kvEn3xilr5zkuy8dpbi4Vby4vj0LU86VEwRxG5OCWOrXVrJigGbmRs7mo+iJY6G//pW1f+g0v/w1/7a0X8VN78xq/8ilceTv2/+41vxHvndsyPWvdXy7eWKb52fbHc3Ph0EjA5xoiw6zBcJCQmYW5vgeJ0dnaq9ugjtZGvPKHs3jlqBAaRVmBjYDWQKgaTQNjCJjF6nTb1oiglcAsANAhGnIW47Q5JZz1vxmnPzp0jTx6j0mOPO5qaUaGXR6oM4AieJQSioOMY7Rs3sfjmO7R1/tpKvUerFR1M+aSqIpw6cNIXecJA6rKuXCUQF4PjRJHvjw4XSxNjpColsUqhG0ecWmu2t7axvrV14+OlpU0QcOHChUFr6iAZ98deo9Hp3zntAHj//s7dJ+9l+j/vj7pjw2urbxJhRAMFEo5FkU4hbovdRm+4fvfY/KHh2tETXDpwSCfVUcTahwcFDcC4BKVeDHP5JlYXXnY3X39l1Szd/DivXU0LiimQWgMmhmFCsuWYCzNTs0Pzd9UseItWRnugU/wfAN3sxzwLAOnPHjpUe6I68cze1E7ay5dWgtbGu76SCmme0o5TEmgo8VOgs8HSjKemRyceOrKn/vgx0Xv2IwwKlDpCoDyQVXAkCLQHBQF3u2itNxG2I0B0UUwhH/aaN3MiACRtARtbvqr4U7P7xo48IaMPPw49Oae7fh6OPJDT4DQb5Gp8gdgQWys3aGvphvN7nTCvWBOLn2gkoUgPAmtAuc/+IiBMgAIpLXDc1fCqE+McjI8BuQAJEXpJwmGSmu1GY+vmjZtXkSXwBgIfWPT/bX7l8GHzO4CDQP/c3PiPPenp/+Mdne7wyMrq+yAUDajAbONE0ihVwj1CtO35XJq/m3adeAYjh4/A1ccRGR9WCJ4DSqlDsRPCXF+Wzouv060XXl5Jr165mPNdITXiRyScKoBFERyFCaTdrdfu4QN37Kh89Rk89PMnqyPz+3/zqw+dmBcRevbYL+b6B5r2V2p/b7Kd/q2p5e3N3PXFs0UXl+ChkpCLHUQMoSBEqimy2h4fnaw/8MD80FNPS7DvTrJeidgqBOLBYw2VCIxTyIkPYzV6rQjLa1u0FiaC+ohH09M7tmu1nSv5klvKlbbXCpVpNbf30PgDTwS7jpyg8o59xIUyYlJIxYHIAtoiVQlSFSGWNtrhFhwlTJ4oJ1k9fJvcdmyEocgjJlIgj7LpkKSgNEBIoCjxveHC1HiQnxqH9QyFzqEXJxJFESy7c6tLiy8jGxhLg0GQA4v+R3Jyft6fLJVYgNwvjc9+5RE/+E/3tpojk9tb1zREeaCCL6RZiSIFr+fc6pZRG6X5g0/sOPpYpfjgEZbxSdUJDHoFDREL6fbgJwn89XVsv/gq1r95ZlN9cml51HeeVqgxJFJQvgcKLOtmT9DaIFUrH5zPTT11HLmHDnNQGVNf23f34/ddu/R7/8//y395rXe3evsveA9tzhWqd91PhZ+cvrGS5D65cn3E2qpWYlghJwCElLEgajPf2B6u7B++797J2o99Bd59h6hTqSIBwQEQT0GMgnPZZHUbOjQ6LayurKPRaILBVJqahKep0KtV7mx3urZQyHNtbNwf3bXXr997H/SeA0jLNYQaCNkBJgEZQpJasBKwRGh1N9F0PVE5z3A+n4+icE0xJxCrjWRjXxVIEfrqBjyIZBuTPVOicmlPfnwkoJE6x4pUO44kZpYwiiSOo6WLH334kYjQc889R6dOnRqoeCD0P8ySw5tE3pxaWOg9NbVr952+9x/d2Wzvnm5uLSlnu85X1WKiPF+8QkIcdjlZ3/J9L3fHgfsmHz9eG37oIfD4mHSDAK0cIfIZ2kXI+xaysS7rb76K7eefp/STT1fqLom16OEkteI5eAFDF8hTLUau4fsT+XsOzMwef8or33uf9CpVCos5qg/XqbJzbO6u1u65pLl8qHnuYBy+9sGYPndJSldvnq/G3biqaUocYmEopwiJoNElpM1aeXf14F3Tk8efVP7hB7gzMqI6mgB2UApIySGiCJ7y4VmNTqeLxfU1rGxtouNSqHIRSamA8tgwynfs8SfLJX9oqIby8AjytRGgOoResYjYeOiRQ6QcYBiJ6oGMBrNDc2MN6+u3kCiQGRsTvdqb3m6tdUza+aCo1F7DnBeAJdsF4yib88wEsk44Tskkeqia8yfGCEM1CUWw3elCnFBzcwtp6s53gK3TgDp16tQgCTcQ+h8ak6u/UoI8uXC295cO7di5N+W/tb8V3j231VzNMVM7oJJmcQqUEyjusb150yOT371n3+4njteLjz0q0ew0Ul9TSuink3ooIkWh15buuffpxrd+H/biR9dnXBSVtR5OU2e0oOcL5T0yXo/T7U3je3r/vt1TTz9VqD78ENKREYlIUxSnCJOmGyoZOzM9qeBzNaGLWLq50ty+8MnNYqfdLWgqQRx5RAUISexoq604aZVzY4UDe+YmTjyJ8kMPu7BW1x0yCMXCKIecJmhkO1E0acTdHtZXl7G6uoRmr4PUKJhaJV1ut6ilcubeu+6SXfN3SlDMI7GOUkeUMhAzEIGRGgVRBkIM6xJoo9BoNXDjxg20txso+DlUduxlPy0WQgl237hypTXn0k4VACmVdwRPASIilglQRC5hdjYwpjA5atV43bf5gCLrpNuLxEaJWVtZ66zcWLoOgF/6O38nABAPJDwQ+h+4Qsti3ScXwEfmjwzvtuu/tjfu/ZWdjeaNgNkYFdRzLmmLcy0LpyNKG+seuWRuxx3TDz9cLz553MmenbqTy0PYICdZWWspTlDoNETe+4DWv3kGrXMX1sfC9qWiUmMEFAXSVUQBiaYY1LiuXC/aPzk699SjhfLRIxLumEI3nyPAR5EN8my1Wd1W3bVbrvv6q7z+zW9F3dffuFhLknbNBCPg1AuFt32th0UobrGk3UJhprR7x87SE0el8PADkNEJnZAPcQqGBB4sAgZyykONNaJeiMVbS9i8fh1xuwltDFQ+QKPd9m5cvY6d4+OY2HsH5UYnKeIEnW4HAoC0RqoJKRhCCpo8gB1IFJrbLSxdX8bm2jY4JbBfhB6raQTDrlyqVXO18rHtyxc/iLfXGmVhG5DKpYQAAJOmIAVcDGjK+2O1mUmtR2uIDSGOrCRRgjROqLHduvDRxY+XvvjwHiTkBkL/Lmt+qr/s66eHhuZnXfjL+2P+6n1bjVvlTtjUujBHgjSwxAkRNYTXEx85t2Pm0dmHHizVHj/KZuesbhWLiMlDLjUIHOCxA/UitN75UDb+l9+nrTffW693uu8OAdMAm0SkYzU8ZDFyb4vdam/f9B3jjz2wu/Log6J2zFG7XESoPQQRUAhTFAigZgfNsx+YzW+ecekH5xtlsUlBUU7EmpSQJECcEKKUeK3j+1OludmdtaOPSeXoEyRTswiDPJg8eAwUfR/KRaBuByZ0MD2L7sY22kuLsFtbKEAhXyojjh3eP/+Ju3lrEYcP3KXn9uxDq91DtxuCBFBCEBEoreCRQuoEwgLNBBs7LF9bxtrSGtKYQeIjNoHciCOSNNaH7tov9z12P9365r+5Z+Ot1y+nKxuXKsJND6gahaoiKAG3IgA2lx8qjE8qb3gEkdIU2YTjKNGddgfM6fMfXfzwXaUUVlZW7EDkA6F/l8h/fe9e/x9fuhQLIPPTk//JPd3ez+7dbt0YaoVrOdCYk6gLwGMFP1Voto1Jt4crD+64797S1PEnkb9zH9lCgFQUlA7+f+3deZRdx30f+O+v6i5v7X3HvpJogABJLARB7Fwk23JiRwJsxfFoksxQmVGQiTUZJ+OJBEBO4tie2LHoo0T02GPHkSyhaVm0aIq2RKAbAAkCRGPvxtZAo7fX7/Xb97tV/fJHg7KcKLYy0SgRdT/n9AHO6QOc7vfe91bdulW/HwgKFDRBXhH1iTFdPHNazF+9/iC2kL/RLnV3FGwZYKkkTGWQdhQXHVYpf8nyx9fseGZJ+95nIVevpWYsBg8GhE8wA42IDkDVEoo3RlX+7JtG7eY1t71UuhsHR0jIqMtwlSAmiWhAXC77WoplPcnOp3aj45kPACs3ohC10BAEgQCWrxFtBtBOA/nUA56+fYv01CzqhSoqZHE82c7t3b2oKxb35+bBtdqP9/f1bFi6dOm/oqil8sWy0EogYZgkmUHM79VlhdIMRUDT8zE/P4+Z9DzqdRcGTBYcYTsaV1fGzusHE+NO+/P7xXO79yeXRBha8orCuXc9zOcm4rbBEeX7BkMGGsWyaca4pb3D7FtOMtHHvo5QM3DheAEW0vMwDJwFUPjEJz5hv/TSS+G0PQz6n/v8i1uNv/fyqNuzeXP8b3v6H+30xUeXVorZvkoxZ5PoEaAoa1UlAy0wDLfiK1RaImt6nng82bN3N6KbHtV+W1LUTA0nwgiUh4jUkF6VnVvjKJ49JTIXR+eMdGa6kygaZZGwWZmCwYEgQyssFDUv6N6+TQM7ti/re/Z5QRs36Vo0JppSwGMNk4GoJohaBfWxG6pyatjIXr2eS5SKd9oJMcmIBsySCRqL/cu8mtZVPdDzyJLdz7S3Prtf+6tXChWNw5carnYRgY+EYtgLeZRv3+Tq6Ns0c/0yI5+/E3jaF4mOjcklq4Q2Ijog8L2pyfS/+/IXR772ta81bSsaBA1fGIFCIAjqvSZotLgsoYIAWgCeDpDJ5XB/ahrVWh1QYCktJYRBqVTKzC8U/3G2kk9bHcl/gt7ODfHHN+sVrm/YVnxV/t0r7QuZVKVF+TfjZFBdB81mIhprX7JcWF1LIGNt1HCVrtYd4bou0un0VCaTmQcA13VlGN0w6N9+Xy7W307wksGWjp8Kmh9ZExj/+7pyvdxdLNwn1pYQMsKsPRIUV1I0Kl5Qa0Zine2PDq5cfuCgjmx+TNTbW0TDlGgagGP4MCmA7QYs5iZROn2acmfP5ene9L2+QHNMmiukgiYWQhLFhMJ8JVAl7u5a3b3liTV9Bw/A37JJ19vbhM8ET2swFGwJRH2P9eR9VE+dkYULl9Mylb3VFVBggtYQNIN1UwiytOJGnbmuevqWd+94ur9z/wEjGFzDlbgNhrN4PFQGiGuNSKkMdfWarv7ZN7l59XIpnstkkp6bgjBUJVp3VUMvEfFkX1V7frqw8Ara2830dHrVyhXLSdSaZHsBFGkoWkw4M4MEQcCACjzk8kVMPZhBuVQBFBC3or4BYS1kFjA+fuX1n/6Zv/GvJmtbtsQ7epKBaWgVjVL0ySfUkkRbhBOtfdMXR5Opqak6yo26tiOR+Or1fR1bnmCrr598I4pGtaiq9apZr9eDbGbh0o0bN8oPgx6utodB/3b7xIGRkeDHNq/c3uaq/3XQcd1Ydn5cwE8oIUxfqwIkotowREmp+appt7ZvGFyy5LkPGonNT6De2YOaacOXAHQA0/XRqhWM2VkqnDuDzPm3azwxOdblKT8mZRexj0BCCk3MMCoVrctesrWra+PmDV0HDrK5eQuXEi2iAgMmBAzlIcqEpNdknpyk6rmzyL97vh5MTV3qYteVUj6qNSsm0gGBfeZGTbPPHR093U/sWN+37wPw12/kRrKVvIgF9jVIBYgbjHijguD2DVROf1NUzp/LRXOZsV7DqAmBfgBGtFq4WBVWA9lcn2/LSkTLL6BYLFdKpQ65fJkUUFoJBS1AQi42KA+YIRdvXFAs1zA7k0IhWwQrDVvagSktq5TP8Z074+fGr1z8+Jdf+ZL1yX/683/38fVbljaECBpSyEhrq7Q2b+JkJM79bV3x6pVrT1Rz+UC2JmX/E1uo/amnwD09aGig6fpoOk0UCgW/Wq3/6fT0dI6Z6eMf/3jYEjkM+p/biBEGgC2U3NCpax3RQvZmVARJRRR1wQ4LSC1IVQRlczCjHY9tWrn0gx9Ixnc+zehZQkrGwDBhaQ0rACzfhzGf4uqZszQzcrru3b9/u91XniXQolmZTHB9IhFIqWq+d7MYTazp2vDIppYDBzixfSv5XZ3kwwRcgLVCK0nEHBf8YJKLp07S9OlTXjD/4Hwru2QK9GkozxMCPnPDMUnUlS76rZG27s2bNvYcfA7isSfZae8kLSVsBhQFMADEynUEdyY4f+4sFUbPsyimH7RAN4h5iRCUJARkAZ1JAwmHA8hmc/6Z9asmvvQNIGaZrpDk+QYbKgoCERga0ASSEq7rIlsoYnJ6BtlcHgAgWGjLtFS+UJR370ycfevdt/6X+/fvzQLY1dPRsWnlslVoKmLPSpDnaUSTBsU3bKRESyf8DRsB3zU4EQH3dEIuWYJmNIa640MpxZ7rI5cvNB/ZsPbEyeFvVP/BP/gHdn9/vx9GNwz6tx67HFpcaU/EFNa3sUzYjt8wQd0+sSEJMQHDqmgqlSF1dPCRdf379nZFd2xnHuinIJaAYgm4DAtAS0AQCxWun72EhT8brjZujN9POn45aopeoRhKc5OESECSrELfywljZXTd6nUdz+5D6zM7SC0fQI0kpAZamKC1hwgr0Oycqp86K+eGR+rO/buX4m7Ti5iiU2qOMrPSoICFadXZmy+12QN9GwbX9hw8AHvbVtT7e6kZsRebHtYaUIIRDXzgwZwqjbwjU2fPQ6fTf9bB2paWWAbNrEFaCsR8oKHiMd81CVW3cd8olXwACJRX0KQzPqllbJLWAUP5PhkK0DBQrFQx+WAa6ewCAq1gSakjtu2Uq7XYzYnbf3rt2ujP3bt37yYR4ZHB9St72tu62xMt8H3WgM1sMLkM2FEDLctXINrTCwgfri1QjVhoGBaIBdxqU3uua1RrVZTLpTuFgnQBIJ3u4JdeCjfK/Jd6v+5152/7w6uZwmtKyxYUjbBGw9ASBmyltawxRWLxJSs3rdj1THfXnmfIXbEUpUQEZYOgpIAFIOoHENki3EvXdPGbp6l57XY2XnNTSYi4wTIuIU0CMTQqykexyrI98cgja1Y/f9BO7n5a+wPdKFqEpkWQUIjCR8wM0MzOcPH8OZk++5bj3Z140Oo0qy0mDZgCbYIZJkvLgiFZiWwzklzWtm7Dmp59z0YiO55mt7sLpahE01zs+BJxA0Qbdei5eVU/fV6mT55TYip1pc1VQYTIJMXK1CRsFkKx1VTSXrIQj6y/r9356UL5t7/e0eECwDcvvKXuTt9nZob0FzfYmNKEIIFKpYJUKo1cLg/HcWAIqaKRqHZdJ3bn1s23371y8VcuXz5/89TRU4bWmuJmxBJaSrgK8BQEBAxhQLKA7yvUwHASNkoJG/mYiWrUQMMk1JUHz/MCx3FEqVyqp9Ppq++++w4tvqfjYWrDoP9FQzgsAHiT7F+YJjE12dW7tmB3xhyK+xVfltMK2uvsXr5y+86e/h27SK9YwfXWJFUiEjV4YO0gaRDMZh2Va1d44RvflNnr12Zj9WqmyzA7bIW4pYillkQk4GhdLCldEQMr1vfv2ZNo3b9P07LlVJEW6kpBs4IkBVs7oGIGuWsXMX32tFu9c2e2zWnmW4VcGmVqNwKtDUiDIL2GxnxBRLpjqx5Zu3TPC9HkrgOK+5dRwzZQIxcB1yHJhWQFmZ7lxltn5dzImbo3MXWzpxHkWkkssTQitmJlaQgEVGsqytcHlj45Z9ttFyv5r/zG+dNff+qzn/UFEd5690Iqncs9qFeqaCyURDVbQqVUQW4hj+mpacyn5qECBcMwlTQMNJsNY2zs+r0ro+f/1filCyf/31OnIseGjxlCCM5kcgu1ar3uewqmYUAQg6AhhQBLA3ViVEijqDQaTAAZAAso1mgEHtedJjtNJ51Op/4sk7nmAkB7e3v47Dycun/nafy7mfmzkXjvy13J5HNNYaxt0fWEIRQbydaWgY2bOlr372ZavQqNWJwc0wIDMHUTUdeD6TXYuXObsqdPU/byaDlWzt1sl4hL1gNgVAyAXHCzDl0pCzL0wIq+7t3PtLTsfob95cupaSUoAMHSDEN5MJUGl4qoXLmE8sgZqo3dSHWUCqlWKeOCVQsF7DELKJKqxqqcN6TAyoHHBvbtRWTvQYWBldKzIlAGYHAdduDD8AlczKN5aZTyp0669du37vd6jdko8VIwa8EwBMmox7pehlfIJeL96e7u2DThj78+ceN3+OhRNXTssEEEr1yolJqutzA9N4d6roKK50NLCa/polqqwHE9kGFwNJ7QjlM379+9VXznnbO/cvXq1ddPMMtPPv00/d0PfMAdHh4mIhpXJG+5fvBErCVBzaAJZgYMGzAsaEgwa0AJ2GzA8E34gYLHEk0EKNTKVK1Usg8e3BsGEDAzAQhefvnlMLlh0P/cYQypo4A4Nl+cJRT/9d1o54knVnT+w9XxxP+0ZeWKpSs3Pe53P7IBctVactva4Fg2FC+GspUlYs0GGuN3Of/Nk1QaveRGS9m3OqDjBlEPsfYkyACzbhKXMuAmlvWvW7Jn7/qe5w9CP7qWa/E4+WxBskSEFSJBAFEqozR2E9nhs2i+e8VNLhTTnQBZWrWBtcMAK2FYDvNcxpQxuaLv6faDOxDbt5P95Stk3U7CMkxINJGEhq08yGyJG6PXKP3mMJdvXL/VVq3nbWEuZQSmhm4Ske0C9Qo4V2612hsrlgzOEX1zQuGf3Sr7lz57/rx9qbeXlGasX7tqTaFY2vIglUElW2TfDyAMC1AMFWgABCGlD62submZ+uWrV7+Qz+d/H4AzdPiwNfvOO81j587R8PCwBPAg0dIyli2XEG2NCVf5gJQIBENrDSkFTEhYLCB9DfI0DALqKkA98GkmM4+5uZmFSqVSAIDDhw+LoaGhcMU9nLr/p44DWjwsBfx2M5+qPbXhXywsXfp6ZN+zWPnhQ8LavEnV2lvh2DYkBCzfh+27sLwm1Mycqo28JbJnz9bM9My7SR20kyG6XLCrNTUlC0OTYI8Eeb3t69qf2Ly6d+9e2IOPotGapBoRNAQMIWEogtn04E08UOWRcyhfvAyxsHCuTflNG6Jn8egmiCGkBzGXY1Oo7qXLe3Y9gyXP7oG9ZgW50Rgc04IDQOkAca0QKxfYG7tC6ZGTcK6O3Y8Vq1mDGIH0BQstGSBfCKPCerYctRvR1Ws2J5/YhHVbNvyL373yzrt/fPTF2EsTE996vVYvXW0kokmzWW/CcV0OAgVWenHkJQ0hWcWiJuamJt074zd/f3xy8lOzs7PNo0ePiqGhIR9YPD66f/9+BSBx/97kQCadQSqVQRBoEpBAoEF6Ma9KKwTMCCRB2wKeAa55rl+r18xypZTLF/PnAYCIwrSGI/pf7iOAfO7FF0Xq9m0+/nuvOp//1//aXLFnH9C/RBfzaaksA6YUkCqAGbgwfQfe9Iyun35LZs9dKIqZmdst3HCjwhgAcdTXuqgA9khYDVYztc7OVb1PblzWf2CfYW9Yz9XWONUtA0oL2C5Dag3yPRRnZ3Tt7Fsyfe58wOnM5XigGxEh+6VGhIGmS+T7lmUXFbV4PT3d3U9t7+vet5cj69ZRI5mAEuLhVNeHDR9GtczO2E1Kj5zWtctXMolCaaEFIqkExVkrpRgNAbI80FzKEF2RgYGVfXv2WPYLL6gvXr/2yae3Ddb+2vGX3z106FB05cqVDAArVqy2E7F4XPuBJiIShoSQAp7vAoBqTbY66cxc/O6d2384cWX8l8tTUyVmpodB5EOHDktgkIUQ/OSOHTuCwN9WKZfhNJuqu7db9nb3UiwaXZzC+4s9FxQBSgLSJLi+plqjytVKmWq16p07d26dJSJ8+tOfFsfHw4W4MOh/icGjR+Xf+8Vf9Fhr/PRP/I3jW7fv2NO3crXO5xeoKSC0AYB8WFohGjis5mao9PbbInfmdBWT9+f6NWuLrGVSB0IxaxIi4giulrVeqLa2dycef2zJwLPPmtEd25XTkZQFI0BDSFgsYbKG5TOCYh4LVy5RZvRCjmamp3pYFxNk9hJzhIDAF8KsSa6VtJNrdnY+2r1zsH/JB5+GPbgatVgMDUPCJ4b0PcS1h3ijDvfuJGeHz+v8+avFlmxhpo2sqERgmUoRkTAVI3CJCgUhY9ay/kd7d+5oTezZFUSe3II9XV0fmivWrJqrjr7yyivvfPnLWgLHUXeasS7NyWjEDlzHQRBo4QceLMsMLNMyS8VC/Natm3965/7Er96euv1g38c+FiEiB992wOQzn/mMZmYsW9L/Y/F47FHf81ShUBCu4yJwA/QP9CORSIC1BmjxsAwzAM1QgUKj0RD1ckWrILg6Ozt7nZkFAD4OMMKRPZy6f8fnbMz04z/+48xaGz/zMz8zuP8DLxxZtnZtv8s6qLmuISM2IDQIHmztQiykUTp/AemRs643cft+h1epxgT3mUBEMktTa1czOxXAy7cmIpHHBjf3HzhgR7ftVH5Ht6xaEr4hoRmQHsNmgh0EcObmuDY2Rs256VR/0LifAAZMxRGDmZUg0yf4JValfDImEk9ujA0c3MmRJ9ZqpyuJumGhyQSwQhw+Es0q+O6Ebp4+J4rnLlfl9ML9NggWghIajMVSytIgFqqqRcPp6NywZOu21vbnDga0YoVR8T0xuG174+Dzz72wc8dTx9pWrWo9fJgUAOQX0vdLpcLNpuNalmlapmFIKaQ0DTNSq9XktWtXbs/MZD5xbXT0/KFDhxIjv/d7znd4zQEAESsyaBlGi2b4vueZ5UqJpmemMT0zg3K1CkUAPZwxSBIQiqEcjwPHRTGXF4HjzBBR8dixY4KIGEThinsY9O/s2LFj5rZt2/zW1talbW3tR/cdfC6qDRO5cpXsaBJSGbA9RtLTMBdyXL14iVLDp/3q+Ni4XS+XpfBNl516E37FB1yXyKkrztSjsWh07dptvXv3oOXJHazbB2SDo9DaQlTEEOMILCVgQgBao57Po76wgHij3pEUWGIGfsDQPhkUV5JQVEGqFok6XZsef3rN/mdb7cc2s5toFUEkDmHEYPhAwveQdBvgqUksnDpJ6eERVtMzqXatcpL9NheuqyQsGEaLC5SyoEy9tWVt68bBaOtTO5BYs1YG8VY0fIh0Ni82bNnCL/zojzy2rL3lbwKwBAm89tqrwzfGb3zu8qVLged52rQMNk1TLWSz6t2LF8ZujF9//tSpN+598INH7IWFBecve+19z081mk0wawlAq0Ch3mhgZm4Wk1MPUK5UEGj1rVG96TS5UiqjWWtQamaWZ2ZmasyM4eHhMKnh1P0v19HRQQDwsz/7d3oefXT9gdb2doOItK+0tIRElA2YDUa0XOLGpes0++YZ7Vy7NRcpVubjEl1aoksr9pip4WluKmnUa6axJr5i+fLuXbvQvm07VM8ABXYLDIOguAn2FORiqQYEpAHlod5sIPACUMBNrVCVRIkACOoWKc8PMuVYNNqxfsNTy3YfsKKbtyPo6hYNQ8LzJUwYaNEaMd+BnJ/T+XfPUf6tM1S7Nzna4rqpiJB9zFozcaCEiDYEKiWtapVksrd188alS5/bbyYf38xBSwtpMsAQCDSLZEsLWto7O7t6u3ejF/9OZ7R35MgR44/+6I++0N/b+/bVq9c+HrHtJwNwpVatv55OF7568eLFOQB4443PesB/doQVAPTU9MzpVavX7icSK03LcjzPiwqAfKcJf34OgQrQ09ODiGWBNaNer+tcZoEK2Zxs1BvvZtO5MQDYvHmzHBkZUQjPn4dB/89paWkhANi06ZHIQP9ApyUA33WgdUBKLD5Ki9VcLl8ax9wbw37l4thMsliZ7CCzV3AQYWafSRhgITxTOEWILtHbv2Lpzp1WfPczjFUrqB6NwiEGiBCYixs+WDMQkai4HqqVLAoUgFpbEUSTtVKtPt9iSEsJcNnxH1QNGuhatWrD8j0H45Htu6H6lnHVlFQTgBAWhB8g4TRB2ZQqn39bzp8+icrk5KVOx811kOyBRozBvimR9IjqZc9fKCVjbYlN69f2v7DHSj71OOu+LvKkiUAY0GQg0ES+YvJ9xdoNPGQWQ+S6rpydnW184QtfGF+6dN2vDA6u6qu6rntuZOQ+gAYzi8WFN/qO21Dfa6Zw9OhR8Wu/9muvrVy7eq1pmf/X+vXrI41G02s4TZOZhFYKqVQKlXIZUTsK1hqu43CtWhXlUpm1Uq80ZisXmVkcPnw4LDIRBv27E7dtEbNNYfge2HERg0bMYBiFMrx7k5wZOSuyFy/n2vPFqW4gkgT1+ZqqnuYmCxHxtPDzmrW/tLd/xa5nrJb9B7VYvUZUWuOoSQHf98BKQ1oMkwBLCBAr5Ip5TGWnUPNqiHR1Qa5c15f3bVWvF+O+9kzd3hJvW71y9cqdu1qtZ/aqYNkKWWtJUk1qKPiwBC32K6/kdPXCeTn95jeC4q2b9zpdJ9dBoiMK6gSzChabnYi6pwsV20rE1q1Z3b//mVj7np3s9HSjbgooy4KChK8I0rB1vdZArVJ90KjWfx+Ae/Qoi/Hxw+6hQ4fk4OCgPH78+Nzs7N259x5vfeQjH7GOHTv2V4Xuve9RrVbNXxgd/V1W3E5EL65YscKORqOq3qwHgdYGAcg3HViWBdYaAgTWmsrVCpTSVycKE5Vjx45ZQ0NDXhjVMOjfFa9RYa+R0ML3RFQrtsEUa9Tg3bqN0slhURwdrUaK+dmkwbB83WkwFEAmILmpuFTioN7o7+3t270z1vX8QRaPbKBmPI6aADwKYAqGoRSMhoLh1NnwPWpWamgspNFcSMP1XRLdnYivo362kv1+pQrLFmhd1b22d8tGWI89wWpghSzHY6jZJmBoxDwfMdeBXamyf+OGyA+f9auXx6Y76407rSRWSRIWa+2zgKVAbjPg6aJp2pH1a9b3797V3rJzp9b9S0WDJOqQgLCgQAgY6I636OmpKUw/mJm5cOHCycVXadh45ZVXgoeLaerIkSN2R0cHFwodlE4XeGjo+HcduOPHj+t9+/ZFRkZG7s1MTHzqwMHnzCBQH166bGmnbUfgB56GZiGFAGsF3w84akeENE0UC4WgUqm4AMSDBw/CtmFh0P9qvZUKA0AqNecnTKtuaZ2UmkmVy0yzs1Q+OYyFk8PampubSLBXZdItDumagJAmRIRJOCXtVWqdLZHefdvWL31+j0Eb1upmMiYatgU38GEgQCsJxFwXwfw86vcnqTAzi3KpiCp8GPEYkq3t4I4Y6mYUyaUreElnH3X098LssphaI1Rv6SQ/2oaqsOBoRsLz0Ob5MPIF5K9cR/X1k9y8ND69rNSYiki5RrH2mcCuFOSzKlRZl4umWRNrVu5a9cyu9pZ9ezUvWyEqZEFJGyZM+AGBxeLobFsRNGp1ZNKZbwVpfPxz/N6KOQD815ZrGhkZcfbt22eMjIwUT5385icK+eK9p3bu+LlNmzf3WZE416pVtqNRUkqBldZCCOl5Hlcq5Rup1HQBYc/zMOjfrbsPd32dOncuQBBUSR1MGgyhZ6b8ypkzInN6BJieeqtDNTVZaGMwsSDL1+wzSVVSQb3Z2dLb/tTj6/r2Pm2IwUe42doqfGnCExIghYjWiLsu9P0p5M6c4+LFSxQsZFD3G6jFLeiVy2CuXQ+/rQuitwttK9ZQ/6ObEO9og6uaVHfqcLSAb5jwpQHpNxHzHFjVKvs371Dl5EnKXrj4bn8u4/QIuS7QjKaQTVeQ8IkaTT9IV2yCt3zp3uU7t7W27t3Ncs0aUY4m4MCEJAnJi00b+OGDFqdRhwDQ0doavPdaDQ4OEj1cAf9eGRkZUQ//z+Dq1dHfFIJuCqJPb9w4uK2jo6PRrNel6zqWbUd8EFAulZxMZuFP7t27N0tE4Yr798j7vvbWUz/yI/L0yIjKNgvekxsfi67vat8RSadE9dQ3jZm3zrjOxMSlbs/1o4R4INkUYFhamJIMu6a8uwvJWLxt2xMbBj7wgWjkySfgdvQgoAiBbPgPmyIkJQHpnM6PnKPJP32TijfGzohsOquqhalmvTTDgdcOaVpGPImutet44InHyF7agYZy4DR8kLYBIwqfJJh8tLKLlmqFg1t3MDcyTLm3Tk/aszPTfaBWg6jdY1VRhow6rKsu81zNRIJ7uzb3Pr29q+/AAbI3bEIz2U5Vw4IyDEAyGApMApASSilkM2ldKRWNXH6BmvXa3PTMzMTw8LBiZmNkZOR7OpIyM42Pj8ubN2968/OpO6Zp3AejPx6PPdrakjQiEdtva2sNAs+zb1y7SrNzs0cmJydnXnzxRePkyZPhQlw4ov/Vxhfnf/RYdKVoZAs8OXqJxVxK5M6erTUmH9ztcdxMFFgOwBCafZIUESDhKErNxqNtkS2PrOjevTsa27Jde129wjVsYmXCIgOGYJiaQb6D8uwUTY/d8GtTD7Id9UqhW+gYazYiVa+aTufGRFt+68CjUaNv+XLEOpOoNkrwqw1YvglJMYjAhyUWu760uXXm6UnMvn2W0hcu1GQmnWkVop1ZxFytch6xDlh7DMqWwTF0tm3ofvyxnp69e3V0wyCpWJIaWkKRBYjFffGCGCQEdKBRKBQwM32fXNcFA8u6urt/vL+//+tE5B85ckQCCL6X7wEtbnTR+/btiwwPD7tE9GalUmkSeLJvYOD5ZDK5qlarWen5+cn5+flX3n333TEi4tHRURlO38Ogf1eWjo9LArwfW97fHalWf9YbvxuZvXWz4dydGu9tuDMJNpYa5AtFsCRBBorcOutG3ooqsXHN1r79e2P2UzsVdfTJumHDkSYkLEgiGKQBHUA26qyKOWpU8o2Y9qbaTXNNiw4SRIjrQN8slN1rCW1uWtndZ7R0d3HFDyhoNGEKA0bUQOA1oYMAcQlEm3Vg6gHyZ8/Q/PmzdTU7PdHB0raliAWB50OwZkHSUypdF6al21o2tG7Y0N26d5+Kb9oiVUsnamTAlxaILOhAQ2jAEATlA6ViGdNTU0hnFyClgDAMtXzlyiCeTNK///f//v/Pt4JHRkac/fv3Gz/3cz9n/vqv//rbY2Njbz/33Av/84oVy/6a1tqenZ39w2984xsvv3eAZXR0NCwZFQb9r3YUEBsB/DpAB3u7u9t9d1lkYor11NTVZL02a5JokwwyhIhDsOUJNB1Pp2skGnLFsg+t2r3PjO3Zr+WyNbJmxFElRiBNRISBwFcgz4cIAhhaMylN0FqwUob2vDKBJQNuwDovpR2JRGLCtG14gQ/P9yEgYZCE73sgVogbhITrgGamkTl9muZPngzo3sRMV8OdTWqx1AKZJCB8gvII9bqkWj0ee7xtw8buzgPPcvKJ7dJr70FDWnDIgrIigDDAygPR4pbccrWM2flZpHILcD0X8XgULKCFlH4sFvu+TI9HRkaC4eFhNTs7KwcHB/n48eO/BeC3vn0CEE7Vv/fe148uBl78vPzpV15pfnTX9p2iXDy6ruZx5O7keGwhX4gYsJWEqQUMxexrEqyY8jUhWuTAkueX73rG7NmxB5GBVaJhRVGRAr5lgw0DARi+1tAaEFqiUnYoW/PRIDPqRO2OspTleeZb0+xfyNjRiFg28NcaLYnolNNEyXGEFhKsCAg0WAWwSSOhfVAqhcroJdU48za82xP3O6vO/W4W62MatslaEROYqekKCurx2Fp73bquvv370Pn0HmBgBarSRlOYCEwTijWUDkAPz+iWGlU8yMxgJjsDV7nQgsFC6KbnGjOZuc6zt89+3z4LRMTvbaz5Ty7OR4+Gp1bCEf27X/whIRgYhWbuW9He9tFBNve1374PkculTWahhOgQDEmAYBBY8f2yQUlzaf/anqd3Jdr27watWsmuGaU6NDzyIaQAePHQBpkCQSBQLtdRTOWp4gLcPWD4/cUlC8jYUSmaRntS5VviyxZA8bm56a883mhs22ZayyOmrQUFQvg+7EAjbjAon+P86CWUR87I6t378x0NN90G0WZrRJjgMhFpoN7UuliFlTBXrlm2ZN9eM7FjO6Onj3wzAV/rxaOsYIADEAloZtSdBmYys7g/P4liowRDGIhGIgEYVjabDSYnp86Mu+MuEX0/a6bz8ePHceLECTk2Nkbj4+MMLD5/D2MZBv27cvjwYQFAffzll/2ffWHXocekdagvnffE7OREG/sJLQQ8ICpA0mB4TNKpao57bW0re7ZvbWn50edVMLhe1uNxcgwDsAQMCqCUB2YBISQ0BCq1JqZTaRQXipAyisjyVYgYMmIM5Jd6jTrmZYBZwekbxdLvfWX02su/8dGfeYniyeXRaNKtFMpRU2lEFMOqlHXjynWxcOYtVK7fnE5WGgvtwkqQ9iOBVgUthBmQoeqBlyqQYdjLVi7v37070rHnaVbLlsOVNphNCENDCA0FBQKDtYDreZjPpjGbnketUV+cwxH7EdO2s6mF3Oz09BdGr1x7BQ34mjURUfD9vCYfPnw4rBgTBv3/28xwcHCQwUzPb17d/Xg0+bM91XpXMHF3rDWoT0dJrGqQkFLpwGAon+E4IFnraN/U8cSWWHzfHiU2PiIrne2okQ0FCcsQMAhQrgdBDBBQrlcxl5nHXCEPL/BhR23mSA9U1NCFadL5tD/2oFKdnA4aw6+P3vhdIqpE29qrwrAQFQbXAx8xYhiNKjtXb4iFN0dQvnYjFy0Ub7Qq6hYCLYq5HICUJlBNB+m0YajoslWr+59+uq979x4EK1ahFouTJhMGA5ASEAxoDWIN1/OQzRcwOzePaqkBQ1iwpKFNKZFfyMp7d+6+9odfOvFLQoiM4sXKMOEqdxj0HwiHBgfN48ePe4ODg9ZS0/6ZnoXqOmQXHsQKC+MRQRtcZhcQlmABn4NKTUBXk9HOtq2Pyd4PPAf52GOiFI3BtSKAsBE4HrTnI2abEBAgBqqNKuZSKUzPz6MZONCSAVMqSMuYLHri0v2Jr188c+HvP4AzdeLECfn64cOKmckkUWTXg+G7psWuFo4jnPt3ODsyguz5d3Mt6cylVqU6LaJ4oFEHkQbBVJKCEmulVy17tHfnjrWt+/YzrV5HbixJTcOAZoKpFTSZi1N3DSjlo1QpY2Y6hUKuBh0ApmlpkzVpxzOvXb5y8cI7F75ARJkXPvGCTUReGPJwMe4HJ+gbNz788xAe7+2XnW6A9mo9mQDaGax8YsWaXYbh1SSo2GIljCfWr+h5brcd3bqFg54eCswItAYoULAgQJDwfYDIRLPhIpPJYD6TRrVWgeM7YIMCOxF1cl4D5x/coxlBRx7AmXp4G6EerhsIt1ptBJUK4NRFPjXD969d5KnhU2Lu8mjKSqWvtAYqlgC32NA2SGtPQAREquGpu05n+4YlT2xa1XFwL9uDjxInWuAJC74woKRAYBA81giY4TIjVyphemoW+XwRxATJRhDRNlu+QeOXbkxnZjL/ZHJycvjLn/6y9cZLb3jhSnc4ov9AOl89T1trjdgSxRa0WY6AhEVGn0/aLQk5XWHfacYSy5OPPrKs/8CzdmLbdtS6e6lpRyBMc7GeGWkYZECyBGkB1/ORyRUxl8qhVG4g8BmmsHzbjMiZqenEzYnb56dSM/9GFkodf+vw4SORZHJZ1XG89MLCbSL6Z//sH/3jSPXR9ZhXTXXz8kXTuneHrHdvLESn5qcSrEka1Kk0QzIFJETCFzpVVJxz27q3Ln1y27KBvc9L49FNutGSJNciuEIvFk0kAqQBzRqe56NcLGFuNoPMQgGB74M1dEsiqTlQ1u1btzOpudTfGz47fFIIwWPDY0YY8ve/990W2MHxcdoP4LcnJnh1MoGEae41NPo6K/WU0H5dMTXntT+TjRqtHeseeXTV3gMt7Tt3s79kKerROHmGCZCABEHrxeIRpjSgfYXMwgKmZmeRKxbh+wGbpsW2aYvJe/dx++bNb4xdvvyLN0ZHX/8fPvrT/3bXnj0f2/bUUxtXrlm3uaune8ej69e2tsQiz/a0d3SVcws6NX5Z8p27sO7N3RsoOdW4QV2aAxYASzJiikQhC1Wot7Wt6H5sy8blz70gott36KC9XZQNAceUEKZY7GPMBGlIBKxRKpWRmk1hPpOF43mAVohELEcIjjyYmszeunfnF159/dUTzCzGxsbMz73+uXBTSjii/+D5DBB8evH3Cn5vbGy4desTX0HU+Dkx0DcYd2sT5LvskOqOrV7xyMAzT7e0Pv2U1n39omHY8KQFliZ834MtTBACABJ+ECCXy2J2dgaFQh6e57Bl29o0DZlOpTB2/erXLl26+H9mMpmxn/rJnzy0dceOH3nhgz+iEm0dzWq9Yc3Np+Lnzoz8vBX4qDWb7BayphUQoo5GNKDAJm2YrKVi+FKItgBwS4FfbLbEl/RvfOSJnhf2a2vLRuj2FuFELXgEgAQWGxhraGZoz0e9VkM2k0E2l4PjNAFmtiwzME0jOvXgQf7Wvdu/8eqrX/ntF1980Tx8+DCdOHHCD8soh0H/gfRwDqrBTCDCRC5zoploa3f6Wn5yudG6OyFAXe1tWPLYZrRs2wletVLUYwnUpQnv4W41IRc7hpAwABLI53KYmplGNpeF53swTUMZhjTK5TKuXrpyLpvN/EImkxlrbbVXtfd27l37yHrP9fxIdT5tKGZLCKna2jsUmg3haRZNP4DJkmwZhRDScJkbJmtTSGoPpLDKnrqdjdhL2teufaxz/z7dsmubUF3dqFsSTdME0+JmGz8IYEJAAqhWq5idm0MqnUaz2QAxQxJp27L0fCoVzM7O/t9fGRr6l0eOHLHT6XQwNDSkKSy2GAb9B9lxQC+2+wXRVOraTz7ddXRuLvvaYH/nTzy3e8/HBjdvNlsGlmm/vUtUYwnUDRvaigBCQGkF8OLzaBIC+UIBD2amkC0U4Pk+WGsVjya4VK3i2tWrk5li7mMXL168S0To7m6vrVy5smRZUZCQ4MAnQRJaaREEQdCo142WaIyjLS1BEIkJP5aguh2JwzA4kMiSCBo+4OVMszW6bs3Snn170Lp9B6llS9G0o6gGDMfXkIa5WPVYaTAYrttELpvDfCqNUqUMsELMjviGISmTydiTk5P/MJ/P/hYR4e2339ajo6Phs+sw6O8fBPCpU6fkgYMHF8D8hrVl/eb/8YXnVcvaRwzl66CmlOUaEoEhAQKIFQAfDA1NjGI1j6m5aSxkM3BcF27gcDLZ4jbrtdj0/ckr89PzR86fPn33yJEj9mc/+1kvkUjQ/Fwm7jiu0JqhAyWkIaFUQLfv3rWvX740v37lyvjWjYMtsVUrWTBIB7q3HDFjxUoOrDwyW9qCxJKlrQM7dsZb9+xhXracqtJGIEzAkoDHUMHDLX1Sol6vI51ZwNx8Bq7bhA58WKbhGYY0stmsuHz18tCfvv76l+r1euNDH/pQ7LXXXmuGH/sw6O8rR48eFX/8x39sgtn+6Ef/xr6f+Mmf/Ot9GzdbTWlyrVSRLE1oLC5ai0BBcwAyNMhg1Go1TM8/QDq/ANdzEKiAbdt2GTo2OXmveP3K5d86ffr02RdffNGcmpqypJSu1ro5Nz8/Xa1WlYRAe2ubX6k1zJmpGefO7Tv/z7kLFy6y43Sx9v963BBPtwmgY8WyRGdHWyLerCFmG0h2dKJ9zTq0bdoMWrYMjYgFLyAo1iDDgkUEzRqAgqcVssUCpubmUCxWoFnDNqQfjUSMQqHA4+PjXzs18s1frNfr2aNHj1rHjx93Ea6wh0F/vxkYGJCf+cxnmtu3b9/2zNP7/o8DB559ClIiX20okra0pIQIGFAE5sUGfyBG3W1gfmEO6Uwa9UYTxGBpSNiWHZmena7cn7j/u6dPn/7Kxz72sUh/f79XLBYbSilJRFUp5VcbteY/8l1/SUuiNcg1SkjPzTcnJ1K/mJqZWfjKzAzaTyfPbdky+LPrl62QfVak87G1a558ZPPG5R3t7VoQCSOeJNXWRjXbhkcEoQBSBNYa0jAgpAEn8FAo5jGXTqNYLsPzfACskskWrlTLdG9i4vTJr3/jn5SKpXFmFseOHVu8OoTCoL/frF+/nplZ/M2/9dM/+tTO7fsTiaQ/P581wIaMmFEE2gdJAmsGA5CmiYbnYHZuDjOzs6hXGvCdAJZha8O0ZTaXU3fu3nv5a1/72q8KIRYajYb13iGMoaEhC4DevXt31XGa9Wx6AaWFslmu12AZVqKnp/XT0Wj0l5rNZurzv/3b5w8fPvz2aboAzYzzb/zxP1/+5PZfEJFo0MjnDCcI4JgSzsP7cFsYMMiGZoGACb4KUKxU8ODhAqEfKAiSbFqGajab1p3bt0eHh0d+LVPMjH/kIx+Rhw8fxtDQUBB+3MOgv688LFfMBw8eDBJtiX12zHx2yfIBNGp1xRqGKSwAFgICwBoEghCA63tIZ/OYS82jUqojaCrEjKhrWJY5n1vQYzdu/MrFc+98FsDChz/8YWuxeyjwwSNH7EOHD3kAWt4++/bf+uDzPzKQmk2hUqwKRVBSSHPDho1/h8h466tf/dIfHDp0SBCRYmY88vjGXSUr8rTo6kI5X+Q6EfumIG0SNBEEaSifIZgBIcGsUCqX8GB2CqlcGp7rwhK2ihg2E7F1efTSwo0b135zYuL21z//+c+bH//4x8NSTKH373n08fFxAjPWrH/E7urqs61IjP1AwTQsEBF8HcDVAVytoA0BN1CYX8hgZmYOpWINgQdE7HjTjkStdGqeL10c/Xev/9k3f3Nqair9+c9/3nw4DWYAeKqjgwjEW595prWts2unIoqn81mkCxmRL+eoXCti1coV0e7u9o89+eSTW48dO8af/OQn45pZfOjZg2taEq3LtZZo1F1omMTSgs+02JvMNMFyscGiRwrFRgXT6Vlkshk4ng8SIohELO0rV4yN37g0cf/O/3b+3fN/KIQIvvjFL3IY8tD7OuiDg4O8OGWRJmnTELBIsySAoEmBRQBIApkSPikslHKYmplBdqGAwAUMI+Lb8bg1n11wx8bGT7z2R1/95WY+nzp16pTx8ssvY2ho6Fv3uxs3btQA0N7WZmtpJJq+r2qBg8Bk4QslGl6DDQNeNGo+09PT8/jx48eDp556yiEiHYu0PWZro52bSiGANFjChAVJFqAlFBNYmggkUKgV8WBuCqlMCk2nCQmhkvGkch3HvHHzenn00sV/MTIy8iUSVH3hhRfskZGRcLoeev/fo2tmGhgYKFWrlVKz6QAgBBxACoI0TEhhIggUCoU85uamkc3l4LuKbTvChiFlOj3P169ff/2VV//kl4QQtz71qU8Zn/vc53h0dPQvBOhPxsYEACxks0Fvz4DneC5btsVgM2ClYEqTNSuhVBATAjbw54ddAi/YqgPdoQLlaM22oMXFQVMs7k7WvgILoOk0MZuaxezcDOrNBnSgOZGIac/x7Nt37pSuXr32b8+/fe4Pjx49apw/f16+8cYbbvjxDr2vR/ShoSE9Pj5Ow8PDcn5+/i2t/TOZzDyiMZOEYDAr0MNto5VSCTNTU1jIZOA3XdiWyaYUVC4WxOg775w8efLNX6Wgcf3DH/6wdfz48eDbR/L3NMbHCQBys7MVrYPrfhBASEmGEEoSsRCEIAiMcrkyPTubynz7v+3t62taiShcDigQgDYENBgcKBiaYQLwmk3Mp+aRmU+jWW+CFGBJqdhX5t3bt+s3x268dP7tc7/wsKwyhyEP/bBM3XloaEi9V/z/6vXr5bsTd2AYUgpiEGn2Aw+FYgGzMzOYT6XQrDdhCunbUnK1Usb5c2+Pjt248enCwsKFT3/608Z7C2/f8cICeB88csROpVKFQAe/c/f2La18HxHTtCzLNEzTMh48mEGxWP43mUzmDWb+1kyq2XQsIsHCMthjBcUM1gwKFAzFYDdAOp3G3OwsqqUy2A+0BAXJWJzv3r7jP7g/efzm2M1fBv7yWmyhMOjvd3JqcpKnH0wjn88jV8hhIbeA9HwKs9PTSM+n4bs+DCGCRDyuK5WyvDT67uzt2xOfnJiYeIeZ+eEFg/+SKYRKptMBQDz0+78/XSwW/vr1q1dO3JuYuDWXmrt89erlt2Zmpv92Ol35nUwmUz927Ni3Xvd0OlXLFQrkM0tFzJr4Yc03IGh6yC/kkJpLoVyuwPc8jliWjtgW3b5125ydmf6nZ0ZGfiuTydT37dv33sUjXHwL/XDdoz+kItG432g0cPPmLRSKhcWWQ0yo15pwmh7A0MlkIqjVq5E7d+9MjI+Pf+bmzeunmZm2bdtmfDf1xRen9EcFcIy/coL+dOnSpXNbt+5Y297e7l269K5z7dq1kwDw4osvmsPD0O9VNU5nFy6UKpU9IOqMxKKBJCGEArx6HYVcDrNzsygUi3AcB7FYzDdN05qensLd27d/9dVXX/1NAI2HzQyd8OMc+mELOgHAxo0bGUC0q7t7IBaNY3pqhuuNBsBYLPDIDGJi0zSDptOI3L17Z+b+/clfunbt2u/v27fPOHz4MP+XNRE4roHjdOTIEfull166MTs7e+O975w6dcr43Oc+xy+//LJ/6NAJyYuFGPnBg7lrvvInHdftYoZuui4jUFQs5JBKzSFXKqLhOiCDPGkY1vz8PI+P3/zSq6+++vPMTIcPH44ODQ2F+9dDP3xBP3TokACAn/qpn1KAsVkHelci2YogCFTEisnAC0ixhpCCLcNkgOW1a9e9B5MP/vmbb/7Z7xw6dOi/pic3v/TSS+7WrVvNXbt2CQC4e/cuDhw44H77Xf2xY2NERFysZK2p6Wlz6eQkXM+F6zjwPRflYgGVcgm+VlCCOZ5IBJn5BePGjZvf+MpXXvmbR48eFYcPHzYAhL3DQz+8U/ehoSEGgGXLlvaa0kwyiLUWLMgASQHlNRGJWL5hmWLi7oRRyOf/9r17d04cPXrKGB4+9l+9oDU6OhqMjo7+Z7//mc98RjMzOnqXthYLpcS9O7dRqdWImUnzYslmX3tgrXW8JenWa43Yg5mZLxUKmb8PLG4IevgEINy/HvrhXIwbGhrC0aNHQUQg0teFkBnLsigaiTlaa5eZvLbW9poU0pycnDRu3hr/5aGhL39pYmLCHR//nDkyMvK9CA//R19/8ZsPWxN3xqO7JHiJ22gG9WpVeq4L3w/g+j4UkZamzY26E71z69bb71x459+8+eab+Q996EOxhxeyMOShH96gA9DHjh3jL3/5y3J6enoyk8mcun9vosHstcXjViQeNy2tvMT9ibv+2LXrn3/tq1/9lwD8o0ePWkNDQw6+jyvXtm08Eo2YUSFEYBiGJCIQCKRJx4yYFlrIW9evz189f+GzNy9fPvfiiy/GXnvttbA0cyicugNgIsKhQ4cAgEZGTv9JvV5drZX3Y52dnSZrLRcWsuXbt26+8bU/+ZN/LIRwPvWpTxnj4+MK3+fHU1KKotaKGQytVKACJYWQOplIBsywpybvNceuXPrsxYsXv37ixAn9O2fOKHyP2xqH3v/k+/mXe9jPS9Rq5SwRn7l3795YrVZ75+bNm7du3779q8MjI7994sQJvnfvnvEHf/AHanx8/PsySm7cuFHcvHmTAWDlytXLu7o6t7a0tra4nuNDCBmLRX3TNO2Z2Rk1eunSq/Ozsz9fKBYbC7GY/ebLL4e73kL/xX4oSoAS0Xv3xPLhlwGg8fBemR5WQv1+juTi6NGjOHbsGA8MDCz74Ad/9DcGN278iXgiAQYQjccxOzeP8RtjX7x5/dInrl69Wvpv9HOGwhH9B2gez0wAxOnTp9+rsuIDi+fWDx8+/N/kKOfIyAiOHz+OWq1WTiRa02AuqyCozMxMmblc7n6hUHzp7v3bv3nxnXfmH/6cYchD4Yj+3fyuW7duNbZu3Ypisfjfy6MpejhScywW6z148OCqWq222vO84ttvv/1NAN6hQ4eswcHBIGwnHAr9ADt69KhgZvEfN1JgZtq376gRvkKhcER/H70PL774otHf308AgoGBAfnFL36Rw8IRodD786JL3+HvoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqH//vwH07STCZbed6MAAAAASUVORK5CYII=";

// --- Shared UI Components ---
function Logo({ size = 32 }) {
  return <img src={ARROW_IMG} alt="SHC" style={{ width: size, height: size, objectFit: "contain" }} />;
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
            <span onClick={() => remove(i)} style={{ cursor: "pointer", opacity: 0.6, fontSize: 14, lineHeight: 1 }}>x</span>
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
        Project Files <span style={{ fontWeight: 400, color: T.textDim }}>(up to 6 - screenshots, mockups, demos)</span>
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
                  <span style={{ fontSize: 24, marginBottom: 4 }}></span>
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
              onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}>x</button>
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
          <span style={{ fontSize: 24 }}></span>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.textMuted }}>
            {files.length === 0 ? "Upload screenshots, mockups, or files" : "Add more files"}
          </span>
          <span style={{ fontSize: 11, color: T.textDim }}>Click or drag - Images & docs - {6 - files.length} remaining</span>
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



// --- Featured Members for Landing ---
const ZACH_IMG = "data:image/png;base64,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";
const JAYDEN_IMG = "data:image/png;base64,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";
const NOAH_IMG = "data:image/png;base64,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";
const ANDY_IMG = "data:image/png;base64,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";

const FEATURED_MEMBERS = [
  { name: "Andy Robbins", project: "Co-Author of AI for Boomers & Co-Founder of Sparkli", photo: ANDY_IMG },
  { name: "Noah Kruthaupt", project: "Co-Author of AI for Boomers", photo: NOAH_IMG },
  { name: "Zach Carlo", project: "Founder of Personal Network CRM & Co-Founder of Sparkli", photo: ZACH_IMG },
  { name: "Jayden Huszczo", project: "CEO of Huszczo Marketing", photo: JAYDEN_IMG },
];

const LANDING_ACCENT = "#e76e6e";
const LANDING_BG_MID = "#3a1e1e";

function PlaceholderSilhouette() {
  return (
    <svg viewBox="0 0 120 160" fill="none" style={{ width: 120, height: 160, opacity: 0.3 }}>
      <circle cx="60" cy="45" r="28" fill="rgba(255,255,255,0.12)" />
      <ellipse cx="60" cy="140" rx="45" ry="40" fill="rgba(255,255,255,0.08)" />
    </svg>
  );
}

// --- Landing Page: Atmospheric Design ---
function LandingPage({ onSuccess }) {
  const [phase, setPhase] = useState("idle");
  const [code, setCode] = useState(["","","","","",""]);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [successRole, setSuccessRole] = useState(null);
  const [activeMember, setActiveMember] = useState(0);
  const [hoveredMember, setHoveredMember] = useState(null);
  const [ctaHovered, setCtaHovered] = useState(false);
  const inputsRef = useRef([]);
  const triedRef = useRef(false);
  const intervalRef = useRef(null);

  // Access code entry is only reachable at /#admin - everyone else goes straight in
  const adminMode = typeof window !== "undefined" && window.location.hash === "#admin";
  const launchNow = () => {
    setSuccessRole("member");
    setPhase("success");
    setTimeout(() => setPhase("launching"), 1000);
    setTimeout(() => onSuccess("member"), 2200);
  };
  const handleEnter = () => {
    if (phase !== "idle") return;
    if (adminMode) setPhase("entering");
    else launchNow();
  };

  const filled = code.filter(d => d).length;
  const isEntering = phase === "entering" || phase === "checking";
  const isSuccess = phase === "success" || phase === "launching";
  const isLaunching = phase === "launching";

  // Ready after mount
  useEffect(() => { setTimeout(() => setReady(true), 50); }, []);

  // Member gallery auto-rotation
  useEffect(() => {
    if (phase !== "idle") return;
    intervalRef.current = setInterval(() => {
      setActiveMember(prev => (prev + 1) % FEATURED_MEMBERS.length);
    }, 3500);
    return () => clearInterval(intervalRef.current);
  }, [phase]);

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
        setTimeout(() => setPhase("launching"), 1000);
        setTimeout(() => onSuccess(role), 2200);
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

  const selectMember = (idx) => {
    setActiveMember(idx);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveMember(prev => (prev + 1) % FEATURED_MEMBERS.length);
    }, 3500);
  };

  const lineColor = "rgba(255,255,255,0.15)";

  return (
    <div style={{
      position: "fixed", inset: 0,
      overflow: "hidden", userSelect: "none",
      fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      color: "#f0f0f0",
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* Atmospheric Background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: -1,
        background: `
          radial-gradient(circle at 80% 20%, ${LANDING_BG_MID} 0%, transparent 50%),
          radial-gradient(circle at 20% 80%, #210d0d 0%, transparent 40%),
          linear-gradient(to bottom, #1f1a1a 0%, #0b0a0a 100%)
        `,
      }} />

      {/* Noise Overlay */}
      <div style={{
        position: "fixed", inset: 0,
        pointerEvents: "none", zIndex: 9999, opacity: 0.07,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }} />

      {/* Header */}
      <header style={{
        position: "absolute", top: 0, width: "100%",
        padding: "2rem 3rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        zIndex: 10,
        borderBottom: `1px solid ${lineColor}`,
        opacity: isSuccess ? 0 : (ready ? 1 : 0),
        transition: isSuccess ? "opacity 0.4s ease" : "opacity 0.8s ease 0.2s",
      }}>
        <div style={{
          fontWeight: 500, fontSize: "1.5rem", letterSpacing: "-0.03em",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <Logo size={38} />
          <span>Side Hustle Club</span>
        </div>
      </header>

      {/* Hero Grid */}
      <main style={{
        display: "grid",
        gridTemplateColumns: window.innerWidth > 1024 ? "1.2fr 0.8fr" : "1fr",
        minHeight: "100vh", paddingTop: 80,
        maxWidth: 1440, margin: "0 auto", position: "relative",
        opacity: isSuccess ? 0 : 1,
        transform: isSuccess ? "scale(0.97)" : "scale(1)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}>
        {/* Left: Hero Content */}
        <div style={{
          padding: window.innerWidth > 1024 ? "4rem 0 4rem 3rem" : "6rem 2rem",
          display: "flex", flexDirection: "column", justifyContent: "center",
          borderRight: window.innerWidth > 1024 ? `1px solid ${lineColor}` : "none",
        }}>
          {/* Title */}
          <h1 style={{
            fontSize: "clamp(2.8rem, 5.5vw, 5.5rem)",
            fontWeight: 400,
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
            marginBottom: "3rem",
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s",
          }}>
            The Student<br />Entrepreneurs<br />Building Real<br />Projects.
          </h1>

          {/* CTA Area */}
          <div style={{
            marginTop: "1rem",
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s cubic-bezier(0.16,1,0.3,1) 0.6s",
          }}>
            {/* Get Started Button - idle phase */}
            {phase === "idle" && (
              <button
                onClick={handleEnter}
                onMouseEnter={() => setCtaHovered(true)}
                onMouseLeave={() => setCtaHovered(false)}
                style={{
                  display: "inline-block",
                  padding: "1.2rem 3rem",
                  border: "none",
                  color: "#fff",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  background: ctaHovered ? "#ff4a4a" : LANDING_ACCENT,
                  borderRadius: 4,
                  cursor: "pointer",
                  transform: ctaHovered ? "translateY(-2px)" : "translateY(0)",
                  boxShadow: ctaHovered ? `0 8px 24px rgba(231,110,110,0.35)` : "none",
                  transition: "all 0.3s ease",
                }}
              >
                Get Started
              </button>
            )}

            {/* Access Code Input - entering/success phase */}
            {(isEntering || (isSuccess && !isLaunching)) && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                animation: "heroFadeIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
              }}>
                <p style={{
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "#b0a0a0",
                  marginBottom: 16,
                  fontWeight: 400,
                }}>Enter Access Code</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {code.map((d, i) => (
                    <div key={i} style={{
                      position: "relative",
                      opacity: 0,
                      animation: `codeSlotIn 0.35s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.05}s forwards`,
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
                          width: 44, height: 56,
                          textAlign: "center",
                          fontSize: 22,
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 500,
                          background: isSuccess
                            ? "rgba(74, 222, 128, 0.08)"
                            : "rgba(255,255,255,0.03)",
                          border: `1.5px solid ${
                            isSuccess ? "#4ade80"
                            : error ? LANDING_ACCENT + "66"
                            : d ? LANDING_ACCENT
                            : "rgba(255,255,255,0.15)"
                          }`,
                          color: isSuccess ? "#4ade80" : "#f0f0f0",
                          borderRadius: 8,
                          transition: "all 0.3s ease",
                          caretColor: "transparent",
                          boxShadow: isSuccess
                            ? "0 4px 16px rgba(74,222,128,0.2)"
                            : d ? `0 0 12px rgba(231,110,110,0.15)` : "none",
                        }}
                      />
                      {/* Caret */}
                      {!d && phase === "entering" && i === filled && (
                        <div style={{
                          position: "absolute", bottom: 12, left: "50%",
                          width: 2, height: 20,
                          background: LANDING_ACCENT,
                          transform: "translateX(-50%)",
                          animation: "caretBlink 0.9s ease infinite",
                          borderRadius: 1,
                        }} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Error text */}
                {error && (
                  <p style={{
                    marginTop: 14,
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: LANDING_ACCENT,
                    animation: "fadeIn 0.15s ease",
                  }}>Wrong code - try again</p>
                )}

                {/* Hint */}
                {phase === "entering" && !error && filled === 0 && (
                  <p style={{
                    marginTop: 14,
                    fontSize: "0.75rem",
                    color: "#b0a0a0",
                    letterSpacing: "0.05em",
                    opacity: 0,
                    animation: "textReveal 0.4s ease 0.6s forwards",
                  }}>6-digit code required - press Esc to cancel</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Member Gallery (desktop only) */}
        {window.innerWidth > 1024 && (
          <div style={{
            position: "relative",
            display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "center",
            padding: "4rem 3rem",
            overflow: "hidden",
            opacity: ready ? 1 : 0,
            transition: "opacity 1s ease 0.5s",
          }}>
            {/* Vertical decorative line */}
            <div style={{
              position: "absolute", right: "20%", top: 0,
              width: 1, height: "100%",
              background: lineColor,
            }} />

            {/* Member Cards */}
            <div style={{
              position: "relative", zIndex: 2,
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
              onMouseEnter={() => clearInterval(intervalRef.current)}
              onMouseLeave={() => {
                if (phase === "idle") {
                  intervalRef.current = setInterval(() => {
                    setActiveMember(prev => (prev + 1) % FEATURED_MEMBERS.length);
                  }, 3500);
                }
              }}
            >
              {FEATURED_MEMBERS.map((member, idx) => {
                const isActive = idx === activeMember;
                const isHov = idx === hoveredMember;
                return (
                  <div key={idx} style={{
                    position: "absolute",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? "scale(1) translateY(0)" : "scale(0.9) translateY(20px)",
                    transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)",
                    pointerEvents: isActive ? "auto" : "none",
                    cursor: "pointer",
                  }}
                    onMouseEnter={() => setHoveredMember(idx)}
                    onMouseLeave={() => setHoveredMember(null)}
                  >
                    {/* Photo container */}
                    <div style={{
                      width: 220, height: 290,
                      border: `1px solid ${isHov ? LANDING_ACCENT : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
                      filter: isHov ? "grayscale(0%) brightness(1)" : "grayscale(100%) brightness(0.35)",
                      transform: isHov ? "scale(1.05)" : "scale(1)",
                      boxShadow: isHov
                        ? `0 16px 48px rgba(231,110,110,0.25), 0 0 80px rgba(231,110,110,0.08)`
                        : "none",
                      position: "relative",
                    }}>
                      {member.photo ? (
                        <img src={member.photo} alt={member.name} style={{
                          width: "100%", height: "100%",
                          objectFit: "cover", objectPosition: "center top",
                        }} />
                      ) : (
                        <PlaceholderSilhouette />
                      )}
                      {/* Dark vignette overlay */}
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.6) 100%)",
                        opacity: isHov ? 0 : 1,
                        transition: "opacity 0.5s ease",
                      }} />
                    </div>

                    {/* Member info (shows on hover) */}
                    <div style={{
                      textAlign: "center", marginTop: "1.5rem",
                      opacity: isHov ? 1 : 0,
                      transform: isHov ? "translateY(0)" : "translateY(10px)",
                      transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
                      maxWidth: 260,
                    }}>
                      <h3 style={{
                        fontSize: "1.1rem", fontWeight: 500, letterSpacing: "-0.01em",
                        marginBottom: "0.4rem", color: "#f0f0f0",
                      }}>{member.name}</h3>
                      <p style={{
                        fontSize: "0.8rem", textTransform: "uppercase",
                        letterSpacing: "0.12em", color: LANDING_ACCENT, lineHeight: 1.5,
                      }}>{member.project}</p>
                    </div>
                  </div>
                );
              })}

              {/* Gallery Dots */}
              <div style={{
                position: "absolute", bottom: "2rem",
                left: "50%", transform: "translateX(-50%)",
                display: "flex", gap: 10,
              }}>
                {FEATURED_MEMBERS.map((_, idx) => (
                  <span
                    key={idx}
                    onClick={() => selectMember(idx)}
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: idx === activeMember ? LANDING_ACCENT : "rgba(255,255,255,0.2)",
                      transform: idx === activeMember ? "scale(1.3)" : "scale(1)",
                      transition: "all 0.3s ease",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===== Arrow Fly-In on Success ===== */}
      {isSuccess && (
        <>
          {/* White flash on code success */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 90,
            background: "white",
            animation: "flashWhite 0.4s ease-out forwards",
            pointerEvents: "none",
          }} />

          {/* Arrow flying in, then launching off */}
          <div style={{
            position: "fixed",
            top: "50%", left: "50%",
            zIndex: 95,
            width: "clamp(200px, 40vmin, 400px)",
            height: "clamp(200px, 40vmin, 400px)",
            animation: isLaunching
              ? "arrowLaunchOff 0.9s cubic-bezier(0.4, 0, 0.2, 1) forwards"
              : "arrowFlyIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            pointerEvents: "none",
          }}>
            <div style={{
              width: "100%", height: "100%",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: isLaunching ? "none" : "arrowGlow 0.8s ease forwards",
            }}>
              <Logo size={180} />
            </div>
          </div>

          {/* Radial glow behind arrow */}
          <div style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "60vmin", height: "60vmin",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${LANDING_ACCENT}40 0%, transparent 60%)`,
            filter: "blur(40px)",
            opacity: isLaunching ? 0 : 1,
            transition: "opacity 0.5s ease",
            zIndex: 89,
            pointerEvents: "none",
          }} />
        </>
      )}

      {/* Screen transition wipe */}
      {isLaunching && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: T.bg,
          animation: "screenWipe 1.4s ease forwards",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}

// --- Sidebar ---
const NAV_ITEMS = [
  { id:"dashboard", label:"Home", icon:"" },
  { id:"members", label:"Members", icon:"" },
  { id:"resources", label:"Resources", icon:"" },
  { id:"myprofile", label:"My Profile", icon:"" },
];
const ADMIN_NAV = [{ id:"admin", label:"Admin Panel", icon:"" }];

function Sidebar({ active, onNav, role, onLogout, profileName, hasProfile }) {
  const base = hasProfile ? NAV_ITEMS : NAV_ITEMS.filter(i => i.id !== "myprofile");
  const items = role === "admin" ? [...base, ...ADMIN_NAV] : base;
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
              {/* Active indicator - bottom line */}
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

      {/* Right side - user + exit */}
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
                   Visit Project
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
                          <span style={{ fontSize:20 }}></span>
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
        onMouseLeave={e => { e.currentTarget.style.background=T.bgHover; e.currentTarget.style.color=T.textMuted; }}>x</button>

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
                 }}> Visit</button>
                )}
              </div>
              {profile.projectFiles?.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(100px, 1fr))", gap:8, marginTop:12 }}>
                  {profile.projectFiles.map((f,i) => (
                    <div key={i} style={{ borderRadius:8, overflow:"hidden", border:`1px solid ${T.border}` }}>
                      {f.type==="image" ? <div style={{ width:"100%", height:80, background:`url(${f.data}) center/cover` }} />
                        : <div style={{ width:"100%", height:80, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:T.bg }}><span style={{ fontSize:18 }}></span><span style={{ fontSize:9, color:T.red, fontWeight:700 }}>{f.fileType}</span></div>}
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
        <span style={{ color:T.textDim, fontSize:16 }}></span>
        <input value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{ flex:1, background:"none", border:"none", color:T.text, fontSize:14, fontFamily:"Inter", outline:"none" }} />
        {value && <span onClick={() => onChange("")} style={{ color:T.textDim, cursor:"pointer", fontSize:14 }}>x</span>}
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
// --- Informational content (from sites.miamioh.edu/side-hustle) ---
const CLUB_PILLARS = [
  {
    title: "Build Real Projects",
    text: "Join a community of students who are building and operating 40+ companies, gaining hands-on experience while turning ideas into real ventures and real money.",
  },
  {
    title: "Learn Practical Skills",
    text: "Learn directly from top-tier speakers, practice your skills in workshops, launch your own side hustle, and leverage our elite mentor network to scale your company.",
  },
  {
    title: "Get Involved",
    text: "Whether you're seeking your next business opportunity, expanding your professional network, or learning the skills to build and scale a company, the Side Hustle Club is the premier entrepreneurship group at Miami University - opening doors to opportunities you didn't know were possible.",
  },
];

const MEMBER_OUTCOMES = [
  {
    project: "AI for Boomers",
    founders: "Noah Kruthaupt & Andy Robbins",
    photos: [NOAH_IMG, ANDY_IMG],
    text: "A book teaching the older generations the basics of AI as a tool - giving them independence, protecting them from scams, and making their lives simpler. Now published on Amazon and trending toward a Best Seller title.",
  },
  {
    project: "Sparkli",
    founders: "Zach Carlo & Andy Robbins",
    photos: [ZACH_IMG, ANDY_IMG],
    text: "An app providing an extensive collection of dates on a user-friendly, searchable database that's tailor-made to suit user preferences and circumstances, all at no cost.",
  },
  {
    project: "My Future Self",
    founders: "Giancarlo Sarti & Kaya Hickin",
    photos: [],
    text: "An app built for life transformation, grounded in neuroscience and psychology, helping users develop and execute on personal goals to be the best version of themselves.",
  },
  {
    project: "Peace Pizza",
    founders: "Max Rohs",
    photos: [],
    text: "A student-run pizza truck that works to serve high quality food to events of any size.",
  },
];

function DashboardPage({ role, onNav }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [featuredIdx, setFeaturedIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const pr = await db.getProfiles();
      setProfiles(pr);
      setLoaded(true);
    })();
  }, []);

  const projectMembers = profiles.filter(p => p.role==="member" && p.projectName);

  useEffect(() => {
    if (projectMembers.length <= 1) return;
    const interval = setInterval(() => setFeaturedIdx(i => (i + 1) % projectMembers.length), 8000);
    return () => clearInterval(interval);
  }, [projectMembers.length]);

  if (!loaded) return (
    <PageShell title="Home" subtitle="Loading...">
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

      {/* Hero - club identity left, stats right */}
      <div style={{ position:"relative", marginBottom:56 }}>
        {/* Warm glow behind hero */}
        <div style={{
          position:"absolute", top:-80, left:-120, width:420, height:420, borderRadius:"50%",
          background:`radial-gradient(circle, ${LANDING_ACCENT}14 0%, transparent 65%)`,
          filter:"blur(40px)", pointerEvents:"none",
        }} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:40, position:"relative" }}>
          <div>
            <p style={{ fontSize:12, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:LANDING_ACCENT, marginBottom:14 }}>
              Side Hustle Club
            </p>
            <h1 style={{
              fontFamily:"DM Serif Display, serif", fontSize:"clamp(32px, 4vw, 48px)", fontWeight:400,
              letterSpacing:"-0.025em", lineHeight:1.15, color:T.text,
            }}>
              Miami University's Student Builder Community
            </h1>
            <p style={{ fontSize:15, color:T.textMuted, marginTop:14, lineHeight:1.7, maxWidth:480 }}>
              We help students turn ideas into execution through real projects and real business.
              Come for the skills, stay for the people.
            </p>
          </div>
          <div style={{ display:"flex", gap:36, flexShrink:0, paddingTop:8 }}>
            {[
              { label:"Student Entrepreneurs", val:"100+" },
              { label:"Companies", val:"40+" },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign:"right", animation:`fadeUp 0.4s ease ${i * 0.06}s both` }}>
                <p style={{ fontFamily:"DM Serif Display, serif", fontSize:28, fontWeight:400, letterSpacing:"-0.02em", color:T.text, lineHeight:1 }}>{s.val}</p>
                <p style={{ fontSize:10, color:T.textDim, marginTop:5, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height:1, background:T.border, marginBottom:48 }} />

      {/* What We Do */}
      <div style={{ marginBottom:48, animation:"fadeUp 0.4s ease 0.1s both" }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim, marginBottom:24 }}>
          What We Do
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(230px, 1fr))", gap:28 }}>
          {CLUB_PILLARS.map((pl, i) => (
            <div key={pl.title} style={{ animation:`fadeUp 0.4s ease ${0.1 + i * 0.06}s both` }}>
              <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:19, fontWeight:400, marginBottom:8, letterSpacing:"-0.01em" }}>{pl.title}</h3>
              <p style={{ fontSize:13, color:T.textMuted, lineHeight:1.7 }}>{pl.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height:1, background:T.border, marginBottom:48 }} />

      {/* Faces of the Club */}
      <div style={{ marginBottom:48, animation:"fadeUp 0.4s ease 0.12s both" }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim, marginBottom:8 }}>
          The People
        </p>
        <p style={{ fontSize:13, color:T.textDim, marginBottom:24, lineHeight:1.6 }}>
          Real students, building real things. This could be you.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:16 }}>
          {FEATURED_MEMBERS.map((m, i) => (
            <div key={m.name} style={{ animation:`fadeUp 0.4s ease ${0.12 + i * 0.06}s both` }}>
              <div style={{
                width:"100%", aspectRatio:"3/4", borderRadius:14, overflow:"hidden",
                border:`1px solid ${T.border}`, position:"relative",
                transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = LANDING_ACCENT + "66";
                e.currentTarget.style.boxShadow = `0 12px 36px ${LANDING_ACCENT}22`;
                const img = e.currentTarget.querySelector("img");
                if (img) img.style.filter = "grayscale(0%)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = T.border;
                e.currentTarget.style.boxShadow = "none";
                const img = e.currentTarget.querySelector("img");
                if (img) img.style.filter = "grayscale(40%)";
              }}>
                <img src={m.photo} alt={m.name} style={{
                  width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top",
                  filter:"grayscale(40%)", transition:"filter 0.4s ease", display:"block",
                }} />
              </div>
              <p style={{ fontSize:13, fontWeight:600, marginTop:10 }}>{m.name}</p>
              <p style={{ fontSize:11, color:LANDING_ACCENT, marginTop:2, lineHeight:1.5 }}>{m.project}</p>
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
              {featured.projectStatus && <span style={{ fontStyle:"italic" }}>{" - "}{featured.projectStatus}</span>}
            </p>
            {featured.projectDesc && (
              <p style={{ fontSize:14, color:T.textMuted, lineHeight:1.7, maxWidth:560 }}>{featured.projectDesc}</p>
            )}
            {featured.skills?.length > 0 && (
              <p style={{ fontSize:12, color:T.textDim, marginTop:12 }}>
                {featured.skills.slice(0,5).join(" - ")}
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

      {/* Member Success */}
      <div style={{ marginBottom:48, animation:"fadeUp 0.4s ease 0.15s both" }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textDim, marginBottom:24 }}>
          Member Success
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:28 }}>
          {MEMBER_OUTCOMES.map((o, i) => (
            <div key={o.project} style={{
              padding:24, borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`,
              animation:`fadeUp 0.4s ease ${0.15 + i * 0.05}s both`,
              transition:"all 0.3s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = LANDING_ACCENT + "44"; e.currentTarget.style.boxShadow = `0 8px 28px ${LANDING_ACCENT}12`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                <h3 style={{ fontFamily:"DM Serif Display, serif", fontSize:20, fontWeight:400, letterSpacing:"-0.01em" }}>{o.project}</h3>
                {o.photos.length > 0 && (
                  <div style={{ display:"flex", flexShrink:0 }}>
                    {o.photos.map((ph, pi) => (
                      <img key={pi} src={ph} alt="" style={{
                        width:34, height:34, borderRadius:"50%", objectFit:"cover", objectPosition:"center top",
                        border:`2px solid ${T.bgCard}`, marginLeft: pi > 0 ? -10 : 0,
                      }} />
                    ))}
                  </div>
                )}
              </div>
              <p style={{ fontSize:12, color:T.textDim, marginTop:4, marginBottom:10 }}>by <span style={{ fontWeight:600, color:T.textMuted }}>{o.founders}</span></p>
              <p style={{ fontSize:13, color:T.textMuted, lineHeight:1.7 }}>{o.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Warm sign-off */}
      <div style={{ textAlign:"center", padding:"24px 0 40px", animation:"fadeUp 0.4s ease 0.25s both" }}>
        <p style={{ fontFamily:"DM Serif Display, serif", fontSize:22, fontWeight:400, fontStyle:"italic", color:T.textMuted, letterSpacing:"-0.01em" }}>
          Come build something with us.
        </p>
        <p style={{ fontSize:12, color:T.textDim, marginTop:8 }}>
          Bring an idea, or just bring curiosity - everyone starts somewhere.
        </p>
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
          {activeFilters.length > 0 && ` - ${activeFilters.length} filter${activeFilters.length>1?"s":""} active`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding:40, borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, textAlign:"center" }}>
          <p style={{ fontSize:28, marginBottom:8 }}>{filterRole==="member"?"":""}</p>
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
// --- Resources Page ---
function ResourcesPage() {
  const [activeTab, setActiveTab] = useState("skills");

  const tabs = [
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

      {activeTab === "skills" && <SkillsToLearn />}
      {activeTab === "pitchdeck" && <PitchDeckResources />}
      {activeTab === "toolkit" && <FounderToolkit />}
    </PageShell>
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
      id: "vibe-code-mvp",
      title: "Vibe Code Your MVP",
      time: "One weekend",
      why: "You no longer need to be a developer to ship real software. Describe what you want in plain English and AI tools like Claude Code, Cursor, Bolt, and Lovable write the code. The founders shipping fastest right now aren't the best programmers - they're the best at describing what they want and iterating quickly. This is the single highest-leverage skill a student founder can learn in 2026.",
      steps: [
        {
          title: "Define one core action",
          detail: "Your MVP does ONE thing. Write it as a sentence: 'A user can [action] so that [result].' Everything else - settings, profiles, dashboards - is version 2. If your MVP has more than 3 screens, you're overbuilding."
        },
        {
          title: "Pick your AI builder",
          detail: "Lovable and Bolt.new go from a prompt to a deployed full-stack app in the browser - best if you never want to see code. Cursor and Claude Code give you a real codebase with AI doing the work - best if you want control and plan to keep building. v0 is great for UI-heavy projects. Pick one, don't tool-hop."
        },
        {
          title: "Write your prompt like a product spec",
          detail: "'Build me a task app' gives you garbage. Instead write 2-3 paragraphs: exactly what the user sees, what they can do, and what happens when they do it. Name the stack if you have a preference (Next.js + Supabase is a solid default). Treat the AI like a contractor who needs a clear brief - specificity is your superpower."
        },
        {
          title: "Build in small loops",
          detail: "Skeleton first - layout and navigation. Then one feature at a time. Test each piece, and when something breaks, paste the error straight back in: the AI will usually spot it immediately. Each loop should take 5-15 minutes. This rhythm - prompt, review, adjust - is the whole game."
        },
        {
          title: "Add auth and a database",
          detail: "Supabase gives you a Postgres database, auth, and an API for free, and every AI tool knows it well. One or two tables and a sign-in flow is enough - users can do the core action and their data persists. That's a real app."
        },
        {
          title: "Deploy and get it in front of 10 people",
          detail: "Deploy to Vercel or use your builder's one-click hosting. Send the link to 10 people who match your target user and watch them use it. Where they get confused is your roadmap. Real usage beats any amount of planning."
        },
      ],
      resources: [
        { label: "Claude Code - agentic coding from the terminal", url: "https://claude.com/claude-code" },
        { label: "Cursor - AI-first code editor", url: "https://cursor.com" },
        { label: "Lovable - prompt to full-stack app", url: "https://lovable.dev" },
        { label: "Bolt.new - prompt to deployed app", url: "https://bolt.new" },
        { label: "v0 by Vercel - AI UI generation", url: "https://v0.dev" },
      ],
    },
    {
      id: "landing-page",
      title: "Launch a Landing Page in an Afternoon",
      time: "2-3 hours",
      why: "A landing page is the fastest way to make your idea real. It forces you to articulate your value in one sentence, gives you a URL to share, and starts collecting interest before you build the product. In 2026 there is zero excuse for not having one - AI page builders get you live in minutes, so all your time goes into the message, not the code.",
      steps: [
        {
          title: "Write your one-liner",
          detail: "One sentence: what you're building and who it's for. This becomes your headline. If you can't say it in one sentence, the idea isn't clear enough yet. Example: 'Automated invoicing for freelancers who hate chasing payments.'"
        },
        {
          title: "Generate the page with AI",
          detail: "Paste your one-liner plus a short description into v0, Lovable, or Framer AI and let it generate the page. Ask for: a hero with your headline, a 2-sentence subheadline, one call-to-action, and a simple email capture. Iterate on the copy and layout in conversation until it feels right."
        },
        {
          title: "Keep the hero brutal-simple",
          detail: "Headline, subheadline, one button. No nav bar, no feature grid, no stock photos. A visitor should understand what you do in under 5 seconds. White space signals confidence."
        },
        {
          title: "Wire up a waitlist",
          detail: "Tally or Formspree gives you a free form backend in 2 minutes. Every email you collect is a signal your idea resonates - this is your first metric. Pipe signups to a Google Sheet so you can message them later."
        },
        {
          title: "Add one piece of proof",
          detail: "A short testimonial (even from a friend who tested it), a counter ('47 people on the waitlist'), or a launch date. Social proof converts visitors at 2-3x the rate of a bare page."
        },
        {
          title: "Ship it and share it",
          detail: "Deploy on Vercel or Framer's hosting - live URL with HTTPS in 60 seconds. Then share it everywhere: group chats, class Slack, Reddit, LinkedIn. The point isn't perfection, it's real feedback from real people."
        },
      ],
      resources: [
        { label: "v0 by Vercel - generate the page from a prompt", url: "https://v0.dev" },
        { label: "Framer - AI site builder with hosting", url: "https://framer.com" },
        { label: "Tally - free forms for the waitlist", url: "https://tally.so" },
        { label: "Vercel - free hosting, deploy from GitHub", url: "https://vercel.com" },
      ],
    },
    {
      id: "customer-interviews",
      title: "Talk to Real Customers",
      time: "1 week",
      why: "Most startups fail because they build something nobody wants. Five good conversations will teach you more than any amount of market research - and more than any AI can tell you, because your specific customers' pain isn't in the training data. This is still the most underrated skill in the room.",
      steps: [
        {
          title: "Write down your riskiest assumption",
          detail: "Every idea has a core bet. 'Freelancers hate invoicing enough to pay $20/month for a tool.' That's your riskiest assumption, and your interviews should attack it directly. If it's wrong, the whole idea falls apart - so test it first, not the easy stuff."
        },
        {
          title: "Find 5 people who have the problem",
          detail: "Not friends being nice - people who actually live the problem. Post in relevant Reddit communities, Discord servers, or LinkedIn: 'I'm researching how [target group] handles [problem]. Open to a 20-minute call? Happy to send a $10 coffee card as thanks.' More people say yes than you'd expect."
        },
        {
          title: "Ask about behavior, not opinions",
          detail: "The golden rule: past, not future. 'Walk me through the last time you dealt with [problem]' beats 'Would you use an app that...' every time. People are terrible at predicting their own behavior but accurate about what they've actually done and what frustrated them."
        },
        {
          title: "Go deeper with follow-ups",
          detail: "When someone says something interesting, don't move on. 'Why was that frustrating?' 'What did you do next?' 'How much time did that take?' The best insights come from the third or fourth follow-up. Silence is a tool too - pause and let them fill it."
        },
        {
          title: "Record and transcribe",
          detail: "With permission, record the call and run it through an AI transcript (Granola, Otter, or just upload to Claude). Then pull exact quotes - 'I spend 3 hours every Friday chasing late invoices' is data; 'they seem frustrated' is opinion. Exact quotes become your marketing copy and pitch deck stats."
        },
        {
          title: "Find the pattern across all 5",
          detail: "Lay out your quotes and look for repeats. If 4 of 5 people describe the same frustration in similar words, you've found a real problem. If everyone names a different pain, your target is too broad. If nobody's that bothered, the problem may not be painful enough to pay for."
        },
      ],
      resources: [
        { label: "The Mom Test - the essential book on customer interviews", url: "https://www.momtestbook.com" },
        { label: "YC: How to talk to users", url: "https://www.youtube.com/watch?v=MT4Ig2uqjTc" },
        { label: "Granola - AI meeting notes", url: "https://granola.ai" },
      ],
    },
    {
      id: "ai-agents",
      title: "Automate Your Business with AI Agents",
      time: "A few evenings",
      why: "The newest founder superpower: AI agents that do repetitive work for you while you sleep. Lead follow-ups, content repurposing, customer support triage, research - a solo student founder with a few good automations operates like a team of five. Learning to build them takes an evening, not a semester.",
      steps: [
        {
          title: "List your repetitive tasks",
          detail: "Spend a week noticing everything you do more than twice: answering the same DMs, copying data between tools, posting the same content to three platforms, chasing people for responses. Each one is an automation candidate. Rank by minutes-per-week wasted."
        },
        {
          title: "Start with one no-code automation",
          detail: "Zapier or Make connects your tools with triggers and actions - 'when someone fills my Tally form, add them to a sheet and send a welcome email.' Build your first one in 20 minutes. This teaches you the trigger-action mental model everything else builds on."
        },
        {
          title: "Level up to n8n for real agents",
          detail: "n8n is the step beyond Zapier: visual workflows with actual AI steps in the middle. 'New signup, then AI writes a personalized welcome referencing their answers, sends it, and logs to the CRM.' Self-hostable and free to start. This is where automation becomes an agent."
        },
        {
          title: "Give an AI a recurring job",
          detail: "Use Claude or ChatGPT with a standing prompt for weekly work: summarize your community's activity, draft your newsletter from bullet points, turn one long post into five short ones. Save the prompt that works and reuse it - same input format, same output format, every week."
        },
        {
          title: "Automate your inbox and scheduling",
          detail: "Connect your email and calendar to an AI assistant layer (many tools do this now - even Zapier has agents). Auto-draft replies to common questions, auto-schedule intro calls. You approve; it does the typing."
        },
        {
          title: "Measure the hours you got back",
          detail: "Keep a running list: automation, minutes saved per week. When one saves you an hour a week, tell people about it - 'how I automated X' content performs absurdly well and feeds your build-in-public pipeline."
        },
      ],
      resources: [
        { label: "n8n - visual AI workflow automation", url: "https://n8n.io" },
        { label: "Zapier - connect your apps, no code", url: "https://zapier.com" },
        { label: "Make - visual automation platform", url: "https://make.com" },
        { label: "Claude - your always-on operations intern", url: "https://claude.ai" },
      ],
    },
    {
      id: "build-in-public",
      title: "Build in Public",
      time: "30 min/day, ongoing",
      why: "Your journey is content. Documenting what you're building - the wins, the flops, the numbers - compounds into an audience that becomes your waitlist, your first customers, and your network. Students have an unfair advantage here: people love rooting for a college kid building something real.",
      steps: [
        {
          title: "Pick one platform and commit",
          detail: "LinkedIn if your customers are professionals, X if they're tech/startup people, TikTok or Reels if they're consumers. One platform done daily beats three done badly. You can cross-post later once one is working."
        },
        {
          title: "Document, don't create",
          detail: "You don't need content ideas - you need to narrate what you already did today. 'Shipped the waitlist page, here's the before/after.' 'First customer call today, here's what surprised me.' 'Revenue this month: $47. Here's the breakdown.' Screenshots and specifics beat polish."
        },
        {
          title: "Share real numbers",
          detail: "Numbers are the cheat code: signups, revenue, users, even failures ('spent $50 on ads, got 0 customers, here's why'). Specificity builds trust and makes posts shareable. The posts that feel scariest to publish perform best."
        },
        {
          title: "Post consistently for 30 days",
          detail: "One post a day for a month, no skipping. The first 10 will feel like shouting into the void - that's normal. The algorithm and the audience both reward consistency. Batch-write on Sunday if daily feels heavy; Typefully or Buffer schedules them."
        },
        {
          title: "Engage 15 minutes a day",
          detail: "Reply to every comment, and leave thoughtful comments on 5 bigger accounts in your niche daily. Comments are how small accounts get discovered. Genuine beats clever."
        },
        {
          title: "Funnel attention somewhere you own",
          detail: "Put your landing page link in your bio and end posts with a soft ask ('waitlist in bio'). Followers you can't reach are vanity; an email list is an asset. Even 100 emails of people who care is a launch audience."
        },
      ],
      resources: [
        { label: "Typefully - write and schedule posts", url: "https://typefully.com" },
        { label: "Buffer - schedule across platforms", url: "https://buffer.com" },
        { label: "CapCut - fast short-form video editing", url: "https://capcut.com" },
      ],
    },
    {
      id: "first-100",
      title: "Get Your First 100 Users",
      time: "2-4 weeks",
      why: "The gap between 0 and 100 users is where most projects die - and it's crossed with unscalable, slightly uncomfortable manual work, not ads or virality. 100 real users means real feedback, real retention data, and a real story for your pitch deck. Here's the playbook.",
      steps: [
        {
          title: "Write down exactly who user #1 is",
          detail: "Not 'students' - 'sophomores who sell clothes on Depop and hate doing their own product photos.' The tighter the definition, the more obvious it becomes where they hang out and what to say to them."
        },
        {
          title: "Go where they already are",
          detail: "List 5 places your exact user congregates: subreddits, Discord servers, campus clubs, GroupMe chats, niche Facebook groups. Join, contribute genuinely for a week, then share what you built as 'I made this thing for people like us' - not as an ad."
        },
        {
          title: "Do 25 direct outreaches",
          detail: "DM 25 people who visibly have the problem (they posted about it, they're in the community). Personal, short, no pitch: 'Saw your post about X - I built something that might help. Want a free account in exchange for brutal feedback?' Expect a 20-40% response when it's genuinely relevant."
        },
        {
          title: "Launch somewhere small first",
          detail: "Before Product Hunt, launch to your campus: club Slacks, class group chats, a poster with a QR code, a table in the student center. A campus is a dense, reachable market of early adopters. Then do Product Hunt once you've fixed what the first 30 users complained about."
        },
        {
          title: "Onboard the first 30 personally",
          detail: "Text or call every single early user. Walk them through it. Watch them use it on a screen share. This feels absurdly unscalable - that's the point. You're buying the insights that make the product good enough to grow on its own."
        },
        {
          title: "Track retention, not just signups",
          detail: "Set up PostHog (free) and watch one number: how many users come back in week 2. 100 signups with 5 returning is a leaky bucket - fix the product before pouring more in. 40%+ returning means it's time to scale what's working."
        },
      ],
      resources: [
        { label: "YC: How to get your first customers", url: "https://www.youtube.com/watch?v=hyYCn_kAngI" },
        { label: "PostHog - free product analytics", url: "https://posthog.com" },
        { label: "Product Hunt - launch platform", url: "https://producthunt.com" },
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
                              {isDone && "x"}
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
      purpose: "First impression - you get 3 seconds",
      tips: [
        "Your cover should do one thing: make someone lean in. Company name, a one-line description of what you do, and nothing else. No mission statements, no team photos, no 'Founded in 2025.' The one-liner should be concrete enough that someone who reads it knows exactly what category you're in.",
        "White space is a design choice, not wasted space. The more cluttered your cover, the less confident you look. Investors see 20+ decks a week - the ones that stand out are the ones that breathe.",
        "If you have a compelling stat, lead with it above your company name. '40% of freelancer invoices are paid late' immediately creates tension and curiosity.",
      ],
      mistakes: [
        "Putting your tagline, mission, vision, AND description all on one slide. Pick one sentence.",
        "Using a busy background image. A dark or white solid background with clean type signals competence.",
        "Including contact info on the cover. That goes on the last slide.",
      ],
      example: "Acme - Invoicing that gets freelancers paid 2x faster. That's the entire slide. Logo top-left, one-liner centered, nothing else. Maybe a stat above it: '$48B in freelancer invoices are paid late every year.'",
    },
    {
      id: "problem",
      title: "The Problem",
      purpose: "Make the audience feel the pain before you offer the cure",
      tips: [
        "The strongest problem slides use a real quote from a real person. 'I spent 6 hours last month chasing a $2,000 invoice' hits harder than 'Freelancers struggle with late payments.' Pull directly from your customer interviews.",
        "Quantify the pain. Time wasted, money lost, frequency of the problem. 'The average freelancer spends 8 hours per month on invoicing admin' gives the audience a concrete grasp of severity.",
        "One problem, explored deeply. Resist the temptation to list 5 problems. If you have to list multiple, your focus is too broad. Investors want to fund solutions to one specific, well-understood pain - not a vague bundle of annoyances.",
      ],
      mistakes: [
        "Describing the problem abstractly. 'Communication is broken' means nothing. 'Remote teams lose 5 hours per week to context-switching between 7 different messaging tools' means something.",
        "Making the problem about you. 'We noticed that...' puts you at the center. Put the customer at the center. 'Freelancers report that...'",
        "Listing problems as bullet points with no narrative. Tell a story. Walk through a day in your customer's life where this problem ruins something.",
      ],
      example: "'Last Tuesday, I invoiced a client for $3,200. By Friday, nothing. I sent a follow-up. Then another. Two weeks later I got paid - minus a 'late processing fee' they made up. This happens every month.' - Sarah M., UX Designer. 63% of freelancers report being paid late on at least one invoice per quarter.",
    },
    {
      id: "solution",
      title: "Your Solution",
      purpose: "Show what you built, and connect it directly to the pain",
      tips: [
        "Lead with the outcome, not the feature list. 'Freelancers get paid in 3 days instead of 30' is better than 'We built an automated invoicing platform with smart follow-ups and payment tracking.' The outcome makes someone care; the features explain how after they already care.",
        "Show a screenshot or short demo. A real product screenshot signals that this thing actually exists. If you're pre-product, show a mockup - but make it look real. Never describe software in words alone when you could just show it.",
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
        "Every good startup is riding a wave. Something changed recently - a new technology, a regulatory shift, a cultural behavior change, a market dislocation - that makes your solution possible or necessary in a way it wasn't three years ago. Identify that change and make it the centerpiece of this slide.",
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
        "Never say you have no competition. If you say 'there are no competitors,' an investor hears one of two things: you haven't looked, or the market doesn't exist. There is always competition - even if it's spreadsheets, manual processes, or doing nothing. Acknowledge the landscape honestly and explain where you fit.",
        "The best competition slides show a 2x2 matrix or a simple positioning chart with two axes that matter to your customer. Pick axes where you naturally win. If your advantage is simplicity, use 'simple vs. complex' as one axis. If it's price, use 'affordable vs. enterprise.' Place competitors on the chart and show the gap you fill.",
        "Focus on your unfair advantage, not on trashing competitors. 'FreshBooks is built for accountants; we're built for solo freelancers who don't know accounting' is a positioning statement. 'FreshBooks sucks' is not. Respect for competitors signals maturity.",
      ],
      mistakes: [
        "The feature checklist with all green checkmarks for you and all red X's for everyone else. Every investor has seen this, and nobody believes it. If you're better at literally everything, something is wrong with your analysis.",
        "Listing 15 competitors. If your market has that many relevant players, you haven't segmented tightly enough. Pick the 3-5 that your target customer is most likely to compare you against.",
        "Ignoring indirect competition. Your biggest competitor might not be another software tool - it might be a spreadsheet, a VA, or the customer just not solving the problem at all. 'Do nothing' is often the hardest competitor to beat.",
      ],
      example: "A 2x2 matrix. X-axis: Built for accountants vs. Built for freelancers. Y-axis: Manual setup vs. Fully automated. FreshBooks sits in 'accountants + manual.' Wave sits in 'accountants + automated.' Acme sits alone in 'freelancers + fully automated' - the underserved quadrant. Below: 'No tool today serves non-technical freelancers with zero-setup automation. That's our gap.'",
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
        "Showing vanity metrics. Page views, app downloads, social media followers - these don't prove product-market fit. Someone downloading your app and never opening it again is not traction.",
        "Hiding bad numbers behind good ones. If you have 5,000 signups but only 50 active users, the 5,000 number is misleading. Investors will ask, and it's worse to be caught than to be honest.",
        "No graph. Traction slides should always have a visual. A line going up and to the right - even if the numbers are small - communicates momentum faster than any paragraph.",
      ],
      example: "A simple line chart. X-axis: weeks. Y-axis: active users. Below it: 'Launched 8 weeks ago. 520 active users, 91% weekly retention. $2,100 MRR, growing 28% MoM. Zero paid acquisition - all organic and word of mouth.'",
    },
    {
      id: "gtm",
      title: "Go-to-Market Strategy",
      purpose: "Show how you'll actually acquire customers - not theoretically, but concretely",
      tips: [
        "Describe your first channel in detail, not five channels in generalities. 'We'll grow through content marketing, partnerships, social media, paid ads, and referrals' is a list, not a strategy. 'We're embedding in Upwork's freelancer community - posting weekly case studies, doing free invoice audits, and converting forum readers to waitlist signups at 8% rate' is a strategy. Depth on one channel beats breadth on five.",
        "Show that you've already tested it. If you've run a small experiment - cold outreach that converted at 12%, a Reddit post that drove 200 signups, a partnership conversation with a platform - include the data. Investors want evidence that your go-to-market isn't theoretical. Even a small proof point changes the conversation from 'will this work?' to 'how do we scale this?'",
        "Explain your CAC and how it scales. If it costs you $15 to acquire a customer through manual outreach today, what does that look like at 10,000 customers? At some point you need a channel that doesn't require you personally DMing people. Show that you've thought about the transition from founder-led sales to scalable acquisition.",
      ],
      mistakes: [
        "Saying 'we'll go viral.' Virality is an outcome, not a strategy. No investor has ever funded a company because the founder said it would go viral. Show the mechanics: what makes someone share it, what's the referral loop, what's the K-factor?",
        "Confusing marketing channels with go-to-market strategy. 'We'll use Instagram and TikTok' is a channel choice. A go-to-market strategy answers: who is the first customer, how do you reach them, what makes them convert, and how do you do it again 1,000 times?",
        "No mention of sales cycle or conversion funnel. How long does it take from first touch to paying customer? What are the steps? If you don't know yet, say so - but show that you're thinking about it.",
      ],
      example: "Phase 1 (now): Founder-led outreach in freelancer communities. Posting weekly in r/freelance (42K members), Freelancers Union Slack (8K members), and 3 niche Facebook groups. Current conversion: 200 visitors/week, 8% to waitlist, 14% waitlist-to-active. CAC: $0 (time only). Phase 2 (post-raise): Content SEO targeting 'freelance invoice template' keywords (12K monthly searches, low competition). Phase 3: Referral program - give a friend 3 free months, get 1 free month. Target: 5,000 users in 6 months.",
    },
    {
      id: "business",
      title: "Business Model",
      purpose: "Show how you make money - simply and credibly",
      tips: [
        "Answer three questions and nothing else: Who pays you? How much? How often? 'Freelancers pay $10/month for unlimited invoicing' is a complete business model slide. You can add details if they help, but the core must be instantly understandable.",
        "If you have unit economics, show them. Customer Acquisition Cost (CAC), Lifetime Value (LTV), and the ratio between them. An LTV:CAC ratio above 3:1 is the benchmark. If you don't have real data yet, say so - and show your assumptions.",
        "Compare to proven models. 'Same model as Mailchimp - free tier for small users, paid tiers that scale with usage' gives an investor an instant mental anchor.",
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
        "One impressive line per person beats a full resume. 'Jane - 8 years in payments at Stripe, built their invoicing API' tells an investor everything they need. They don't need to know where she went to college or that she interned at Google in 2014.",
        "Show founder-market fit. Why do YOU care about this problem? Did you experience it yourself? Did you work in the industry? The best teams have a personal connection to the problem they're solving.",
        "If you're solo, show your support system. Advisors, early employees, technical collaborators. Being solo isn't a dealbreaker, but having no one around you is.",
      ],
      mistakes: [
        "Listing everyone who's ever helped. The team slide is for co-founders and maybe key hires. Your college roommate who designed the logo is not a team member.",
        "Headshots that look like LinkedIn stock photos. Use real, recent photos that show personality. You're asking someone to bet on humans, not resumes.",
        "No explanation of role clarity. If you have two co-founders, it should be obvious who does what. 'CEO / Business' and 'CTO / Product' is sufficient.",
      ],
      example: "Two headshots side by side. Jane Kim, CEO - 8 years in payments at Stripe, built invoicing API serving 400K businesses. Led product at invoice startup (acq. 2022). Marc Chen, CTO - Full-stack engineer, prev. Square. Built payment processing systems handling $2B annually. Below: 'Advised by [Name], former CFO of Intuit.'",
    },
    {
      id: "ask",
      title: "The Ask",
      purpose: "Tell them exactly what you want and what it buys",
      tips: [
        "Be specific about the amount and what it achieves. 'Raising $500K pre-seed to hire 2 engineers and reach 5,000 users by December' is actionable. An investor can evaluate whether $500K is reasonable for those milestones and whether those milestones are ambitious enough.",
        "Show 2-3 milestones the money unlocks. Not a 12-month roadmap - just the major inflection points. 'Hire engineering team -> launch v2 with payment integration -> hit $10K MRR.' Each milestone should build toward the next fundraise or profitability.",
        "End with a clear next step. 'I'd love to schedule a 30-minute deep dive. [email]. [calendly link].' Make it frictionless for them to say yes.",
      ],
      mistakes: [
        "Being vague. 'We're raising capital to accelerate growth' is the single most common bad ask slide. It tells the investor nothing about your plan.",
        "Not showing what comes after the money. Investors want to know what the next milestone is and when you'll need to raise again (or won't).",
        "Asking for too wide a range. '$500K to $2M' says you don't know what you need. Pick a number.",
      ],
      example: "Raising $500K on a $5M post-money SAFE. Use of funds: 60% engineering (2 senior hires), 25% growth experiments, 15% ops. Milestones: 5,000 active users, $10K MRR, launch payment processing by Q4. Next step: 30-min call - jane@acme.com",
    },
  ];

  const [idea, setIdea] = useState("");
  const [copied, setCopied] = useState(false);

  const buildGammaPrompt = () => {
    const what = idea.trim() || "[describe your startup here]";
    return "Create a seed-stage investor pitch deck for the following startup: " + what + "\n\n"
      + "Use exactly this slide structure, in this order:\n"
      + "1. Cover - company name and a single concrete one-liner. No mission statements.\n"
      + "2. The Problem - one specific painful problem, quantified, told through the customer's eyes.\n"
      + "3. Our Solution - lead with the outcome, connect it directly to the problem, suggest a product visual.\n"
      + "4. Why Now - the external shifts (technology, behavior, regulation) that make this the right moment.\n"
      + "5. Market Size - bottom-up math (number of target customers x realistic price), with a clear starting wedge.\n"
      + "6. Competition - a 2x2 positioning matrix with axes where we win, including 'do nothing' as a competitor.\n"
      + "7. Traction - strongest available proof people want this, framed with growth rates where possible.\n"
      + "8. Go-to-Market - one concrete first channel described in depth, not five channels in generalities.\n"
      + "9. Business Model - who pays, how much, how often. Keep it understandable in 10 seconds.\n"
      + "10. Team - one impressive line per person and why we are the ones to build this.\n"
      + "11. The Ask - a specific amount, what it unlocks, and 2-3 milestones it buys.\n\n"
      + "Design: dark background, clean modern typography, lots of white space, minimal text per slide (investors skim). Confident, direct tone. No jargon, no buzzwords.";
  };

  const handleGamma = async () => {
    try { await navigator.clipboard.writeText(buildGammaPrompt()); } catch (e) { console.error("Clipboard failed:", e); }
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
    window.open("https://gamma.app/create", "_blank");
  };

  return (
    <div style={{ animation: "fadeUp 0.3s ease", maxWidth: 640 }}>
      {/* Intro */}
      <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.8, marginBottom: 24 }}>
        A pitch deck is a sequence of slides that tell a story: there's a painful problem, you have a solution, the timing is right, the market is big enough, you know who you're up against, people already want it, you have a plan to reach them, you know how to make money, and your team is the one to build it. Each slide below breaks down what belongs on it, what doesn't, and what good looks like.
      </p>

      {/* Gamma deck generator */}
      <div style={{
        padding: "22px 24px", borderRadius: 14, marginBottom: 36,
        background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(109,40,217,0.04))",
        border: "1px solid rgba(139,92,246,0.25)",
      }}>
        <p style={{ fontFamily: "DM Serif Display, serif", fontSize: 18, fontWeight: 400, marginBottom: 4 }}>
          Generate your deck with Gamma
        </p>
        <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 14, lineHeight: 1.6 }}>
          Describe what you're building. We'll turn it into a full deck prompt using the 11-slide structure below, copy it to your clipboard, and open Gamma - just paste it in.
        </p>
        <textarea
          value={idea}
          onChange={e => setIdea(e.target.value)}
          placeholder="e.g. An app that matches college students with same-day odd jobs from local homeowners - students earn cash between classes, homeowners get help fast."
          rows={3}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10, resize: "vertical",
            background: T.bgInput, border: `1px solid ${T.border}`, color: T.text,
            fontSize: 13, fontFamily: "Inter, sans-serif", lineHeight: 1.6, outline: "none",
            boxSizing: "border-box", marginBottom: 12,
          }}
          onFocus={e => e.currentTarget.style.borderColor = "#8B5CF6"}
          onBlur={e => e.currentTarget.style.borderColor = T.border}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            onClick={handleGamma}
            style={{
              padding: "11px 22px", borderRadius: 10,
              fontSize: 13, fontWeight: 700, fontFamily: "Inter, DM Sans, sans-serif",
              background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
              color: "#fff", border: "none", cursor: "pointer",
              boxShadow: "0 4px 20px rgba(139,92,246,0.25)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(139,92,246,0.35)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(139,92,246,0.25)"; }}
          >
            Copy Prompt & Open Gamma {"->"}
          </button>
          {copied && (
            <span style={{ fontSize: 12, color: T.success, fontWeight: 600, animation: "fadeIn 0.2s ease" }}>
              Prompt copied - paste it into Gamma's AI generator
            </span>
          )}
        </div>
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
      title: "AI Assistants",
      icon: "",
      color: "#8B5CF6",
      tools: [
        { name: "Claude", desc: "Thinking partner that also builds - strategy, writing, code", url: "https://claude.ai", tag: "Free tier" },
        { name: "ChatGPT", desc: "General-purpose AI assistant with voice & vision", url: "https://chatgpt.com", tag: "Free tier" },
        { name: "Perplexity", desc: "AI search with cited sources - research anything fast", url: "https://perplexity.ai", tag: "Free tier" },
        { name: "NotebookLM", desc: "Turn your docs & research into an AI study partner", url: "https://notebooklm.google.com", tag: "Free" },
      ],
    },
    {
      title: "Build & Ship",
      icon: "",
      color: "#3B82F6",
      tools: [
        { name: "Claude Code", desc: "Agentic AI coding - describe it, watch it get built", url: "https://claude.com/claude-code", tag: "Paid" },
        { name: "Cursor", desc: "AI-first code editor - build 10x faster", url: "https://cursor.com", tag: "Free tier" },
        { name: "Lovable", desc: "Prompt to full-stack app, no code required", url: "https://lovable.dev", tag: "Free tier" },
        { name: "Bolt.new", desc: "Prompt to deployed app in the browser", url: "https://bolt.new", tag: "Free tier" },
        { name: "Vercel", desc: "Deploy websites & apps instantly", url: "https://vercel.com", tag: "Free tier" },
        { name: "Supabase", desc: "Backend, database, auth - all in one", url: "https://supabase.com", tag: "Free tier" },
        { name: "GitHub", desc: "Version control & collaboration", url: "https://github.com", tag: "Free" },
      ],
    },
    {
      title: "Design & Prototype",
      icon: "",
      color: "#EC4899",
      tools: [
        { name: "Figma", desc: "Design interfaces collaboratively", url: "https://figma.com", tag: "Free tier" },
        { name: "v0", desc: "Generate polished UI from a text prompt", url: "https://v0.dev", tag: "Free tier" },
        { name: "Canva", desc: "Graphics, decks & social assets in minutes", url: "https://canva.com", tag: "Free tier" },
        { name: "Mobbin", desc: "UI/UX design inspiration from real apps", url: "https://mobbin.com", tag: "Free tier" },
      ],
    },
    {
      title: "Automation & Agents",
      icon: "",
      color: "#F97316",
      tools: [
        { name: "n8n", desc: "Visual AI workflows - build agents that work for you", url: "https://n8n.io", tag: "Free tier" },
        { name: "Zapier", desc: "Connect your apps with triggers & actions", url: "https://zapier.com", tag: "Free tier" },
        { name: "Make", desc: "Drag-and-drop automation scenarios", url: "https://make.com", tag: "Free tier" },
      ],
    },
    {
      title: "Marketing & Growth",
      icon: "",
      color: "#F59E0B",
      tools: [
        { name: "beehiiv", desc: "Modern newsletter platform built for growth", url: "https://beehiiv.com", tag: "Free tier" },
        { name: "Typefully", desc: "Write & schedule posts for X and LinkedIn", url: "https://typefully.com", tag: "Free tier" },
        { name: "Buffer", desc: "Schedule social media across platforms", url: "https://buffer.com", tag: "Free tier" },
        { name: "CapCut", desc: "Fast short-form video editing for Reels & TikTok", url: "https://capcut.com", tag: "Free tier" },
        { name: "Google Trends", desc: "Validate demand & spot trends", url: "https://trends.google.com", tag: "Free" },
      ],
    },
    {
      title: "Analytics & Feedback",
      icon: "",
      color: "#10B981",
      tools: [
        { name: "PostHog", desc: "Product analytics, session replay & feature flags", url: "https://posthog.com", tag: "Free tier" },
        { name: "Microsoft Clarity", desc: "Free heatmaps & session recordings", url: "https://clarity.microsoft.com", tag: "Free" },
        { name: "Tally", desc: "Beautiful forms & surveys", url: "https://tally.so", tag: "Free" },
      ],
    },
    {
      title: "Money & Ops",
      icon: "",
      color: "#06B6D4",
      tools: [
        { name: "Stripe", desc: "Accept payments - the standard for startups", url: "https://stripe.com", tag: "Pay per use" },
        { name: "Notion", desc: "Docs, wikis & lightweight CRM in one workspace", url: "https://notion.com", tag: "Free tier" },
        { name: "Loom", desc: "Async video - demo your product, pitch without a meeting", url: "https://loom.com", tag: "Free tier" },
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
        <span style={{ fontSize: 28 }}>{""}</span>
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
        <span style={{ fontSize:24 }}>{isMember ? "" : ""}</span>
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
    { id:"posts", label:"Posts", icon:"" },
    { id:"codes", label:"Access Codes", icon:"" },
    { id:"profiles", label:"Manage Profiles", icon:"" },
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
                }}>{t==="highlight"?"":t==="opportunity"?"":""} {t}</button>
              ))}
            </div>
            <Input label="Title" value={postTitle} onChange={setPostTitle} placeholder="Announcement title..." />
            <Input label="Content" value={postContent} onChange={setPostContent} placeholder="What's the announcement about?" textarea />
            <Input label="Link" value={postLink} onChange={setPostLink} placeholder="https://... (optional)" optional />
            <button onClick={savePost} disabled={!postTitle.trim()||saving} style={{
              padding:"10px 28px", borderRadius:10, fontSize:14, fontWeight:700, fontFamily:"Inter",
              background:postTitle.trim()?T.red:T.border, color:postTitle.trim()?T.white:T.textDim,
              border:"none", cursor:postTitle.trim()?"pointer":"default",
            }}>{saving?"Publishing...":"Publish ->"}</button>
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
                  <p style={{ fontSize:24, marginBottom:8 }}></p>
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


// --- App Shell ---
function AppShell({ role, profile, onLogout, onProfileUpdate }) {
  const [page, setPage] = useState("dashboard");
  const [editing, setEditing] = useState(false);
  const pages = {
    dashboard: <DashboardPage role={role} onNav={setPage} />,
    members: <MembersPage />,
    resources: <ResourcesPage />,
    admin: <AdminPage />,
    myprofile: editing
      ? <EditProfilePage profile={profile} onSave={(d) => { onProfileUpdate(d); setEditing(false); }} onCancel={() => setEditing(false)} />
      : <MyProfilePage profile={profile} onEdit={() => setEditing(true)} />,
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
      <Sidebar active={page} onNav={(p) => { setPage(p); setEditing(false); }} role={role} onLogout={onLogout} profileName={profile?.name} hasProfile={!!profile} />
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

  // On mount: returning admins go straight to the app, everyone else sees the landing
  useEffect(() => {
    if (getStoredRole() === "admin") {
      setRole("admin");
      setView("app");
    } else {
      setView("landing");
    }
  }, []);

  // Get Started clicked (or admin code entered) -> straight into the app as a guest
  const handleAccessSuccess = (r) => {
    setRole(r);
    setStoredRole(r);
    setView("app");
  };

  const handleProfileUpdate = async (updatedProfile) => {
    setProfile(updatedProfile);
  };

  const handleLogout = async () => {
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
      {view === "app" && <AppShell role={role} profile={profile} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />}
    </div>
  );
}
