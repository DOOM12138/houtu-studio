import {timingSafeEqual} from 'node:crypto';
// Android loopback is reachable by other apps: every resource needs this per-process secret.
export function localAccessAllowed(headers,token){if(!token)return true;const bearer=String(headers.authorization||'').startsWith('Bearer ')?String(headers.authorization).slice(7):'',cookie=String(headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('houtu_local='))?.slice(12)||'';return [bearer,cookie].some(value=>{const a=Buffer.from(value),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);});}
