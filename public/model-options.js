// Shared validation for request IDs and safe template persistence.
export function normalizeModel(value) {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(value))throw Error('模型标识无效，请从模型列表重新选择。');
  return value;
}
export const modelKey = value => {const model=normalizeModel(value);return model?{model}:{};};
