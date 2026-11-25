// Conservative defaults for detail edits. Geometry, transfer and scene changes stay explicit.
export const TARGET_POLICY_VERSION='part-protection-v1';
export function matchRepairBoundary(tool){return !['iris-color','hair-glow','dimension-effects'].includes(tool.id)&&!tool.referenceRole&&!tool.changes?.some(c=>['lighting','palette','medium','background'].includes(c));}
export function targetBlendOptions(tool){return {matchBoundary:matchRepairBoundary(tool),...(tool.id==='iris-color'?{featherPx:2}:{})};}
export const TARGET_POLICIES={
 'full-body':'person','portrait-polish':'person','anime-paint':'person','cos-paint':'person',
 'smooth-belly':'waist','body-shape':'waist','garment-fit':'waist','outfit-transfer':'clothes-transfer','makeup-transfer':'makeup','hair-flow':'hair-motion','hair-lift':'hair-motion',face:'face',eyes:'eyes',makeup:'makeup',skin:'skin',hands:'hands',hair:'hair',outfit:'clothes',materials:'materials',accessories:'accessories',
 'base-repair':'person','texture-restore':'materials','skin-oil':'skin',blemish:'skin','dark-circles':'under-eyes','eye-bags':'under-eyes','face-lines':'skin',teeth:'teeth','nose-refine':'nose','lip-refine':'lips','face-shape':'face','neck-repair':'skin','wig-gap':'hair','iris-color':'iris','hair-draw':'hair','weapon-material':'accessories','hair-glow':'hair',
};
